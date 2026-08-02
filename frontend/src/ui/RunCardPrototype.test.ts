import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_CONTENTS_DENSITY_LADDER,
  RUN_CARD_PLAGUED_ICON_PLACEHOLDER,
  RUN_CARD_PLAGUED_ICON_SLOT,
  runCardContentsDensityStepForCard,
  runCardLedgerRows,
  runCardUnitStackSeatLeft,
  type RunCardFaceContent,
} from './RunCardFace';
import {
  RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
} from './runCardFrameGeometry';
import {
  RUN_CARD_CONTENTS_STUDY_PROFILES,
  runCardContentsStudyFromSearch,
  runCardPrototypeCostFromSearch,
  runCardPrototypeFrameBoxesFromSearch,
  runCardConcinnousTargetRevealedFromSearch,
  runCardPrototypeContent,
  runCardPrototypeVariantFromSearch,
  runCardTacticalSpecimenFromSearch,
  scaledRunCardContentsTuning,
} from './RunCardPrototype';

describe('Run Card Layout review variant', () => {
  it('addresses each affected-card review state in the URL', () => {
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=pestiferous')).toBe('pestiferous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=tactical')).toBe('tactical');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=concinnous')).toBe('concinnous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=unknown')).toBe('standard');
    expect(runCardTacticalSpecimenFromSearch('?cardVariant=tactical&tacticalSpecimen=multi')).toBe('multi');
    expect(runCardTacticalSpecimenFromSearch('?cardVariant=tactical')).toBe('single');
  });

  it('addresses Concinnous hidden and revealed purchase states without synthesized rules prose', () => {
    expect(runCardConcinnousTargetRevealedFromSearch('?cardVariant=concinnous')).toBe(false);
    expect(runCardConcinnousTargetRevealedFromSearch('?cardVariant=concinnous&concinnousTarget=revealed')).toBe(true);
    expect(runCardPrototypeContent('concinnous')).toMatchObject({
      name: 'Two Good Boots',
      cost: 4,
      typeLine: 'Units — Concinnous',
      grants: [{ count: 2, unit: 'pawn' }],
      properties: [{ name: 'Positioned', target: 'Target hidden' }],
    });
    expect(runCardPrototypeContent('concinnous', 'single', true)).toMatchObject({
      properties: [{ name: 'Positioned', target: 'Pawn 1' }],
    });
    expect(runCardPrototypeContent('concinnous')).not.toHaveProperty('rules');
  });

  it('shows Discipline only when one Tactical unit makes the random target certain', () => {
    expect(runCardPrototypeContent('tactical')).toMatchObject({
      name: 'Regal Serenity',
      cost: 12,
      typeLine: 'Units — Tactical',
      grants: [{ count: 1, unit: 'queen', ability: 'discipline' }],
    });
    expect(runCardPrototypeContent('tactical', 'multi')).toMatchObject({
      cost: 12,
      typeLine: 'Units — Tactical',
    });
    expect(runCardPrototypeContent('tactical', 'multi').grants.every((grant) => !grant.ability)).toBe(true);
  });

  it('uses the accepted affected-card type line without changing the card identity', () => {
    expect(runCardPrototypeContent('pestiferous')).toMatchObject({
      name: 'Parish Militia',
      cost: 8,
      typeLine: 'Units — Pestiferous',
    });
    expect(runCardPrototypeContent('pestiferous').grants).toContainEqual(
      expect.objectContaining({ unit: 'bishop', plaguedIndices: [0] }),
    );
    expect(runCardPrototypeContent('pestiferous')).not.toHaveProperty('rules');
    expect(runCardPrototypeContent('standard').typeLine).toBe('Units');
  });

  it('reserves a live icon slot without printing the Plagued name as its marker', () => {
    expect(RUN_CARD_PLAGUED_ICON_SLOT).toBe('ui/run/card-status/plagued-v1.png');
    expect(RUN_CARD_PLAGUED_ICON_PLACEHOLDER).toBe('◇');
    expect(RUN_CARD_PLAGUED_ICON_PLACEHOLDER).not.toMatch(/plagued/i);
  });

  it('places the status marker in the same stack seat as a second unit', () => {
    expect(runCardUnitStackSeatLeft(0, 2, 8, 0.8)).toBe('min(0.0000cqw, calc(0.0000% - 0.0000cqw))');
    expect(runCardUnitStackSeatLeft(1, 2, 8, 0.8)).toBe('min(8.8000cqw, calc(100.0000% - 8.0000cqw))');
  });

  it('shares one optically centered type-line tuning across ordinary and qualified cards', () => {
    expect(RUN_CARD_APPROVED_TUNING).toMatchObject({
      typeSize: 5.3,
      typeX: 1.35,
      typeY: 1.2,
    });
  });

  it('addresses the Contents Box comparison without changing the ordinary default', () => {
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout&contentsStudy=1')).toBe(true);
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout')).toBe(false);
  });

  it('addresses the measured frame-box overlay in the review URL', () => {
    expect(runCardPrototypeFrameBoxesFromSearch('?mode=viewer&frameBoxes=1')).toBe(true);
    expect(runCardPrototypeFrameBoxesFromSearch('?mode=viewer')).toBe(false);
  });

  it('addresses two-digit coin-cost previews without changing the actual default', () => {
    expect(runCardPrototypeCostFromSearch('?cardCost=10')).toBe(10);
    expect(runCardPrototypeCostFromSearch('?cardCost=11')).toBe(11);
    expect(runCardPrototypeCostFromSearch('?cardCost=12')).toBe(12);
    expect(runCardPrototypeCostFromSearch('?cardCost=13')).toBeNull();
    expect(runCardPrototypeCostFromSearch('')).toBeNull();
  });

  it('derives each live card face density step from its own cell load', () => {
    const cardWithGrants = (grants: RunCardFaceContent['grants']): RunCardFaceContent => ({
      name: 'Specimen',
      cost: 3,
      typeLine: 'Units',
      grants,
      flavor: 'The frost came in June. By August, the road had found him.',
    });
    expect(runCardLedgerRows(1)).toBe(1);
    expect(runCardLedgerRows(2)).toBe(2);
    expect(runCardLedgerRows(4)).toBe(2);
    expect(runCardLedgerRows(5)).toBe(3);
    expect(runCardContentsDensityStepForCard(cardWithGrants([{ count: 1, unit: 'pawn' }])).density).toBe('roomy');
    expect(runCardContentsDensityStepForCard(cardWithGrants([{ count: 2, unit: 'pawn' }])).density).toBe('roomy');
    expect(runCardContentsDensityStepForCard(cardWithGrants([
      { count: 1, unit: 'pawn' },
      { count: 1, unit: 'knight' },
    ])).density).toBe('filled');
    expect(runCardContentsDensityStepForCard(cardWithGrants([
      { count: 3, unit: 'pawn' },
      { count: 1, unit: 'knight' },
      { count: 1, unit: 'bishop' },
    ])).density).toBe('packed');
    expect(runCardContentsDensityStepForCard(cardWithGrants([
      { count: 3, unit: 'pawn' },
      { count: 1, unit: 'knight' },
      { count: 1, unit: 'bishop' },
      { count: 1, unit: 'rook' },
      { count: 1, unit: 'queen' },
    ])).density).toBe('scrunched');
  });

  it('steps a sparse card denser only when extras would overflow its actual Contents Box', () => {
    const concinnousPair: RunCardFaceContent = {
      name: 'Two Good Boots',
      cost: 4,
      typeLine: 'Units — Concinnous',
      grants: [{ count: 2, unit: 'pawn' }],
      properties: [{ name: 'Positioned', target: 'Target hidden' }],
      flavor: 'The road kept both pairs of boots, and returned neither name.',
    };
    expect(runCardContentsDensityStepForCard(
      concinnousPair,
      RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
    ).density).toBe('filled');
    expect(runCardContentsDensityStepForCard(
      { ...concinnousPair, typeLine: 'Units', properties: undefined },
      RUN_CARD_STANDARD_FRAME_GEOMETRY,
    ).density).toBe('roomy');
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
