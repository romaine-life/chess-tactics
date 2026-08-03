import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_CONTENTS_DENSITY_LADDER,
  RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS,
  RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT,
  requiredRunCardImageKinds,
  runCardCommittedIconTuning,
  runCardContentsDensityStepForCard,
  runCardLedgerRows,
  runCardUnitStackSeatLeft,
  type RunCardFaceContent,
} from './RunCardFace';
import {
  RUN_CARD_FRAME_GEOMETRY_BY_VARIANT,
  RUN_CARD_FRAME_VARIANTS,
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_TEXT_PLACEMENT,
} from './runCardFrameGeometry';
import {
  committedRunCardFrameBoxDrafts,
  runCardFrameBoxDraftsAreTuned,
  runCardFrameBoxDraftsWithEdge,
  RUN_CARD_CONTENTS_STUDY_PROFILES,
  runCardContentsStudyFromSearch,
  runCardPrototypeCostFromSearch,
  runCardFrameBoxStyleFromSearch,
  runCardConcinnousTargetRevealedFromSearch,
  runCardPrototypeContent,
  runCardPrototypeVariantFromSearch,
  runCardTacticalSpecimenFromSearch,
  scaledRunCardContentsTuning,
} from './RunCardPrototype';
import { runCardFaceContent, runCardSpecimen } from './runCardFaceContent';
import type { PurchasablePieceType } from '../run/model';

