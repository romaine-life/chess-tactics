import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  CURRENT_RUN_SAVE_VERSION,
  GOLD_SCALE,
  PIECE_VALUE,
  RUN_GENERATED_CARD_COUNT,
  RUN_OFFER_CARD_COUNT,
  RUN_OPENING_CARD_OFFER_COUNT,
  RUN_OPENING_CARD_VALUE_MAX,
  RUN_OPENING_CARD_VALUE_MIN,
  RUN_BATTLE_UNDO_COST_TENTHS,
  RUN_EN_PASSANT_BOUNTY_TENTHS,
  RUN_ROYAL_FORK_BOUNTY_TENTHS,
  RUN_ROYAL_FORK_MIN_VICTIM_VALUE,
  RUN_SECTIO_CARD_PILE_SIZE,
  RUN_SECTIO_EARLY_CARD_MAX_VALUE,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  RUN_CARD_RARITIES,
  RUN_LIPSANA,
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTER_CARDS,
  RUN_STARTER_GOLD_BASELINE_VALUE,
  RUN_STARTING_GOLD,
  RUN_STARTING_GOLD_TENTHS,
  acquireLipsanon,
  canUndoRunBattleMove,
  captureRunBattleUndo,
  chargeRunBattleUndoCheckpoint,
  DEFAULT_RUN_RULES,
  LEGACY_RUN_RULES,
  RUN_SECTIO_CARD_PILE_RARITY_COUNT,
  formationSpan,
  openingKingOffers,
  cardAllowedByRules,
  runCardCost,
  createRun,
  createRunCardOffer,
  leaveSectio,
  migrateRunSaveDocument,
  normalizeRunDocument,
  openSectio,
  manubiaeUnitWorth,
  manubiumGoldTenths,
  payRunManubium,
  RUN_MANUBIAE,
  performAdlectio,
  performExpunctio,
  resetSectio,
  sectioAdmittedCardIds,
  runCardDefinition,
  undoRunBattleMove,
  runCardUnitIds,
  runCardRarity,
  runCardRarityForRoll,
  runSectioCardMaxValue,
  sectioAdlectioSpent,
  sectioUpcomingBattleIndex,
  sectioCardOffersAtCursor,
  sectioCardPile,
  sectioPileRarityQuota,
  takeCommendatioKing,
  takeVacantiaCard,
  takeVacantiaLipsanon,
  type RunDocument,
  type RunRules,
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

// These exercise the PILE mechanism -- cursor advance, row retention, deterministic ordering --
// so they name the wide rules rather than inheriting the default. The narrow default cannot show
// three distinct commons in a row (see 'repeats commons under the narrow default'), which would
// make a mechanism test fail for a reason that has nothing to do with the mechanism.
function firstSectio(seed: number, rules: RunRules = LEGACY_RUN_RULES): RunDocument {
  const run = createRun(war(), seed, { rules });
  return openSectio(
    { ...run, phase: 'battle' },
    run.army.map((unit) => unit.id),
  );
}

/** A Run with a live Battle to be paid from — what every board-earned bounty needs. */
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

