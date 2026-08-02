import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_FRAME_NATIVE_HEIGHT,
  RUN_CARD_FRAME_NATIVE_WIDTH,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  runCardFrameGeometryForSha,
  runCardFrameGeometryVariables,
} from './runCardFrameGeometry';

describe('Run card frame geometry', () => {
  it('preserves the approved Standard face percentages through native-pixel boxes', () => {
    expect(runCardFrameGeometryVariables(RUN_CARD_STANDARD_FRAME_GEOMETRY)).toMatchObject({
      '--run-card-title-left': '9.3000%',
      '--run-card-title-top': '5.8000%',
      // The cost box centers on the measured coin socket (932.5, 130.5)
      // shared by the standard, pestiferous, and tactical frames.
      '--run-card-cost-left': '82.4217%',
      '--run-card-cost-top': '5.2008%',
      '--run-card-art-top': '14.2000%',
      '--run-card-type-top': '58.2000%',
      '--run-card-contents-top': '65.2000%',
      '--run-card-contents-height': '28.7000%',
    });
  });

  it('binds Hieratic to the owner-selected steel frame and its measured lower panels', () => {
    for (const sha256 of RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.frameSha256s) {
      expect(runCardFrameGeometryForSha(sha256)).toBe(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY);
    }
    // Cutting the frame's painted backdrop to transparent moves no drawn pixel,
    // so the delivered bytes and the cut bytes share these measured boxes.
    expect(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.frameSha256s).toEqual([
      '7ae3b1945da8fefa46a264b696b0fc5695454c80c7256f879fd465a06a2d1152',
      'cdd9a3e017881f69c49c343f6cc9e721320f3681a1a3787b2a3166ec7ea26cdf',
    ]);
    expect(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.boxes.type.y).toBeGreaterThan(
      RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.type.y,
    );
    expect(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.boxes.contents.y).toBeGreaterThan(
      RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.contents.y,
    );
    const steelCost = RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.boxes.cost;
    expect(steelCost.x + steelCost.width / 2).toBeCloseTo(924.25, 2);
    expect(steelCost.y + steelCost.height / 2).toBeCloseTo(135.5, 2);
  });

  it('keeps every declared box inside the native source image', () => {
    for (const geometry of [RUN_CARD_STANDARD_FRAME_GEOMETRY, RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY]) {
      expect(Object.keys(geometry.boxes)).toEqual(RUN_CARD_FRAME_BOX_NAMES);
      for (const box of Object.values(geometry.boxes)) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(RUN_CARD_FRAME_NATIVE_WIDTH);
        expect(box.y + box.height).toBeLessThanOrEqual(RUN_CARD_FRAME_NATIVE_HEIGHT);
      }
    }
    expect(runCardFrameGeometryForSha(null)).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
    expect(runCardFrameGeometryForSha('f'.repeat(64))).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
  });
});
