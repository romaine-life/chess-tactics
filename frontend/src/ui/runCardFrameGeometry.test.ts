import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
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

  it('binds Concinnous to the preferred generated steel frame and its measured lower panels', () => {
    expect(runCardFrameGeometryForSha(RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.frameSha256)).toBe(
      RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
    );
    expect(RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.frameSha256).toBe(
      '0069be656caaebd00c0dd47e7e7a21d5c4f8978d170ecea1cbd11647767e75f3',
    );
    expect(RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.boxes.type.y).toBeGreaterThan(
      RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.type.y,
    );
    expect(RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.boxes.contents.y).toBeGreaterThan(
      RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.contents.y,
    );
    const steelCost = RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.boxes.cost;
    expect(steelCost.x + steelCost.width / 2).toBeCloseTo(924.25, 2);
    expect(steelCost.y + steelCost.height / 2).toBeCloseTo(135.5, 2);
  });

  it('keeps every declared box inside the native source image', () => {
    for (const geometry of [RUN_CARD_STANDARD_FRAME_GEOMETRY, RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY]) {
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
