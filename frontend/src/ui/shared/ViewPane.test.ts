import { describe, expect, it } from 'vitest';
import {
  clientDeltaToLocal,
  constrainPanToCoverViewport,
  exceedsViewPanePanThreshold,
  minimumZoomToCoverViewport,
  zoomAfterMinimumChange,
} from './ViewPane';

const rectangle = [
  { x: -500, y: -300 },
  { x: 500, y: -300 },
  { x: 500, y: 300 },
  { x: -500, y: 300 },
];

describe('ViewPane viewport-cover zoom floor', () => {
  it('maps screen-space pointer movement back into a scaled design canvas', () => {
    expect(clientDeltaToLocal(40, 1560, 1040)).toBeCloseTo(60);
    expect(clientDeltaToLocal(-25, 1920, 960)).toBeCloseTo(-50);
    expect(clientDeltaToLocal(12, 0, 0)).toBe(12);
  });

  it('uses the limiting viewport axis and rounds upward only at safety precision', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.501);

    expect(minimumZoomToCoverViewport({
      viewport: { width: 600, height: 600 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(1);
  });

  it('keeps the accepted-art floor proportional across differently sized matching viewports', () => {
    const small = minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 },
      polygon: rectangle,
      minZoom: 0.01,
      maxZoom: 4,
    });
    const large = minimumZoomToCoverViewport({
      viewport: { width: 2004, height: 1200 },
      polygon: rectangle,
      minZoom: 0.01,
      maxZoom: 4,
    });
    expect(large).toBe(small * 4);
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

  it('keeps the zoom floor independent of current pan', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 500, height: 300 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.5);
  });

  it('uses the complete accepted boundary rather than requiring an asymmetric scene to stay board-centered', () => {
    const asymmetricArt = [
      { x: -744, y: -451 },
      { x: 706, y: -451 },
      { x: 706, y: 365 },
      { x: -744, y: 365 },
    ];
    expect(minimumZoomToCoverViewport({
      viewport: { width: 275.375, height: 183.578125 },
      polygon: asymmetricArt,
      minZoom: 0.2,
      maxZoom: 4,
    })).toBe(0.224974);

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

  it('accepts either convex winding and honors the ordinary configured floor', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: [...rectangle].reverse(),
      minZoom: 0.55,
      maxZoom: 1.45,
    })).toBe(0.55);
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
