import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_FRAME_GEOMETRY_BY_VARIANT,
  RUN_CARD_FRAME_NATIVE_HEIGHT,
  RUN_CARD_FRAME_NATIVE_WIDTH,
  RUN_CARD_FRAME_SLOT_BY_VARIANT,
  RUN_CARD_FRAME_VARIANTS,
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_TEXT_PLACEMENT,
  runCardFrameGeometryForSlot,
  runCardFrameGeometryMatchesPixels,
  runCardFrameGeometryVariables,
  runCardFrameGeometryWithBoxes,
} from './runCardFrameGeometry';

describe('Run card frame geometry', () => {
  it('gives every frame its own boxes, addressed by the slot it is served from', () => {
    for (const variant of RUN_CARD_FRAME_VARIANTS) {
      const geometry = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant];
      expect(geometry.variant).toBe(variant);
      expect(geometry.slot).toBe(RUN_CARD_FRAME_SLOT_BY_VARIANT[variant]);
      expect(runCardFrameGeometryForSlot(geometry.slot)).toBe(geometry);
    }
    // A re-generated frame keeps its own boxes instead of inheriting Standard's.
    expect(new Set(RUN_CARD_FRAME_VARIANTS.map((v) => RUN_CARD_FRAME_SLOT_BY_VARIANT[v])).size)
      .toBe(RUN_CARD_FRAME_VARIANTS.length);
  });

  it('preserves the approved Standard face pixels through boxes alone', () => {
    expect(runCardFrameGeometryVariables(RUN_CARD_STANDARD_FRAME_GEOMETRY)).toMatchObject({
      '--run-card-title-left': '9.3000%',
      '--run-card-title-top': '5.8000%',
      // The cost box centers on the measured coin socket (932.5, 130.5)
      // shared by the standard, pestiferous, and tactical frames.
      '--run-card-cost-left': '82.4217%',
      '--run-card-cost-top': '5.2008%',
      '--run-card-art-top': '14.2000%',
      // 58.2% plus the 1.2cqw type offset the face used to add on top of every
      // frame: the box now holds the whole vertical answer (ADR-0346).
      '--run-card-type-top': '59.0571%',
      '--run-card-contents-top': '65.2000%',
      '--run-card-contents-height': '28.7000%',
    });
  });

  it('states the entire text-placement rule as two shared values', () => {
    expect(Object.keys(RUN_CARD_TEXT_PLACEMENT).sort()).toEqual(['insetInline', 'opticalBlock']);
    expect(RUN_CARD_TEXT_PLACEMENT.insetInline).toBe(1.35);
    expect(RUN_CARD_TEXT_PLACEMENT.opticalBlock).toBe(0);
  });

  it('binds Hieratic to the forged-steel frame and its lower panels', () => {
    expect(runCardFrameGeometryForSlot(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.slot)).toBe(
      RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
    );
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

  it('reports boxes as unmeasured until they are tuned against the served pixels', () => {
    for (const variant of RUN_CARD_FRAME_VARIANTS) {
      const geometry = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant];
      expect(runCardFrameGeometryMatchesPixels(geometry, 'a'.repeat(64))).toBe(
        geometry.measuredSha256 === 'a'.repeat(64),
      );
      expect(runCardFrameGeometryMatchesPixels(geometry, null)).toBe(false);
    }
  });

  it('keeps every declared box inside the native source image', () => {
    for (const variant of RUN_CARD_FRAME_VARIANTS) {
      const geometry = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant];
      expect(Object.keys(geometry.boxes)).toEqual(RUN_CARD_FRAME_BOX_NAMES);
      for (const box of Object.values(geometry.boxes)) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(RUN_CARD_FRAME_NATIVE_WIDTH);
        expect(box.y + box.height).toBeLessThanOrEqual(RUN_CARD_FRAME_NATIVE_HEIGHT);
      }
    }
    expect(runCardFrameGeometryForSlot(null)).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
    expect(runCardFrameGeometryForSlot('ui/run/card-prototypes/not-a-frame.png'))
      .toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
  });

  it('carries owner-tuned boxes on the same frame identity', () => {
    const tuned = runCardFrameGeometryWithBoxes(RUN_CARD_STANDARD_FRAME_GEOMETRY, {
      ...RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes,
      type: { ...RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.type, y: 900 },
    });
    expect(tuned.id).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY.id);
    expect(tuned.slot).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY.slot);
    expect(tuned.boxes.type.y).toBe(900);
    expect(RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.type.y).not.toBe(900);
  });
});
