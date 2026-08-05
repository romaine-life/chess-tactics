import { describe, expect, it } from 'vitest';
import { kitScrollDragTarget, kitScrollMetrics } from './KitScroll';

describe('kitScrollMetrics', () => {
  it('maps maximum native scroll to the end of the actual drawn rail', () => {
    expect(kitScrollMetrics({
      viewportHeight: 400,
      scrollHeight: 800,
      scrollTop: 400,
      trackHeight: 360,
    })).toEqual({ scrollable: true, h: 180, top: 180 });
  });

  it('uses the actual rail height when it differs from the scroll viewport', () => {
    expect(kitScrollMetrics({
      viewportHeight: 400,
      scrollHeight: 1_000,
      scrollTop: 300,
      trackHeight: 320,
    })).toEqual({ scrollable: true, h: 128, top: 96 });
  });

  it('omits the thumb when the native viewport is not scrollable', () => {
    expect(kitScrollMetrics({
      viewportHeight: 400,
      scrollHeight: 400,
      scrollTop: 0,
      trackHeight: 360,
    })).toEqual({ scrollable: false, h: 0, top: 0 });
  });

  it('maps dragging against the actual drawn rail rather than the native viewport', () => {
    expect(kitScrollDragTarget({
      startScrollTop: 0,
      deltaY: 192,
      viewportHeight: 400,
      scrollHeight: 1_000,
      trackHeight: 320,
      thumbHeight: 128,
    })).toBe(600);
  });
});
