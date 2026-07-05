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
import { playLevelGame, type GameRecord } from './selfplay';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights, type SearchOptions } from '../core/ai';
import { createRng } from '../core/rng';
import type { PieceType } from '../core/types';
import type { BookPosition } from './openingBook';

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

/**
 * Per-parameter perturbation SCALE — the fix for SPSA finding nothing. The default
 * spsaStep used one scalar c across a vector where piece values are 1–9 but term
 * weights are 0.04–0.5, so at c=0.25 a term weight was kicked by ~5× its own value
 * (pure noise) while a pawn barely moved. Scaling the perturbation by each weight's
 * own magnitude (with a small floor so a zero-valued weight can still move) nudges
 * every axis by a comparable FRACTION of itself — this game's analogue of Fishtest's
 * per-variable c_end. Effectively SPSA runs in the normalized space φ = θ/scale.
 */
export function deriveScales(reference: EvalWeights): number[] {
  return encodeWeights(reference).map((v) => Math.max(0.05, Math.abs(v)));
}

/**
 * Polyak–Ruppert tail average: the mean of the LAST `fraction` of the trajectory's
 * iterates. SPSA's single best-scoring point is a noisy estimate (it can be a lucky
 * measurement); the tail average is the standard variance-reduced estimator and is
 * what the adopt path should validate on held-out openings. Returns null for an
 * empty trajectory.
 */
