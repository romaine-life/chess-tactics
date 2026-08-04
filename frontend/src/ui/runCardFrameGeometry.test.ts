import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_FRAME_GEOMETRY_BY_VARIANT,
  RUN_CARD_FRAME_NATIVE_HEIGHT,
  RUN_CARD_FRAME_NATIVE_WIDTH,
  RUN_CARD_FRAME_SLOT_BY_VARIANT,
  RUN_CARD_FRAME_VARIANTS,
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_TEXT_PLACEMENT,
  runCardFrameGeometryForSlot,
  runCardFrameGeometryKnowsPixels,
  runCardCostSizeCqw,
  runCardFrameGeometryVariables,
  runCardFrameGeometryWithBoxes,
  type RunCardFrameVariant,
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

  it('places the Standard boxes on the painted plates that frame draws', () => {
    expect(runCardFrameGeometryVariables(RUN_CARD_STANDARD_FRAME_GEOMETRY)).toMatchObject({
      // All four edges of the title and type boxes are the plate opening read
      // off the frame's pixels; the cost box is centered on the socket it draws.
      '--run-card-title-left': '8.8679%',
      '--run-card-title-top': '5.7951%',
      '--run-card-cost-left': '82.3745%',
      '--run-card-cost-top': '4.9582%',
      '--run-card-art-top': '13.9488%',
      '--run-card-type-top': '58.2210%',
      '--run-card-contents-top': '64.6226%',
      '--run-card-contents-height': '29.1779%',
    });
    const cost = RUN_CARD_STANDARD_FRAME_GEOMETRY.boxes.cost;
    expect(cost.x + cost.width / 2).toBeCloseTo(932, 2);
    expect(cost.y + cost.height / 2).toBeCloseTo(127, 2);
  });

  it('gives each frame the plate height its own art draws', () => {
    // The four painted frames sit at four different type-plate heights; that
    // spread is exactly what one shared box used to flatten (ADR-0359).
    const typeMid = (v: RunCardFrameVariant): number => {
      const box = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[v].boxes.type;
      return box.y + box.height / 2;
    };
    expect(typeMid('standard')).toBeCloseTo(898.5, 1);
    expect(typeMid('legatine')).toBeCloseTo(900, 1);
    expect(typeMid('pestiferous')).toBeCloseTo(907, 1);
    expect(typeMid('concinnous')).toBeCloseTo(901.5, 1);
    expect(typeMid('hieratic')).toBeCloseTo(918.4, 1);
    expect(typeMid('praecipuus')).toBeCloseTo(typeMid('hieratic'), 5);
    // Praecipuus deliberately reuses Hieratic's measured alpha mask; the other
    // five painted frames retain distinct plate heights.
    expect(new Set(RUN_CARD_FRAME_VARIANTS.map(typeMid)).size).toBe(RUN_CARD_FRAME_VARIANTS.length - 1);
  });

  it('pads text against each frame’s own opening, not one shared column', () => {
    // A thicker border means a plate that opens further in, and the shared inset
    // then puts the text further in with it instead of against the steel.
    const textLeft = (v: RunCardFrameVariant): number => (
      RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[v].boxes.type.x
      + RUN_CARD_TEXT_PLACEMENT.insetInline * RUN_CARD_FRAME_NATIVE_WIDTH / 100
    );
    expect(textLeft('standard')).toBeCloseTo(112.85, 1);
    expect(textLeft('hieratic')).toBeCloseTo(122.92, 1);
    expect(textLeft('hieratic')).toBeGreaterThan(textLeft('standard'));
  });

  it('sizes the cost reading to the coin face instead of letting it crowd the rim', () => {
    // A one-digit reading never reaches the cap, so the common card is untouched.
    for (const cost of [1, 4, 9]) expect(runCardCostSizeCqw(cost, 6.2)).toBe(6.2);
    // Two digits are measured as a pair — "1" is narrower than "0" — and shrink
    // only as far as it takes to sit inside the face.
    for (const cost of [10, 11, 12]) expect(runCardCostSizeCqw(cost, 6.2)).toBe(5.33);
    expect(runCardCostSizeCqw(12, 4)).toBe(4);
  });

  it('states the entire text-placement rule as two shared values', () => {
    expect(Object.keys(RUN_CARD_TEXT_PLACEMENT).sort()).toEqual(['inkCentreEm', 'insetInline']);
    expect(RUN_CARD_TEXT_PLACEMENT.insetInline).toBe(2.25);
    expect(RUN_CARD_TEXT_PLACEMENT.inkCentreEm).toBe(.0667);
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
    expect(steelCost.x + steelCost.width / 2).toBeCloseTo(926.89, 2);
    expect(steelCost.y + steelCost.height / 2).toBeCloseTo(132.39, 2);
  });

  it('gives Praecipuus a dedicated royal frame identity on the measured Hieratic mask', () => {
    expect(RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY.slot)
      .toBe('ui/run/card-prototypes/praecipuus-frame-v1.png');
    expect(RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY.boxes)
      .toEqual(RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.boxes);
    expect(RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY.frameSha256s)
      .toEqual(['93ee3e1497ae1a930ca9d8d0242fd8b1fd93cd30da01511662ef2c48ed9a062e']);
  });

  it('names every frame byte-identity its boxes were measured against', () => {
    const seen = new Set();
    for (const variant of RUN_CARD_FRAME_VARIANTS) {
      const geometry = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant];
      expect(geometry.frameSha256s.length).toBeGreaterThan(0);
      for (const sha of geometry.frameSha256s) {
        expect(sha).toMatch(/^[0-9a-f]{64}$/);
        seen.add(sha);
        expect(runCardFrameGeometryKnowsPixels(geometry, sha)).toBe(true);
      }
      expect(runCardFrameGeometryKnowsPixels(geometry, 'a'.repeat(64))).toBe(false);
      expect(runCardFrameGeometryKnowsPixels(geometry, null)).toBe(false);
    }
    // Each frame answers to exactly the bytes its boxes were measured on.

    expect(RUN_CARD_FRAME_GEOMETRY_BY_VARIANT.hieratic.frameSha256s).toHaveLength(1);
    expect(seen.size).toBe(RUN_CARD_FRAME_VARIANTS.length);
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