describe('formation card catalog', () => {
  it('contains the complete generated core, the connected authored exceptions, and the starter', () => {
    expect(RUN_GENERATED_CARD_COUNT).toBe(720);
    expect(RUN_CARD_DECK).toHaveLength(RUN_OFFER_CARD_COUNT);
    expect(RUN_OFFER_CARD_COUNT).toBe(269);
    expect(RUN_CARD_DECK.every((card) => card.pieces.length >= 1 && card.pieces.length <= 4)).toBe(true);
    // The offer deck plus the fifteen Kings, which are never dealt into it.
    expect(RUN_STARTER_CARDS).toHaveLength(15);
    expect(RUN_CARD_CATALOG).toHaveLength(RUN_OFFER_CARD_COUNT + RUN_STARTER_CARDS.length);
  });

  it('gives every King mating material against a lone King and prices the thin ones in gold', () => {
    for (const king of RUN_STARTER_CARDS) {
      const companions = king.pieces.filter((piece) => piece !== 'king');
      const minors = companions.filter((piece) => piece === 'knight' || piece === 'bishop');
      // Battle 1 is a lone King. K+N, K+B and K+NN cannot force mate; a Pawn always can, by
      // promotion, and two minors can between them. No King may be authored without one or other.
      expect(
        companions.includes('pawn') || minors.length >= 2,
        `${king.id} cannot force mate against a lone King`,
      ).toBe(true);
      expect(king.value + king.goldBonusTenths / GOLD_SCALE).toBe(RUN_STARTER_GOLD_BASELINE_VALUE);
      expect(king.pieces.filter((piece) => piece === 'king')).toHaveLength(1);
      expect(king.formation).toHaveLength(king.pieces.length);
      expect(king.removable).toBe(false);
    }
    expect(new Set(RUN_STARTER_CARDS.map((king) => king.id)).size).toBe(RUN_STARTER_CARDS.length);
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
    // Bishop material is six either way; the Bishops are what carry both pairs past the band.
    expect(RUN_CARD_BY_ID['bb-diagonal'].rarity).toBe('rare');
    expect(RUN_CARD_BY_ID['bb-vertical'].rarity).toBe('rare');
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
    // A Bishop is worth exactly the band a wasteful shape costs, so the two cancel.
    expect(runCardRarity(['bishop', ...threePawns], z)).toBe('uncommon');
    expect(runCardRarity(['bishop', 'bishop', 'pawn', 'pawn'], z)).toBe('rare');
  });

  it('costs a band for a Bishop however that card places it', () => {
    const withBishop = RUN_CARD_DECK.filter((card) => card.pieces.includes('bishop'));
    expect(withBishop.length).toBeGreaterThan(0);
    // Free placement decides the colour a Bishop lands on, so the card's own parity earns nothing:
    // every Bishop card sits one band above the same roster's material-and-shape reading.
    for (const card of withBishop) {
      const withoutBishops = card.pieces.map((piece) => piece === 'bishop' ? 'knight' as const : piece);
      const unpriced = runCardRarity(withoutBishops, card.formation!);
      const ladder = [...RUN_CARD_RARITIES];
      expect(ladder.indexOf(card.rarity), card.id)
        .toBe(Math.min(ladder.length - 1, ladder.indexOf(unpriced) + 1));
    }
    // No Bishop reaches the tier that owns 80% of a pile's seats, and the made pair is always Rare.
    expect(withBishop.some((card) => card.rarity === 'common')).toBe(false);
    const paired = withBishop.filter((card) => (
      card.pieces.filter((piece) => piece === 'bishop').length >= 2
    ));
    expect(paired.length).toBeGreaterThan(0);
    expect(paired.every((card) => card.rarity === 'rare')).toBe(true);
  });

  it('holds the catalog to a Common tier that cannot hand out clean material', () => {
    expect(Object.fromEntries(RUN_CARD_RARITIES.map((rarity) => [
      rarity,
      RUN_CARD_DECK.filter((card) => card.rarity === rarity).length,
    ]))).toEqual({ common: 29, uncommon: 71, rare: 169 });
    // Every Common above the value band is there because its footprint wastes the band.
    const richCommons = RUN_CARD_DECK.filter((card) => card.rarity === 'common' && card.value > 4);
    expect(richCommons).toHaveLength(16);
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
    // His Grace is two material short of the four-value baseline, so it opens with the gold.
    expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS + RUN_STARTER_CARD_BY_ID['his-grace'].goldBonusTenths);
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

  it('repeats commons under the narrow default, because the shipped bands leave six of them', () => {
    // Recorded rather than asserted-away. At a span of two the material bands leave six distinct
    // commons against sixteen pile seats, so a pile fills its seats by repeating them. The mode is
    // playable and this is what it looks like; it resolves when the rarity rule moves.
    const narrow = RUN_CARD_DECK.filter((card) => cardAllowedByRules(card, DEFAULT_RUN_RULES));
    expect(narrow.filter((card) => card.rarity === 'common')).toHaveLength(6);
    expect(RUN_SECTIO_CARD_PILE_RARITY_COUNT.common).toBe(16);
    const pile = sectioCardPile(23, 0, Number.POSITIVE_INFINITY, DEFAULT_RUN_RULES);
    expect(pile).toHaveLength(20);
    expect(new Set(pile.map((card) => card.id)).size).toBeLessThan(pile.length);
  });

  it('deals the first three hidden-pile cards only after Battle 1', () => {
    const run = firstSectio(23);
    const offers = run.sectio!.cardOffers;
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.id)).size).toBe(3);
    expect(offers.every((offer) => ['common', 'uncommon', 'rare'].includes(offer.rarity))).toBe(true);
    expect(run.sectioCardCursor).toBe(3);
    expect(offers.map((offer) => offer.id)).toEqual(
      sectioCardOffersAtCursor(run.seed, 0, 0, 3, LEGACY_RUN_RULES).map((offer) => offer.id),
    );
  });

  // The King replaced the opening card grant: the Run's first decision happens before the
  // document exists, so a loot Battle 1 no longer opens on Bona Vacantia at all.
  it('opens straight into Battle 1 Deployment even when Battle 1 carries loot', () => {
    const openingWar = war();
    openingWar.battles[0].loot = true;
    const run = createRun(openingWar, 29);

    expect(run.phase).toBe('deployment');
    expect(run.vacantia).toBeNull();
    expect(run.battleIndex).toBe(0);
    expect(run.cards).toHaveLength(1);
  });

  it('builds the army and the opening gold from the chosen King', () => {
    for (const king of RUN_STARTER_CARDS) {
      const run = createRun(war(), 23, { kingId: king.id });

      expect(run.cards).toHaveLength(1);
      expect(run.cards[0].coreId).toBe(king.id);
      expect(run.army.map((unit) => unit.type)).toEqual(king.pieces);
      expect(runCardUnitIds(run.cards[0])).toEqual(run.army.map((unit) => unit.id));
      expect(run.army.filter((unit) => unit.type === 'king')).toHaveLength(1);
      // Thin Kings are topped up so every opening hand is worth the same four.
      expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS + king.goldBonusTenths);
      expect(run.phase).toBe('deployment');
    }
  });

  it('opens the player-facing Run on three shuffled Kings and nothing else', () => {
    const dealt = [1, 7, 42, 1234].map((seed) => {
      const run = createRun(war(), seed, { chooseKing: true });
      // Commendatio is its own phase. Bona Vacantia is the RELIC phase a Conflict opens with.
      expect(run.phase).toBe('commendatio');
      expect(run.vacantia).toBeNull();
      // Nothing is held until a King is taken: the choice is what gives the Run its army.
      expect(run.army).toEqual([]);
      expect(run.cards).toEqual([]);
      expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
      const offers = run.commendatio!.kingOffers;
      expect(offers).toHaveLength(3);
      expect(new Set(offers).size).toBe(3);
      for (const id of offers) expect(RUN_STARTER_CARDS.some((king) => king.id === id)).toBe(true);
      return offers.join(',');
    });
    // Shuffled by the Run's own seed, so two Runs are not handed the same three Kings.
    expect(new Set(dealt).size).toBeGreaterThan(1);
  });

  it('takes a King from the opening screen into its army, card and gold', () => {
    const run = createRun(war(), 42, { chooseKing: true });
    const chosen = run.commendatio!.kingOffers[0];
    const king = RUN_STARTER_CARDS.find((candidate) => candidate.id === chosen)!;
    const taken = takeCommendatioKing(run, chosen);

    expect(taken.phase).toBe('deployment');
    expect(taken.commendatio).toBeNull();
    expect(taken.cards).toHaveLength(1);
    expect(taken.cards[0].coreId).toBe(chosen);
    expect(taken.army.map((unit) => unit.type)).toEqual(king.pieces);
    expect(runCardUnitIds(taken.cards[0])).toEqual(taken.army.map((unit) => unit.id));
    expect(taken.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS + king.goldBonusTenths);
  });

  it('defaults to His Grace when no King is named', () => {
    expect(createRun(war(), 23).cards[0].coreId).toBe('his-grace');
  });

  it('moves a save parked on the retired opening grant into its Deployment', () => {
    const stale = {
      ...createRun(war(), 29),
      // Pinned, not CURRENT minus an offset: 33 is the version that HAD the opening grant, and
      // an offset silently re-aims at a different migration every time the current one moves.
      runSaveVersion: 33,
      phase: 'bona-vacantia',
      vacantia: {
        kind: 'opening', conflictIndex: 0, afterBattleIndex: 0, victoryGoldTenths: 0, offers: [], cardOffers: ['p'],
      },
    };
    const migrated = migrateRunSaveDocument(stale);

    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(migrated.phase).toBe('deployment');
    expect(migrated.vacantia).toBeNull();
    expect(migrated.cards[0].coreId).toBe('his-grace');
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

  it('reports which cards THIS Sectio visit admitted, so Expunctio can say so', () => {
    const base = firstSectio(31);
    const offer = createRunCardOffer(base, RUN_CARD_BY_ID['ppk-protected'], -1, 0);
    const run = {
      ...base,
      goldTenths: 400 * GOLD_SCALE,
      sectio: { ...base.sectio!, cardOffers: [offer] },
    };
    // A visit that has bought nothing has admitted nothing, however the Run came to hold its cards.
    expect(sectioAdmittedCardIds(run).size).toBe(0);

    const acquired = performAdlectio(run, offer.offerId);
    const admitted = acquired.cards.at(-1)!;
    expect([...sectioAdmittedCardIds(acquired)]).toEqual([admitted.id]);
    expect(sectioAdmittedCardIds(acquired).has(acquired.cards[0].id)).toBe(false);

    // Struck by the same visit that bought it: no longer held, still this visit's doing, and
    // Expunctio shows that record beside the cards still held.
    const struck = performExpunctio(acquired, admitted.id);
    expect(struck.cards.some((card) => card.id === admitted.id)).toBe(false);
    expect([...sectioAdmittedCardIds(struck)]).toEqual([admitted.id]);

    // Reset restores the entry snapshot, so the visit has admitted nothing again.
    expect(sectioAdmittedCardIds(resetSectio(struck)).size).toBe(0);
  });

  it('admits one card however much gold is left over', () => {
    // The refusal is the rule, not the price: the Run below can pay for the whole row twice
    // and still leaves with one card.
    const base = { ...firstSectio(59), goldTenths: 10_000 };
    const funded = {
      ...base,
      sectio: { ...base.sectio!, entrySnapshot: { ...base.sectio!.entrySnapshot, goldTenths: 10_000 } },
    };
    const [first, second] = funded.sectio!.cardOffers;

    const once = performAdlectio(funded, first.offerId);
    expect(once.sectio!.adlectedCardOfferIds).toEqual([first.offerId]);
    expect(sectioAdlectioSpent(once)).toBe(true);

    const twice = performAdlectio(once, second.offerId);
    expect(twice).toBe(once);
    expect(twice.cards).toHaveLength(once.cards.length);
    expect(twice.goldTenths).toBe(once.goldTenths);
  });

  it('returns the admission to the visit when the Sectio is reset', () => {
    // What keeps one card from being a misclick: Reset restores the entry snapshot, and the
    // player may then admit a different one.
    const base = { ...firstSectio(61), goldTenths: 10_000 };
    const funded = {
      ...base,
      sectio: { ...base.sectio!, entrySnapshot: { ...base.sectio!.entrySnapshot, goldTenths: 10_000 } },
    };
    const [first, second] = funded.sectio!.cardOffers;

    const reset = resetSectio(performAdlectio(funded, first.offerId));
    expect(sectioAdlectioSpent(reset)).toBe(false);

    const rechosen = performAdlectio(reset, second.offerId);
    expect(rechosen.sectio!.adlectedCardOfferIds).toEqual([second.offerId]);
    expect(rechosen.cards.at(-1)!.coreId).toBe(second.id);
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
    // The live ceiling empties nothing: a Bishop card is Rare on material an early Battle can
    // afford, so the opening market keeps its whole ladder and only its prices are held down.
    expect(sectioPileRarityQuota(RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toEqual({
      common: 16, uncommon: 3, rare: 1,
    });
    const capped = sectioCardPile(101, 0, RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(capped).toHaveLength(RUN_SECTIO_CARD_PILE_SIZE);
    expect(capped.every((card) => card.value <= RUN_SECTIO_EARLY_CARD_MAX_VALUE)).toBe(true);
    expect(composition(capped)).toEqual({ common: 16, uncommon: 3, rare: 1 });

    // A ceiling low enough to empty one still hands that tier's share on: nothing at four gold
    // or less is Rare, so Common and Uncommon apportion the whole pile between themselves.
    expect(RUN_CARD_DECK.some((card) => card.value <= 4 && card.rarity === 'rare')).toBe(false);
    expect(sectioPileRarityQuota(4)).toEqual({ common: 17, uncommon: 3, rare: 0 });
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

describe('Manubiae — what the board pays for', () => {
  it('states one price per entry, and the two that predate the category still read it', () => {
    // The catalog is the source. A named constant that disagreed with it would be a second
    // price for the same deed, which is exactly what naming the category was meant to end.
    expect(RUN_MANUBIAE.map((entry) => entry.id)).toEqual([
      'advantageous-capture', 'royal-fork', 'discovered-check', 'double-check', 'en-passant', 'smothered-mate',
    ]);
    expect(new Set(RUN_MANUBIAE.map((entry) => entry.id)).size).toBe(RUN_MANUBIAE.length);
    expect(RUN_EN_PASSANT_BOUNTY_TENTHS).toBe(50);
    expect(RUN_ROYAL_FORK_BOUNTY_TENTHS).toBe(10);
    for (const entry of RUN_MANUBIAE) {
      // Exactly one of the two ways to carry a price, never both and never neither.
      expect(entry.goldTenths === null).toBe(Boolean(entry.priceNote));
      if (entry.goldTenths !== null) expect(entry.goldTenths).toBeGreaterThan(0);
      expect(entry.earnedBy.length).toBeGreaterThan(0);
    }
  });

  it('prices each fixed award at its catalog entry', () => {
    expect(manubiumGoldTenths({ id: 'royal-fork' })).toBe(10);
    expect(manubiumGoldTenths({ id: 'discovered-check' })).toBe(20);
    expect(manubiumGoldTenths({ id: 'double-check' })).toBe(30);
    expect(manubiumGoldTenths({ id: 'en-passant' })).toBe(50);
    expect(manubiumGoldTenths({ id: 'smothered-mate' })).toBe(50);
  });

  it('scales an advantageous capture by the material actually won', () => {
    // A pawn taking a queen is not the same deed as a rook taking one, so it is not paid the
    // same. Two tenths a point keeps every rung exact in the gold scale — no rounding rule.
    const won = (marginPoints: number) => manubiumGoldTenths({ id: 'advantageous-capture', marginPoints });
    expect(won(PIECE_VALUE.queen - PIECE_VALUE.pawn)).toBe(16);
    expect(won(PIECE_VALUE.queen - PIECE_VALUE.rook)).toBe(8);
    expect(won(PIECE_VALUE.rook - PIECE_VALUE.knight)).toBe(4);
    // An even or losing trade is not an advantageous capture and never pays.
    expect(won(0)).toBe(0);
    expect(won(-4)).toBe(0);
  });

  it('is worth what a unit STARTED as, so promotion never re-prices it', () => {
    // The Run roster has no promotion concept — a queened pawn is a Pawn again next Battle —
    // and this keeps the board agreeing with it, on both sides of the comparison.
    expect(manubiaeUnitWorth({ type: 'queen', promotedFrom: 'pawn' })).toBe(PIECE_VALUE.pawn);
    expect(manubiaeUnitWorth({ type: 'knight', promotedFrom: 'pawn' })).toBe(PIECE_VALUE.pawn);
    expect(manubiaeUnitWorth({ type: 'queen' })).toBe(PIECE_VALUE.queen);
    // No purchase price, so no margin either way: a King and an obstacle are unpriceable,
    // not free. The King's zero on the scale is a sentinel, and reading it as worth would
    // make every capture a King makes look advantageous.
    expect(manubiaeUnitWorth({ type: 'king' })).toBeNull();
    expect(manubiaeUnitWorth({ type: 'rock' })).toBeNull();
    expect(manubiaeUnitWorth(null)).toBeNull();
  });

  it('pays the moment it lands, and pays again for the next one', () => {
    const battle = inBattle(createRun(war(), 11));

    const once = payRunManubium(battle, { id: 'en-passant' }, { x: 3, y: 4 })!;
    expect(once.run.goldTenths).toBe(battle.goldTenths + RUN_EN_PASSANT_BOUNTY_TENTHS);

    const twice = payRunManubium(once.run, { id: 'en-passant' }, { x: 3, y: 4 })!;
    expect(twice.run.goldTenths).toBe(battle.goldTenths + 2 * RUN_EN_PASSANT_BOUNTY_TENTHS);
  });

  it('hands back the notice that accounts for the payment, welded to the paid document', () => {
    // The gold and the report of the gold are one return value on purpose (ADR-0525): there
    // is no call that produces gold and leaves the player with nothing to see or read.
    const battle = inBattle(createRun(war(), 21));

    const passant = payRunManubium(battle, { id: 'en-passant' }, { x: 5, y: 2 })!;
    expect(passant.notice.goldTenths).toBe(50);
    expect(passant.notice.at).toEqual({ x: 5, y: 2 });
    expect(passant.notice.log).toContain('En passant');
    expect(passant.notice.log).toContain('5');

    const smothered = payRunManubium(battle, { id: 'smothered-mate' }, { x: 1, y: 6 })!;
    expect(smothered.notice.log).toContain('Smothered mate');

    // The scaled one reports the number it actually paid, not the rate it was paid at.
    const capture = payRunManubium(battle, { id: 'advantageous-capture', marginPoints: 8 }, { x: 2, y: 2 })!;
    expect(capture.notice.goldTenths).toBe(16);
    expect(capture.notice.log).toContain('Advantageous capture');
    expect(capture.notice.log).toContain('16');
  });

  it('pays nothing outside a Battle, nothing without a runtime, and nothing for a worthless award', () => {
    const sectio = firstSectio(12);
    expect(payRunManubium(sectio, { id: 'en-passant' }, { x: 0, y: 0 })).toBeNull();

    const noRuntime: RunDocument = { ...sectio, phase: 'battle', battleRuntime: null };
    expect(payRunManubium(noRuntime, { id: 'en-passant' }, { x: 0, y: 0 })).toBeNull();

    // An even trade produces no notice at all rather than a "0 gold claimed" line.
    const battle = inBattle(createRun(war(), 14));
    expect(payRunManubium(battle, { id: 'advantageous-capture', marginPoints: 0 }, { x: 0, y: 0 })).toBeNull();
  });

  it('is taken back with the move that earned it', () => {
    // The Undo checkpoint is captured BEFORE the move commits, so restoring it removes the
    // gold the move paid -- no Manubium can be claimed twice by taking it back, and none is
    // ever worth undoing for profit.
    const battle = inBattle(createRun(war(), 13));
    const checkpoint = captureRunBattleUndo(battle);
    const paid = payRunManubium(battle, { id: 'double-check' }, { x: 1, y: 1 })!;
    expect(paid.run.goldTenths).toBeGreaterThan(battle.goldTenths);

    const undone = undoRunBattleMove(paid.run, checkpoint);
    expect(undone.goldTenths).toBe(battle.goldTenths - RUN_BATTLE_UNDO_COST_TENTHS);
  });

  it('charges every checkpoint the walk back passes over, so each step costs its own gold', () => {
    // Two moves' worth of checkpoints cut from the SAME purse -- neither move earned anything.
    // Restoring the older one verbatim would hand back the gold the first Undo spent, and the
    // whole rewind would cost one gold however deep it went.
    const battle = inBattle(createRun(war(), 13));
    const older = captureRunBattleUndo(battle)!;
    const newer = captureRunBattleUndo(battle)!;

    const first = undoRunBattleMove(battle, newer);
    expect(first.goldTenths).toBe(battle.goldTenths - RUN_BATTLE_UNDO_COST_TENTHS);

    const second = undoRunBattleMove(first, chargeRunBattleUndoCheckpoint(older));
    expect(second.goldTenths).toBe(battle.goldTenths - 2 * RUN_BATTLE_UNDO_COST_TENTHS);
  });

  it('refuses the step a charged checkpoint can no longer pay for, and never books a debt', () => {
    const battle = inBattle({ ...createRun(war(), 13), goldTenths: RUN_BATTLE_UNDO_COST_TENTHS });
    const checkpoint = captureRunBattleUndo(battle)!;
    expect(canUndoRunBattleMove(battle, checkpoint)).toBe(true);

    // Passed over once, this checkpoint's purse is empty -- and an empty purse is where it
    // stops. It is not carried into debt, it simply stops being reachable.
    const charged = chargeRunBattleUndoCheckpoint(checkpoint);
    expect(charged.goldTenths).toBe(0);
    expect(chargeRunBattleUndoCheckpoint(charged).goldTenths).toBe(0);
    expect(canUndoRunBattleMove(battle, charged)).toBe(false);
    expect(undoRunBattleMove(battle, charged)).toBe(battle);
  });

  it('asks a royal fork for a Rook or better, reading the bar off the piece scale itself', () => {
    // A bare 5 would silently become some other piece's worth if the scale were re-weighted.
    expect(RUN_ROYAL_FORK_MIN_VICTIM_VALUE).toBe(PIECE_VALUE.rook);
    expect(PIECE_VALUE.queen).toBeGreaterThanOrEqual(RUN_ROYAL_FORK_MIN_VICTIM_VALUE);
    expect(PIECE_VALUE.bishop).toBeLessThan(RUN_ROYAL_FORK_MIN_VICTIM_VALUE);
    expect(PIECE_VALUE.knight).toBeLessThan(RUN_ROYAL_FORK_MIN_VICTIM_VALUE);
  });
});

describe('Run rules bind the King as firmly as the market', () => {
  it('never opens a narrow Run on a King that breaks its own rule', () => {
    // Ten of the fifteen starters are three-long, Z-shaped, or three-tall. Handing one to a
    // two-by-two Run would break the rule on the very first card, before the market has offered
    // anything, and that formation then sits in the army for the whole Run.
    const wide = RUN_STARTER_CARDS.filter((card) => cardAllowedByRules(card, LEGACY_RUN_RULES));
    const narrow = RUN_STARTER_CARDS.filter((card) => cardAllowedByRules(card, DEFAULT_RUN_RULES));
    expect(wide).toHaveLength(15);
    expect(narrow).toHaveLength(5);

    for (let seed = 0; seed < 40; seed += 1) {
      for (const id of openingKingOffers(seed, DEFAULT_RUN_RULES)) {
        const king = RUN_STARTER_CARDS.find((card) => card.id === id);
        expect(king, id).toBeDefined();
        expect(formationSpan(king!.formation), id).toBeLessThanOrEqual(2);
      }
    }
  });

  it('still deals a full choice from the narrowed set', () => {
    // Five eligible Kings against three offered, so the opening is still a choice rather than a
    // formality -- but the same five recur every Run, which is the cost of the narrow rule.
    const offers = openingKingOffers(11, DEFAULT_RUN_RULES);
    expect(offers).toHaveLength(3);
    expect(new Set(offers).size).toBe(3);
  });

  it('opens a Run on the Kings its own rules admit', () => {
    const narrow = createRun(war(), 7, { chooseKing: true, rules: DEFAULT_RUN_RULES });
    for (const id of narrow.commendatio!.kingOffers) {
      expect(formationSpan(RUN_STARTER_CARDS.find((c) => c.id === id)!.formation)).toBeLessThanOrEqual(2);
    }
    const wide = createRun(war(), 7, { chooseKing: true, rules: LEGACY_RUN_RULES });
    expect(wide.commendatio!.kingOffers).not.toEqual(narrow.commendatio!.kingOffers);
  });
});

describe('card pricing is a Run rule', () => {
  const priced = (id: string, rules: typeof DEFAULT_RUN_RULES) => {
    const card = RUN_CARD_DECK.find((c) => c.id === id);
    expect(card, id).toBeDefined();
    return runCardCost(card!, rules);
  };
  const material = { ...DEFAULT_RUN_RULES, pricing: 'material' as const };
  const density = { ...DEFAULT_RUN_RULES, pricing: 'density' as const };

  it('weights material by density unless the Run was told otherwise', () => {
    expect(DEFAULT_RUN_RULES.pricing).toBe('density');
    // Legacy Runs keep the game they were dealt: their offers were priced flat when they were
    // dealt, so the mode they are bound to has to stay flat too.
    expect(LEGACY_RUN_RULES.pricing).toBe('material');
  });

  it('charges material when told to, which is what the game has always done', () => {
    for (const card of RUN_CARD_DECK) {
      expect(runCardCost(card, material), card.id).toBe(card.value);
    }
  });

  it('charges concentration when told to, so the same material costs differently', () => {
    // A Queen alone and a Queen behind a Pawn are 9 and 10 material -- nearly equal -- but one
    // occupies a single square. Material pricing cannot tell them apart; density can.
    expect(priced('q', material)).toBe(9);
    expect(priced('pq-front', material)).toBe(10);
    expect(priced('q', density)).toBe(16);
    expect(priced('pq-front', density)).toBe(13);
  });

  it('leaves the opening market inside the opening purse', () => {
    // The early ceiling is a VALUE ceiling, so under density an offer can cost more than the
    // ceiling reads. It still cannot outrun the starting gold -- the dearest card the six-value
    // band admits is a lone Rook, at six against eight.
    const early = RUN_CARD_DECK.filter((card) => (
      card.value <= RUN_SECTIO_EARLY_CARD_MAX_VALUE && cardAllowedByRules(card, DEFAULT_RUN_RULES)
    ));
    expect(early.length).toBeGreaterThan(0);
    const dearest = Math.max(...early.map((card) => runCardCost(card, DEFAULT_RUN_RULES)));
    expect(dearest).toBe(6);
    expect(dearest).toBeLessThanOrEqual(RUN_STARTING_GOLD);
  });

  it('never gives a card away, however thin it is', () => {
    for (const card of RUN_CARD_DECK) {
      expect(runCardCost(card, density), card.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps every price whole, because gold is whole', () => {
    for (const card of RUN_CARD_DECK) {
      expect(Number.isInteger(runCardCost(card, density)), card.id).toBe(true);
    }
  });

  it('prices an offer by the rules of the Run that was dealt it', () => {
    const materialRun = createRun(war(), 5, { rules: material });
    const densityRun = createRun(war(), 5, { rules: density });
    expect(materialRun.rules.pricing).toBe('material');
    expect(densityRun.rules.pricing).toBe('density');
    const asMaterial = sectioCardOffersAtCursor(5, 0, 0, 3, material);
    const asDensity = sectioCardOffersAtCursor(5, 0, 0, 3, density);
    expect(asDensity.map((o) => o.id)).toEqual(asMaterial.map((o) => o.id));
    expect(asDensity.map((o) => o.cost)).not.toEqual(asMaterial.map((o) => o.cost));
  });
});
