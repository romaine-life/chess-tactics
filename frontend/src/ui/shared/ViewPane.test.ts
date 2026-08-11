import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZOOM_TIER_RATIO, snapToTier, zoomTierRange } from '../../game/zoomTiers';
import {
  boardZoomFloor,
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
 * The safety floor is a rung on the global ladder at which the viewport is still entirely
 * INSIDE the boundary. Asserting that contract directly — it is covered, it is on the
 * ladder, and one rung further out would not be — says what the camera promises, where a
 * hardcoded float only says what today's arithmetic happens to produce.
 *
 * The direction matters and is the whole defect this guards: a rung chosen so the boundary
 * fits inside the VIEWPORT guarantees a margin of unpainted world around it.
 */
const coverTierHolds = (
  viewport: { width: number; height: number },
  box: { width: number; height: number },
  zoom: number,
): void => {
  expect(zoom).toBe(snapToTier(zoom));
  expect(viewport.width / zoom).toBeLessThanOrEqual(box.width + 1e-9);
  expect(viewport.height / zoom).toBeLessThanOrEqual(box.height + 1e-9);
  const further = zoom / ZOOM_TIER_RATIO;
  expect(
    viewport.width / further > box.width + 1e-9 || viewport.height / further > box.height + 1e-9,
  ).toBe(true);
};

describe('ViewPane cover zoom floor', () => {
  it('maps screen-space pointer movement back into a scaled design canvas', () => {
    expect(clientDeltaToLocal(40, 1560, 1040)).toBeCloseTo(60);
    expect(clientDeltaToLocal(-25, 1920, 960)).toBeCloseTo(-50);
    expect(clientDeltaToLocal(12, 0, 0)).toBe(12);
  });

  it('is limited by the tighter viewport axis', () => {
    // 501x300 against a 1000x600 box: width is the binding axis for coverage, not height.
    const wide = { width: 501, height: 300 };
    coverTierHolds(wide, RECTANGLE_BOX, minimumZoomToCoverViewport({
      viewport: wide, polygon: rectangle, minZoom: 0.4, maxZoom: 4,
    }));
    const square = { width: 600, height: 600 };
    coverTierHolds(square, RECTANGLE_BOX, minimumZoomToCoverViewport({
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
    coverTierHolds(viewport, RECTANGLE_BOX, minimumZoomToCoverViewport({
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
    coverTierHolds(viewport, { width: 1450, height: 816 }, minimumZoomToCoverViewport({
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
    coverTierHolds(viewport, RECTANGLE_BOX, forward);
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

/**
 * The floor obeys two limits at once and they pull opposite ways, so composing them is its
 * own contract rather than a consequence of either half. Every one of these was reachable
 * from a floor that answered only one question.
 */
describe('board zoom floor composition', () => {
  // The regression the owner caught: coverage was enforced on the whole WINDOW, so the camera
  // bought coverage for the strips under the opaque title bar and Controls rail and paid for
  // it out of the pixels a player can see. The rail is on the right, which is where the board
  // was being cut. The board's own allocation is the region that is actually visible.
  it('measures the visible region from the board allocation, not the window', () => {
    const source = readFileSync(new URL('./ViewPane.tsx', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export function coverageViewportForStage'));
    const fn = body.slice(0, body.indexOf('\n}') + 2);
    expect(fn).toContain('data-shell-viewport-primary');
    // Preferred OVER the clipping ancestor, which is the window and includes the strips
    // under the opaque title bar and Controls rail.
    expect(fn.indexOf('data-shell-viewport-primary')).toBeLessThan(fn.indexOf('overflowX'));
  });

  // Zooming out ends with the WHOLE box visible. Requiring the viewport to fit INSIDE it
  // instead drove the camera in until a screen of one aspect fitted a painting of another —
  // zero zoom-out range at almost every window size, and a cropped board on a wide-short one.
  it('ends zoom-out with the whole box visible, not with the viewport inside it', () => {
    const viewport = { width: 2400, height: 1100 };
    const floor = boardZoomFloor({
      viewport, coverPolygon: rectangle, containBox: RECTANGLE_BOX, minZoom: 0.05, maxZoom: 16,
    });
    expect(floor).toBe(snapToTier(floor));
    expect(RECTANGLE_BOX.width * floor).toBeLessThanOrEqual(viewport.width + 1e-9);
    expect(RECTANGLE_BOX.height * floor).toBeLessThanOrEqual(viewport.height + 1e-9);
    const closer = floor * ZOOM_TIER_RATIO;
    expect(
      RECTANGLE_BOX.width * closer > viewport.width
      || RECTANGLE_BOX.height * closer > viewport.height,
    ).toBe(true);
    // And it is genuinely wider than the containment answer, which is the range that came back.
    expect(floor).toBeLessThan(minimumZoomToCoverViewport({
      viewport, polygon: rectangle, minZoom: 0.05, maxZoom: 16,
    }));
  });

  it('still stops zooming out when coverage is unconditional and no boundary is stated', () => {
    const viewport = { width: 2400, height: 1100 };
    const floor = boardZoomFloor({
      viewport, coverPolygon: undefined, containBox: RECTANGLE_BOX, minZoom: 0.05, maxZoom: 16,
    });
    // A viewport-locked backdrop paints wherever the camera goes, so nothing is uncovered —
    // but a camera that can retreat forever is still useless, so the level box binds.
    expect(RECTANGLE_BOX.width * floor).toBeLessThanOrEqual(viewport.width + 1e-9);
    expect(RECTANGLE_BOX.height * floor).toBeLessThanOrEqual(viewport.height + 1e-9);
    const closer = floor * ZOOM_TIER_RATIO;
    expect(
      RECTANGLE_BOX.width * closer > viewport.width
      || RECTANGLE_BOX.height * closer > viewport.height,
    ).toBe(true);
  });

  // The regression that made a boundary-governed camera stop short of its own boundary:
  // the level box is the snap default, sized around the playable surface and smaller than
  // what a level paints, so consulting it as well held the camera in tighter than the
  // boundary the Level Editor draws. A stated boundary is the answer, not one of two.
  it('measures the box from a stated boundary, ignoring a level box that disagrees', () => {
    const viewport = { width: 2000, height: 1214 };
    // A boundary wider than the level box, exactly as accepted art is wider than the default.
    const artBoundary = [
      { x: -725, y: -408 }, { x: 725, y: -408 }, { x: 725, y: 408 }, { x: -725, y: 408 },
    ];
    const smallerLevelBox = { width: 1152, height: 648 };
    const withBox = boardZoomFloor({
      viewport, coverPolygon: artBoundary, containBox: smallerLevelBox, minZoom: 0.05, maxZoom: 16,
    });
    const boundaryOnly = boardZoomFloor({
      viewport, coverPolygon: artBoundary, minZoom: 0.05, maxZoom: 16,
    });
    expect(withBox).toBe(boundaryOnly);
    // The smaller level box would have answered a tighter zoom; the boundary is what counts.
    expect(boardZoomFloor({
      viewport, containBox: smallerLevelBox, minZoom: 0.05, maxZoom: 16,
    })).toBeGreaterThan(boundaryOnly);
  });
});
