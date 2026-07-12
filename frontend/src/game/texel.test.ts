import { describe, it, expect } from 'vitest';
import { sigmoid, buildSelfPlayCorpus, meanSquaredError, tuneK, runTexel } from './texel';
import { generateOpeningBook } from './openingBook';
import { encodeWeights } from './tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { breakLineLevel } from './__fixtures__/breakLine';

const SEARCH = { maxDepth: 2, maxNodes: 20_000, epsilon: 0 } as const;

// A small deterministic corpus from the real sandbox board — enough to exercise the
// fitter without the cost of a decisive-signal run (that lives in the checkpoint).
function smallCorpus() {
  const book = generateOpeningBook(breakLineLevel, { size: 4, seedBase: 1, plies: 3, variety: 0.6 }, { search: SEARCH });
  return buildSelfPlayCorpus(breakLineLevel, book, { search: SEARCH, maxPlies: 80 });
}

describe('texel primitives', () => {
  it('sigmoid is centred and monotonic', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 12);
    expect(sigmoid(10)).toBeGreaterThan(sigmoid(-10));
    expect(sigmoid(100)).toBeLessThanOrEqual(1);
    expect(sigmoid(-100)).toBeGreaterThanOrEqual(0);
  });

  it('tuneK returns a positive K that is no worse than the coarse default', () => {
    const corpus = smallCorpus();
    const k = tuneK(corpus.positions, DEFAULT_EVAL_WEIGHTS);
    expect(k).toBeGreaterThan(0);
    expect(meanSquaredError(corpus.positions, k, DEFAULT_EVAL_WEIGHTS))
      .toBeLessThanOrEqual(meanSquaredError(corpus.positions, 1, DEFAULT_EVAL_WEIGHTS) + 1e-12);
  });
});

describe('runTexel on the Break the Line board', () => {
  it('produces a non-empty labeled corpus', () => {
    const corpus = smallCorpus();
    expect(corpus.games).toBe(4);
    expect(corpus.positions.length).toBeGreaterThan(0);
    expect(corpus.wins + corpus.draws + corpus.losses).toBe(4);
  });

  it('is deterministic — same corpus fits to the same vector', () => {
    const corpus = smallCorpus();
    const a = runTexel(corpus.positions, { iterations: 40 });
    const b = runTexel(corpus.positions, { iterations: 40 });
    expect(a.theta).toEqual(b.theta);
    expect(a.k).toBe(b.k);
    expect(a.errorTrajectory).toEqual(b.errorTrajectory);
  });

  it('leaves inert weights (absent pieces / off-objective terms) untouched', () => {
    // Rival Kings uses piece values + hangingUndefended + advance + guard. The exact
    // victory rules describe both royal targets, so guard is intentionally active even
    // though the legacy headline objective is no longer consulted by evaluation.
    // Knight/rook/queen are absent and reach*/survive* are off-rule, so those gradients
    // remain exactly zero and their weights must not move.
    const corpus = smallCorpus();
    const ref = encodeWeights(DEFAULT_EVAL_WEIGHTS);
    const result = runTexel(corpus.positions, { iterations: 60 });
    const inert = [1 /*knight*/, 3 /*rook*/, 4 /*queen*/, 10 /*reachProgress*/, 11 /*reachGarrison*/, 12 /*surviveUrgency*/, 13 /*surviveClock*/];
    for (const i of inert) expect(result.theta[i]).toBeCloseTo(ref[i], 9);
    expect(result.theta[9] /*guard*/).not.toBeCloseTo(ref[9], 9);
    expect(Number.isFinite(result.initialError)).toBe(true);
    expect(Number.isFinite(result.finalError)).toBe(true);
    // Decoded weights round-trip through the vector.
    expect(encodeWeights(result.weights)).toEqual(result.theta);
  });
});
