import { describe, expect, it } from 'vitest';
import { computeKitScrollMetrics } from './KitScroll';

describe('KitScroll metrics', () => {
  it('sizes and seats the thumb against the rendered rail instead of the taller content viewport', () => {
    const top = computeKitScrollMetrics({
      clientHeight: 692,
      scrollHeight: 1056,
      scrollTop: 0,
      trackHeight: 676,
    });
    const bottom = computeKitScrollMetrics({
      clientHeight: 692,
      scrollHeight: 1056,
      scrollTop: 364,
      trackHeight: 676,
    });

    expect(top).toEqual({ scrollable: true, h: 443, top: 0 });
    expect(bottom.top + bottom.h).toBe(676);
  });

  it('omits the thumb without overflow and clamps a minimum thumb to a short rail', () => {
    expect(computeKitScrollMetrics({
      clientHeight: 200,
      scrollHeight: 200,
      scrollTop: 0,
      trackHeight: 180,
    })).toEqual({ scrollable: false, h: 0, top: 0 });

    expect(computeKitScrollMetrics({
      clientHeight: 20,
      scrollHeight: 200,
      scrollTop: 180,
      trackHeight: 18,
    })).toEqual({ scrollable: true, h: 18, top: 0 });
  });
});