export function tailAverageTheta(trajectory: readonly { theta: number[] }[], fraction = 0.25): number[] | null {
  if (!trajectory.length) return null;
  const n = Math.max(1, Math.round(trajectory.length * fraction));
  const tail = trajectory.slice(trajectory.length - n);
  const dim = tail[0].theta.length;
  const sum = new Array(dim).fill(0);
  for (const p of tail) for (let i = 0; i < dim; i += 1) sum[i] += p.theta[i];
  return sum.map((v) => v / tail.length);
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
/** Full outcome of A-vs-B over the book (each position played both ways), from A's
 * perspective. `score` is the usual (wins + ½·draws)/games; the win/draw/loss split
 * is kept so a run can SHOW why the score sits where it does (e.g. mostly draws). */
export interface MatchStats {
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  records: MatchGameRecord[];
}

export interface MatchGameRecord {
  bookIndex: number;
  seed: number;
  /** Which side config A played in this game. */
  candidateSide: 'player' | 'enemy';
  /** Opening plies that produced the book position before this recorded game began. */
  openingMoves: BookPosition['moves'];
  record: GameRecord;
}

export function matchStats(level: Level, a: EvalWeights, b: EvalWeights, book: readonly BookPosition[], opts: MatchOptions, retainRecords = true): MatchStats {
  const searchA: SearchOptions = { ...opts.search, weights: a };
  const searchB: SearchOptions = { ...opts.search, weights: b };
  let wins = 0, draws = 0, losses = 0;
  const records: MatchGameRecord[] = [];
  for (let bookIndex = 0; bookIndex < book.length; bookIndex += 1) {
    const pos = book[bookIndex];
    // Each game STARTS from this book position (the seeded opening plies), then A
    // and B play it out. Playing it both ways (A-as-player then A-as-enemy) cancels
    // side bias — so matchScore(w, w, book) === 0.5 for any book (swap symmetry).
    const opening = pos.moves;
    const seed = pos.seed;
    // A as player, B as enemy.
    const r1 = playLevelGame(level, { seed, openingMoves: opening, searchForSide: { player: searchA, enemy: searchB }, maxPlies: opts.maxPlies });
    if (r1.winner === 'player') wins += 1; else if (r1.winner === 'draw') draws += 1; else losses += 1;
    if (retainRecords) records.push({ bookIndex, seed, candidateSide: 'player', openingMoves: opening, record: r1 });
    // Same position, sides swapped: A as enemy, B as player.
    const r2 = playLevelGame(level, { seed, openingMoves: opening, searchForSide: { player: searchB, enemy: searchA }, maxPlies: opts.maxPlies });
    if (r2.winner === 'enemy') wins += 1; else if (r2.winner === 'draw') draws += 1; else losses += 1;
    if (retainRecords) records.push({ bookIndex, seed, candidateSide: 'enemy', openingMoves: opening, record: r2 });
  }
  const games = wins + draws + losses;
  return { score: games ? (wins + 0.5 * draws) / games : 0.5, games, wins, draws, losses, records };
}

/** (wins + ½·draws)/games from A's perspective. matchScore(w, w, book) === 0.5. */
export function matchScore(level: Level, a: EvalWeights, b: EvalWeights, book: readonly BookPosition[], opts: MatchOptions): number {
  return matchStats(level, a, b, book, opts, false).score;
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
  /** Optional per-parameter perturbation scale (see deriveScales). When omitted,
   * spsaStep derives it from the reference's magnitudes so each weight moves
   * proportionally to itself instead of being swamped/starved by one scalar c. */
  cScale?: number[];
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
  /** Game outcomes across BOTH probes this step (θ⁺ and θ⁻ vs the reference), from
   * the candidate's perspective — surfaced so a run can show its decisiveness. */
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Full self-play records for the latest step only, tagged by probe and book position. */
  latestGames: SpsaStepGameRecord[];
}

export interface SpsaStepGameRecord extends MatchGameRecord {
  probe: 'plus' | 'minus';
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
  book: readonly BookPosition[],
  step: number,
  masterSeed: number,
  hp: SpsaHyperParams,
  match: MatchOptions,
): StepResult {
  const rng = createRng(masterSeed + step * 7919 + 101);
  // Per-parameter scale so each weight is perturbed by a comparable FRACTION of its
  // own magnitude (see deriveScales) — the fix for one scalar c being noise on the
  // term weights and negligible on the piece values.
  const scale = hp.cScale ?? deriveScales(reference);
  const c = hp.c0 / Math.pow(step + 1, hp.gamma);
  const a = hp.a0 / Math.pow(step + 1 + hp.bigA, hp.alpha);
  // Δ: a random ±1 for every weight (Bernoulli), the "simultaneous perturbation".
  const delta = theta.map(() => (rng.next() < 0.5 ? -1 : 1));
  const thetaPlus = clampVec(theta.map((v, i) => v + c * scale[i] * delta[i]));
  const thetaMinus = clampVec(theta.map((v, i) => v - c * scale[i] * delta[i]));
  const sPlus = matchStats(level, decodeWeights(thetaPlus), reference, book, match);
  const sMinus = matchStats(level, decodeWeights(thetaMinus), reference, book, match);
  const yPlus = sPlus.score;
  const yMinus = sMinus.score;
  // Gradient in the normalized space, mapped back per-axis by `scale`: a step toward
  // the better-scoring direction where each weight moves proportionally to itself.
  const thetaNew = clampVec(theta.map((v, i) => v + scale[i] * a * ((yPlus - yMinus) / (2 * c * delta[i]))));
  return {
    theta: thetaNew, yPlus, yMinus, c, a,
    games: sPlus.games + sMinus.games,
    wins: sPlus.wins + sMinus.wins,
    draws: sPlus.draws + sMinus.draws,
    losses: sPlus.losses + sMinus.losses,
    latestGames: [
      ...sPlus.records.map((record) => ({ ...record, probe: 'plus' as const })),
      ...sMinus.records.map((record) => ({ ...record, probe: 'minus' as const })),
    ],
  };
}

export interface TrajectoryPoint {
  step: number;
  /** Honest strength of the stepped weights vs the reference — an actual match over
   * the book (matchScore), the climbing curve. NOT the yPlus/yMinus probe midpoint. */
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
}

export interface TuningRunConfig {
  steps: number;
  /** The opening-book positions the trajectory trains over (one game per position,
   * played both ways per SPSA measurement). */
  book: readonly BookPosition[];
  masterSeed?: number;
  /** Fixed opponent the trajectory is measured against (default: the hand-authored
   * origin weights — so "score" reads as "how much better than the shipped AI"). */
  reference?: EvalWeights;
  hyper?: SpsaHyperParams;
  match: MatchOptions;
}

export interface TuningResult {
  reference: EvalWeights;
  book: readonly BookPosition[];
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
  const book = cfg.book;

  let theta = encodeWeights(reference);
  const trajectory: TrajectoryPoint[] = [];
  let champion = { step: -1, score: 0.5, theta: theta.slice() };
  let sinceImprovement = 0;

  for (let step = 0; step < cfg.steps; step += 1) {
    const r = spsaStep(level, theta, reference, book, step, masterSeed, hp, cfg.match);
    theta = r.theta;
    // Honest strength of the stepped weights vs the reference (an actual match over the
    // book), NOT the yPlus/yMinus probe midpoint — same fix as advanceSession.
    const score = matchScore(level, decodeWeights(theta), reference, book, cfg.match);
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
