// The per-board training gym's engine (pure, deterministic — no DOM, no store).
//
// It tunes the AI's evaluation weights for one level using SPSA (Simultaneous
// Perturbation Stochastic Approximation) — the method Stockfish's Fishtest uses:
//   1. Treat the eval weights as a flat vector θ.
//   2. Each step, perturb ALL weights at once by a random ± (that's the
//      "simultaneous perturbation"): θ⁺ = θ + cΔ, θ⁻ = θ − cΔ.
//   3. Score θ⁺ and θ⁻ against a fixed reference across an "opening book" of
//      varied starts. From those TWO measurements you get a gradient estimate for
//      the WHOLE vector — cost per step is constant, no matter how many weights.
//   4. Step θ toward the better direction. Repeat.
//
// Everything is seeded and reproducible: the same masterSeed replays the exact
// same trajectory, so a gym run is deterministic (like the eight-queens engine).

import type { Level } from '../core/level';
import { playLevelGame } from './selfplay';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights, type SearchOptions } from '../core/ai';
import { createFromLevel } from './setup';
import { createRng } from '../core/rng';
import type { PieceType } from '../core/types';

// The tunable parameters, in a FIXED order so encode/decode and the UI always
// agree. The two rock "pieces" are structural (value 0, never captured) and stay
// out of the vector. This order is the coordinate system the whole gym addresses.
export const TUNED_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
export const TUNED_TERMS = [
  'hangingUndefended', 'hangingDefended', 'advance', 'guard',
  'reachProgress', 'reachGarrison', 'surviveUrgency', 'surviveClock',
] as const;
type TunedTerm = (typeof TUNED_TERMS)[number];

/** Human-readable labels for each vector slot, in vector order (for the UI). */
export const PARAM_LABELS: string[] = [
  ...TUNED_PIECE_TYPES.map((t) => t),
  'hanging (undef)', 'hanging (def)', 'advance', 'guard',
  'reach·progress', 'reach·garrison', 'survive·urgency', 'survive·clock',
];

/** EvalWeights → flat vector (fixed order). */
export function encodeWeights(w: EvalWeights): number[] {
  return [
    ...TUNED_PIECE_TYPES.map((t) => w.pieceValues[t]),
    ...TUNED_TERMS.map((k) => w[k]),
  ];
}

/** Flat vector → EvalWeights (rock/random-rock pinned to 0). */
export function decodeWeights(vec: readonly number[]): EvalWeights {
  const pieceValues = { rock: 0, 'random-rock': 0 } as Record<PieceType, number>;
  TUNED_PIECE_TYPES.forEach((t, i) => { pieceValues[t] = vec[i]; });
  const terms = {} as Record<TunedTerm, number>;
  TUNED_TERMS.forEach((k, i) => { terms[k] = vec[TUNED_PIECE_TYPES.length + i]; });
  return { pieceValues, ...terms };
}

/** Non-negativity floor: piece values and term weights below 0 are nonsensical. */
const clampVec = (vec: number[]): number[] => vec.map((v) => (v > 0 ? v : 0));

/** The opening book for a board: the first `size` seeded starts, from `baseSeed`.
 * Each seed produces one starting position (random-placement levels re-deal per
 * seed; fixed levels vary only in the AI's play, which is still a valid sample). */
export function makeBook(size: number, baseSeed = 1): number[] {
  return Array.from({ length: Math.max(1, size) }, (_, i) => baseSeed + i);
}

export interface MatchOptions {
  search: SearchOptions;
  maxPlies?: number;
}

/**
 * Score config A against config B across the book, playing EACH position from
 * both sides (A-as-player then A-as-enemy) to cancel side bias — analogous to
 * playing both colors. Returns A's points (win 1, draw ½) over total games, in
 * [0, 1]: 0.5 means evenly matched, >0.5 means A is stronger on this board.
 */
export function matchScore(level: Level, a: EvalWeights, b: EvalWeights, book: readonly number[], opts: MatchOptions): number {
  const searchA: SearchOptions = { ...opts.search, weights: a };
  const searchB: SearchOptions = { ...opts.search, weights: b };
  let points = 0;
  let games = 0;
  for (const seed of book) {
    // A as player, B as enemy.
    const r1 = playLevelGame(level, { seed, searchForSide: { player: searchA, enemy: searchB }, maxPlies: opts.maxPlies });
    points += r1.winner === 'player' ? 1 : r1.winner === 'draw' ? 0.5 : 0;
    // Same position, sides swapped: A as enemy, B as player.
    const r2 = playLevelGame(level, { seed, searchForSide: { player: searchB, enemy: searchA }, maxPlies: opts.maxPlies });
    points += r2.winner === 'enemy' ? 1 : r2.winner === 'draw' ? 0.5 : 0;
    games += 2;
  }
  return games ? points / games : 0.5;
}

