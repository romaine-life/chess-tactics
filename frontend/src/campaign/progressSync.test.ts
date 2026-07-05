import { describe, it, expect } from 'vitest';
import { mergeProgress } from './progressSync';

describe('mergeProgress — conflict-free monotonic union', () => {
  it('takes the union of cleared levels', () => {
    const local = { a: { completed: true } };
    const account = { b: { completed: true } };
    expect(mergeProgress(local, account)).toEqual({
      a: { completed: true },
      b: { completed: true },
    });
  });

  it('ignores unsupported extra fields', () => {
    const local = { a: { completed: true, oldScore: 3 } };
    const account = { a: { completed: true, oldScore: 1 } };
    expect(mergeProgress(local, account).a).toEqual({ completed: true });
  });

  it('cleared wins over not-cleared (completed if either side has it)', () => {
    const local = { a: { completed: false } };
    const account = { a: { completed: true } };
    expect(mergeProgress(local, account).a).toEqual({ completed: true });
  });

  it('is order-independent (commutative)', () => {
    const x = { a: { completed: true }, b: { completed: false } };
    const y = { a: { completed: false }, c: { completed: true } };
    expect(mergeProgress(x, y)).toEqual(mergeProgress(y, x));
  });

  it('never loses progress (idempotent when merged with itself)', () => {
    const p = { a: { completed: true }, b: { completed: true } };
    expect(mergeProgress(p, p)).toEqual(p);
  });

  it('ignores malformed entries without throwing', () => {
    const bad = { a: null, b: 'x', c: { completed: true, oldScore: 2 } } as unknown as Parameters<typeof mergeProgress>[0];
    expect(mergeProgress(bad, {})).toEqual({ c: { completed: true } });
  });
});
