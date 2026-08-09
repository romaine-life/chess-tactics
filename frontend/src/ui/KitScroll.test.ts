import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KIT_SCROLL_INITIAL_GUTTER,
  computeKitScrollMetrics,
  resolveKitScrollGutter,
  type KitScrollGutter,
} from './KitScroll';

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

describe('KitScroll gutter', () => {
  const settle = (
    heights: readonly boolean[],
    clientHeight = 400,
    from: KitScrollGutter = KIT_SCROLL_INITIAL_GUTTER,
  ): KitScrollGutter => heights.reduce(
    (previous, overflows) => resolveKitScrollGutter({ overflows, clientHeight, previous }),
    from,
  );

  it('starts reserved so the first measurement is taken against the narrower gutted layout', () => {
    expect(KIT_SCROLL_INITIAL_GUTTER.reserved).toBe(true);
  });

  it('collapses the rail and its gutter once a pane measures nothing to scroll', () => {
    expect(settle([false])).toEqual({ reserved: false, flips: 1, clientHeight: 400 });
  });

  it('keeps the rail while the pane overflows, without churning identity on every scroll', () => {
    const settled = settle([true]);
    expect(settled).toEqual({ reserved: true, flips: 0, clientHeight: 400 });
    expect(settle([true, true, true], 400, settled)).toBe(settled);
  });

  it('latches to the drawn rail when collapsing the gutter makes the content overflow again', () => {
    // Content that grows taller as it grows wider: fits gutted, overflows once the gutter goes,
    // fits again when it returns. Without the latch this ping-pongs forever.
    const latched = settle([false, true, false, true, false]);
    expect(latched.reserved).toBe(true);
    expect(settle([false], 400, latched).reserved).toBe(true);
  });

  it('re-opens the question when the pane itself is resized', () => {
    const latched = settle([false, true, false, true, false]);
    expect(resolveKitScrollGutter({
      overflows: false,
      clientHeight: 640,
      previous: latched,
    })).toEqual({ reserved: false, flips: 1, clientHeight: 640 });
  });
});

describe('KitScroll gutter styling (ADR-0534)', () => {
  const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  it('routes the reservation through --kit-scroll-gutter so a collapse reaches the content', () => {
    expect(styleCss).toMatch(/\.kit-scroll-wrap\s*\{[\s\S]*?--kit-scroll-gutter:\s*var\(--kit-scroll-gutter-size\);/);
    expect(styleCss).toMatch(/\.kit-scroll-wrap\[data-kit-scroll-rail='collapsed'\]\s*\{\s*--kit-scroll-gutter:\s*0px;\s*\}/);
    expect(styleCss).toMatch(/\.kit-scroll-content\s*\{[^}]*padding-right:\s*var\(--kit-scroll-gutter\);/);
    // No consumer may reserve the rail's space from a literal — it would survive the collapse.
    expect(styleCss).not.toMatch(/\.kit-scroll-content\s*\{[^}]*padding-right:\s*\d/);
    expect(styleCss).toMatch(/\.le-hud-scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-right:\s*calc\(var\(--kit-scroll-gutter\)/);
  });

  it('hides the idle rail without unmounting the track the thumb is measured from', () => {
    expect(styleCss).toMatch(/\.kit-scroll-wrap\[data-kit-scroll-rail='collapsed'\] > \.kit-scroll-rail\s*\{\s*visibility:\s*hidden;\s*\}/);
    expect(styleCss).not.toMatch(/\[data-kit-scroll-rail='collapsed'\] > \.kit-scroll-rail\s*\{\s*display:\s*none/);
  });

  it('exempts the framed grid gutter, whose rail is a member of a drawn frame', () => {
    const base = styleCss.indexOf(".kit-scroll-wrap[data-kit-scroll-rail='collapsed'] > .kit-scroll-rail");
    const exemption = styleCss.indexOf(".chrome-divided-grid__scroll[data-kit-scroll-rail='collapsed'] > .kit-scroll-rail");
    expect(base).toBeGreaterThan(-1);
    // Equal specificity, so the exemption only wins by coming after the base rule.
    expect(exemption).toBeGreaterThan(base);
    expect(styleCss.slice(exemption)).toMatch(/^[^}]*\{\s*visibility:\s*visible;\s*\}/);
  });
});
