import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID, createRunCardOffer } from '../run/model';
import { concinnousTargetLabel, runCardGrants } from './RunCard';

describe('Run Legatine card disclosure', () => {
  it('shows the Discipline icon only when a one-unit offer forces the outcome', () => {
    const oneUnit = createRunCardOffer(
      { seed: 17, ataraxiaTier: 0 },
      RUN_CARD_BY_ID.q,
      0,
      0,
      8,
      8,
      1,
    );
    const multiUnit = createRunCardOffer(
      { seed: 17, ataraxiaTier: 0 },
      RUN_CARD_BY_ID.pppkb,
      0,
      1,
      8,
      8,
      1,
    );

    expect(runCardGrants(oneUnit)).toEqual([{
      unit: 'queen',
      count: 1,
      cacochymicIndices: [],
      ability: 'adlected',
    }]);
    expect(runCardGrants(multiUnit).every((grant) => !grant.ability)).toBe(true);
  });
});

describe('Run Concinnous card disclosure', () => {
  it('keeps the Eutactic target hidden before purchase and can name the persisted occurrence afterward', () => {
    const offer = createRunCardOffer(
      { seed: 29, ataraxiaTier: 0 },
      RUN_CARD_BY_ID.pppk,
      0,
      0,
      8,
      1,
      0,
    );

    expect(offer.cardType).toBe('concinnous');
    expect(offer.effectTargetIndex).toBeGreaterThanOrEqual(0);
    expect(concinnousTargetLabel(offer)).toMatch(/^(Pawn [123]|Knight)$/);
  });
});
