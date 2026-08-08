import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  CURRENT_RUN_SAVE_VERSION,
  RUN_GENERATED_CARD_COUNT,
  RUN_OFFER_CARD_COUNT,
  RUN_OPENING_CARD_OFFER_COUNT,
  RUN_OPENING_CARD_VALUE_MAX,
  RUN_OPENING_CARD_VALUE_MIN,
  RUN_BATTLE_UNDO_COST_TENTHS,
  RUN_EN_PASSANT_BOUNTY_TENTHS,
  RUN_SECTIO_CARD_PILE_SIZE,
  RUN_SECTIO_EARLY_CARD_MAX_VALUE,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  RUN_CARD_RARITIES,
  RUN_LIPSANA,
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTING_GOLD_TENTHS,
  acquireLipsanon,
  captureRunBattleUndo,
  createRun,
  createRunCardOffer,
  leaveSectio,
  migrateRunSaveDocument,
  normalizeRunDocument,
  openSectio,
  payRunEnPassantBounty,
  performAdlectio,
  resetSectio,
  runCardDefinition,
  undoRunBattleMove,
  runCardUnitIds,
  runCardRarity,
  runCardRarityForRoll,
  runSectioCardMaxValue,
  sectioUpcomingBattleIndex,
  sectioCardOffersAtCursor,
  sectioCardPile,
  sectioPileRarityQuota,
  takeVacantiaCard,
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
  it('contains the complete generated core, the connected authored exceptions, and the starter', () => {
    expect(RUN_GENERATED_CARD_COUNT).toBe(720);
    expect(RUN_CARD_DECK).toHaveLength(RUN_OFFER_CARD_COUNT);
    expect(RUN_OFFER_CARD_COUNT).toBe(269);
    expect(RUN_CARD_DECK.every((card) => card.pieces.length >= 1 && card.pieces.length <= 4)).toBe(true);
    expect(RUN_CARD_CATALOG).toHaveLength(270);
  });

  /**
   * A formation is a cluster of squares that touch. The generator enforces it, but named cards were
   * injected over the generated map without the check, which put three diagonal chains back into
   * the market the generator had already refused. The card face prints the footprint as the shape
   * the card grants, and squares that never touch cannot read as one shape however they are drawn.
   */
  it('deals no formation whose squares fail to touch', () => {
    const touching = (cells: readonly { x: number; y: number }[]): boolean => {
      const available = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
      const seen = new Set<string>();
      const pending = [cells[0]];
      while (pending.length) {
        const cell = pending.pop()!;
        const key = `${cell.x},${cell.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const near of [
          { x: cell.x - 1, y: cell.y }, { x: cell.x + 1, y: cell.y },
          { x: cell.x, y: cell.y - 1 }, { x: cell.x, y: cell.y + 1 },
        ]) if (available.has(`${near.x},${near.y}`)) pending.push(near);
      }
      return seen.size === cells.length;
    };
    const scattered = RUN_CARD_DECK.filter((card) => card.formation && !touching(card.formation));
    expect(scattered.map((card) => card.id)).toEqual([]);
  });

  /** Retired from the market, still readable: a Run already holding one keeps its whole face. */
  it('keeps the retired diagonal cards resolvable for Runs that hold them', () => {
    for (const id of ['ppb-protected', 'ppk-protected', 'bb-diagonal', 'ppb-reversed', 'ppk-reversed']) {
      expect(runCardDefinition(id), `${id} became unresolvable`).toBeTruthy();
      expect(RUN_CARD_DECK.some((card) => card.id === id), `${id} is still dealt`).toBe(false);
    }
  });

  it('collapses quarter-turn-equivalent Queen and Pawn arrangements', () => {
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
    expect(signatures).toEqual(['pawn@0,0|queen@0,1']);
    expect(queenPawnCards.every((card) => card.rarity === 'rare')).toBe(true);
    // Art is keyed to (footprint, roster), so Queen and Pawn owns its own illustration
    // rather than borrowing the lone Queen's.
    expect(queenPawnCards.every((card) => card.artId === '0001-pq')).toBe(true);
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

  it('bands rarity by material value', () => {
    expect(RUN_CARD_BY_ID.p.rarity).toBe('common');
    expect(RUN_CARD_BY_ID.r.rarity).toBe('uncommon');
    expect(RUN_CARD_BY_ID.q.rarity).toBe('rare');
    expect(RUN_CARD_BY_ID['rr-vertical'].rarity).toBe('rare');
    expect(RUN_CARD_BY_ID['bb-diagonal'].rarity).toBe('uncommon');
    expect(RUN_CARD_BY_ID['bb-vertical'].rarity).toBe('uncommon');
    expect(runCardRarityForRoll(0)).toBe('common');
    expect(runCardRarityForRoll(79)).toBe('common');
    expect(runCardRarityForRoll(80)).toBe('uncommon');
    expect(runCardRarityForRoll(94)).toBe('uncommon');
    expect(runCardRarityForRoll(95)).toBe('rare');
  });

  it('drops the five awkward footprints one tier', () => {
    const z = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
    const t = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }];
    const j = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    const threePawns = ['pawn', 'pawn', 'pawn'] as const;
    // Rare material on a shape that wastes the band comes down to Uncommon.
    expect(runCardRarity(['rook', ...threePawns], z)).toBe('uncommon');
    expect(runCardRarity(['rook', ...threePawns], j)).toBe('uncommon');
    // Uncommon material takes the same step, which is what puts value-6 cards in the Common pool.
    expect(runCardRarity(['knight', ...threePawns], t)).toBe('common');
    // A straight run and a square pack cleanly, so both keep their band at the same material.
    expect(runCardRarity(['rook', ...threePawns], line)).toBe('rare');
    expect(runCardRarity(['knight', ...threePawns], square)).toBe('uncommon');
    // The drop reads the shape after rotation, exactly as card identity does.
    expect(runCardRarity(['rook', ...threePawns], z.map(({ x, y }) => ({ x: -y, y: x }))))
      .toBe('uncommon');
    // An opposite-color Bishop pair is the prize, and the awkward shape does not spoil it.
    expect(runCardRarity(['bishop', 'bishop', 'pawn', 'pawn'], z)).toBe('rare');
  });

  it('keeps an opposite-color Bishop pair in its band on any footprint', () => {
    const paired = RUN_CARD_DECK.filter((card) => card.pieces.filter((piece) => piece === 'bishop').length >= 2);
    const opposite = paired.filter((card) => {
      const bishops = card.pieces.flatMap((piece, index) => piece === 'bishop' ? [card.formation![index]] : []);
      return bishops.some((left, index) => bishops.slice(index + 1)
        .some((right) => (left.x + left.y) % 2 !== (right.x + right.y) % 2));
    });
    expect(opposite.length).toBeGreaterThan(0);
    expect(opposite.every((card) => card.rarity === (card.value > 6 ? 'rare' : 'uncommon'))).toBe(true);
  });

  it('holds the catalog to a Common tier that cannot hand out clean material', () => {
    expect(Object.fromEntries(RUN_CARD_RARITIES.map((rarity) => [
      rarity,
      RUN_CARD_DECK.filter((card) => card.rarity === rarity).length,
    ]))).toEqual({ common: 47, uncommon: 120, rare: 102 });
    // Every Common above the value band is there because its footprint wastes the band.
    const richCommons = RUN_CARD_DECK.filter((card) => card.rarity === 'common' && card.value > 4);
    expect(richCommons).toHaveLength(32);
    expect(richCommons.every((card) => card.value === 6 && card.formation!.length === 4)).toBe(true);
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
    expect(run.deploymentMode).toBe('arranged');
  });

  it('uses player arrangement for every Run', () => {
    const run = createRun(war(), 19);
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

  it('opens the Run on a formation-card grant and moves it into Battle 1 Deployment', () => {
    const openingWar = war();
    openingWar.battles[0].loot = true;
    const run = createRun(openingWar, 29);
    expect(run.phase).toBe('bona-vacantia');
    expect(run.vacantia!.kind).toBe('opening');
    // The opening screen grants a card, not a lipsanon: Battle 1 has to be arrangeable.
    expect(run.vacantia!.offers).toEqual([]);
    expect(run.vacantia!.cardOffers).toHaveLength(RUN_OPENING_CARD_OFFER_COUNT);
    expect(new Set(run.vacantia!.cardOffers).size).toBe(RUN_OPENING_CARD_OFFER_COUNT);
    for (const coreId of run.vacantia!.cardOffers) {
      const card = RUN_CARD_BY_ID[coreId];
      expect(card).toBeDefined();
      expect(card.value).toBeGreaterThanOrEqual(RUN_OPENING_CARD_VALUE_MIN);
      expect(card.value).toBeLessThanOrEqual(RUN_OPENING_CARD_VALUE_MAX);
    }

    const chosen = run.vacantia!.cardOffers[0];
    const taken = takeVacantiaCard(run, chosen);
    expect(taken.phase).toBe('deployment');
    expect(taken.battleIndex).toBe(0);
    expect(taken.sectio).toBeNull();
    expect(taken.vacantia).toBeNull();
    expect(taken.lipsana).toEqual([]);

    // Admitted exactly as Adlectio would: a held card with one army seat per piece.
    const held = taken.cards.at(-1)!;
    expect(held.coreId).toBe(chosen);
    expect(held.unitSeats).toHaveLength(RUN_CARD_BY_ID[chosen].pieces.length);
    expect(taken.army.filter((unit) => held.unitSeats.includes(unit.id)).map((unit) => unit.type))
      .toEqual(RUN_CARD_BY_ID[chosen].pieces);
    expect(taken.goldTenths).toBe(run.goldTenths);
  });

  it('refuses a grant the opening screen did not offer', () => {
    const openingWar = war();
    openingWar.battles[0].loot = true;
    const run = createRun(openingWar, 29);
    const unoffered = RUN_CARD_DECK.find((card) => !run.vacantia!.cardOffers.includes(card.id))!;

    expect(takeVacantiaCard(run, unoffered.id)).toBe(run);
    expect(takeVacantiaCard(run, 'his-grace')).toBe(run);
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

  it('names the Battle the Sectio leads into, not the one it followed', () => {
    // battleIndex still points at the Battle just fought while the Sectio is open, so a screen
    // reading it directly previews the LAST map. leaveSectio is what advances it.
    const first = firstSectio(43);
    expect(first.battleIndex).toBe(0);
    expect(sectioUpcomingBattleIndex(first)).toBe(1);
    expect(leaveSectio(first).battleIndex).toBe(1);

    const second = openSectio(
      { ...leaveSectio(first), phase: 'battle' },
      first.army.map((unit) => unit.id),
    );
    expect(second.battleIndex).toBe(1);
    expect(sectioUpcomingBattleIndex(second)).toBe(2);
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
  const composition = (pile: readonly { rarity: string }[]) => Object.fromEntries(
    RUN_CARD_RARITIES.map((rarity) => [rarity, pile.filter((card) => card.rarity === rarity).length]),
  );

  it('carries the declared rarity quota exactly, not on average', () => {
    for (const seed of [101, 211, 907]) {
      const pile = sectioCardPile(seed, 0);
      expect(pile).toHaveLength(RUN_SECTIO_CARD_PILE_SIZE);
      expect(composition(pile)).toEqual({ common: 16, uncommon: 3, rare: 1 });
      expect(new Set(pile.map((card) => card.id)).size).toBe(RUN_SECTIO_CARD_PILE_SIZE);
    }
  });

  it('re-apportions a tier the cost ceiling empties', () => {
    expect(sectioPileRarityQuota()).toEqual({ common: 16, uncommon: 3, rare: 1 });
    // No card in the catalog costs seven or less and is Rare, so Rare's share is handed on.
    expect(sectioPileRarityQuota(RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toEqual({
      common: 17, uncommon: 3, rare: 0,
    });
    const capped = sectioCardPile(101, 0, RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(capped).toHaveLength(RUN_SECTIO_CARD_PILE_SIZE);
    expect(capped.every((card) => card.value <= RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toBe(true);
    expect(composition(capped)).toEqual({ common: 17, uncommon: 3, rare: 0 });
  });

  it('is deterministic and independently shuffles each exhausted pile', () => {
    const first = sectioCardPile(211, 0);
    const second = sectioCardPile(211, 1);
    expect(sectioCardPile(211, 0).map((card) => card.id)).toEqual(first.map((card) => card.id));
    expect(second.map((card) => card.id)).not.toEqual(first.map((card) => card.id));
    expect(composition(second)).toEqual(composition(first));
  });

  it('caps card cost for the first two Battles and then lifts it for good', () => {
    expect(runSectioCardMaxValue(0)).toBe(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(runSectioCardMaxValue(1)).toBe(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(runSectioCardMaxValue(2)).toBe(Number.POSITIVE_INFINITY);
    expect(sectioCardOffersAtCursor(53, 0, 0, 3)
      .every((offer) => offer.cost <= RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toBe(true);
    expect(sectioCardOffersAtCursor(53, 1, 3, 3)
      .every((offer) => offer.cost <= RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toBe(true);
    // The ceiling never removes the market: a capped row still fills every seat.
    expect(sectioCardOffersAtCursor(53, 1, 3, 4)).toHaveLength(4);
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

  it('migrates a version-28 Run through automatic into player arrangement', () => {
    const current = createRun(war(), 89);
    const { deploymentMode: _missingMode, ...legacy } = current;
    const migrated = migrateRunSaveDocument({ ...legacy, runSaveVersion: 28 });

    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(migrated.deploymentMode).toBe('arranged');
  });
});

describe('en passant bounty', () => {
  function inBattle(run: RunDocument): RunDocument {
    return {
      ...run,
      phase: 'battle',
      battleRuntime: {
        battleIndex: run.battleIndex,
        initiallyDeployedUnitIds: run.army.map((unit) => unit.id),
        reserveUnitIds: [],
        reservistPoolUnitIds: [],
        deployedReservistUnitIds: [],
        observedDeadUnitIds: [],
        reinforcementSequence: 0,
      },
    };
  }

  it('pays five gold the moment the capture lands, and pays again for a second one', () => {
    const battle = inBattle(createRun(war(), 11));

    const once = payRunEnPassantBounty(battle, { x: 3, y: 4 })!;
    expect(once.run.goldTenths).toBe(battle.goldTenths + RUN_EN_PASSANT_BOUNTY_TENTHS);
    expect(RUN_EN_PASSANT_BOUNTY_TENTHS).toBe(50);

    const twice = payRunEnPassantBounty(once.run, { x: 3, y: 4 })!;
    expect(twice.run.goldTenths).toBe(battle.goldTenths + 2 * RUN_EN_PASSANT_BOUNTY_TENTHS);
  });

  it('hands back the notice that accounts for the payment, welded to the paid document', () => {
    // The bounty and the report of the bounty are one return value on purpose: there is no
    // call that produces the gold and leaves the player with nothing to see or read.
    const battle = inBattle(createRun(war(), 21));
    const paid = payRunEnPassantBounty(battle, { x: 5, y: 2 })!;

    expect(paid.notice.goldTenths).toBe(RUN_EN_PASSANT_BOUNTY_TENTHS);
    expect(paid.notice.at).toEqual({ x: 5, y: 2 });
    expect(paid.notice.log).toContain('En passant');
    expect(paid.notice.log).toContain('5');
  });

  it('pays nothing outside a Battle, and nothing without a battle runtime', () => {
    const sectio = firstSectio(12);
    expect(payRunEnPassantBounty(sectio, { x: 0, y: 0 })).toBeNull();

    const noRuntime: RunDocument = { ...sectio, phase: 'battle', battleRuntime: null };
    expect(payRunEnPassantBounty(noRuntime, { x: 0, y: 0 })).toBeNull();
  });

  it('is taken back with the move that earned it', () => {
    // The Undo checkpoint is captured BEFORE the move commits, so restoring it removes the
    // bounty the move paid -- an en passant cannot be taken twice by taking it back.
    const battle = inBattle(createRun(war(), 13));
    const checkpoint = captureRunBattleUndo(battle);
    const paid = payRunEnPassantBounty(battle, { x: 1, y: 1 })!;
    expect(paid.run.goldTenths).toBeGreaterThan(battle.goldTenths);

    const undone = undoRunBattleMove(paid.run, checkpoint);
    expect(undone.goldTenths).toBe(battle.goldTenths - RUN_BATTLE_UNDO_COST_TENTHS);
  });
});