export interface SpsaHyperParams {
  /** Learning-rate scale a. */
  a0: number;
  /** Perturbation-size scale c. */
  c0: number;
  /** Learning-rate decay exponent (classic SPSA ≈ 0.602). */
  alpha: number;
  /** Perturbation decay exponent (classic ≈ 0.101). */
  gamma: number;
  /** Learning-rate stability constant A. */
  bigA: number;
}

export const DEFAULT_HYPERPARAMS: SpsaHyperParams = { a0: 0.6, c0: 0.25, alpha: 0.602, gamma: 0.101, bigA: 5 };

export interface StepResult {
  /** The new search point after this step. */
  theta: number[];
  /** Score of θ⁺ / θ⁻ vs the reference (the two measurements SPSA is built on). */
  yPlus: number;
  yMinus: number;
  /** This step's perturbation and learning sizes (both shrink over time). */
  c: number;
  a: number;
}

/**
 * One SPSA step. Deterministic given (theta, reference, step, masterSeed): the
 * perturbation directions come from a seeded RNG, and the scoring games are
 * seeded via the book. Maximizes score vs the reference.
 */
export function spsaStep(
  level: Level,
  theta: readonly number[],
  reference: EvalWeights,
  book: readonly number[],
  step: number,
  masterSeed: number,
  hp: SpsaHyperParams,
  match: MatchOptions,
): StepResult {
  const rng = createRng(masterSeed + step * 7919 + 101);
  const c = hp.c0 / Math.pow(step + 1, hp.gamma);
  const a = hp.a0 / Math.pow(step + 1 + hp.bigA, hp.alpha);
  // Δ: a random ±1 for every weight (Bernoulli), the "simultaneous perturbation".
  const delta = theta.map(() => (rng.next() < 0.5 ? -1 : 1));
  const thetaPlus = clampVec(theta.map((v, i) => v + c * delta[i]));
  const thetaMinus = clampVec(theta.map((v, i) => v - c * delta[i]));
  const yPlus = matchScore(level, decodeWeights(thetaPlus), reference, book, match);
  const yMinus = matchScore(level, decodeWeights(thetaMinus), reference, book, match);
  // Gradient estimate for the whole vector from just those two measurements, then
  // a step toward the better-scoring direction.
  const thetaNew = clampVec(theta.map((v, i) => v + a * ((yPlus - yMinus) / (2 * c * delta[i]))));
  return { theta: thetaNew, yPlus, yMinus, c, a };
}

export interface TrajectoryPoint {
  step: number;
  /** Estimated strength vs the reference at this point — the climbing curve.
   * Uses the midpoint of the two SPSA measurements, so it costs no extra games. */
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
}

export interface TuningRunConfig {
  steps: number;
  bookSize: number;
  bookBaseSeed?: number;
  masterSeed?: number;
  /** Fixed opponent the trajectory is measured against (default: the hand-authored
   * origin weights — so "score" reads as "how much better than the shipped AI"). */
  reference?: EvalWeights;
  hyper?: SpsaHyperParams;
  match: MatchOptions;
}

export interface TuningResult {
  reference: EvalWeights;
  book: number[];
  trajectory: TrajectoryPoint[];
  /** Best point seen — the current champion. */
  champion: { step: number; score: number; theta: number[] };
  /** Steps since the champion last improved — the "how established" signal. */
  stepsSinceImprovement: number;
}

/**
 * Run `steps` SPSA steps and return the full trajectory + the champion (best
 * point). Deterministic given masterSeed. The champion is the highest-scoring
 * search point seen; "established" grows as steps pass without it improving.
 */
export function runTuning(level: Level, cfg: TuningRunConfig): TuningResult {
  const reference = cfg.reference ?? DEFAULT_EVAL_WEIGHTS;
  const hp = cfg.hyper ?? DEFAULT_HYPERPARAMS;
  const masterSeed = cfg.masterSeed ?? 1;
  const book = makeBook(cfg.bookSize, cfg.bookBaseSeed ?? 1);

  let theta = encodeWeights(reference);
  const trajectory: TrajectoryPoint[] = [];
  let champion = { step: -1, score: 0.5, theta: theta.slice() };
  let sinceImprovement = 0;

  for (let step = 0; step < cfg.steps; step += 1) {
    const r = spsaStep(level, theta, reference, book, step, masterSeed, hp, cfg.match);
    theta = r.theta;
    const score = (r.yPlus + r.yMinus) / 2; // midpoint proxy for score(θ vs reference)
    trajectory.push({ step, score, yPlus: r.yPlus, yMinus: r.yMinus, c: r.c, a: r.a, theta: theta.slice() });
    if (score > champion.score) {
      champion = { step, score, theta: theta.slice() };
      sinceImprovement = 0;
    } else {
      sinceImprovement += 1;
    }
  }
  return { reference, book, trajectory, champion, stepsSinceImprovement: sinceImprovement };
}

/** Convenience for the UI/worker: a level exists at this seed (validate a book entry). */
export function bookPositionExists(level: Level, seed: number): boolean {
  try {
    const g = createFromLevel(level, seed);
    return g.pieces.length > 0;
  } catch {
    return false;
  }
}
