// Texel tuning — issue #25 / docs/per-board-ai-plan.md Phase 1: fit the AI's eval
// weight vector to a corpus of self-play positions labeled by game result, via
// logistic regression. THIS is the method that "uses the data": SPSA (game/tuning.ts)
// reduces every self-play game to a scalar match score and throws the positions away;
// Texel keeps every quiet position and fits the eval to predict its game's outcome.
//
// Texel's Tuning Method (Peter Österlund, Chess Programming Wiki): each quiet position
// gets a label z ∈ {1 win, ½ draw, 0 loss} from the PLAYER's perspective, and we fit θ
// to minimise the mean squared error
//     E(θ) = mean_i ( z_i − σ(K · eval_θ(pos_i)) )² ,  σ(x) = 1/(1+e^−x).
// `evaluateGameState` is player-positive, so σ(K·eval) reads as "P(player wins)". K is
// the scaling constant that calibrates the sigmoid to this board's eval scale; it is
// fit first (a 1-D search) so θ moves against a calibrated sigmoid.
//
// The eval is *almost* linear in θ, but the hanging terms multiply a piece value by a
// hanging fraction (bilinear), so we optimise θ as a black box with a central
// finite-difference gradient + Adam. Only 14 params, so this is cheap and robust — and
// a term that never appears in this board's eval (e.g. `reachGarrison` on a rival-kings
// board, or `knight` value when no knight is on the board) has an exactly-zero gradient
// and simply stays at its reference value. No masking needed.
//
// Pure + deterministic (no Date/Math.random): the corpus is seeded self-play and the
// fit is plain arithmetic, so a given (level, book, options) reproduces bit-for-bit.

import type { GameState, Winner } from '../core/types';
import type { Level } from '../core/level';
import type { MoveEnv } from '../core/rules';
import { gameEnv, legalMoves, livingPieces, sideInCheck } from '../core/rules';
import {
  DEFAULT_EVAL_WEIGHTS,
  evaluateGameState,
  type EvalWeights,
  type SearchContext,
  type SearchOptions,
} from '../core/ai';
import { objectiveContextForLevel, kingSideOf, victoryRulesForLevel } from '../core/objectives';
import { playLevelGame, replayStates, type GameRecord, type RecordedMove } from './selfplay';
import { encodeWeights, decodeWeights, deriveScales } from './tuning';
import type { BookPosition } from './openingBook';

/** A quiet training position: the state to evaluate, the objective framing it needs,
 * and the {1, ½, 0} label = its game's final result from the player's perspective. */
export interface LabeledPosition {
  state: GameState;
  sctx: SearchContext;
  env: MoveEnv;
  /** Player-positive game result: player win 1, draw ½, player loss 0. */
  label: number;
}

/** A labeled corpus + the game-outcome split that produced it — the "label readout"
 * that tells you at a glance whether the board even generated a learnable signal
 * (all-draws ⇒ every label ½ ⇒ nothing to separate). */
