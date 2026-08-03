import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID, createRunCardOffer } from '../run/model';
import { concinnousTargetLabel } from './RunCard';
import { runCardFaceContent, runCardGrants } from './runCardFaceContent';

const offerOf = (
  cardId: string,
  seed: number,
  slotIndex: number,
  pestiferous: number,
  concinnous: number,
  tactical: number,
  hieratic = 8,
) => createRunCardOffer(
  { seed, ataraxiaTier: 0 },
  RUN_CARD_BY_ID[cardId],
  0,
  slotIndex,
  pestiferous,
  concinnous,
  tactical,
  hieratic,
);

describe('Run acquisition-target disclosure', () => {
  it('shows the Discipline marker only when a one-unit offer forces the outcome', () => {
    const oneUnit = offerOf('q', 17, 0, 8, 8, 1);
    const multiUnit = offerOf('pppkb', 17, 1, 8, 8, 1);

    expect(oneUnit.cardType).toBe('legatine');
    expect(runCardGrants(oneUnit)).toEqual([{
      unit: 'queen',
      count: 1,
      cacochymicIndices: [],
      ability: { state: 'adlected', index: 0 },
    }]);
    expect(multiUnit.cardType).toBe('legatine');
    expect(runCardGrants(multiUnit).every((grant) => !grant.ability)).toBe(true);
  });

  it('marks a multi-unit Hieratic target only once acquisition has revealed it', () => {
    const offer = offerOf('pppkb', 17, 1, 8, 8, 8, 1);

    expect(offer.cardType).toBe('hieratic');
    expect(runCardGrants(offer).every((grant) => !grant.ability)).toBe(true);
    const revealed = runCardGrants(offer, { purchased: true });
    const marked = revealed.filter((grant) => grant.ability);
    expect(marked).toHaveLength(1);
    expect(marked[0].ability?.state).toBe('agminate');
    expect(marked[0].ability!.index).toBeLessThan(marked[0].count);
  });

  it('never projects prose for a hidden target — a hidden state simply draws nothing', () => {
    const hidden = runCardFaceContent(offerOf('pppkb', 17, 1, 8, 8, 8, 1));

    // The whole face, in text: the card's own name, its primary type, and its flavor.
    // There is no slot an ability sentence could occupy (ADR-0305, ADR-0339).
    expect(Object.keys(hidden).sort()).toEqual(['cardProperty', 'cost', 'flavor', 'grants', 'name', 'typeLine']);
    expect(hidden.typeLine).toBe('Units');
    expect(hidden.grants.every((grant) => !grant.ability)).toBe(true);
  });
});

describe('Run Concinnous card disclosure', () => {
  it('keeps the Positioned target hidden before purchase and can name the persisted occurrence afterward', () => {
    const offer = offerOf('pppk', 29, 0, 8, 1, 0);

    expect(offer.cardType).toBe('concinnous');
    expect(offer.effectTargetIndex).toBeGreaterThanOrEqual(0);
    expect(runCardGrants(offer).every((grant) => !grant.ability)).toBe(true);
    expect(runCardGrants(offer, { purchased: true }).some((grant) => (
      grant.ability?.state === 'eutactic'
    ))).toBe(true);
    expect(concinnousTargetLabel(offer)).toMatch(/^(Pawn [123]|Knight)$/);
  });
});
