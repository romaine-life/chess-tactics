// Move review — reading the game BACK, one half-move at a time, the way chess.com and
// lichess let you walk a score sheet while the game itself stays exactly where it is.
//
// The distinction this module exists to hold: reviewing is not undoing. Undo (see the
// store's undoStack / RunBattleUndoAdapter) REWINDS the match — it costs gold, it restores
// the clock, and the position it lands on becomes the live one. Review changes nothing at
// all. The turn, the clock, the queued premove chain and the enemy's think all continue
// underneath while the battlefield shows an older board; leaving review puts the live board
// back untouched, because it was never taken away.
//
// So something has to say "you are not looking at the live board any more". That is the
// review cursor (store: `reviewIndex`), an index into the recorded positions below. `null`
// is live, and live is the ONLY state the game itself reads — nothing here ever feeds the
// rules, the AI, persistence of the position, or a move.
//
// Pure: types + plain data, no store and no DOM, so the enemy-reply worker can build
// snapshots on its own thread and hand them across the boundary.

import type { GameState, LastMove, Piece, Turn, Winner } from '../core/types';

/**
 * The half of a position that a played move actually changes.
 *
 * Everything else in `GameState` — the board size, the terrain layer, the fences, the props,
 * the authored promotion/castle/draw rules, the board code — is resolved once when the match
 * is built and never moves again. Keeping only the mutable half means one recorded ply costs
 * a pieces array rather than a duplicate of the whole terrain grid, which is what makes a
 * position per half-move affordable to hold for a long game AND to write to storage.
 */
export interface PositionSnapshot {
  pieces: Piece[];
  turn: Turn;
  winner: Winner;
  lastMove?: LastMove;
  halfmoveClock?: number;
  positionCounts?: Record<string, number>;
}

/**
 * One position the board has actually stood in, with the score sheet's count of how it got
 * there: `ply` is the number of half-moves played when the board reached it, so 0 is the
 * opening position and 7 is the board after seven half-moves.
 *
 * The count is carried rather than inferred from the array index because a history does not
 * always begin at the opening: a match saved before review existed resumes with one recorded
 * position that is already deep into the game, and it has to be able to say so instead of
 * claiming to be the opening.
 */
export interface RecordedPosition {
  ply: number;
  snapshot: PositionSnapshot;
}

/** Take the mutable half of a live position. */
export function snapshotOf(game: GameState): PositionSnapshot {
  return {
    pieces: game.pieces,
    turn: game.turn,
    winner: game.winner,
    lastMove: game.lastMove,
    halfmoveClock: game.halfmoveClock,
    positionCounts: game.positionCounts,
  };
}

/** The opening entry of a fresh match's history. */
export function openingPosition(game: GameState): RecordedPosition {
  return { ply: 0, snapshot: snapshotOf(game) };
}

/**
 * Append the half-moves one commit played. `snapshots` is one entry per NOTATED half-move, in
 * the order played — a single player move contributes one, an enemy reply that resolved
 * several contributes several, and a commit that notated nothing (an admin position change is
 * not a move) contributes none and leaves the score sheet alone.
 */
export function recordPositions(
  history: readonly RecordedPosition[],
  snapshots: readonly PositionSnapshot[],
): RecordedPosition[] {
  if (!snapshots.length) return [...history];
  const from = history.length ? history[history.length - 1].ply : 0;
  return [
    ...history,
    ...snapshots.map((snapshot, i) => ({ ply: from + i + 1, snapshot })),
  ];
}

/**
 * Drop everything after `ply`, for a rewind that really did happen — the paid Undo restores an
 * older board, and the plies it took back never occurred as far as the score sheet is
 * concerned. Entries at or before `ply` are kept.
 */
export function truncatePositions(
  history: readonly RecordedPosition[],
  ply: number,
): RecordedPosition[] {
  return history.filter((entry) => entry.ply <= ply);
}

/**
 * Rebuild a full board for a recorded position by re-dressing it in the live match's static
 * half (terrain, fences, props, rules — none of which a move can change). Returns null for
 * `index === null`, which is the live board and is rendered from the game itself.
 */
export function reviewGameOf(
  live: GameState,
  history: readonly RecordedPosition[],
  index: number | null,
): GameState | null {
  if (index === null) return null;
  const entry = history[index];
  if (!entry) return null;
  const { pieces, turn, winner, lastMove, halfmoveClock, positionCounts } = entry.snapshot;
  return {
    ...live,
    pieces,
    turn,
    winner,
    lastMove,
    halfmoveClock,
    positionCounts,
    // A telegraphed enemy intent is a forecast for the turn about to be played. An older
    // board is not about to play anything, so it shows none.
    intents: undefined,
  };
}

/**
 * Settle a requested cursor. Out-of-range asks are clamped rather than refused, and asking
 * for the newest recorded position resolves to `null` — being at the end of the score sheet
 * IS being live, and a cursor that merely happened to point at the same board would keep the
 * battlefield read-only for no reason the player could see.
 */
export function clampReviewIndex(
  history: readonly RecordedPosition[],
  index: number | null,
): number | null {
  if (index === null || history.length === 0) return null;
  const last = history.length - 1;
  if (index >= last) return null;
  return Math.max(0, index);
}

/**
 * Step the cursor by whole half-moves. `null` (live) steps from the end of the history, so
 * one step back from the live board is the position before the last recorded half-move.
 */
export function steppedReviewIndex(
  history: readonly RecordedPosition[],
  index: number | null,
  delta: number,
): number | null {
  if (history.length === 0) return null;
  const from = index ?? history.length - 1;
  return clampReviewIndex(history, from + delta);
}

/**
 * The recorded position a score-sheet row leads to: a row notating half-move `ply` produced
 * the board recorded at ply `ply + 1`. Null when this match has no record of it — every row
 * of a match resumed from a save written before review existed, and nothing else.
 */
export function reviewIndexForLoggedPly(
  history: readonly RecordedPosition[],
  ply: number,
): number | null {
  const index = history.findIndex((entry) => entry.ply === ply + 1);
  return index === -1 ? null : index;
}

/** How many half-moves the history has recorded a board for, past its own starting point. */
export function reviewableCount(history: readonly RecordedPosition[]): number {
  return Math.max(0, history.length - 1);
}

/**
 * The score sheet's move number for a 0-based half-move index: `12.` for the half-move that
 * opens a full move and `12…` for the reply, which is how a score sheet says whose move it was
 * without a second column. Shared so the Event Log's rows and the review readout that names one
 * of those rows can never number the same move differently.
 */
export function moveNumberFor(ply: number): string {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;
}
