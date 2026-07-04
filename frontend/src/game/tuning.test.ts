import { describe, it, expect } from 'vitest';
import {
  encodeWeights, decodeWeights, makeBook, matchScore, runTuning, spsaStep,
  PARAM_LABELS, DEFAULT_HYPERPARAMS,
} from './tuning';
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

describe('makeBook', () => {
  it('is the first N seeds from the base', () => {
    expect(makeBook(4, 10)).toEqual([10, 11, 12, 13]);
    expect(makeBook(1)).toEqual([1]);
  });
});

describe('matchScore', () => {
  it('a config against itself scores exactly 0.5 (both-sides symmetry)', { timeout: 60_000 }, () => {
    // A vs A on a position, played both ways, always splits the points — this is
    // the invariant the both-sides scoring guarantees, on any board.
    const s = matchScore(duel(), DEFAULT_EVAL_WEIGHTS, DEFAULT_EVAL_WEIGHTS, makeBook(3), MATCH);
    expect(s).toBe(0.5);
  });

  it('is deterministic', { timeout: 60_000 }, () => {
    const a = decodeWeights(encodeWeights(DEFAULT_EVAL_WEIGHTS).map((v) => v * 1.2));
    const book = makeBook(3);
    expect(matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, book, MATCH))
      .toBe(matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, book, MATCH));
  });

  it('is anti-symmetric: score(A vs B) + score(B vs A) = 1', { timeout: 60_000 }, () => {
    const a = decodeWeights(encodeWeights(DEFAULT_EVAL_WEIGHTS).map((v, i) => (i === 4 ? v * 0.3 : v))); // gut the queen value
    const book = makeBook(3);
    const ab = matchScore(duel(), a, DEFAULT_EVAL_WEIGHTS, book, MATCH);
    const ba = matchScore(duel(), DEFAULT_EVAL_WEIGHTS, a, book, MATCH);
    expect(ab + ba).toBeCloseTo(1, 5);
  });
});

describe('spsaStep', () => {
  it('is deterministic and keeps weights non-negative', { timeout: 60_000 }, () => {
    const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    const book = makeBook(2);
    const r1 = spsaStep(duel(), theta, DEFAULT_EVAL_WEIGHTS, book, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    const r2 = spsaStep(duel(), theta, DEFAULT_EVAL_WEIGHTS, book, 0, 7, DEFAULT_HYPERPARAMS, MATCH);
    expect(r1).toEqual(r2);
    expect(r1.theta.every((v) => v >= 0)).toBe(true);
    expect(r1.c).toBeGreaterThan(0);
  });
});

describe('runTuning', () => {
  it('is deterministic per masterSeed and yields one point per step', { timeout: 120_000 }, () => {
    const cfg = { steps: 3, bookSize: 2, masterSeed: 5, match: MATCH };
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
