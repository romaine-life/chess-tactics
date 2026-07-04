// Per-level "opening book" generator (pure, deterministic — no Math.random/Date).
//
// The training gym tunes AI eval weights over a "book" of games. The book USED to
// be a list of seeds, but createFromLevel(level, seed) ignores the seed for authored
// levels (it reads the authored unit positions directly) — so every book entry was
// the SAME board and training drew flat at 0.5 with no signal.
//
// Fix (Stockfish's "UHO" idea — Unbalanced Human Openings): a book position is
// reached by walking a few RANDOM legal opening plies from the level's fixed start,
// seeded. Different seeds walk different plies, giving genuinely different, slightly
// imbalanced positions to train on. The walk is biased toward good moves (ranked by
// the shipped shallow eval) but samples from a top-K pool whose size grows with a
// `variety` knob, so seeds diverge even at low variety.

import type { Level } from '../core/level';
import type { GameState, Move, Piece, Side, Vec } from '../core/types';
import { createFromLevel } from './setup';
import { createRng } from '../core/rng';
import { applyMove, legalMoves, livingPieces, type MoveEnv } from '../core/rules';
import { buildTerrainIndex } from '../core/terrain';
import {
  DEFAULT_EVAL_WEIGHTS,
  evaluateGameState,
  type SearchContext,
  type SearchOptions,
} from '../core/ai';
import { evaluateObjective, kingSideOf, objectiveContextForLevel } from '../core/objectives';
import type { RecordedMove } from './selfplay';

/** Knobs for one book (persisted per-book alongside its positions + session). */
export interface OpeningBookSettings {
  /** How many positions (seeds) the book holds. */
  size: number;
  /** First seed; position i uses seedBase + i. */
  seedBase: number;
  /** How many opening plies to walk from the level's fixed start. */
  plies: number;
  /** 0 = always take the single best-ranked move (still varies by seed via the
   * floor-2 pool when >=2 legal moves exist); 1 = sample uniformly from all legal
   * moves. In [0, 1]. */
  variety: number;
}

/** One book position: the opening plies that reach it from createFromLevel(level, seed). */
export interface BookPosition {
  seed: number;
  moves: RecordedMove[];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Candidate (piece, move) with the resulting-state score, oriented so higher is
 * better for the side that is about to move. */
interface RankedCandidate {
  pieceId: string;
  from: Vec;
  move: Move;
  side: Side;
  /** Eval of the state AFTER the move, from the mover's perspective (higher=better). */
  score: number;
}

function terrainEnv(game: GameState): MoveEnv {
  const terrain = game.terrain ? buildTerrainIndex(game.terrain) : undefined;
  return { terrain, lastMove: game.lastMove };
}

/** All legal (piece, move) pairs for the living pieces of `side`, ranked by the
 * shallow shipped eval of the RESULTING state, oriented so higher = better for
 * `side`. evaluateGameState is player-positive, so enemy candidates are negated. */
function rankedCandidates(
  game: GameState,
  side: Side,
  env: MoveEnv,
  sctx: SearchContext,
): RankedCandidate[] {
  const out: RankedCandidate[] = [];
  for (const piece of livingPieces(game.pieces, side)) {
    const from: Vec = { x: piece.x, y: piece.y };
    for (const move of legalMoves(piece, game.pieces, game.size, env)) {
      const next = applyMove(game, piece.id, move).state;
      const playerScore = evaluateGameState(next, sctx, DEFAULT_EVAL_WEIGHTS, env);
      out.push({
        pieceId: piece.id,
        from,
        move,
        side,
        score: side === 'player' ? playerScore : -playerScore,
      });
    }
  }
  // Descending by score (best first). Stable secondary keys keep the ranking fully
  // deterministic when scores tie (never Math.random / insertion-order dependence).
  out.sort((a, b) =>
    b.score - a.score ||
    a.pieceId.localeCompare(b.pieceId) ||
    (a.move.y - b.move.y) ||
    (a.move.x - b.move.x));
  return out;
}

/** poolSize = round(1 + variety*(n-1)), floored to 2 when n>=2 so seeds diverge
 * even at variety 0, capped at n. */
function poolSizeFor(n: number, variety: number): number {
  if (n <= 1) return n;
  let size = Math.round(1 + clamp01(variety) * (n - 1));
  if (size < 2) size = 2;
  if (size > n) size = n;
  return size;
}

/** Generate the book for `level` under `settings`. Deterministic: same
 * (level, settings) => identical book. Different seeds => different move sequences
 * (=> different boards) whenever the pool has >1 legal option. */
export function generateOpeningBook(
  level: Level,
  settings: OpeningBookSettings,
  match: { search: SearchOptions },
): BookPosition[] {
  void match; // the walk uses the shipped shallow eval directly; kept for API parity
  const size = Math.max(0, Math.floor(settings.size));
  const plies = Math.max(0, Math.floor(settings.plies));
  const variety = clamp01(settings.variety);

  const positions: BookPosition[] = [];
  for (let i = 0; i < size; i += 1) {
    const seed = settings.seedBase + i;
    let game = createFromLevel(level, seed);

    // Objective context is static for the level; kingSide is read from the start
    // position (it doesn't change over an opening walk that never captures a king,
    // and if it did the eval simply reflects the new board — this only ranks plies).
    const sctx: SearchContext = {
      objective: level.objective,
      ctx: { ...objectiveContextForLevel(level), kingSide: kingSideOf(game.pieces) },
      turnsElapsed: 0,
    };

    const moves: RecordedMove[] = [];
    for (let ply = 0; ply < plies; ply += 1) {
      if (game.turn !== 'player' && game.turn !== 'enemy') break; // terminal
      if (evaluateObjective(game, level.objective, { ...sctx.ctx, turnsElapsed: 0 })) break;
      const side: Side = game.turn;
      const env = terrainEnv(game);
      const ranked = rankedCandidates(game, side, env, sctx);
      if (ranked.length === 0) break; // stuck: stop the walk early

      const pool = poolSizeFor(ranked.length, variety);
      const rng = createRng(seed * 1000 + ply);
      const chosen = ranked[rng.int(pool)];

      game = applyMove(game, chosen.pieceId, chosen.move).state;
      moves.push({ pieceId: chosen.pieceId, side, from: chosen.from, move: chosen.move });
    }

    positions.push({ seed, moves });
  }
  return positions;
}

/** Replay a book position onto a live GameState — for the UI board and balance.
 * createFromLevel(level, pos.seed) then applyMove each recorded move in order. */
export function stateAtPosition(level: Level, pos: BookPosition): GameState {
  let game = createFromLevel(level, pos.seed);
  for (const m of pos.moves) {
    game = applyMove(game, m.pieceId, m.move).state;
  }
  return game;
}

const isCombatant = (p: Piece): boolean => p.alive && (p.side === 'player' || p.side === 'enemy');

/** Material balance (player - enemy) at the position, using the DEFAULT_EVAL_WEIGHTS
 * piece values. Positive = player is materially ahead. */
export function positionBalance(level: Level, pos: BookPosition): number {
  const game = stateAtPosition(level, pos);
  const values = DEFAULT_EVAL_WEIGHTS.pieceValues;
  let balance = 0;
  for (const p of game.pieces) {
    if (!isCombatant(p)) continue;
    const v = values[p.type] ?? 0;
    balance += p.side === 'player' ? v : -v;
  }
  return balance;
}
