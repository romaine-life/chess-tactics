import { describe, expect, it } from 'vitest';
import { ZOOM_TIER_RATIO, snapToTier } from '../../game/zoomTiers';
import {
  clientDeltaToLocal,
  constrainPanToCoverViewport,
  exceedsViewPanePanThreshold,
  minimumZoomToCoverViewport,
  zoomAfterMinimumChange,
} from './ViewPane';

const RECTANGLE_BOX = { width: 1000, height: 600 };
const rectangle = [
  { x: -500, y: -300 },
  { x: 500, y: -300 },
  { x: 500, y: 300 },
  { x: -500, y: 300 },
];

/**
 * The outer limit is a rung on the global ladder at which the whole level box fits
 * inside the viewport. Asserting that contract directly — it fits, it is on the
 * ladder, and one rung closer would not fit — says what the camera promises, where
 * a hardcoded float only says what today's arithmetic happens to produce.
 */
const outerTierFits = (
  viewport: { width: number; height: number },
  box: { width: number; height: number },
  zoom: number,
): void => {
  expect(zoom).toBe(snapToTier(zoom));
  expect(box.width * zoom).toBeLessThanOrEqual(viewport.width + 1e-9);
  expect(box.height * zoom).toBeLessThanOrEqual(viewport.height + 1e-9);
  const closer = zoom * ZOOM_TIER_RATIO;
  expect(
    box.width * closer > viewport.width + 1e-9 || box.height * closer > viewport.height + 1e-9,
  ).toBe(true);
};

describe('ViewPane outer zoom tier', () => {
  it('maps screen-space pointer movement back into a scaled design canvas', () => {
    expect(clientDeltaToLocal(40, 1560, 1040)).toBeCloseTo(60);
    expect(clientDeltaToLocal(-25, 1920, 960)).toBeCloseTo(-50);
    expect(clientDeltaToLocal(12, 0, 0)).toBe(12);
  });

  it('is limited by the tighter viewport axis', () => {
    // 501x300 against a 1000x600 box: height is the binding axis, not width.
    const wide = { width: 501, height: 300 };
    outerTierFits(wide, RECTANGLE_BOX, minimumZoomToCoverViewport({
      viewport: wide, polygon: rectangle, minZoom: 0.4, maxZoom: 4,
    }));
    const square = { width: 600, height: 600 };
    outerTierFits(square, RECTANGLE_BOX, minimumZoomToCoverViewport({
      viewport: square, polygon: rectangle, minZoom: 0.4, maxZoom: 4,
    }));
  });

  it('scales with the viewport, quantised to the ladder', () => {
    const small = minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 }, polygon: rectangle, minZoom: 0.01, maxZoom: 4,
    });
    const large = minimumZoomToCoverViewport({
      viewport: { width: 2004, height: 1200 }, polygon: rectangle, minZoom: 0.01, maxZoom: 4,
    });
    // A 4x viewport buys about 4x the zoom, but both ends land on rungs, so the
    // ratio is 4x to within one step rather than exactly 4x.
    expect(large / small).toBeGreaterThan(4 / ZOOM_TIER_RATIO);
    expect(large / small).toBeLessThan(4 * ZOOM_TIER_RATIO);
  });

  // A press that never really moved is a click, and a viewport owner may claim the secondary
  // one for a non-destructive mode change. The threshold is what separates the two, so it has
  // to tolerate the tremor of an ordinary click without eating a deliberate short drag.
  it('separates a click from a pan by a tremor-sized movement threshold', () => {
    expect(exceedsViewPanePanThreshold(0, 0)).toBe(false);
    expect(exceedsViewPanePanThreshold(4, -4)).toBe(false);
    expect(exceedsViewPanePanThreshold(-4, 4)).toBe(false);
    expect(exceedsViewPanePanThreshold(5, 0)).toBe(true);
    expect(exceedsViewPanePanThreshold(0, -5)).toBe(true);
  });

  it('is independent of current pan', () => {
    const viewport = { width: 500, height: 300 };
    outerTierFits(viewport, RECTANGLE_BOX, minimumZoomToCoverViewport({
      viewport, polygon: rectangle, minZoom: 0.4, maxZoom: 4,
    }));
  });

  it('uses the complete accepted boundary rather than requiring an asymmetric scene to stay board-centered', () => {
    const asymmetricArt = [
      { x: -744, y: -451 },
      { x: 706, y: -451 },
      { x: 706, y: 365 },
      { x: -744, y: 365 },
    ];
    const viewport = { width: 275.375, height: 183.578125 };
    outerTierFits(viewport, { width: 1450, height: 816 }, minimumZoomToCoverViewport({
      viewport, polygon: asymmetricArt, minZoom: 0.2, maxZoom: 4,
    }));

    const reclamped = constrainPanToCoverViewport({
      viewport: { width: 275.375, height: 183.578125 },
      polygon: asymmetricArt,
      zoom: 0.23,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
    });
    expect(reclamped.x).toBeCloseTo(0, 5);
    expect(reclamped.y).toBeCloseTo(7.839, 3);
  });

  it('blocks pan at the transformed art boundary without changing zoom', () => {
    expect(constrainPanToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: rectangle,
      zoom: 1,
      from: { x: 0, y: 0 },
      to: { x: 1000, y: 0 },
    }).x).toBeCloseTo(300, 5);

    expect(constrainPanToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: rectangle,
      zoom: 1,
      from: { x: 0, y: 0 },
      to: { x: 120, y: 40 },
    })).toEqual({ x: 120, y: 40 });
  });

  it('reads the same box from either convex winding', () => {
    const viewport = { width: 400, height: 200 };
    const forward = minimumZoomToCoverViewport({
      viewport, polygon: rectangle, minZoom: 0.55, maxZoom: 1.45,
    });
    const reversed = minimumZoomToCoverViewport({
      viewport, polygon: [...rectangle].reverse(), minZoom: 0.55, maxZoom: 1.45,
    });
    expect(reversed).toBe(forward);
    outerTierFits(viewport, RECTANGLE_BOX, forward);
  });

  it('follows a temporary automatic clamp back down after the viewport settles', () => {
    const early = zoomAfterMinimumChange({
      zoom: 1,
      minimum: 2.6,
      automaticFloorZoom: null,
    });
    expect(early).toEqual({ zoom: 2.6, automaticFloorZoom: 2.6 });

    expect(zoomAfterMinimumChange({
      zoom: early.zoom,
      minimum: 0.84,
      automaticFloorZoom: early.automaticFloorZoom,
    })).toEqual({ zoom: 0.84, automaticFloorZoom: 0.84 });
  });

  it('does not lower a zoom the user moved away from the automatic floor', () => {
    expect(zoomAfterMinimumChange({
      zoom: 3,
      minimum: 0.84,
      automaticFloorZoom: 2.6,
    })).toEqual({ zoom: 3, automaticFloorZoom: null });
  });
});