export interface TexelCorpus {
  positions: LabeledPosition[];
  games: number;
  /** Player-positive game outcomes across the corpus. */
  wins: number;
  draws: number;
  losses: number;
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const resultLabel = (winner: Winner): number => (winner === 'player' ? 1 : winner === 'draw' ? 0.5 : 0);

/**
 * A position is "quiet" (safe to score statically) when the side to move is not in
 * check and has no capture available — a cheap quiescence proxy so we never label a
 * position mid-exchange. Mirrors the spirit of core/ai.ts `quiesce` without recursing.
 */
function isQuiet(state: GameState, env: MoveEnv): boolean {
  if (state.turn !== 'player' && state.turn !== 'enemy') return false;
  if (sideInCheck(state, state.turn, env)) return false;
  for (const piece of livingPieces(state.pieces, state.turn)) {
    for (const move of legalMoves(piece, state.pieces, state.size, env)) {
      if (move.capture != null) return false;
    }
  }
  return true;
}

/**
 * Turn one played game into labeled quiet positions. Replays the record through the
 * real rules engine (`replayStates`), so the positions are exactly what live play
 * would produce, then keeps the quiet, non-terminal ones. `turnsElapsed` is tracked
 * across the replay so the eval's clock-aware terms read correctly (they are inert on
 * most objectives, but this stays honest for `survive`).
 */
export function labelGamePositions(
  level: Level,
  record: GameRecord,
  openingMoves: readonly RecordedMove[],
): LabeledPosition[] {
  const states = replayStates(level, record, openingMoves);
  if (states.length === 0) return [];
  const baseEnv = gameEnv(states[0]);
  const ctx = { ...objectiveContextForLevel(level), kingSide: kingSideOf(states[0].pieces) };
  const victoryRules = victoryRulesForLevel(level, ctx);
  const label = resultLabel(record.winner);

  const out: LabeledPosition[] = [];
  // replayStates index 0 is already AFTER the fixed opening. Every recorded
  // enemy opening ply completed one player→enemy round and must be present in
  // survive/turn-limit evaluation from the first labeled decision position.
  let turnsElapsed = openingMoves.filter((m) => m.side === 'enemy').length;
  for (let i = 0; i < states.length; i += 1) {
    const state = states[i];
    // A full round completed when the previous state was the enemy's turn and this one
    // is not (mirrors selfplay's turnsElapsed bookkeeping).
    if (i > 0 && states[i - 1].turn === 'enemy' && state.turn !== 'enemy') turnsElapsed += 1;
    if (state.winner || (state.turn !== 'player' && state.turn !== 'enemy')) continue;
    const env: MoveEnv = { ...baseEnv, lastMove: state.lastMove };
    if (!isQuiet(state, env)) continue;
    out.push({ state, sctx: { objective: level.objective, victoryRules, ctx, turnsElapsed }, env, label });
  }
  return out;
}

export interface CorpusOptions {
  /** Search settings for BOTH sides of the self-play games (equal-strength). Depth
   * governs game quality; deeper ⇒ more decisive on hard-to-convert objectives. */
  search: SearchOptions;
  /** Hard game-length cap (draw on reaching it). */
  maxPlies?: number;
}

/**
 * Play one self-play game per book position (equal weights on both sides — the
 * opening's imbalance, not a crippled AI, supplies decisiveness) and collect the
 * labeled quiet positions + the game-outcome split. Deterministic given the book +
 * options. Reuses selfplay's `playLevelGame`, so there is one turn loop, not a copy.
 */
export function buildSelfPlayCorpus(
  level: Level,
  book: readonly BookPosition[],
  opts: CorpusOptions,
): TexelCorpus {
  const positions: LabeledPosition[] = [];
  let wins = 0, draws = 0, losses = 0;
  for (const pos of book) {
    const record = playLevelGame(level, {
      seed: pos.seed,
      openingMoves: pos.moves,
      search: opts.search,
      maxPlies: opts.maxPlies,
    });
    if (record.winner === 'player') wins += 1;
    else if (record.winner === 'draw') draws += 1;
    else losses += 1;
    positions.push(...labelGamePositions(level, record, pos.moves));
  }
  return { positions, games: book.length, wins, draws, losses };
}

/** Mean squared error of σ(K·eval_θ) against the labels over the corpus. */
export function meanSquaredError(positions: readonly LabeledPosition[], k: number, weights: EvalWeights): number {
  if (positions.length === 0) return 0;
  let sum = 0;
  for (const p of positions) {
    const evalScore = evaluateGameState(p.state, p.sctx, weights, p.env);
    const predicted = sigmoid(k * evalScore);
    const diff = p.label - predicted;
    sum += diff * diff;
  }
  return sum / positions.length;
}

/**
 * Fit the sigmoid scaling constant K that minimises error at a FIXED θ — the standard
 * Texel first step (calibrate the sigmoid to the eval's scale before moving weights).
 * Coarse scan then local refine; K > 0 (a larger eval ⇒ a more confident prediction).
 */
export function tuneK(positions: readonly LabeledPosition[], weights: EvalWeights): number {
  const errorAt = (k: number): number => meanSquaredError(positions, k, weights);
  let bestK = 1;
  let bestE = Infinity;
  for (let k = 0.05; k <= 3.0001; k += 0.05) {
    const e = errorAt(k);
    if (e < bestE) { bestE = e; bestK = k; }
  }
  // Refine around the coarse winner.
  let step = 0.025;
  for (let pass = 0; pass < 4; pass += 1) {
    for (const k of [bestK - step, bestK + step]) {
      if (k <= 0) continue;
      const e = errorAt(k);
      if (e < bestE) { bestE = e; bestK = k; }
    }
    step /= 2;
  }
  return bestK;
}

export interface TexelOptions {
  /** Starting weights (also the reference for per-parameter step scaling). Default:
   * DEFAULT_EVAL_WEIGHTS — so "fitted vs. reference" reads as "what the board changed". */
  reference?: EvalWeights;
  /** Gradient-descent iterations. */
  iterations?: number;
  /** Adam learning rate, in NORMALISED coordinates (θ = φ · scale), so every weight
   * moves proportionally to its own magnitude — the same fix deriveScales applies to
   * SPSA (one absolute rate would swamp the 0.05 terms and crawl on the 1–9 values). */
  learningRate?: number;
}

export interface TexelResult {
  /** Calibrated sigmoid constant used during the fit. */
  k: number;
  /** Fitted weight vector (encodeWeights order). */
  theta: number[];
  /** Fitted weights, decoded. */
  weights: EvalWeights;
  initialError: number;
  finalError: number;
  /** Error after each iteration — the loss curve for the inspector. */
  errorTrajectory: number[];
  iterations: number;
}

const DEFAULT_ITERATIONS = 200;
const DEFAULT_LR = 0.05;
const FEATURE_H = 1e-2; // per-axis probe step for the exact feature (any small h works)

/**
 * Fit the eval weights to the corpus by Texel tuning: calibrate K, then Adam gradient
 * descent on E(θ) in normalised coordinates. Weights are floored at 0 (a negative piece
 * value / term is nonsensical). Deterministic. Returns the fitted vector + loss curve.
 *
 * Speed: `evaluateGameState` is linear ALONG EACH SINGLE weight axis (material is linear
 * in a piece value; the hanging term is a product of two weights, hence linear in each
 * one separately), so a per-axis central difference at the reference gives that axis's
 * EXACT partial derivative. We precompute each position's static score s0 and feature
 * vector f = ∂eval/∂θ ONCE, then model eval_θ(pos) ≈ s0 + f·(θ − θ_ref) — the descent is
 * then plain linear logistic regression (dot products only), turning a ~5-minute fit into
 * a sub-second one. The only term dropped is the negligible pieceValue×hangingFraction
 * cross derivative (both factors ~0.05·value and rarely co-moving far).
 */
export function runTexel(positions: readonly LabeledPosition[], opts: TexelOptions = {}): TexelResult {
  const reference = opts.reference ?? DEFAULT_EVAL_WEIGHTS;
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const lr = opts.learningRate ?? DEFAULT_LR;

  const scale = deriveScales(reference);
  const thetaRef = encodeWeights(reference);
  const dim = thetaRef.length;
  const k = tuneK(positions, reference);

  // Precompute s0[i] and the exact per-axis feature f[i][j] once (2·dim eval calls each).
  const n = positions.length;
  const s0 = new Float64Array(n);
  const feats: Float64Array[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = positions[i];
    s0[i] = evaluateGameState(p.state, p.sctx, reference, p.env);
    const f = new Float64Array(dim);
    for (let j = 0; j < dim; j += 1) {
      const up = thetaRef.slice(); up[j] += FEATURE_H;
      const dn = thetaRef.slice(); dn[j] -= FEATURE_H;
      const eUp = evaluateGameState(p.state, p.sctx, decodeWeights(up), p.env);
      const eDn = evaluateGameState(p.state, p.sctx, decodeWeights(dn), p.env);
      f[j] = (eUp - eDn) / (2 * FEATURE_H);
    }
    feats[i] = f;
  }

  const approxEval = (i: number, theta: number[]): number => {
    const f = feats[i];
    let s = s0[i];
    for (let j = 0; j < dim; j += 1) s += f[j] * (theta[j] - thetaRef[j]);
    return s;
  };
  const approxError = (theta: number[]): number => {
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const diff = positions[i].label - sigmoid(k * approxEval(i, theta));
      sum += diff * diff;
    }
    return sum / n;
  };

