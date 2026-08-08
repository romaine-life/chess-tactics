import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  CURRENT_RUN_SAVE_VERSION,
  RUN_GENERATED_CARD_COUNT,
  RUN_OFFER_CARD_COUNT,
  RUN_SECTIO_CARD_PILE_RARITY_COUNT,
  RUN_SECTIO_CARD_PILE_SIZE,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  RUN_LIPSANA,
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTING_GOLD_TENTHS,
  acquireLipsanon,
  createRun,
  createRunCardOffer,
  leaveSectio,
  migrateRunSaveDocument,
  normalizeRunDocument,
  openSectio,
  performAdlectio,
  resetSectio,
  runCardUnitIds,
  runCardRarityForRoll,
  sectioCardOffersAtCursor,
  sectioCardPile,
  takeVacantiaLipsanon,
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
    battles: [
      { level, loot: false },
      { level: structuredClone(level), loot: false },
      { level: structuredClone(level), loot: false },
    ],
  };
}

function firstSectio(seed: number): RunDocument {
  const run = createRun(war(), seed);
  return openSectio(
    { ...run, phase: 'battle' },
    run.army.map((unit) => unit.id),
  );
}

describe('formation card catalog', () => {
  it('contains the complete generated core, six authored exceptions, and the starter', () => {
    expect(RUN_GENERATED_CARD_COUNT).toBe(720);
    expect(RUN_CARD_DECK).toHaveLength(RUN_OFFER_CARD_COUNT);
    expect(RUN_OFFER_CARD_COUNT).toBe(726);
    expect(RUN_CARD_DECK.every((card) => card.pieces.length >= 1 && card.pieces.length <= 4)).toBe(true);
    expect(RUN_CARD_CATALOG).toHaveLength(727);
  });

  it('includes every connected two-cell Queen and Pawn arrangement', () => {
    const queenPawnCards = RUN_CARD_DECK.filter((card) => (
      card.pieces.length === 2
      && card.pieces.includes('queen')
      && card.pieces.includes('pawn')
    ));
    const signatures = queenPawnCards.map((card) => card.pieces
      .map((piece, index) => `${piece}@${card.formation![index].x},${card.formation![index].y}`)
      .sort()
      .join('|'))
      .sort();
    expect(signatures).toEqual([
      'pawn@0,0|queen@0,1',
      'pawn@0,0|queen@1,0',
      'pawn@0,1|queen@1,1',
      'pawn@0,1|queen@0,0',
      'pawn@1,0|queen@0,0',
      'pawn@1,1|queen@0,1',
    ].sort());
    expect(queenPawnCards.every((card) => card.rarity === 'rare')).toBe(true);
    expect(queenPawnCards.every((card) => card.artId === 'q')).toBe(true);
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

  it('uses rarity as desirability rather than material value', () => {
    expect(RUN_CARD_BY_ID.p.rarity).toBe('common');
    expect(RUN_CARD_BY_ID.r.rarity).toBe('uncommon');
    expect(RUN_CARD_BY_ID.q.rarity).toBe('rare');
    expect(RUN_CARD_BY_ID['rr-vertical'].rarity).toBe('rare');
    expect(RUN_CARD_BY_ID['bb-diagonal'].rarity).toBe('common');
    expect(RUN_CARD_BY_ID['bb-vertical'].rarity).toBe('rare');
    expect(runCardRarityForRoll(0)).toBe('common');
    expect(runCardRarityForRoll(74)).toBe('common');
    expect(runCardRarityForRoll(75)).toBe('uncommon');
    expect(runCardRarityForRoll(94)).toBe('uncommon');
    expect(runCardRarityForRoll(95)).toBe('rare');
  });

  it('makes every opposite-color Bishop pair rare', () => {
    const paired = RUN_CARD_DECK.filter((card) => card.pieces.filter((piece) => piece === 'bishop').length >= 2);
    const opposite = paired.filter((card) => {
      const bishops = card.pieces.flatMap((piece, index) => piece === 'bishop' ? [card.formation![index]] : []);
      return bishops.some((left, index) => bishops.slice(index + 1)
        .some((right) => (left.x + left.y) % 2 !== (right.x + right.y) % 2));
    });
    expect(opposite.length).toBeGreaterThan(0);
    expect(opposite.every((card) => card.rarity === 'rare')).toBe(true);
  });

  it('keeps master-catalog rarity counts separate from the pile appearance quota', () => {
    expect(Object.fromEntries(['common', 'uncommon', 'rare'].map((rarity) => [
      rarity,
      RUN_CARD_DECK.filter((card) => card.rarity === rarity).length,
    ]))).toEqual({ common: 197, uncommon: 415, rare: 114 });
  });

  it('keeps His Grace on one protected three-unit starter card', () => {
    expect(RUN_STARTER_CARD_BY_ID['his-grace']).toMatchObject({
      pieces: ['king', 'pawn', 'pawn'],
      formation: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
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
    expect(run.phase).toBe('deployment');
    expect(run.sectio).toBeNull();
    expect(run.sectioCardCursor).toBe(0);
    expect(run.deploymentMode).toBe('automatic');
  });

  it('persists the deployment rule selected at Run creation', () => {
    const run = createRun(war(), 19, 0, { deploymentMode: 'arranged' });
    expect(run.deploymentMode).toBe('arranged');
  });

  it('deals the first three hidden-pile cards only after Battle 1', () => {
    const run = firstSectio(23);
    const offers = run.sectio!.cardOffers;
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.id)).size).toBe(3);
    expect(offers.every((offer) => ['common', 'uncommon', 'rare'].includes(offer.rarity))).toBe(true);
    expect(run.sectioCardCursor).toBe(3);
    expect(offers.map((offer) => offer.id)).toEqual(
      sectioCardOffersAtCursor(run.seed, 0, 0, 3).map((offer) => offer.id),
    );
  });

  it('moves the opening lipsanon choice directly into Battle 1 Deployment', () => {
    const openingWar = war();
    openingWar.battles[0].loot = true;
    const run = createRun(openingWar, 29);
    expect(run.phase).toBe('bona-vacantia');
    const chosen = run.vacantia!.offers[0];
    const taken = takeVacantiaLipsanon(run, chosen);
    expect(taken.phase).toBe('deployment');
    expect(taken.battleIndex).toBe(0);
    expect(taken.sectio).toBeNull();
    expect(taken.lipsana).toContain(chosen);
  });

  it('lets Quartermaster’s Ledger consume four hidden-pile positions', () => {
    const base = acquireLipsanon(createRun(war(), 37), 'quartermasters-ledger');
    const run = openSectio(
      { ...base, phase: 'battle' },
      base.army.map((unit) => unit.id),
    );
    expect(run.sectio?.cardOffers).toHaveLength(4);
    expect(run.sectioCardCursor).toBe(4);
  });

  it('retains the same row on Reset and consumes the next row at the next Sectio', () => {
    const first = firstSectio(43);
    const firstOfferIds = first.sectio!.cardOffers.map((offer) => offer.id);
    const reset = resetSectio(first);
    expect(reset.sectioCardCursor).toBe(3);
    expect(reset.sectio!.cardOffers.map((offer) => offer.id)).toEqual(firstOfferIds);

    const betweenBattles = leaveSectio(first);
    const second = openSectio(
      { ...betweenBattles, phase: 'battle' },
      betweenBattles.army.map((unit) => unit.id),
    );
    expect(second.sectioCardCursor).toBe(6);
    expect(second.sectio!.cardOffers.map((offer) => offer.id)).toEqual(
      sectioCardOffersAtCursor(second.seed, 1, 3, 3).map((offer) => offer.id),
    );
  });

  it('preserves the authored unit order when a formation is acquired', () => {
    const base = firstSectio(31);
    const offer = createRunCardOffer(base, RUN_CARD_BY_ID['ppk-protected'], -1, 0);
    const run = { ...base, sectio: { ...base.sectio!, cardOffers: [offer] } };
    const acquired = performAdlectio(run, offer.offerId);
    const card = acquired.cards.at(-1)!;
    expect(runCardUnitIds(card).map((id) => acquired.army.find((unit) => unit.id === id)!.type))
      .toEqual(['knight', 'pawn', 'pawn']);
  });
});

describe('derived Sectio card pile', () => {
  it('contains exactly 135 common, 36 uncommon, and 9 rare cards', () => {
    const pile = sectioCardPile(101, 0);
    expect(pile).toHaveLength(RUN_SECTIO_CARD_PILE_SIZE);
    expect(Object.fromEntries(['common', 'uncommon', 'rare'].map((rarity) => [
      rarity,
      pile.filter((card) => card.rarity === rarity).length,
    ]))).toEqual(RUN_SECTIO_CARD_PILE_RARITY_COUNT);
  });

  it('is deterministic and keeps every possible four-card row identity-distinct across a seam', () => {
    const first = sectioCardPile(211, 0);
    const second = sectioCardPile(211, 1);
    expect(sectioCardPile(211, 0).map((card) => card.id)).toEqual(first.map((card) => card.id));
    const sequence = [...first, ...second];
    for (let index = 0; index <= sequence.length - 4; index += 1) {
      expect(new Set(sequence.slice(index, index + 4).map((card) => card.id)).size).toBe(4);
    }
  });

  it('reorders a late recycled pile when a greedy shuffle would strand a duplicate', () => {
    const previous = sectioCardPile(2, 9);
    const recycled = sectioCardPile(2, 10);
    const sequence = [...previous.slice(-3), ...recycled];
    for (let index = 0; index <= sequence.length - 4; index += 1) {
      expect(new Set(sequence.slice(index, index + 4).map((card) => card.id)).size).toBe(4);
    }
  });

  it('exhausts each rarity queue before recycling that rarity', () => {
    for (const rarity of ['common', 'uncommon', 'rare'] as const) {
      const quota = RUN_SECTIO_CARD_PILE_RARITY_COUNT[rarity];
      const tierCount = RUN_CARD_DECK.filter((card) => card.rarity === rarity).length;
      const pilesNeeded = Math.ceil(tierCount / quota);
      const seen = new Set<string>();
      for (let pileIndex = 0; pileIndex < pilesNeeded; pileIndex += 1) {
        const cards = sectioCardPile(307, pileIndex).filter((card) => card.rarity === rarity);
        for (const card of cards) seen.add(card.id);
      }
      expect(seen.size).toBe(tierCount);
    }
  });
});

describe('ability retirement migration', () => {
  it('exposes only the seven economy and run-flow lipsana', () => {
    expect(RUN_LIPSANA.map((item) => item.id)).toEqual([
      'congressional-approval', 'royal-tent', 'mercenarys-rifle', 'merchants-shopkey',
      'occult-dagger', 'deployment-vehicle', 'quartermasters-ledger',
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
    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
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

  it('moves a version-25 opening Sectio directly to Deployment without losing transactions', () => {
    const current = firstSectio(71);
    const opening = {
      ...current,
      runSaveVersion: 25,
      battleIndex: 0,
      conflictIndex: 0,
      sectioCardCursor: undefined,
      sectio: { ...current.sectio!, kind: 'opening' },
    };
    const migrated = migrateRunSaveDocument(opening);
    expect(migrated).toMatchObject({
      runSaveVersion: CURRENT_RUN_SAVE_VERSION,
      phase: 'deployment',
      battleIndex: 0,
      sectioCardCursor: 0,
      sectio: null,
    });
    expect(migrated.army).toEqual(current.army);
    expect(migrated.cards).toEqual(current.cards);
    expect(migrated.goldTenths).toBe(current.goldTenths);
  });

  it('keeps a version-25 post-Battle offer row and begins the derived cursor at zero', () => {
    const current = firstSectio(73);
    const legacy = {
      ...current,
      runSaveVersion: 25,
      sectioCardCursor: undefined,
      sectio: { ...current.sectio!, kind: 'post-battle' },
    };
    const migrated = migrateRunSaveDocument(legacy);
    expect(migrated.phase).toBe('sectio');
    expect(migrated.sectioCardCursor).toBe(0);
    expect(migrated.sectio?.cardOffers).toEqual(current.sectio?.cardOffers);
    expect(migrated.sectio).not.toHaveProperty('kind');
  });

  it('keeps version-26 visible state while restarting the expanded hidden catalog', () => {
    const current = firstSectio(79);
    const legacy = {
      ...current,
      runSaveVersion: 26,
      sectioCardCursor: 117,
    };
    const migrated = migrateRunSaveDocument(legacy);
    expect(migrated).toMatchObject({
      runSaveVersion: CURRENT_RUN_SAVE_VERSION,
      phase: current.phase,
      sectioCardCursor: 0,
    });
    expect(migrated.sectio?.cardOffers).toEqual(current.sectio?.cardOffers);
    expect(migrated.army).toEqual(current.army);
    expect(migrated.cards).toEqual(current.cards);
    expect(migrated.deployment).toEqual(current.deployment);
  });

  it('rewinds a version-27 Sectio and removes every individual-disposal trace', () => {
    const current = firstSectio(83);
    const removedUnit = current.army.find((unit) => unit.type !== 'king')!;
    const legacySnapshot = {
      ...current.sectio!.entrySnapshot,
      lipsana: ['royal-tent', 'fair-scales'],
      seenLipsana: ['royal-tent', 'fair-scales', 'mercenary-boat'],
      conflictPaidLipsana: { 0: { lipsanonId: 'fair-scales', bought: false } },
    };
    const legacy = {
      ...current,
      runSaveVersion: 27,
      goldTenths: current.goldTenths + 5,
      army: current.army.filter((unit) => unit.id !== removedUnit.id),
      cards: current.cards.map((card) => ({
        ...card,
        unitSeats: card.unitSeats.map((id) => id === removedUnit.id ? null : id),
      })),
      lipsana: ['royal-tent', 'fair-scales'],
      seenLipsana: ['royal-tent', 'fair-scales', 'mercenary-boat'],
      conflictPaidLipsana: { 0: { lipsanonId: 'fair-scales', bought: false } },
      sectio: {
        ...current.sectio!,
        adlectedCardOfferIds: [current.sectio!.cardOffers[0].offerId],
        paidLipsanonOffer: 'fair-scales',
        paidLipsanonBought: false,
        alienatedUnits: [{ unit: removedUnit, proceedsTenths: 5 }],
        expunctedCard: { stale: true },
        entrySnapshot: legacySnapshot,
      },
    };

    const migrated = migrateRunSaveDocument(legacy);

    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(migrated.goldTenths).toBe(legacySnapshot.goldTenths);
    expect(migrated.army).toEqual(legacySnapshot.army);
    expect(migrated.cards).toEqual(legacySnapshot.cards);
    expect(migrated.lipsana).toEqual(['royal-tent']);
    expect(migrated.seenLipsana).toEqual(['royal-tent']);
    expect(migrated.conflictPaidLipsana).toEqual({});
    expect(migrated.sectio).toMatchObject({
      adlectedCardOfferIds: [],
      paidLipsanonOffer: null,
      paidLipsanonBought: false,
      expunctedCard: null,
    });
    expect(migrated.sectio).not.toHaveProperty('alienatedUnits');
  });

  it('names automatic deployment when migrating a version-28 Run', () => {
    const current = createRun(war(), 89, 0, { deploymentMode: 'arranged' });
    const { deploymentMode: _missingMode, ...legacy } = current;
    const migrated = migrateRunSaveDocument({ ...legacy, runSaveVersion: 28 });

    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(migrated.deploymentMode).toBe('automatic');
  });
});
