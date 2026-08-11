import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_COIN_FACE_CQW,
  RUN_CARD_COIN_FACE_FILL,
  RUN_CARD_COST_LETTER_SPACING_CQW,
  RUN_CARD_NUMERAL_EM_ADVANCE,
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_FRAME_GEOMETRY_BY_VARIANT,
  RUN_CARD_FRAME_NATIVE_HEIGHT,
  RUN_CARD_FRAME_NATIVE_WIDTH,
  RUN_CARD_FRAME_SLOT_BY_VARIANT,
  RUN_CARD_FRAME_VARIANTS,
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY,
  RUN_CARD_RARE_FRAME_SLOT,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_SLOT_BY_RARITY,
  RUN_CARD_TEXT_PLACEMENT,
  RUN_CARD_UNCOMMON_FRAME_SLOT,
  runCardFrameGeometryForSlot,
  runCardFrameGeometryKnowsPixels,
  runCardFramePaintInsetRatios,
  runCardCostFaceShare,
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

  it('keeps the rarity triplet on the Standard frame geometry', () => {
    expect(RUN_CARD_STANDARD_FRAME_SLOT_BY_RARITY).toEqual({
      common: RUN_CARD_FRAME_SLOT_BY_VARIANT.standard,
      uncommon: RUN_CARD_UNCOMMON_FRAME_SLOT,
      rare: RUN_CARD_RARE_FRAME_SLOT,
    });
    expect(runCardFrameGeometryForSlot(RUN_CARD_UNCOMMON_FRAME_SLOT)).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
    expect(runCardFrameGeometryForSlot(RUN_CARD_RARE_FRAME_SLOT)).toBe(RUN_CARD_STANDARD_FRAME_GEOMETRY);
    expect(RUN_CARD_STANDARD_FRAME_GEOMETRY.frameSha256s).toContain('037ac0896d4a9307b27ff909197b1d769c04311a2deb59e5ae7d2041bce3e2b1');
    expect(RUN_CARD_STANDARD_FRAME_GEOMETRY.frameSha256s).toContain('a5ff21ff0c821f93bb78338401c663169ed7a08e295754ee00fefc8d359a4eca');
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
    // At the full face a one- and two-digit reading both fit at the approved size, so the size
    // is what holds them and only the three-digit readings are shrunk to fit at all.
    for (const cost of [1, 4, 9]) expect(runCardCostSizeCqw(cost, 6.2)).toBe(6.2);
    for (const cost of [10, 11, 12, 90]) expect(runCardCostSizeCqw(cost, 6.2)).toBe(6.2);
    for (const cost of [100, 160, 250]) expect(runCardCostSizeCqw(cost, 6.2)).toBe(5.38);
    expect(runCardCostSizeCqw(12, 4)).toBe(4);
  });

  it('shrinks a reading by what it needs, not by a step that grows with its length', () => {
    // A three-digit price is one digit wider than a two-digit one, so it may be somewhat
    // smaller. It may not be a THIRD smaller, which is what a second flat shrink in CSS
    // produced by winning at three digits while the cap won at two.
    const two = runCardCostSizeCqw(60, 6.2);
    const three = runCardCostSizeCqw(160, 6.2);
    expect(three).toBeLessThan(two);
    expect(three / two).toBeGreaterThan(.7);
  });

  it('measures the display face rather than assuming digits scale', () => {
    // Advance Wars 2 GBA is monospaced at this advance for every digit but "1", measured in
    // the font, so the widest reading of a length is that many advances.
    expect(RUN_CARD_NUMERAL_EM_ADVANCE).toBe(.4375);
    const inkCqw = (digits: number): number => {
      const size = runCardCostSizeCqw(Number('9'.repeat(digits)), 6.2);
      return RUN_CARD_NUMERAL_EM_ADVANCE * digits * size + RUN_CARD_COST_LETTER_SPACING_CQW * digits;
    };
    const face = RUN_CARD_COIN_FACE_CQW * RUN_CARD_COIN_FACE_FILL;
    // A reading the FIT is holding lands on the fill exactly, at every length — including the
    // four digits no card reaches, because the rule must not fall off the end of a table.
    for (const digits of [3, 4, 5]) expect(inkCqw(digits)).toBeCloseTo(face, 1);
    // A reading the approved SIZE is holding comes in under it. Two digits fit at full size now,
    // so the fill is a ceiling they never reach rather than a target they sit on.
    expect(runCardCostSizeCqw(99, 6.2)).toBe(6.2);
    expect(inkCqw(2)).toBeLessThan(face);
  });

  it('opens the fill as a knob, because how full the coin reads is a judgement', () => {
    // The Studio drives this. Raising it grows the readings the fit is holding, and a one-digit
    // reading does not move until the fill passes where the longer ones already touch the rim.
    expect(runCardCostSizeCqw(160, 6.2, .88)).toBeGreaterThan(runCardCostSizeCqw(160, 6.2, .72));
    expect(runCardCostSizeCqw(9, 6.2, .88)).toBe(runCardCostSizeCqw(9, 6.2, .72));
    // Omitted, it is what the cards ship at — a caller that does not tune gets the Run's own face.
    expect(runCardCostSizeCqw(160, 6.2)).toBe(runCardCostSizeCqw(160, 6.2, RUN_CARD_COIN_FACE_FILL));
  });

  it('reads a price for the digits it actually has, not the widest of its length', () => {
    // 999 is all-wide and held by the fit, so it lands on the fill exactly. 160 carries the
    // narrow "1" and comes in under its own cap; a readout assuming the widest would overstate it.
    expect(runCardCostFaceShare(999, 6.2)).toBeCloseTo(RUN_CARD_COIN_FACE_FILL, 2);
    expect(runCardCostFaceShare(160, 6.2)).toBeLessThan(runCardCostFaceShare(999, 6.2));
    expect(runCardCostFaceShare(160, 6.2)).toBeGreaterThan(.9);
    // Nothing the market can print may ink past the coin's own striking face.
    for (const cost of [10, 60, 90, 100, 160]) {
      expect(runCardCostFaceShare(cost, 6.2), String(cost)).toBeLessThanOrEqual(RUN_CARD_COIN_FACE_FILL);
    }
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
    // Each frame family answers to exactly the bytes its boxes were measured on;
    // Standard owns three rarity materials over the same locked geometry.
    expect(RUN_CARD_FRAME_GEOMETRY_BY_VARIANT.standard.frameSha256s).toHaveLength(3);
    expect(RUN_CARD_FRAME_GEOMETRY_BY_VARIANT.hieratic.frameSha256s).toHaveLength(1);
    expect(seen.size).toBe(RUN_CARD_FRAME_VARIANTS.length + 2);
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

  it('exposes the painted card keylines independently of transparent canvas', () => {
    for (const variant of RUN_CARD_FRAME_VARIANTS) {
      const geometry = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant];
      const { paintBounds } = geometry;
      expect(paintBounds.x).toBe(26);
      expect(paintBounds.x + paintBounds.width).toBe(1035);
      expect(paintBounds.y).toBe(variant === 'pestiferous' ? 43 : 42);
      expect(paintBounds.y + paintBounds.height).toBe(variant === 'pestiferous' ? 1445 : 1444);
      expect(runCardFramePaintInsetRatios(geometry)).toEqual({
        blockStart: paintBounds.y / RUN_CARD_FRAME_NATIVE_WIDTH,
        blockEnd: (RUN_CARD_FRAME_NATIVE_HEIGHT - paintBounds.y - paintBounds.height)
          / RUN_CARD_FRAME_NATIVE_WIDTH,
      });
    }
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
