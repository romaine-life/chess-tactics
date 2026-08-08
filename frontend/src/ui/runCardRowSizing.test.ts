import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_ROW_SIZING_DEFAULTS,
  RUN_CARD_ROW_SIZING_LIMITS,
  runCardRowCardHeight,
  runCardRowCardWidth,
  runCardRowSizingWithin,
  type RunCardRowSizing,
} from './runCardRowSizing';

const SIZING: RunCardRowSizing = { maxWidth: 360, heightFill: 90, gap: 16 };

/** The Run's real card lane, measured off the live Bona Vacantia workspace body. */
const WIDE = { width: 1082 - 16, height: 792 - 16 };
const NARROW = { width: 506 - 16, height: 322 - 16 };

describe('run card row sizing', () => {
  it('fills the lane width when width is the binding axis', () => {
    // (1066 - 2 gaps) / 3, floored — the row spans the lane instead of stopping at 236px.
    expect(runCardRowCardWidth({ count: 3, box: WIDE, sizing: SIZING })).toBe(344);
  });

  it('never prints wider than the tuned maximum', () => {
    const wide = runCardRowCardWidth({ count: 1, box: WIDE, sizing: SIZING });
    expect(wide).toBe(SIZING.maxWidth);
    expect(runCardRowCardWidth({ count: 1, box: WIDE, sizing: { ...SIZING, maxWidth: 240 } })).toBe(240);
  });

  it('stops at the share of the lane height it may use', () => {
    const short = { width: 4000, height: 700 };
    // 700 * 0.9 * 5 / 7 = 450, and the lane is wide enough to be irrelevant.
    expect(runCardRowCardWidth({ count: 3, box: short, sizing: { ...SIZING, maxWidth: 560 } })).toBe(450);
    expect(runCardRowCardWidth({ count: 3, box: short, sizing: { ...SIZING, maxWidth: 560, heightFill: 100 } })).toBe(500);
  });

  it('keeps a narrow window unclipped rather than holding a minimum width', () => {
    const width = runCardRowCardWidth({ count: 3, box: NARROW, sizing: SIZING });
    expect(width).toBe(152);
    expect(runCardRowCardHeight(width)).toBeLessThanOrEqual(NARROW.height);
    expect(width * 3 + 2 * SIZING.gap).toBeLessThanOrEqual(NARROW.width);
  });

  it('gives the gutter back to the cards when it shrinks', () => {
    const tight = runCardRowCardWidth({ count: 3, box: WIDE, sizing: { ...SIZING, gap: 0 } });
    expect(tight).toBeGreaterThan(runCardRowCardWidth({ count: 3, box: WIDE, sizing: SIZING }));
  });

  it('reports an unmeasured box rather than a zero-width card', () => {
    expect(runCardRowCardWidth({ count: 3, box: { width: 0, height: 0 }, sizing: SIZING })).toBe(0);
    expect(runCardRowCardWidth({ count: 0, box: WIDE, sizing: SIZING })).toBe(0);
  });

  it('pulls an out-of-range tuning back inside the published limits', () => {
    expect(runCardRowSizingWithin({ maxWidth: 9000, heightFill: -4, gap: 999 })).toEqual({
      maxWidth: RUN_CARD_ROW_SIZING_LIMITS.maxWidth.max,
      heightFill: RUN_CARD_ROW_SIZING_LIMITS.heightFill.min,
      gap: RUN_CARD_ROW_SIZING_LIMITS.gap.max,
    });
  });

  it('ships a baseline the instrument can reach', () => {
    expect(runCardRowSizingWithin({ ...RUN_CARD_ROW_SIZING_DEFAULTS })).toEqual(RUN_CARD_ROW_SIZING_DEFAULTS);
  });
});
