import { describe, expect, it } from 'vitest';
import { constrainPanToCoverViewport, minimumZoomToCoverViewport, zoomAfterMinimumChange } from './ViewPane';

const rectangle = [
  { x: -500, y: -300 },
  { x: 500, y: -300 },
  { x: 500, y: 300 },
  { x: -500, y: 300 },
];

describe('ViewPane viewport-cover zoom floor', () => {
  it('uses the limiting viewport axis and rounds upward to a safe two-decimal zoom', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 501, height: 300 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.51);

    expect(minimumZoomToCoverViewport({
      viewport: { width: 600, height: 600 },
      polygon: rectangle,
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(1);
  });

  it('keeps the zoom floor centered instead of raising it in response to pan', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 500, height: 300 },
      polygon: rectangle,
      pan: { x: 250, y: 0 },
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(0.5);
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
