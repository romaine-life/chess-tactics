import { describe, it, expect } from 'vitest';
import { sprt, eloToScore, scoreToElo, DEFAULT_SPRT } from './sprt';

describe('eloToScore / scoreToElo', () => {
  it('0 Elo is an even score', () => {
    expect(eloToScore(0)).toBeCloseTo(0.5, 12);
  });
  it('round-trips a range of scores (eloToScore(scoreToElo(x)) ~= x)', () => {
    for (const x of [0.05, 0.2, 0.4, 0.5, 0.6, 0.8, 0.95]) {
      expect(eloToScore(scoreToElo(x))).toBeCloseTo(x, 10);
    }
  });
  it('positive Elo is above even, negative below', () => {
    expect(eloToScore(100)).toBeGreaterThan(0.5);
    expect(eloToScore(-100)).toBeLessThan(0.5);
  });
});

describe('sprt bounds', () => {
  it('lower < 0 < upper', () => {
    const r = sprt(1, 1, 1);
    expect(r.lower).toBeLessThan(0);
    expect(r.upper).toBeGreaterThan(0);
  });
  it('an empty record continues with llr 0', () => {
    const r = sprt(0, 0, 0);
    expect(r.verdict).toBe('continue');
    expect(r.llr).toBe(0);
    expect(r.n).toBe(0);
  });
});

describe('sprt verdicts', () => {
  it('all wins -> accept', () => {
    expect(sprt(200, 0, 0).verdict).toBe('accept');
  });
  it('all losses -> reject', () => {
    expect(sprt(0, 0, 200).verdict).toBe('reject');
  });
  it('all draws -> reject (draws support elo0 = H0, not the +8 improvement)', () => {
    // A pile of draws is exactly the null hypothesis (even score), so the test
    // rejects the "+8 Elo improvement" alternative.
    expect(sprt(0, 500, 0).verdict).toBe('reject');
  });
  it('a strongly-winning mixed record eventually crosses to accept', () => {
    // ~70% score over a long run — clearly better than +8 Elo.
    const r = sprt(700, 100, 200);
    expect(r.verdict).toBe('accept');
    expect(r.elo).toBeGreaterThan(8);
  });
  it('a strongly-losing mixed record eventually crosses to reject', () => {
    const r = sprt(200, 100, 700);
    expect(r.verdict).toBe('reject');
    expect(r.elo).toBeLessThan(0);
  });
  it('a 50/50 small sample stays continue', () => {
    const r = sprt(3, 2, 3);
    expect(r.verdict).toBe('continue');
  });
});

describe('sprt result fields', () => {
  it('score = (wins + ½·draws)/n and elo is its round-trip', () => {
    const r = sprt(6, 2, 2, DEFAULT_SPRT);
    expect(r.n).toBe(10);
    expect(r.score).toBeCloseTo((6 + 0.5 * 2) / 10, 12);
    expect(r.elo).toBeCloseTo(scoreToElo(r.score), 10);
  });
});
