import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  CURRENT_RUN_SAVE_VERSION,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  RUN_LIPSANA,
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTING_GOLD_TENTHS,
  acquireLipsanon,
  createRun,
  createRunCardOffer,
  migrateRunSaveDocument,
  normalizeRunDocument,
  performAdlectio,
  runCardUnitIds,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function war(): RunWarSnapshot {
  const level = createBlankLevel('formation-battle', 'Formation Battle', 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  return {
    id: 'formation-war',
    name: 'Formation War',
    description: 'A test war.',
    battles: [{ level, loot: false }],
  };
}

const ACTIVE_CARD_IDS = [
  'p', 'pp', 'b', 'k', 'ppp', 'pb-front', 'pk-front', 'ppb-protected',
  'ppb-reversed', 'ppk-protected', 'ppk-reversed', 'r', 'bb-diagonal', 'bb-vertical',
  'kk-horizontal', 'pr-front', 'q', 'pq-front', 'rr-vertical',
];

describe('formation card catalog', () => {
  it('contains exactly the 19 authored one-to-three-unit cards', () => {
    expect(RUN_CARD_DECK.map((card) => card.id)).toEqual(ACTIVE_CARD_IDS);
    expect(RUN_CARD_DECK.every((card) => card.pieces.length >= 1 && card.pieces.length <= 3)).toBe(true);
    expect(RUN_CARD_CATALOG).toHaveLength(20);
  });

  it('gives every card one coordinate per unit and keeps coordinates unique', () => {
    for (const card of RUN_CARD_CATALOG) {
      expect(card.formation).toHaveLength(card.pieces.length);
      expect(new Set(card.formation!.map(({ x, y }) => `${x},${y}`)).size).toBe(card.pieces.length);
    }
  });

  it('authors the protected and reversed triangles in opposite directions', () => {
    expect(RUN_CARD_BY_ID['ppk-protected'].formation).toEqual([
      { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 },
    ]);
    expect(RUN_CARD_BY_ID['ppk-reversed'].formation).toEqual([
      { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 },
    ]);
  });

  it('keeps His Grace on one protected three-unit starter card', () => {
    expect(RUN_STARTER_CARD_BY_ID['his-grace']).toMatchObject({
      pieces: ['king', 'pawn', 'pawn'],
      formation: [{ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 }],
      removable: false,
    });
  });

  it('prices a deal from material without qualifiers', () => {
    const card = RUN_CARD_BY_ID['rr-vertical'];
    const offer = createRunCardOffer({ seed: 17 }, card, 0, 2);
    expect(offer).toMatchObject({ id: 'rr-vertical', cost: card.value });
    expect(Object.keys(offer)).not.toContain('coreId');
    expect(Object.keys(offer)).not.toContain('cardType');
    expect(Object.keys(offer)).not.toContain('effectTargetIndex');
  });
});

describe('plain Run creation and acquisition', () => {
  it('starts with one combined starter card, three units, and eight gold', () => {
    const run = createRun(war(), 17, '2026-01-01T00:00:00.000Z');
    expect(run.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
    expect(run.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(run.cards).toHaveLength(1);
    expect(run.cards[0]).toMatchObject({ coreId: 'his-grace' });
    expect(runCardUnitIds(run.cards[0])).toEqual(run.army.map((unit) => unit.id));
  });

  it('deals three affordable opening cards with distinct material values', () => {
    const run = createRun(war(), 23);
    const offers = run.sectio!.cardOffers;
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.value)).size).toBe(3);
    expect(offers.every((offer) => offer.cost <= 8)).toBe(true);
  });

  it('preserves the authored unit order when a formation is acquired', () => {
    const base = createRun(war(), 31);
    const offer = createRunCardOffer(base, RUN_CARD_BY_ID['ppk-protected'], -1, 0);
    const run = { ...base, sectio: { ...base.sectio!, cardOffers: [offer] } };
    const acquired = performAdlectio(run, offer.offerId);
    const card = acquired.cards.at(-1)!;
    expect(runCardUnitIds(card).map((id) => acquired.army.find((unit) => unit.id === id)!.type))
      .toEqual(['knight', 'pawn', 'pawn']);
  });
});

describe('ability retirement migration', () => {
  it('exposes only the nine economy and run-flow relics', () => {
    expect(RUN_LIPSANA.map((item) => item.id)).toEqual([
      'congressional-approval', 'royal-tent', 'mercenarys-rifle', 'merchants-shopkey',
      'occult-dagger', 'deployment-vehicle', 'mercenary-boat', 'quartermasters-ledger',
      'fair-scales',
    ]);
  });

  it('refuses retired ability relics', () => {
    const run = createRun(war(), 41);
    expect(acquireLipsanon(run, 'conscription-notice' as never)).toBe(run);
    expect(acquireLipsanon(run, 'congressional-approval').lipsana).toContain('congressional-approval');
  });

  it('strips every retired ability field while preserving the army on a v23 save', () => {
    const current = createRun(war(), 53);
    const raw = {
      ...current,
      runSaveVersion: 23,
      ataraxiaTier: 5,
      pestiferousLosses: [{ battleIndex: 0 }],
      lipsana: ['conscription-notice', 'congressional-approval'],
      army: current.army.map((unit) => ({ ...unit, abilities: ['adlected'], modifiers: ['cacochymic'] })),
      cards: current.cards.map((card) => ({ ...card, cardType: 'legatine', effectTargetUnitId: current.army[0].id })),
      sectio: current.sectio ? {
        ...current.sectio,
        cardOffers: current.sectio.cardOffers.map((offer) => ({ ...offer, cardType: 'pestiferous', cacochymicPieceIndex: 0 })),
      } : null,
    };
    const migrated = migrateRunSaveDocument(raw);
    const serialized = JSON.stringify(migrated);
    expect(migrated.runSaveVersion).toBe(24);
    expect(migrated.ataraxiaTier).toBe(0);
    expect(migrated.army).toHaveLength(current.army.length);
    expect(migrated.lipsana).toEqual(['congressional-approval']);
    for (const retired of ['abilities', 'modifiers', 'cardType', 'effectTargetUnitId', 'cacochymicPieceIndex', 'pestiferousLosses']) {
      expect(serialized).not.toContain(`"${retired}"`);
    }
  });

  it('normalizes current saves idempotently', () => {
    const run = createRun(war(), 67);
    expect(normalizeRunDocument(normalizeRunDocument(run))).toEqual(normalizeRunDocument(run));
  });
});
