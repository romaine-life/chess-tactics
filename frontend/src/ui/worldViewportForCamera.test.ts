import { describe, expect, it } from 'vitest';
import { cameraToContainBounds, worldViewportForCamera } from '@chess-tactics/board-render';

describe('worldViewportForCamera', () => {
  it('recovers the exact visible world rectangle from editor zoom and pan', () => {
    const viewport = { width: 1_120, height: 760 };
    const expected = { minX: -640, minY: -250, width: 1_280, height: 720 };
    const camera = cameraToContainBounds({ viewport, bounds: expected });

    const visible = worldViewportForCamera({ viewport, camera });

    expect(visible.minX).toBeCloseTo(expected.minX);
    expect(visible.minY).toBeCloseTo(-324.2857142857);
    expect(visible.width).toBeCloseTo(expected.width);
    expect(visible.height).toBeCloseTo(868.5714285714);
  });

  it('accounts for a manually panned editor camera in screen pixels', () => {
    expect(worldViewportForCamera({
      viewport: { width: 1_000, height: 600 },
      camera: { zoom: 2, pan: { x: -120, y: 80 } },
    })).toEqual({
      minX: -190,
      minY: -190,
      width: 500,
      height: 300,
    });
  });
});
