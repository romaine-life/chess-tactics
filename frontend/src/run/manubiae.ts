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
  attacksSquare,
  enemiesAttackedBy,
  gameEnv,
  kingCheckers,
  legalMoves,
  livingPieces,
  royalForkVictim,
  sideCanCaptureUnit,
  sideHasLegalMove,
  smotheredMateBy,
  unitIsDefended,
  type MoveEnv,
} from '../core/rules';
import type { GameEvent, GameState, Piece, PieceType, Vec } from '../core/types';
import {
  manubiaeUnitWorth,
  manubiumGoldTenths,
  PIECE_VALUE,
  RUN_LONG_REACH_SQUARES,
  RUN_ROYAL_FORK_MIN_VICTIM_VALUE,
  type ManubiumAward,
  type RunArmyPieceType,
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

const RUN_ARMY_PIECES: readonly PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** Whether a board unit is one the Run can price at all — an obstacle is not. */
function isRunArmyPieceType(type: PieceType): type is RunArmyPieceType {
  return RUN_ARMY_PIECES.includes(type);
}

/**
 * What a unit is worth AS IT STANDS, by the type it is now.
 *
 * Deliberately not `manubiaeUnitWorth`, which reads `promotedFrom` to answer what a unit cost the
 * Run. Both questions are legitimate and they are not the same question; see the humble-mate
 * comment below for why this one has to be the board's answer rather than the roster's.
 */
function boardPieceValue(piece: Piece): number {
  return isRunArmyPieceType(piece.type) ? PIECE_VALUE[piece.type] : Number.POSITIVE_INFINITY;
}

/**
 * How many squares a deed reaches across, counted the way a player counts them: along the line,
 * not as a sum of both axes. A Rook eight along a rank and a Bishop eight along a diagonal are
 * both eight, which is what makes one threshold mean the same thing to every unit.
 */
function reachSquares(from: Vec, to: Vec): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
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
 * that ends it — of which there is at most ONE, however many entries describe it.
 */
export function manubiaeEarnedBy(game: GameState, events: readonly GameEvent[]): EarnedManubium[] {
  const earned: EarnedManubium[] = [];
  const pieceOf = (id: string) => game.pieces.find((piece) => piece.id === id);
  const moved = events.flatMap((event) => (event.kind === 'moved' ? [event] : []));
  // Where each unit set out from this move, which is the only thing a committed board cannot say
  // for itself — the piece is standing at its destination by the time anything here reads it.
  const setOutFrom = new Map(moved.map((event) => [event.pieceId, event.from]));

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
    // How far the unit came to make the capture, measured on the move the player actually made.
    // (For an en passant the victim's square and the landing square differ, and it does not
    // matter: the two-square Pawn step it answers is never eight of anything.)
    const from = setOutFrom.get(event.by);
    if (from && reachSquares(from, at) >= RUN_LONG_REACH_SQUARES) {
      earned.push({ award: { id: 'long-capture' }, at });
    }
  }

  const env = gameEnv(game);
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
    // The ROYAL fork asks only about the FORKER, never the victim. Whether that victim is
    // defended stays unasked (ADR-0527): a Rook won for a Knight is worth the exchange even
    // when they take back, so what it is worth to answer is the position's business.
    //
    // Two entries read one fork: the royal one asks about the QUALITY of the prongs and the
    // Knight's asks how many there are that the enemy CANNOT ANSWER — the King, which must
    // move, and the undefended pieces the check buys a free move to collect (ADR-0566). A
    // Knight striking the King and an undefended Rook is both, and one unit's fork is one deed,
    // so the dearer of the two pays and the other stands down -- exactly the ladder the two
    // checks and the mates already run on. Which also means `forkHolds` is asked ONCE, of the
    // fork rather than of an entry, and only when there is a fork to ask about.
    const forks: ManubiumAward[] = [];
    if (royalForkVictim(mover, game.pieces, game.size, env, RUN_ROYAL_FORK_MIN_VICTIM_VALUE)) {
      forks.push({ id: 'royal-fork' });
    }
    if (mover.type === 'knight') {
      // The King, plus the units the player can simply TAKE (ADR-0566).
      //
      // A prong only means something if the enemy cannot answer it, and there are exactly two
      // ways they cannot. The King must move, so striking it is a prong by force of law. A
      // defended piece is no prong at all — they leave it where it is and the Knight that takes
      // it is taken back — so the pieces that count are the undefended ones, which the check
      // buys a free move to collect. A Knight parked among a chain of mutually defended Pawns
      // wins nothing, and the count on its own said otherwise.
      //
      // The King is one of the prongs it is counted as, so the price ladder is unchanged: two
      // prongs is the King and one free piece.
      const struck = enemiesAttackedBy(mover, game.pieces, game.size, env);
      const checksKing = struck.some((target) => target.type === 'king');
      const free = struck.filter((target) => (
        target.type !== 'king' && !unitIsDefended(target, game.pieces, game.size, env)
      )).length;
      if (checksKing && free >= 1) forks.push({ id: 'knight-fork', targets: free + 1 });
    }
    if (forks.length && forkHolds(mover, game, env)) {
      const best = forks.reduce((dearest, fork) => (
        manubiumGoldTenths(fork) > manubiumGoldTenths(dearest) ? fork : dearest
      ));
      if (manubiumGoldTenths(best) > 0) earned.push({ award: best, at });
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

  // A check struck from across the board. Measured along the line the check actually runs — from
  // the unit giving it to the King it is given to — rather than on the move, so the piece need not
  // be the one that moved: a line you opened reaches from wherever the unit behind it stands, and
  // that reach is the deed. Paid once for the check however many checkers qualify, seated on the
  // one that reaches furthest, because there is one check to be paid for.
  //
  // Each checker is paired with the King it is actually attacking rather than the nearest one, so
  // a board fielding more than one enemy King cannot be credited with a line it does not have.
  const enemyKings = game.pieces.filter((piece) => piece.alive && piece.side === 'enemy' && piece.type === 'king');
  let longestCheck: { reach: number; at: Vec } | null = null;
  for (const checker of checkers) {
    if (checker.side !== 'player') continue;
    for (const king of enemyKings) {
      if (!attacksSquare(checker, game.pieces, game.size, env, king.x, king.y)) continue;
      const reach = reachSquares(checker, king);
      if (!longestCheck || reach > longestCheck.reach) {
        longestCheck = { reach, at: { x: checker.x, y: checker.y } };
      }
    }
  }
  if (longestCheck && longestCheck.reach >= RUN_LONG_REACH_SQUARES) {
    earned.push({ award: { id: 'long-check' }, at: longestCheck.at });
  }

  // THE MATE PAYS ONCE. Read last, because it is the last thing that happens.
  //
  // Every Battle ends in checkmate (ADR-0543), so unlike everything above, the end of a Battle
  // always has SOMETHING here to say about it — and four entries describe it: what the mating
  // unit is worth, what the King's own men were doing around it, and whether the unit arrived by
  // promotion. Left to stack, one move would collect all four for one mate. They are rungs of
  // one ladder in exactly the sense ADR-0540 gave the two checks: a smothered mate IS a mate by
  // a Knight, and an underpromotion mate IS a mate by the lesser piece the Pawn chose. So the
  // candidates are gathered and the DEAREST is paid, the rest standing down.
  //
  // Mate needs no search. `checkers` is already the committed board's answer to "is the enemy
  // King attacked", and `sideHasLegalMove` is the same "no legal action" expression the canonical
  // adjudicator uses (ADR-0059), so this cannot call a position mate that the Battle does not.
  const mated = checkers.length > 0 && !sideHasLegalMove(game.pieces, 'enemy', game.size, env);
  if (mated) {
    const candidates: EarnedManubium[] = [];

    for (const event of playerMoved) {
      const mover = pieceOf(event.pieceId);
      if (mover?.alive && smotheredMateBy(mover, game.pieces, game.size, env)) {
        candidates.push({ award: { id: 'smothered-mate' }, at: { x: mover.x, y: mover.y } });
      }
    }

    // A Pawn that walked the whole board and ended the Battle the moment it arrived.
    //
    // The new piece has to be GIVING the check. A Pawn that queens while some other unit delivers
    // the mate has not mated by promoting — that check is a discovered one and is paid above as
    // the different thing it is. Being among the checkers is the bar rather than being the only
    // one, so a promotion that mates as half of a double check still counts.
    for (const event of events) {
      if (event.kind !== 'promoted') continue;
      const promoted = pieceOf(event.pieceId);
      if (promoted?.side !== 'player' || !promoted.alive) continue;
      if (!checkers.some((checker) => checker.id === promoted.id)) continue;
      const under = underpromotionPiece(event.to);
      candidates.push({
        award: under ? { id: 'underpromotion-mate', piece: under } : { id: 'promotion-mate' },
        at: { x: promoted.x, y: promoted.y },
      });
    }

    // The floor: what is actually standing there giving mate. Paid on the LEAST valuable checker,
    // because when two units mate at once the deed is the smaller of them.
    //
    // This reads the piece's CURRENT type where the rest of this module reads `promotedFrom`, and
    // the divergence is the point. `manubiaeUnitWorth` answers "what did this cost the Run", which
    // is why a queened Pawn is still priced as a Pawn when it captures. The question here is the
    // opposite one — how little is standing on the board giving mate — and a Queen is a Queen
    // whatever walked up the board to become her. Pricing her as a Pawn would pay the top of this
    // ladder for the most ordinary mate there is.
    const humblest = checkers
      .filter((checker) => checker.side === 'player')
      .reduce<Piece | null>(
        (best, checker) => (
          !best || boardPieceValue(checker) < boardPieceValue(best) ? checker : best
        ),
        null,
      );
    if (humblest && isRunArmyPieceType(humblest.type)) {
      candidates.push({
        award: { id: 'humble-mate', piece: humblest.type },
        at: { x: humblest.x, y: humblest.y },
      });
    }

    const best = candidates.reduce<EarnedManubium | null>(
      (dearest, candidate) => (
        !dearest || manubiumGoldTenths(candidate.award) > manubiumGoldTenths(dearest.award)
          ? candidate
          : dearest
      ),
      null,
    );
    if (best && manubiumGoldTenths(best.award) > 0) earned.push(best);
  }

  return earned;
}
