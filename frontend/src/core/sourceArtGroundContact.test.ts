import { describe, expect, it } from 'vitest';
import { sourceArtGroundContactCalibration } from './sourceArtGroundContact';

describe('source-art ground contact calibration', () => {
  it('locates a tree base from accepted alpha instead of using the 512px frame centre', () => {
    expect(sourceArtGroundContactCalibration('oak', 'south')).toEqual({
      anchorX: 278,
      anchorY: 362,
      groundFootprint: { w: 111, h: 41 },
    });
    expect(sourceArtGroundContactCalibration('oak', 'south')?.anchorY).toBeGreaterThan(256);
  });

  it('keeps the contact calibration specific to the rendered facing', () => {
    expect(sourceArtGroundContactCalibration('oak', 'north-west')).toEqual({
      anchorX: 223,
      anchorY: 355,
      groundFootprint: { w: 110, h: 41 },
    });
    expect(sourceArtGroundContactCalibration('unknown-source', 'south')).toBeUndefined();
  });
});
