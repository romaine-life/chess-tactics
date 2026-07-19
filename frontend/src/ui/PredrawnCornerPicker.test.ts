import { describe, expect, it } from 'vitest';
import { clampPredrawnGuide } from '../render/PredrawnBoardLayer';
import {
  predrawnGridStretchSummary,
  predrawnIdealGridSnap,
  predrawnSourcePointForClient,
} from './PredrawnCornerPicker';

describe('pre-drawn source corner picking', () => {
  it('maps a fitted display click into intrinsic source pixels', () => {
    expect(predrawnSourcePointForClient(
      { left: 100, top: 50, width: 814, height: 483 },
      { x: 507, y: 291.5 },
      { width: 1628, height: 966 },
    )).toEqual([814, 483]);
  });

  it('clamps clicks to the source image bounds', () => {
    expect(predrawnSourcePointForClient(
      { left: 100, top: 50, width: 814, height: 483 },
      { x: 20, y: 600 },
      { width: 1628, height: 966 },
    )).toEqual([0, 966]);
  });

  it('keeps stretched guides monotonic instead of allowing a folded board', () => {
    const guides = [0, 0.2, 0.4, 0.6, 0.8, 1];
    expect(clampPredrawnGuide(guides, 2, 0.9)).toBeLessThan(guides[3]);
    expect(clampPredrawnGuide(guides, 2, -1)).toBeGreaterThan(guides[1]);
    expect(clampPredrawnGuide(guides, 0, 0.5)).toBe(0);
  });

  it('reports the exact per-axis correction range from the fitted grid', () => {
    expect(predrawnGridStretchSummary(
      [0, 0.25, 0.6, 1],
      [0, 0.4, 1],
    )).toEqual({
      columnMinScale: 0.75,
      columnMaxScale: 1.2000000000000002,
      rowMinScale: 0.8,
      rowMaxScale: 1.2,
      maximumDeviationPercent: 25,
    });
  });

  it('snaps the selected dimensions to the exact accepted grid projection', () => {
    const snapped = predrawnIdealGridSnap({
      north: [896, 284],
      east: [1284, 416],
      south: [724, 736],
      west: [416, 554],
    }, { width: 2000, height: 1200 }, 6, 10);
    expect(snapped).toBeDefined();

    const north = snapped!.north!;
    const east = snapped!.east!;
    const west = snapped!.west!;
    const columnStep = [(east[0] - north[0]) / 6, (east[1] - north[1]) / 6];
    const rowStep = [(west[0] - north[0]) / 10, (west[1] - north[1]) / 10];
    expect(columnStep[1] / columnStep[0]).toBeCloseTo(27 / 48, 5);
    expect(rowStep[1] / -rowStep[0]).toBeCloseTo(27 / 48, 5);
    expect(columnStep[0]).toBeCloseTo(-rowStep[0], 3);
  });
});
