import { describe, it, expect } from 'vitest';
import {
  encodeWeights, decodeWeights, matchScore, matchStats, runTuning, spsaStep,
  PARAM_LABELS, DEFAULT_HYPERPARAMS, deriveScales, tailAverageTheta,
} from './tuning';
import { generateOpeningBook, type BookPosition, type OpeningBookSettings } from './openingBook';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { createBlankLevel, type Level } from '../core/level';

// Shallow + node-bounded so the sweep is fast and fully deterministic.
const MATCH = { search: { maxDepth: 1, maxNodes: 1500 }, maxPlies: 50 };

function duel(): Level {
  const level = createBlankLevel('tune-duel', 'Duel', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'knight', side: 'player' },
    { x: 6, y: 1, type: 'rook', side: 'enemy' },
    { x: 4, y: 1, type: 'bishop', side: 'enemy' },
  ];
  return level;
}

// A small varied opening book (the new book shape: positions, not raw seeds).
function book(size = 3): BookPosition[] {
  const settings: OpeningBookSettings = { size, seedBase: 1, plies: 3, variety: 0.5 };
  return generateOpeningBook(duel(), settings, MATCH);
}

describe('matchStats (game outcomes surfaced for the run view)', () => {
  const b = book(3);
  it('splits into W/D/L that sum to games, with score = (wins + ½·draws)/games', () => {
    const s = matchStats(duel(), DEFAULT_EVAL_WEIGHTS, DEFAULT_EVAL_WEIGHTS, b, MATCH);
    expect(s.wins + s.draws + s.losses).toBe(s.games);
    expect(s.games).toBe(b.length * 2); // each position played both ways
    expect(s.score).toBeCloseTo((s.wins + 0.5 * s.draws) / s.games, 10);
  });
  it('A-vs-A is symmetric: wins === losses and score === 0.5', () => {
    const s = matchStats(duel(), DEFAULT_EVAL_WEIGHTS, DEFAULT_EVAL_WEIGHTS, b, MATCH);
    expect(s.wins).toBe(s.losses);
    expect(s.score).toBe(0.5);
  });
  it('spsaStep reports this step\'s outcomes across BOTH probes, summing to its games', () => {
    const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    const r = spsaStep(duel(), theta, DEFAULT_EVAL_WEIGHTS, b, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    expect(r.wins + r.draws + r.losses).toBe(r.games);
    expect(r.games).toBe(b.length * 4); // θ⁺ and θ⁻, each both ways over the book
  });
});

describe('weight vector encode/decode', () => {
  it('round-trips the default weights and pins the rocks to 0', () => {
    const vec = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    expect(vec).toHaveLength(PARAM_LABELS.length);
    const back = decodeWeights(vec);
    expect(back.pieceValues.knight).toBe(DEFAULT_EVAL_WEIGHTS.pieceValues.knight);
    expect(back.advance).toBe(DEFAULT_EVAL_WEIGHTS.advance);
    expect(back.pieceValues.rock).toBe(0);
    expect(back.pieceValues['random-rock']).toBe(0);
  });
});

describe('matchScore', () => {
  it('a config against itself scores exactly 0.5 (both-sides symmetry)', { timeout: 60_000 }, () => {
    // A vs A on a position, played both ways, always splits the points — this is
    // the invariant the both-sides scoring guarantees, on any book of positions.
    const s = matchScore(duel(), DEFAULT_EVAL_WEIGHTS, DEFAULT_EVAL_WEIGHTS, book(3), MATCH);
    expect(s).toBe(0.5);
  });

  it('is deterministic', { timeout: 60_000 }, () => {
    const a = decodeWeights(encodeWeights(DEFAULT_EVAL_WEIGHTS).map((v) => v * 1.2));
    const b = book(3);
    expect(matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, b, MATCH))
      .toBe(matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, b, MATCH));
  });

  it('is anti-symmetric: score(A vs B) + score(B vs A) = 1', { timeout: 60_000 }, () => {
    const a = decodeWeights(encodeWeights(DEFAULT_EVAL_WEIGHTS).map((v, i) => (i === 4 ? v * 0.3 : v))); // gut the queen value
    const b = book(3);
    const ab = matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, b, MATCH);
    const ba = matchScore(duel(), DEFAULT_EVAL_WEIGHTS, a, b, MATCH);
    expect(ab + ba).toBeCloseTo(1, 5);
  });
});

describe('spsaStep', () => {
  it('is deterministic and keeps weights non-negative', { timeout: 60_000 }, () => {
    const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    const b = book(2);
    const r1 = spsaStep(duel(), theta, DEFAULT_EVAL_WEIGHTS, b, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    const r2 = spsaStep(duel(), theta, DEFAULT_EVAL_WEIGHTS, b, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    expect(r1).toEqual(r2);
    expect(r1.theta.every((v) => v >= 0)).toBe(true);
    expect(r1.c).toBeGreaterThan(0);
  });
});

describe('runTuning', () => {
  it('is deterministic per masterSeed and yields one point per step', { timeout: 120_000 }, () => {
    const cfg = { steps: 3, book: book(2), masterSeed: 5, match: MATCH };
    const a = runTuning(duel(), cfg);
    const b = runTuning(duel(), cfg);
    expect(a).toEqual(b);
    expect(a.trajectory).toHaveLength(3);
    expect(a.champion.score).toBeGreaterThanOrEqual(0.5);
    // The champion is the best point actually seen in the trajectory.
    const best = Math.max(0.5, ...a.trajectory.map((p) => p.score));
    expect(a.champion.score).toBeCloseTo(best, 6);
  });
});

describe('per-parameter SPSA scaling', () => {
  it('scales each axis by its own magnitude — piece values ≫ term weights, floored so a zero weight still moves', () => {
    const s = deriveScales(DEFAULT_EVAL_WEIGHTS);
    expect(s).toHaveLength(PARAM_LABELS.length);
    // A pawn's value (1) must get a far bigger perturbation scale than `advance` (0.05).
    expect(s[PARAM_LABELS.indexOf('pawn')]).toBeGreaterThan(s[PARAM_LABELS.indexOf('advance')] * 5);
    // hangingDefended defaults to 0 post-quiescence; the 0.05 floor keeps it tunable.
    expect(s.every((v) => v >= 0.05)).toBe(true);
    expect(s[PARAM_LABELS.indexOf('hanging (def)')]).toBe(0.05);
  });
});

describe('tailAverageTheta (Polyak–Ruppert)', () => {
  it('averages the last fraction of the trajectory', () => {
    const traj = [{ theta: [0, 10] }, { theta: [2, 20] }, { theta: [4, 30] }, { theta: [6, 40] }];
    // last 50% = last 2 points: mean of [4,30] and [6,40] = [5,35]
    expect(tailAverageTheta(traj, 0.5)).toEqual([5, 35]);
    // whole trajectory when fraction covers it
    expect(tailAverageTheta(traj, 1)).toEqual([3, 25]);
    expect(tailAverageTheta([], 0.5)).toBeNull();
  });
});