  // Adam in normalised coordinates φ = θ / scale (one lr moves each weight ∝ itself).
  let phi = thetaRef.map((v, i) => v / scale[i]);
  const thetaOf = (ph: number[]): number[] => ph.map((v, i) => Math.max(0, v * scale[i]));
  const initialError = meanSquaredError(positions, k, reference); // exact
  const errorTrajectory: number[] = [];
  const m = new Array(dim).fill(0);
  const v = new Array(dim).fill(0);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  for (let iter = 1; iter <= iterations; iter += 1) {
    const theta = thetaOf(phi);
    // Analytic gradient of E in θ-space: dE/dθ_j = mean_i 2(label−p)(−p(1−p))·k·f_i[j].
    const gTheta = new Array(dim).fill(0);
    for (let i = 0; i < n; i += 1) {
      const pr = sigmoid(k * approxEval(i, theta));
      const coeff = 2 * (positions[i].label - pr) * (-pr * (1 - pr)) * k;
      const f = feats[i];
      for (let j = 0; j < dim; j += 1) gTheta[j] += coeff * f[j];
    }
    for (let j = 0; j < dim; j += 1) {
      const g = (gTheta[j] / (n || 1)) * scale[j]; // chain to φ-space
      m[j] = b1 * m[j] + (1 - b1) * g;
      v[j] = b2 * v[j] + (1 - b2) * g * g;
      const mHat = m[j] / (1 - Math.pow(b1, iter));
      const vHat = v[j] / (1 - Math.pow(b2, iter));
      phi[j] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      if (phi[j] < 0) phi[j] = 0; // floor θ ≥ 0 (scale > 0)
    }
    errorTrajectory.push(approxError(thetaOf(phi)));
  }

