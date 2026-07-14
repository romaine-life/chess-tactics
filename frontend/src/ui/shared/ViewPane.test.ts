import { describe, expect, it } from 'vitest';
import { minimumZoomToCoverViewport } from './ViewPane';

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

  it('accounts for screen-space pan when preserving full coverage', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 500, height: 300 },
      polygon: rectangle,
      pan: { x: 250, y: 0 },
      minZoom: 0.4,
      maxZoom: 4,
    })).toBe(1);
  });

  it('accepts either convex winding and honors the ordinary configured floor', () => {
    expect(minimumZoomToCoverViewport({
      viewport: { width: 400, height: 200 },
      polygon: [...rectangle].reverse(),
      minZoom: 0.55,
      maxZoom: 1.45,
    })).toBe(0.55);
  });
});
