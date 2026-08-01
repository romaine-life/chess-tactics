import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_PLAGUED_ICON_PLACEHOLDER,
  RUN_CARD_PLAGUED_ICON_SLOT,
  runCardUnitStackSeatLeft,
} from './RunCardFace';
import {
  RUN_CARD_CONTENTS_STUDY_PROFILES,
  runCardContentsStudyFromSearch,
  runCardPrototypeContent,
  runCardPrototypeTargetRevealedFromSearch,
  runCardPrototypeVariantFromSearch,
  scaledRunCardContentsTuning,
} from './RunCardPrototype';

describe('Run Card Layout review variant', () => {
  it('addresses the Pestiferous review state in the URL', () => {
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=pestiferous')).toBe('pestiferous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=concinnous')).toBe('concinnous');
    expect(runCardPrototypeVariantFromSearch('?mode=viewer&cardVariant=unknown')).toBe('standard');
  });

  it('addresses Concinnous hidden and revealed purchase states without synthesized rules prose', () => {
    expect(runCardPrototypeTargetRevealedFromSearch('?cardVariant=concinnous')).toBe(false);
    expect(runCardPrototypeTargetRevealedFromSearch('?cardVariant=concinnous&concinnousTarget=revealed')).toBe(true);
    expect(runCardPrototypeContent('concinnous')).toMatchObject({
      name: "Banneret's Retinue",
      cost: 8,
      typeLine: 'Units — Concinnous',
      properties: [{ name: 'Positioned', target: 'Target hidden' }],
    });
    expect(runCardPrototypeContent('concinnous', true)).toMatchObject({
      properties: [{ name: 'Positioned', target: 'Knight' }],
    });
    expect(runCardPrototypeContent('concinnous')).not.toHaveProperty('rules');
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
      typeY: 0.65,
    });
  });

  it('addresses the Contents Box comparison without changing the ordinary default', () => {
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout&contentsStudy=1')).toBe(true);
    expect(runCardContentsStudyFromSearch('?mode=viewer&vk=cardlayout')).toBe(false);
  });

  it('shows progressively denser Contents Box specimens at the real card width', () => {
    expect(RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ id, load }) => ({ id, load }))).toEqual([
      { id: 'roomy', load: '1 cell · 1 row' },
      { id: 'filled', load: '2 cells · 2 rows' },
      { id: 'packed', load: '3 cells · 2 rows' },
      { id: 'scrunched', load: '5 cells · 3 rows' },
    ]);
    expect(RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ tuning }) => tuning.unitHeight)).toEqual([21, 12, 11.5, 8]);
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