  const theta = thetaOf(phi);
  return {
    k,
    theta,
    weights: decodeWeights(theta),
    initialError,
    finalError: meanSquaredError(positions, k, decodeWeights(theta)), // exact
    errorTrajectory,
    iterations,
  };
}

export interface RootStrapResult {
  theta: number[];
  weights: EvalWeights;
  initialError: number;
  finalError: number;
  iterations: number;
}

/**
 * RootStrap (Veness, Silver, Uther & Blair, "Bootstrapping from Game Tree Search", 2009):
 * fit the static eval weights so the static eval matches a DEEPER SEARCH's value at each
 * position — plain least-squares regression, no game outcome required. Works on a drawn
 * board (the whole point): every position carries a real-valued target from the search,
 * so there is no all-draws collapse. `targets[i]` is the deep-search score for
 * positions[i] (player-positive, eval units; the caller clips/skips near-terminal scores).
 * Reuses the same exact per-axis feature linearisation as runTexel. Deterministic.
 */
export function runRootStrap(
  positions: readonly LabeledPosition[],
  targets: readonly number[],
  opts: TexelOptions = {},
): RootStrapResult {
  const reference = opts.reference ?? DEFAULT_EVAL_WEIGHTS;
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const lr = opts.learningRate ?? DEFAULT_LR;
  const scale = deriveScales(reference);
  const thetaRef = encodeWeights(reference);
  const dim = thetaRef.length;
  const n = positions.length;

  const s0 = new Float64Array(n);
  const feats: Float64Array[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = positions[i];
    s0[i] = evaluateGameState(p.state, p.sctx, reference, p.env);
    const f = new Float64Array(dim);
    for (let j = 0; j < dim; j += 1) {
      const up = thetaRef.slice(); up[j] += FEATURE_H;
      const dn = thetaRef.slice(); dn[j] -= FEATURE_H;
      f[j] = (evaluateGameState(p.state, p.sctx, decodeWeights(up), p.env)
        - evaluateGameState(p.state, p.sctx, decodeWeights(dn), p.env)) / (2 * FEATURE_H);
    }
    feats[i] = f;
  }

  const model = (i: number, theta: number[]): number => {
    const f = feats[i];
    let s = s0[i];
    for (let j = 0; j < dim; j += 1) s += f[j] * (theta[j] - thetaRef[j]);
    return s;
  };
  const mse = (theta: number[]): number => {
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i += 1) { const e = model(i, theta) - targets[i]; sum += e * e; }
    return sum / n;
  };

  let phi = thetaRef.map((v, i) => v / scale[i]);
  const thetaOf = (ph: number[]): number[] => ph.map((v, i) => Math.max(0, v * scale[i]));
  const initialError = mse(thetaOf(phi));
  const m = new Array(dim).fill(0);
  const v = new Array(dim).fill(0);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let finalError = initialError;
  for (let iter = 1; iter <= iterations; iter += 1) {
    const theta = thetaOf(phi);
    const g = new Array(dim).fill(0);
    for (let i = 0; i < n; i += 1) {
      const resid = model(i, theta) - targets[i];
      const f = feats[i];
      for (let j = 0; j < dim; j += 1) g[j] += 2 * resid * f[j];
    }
    for (let j = 0; j < dim; j += 1) {
      const gj = (g[j] / (n || 1)) * scale[j];
      m[j] = b1 * m[j] + (1 - b1) * gj;
      v[j] = b2 * v[j] + (1 - b2) * gj * gj;
      const mHat = m[j] / (1 - Math.pow(b1, iter));
      const vHat = v[j] / (1 - Math.pow(b2, iter));
      phi[j] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      if (phi[j] < 0) phi[j] = 0;
    }
    finalError = mse(thetaOf(phi));
  }
  const theta = thetaOf(phi);
  return { theta, weights: decodeWeights(theta), initialError, finalError, iterations };
}
