// Premove chain: the moves a player queues while the opponent is thinking, fired
// one-per-turn when control returns. These pure helpers fold the queue onto the
// live board so the UI can build a chain on a PROVISIONAL board (the current board
// plus the moves already queued, but none of the opponent's unknown replies) and
// draw it as chess.com-style arrows. Execution — validation at fire time, and the
// "one illegal step drops the whole chain" rule — lives in the store (see queueMove
// and the drain in scheduleEnemyReply); this module is the pure projection those
// paths share so neither re-derives the fold.

import type { GameState, Move, Vec } from '../core/types';
import { applyMove, gameEnv, legalMoves, type MoveEnv } from '../core/rules';

/** One queued move: a player piece and where it will go. The "from" is implied by
 *  the piece's position on the provisional board at that point in the chain. */
export interface PremoveStep {
  pieceId: string;
  x: number;
  y: number;
}

/** A queued step resolved to board cells, for drawing the chain arrow. */
export interface PremoveArrow {
  from: Vec;
  to: Vec;
}

// Movement environment for a state: the canonical static env (terrain + edge fences,
// via gameEnv so premove legality honours the SAME gameplay layers as real moves) plus
// this ply's lastMove for en passant. Mirrors store.envFor.
function envFor(game: GameState): MoveEnv {
  return { ...gameEnv(game), lastMove: game.lastMove };
}

// Fold the queued steps onto `game`, applying each as a real move on the board built
// so far. Each step is re-validated against that provisional board; an invalid step
// (its piece gone, or the square no longer reachable) stops the fold there. The caller
// only ever appends steps that were legal when queued, so this is a safety net rather
// than the gate.
function foldPremoves(game: GameState, premoves: readonly PremoveStep[]): { state: GameState; arrows: PremoveArrow[] } {
  let state = game;
  const arrows: PremoveArrow[] = [];
  for (const step of premoves) {
    const p = state.pieces.find((q) => q.id === step.pieceId && q.alive && q.side === 'player');
    if (!p) break;
    const mv = legalMoves(p, state.pieces, state.size, envFor(state)).find((m) => m.x === step.x && m.y === step.y);
    if (!mv) break;
    arrows.push({ from: { x: p.x, y: p.y }, to: { x: step.x, y: step.y } });
    state = applyMove(state, p.id, mv).state;
  }
  return { state, arrows };
}

/** The board as it would stand after every queued premove applies (no enemy replies). */
export function provisionalBoard(game: GameState, premoves: readonly PremoveStep[]): GameState {
  return foldPremoves(game, premoves).state;
}

/** From→to cells for each queued step, for the chain overlay. */
export function premoveArrows(game: GameState, premoves: readonly PremoveStep[]): PremoveArrow[] {
  return foldPremoves(game, premoves).arrows;
}

/** Legal next-step destinations for `pieceId` on the provisional board — what the
 *  player can add to the chain from the current tip. Empty when the piece can't be
 *  premoved (gone, not the player's, or nothing selected). */
export function premoveTargets(game: GameState, premoves: readonly PremoveStep[], pieceId: string | null): Move[] {
  if (!pieceId) return [];
  const state = provisionalBoard(game, premoves);
  const p = state.pieces.find((q) => q.id === pieceId && q.alive && q.side === 'player');
  return p ? legalMoves(p, state.pieces, state.size, envFor(state)) : [];
}
