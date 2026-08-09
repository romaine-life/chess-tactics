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

import { gameEnv, kingCheckers, royalForkVictim, sideCanCaptureUnit, smotheredMateBy } from '../core/rules';
import type { GameEvent, GameState, Vec } from '../core/types';
import { manubiaeUnitWorth, RUN_ROYAL_FORK_MIN_VICTIM_VALUE, type ManubiumAward } from './model';

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
 * Returned in reading order: what the capture won, then what the move threatens.
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
    // AND the forking unit has to survive the square it forked from. A fork the enemy can
    // simply take is not a fork at all: taking it IS how they answer the check, so the second
    // prong is never collected and the player has handed over a piece. That is the one thing
    // the geometry cannot see, and paying for it teaches exactly the wrong move.
    //
    // This asks only about the FORKER, never the victim. Whether the victim is defended stays
    // unasked (ADR-0527) -- what a real fork is worth to answer is the position's business.
    if (
      royalForkVictim(mover, game.pieces, game.size, env, RUN_ROYAL_FORK_MIN_VICTIM_VALUE)
      && !sideCanCaptureUnit(mover, 'enemy', game.pieces, game.size, env)
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
  const mover = playerMoved.length ? pieceOf(playerMoved[0].pieceId) : null;
  if (mover?.alive) {
    const movedIds = new Set(moved.map((event) => event.pieceId));
    const checkers = kingCheckers('enemy', game.pieces, game.size, env);
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

  return earned;
}
