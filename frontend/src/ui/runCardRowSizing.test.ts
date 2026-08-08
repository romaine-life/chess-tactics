import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_ROW_SIZING_DEFAULTS,
  RUN_CARD_ROW_SIZING_LIMITS,
  RUN_CARD_ROW_SIZING_PROPERTIES,
  runCardRowCardHeight,
  runCardRowCardWidth,
  runCardRowFit,
  runCardRowSizingCss,
  runCardRowSizingFromStyle,
  runCardRowSizingWithin,
  type RunCardRowSizing,
} from './runCardRowSizing';

const SIZING: RunCardRowSizing = { size: 100, maxWidth: 560, gap: 16 };

/** The Run's real card lane, measured off the live Bona Vacantia workspace body. */
const WIDE = { width: 1082 - 16, height: 792 - 16 };
const NARROW = { width: 506 - 16, height: 322 - 16 };

function styleOf(values: Partial<Record<keyof RunCardRowSizing, string>>): CSSStyleDeclaration {
  return {
    getPropertyValue: (name: string) => {
      const key = (Object.keys(RUN_CARD_ROW_SIZING_PROPERTIES) as (keyof RunCardRowSizing)[])
        .find((candidate) => RUN_CARD_ROW_SIZING_PROPERTIES[candidate] === name);
      return key ? values[key] ?? '' : '';
    },
  } as unknown as CSSStyleDeclaration;
}

describe('run card row sizing', () => {
  it('fills the lane when the size knob is at full', () => {
    // (1066 - 2 gaps) / 3, floored — the row spans the lane instead of stopping at 236px.
    expect(runCardRowCardWidth({ count: 3, box: WIDE, sizing: SIZING })).toBe(344);
  });

  it('always answers the size knob, at every point of its range', () => {
    const widths = [100, 90, 80, 70, 60, 50, 40]
      .map((size) => runCardRowCardWidth({ count: 3, box: WIDE, sizing: { ...SIZING, size } }));
    // Strictly decreasing: no part of the knob's travel is inert on an ordinary window.
    widths.forEach((width, index) => {
      if (index > 0) expect(width).toBeLessThan(widths[index - 1]);
    });
    expect(widths.at(-1)).toBe(137);
  });

  it('takes the tuned share of whichever axis binds', () => {
    const short = { width: 4000, height: 700 };
    // 700 * 5 / 7 = 500 is the fit; half of it is what a 50% knob prints.
    expect(runCardRowFit({ count: 3, box: short, sizing: SIZING }).boundBy).toBe('lane height');
    expect(runCardRowCardWidth({ count: 3, box: short, sizing: SIZING })).toBe(500);
    expect(runCardRowCardWidth({ count: 3, box: short, sizing: { ...SIZING, size: 50 } })).toBe(250);
  });

  it('holds the ceiling only when the ceiling is the smallest number', () => {
    const ultrawide = { width: 3100, height: 1350 };
    expect(runCardRowFit({ count: 3, box: ultrawide, sizing: SIZING }).boundBy).toBe('the ceiling');
    expect(runCardRowCardWidth({ count: 3, box: ultrawide, sizing: SIZING })).toBe(560);
    expect(runCardRowFit({ count: 3, box: WIDE, sizing: SIZING }).boundBy).toBe('lane width');
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
    expect(runCardRowSizingWithin({ size: -4, maxWidth: 9000, gap: 999 })).toEqual({
      size: RUN_CARD_ROW_SIZING_LIMITS.size.min,
      maxWidth: RUN_CARD_ROW_SIZING_LIMITS.maxWidth.max,
      gap: RUN_CARD_ROW_SIZING_LIMITS.gap.max,
    });
  });

  it('reads an auditioned override off the row, field by field', () => {
    expect(runCardRowSizingFromStyle(styleOf({ size: '70' }))).toEqual({
      ...RUN_CARD_ROW_SIZING_DEFAULTS,
      size: 70,
    });
    // An unset, malformed, or out-of-range property leaves that field on the shipped number.
    expect(runCardRowSizingFromStyle(styleOf({ size: 'chunky', gap: '24' }))).toEqual({
      ...RUN_CARD_ROW_SIZING_DEFAULTS,
      gap: 24,
    });
    expect(runCardRowSizingFromStyle(null)).toEqual(RUN_CARD_ROW_SIZING_DEFAULTS);
  });

  it('round-trips the audition CSS it injects', () => {
    const tuning: RunCardRowSizing = { size: 70, maxWidth: 480, gap: 24 };
    const css = runCardRowSizingCss(tuning);
    expect(css).toContain('--run-card-size: 70;');
    expect(css).toContain('--run-card-max-width: 480;');
    expect(css).toContain('--run-card-gap: 24;');
    expect(runCardRowSizingFromStyle(styleOf({ size: '70', maxWidth: '480', gap: '24' }))).toEqual(tuning);
  });

  it('ships a baseline the instrument can reach', () => {
    expect(runCardRowSizingWithin({ ...RUN_CARD_ROW_SIZING_DEFAULTS })).toEqual(RUN_CARD_ROW_SIZING_DEFAULTS);
  });
});