describe('Run Card Layout review variant', () => {
  it('addresses each affected-card review state in the URL', () => {
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=pestiferous')).toBe('pestiferous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=tactical')).toBe('tactical');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=concinnous')).toBe('concinnous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=unknown')).toBe('standard');
    expect(runCardTacticalSpecimenFromSearch('?cardVariant=tactical&tacticalSpecimen=multi')).toBe('multi');
    expect(runCardTacticalSpecimenFromSearch('?cardVariant=tactical')).toBe('single');
  });

  it('addresses hidden and revealed purchase states without synthesized prose', () => {
    expect(runCardConcinnousTargetRevealedFromSearch('?cardVariant=concinnous')).toBe(false);
    expect(runCardConcinnousTargetRevealedFromSearch('?cardVariant=concinnous&concinnousTarget=revealed')).toBe(true);
    expect(runCardPrototypeContent('concinnous')).toMatchObject({
      name: 'Two Good Boots',
      cost: 4,
      typeLine: 'Units',
      cardProperty: { id: 'concinnous', name: 'Concinnous' },
      grants: [{ count: 2, unit: 'pawn' }],
    });
    // A hidden target draws nothing; acquisition marks the unit that actually got it.
    expect(runCardPrototypeContent('concinnous').grants.every((grant) => !grant.ability)).toBe(true);
    expect(runCardPrototypeContent('concinnous', 'single', true).grants).toContainEqual(
      expect.objectContaining({ ability: { state: 'positioned', index: 0 } }),
    );
    expect(runCardPrototypeContent('concinnous')).not.toHaveProperty('rules');
    expect(runCardPrototypeContent('concinnous')).not.toHaveProperty('properties');
  });

  it('shows Discipline only when one Tactical unit makes the random target certain', () => {
    expect(runCardPrototypeContent('tactical')).toMatchObject({
      name: 'Regal Serenity',
      cost: 12,
      typeLine: 'Units',
      cardProperty: { id: 'tactical', name: 'Tactical' },
      grants: [{ count: 1, unit: 'queen', ability: { state: 'discipline', index: 0 } }],
    });
    expect(runCardPrototypeContent('tactical', 'multi')).toMatchObject({
      cost: 12,
      typeLine: 'Units',
      cardProperty: { id: 'tactical' },
    });
    expect(runCardPrototypeContent('tactical', 'multi').grants.every((grant) => !grant.ability)).toBe(true);
  });

  it('gives Hieratic exactly the Tactical treatment: a symbol, and no sentence in place of a hidden target', () => {
    const hidden = runCardPrototypeContent('hieratic');
    expect(hidden).toMatchObject({ typeLine: 'Units', cardProperty: { id: 'hieratic', name: 'Hieratic' } });
    expect(hidden.grants.every((grant) => !grant.ability)).toBe(true);
    expect(hidden).not.toHaveProperty('properties');
    // Agminate is named in the property tooltip's authored effect, which ADR-0339 keeps.
    // What is gone is any sentence printed into the card body in place of a hidden target.
    expect(JSON.stringify(hidden)).not.toContain('Chosen on purchase');
    expect(hidden.flavor).not.toContain('Agminate');
    expect(hidden.name).not.toContain('Agminate');
    // Acquisition reveals it the same way every other drawn target is revealed.
    const revealed = runCardPrototypeContent('hieratic', 'single', true);
    expect(revealed.grants.some((grant) => grant.ability?.state === 'marshalled')).toBe(true);
  });

  it('keeps the primary type line and carries the qualifier as a symbol', () => {
    expect(runCardPrototypeContent('pestiferous')).toMatchObject({
      name: 'Parish Militia',
      cost: 8,
      typeLine: 'Units',
      cardProperty: { id: 'pestiferous', name: 'Pestiferous' },
    });
    expect(runCardPrototypeContent('pestiferous').grants).toContainEqual(
      expect.objectContaining({ unit: 'bishop', plaguedIndices: [0] }),
    );
    expect(runCardPrototypeContent('pestiferous')).not.toHaveProperty('rules');
    expect(runCardPrototypeContent('standard').typeLine).toBe('Units');
    expect(runCardPrototypeContent('standard')).not.toHaveProperty('cardProperty');
    // No affected card spells its qualifier out after an em dash any more (ADR-0339).
    for (const variant of ['standard', 'pestiferous', 'tactical', 'concinnous', 'hieratic'] as const) {
      expect(runCardPrototypeContent(variant).typeLine).toBe('Units');
    }
  });

  it('owes every declared property and unit-state icon before a face may promote', () => {
    const tactical = runCardPrototypeContent('tactical');
    expect(requiredRunCardImageKinds(tactical)).toContain('property-icon');
    expect(requiredRunCardImageKinds(tactical)).toContain('unit-state:discipline');
    expect(requiredRunCardImageKinds(runCardPrototypeContent('pestiferous'))).toContain('unit-state:plagued');
    expect(requiredRunCardImageKinds(runCardPrototypeContent('standard'))).not.toContain('property-icon');
  });

  it('fits each property in its own committed seat and shares one unit-state seat', () => {
    expect(RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS.tactical).toEqual({ x: -4, y: -0.95, scale: 2.75 });
    expect(RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT).toEqual({ x: 2.2, y: -0.95, scale: 5 });
    expect(runCardCommittedIconTuning('hieratic')).toEqual({
      property: RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS.hieratic,
      unitState: RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT,
    });
    expect(runCardCommittedIconTuning().property).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('places the status marker in the same stack seat as a second unit', () => {
    expect(runCardUnitStackSeatLeft(0, 2, 8, 0.8)).toBe('min(0.0000cqw, calc(0.0000% - 0.0000cqw))');
    expect(runCardUnitStackSeatLeft(1, 2, 8, 0.8)).toBe('min(8.8000cqw, calc(100.0000% - 8.0000cqw))');
  });

  it('lets a host choose text size and the two shared placement values, never a position', () => {
    expect(Object.keys(RUN_CARD_APPROVED_TUNING).sort()).toEqual([
      'costSize', 'flavorSize', 'textInkCentre', 'textInset', 'titleSize', 'typeSize',
    ]);
    expect(RUN_CARD_APPROVED_TUNING.typeSize).toBe(5.3);
    expect(RUN_CARD_APPROVED_TUNING.textInset).toBe(RUN_CARD_TEXT_PLACEMENT.insetInline);
    expect(RUN_CARD_APPROVED_TUNING.textInkCentre).toBe(RUN_CARD_TEXT_PLACEMENT.inkCentreEm);
  });

  it('hands the owner one draft per frame, seeded from what is committed', () => {
    const drafts = committedRunCardFrameBoxDrafts();
    expect(Object.keys(drafts).sort()).toEqual([...RUN_CARD_FRAME_VARIANTS].sort());
    expect(drafts.pestiferous.type).toEqual(RUN_CARD_FRAME_GEOMETRY_BY_VARIANT.pestiferous.boxes.type);
    expect(runCardFrameBoxDraftsAreTuned(drafts)).toBe(false);

    const moved = runCardFrameBoxDraftsWithEdge(drafts, 'pestiferous', 'type', 'y', 888.25);
    expect(moved.pestiferous.type.y).toBe(888.25);
    expect(runCardFrameBoxDraftsAreTuned(moved)).toBe(true);
    // One frame's by-eye pass never disturbs another frame's boxes.
    expect(moved.standard).toEqual(drafts.standard);
    expect(moved.pestiferous.title).toEqual(drafts.pestiferous.title);
  });

  it('addresses the Contents Box comparison without changing the ordinary default', () => {
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout&contentsStudy=1')).toBe(true);
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout')).toBe(false);
  });

  it('addresses each frame-box line style, so an alignment pass can see the plate', () => {
    expect(runCardFrameBoxStyleFromSearch('?mode=viewer&frameBoxes=1')).toBe('solid');
    expect(runCardFrameBoxStyleFromSearch('?mode=viewer&frameBoxes=solid')).toBe('solid');
    expect(runCardFrameBoxStyleFromSearch('?mode=viewer&frameBoxes=dotted')).toBe('dotted');
    expect(runCardFrameBoxStyleFromSearch('?mode=viewer&frameBoxes=nonsense')).toBe('off');
    expect(runCardFrameBoxStyleFromSearch('?mode=viewer')).toBe('off');
  });

  it('addresses two-digit coin-cost previews without changing the actual default', () => {
    expect(runCardPrototypeCostFromSearch('?cardCost=10')).toBe(10);
    expect(runCardPrototypeCostFromSearch('?cardCost=11')).toBe(11);
    expect(runCardPrototypeCostFromSearch('?cardCost=12')).toBe(12);
    expect(runCardPrototypeCostFromSearch('?cardCost=13')).toBeNull();
    expect(runCardPrototypeCostFromSearch('')).toBeNull();
  });

  // Density specimens are projected cards, not fabricated faces: a load the estimator is
  // asked about is always a load a real card could present.
  const cardWithPieces = (...pieces: PurchasablePieceType[]): RunCardFaceContent => (
    runCardFaceContent(runCardSpecimen({ pieces }))
  );

  it('derives each live card face density step from its own cell load', () => {
    expect(runCardLedgerRows(1)).toBe(1);
    expect(runCardLedgerRows(2)).toBe(2);
    expect(runCardLedgerRows(4)).toBe(2);
    expect(runCardLedgerRows(5)).toBe(3);
    expect(runCardContentsDensityStepForCard(cardWithPieces('pawn')).density).toBe('roomy');
    expect(runCardContentsDensityStepForCard(cardWithPieces('pawn', 'pawn')).density).toBe('roomy');
    expect(runCardContentsDensityStepForCard(cardWithPieces('pawn', 'knight')).density).toBe('filled');
    expect(runCardContentsDensityStepForCard(cardWithPieces('pawn', 'pawn', 'pawn', 'knight', 'bishop')).density).toBe('packed');
    expect(runCardContentsDensityStepForCard(cardWithPieces('pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen')).density).toBe('scrunched');
  });

  it('grows flavor into leftover Contents room without changing the chosen step', () => {
    const roomy = runCardContentsDensityStepForCard(cardWithPieces('pawn'));
    expect(roomy.density).toBe('roomy');
    expect(roomy.tuning.flavorScale).toBe(1.3);
    // Standard's measured panel leaves a little room under a two-cell stack, so
    // the flavor grows into it — the step it grew inside is still Filled.
    const filled = runCardContentsDensityStepForCard(cardWithPieces('pawn', 'knight'));
    expect(filled.density).toBe('filled');
    expect(filled.tuning.flavorScale).toBe(1.05);
    expect(RUN_CARD_CONTENTS_DENSITY_LADDER[1].tuning.flavorScale).toBe(1);
    const packed = runCardContentsDensityStepForCard(cardWithPieces('pawn', 'pawn', 'pawn', 'knight', 'bishop'));
    expect(packed.density).toBe('packed');
    expect(packed.tuning.flavorScale).toBe(1.15);
    const scrunched = runCardContentsDensityStepForCard(cardWithPieces('pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen'));
    expect(scrunched.density).toBe('scrunched');
    // A 5-cell load is above the deck's 9-gold ceiling, so this composition has no
    // authored banner flavor and falls back to its short prose label — which leaves it
    // more room to grow into than the reviewed cards above.
    expect(scrunched.tuning.flavorScale).toBe(1.26);
    // Growth derives copies; the reviewed ladder itself is never rewritten.
    expect(RUN_CARD_CONTENTS_DENSITY_LADDER[0].tuning.flavorScale).toBe(1);
    expect(RUN_CARD_CONTENTS_DENSITY_LADDER[3].tuning.flavorScale).toBe(.96);
  });

  it('steps a sparse card denser only when extras would overflow its actual Contents Box', () => {
    // Same card, two frames. The steel Hieratic plate has the tighter Contents Box, so
    // a two-cell load that sits Filled on the standard frame must step denser there.
    const twoCell = runCardFaceContent(runCardSpecimen({ pieces: ['pawn', 'knight'] }));
    expect(runCardContentsDensityStepForCard(
      twoCell,
      RUN_CARD_STANDARD_FRAME_GEOMETRY,
    ).density).toBe('filled');
    expect(runCardContentsDensityStepForCard(
      twoCell,
      RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
    ).density).toBe('scrunched');
    // A one-cell card fits its anchor step on either frame and is never stepped denser.
    const oneCell = runCardFaceContent(runCardSpecimen({ pieces: ['pawn', 'pawn'] }));
    expect(runCardContentsDensityStepForCard(oneCell, RUN_CARD_STANDARD_FRAME_GEOMETRY).density).toBe('roomy');
    expect(runCardContentsDensityStepForCard(oneCell, RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY).density).toBe('roomy');
  });

  it('shows progressively denser Contents Box specimens at the real card width', () => {
    expect(RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ id, load }) => ({ id, load }))).toEqual([
      { id: 'roomy', load: '1 cell · 1 row' },
      { id: 'filled', load: '2 cells · 2 rows' },
      { id: 'packed', load: '3 cells · 2 rows' },
      { id: 'scrunched', load: '5 cells · 3 rows' },
    ]);
    expect(RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ tuning }) => tuning.unitHeight)).toEqual([21, 12, 11.5, 8]);
    // The study renders the same ladder objects the live face derives from.
    RUN_CARD_CONTENTS_STUDY_PROFILES.forEach((profile, index) => {
      expect(profile.id).toBe(RUN_CARD_CONTENTS_DENSITY_LADDER[index].density);
      expect(profile.tuning).toBe(RUN_CARD_CONTENTS_DENSITY_LADDER[index].tuning);
    });
  });

  it('lets the owner magnify every part of a density treatment together', () => {
    const roomy = RUN_CARD_CONTENTS_STUDY_PROFILES[0].tuning;
    expect(scaledRunCardContentsTuning(roomy, 1.2)).toMatchObject({
      unitHeight: 25.2,
      countSize: 9.6,
      flavorScale: 1.2,
    });
  });
});
