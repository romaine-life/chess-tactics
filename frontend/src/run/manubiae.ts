// What a committed board just earned (ADR-0540).
//
// Manubiae are the things a Run pays a player for DOING on the board. The catalog, the prices
// and the payment live in the Run model; this module answers the other half of the question --
// which of them a given committed board and its events actually earned, and on which square.
//
// It lives here, between `core/rules` and the Run's board seam, for two reasons. The geometry
// belongs to the rules and the money belongs to the model, so neither can host this without
// learning about the other. And it has to be ONE implementation: the Battle screen pays from
// it, the unit tests read it, and the live gate plans its move with it, so a gate cannot pass
// while the screen pays nothing.
//
// Nothing here consults or changes board law. It reads a board that has already committed.

import {
  applyMove,
  gameEnv,
  kingCheckers,
  legalMoves,
  livingPieces,
  royalForkVictim,
  sideCanCaptureUnit,
  sideHasLegalMove,
  smotheredMateBy,
  type MoveEnv,
} from '../core/rules';
import type { GameEvent, GameState, Piece, PieceType, Vec } from '../core/types';
import {
  manubiaeUnitWorth,
  RUN_ROYAL_FORK_MIN_VICTIM_VALUE,
  type ManubiumAward,
  type UnderpromotionPieceType,
} from './model';

/**
 * Whether a fork HOLDS — whether the enemy can break it by taking the forking unit without
 * paying more than that unit is worth.
 *
 * The forking unit is the piece giving check, so capturing it is how the enemy ANSWERS the
 * check: a fork they can profitably take never collects its second prong, and the player has
 * simply handed over a piece. But a fork whose only taker is a bigger piece is a fork that
 * WINS — they either lose the exchange or lose the second prong.
 *
 * So each legal capture of the forker is played out one ply to see what it actually costs
 * them: nothing at all when the square is undefended (they win the unit outright, whatever
 * took it), and the taker's own worth when the player can take back. Anything at or below the
 * forking unit's worth breaks the fork — an even trade included, because trading pieces is
 * not what the bounty is for.
 *
 * One ply, not a search. Whether the recapture is itself answerable is the position's
 * business, the same way ADR-0527 leaves the victim's defenders unasked.
 */
function forkHolds(mover: Piece, game: GameState, env: MoveEnv | undefined): boolean {
  const moverWorth = manubiaeUnitWorth(mover);
  if (moverWorth === null) return false; // a King cannot be priced, so no exchange can be judged
  for (const enemy of livingPieces(game.pieces, 'enemy')) {
    for (const move of legalMoves(enemy, game.pieces, game.size, env)) {
      if (move.capture !== mover.id && !(move.x === mover.x && move.y === mover.y)) continue;
      const after = applyMove(game, enemy.id, move, { stats: false });
      const taker = after.state.pieces.find((piece) => piece.id === enemy.id);
      // What the capture costs them: the taker, but only if it can be taken back.
      const answered = taker
        ? sideCanCaptureUnit(taker, 'player', after.state.pieces, after.state.size, gameEnv(after.state))
        : false;
      const cost = answered ? manubiaeUnitWorth(taker) ?? 0 : 0;
      if (cost <= moverWorth) return false;
    }
  }
  return true;
}

const UNDERPROMOTION_PIECES: readonly PieceType[] = ['rook', 'bishop', 'knight'];

/** The piece a Pawn took instead of a Queen, or `null` when it took the Queen after all. */
function underpromotionPiece(to: PieceType): UnderpromotionPieceType | null {
  return UNDERPROMOTION_PIECES.includes(to) ? (to as UnderpromotionPieceType) : null;
}

/** One Manubium the board earned, and the square it is seated on. */
export interface EarnedManubium {
  readonly award: ManubiumAward;
  /** Where the marker rises and the log points: the square the earning unit now stands on. */
  readonly at: Vec;
}

/**
 * Every Manubium the PLAYER earned by the move that produced `game`.
 *
 * The earner is read off the committed board rather than the Run roster, so a Reservist or a
 * promoted pawn earns like any other unit. The enemy's identical deeds earn nothing: this is a
 * reward for playing well, not a property of the position.
 *
 * `game` must be the board as the move committed it and `events` that move's own events —
 * before anything the Run itself adds. A Reservist landing first would stand in a ray and make
 * the Run pay for a line it drew itself.
 *
 * Returned in reading order: what the capture won, then what the move threatens, then the mate
 * that ends it.
 */
