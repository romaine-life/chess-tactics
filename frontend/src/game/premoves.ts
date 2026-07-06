// Premove chain: the moves a player queues while the opponent is thinking, fired one-per-turn
// when control returns. These pure helpers project the queue so the UI can draw each unit's
// planned path (chess.com-style arrows + ghost units) and let the player extend it.
//
// PREMOVES ARE INDEPENDENT SPECULATIVE PLANS. Each unit's plan is folded onto the REAL board with
// only THAT unit's own steps applied — other units' premoves never block it. So two units may plan
// the same square (their ghosts SHARE the tile, split between them); execution stays honest because
// the store's drain re-validates each move against reality at fire time, so only one actually
// arrives (or the chain drops). This module has no store/DOM deps so it also runs inline in tests.

import type { GameState, Move, Piece, Vec } from '../core/types';
import { applyMove, gameEnv, legalMoves, type MoveEnv } from '../core/rules';

/** One queued move: a player piece and where it will go. The "from" is implied by the piece's
 *  position along its own plan at that point. */
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

/** A square one or more premoved units plan to occupy. `pieces` is capped at 4 (the max the tile
 *  is split between); the UI lays them out symmetrically. */
export interface PremoveGhostGroup {
  key: string;
  pieces: Piece[];
}

/** Max units shown sharing one tile. */
const MAX_GHOSTS_PER_TILE = 4;

// Movement environment for a state: the canonical static env (terrain + edge fences, via gameEnv
// so premove legality honours the SAME gameplay layers as real moves) plus this ply's lastMove.
function envFor(game: GameState): MoveEnv {
  return { ...gameEnv(game), lastMove: game.lastMove };
}

const premovedIds = (premoves: readonly PremoveStep[]): string[] => [...new Set(premoves.map((s) => s.pieceId))];

// Fold ONLY one piece's queued steps onto the board, leaving every OTHER piece at its real
// position — so a unit's plan is never blocked by another unit's plan. Each step is re-validated
// against this per-piece board; an illegal step stops that piece's plan there.
function foldPiece(game: GameState, premoves: readonly PremoveStep[], pieceId: string): { state: GameState; steps: { from: Vec; landed: Piece }[] } {
  let state = game;
  const steps: { from: Vec; landed: Piece }[] = [];
  for (const step of premoves) {
    if (step.pieceId !== pieceId) continue;
    const p = state.pieces.find((q) => q.id === pieceId && q.alive && q.side === 'player');
    if (!p) break;
    const mv = legalMoves(p, state.pieces, state.size, envFor(state)).find((m) => m.x === step.x && m.y === step.y);
    if (!mv) break;
    const from: Vec = { x: p.x, y: p.y };
    state = applyMove(state, p.id, mv).state;
    const landed = state.pieces.find((q) => q.id === pieceId);
    if (landed && landed.alive) steps.push({ from, landed });
  }
  return { state, steps };
}

/** The board with each premoved piece moved to the TIP of its own plan (others at their real
 *  positions). Used by the UI for unshared speculative-piece hit-testing; shared ghost stacks
 *  stay ambiguous so the UI asks the player to use an original-piece handle instead. */
export function provisionalBoard(game: GameState, premoves: readonly PremoveStep[]): GameState {
  const tip = new Map<string, Vec>();
  for (const id of premovedIds(premoves)) {
    const p = foldPiece(game, premoves, id).state.pieces.find((q) => q.id === id);
    if (p) tip.set(id, { x: p.x, y: p.y });
  }
  const pieces = game.pieces.map((p) => {
    const t = tip.get(p.id);
    return t ? { ...p, x: t.x, y: t.y } : p;
  });
  return { ...game, pieces };
}

/** From→to cells for every queued step, per piece — the chain arrows. */
export function premoveArrows(game: GameState, premoves: readonly PremoveStep[]): PremoveArrow[] {
  const arrows: PremoveArrow[] = [];
  for (const id of premovedIds(premoves)) {
    for (const { from, landed } of foldPiece(game, premoves, id).steps) {
      arrows.push({ from, to: { x: landed.x, y: landed.y } });
    }
  }
  return arrows;
}

/** Ghost units grouped by the square they land on — the whole planned path of every premoved unit.
 *  When several units plan the same square they SHARE it (up to MAX_GHOSTS_PER_TILE), so the tile
 *  is split between them rather than one hiding the others. */
export function premoveGhosts(game: GameState, premoves: readonly PremoveStep[]): PremoveGhostGroup[] {
  const bySquare = new Map<string, Piece[]>();
  for (const id of premovedIds(premoves)) {
    for (const { landed } of foldPiece(game, premoves, id).steps) {
      const key = `${landed.x},${landed.y}`;
      const arr = bySquare.get(key) ?? [];
      if (arr.length < MAX_GHOSTS_PER_TILE && !arr.some((p) => p.id === landed.id)) arr.push(landed);
      bySquare.set(key, arr);
    }
  }
  return [...bySquare.entries()].map(([key, pieces]) => ({ key, pieces }));
}

/** Legal next-step destinations for `pieceId` — validated against ITS OWN plan only (other units'
 *  premoves don't block it), so two units can be queued onto the same square. Empty when the piece
 *  can't be premoved (gone, not the player's, or nothing selected). */
export function premoveTargets(game: GameState, premoves: readonly PremoveStep[], pieceId: string | null): Move[] {
  if (!pieceId) return [];
  const state = foldPiece(game, premoves, pieceId).state;
  const p = state.pieces.find((q) => q.id === pieceId && q.alive && q.side === 'player');
  return p ? legalMoves(p, state.pieces, state.size, envFor(state)) : [];
}
