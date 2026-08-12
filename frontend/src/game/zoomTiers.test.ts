import { describe, expect, it } from 'vitest';
import {
  CLOSEST_TIER_CELLS,
  ZOOM_TIER_RATIO,
  ZOOM_TIERS_PER_OCTAVE,
  clampToRange,
  openingTier,
  snapToTier,
  spriteRungForWidth,
  stepTier,
  tierForZoom,
  zoomForTier,
  zoomTierRange,
} from './zoomTiers';

const VIEWPORT = { width: 1600, height: 900 };
const CELL = { width: 96, height: 54 };

describe('the zoom ladder', () => {
  it('steps by a constant ratio rather than a constant amount', () => {
    // The whole point of multiplicative steps: one notch is the same apparent
    // change zoomed in as zoomed out. An additive ladder fails this.
    const low = zoomForTier(tierForZoom(0.3));
    const high = zoomForTier(tierForZoom(3));
    expect(zoomForTier(tierForZoom(low) + 1) / low).toBeCloseTo(ZOOM_TIER_RATIO, 10);
    expect(zoomForTier(tierForZoom(high) + 1) / high).toBeCloseTo(ZOOM_TIER_RATIO, 10);
  });

  it('round-trips every tier it produces', () => {
    for (let index = -40; index <= 40; index += 1) {
      expect(tierForZoom(zoomForTier(index))).toBe(index);
    }
  });

  it('snaps an arbitrary zoom onto the ladder', () => {
    const snapped = snapToTier(1.2137);
    expect(snapped).toBe(zoomForTier(tierForZoom(snapped)));
    expect(Math.abs(snapped - 1.2137) / 1.2137).toBeLessThan(ZOOM_TIER_RATIO - 1);
  });

  it('treats a non-finite or non-positive zoom as the base tier', () => {
    expect(snapToTier(Number.NaN)).toBe(1);
    expect(snapToTier(0)).toBe(1);
    expect(snapToTier(-2)).toBe(1);
  });
});

describe('a level slice of the ladder', () => {
  const levelBox = { width: 1200, height: 700 };
  const range = zoomTierRange({ viewport: VIEWPORT, levelBox, cell: CELL });

  it('opens with the whole level visible', () => {
    const opening = openingTier(range);
    expect(levelBox.width * opening).toBeLessThanOrEqual(VIEWPORT.width);
    expect(levelBox.height * opening).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('never crops the level at its outer tier, despite rounding', () => {
    // Rounding to the nearest tier could round INTO the level; flooring cannot.
    for (const width of [400, 900, 1199, 1200, 2400, 5000]) {
      const slice = zoomTierRange({ viewport: VIEWPORT, levelBox: { width, height: 700 }, cell: CELL });
      expect(width * slice.outer).toBeLessThanOrEqual(VIEWPORT.width + 1e-9);
    }
  });

  it('stops zooming in once about two cells fill the frame', () => {
    const cellsAcross = VIEWPORT.width / (CELL.width * range.inner);
    expect(cellsAcross).toBeGreaterThanOrEqual(CLOSEST_TIER_CELLS);
    expect(cellsAcross).toBeLessThan(CLOSEST_TIER_CELLS * ZOOM_TIER_RATIO);
  });

  it('gives a tiny level a usable slice instead of an inverted one', () => {
    const tiny = zoomTierRange({
      viewport: VIEWPORT,
      levelBox: { width: 96, height: 54 },
      cell: CELL,
    });
    expect(tiny.inner).toBeGreaterThanOrEqual(tiny.outer);
  });

  it('offers every tier between the two ends and refuses to leave the slice', () => {
    let zoom = range.outer;
    const visited: number[] = [zoom];
    for (let guard = 0; guard < 200 && zoom < range.inner; guard += 1) {
      const next = stepTier(zoom, 1, range);
      if (next === zoom) break;
      zoom = next;
      visited.push(zoom);
    }
    expect(zoom).toBe(range.inner);
    expect(visited.every((value) => value === snapToTier(value))).toBe(true);
    // A notch at either end is a no-op, not an escape.
    expect(stepTier(range.inner, 1, range)).toBe(range.inner);
    expect(stepTier(range.outer, -1, range)).toBe(range.outer);
  });

  it('keeps an out-of-slice zoom inside the slice', () => {
    expect(clampToRange(99, range)).toBe(range.inner);
    expect(clampToRange(0.0001, range)).toBe(range.outer);
  });

  it('changes which tiers a level reaches with the window, never which tiers exist', () => {
    // The property the unit art depends on: a smaller window shifts the slice but
    // every value in it is still on the one global ladder.
    const small = zoomTierRange({ viewport: { width: 800, height: 500 }, levelBox, cell: CELL });
    expect(small.outer).not.toBe(range.outer);
    for (const value of [small.inner, small.outer, range.inner, range.outer]) {
      expect(value).toBe(snapToTier(value));
    }
  });
});

/**
 * The authored ladder exactly as the renderer builds it: the bottom octave rounded,
 * every tier above it double the one fourteen below. Tier 24 is the authoring cap.
 */
function authoredRungs(base: number, cap = 24): number[] {
  const widths = new Map<number, number>();
  for (let tier = -18; tier < -18 + ZOOM_TIERS_PER_OCTAVE; tier += 1) {
    widths.set(tier, Math.round(base * ZOOM_TIER_RATIO ** tier));
  }
  for (let tier = -18 + ZOOM_TIERS_PER_OCTAVE; tier <= cap; tier += 1) {
    widths.set(tier, 2 * (widths.get(tier - ZOOM_TIERS_PER_OCTAVE) as number));
  }
  return [...widths.values()];
}

describe('choosing a sprite for a drawn size', () => {
  const PAWN = authoredRungs(51);

  it('makes an octave an exact doubling, so an upscale is an integer', () => {
    expect(ZOOM_TIER_RATIO ** ZOOM_TIERS_PER_OCTAVE).toBeCloseTo(2, 12);
    for (let index = 0; index + ZOOM_TIERS_PER_OCTAVE < PAWN.length; index += 1) {
      expect(PAWN[index + ZOOM_TIERS_PER_OCTAVE]).toBe(2 * PAWN[index]);
    }
  });

  it('draws an authored size from its own sprite', () => {
    for (const width of PAWN) {
      expect(spriteRungForWidth(width, PAWN)).toEqual({ rung: width, magnify: 1 });
    }
  });

  it('draws past the cap from one octave down, at a whole magnification', () => {
    // Every tier the camera can still reach above the authoring cap. The drawn size is
    // an authored rung times a POWER OF TWO -- never a fractional scale, which is the
    // smeared block grid the whole ladder exists to avoid -- and it lands within a
    // ladder step of the size the zoom implies, which is all the eye asks of it.
    const cap = PAWN[PAWN.length - 1];
    for (let tier = 25; tier <= 38; tier += 1) {
      const ideal = 51 * ZOOM_TIER_RATIO ** tier;
      const chosen = spriteRungForWidth(ideal, PAWN);
      expect(chosen).not.toBeNull();
      expect(ideal).toBeGreaterThan(cap);
      const { rung, magnify } = chosen as { rung: number; magnify: number };
      expect(PAWN).toContain(rung);
      expect(Math.log2(magnify) % 1).toBe(0);
      expect(rung * magnify).toBeGreaterThan(ideal / ZOOM_TIER_RATIO);
      expect(rung * magnify).toBeLessThan(ideal * ZOOM_TIER_RATIO);
    }
  });

  it('has nothing to draw for an asset with no authored sizes', () => {
    expect(spriteRungForWidth(64, [])).toBeNull();
  });
});