export function manubiaeEarnedBy(game: GameState, events: readonly GameEvent[]): EarnedManubium[] {
  const earned: EarnedManubium[] = [];
  const pieceOf = (id: string) => game.pieces.find((piece) => piece.id === id);

  for (const event of events) {
    if (event.kind !== 'captured') continue;
    const capturer = pieceOf(event.by);
    if (capturer?.side !== 'player') continue;
    // Seated on the square the capturing unit now stands on, not the victim's vacated one --
    // that is where the player is looking, and where the unit that earned it is. (For an en
    // passant those are different squares, which is the whole of that capture.)
    const at = { x: capturer.x, y: capturer.y };
    if (event.enPassant) earned.push({ award: { id: 'en-passant' }, at });
    // A unit is worth what it STARTED as, on both sides. That is already the Run's law off the
    // board -- the roster has no promotion concept and hands a queened pawn back as a Pawn --
    // so reading `promotedFrom` keeps one meaning of "worth" rather than letting the board
    // mint a Queen the player never bought.
    const victimWorth = manubiaeUnitWorth(pieceOf(event.pieceId));
    const capturerWorth = manubiaeUnitWorth(capturer);
    if (victimWorth !== null && capturerWorth !== null && victimWorth > capturerWorth) {
      earned.push({ award: { id: 'advantageous-capture', marginPoints: victimWorth - capturerWorth }, at });
    }
  }

  const env = gameEnv(game);
  const moved = events.flatMap((event) => (event.kind === 'moved' ? [event] : []));
  const playerMoved = moved.filter((event) => pieceOf(event.pieceId)?.side === 'player');
  for (const event of playerMoved) {
    const mover = pieceOf(event.pieceId);
    if (!mover?.alive) continue;
    const at = { x: mover.x, y: mover.y };
    // A royal fork is one piece's work: the unit that just moved has to strike the enemy King
    // and a Rook or better itself. A discovered check is two pieces doing that, and is paid
    // below as the different thing it is. Seated on the forking unit's own square -- that is
    // what the player just placed, and where the two lines they are paid for meet.
    //
    // AND the fork has to HOLD -- see `forkHolds`. A fork the enemy can profitably take is not
    // a fork at all, because taking it is how they answer the check; a fork whose only taker
    // costs them more than it is worth still wins. That is the one thing the geometry cannot
    // see, and paying for the first case teaches exactly the wrong move.
    //
    // This asks only about the FORKER, never the victim. Whether the victim is defended stays
    // unasked (ADR-0527) -- what a real fork is worth to answer is the position's business.
    if (
      royalForkVictim(mover, game.pieces, game.size, env, RUN_ROYAL_FORK_MIN_VICTIM_VALUE)
      && forkHolds(mover, game, env)
    ) {
      earned.push({ award: { id: 'royal-fork' }, at });
    }
    if (smotheredMateBy(mover, game.pieces, game.size, env)) {
      earned.push({ award: { id: 'smothered-mate' }, at });
    }
  }

  // What a check IS is a property of the position, not of a piece, so the check shapes are read
  // once off the committed board rather than once per moved piece.
  //
  // A discovery needs no before-and-after comparison: the enemy King could not already have
  // been in check on the player's turn, so any checker that is not one of the pieces that just
  // moved is a line this move opened. Castling moves two pieces and emits a `moved` event for
  // each, so the castled rook counts as having moved and its check is an ordinary one -- which
  // is what chess calls it.
  const checkers = kingCheckers('enemy', game.pieces, game.size, env);
  const mover = playerMoved.length ? pieceOf(playerMoved[0].pieceId) : null;
  if (mover?.alive) {
    const movedIds = new Set(moved.map((event) => event.pieceId));
    // These two are rungs of one ladder, not separate deeds: a double check is a discovered
    // check with the mover joining in. Paying both would be paying twice for one check, so the
    // better rung pays and the other stands down.
    const shape: ManubiumAward | null = checkers.length > 1
      ? { id: 'double-check' }
      : checkers.some((checker) => !movedIds.has(checker.id))
        ? { id: 'discovered-check' }
        : null;
    if (shape) earned.push({ award: shape, at: { x: mover.x, y: mover.y } });
  }

  // A Pawn that walked the whole board and ended the Battle the moment it arrived. Read last,
  // because it is the last thing that happens: the deed is the arrival itself.
  //
  // The new piece has to be GIVING the check. A Pawn that queens while some other unit delivers
  // the mate has not mated by promoting — that check is a discovered one and is paid above as
  // the different thing it is. Being among the checkers is the bar rather than being the only
  // one, so a promotion that mates as half of a double check still counts: it is still the
  // arriving piece that ends the Battle.
  //
  // Mate needs no search here. `checkers` is already the committed board's answer to "is the
  // enemy King attacked", and `sideHasLegalMove` is the same "no legal action" expression the
  // canonical adjudicator uses (ADR-0059), so this cannot call a position mate that the Battle
  // does not.
  const mated = checkers.length > 0 && !sideHasLegalMove(game.pieces, 'enemy', game.size, env);
  if (mated) {
    for (const event of events) {
      if (event.kind !== 'promoted') continue;
      const promoted = pieceOf(event.pieceId);
      if (promoted?.side !== 'player' || !promoted.alive) continue;
      if (!checkers.some((checker) => checker.id === promoted.id)) continue;
      // Rungs of one ladder again: an underpromotion mate IS a promotion mate, so the better
      // rung pays and the other stands down, exactly as the two checks do above.
      const under = underpromotionPiece(event.to);
      earned.push({
        award: under ? { id: 'underpromotion-mate', piece: under } : { id: 'promotion-mate' },
        at: { x: promoted.x, y: promoted.y },
      });
    }
  }

  return earned;
}
