import { describe, it, expect } from 'vitest';
import { mergeProgress } from './progressSync';

describe('mergeProgress — conflict-free monotonic union', () => {
  it('takes the union of cleared levels', () => {
    const local = { a: { completed: true, stars: 1 } };
    const account = { b: { completed: true, stars: 2 } };
    expect(mergeProgress(local, account)).toEqual({
      a: { completed: true, stars: 1 },
      b: { completed: true, stars: 2 },
    });
  });

  it('keeps the best star rating per level', () => {
    const local = { a: { completed: true, stars: 3 } };
    const account = { a: { completed: true, stars: 1 } };
    expect(mergeProgress(local, account).a).toEqual({ completed: true, stars: 3 });
  });

  it('cleared wins over not-cleared (completed if either side has it)', () => {
    const local = { a: { completed: false, stars: 0 } };
    const account = { a: { completed: true, stars: 2 } };
    expect(mergeProgress(local, account).a).toEqual({ completed: true, stars: 2 });
  });

  it('is order-independent (commutative)', () => {
    const x = { a: { completed: true, stars: 2 }, b: { completed: false, stars: 0 } };
    const y = { a: { completed: false, stars: 3 }, c: { completed: true, stars: 1 } };
    expect(mergeProgress(x, y)).toEqual(mergeProgress(y, x));
  });

  it('never loses progress (idempotent when merged with itself)', () => {
    const p = { a: { completed: true, stars: 2 }, b: { completed: true, stars: 3 } };
    expect(mergeProgress(p, p)).toEqual(p);
  });

  it('ignores malformed entries without throwing', () => {
    const bad = { a: null, b: 'x', c: { completed: true, stars: 2 } } as unknown as Parameters<typeof mergeProgress>[0];
    expect(mergeProgress(bad, {})).toEqual({ c: { completed: true, stars: 2 } });
  });
});
