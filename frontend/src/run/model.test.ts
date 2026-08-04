import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  ATARAXIA_BY_TIER,
  ATARAXIA_TIERS,
  AGMINATE_COST,
  AGMINATE_DISPLAY_NAME,
  CONCINNOUS_OFFER_DENOMINATOR,
  ADLECTED_COST,
  GOLD_SCALE,
  HIERATIC_AGMINATE_OFFER_DENOMINATOR,
  RUN_CARD_DECK,
  PIECE_VALUE,
  EUTACTIC_COST,
  RUN_FORMAT_VERSION,
  RUN_OPENING_OFFER_COUNT,
  RUN_STARTING_GOLD,
  RUN_STARTING_GOLD_TENTHS,
  LEGATINE_ADLECTED_OFFER_DENOMINATOR,
  acquireRelic,
  battleVictoryGoldTenths,
  beginBattle,
  buyCard,
  canLeaveShop,
  cashOutPawn,
  closeBattle,
  createRun,
  createRunCardOffer,
  deterioratePestiferousCards,
  formatGold,
  grantGold,
  hieraticAgminateAcquisitionTarget,
  leaveAftermath,
  leaveShop,
  observeRunUnitDeath,
  normalizeRunDocument,
  OPENING_SHOP_ROLL_BATTLE_INDEX,
  openingShopOffers,
  openShop,
  prepareDeployment,
  resetShop,
  runAbilityDisplayName,
  sellArmyUnit,
  shopHasChanges,
  takeVacantiaRelic,
  legatineAdlectedAcquisitionTarget,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function war(battles = 4, lootAt: number[] = []): RunWarSnapshot {
  return {
    id: 'war-test',
    name: 'Test War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => {
      const level = createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      return { level, loot: lootAt.includes(index) };
    }),
  };
}

function cheapestOpeningOffer(run: RunDocument) {
  return [...run.shop!.cardOffers].sort((left, right) => left.cost - right.cost)[0];
}

/** A Conflict that ends in loot now opens with Bona Vacantia, so a run may start there. */
function pastOpeningRelic(run: RunDocument): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia) return run;
  return takeVacantiaRelic(run, run.vacantia.offers[0], run.army[0].id);
}

function deployedRun(seed = 17, snapshot = war()): RunDocument {
  let run = pastOpeningRelic(createRun(snapshot, seed, '2026-01-01T00:00:00.000Z'));
  // A qualifier can price an opening offer past the starting gold, so open with the
  // cheapest card rather than whichever one landed in slot 0.
  run = buyCard(run, cheapestOpeningOffer(run).offerId);
  run = prepareDeployment(leaveShop(run));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

function deployedAtaraxiaRun(seed = 17, snapshot = war()): RunDocument {
  let run = pastOpeningRelic(createRun(snapshot, seed, 1, '2026-01-01T00:00:00.000Z'));
  run = buyCard(run, cheapestOpeningOffer(run).offerId);
  run = prepareDeployment(leaveShop(run));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

function openingShopRunWithPawn(snapshot = war()): RunDocument {
  for (let seed = 1; seed <= 10_000; seed += 1) {
    const run = createRun(snapshot, seed, '2026-01-01T00:00:00.000Z');
    const offer = run.shop!.cardOffers.find((candidate) => candidate.pieces.includes('pawn'));
    if (offer) return buyCard(run, offer.offerId);
  }
  throw new Error('Expected a seeded opening card containing a Pawn.');
}

function deployedRunWithPawn(snapshot = war()): RunDocument {
  const run = prepareDeployment(leaveShop(openingShopRunWithPawn(snapshot)));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

describe('Run piece economy', () => {
  it('stores every ability under the exact word the game says (ADR-0374)', () => {
    expect(AGMINATE_DISPLAY_NAME).toBe('Agminate');
    expect(runAbilityDisplayName('agminate')).toBe('Agminate');
    expect(runAbilityDisplayName('eutactic')).toBe('Eutactic');
    expect(runAbilityDisplayName('adlected')).toBe('Adlected');
    // The cutover's invariant: a stored value and its name are one word, so a document,
    // a media locator and a card face can no longer drift into separate vocabularies.
    for (const ability of ['adlected', 'eutactic', 'agminate'] as const) {
      expect(runAbilityDisplayName(ability).toLowerCase()).toBe(ability);
    }
  });

  it('enumerates every unique multiset worth 1–9 points exactly once', () => {
    expect(RUN_CARD_DECK).toHaveLength(49);
    expect(new Set(RUN_CARD_DECK.map((card) => card.id)).size).toBe(49);
    for (const card of RUN_CARD_DECK) {
      expect(card.value).toBeGreaterThanOrEqual(1);
      expect(card.value).toBeLessThanOrEqual(9);
      expect(card.pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0)).toBe(card.value);
    }
  });

  it('starts with the permanent King, two Pawns, eight gold, and an optional three-card deal', () => {
    const run = createRun(war(), 91);
    expect(run.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(run.army.every((unit) => unit.name.length > 0)).toBe(true);
    expect(new Set(run.army.map((unit) => unit.name)).size).toBe(run.army.length);
    expect(run.army.every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);
    expect(createRun(war(), 91).army.map((unit) => unit.inspectionSeed))
      .toEqual(run.army.map((unit) => unit.inspectionSeed));
    expect(run.army.map((unit) => [unit.type, unit.number])).toEqual([['king', 1], ['pawn', 1], ['pawn', 2]]);
    expect(run.nextArmyUnitNumberByType.pawn).toBe(3);
    expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
    expect(run.phase).toBe('shop');
    expect(run.shop?.kind).toBe('opening');
    expect(run.shop?.cardOffers).toHaveLength(RUN_OPENING_OFFER_COUNT);
    expect(new Set(run.shop?.cardOffers.map((offer) => offer.offerId)).size).toBe(RUN_OPENING_OFFER_COUNT);
    expect(new Set(run.shop?.cardOffers.map((offer) => offer.value)).size).toBe(RUN_OPENING_OFFER_COUNT);
    expect(run.shop?.cardOffers.every((offer) => offer.value >= 1 && offer.value <= 8)).toBe(true);
    expect(run.shop?.cardOffers.some((offer) => offer.cost <= RUN_STARTING_GOLD)).toBe(true);
    expect(openingShopOffers(91)).toEqual(run.shop?.cardOffers);
    expect(createRun(war(), 91).shop?.cardOffers).toEqual(run.shop?.cardOffers);
    expect(canLeaveShop(run)).toBe(true);
    const continued = leaveShop(run);
    expect(continued.phase).toBe('deployment');
    expect(continued.battleIndex).toBe(0);
    expect(continued.cards).toEqual([]);
    expect(continued.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(continued.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
  });

  it('buys the opening card in place and waits for explicit Continue before deployment', () => {
    const fresh = createRun(war(), 91);
    const offer = cheapestOpeningOffer(fresh);
    const bought = buyCard(fresh, offer.offerId);
    const card = bought.cards[0];

    expect(bought.phase).toBe('shop');
    expect(bought.shop?.kind).toBe('opening');
    expect(bought.shop?.purchasedCardOfferIds).toEqual([offer.offerId]);
    expect(bought.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS - offer.cost * GOLD_SCALE);
    expect(card).toMatchObject({ coreId: offer.id, cardType: offer.cardType, acquiredAfterBattleIndex: 0 });
    expect(card.unitIds).toHaveLength(offer.pieces.length);
    expect(bought.army.filter((unit) => card.unitIds.includes(unit.id)).map((unit) => unit.type)).toEqual(offer.pieces);
    expect(bought.nextCardSequence).toBe(2);
    expect(canLeaveShop(bought)).toBe(true);
    const reset = resetShop(bought);
    expect(reset.phase).toBe('shop');
    expect(reset.shop?.kind).toBe('opening');
    expect(reset.shop?.purchasedCardOfferIds).toEqual([]);
    expect(reset.shop?.cardOffers).toEqual(fresh.shop?.cardOffers);
    expect(reset.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(reset.cards).toEqual([]);
    expect(reset.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
    expect(canLeaveShop(reset)).toBe(true);
    const continued = leaveShop(bought);
    expect(continued.phase).toBe('deployment');
    expect(continued.battleIndex).toBe(0);
  });

  it('rolls opening qualifiers at every core value, out of reach included', () => {
    const offers = openingShopOffers(91);
    expect(offers.map((offer) => offer.cardType)).toEqual(['legatine', 'concinnous', null]);
    expect(offers.map((offer) => offer.cost)).toEqual([
      offers[0].value + ADLECTED_COST,
      offers[1].value + EUTACTIC_COST,
      offers[2].value,
    ]);
    expect(offers[1].effectTargetIndex).not.toBeNull();

    const qualifiedByValue = new Map<number, number>();
    let outOfReach = 0;
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const opening = openingShopOffers(seed);
      // ADR-0323 requires an opening purchase, so at least one offer always stays buyable.
      expect(opening.some((offer) => offer.cost <= RUN_STARTING_GOLD)).toBe(true);
      for (const offer of opening) {
        expect(offer.cost).toBe(
          offer.cardType === 'legatine'
            ? offer.value + ADLECTED_COST
            : offer.cardType === 'hieratic'
              ? offer.value + AGMINATE_COST
              : offer.cardType === 'concinnous'
                ? offer.value + EUTACTIC_COST
                : offer.value,
        );
        if (offer.cost > RUN_STARTING_GOLD) outOfReach += 1;
        if (offer.cardType !== null) {
          qualifiedByValue.set(offer.value, (qualifiedByValue.get(offer.value) ?? 0) + 1);
        }
      }
    }
    // No core value is excluded from qualifying: a Tactical card at value 6 or above
    // costs more than the opening budget and is offered anyway.
    expect([...qualifiedByValue.keys()].sort((left, right) => left - right))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(outOfReach).toBeGreaterThan(0);
  });

  it('drops the qualifier on the cheapest opening offer only when the deal has nothing affordable', () => {
    // Values 6, 7 and 8 all rolling a surcharge is the one deal the starting gold cannot
    // buy; that opening repairs its cheapest card rather than blocking Continue.
    const rolledOpening = (seed: number) => openingShopOffers(seed).map((offer, slotIndex) => ({
      emitted: offer,
      rolled: createRunCardOffer(
        { seed, ataraxiaTier: 0 },
        RUN_CARD_DECK.find((card) => card.id === offer.id)!,
        OPENING_SHOP_ROLL_BATTLE_INDEX,
        slotIndex,
      ),
    }));
    const degenerate = Array.from({ length: 40_000 }, (_, index) => index + 1).find((seed) => (
      rolledOpening(seed).some((slot) => slot.emitted.cardType !== slot.rolled.cardType)
    ));
    expect(degenerate).toBeDefined();

    const slots = rolledOpening(degenerate!);
    const repaired = slots.filter((slot) => slot.emitted.cardType !== slot.rolled.cardType);
    expect(repaired).toHaveLength(1);
    expect(repaired[0].rolled.cardType).not.toBeNull();
    expect(repaired[0].emitted.cardType).toBeNull();
    expect(repaired[0].emitted.cost).toBe(repaired[0].emitted.value);
    expect(repaired[0].emitted.cost).toBe(
      Math.min(...slots.map((slot) => slot.emitted.cost)),
    );
    // It is the only affordable card, and it was repaired because nothing else was.
    expect(slots.filter((slot) => slot.emitted.cost <= RUN_STARTING_GOLD)).toHaveLength(1);
    expect(slots.every((slot) => slot.rolled.cost > RUN_STARTING_GOLD)).toBe(true);
  });

  it('keeps opening Pestiferous draws to Ataraxia I', () => {
    const baseline = new Set<string | null>();
    const ataraxia = new Set<string | null>();
    for (let seed = 1; seed <= 3_000; seed += 1) {
      for (const offer of openingShopOffers(seed)) baseline.add(offer.cardType);
      for (const offer of openingShopOffers(seed, 1)) ataraxia.add(offer.cardType);
    }
    expect(baseline.has('pestiferous')).toBe(false);
    expect(ataraxia.has('pestiferous')).toBe(true);
    expect(createRun(war(), 91, 1).shop?.cardOffers).toEqual(openingShopOffers(91, 1));
  });

  it('rolls the opening independently of the Shop after Battle 1, which shares battleIndex 0', () => {
    // Both draws would otherwise seed from (seed, battleIndex 0, slot, coreId) and mirror
    // each other whenever the same core identity is offered twice.
    const differing = Array.from({ length: 200 }, (_, index) => index + 1).filter((seed) => (
      openingShopOffers(seed).some((offer, slotIndex) => {
        const core = RUN_CARD_DECK.find((card) => card.id === offer.id)!;
        const postBattle = createRunCardOffer({ seed, ataraxiaTier: 0 }, core, 0, slotIndex);
        return offer.effectSeed !== postBattle.effectSeed;
      })
    ));
    expect(differing).toHaveLength(200);
  });

  it('keeps every affordable core Units card reachable from seeded openings', () => {
    const observed = new Set<string>();
    for (let seed = 1; seed <= 10_000; seed += 1) {
      for (const offer of openingShopOffers(seed)) observed.add(offer.id);
    }
    expect(observed).toEqual(new Set(RUN_CARD_DECK.filter((card) => card.value <= 8).map((card) => card.id)));
  });

  it('names opening and later Shop units in the same transaction that adds them to the army', () => {
    const fresh = createRun(war(), 91);
    const openingPurchase = buyCard(fresh, cheapestOpeningOffer(fresh).offerId);
    expect(openingPurchase.army.filter((unit) => unit.source === 'shop').every((unit) => unit.name.length > 0)).toBe(true);
    expect(openingPurchase.army.filter((unit) => unit.source === 'shop').every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);

    const shop = openShop({ ...deployedRun(91), goldTenths: 100 * GOLD_SCALE }, []);
    const bought = buyCard(shop, shop.shop!.cardOffers[0].offerId);
    expect(bought.army.filter((unit) => unit.source === 'shop').every((unit) => unit.name.length > 0)).toBe(true);
    expect(bought.army.filter((unit) => unit.source === 'shop').every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);
    expect(new Set(bought.army.map((unit) => unit.name)).size).toBe(bought.army.length);
  });

  it('allows multiple distinct card purchases in the same shop while gold remains', () => {
    const shop = openShop({ ...deployedRun(), goldTenths: 100 * GOLD_SCALE }, []);
    const [first, second] = shop.shop!.cardOffers;
    const boughtFirst = buyCard(shop, first.offerId);
    const boughtSecond = buyCard(boughtFirst, second.offerId);
    expect(boughtSecond.shop?.purchasedCardOfferIds).toEqual([first.offerId, second.offerId]);
    expect(boughtSecond.cards).toHaveLength(shop.cards.length + 2);
    expect(buyCard(boughtSecond, first.offerId)).toBe(boughtSecond);
  });

  it('leaves each unpurchased card available independently when another card is bought', () => {
    const seed = Array.from({ length: 100 }, (_, index) => index + 1).find((candidate) => {
      const cheapest = [...openingShopOffers(candidate)]
        .sort((left, right) => left.cost - right.cost)
        .slice(0, 2);
      return cheapest.reduce((total, offer) => total + offer.cost * GOLD_SCALE, 0) <= RUN_STARTING_GOLD_TENTHS;
    });
    expect(seed).toBeDefined();
    const opening = createRun(war(), seed!);
    const affordable = [...opening.shop!.cardOffers]
      .sort((left, right) => left.cost - right.cost)
      .slice(0, 2);

    const boughtFirst = buyCard(opening, affordable[0].offerId);
    const boughtSecond = buyCard(boughtFirst, affordable[1].offerId);
    expect(boughtSecond.shop?.purchasedCardOfferIds).toEqual(affordable.map((offer) => offer.offerId));
  });

  it('assigns stable per-type numbers to acquired units', () => {
    const run = openingShopRunWithPawn();
    const pawnNumbers = run.army.filter((unit) => unit.type === 'pawn').map((unit) => unit.number);
    expect(new Set(pawnNumbers).size).toBe(pawnNumbers.length);
    expect(pawnNumbers).toEqual(Array.from({ length: pawnNumbers.length }, (_, index) => index + 1));
  });

  it('sells every non-King and formats Fair Scales quarter-gold exactly', () => {
    let shop = openShop(deployedRunWithPawn(), []);
    shop = acquireRelic(shop, 'fair-scales');
    const pawn = shop.army.find((unit) => unit.type === 'pawn')!;
    const sold = sellArmyUnit(shop, pawn.id);
    expect(sold.goldTenths - shop.goldTenths).toBe(7.5);
    expect(formatGold(7.5)).toBe('0.75');
    expect(sold.shop?.soldUnits).toEqual([{ unit: pawn, proceedsTenths: 7.5 }]);
    expect(sellArmyUnit(sold, 'run-king')).toBe(sold);
  });

  it('resets the complete shop transaction without rerolling its offers', () => {
    let shop = openShop({ ...deployedRun(29), goldTenths: 100 * GOLD_SCALE }, []);
    const originalOffers = structuredClone(shop.shop!.cardOffers);
    const originalArmy = structuredClone(shop.army);
    const originalGold = shop.goldTenths;
    const bought = shop.shop!.cardOffers[0].offerId;
    shop = buyCard(shop, bought);
    shop = sellArmyUnit(shop, shop.army.find((unit) => unit.type !== 'king')!.id);
    expect(shopHasChanges(shop)).toBe(true);

    const reset = resetShop(shop);
    expect(reset.shop?.cardOffers).toEqual(originalOffers);
    expect(reset.shop?.purchasedCardOfferIds).toEqual([]);
    expect(reset.shop?.soldUnits).toEqual([]);
    expect(reset.army).toEqual(originalArmy);
    expect(reset.goldTenths).toBe(originalGold);
    expect(shopHasChanges(reset)).toBe(false);
  });
});

describe('the aftermath report that closes a Battle', () => {
  it('stops on its own screen and banks nothing until the player leaves it', () => {
    const battle = deployedRun(12, war(2));
    const closed = closeBattle(battle, { survivingUnitIds: [], turns: 9 });

    expect(closed.phase).toBe('aftermath');
    expect(closed.shop).toBeNull();
    // The gold is reported here and paid on Continue, so the screen cannot promise
    // a number the Run then fails to hand over.
    expect(closed.goldTenths).toBe(battle.goldTenths);
    expect(closed.aftermath?.goldTenths).toBe(GOLD_SCALE);

    const shop = leaveAftermath(closed);
    expect(shop.phase).toBe('shop');
    expect(shop.goldTenths).toBe(battle.goldTenths + GOLD_SCALE);
    expect(shop.shop?.victoryGoldTenths).toBe(GOLD_SCALE);
    expect(shop.aftermath).toBeNull();
  });

  it('reports the turns, the clock and the units that fell', () => {
    const battle = deployedRun(12, war(2));
    const fallen = battle.army.find((unit) => unit.type !== 'king')!;
    const withLoss = observeRunUnitDeath(battle, fallen.id).run;
    const closed = closeBattle(withLoss, { survivingUnitIds: [], turns: 23 });

    expect(closed.aftermath?.turns).toBe(23);
    expect(closed.aftermath?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(closed.aftermath?.fallenUnits).toEqual([
      { id: fallen.id, name: fallen.name, type: fallen.type },
    ]);
    // The runtime that knows who fell is torn down when the shop opens, so the list
    // has to survive on the report rather than be recomputed from it.
    expect(leaveAftermath(closed).battleRuntime).toBeNull();
  });

  it('carries the survivors it was given into the shop it opens', () => {
    const battle = acquireRelic(deployedRun(12, war(2)), 'mercenarys-rifle');
    const survivors = battle.army.map((unit) => unit.id);
    const closed = closeBattle(battle, { survivingUnitIds: survivors, turns: 4 });
    const bonus = battle.army.reduce((total, unit) => total + PIECE_VALUE[unit.type], 0);

    expect(closed.aftermath?.bonusGoldTenths).toBe(bonus);
    expect(closed.aftermath?.goldTenths).toBe(GOLD_SCALE + bonus);
    expect(leaveAftermath(closed).goldTenths).toBe(battle.goldTenths + GOLD_SCALE + bonus);
  });

  it('gives the final Battle straight to the War victory screen, which is its own report', () => {
    const first = leaveAftermath(closeBattle(deployedRun(12, war(2)), { survivingUnitIds: [], turns: 3 }));
    const finalBattle = beginBattle(prepareDeployment(leaveShop(first)), [], [], []);

    const won = closeBattle(finalBattle, { survivingUnitIds: [], turns: 3 });
    expect(won.phase).toBe('victory');
    expect(won.aftermath).toBeNull();
  });

  it('refuses to report a Battle that is not over, and a report that has already been left', () => {
    const battle = deployedRun(12, war(2));
    const closed = closeBattle(battle, { survivingUnitIds: [], turns: 3 });
    expect(closeBattle(closed, { survivingUnitIds: [], turns: 99 })).toBe(closed);
    expect(leaveAftermath(battle)).toBe(battle);
    expect(leaveAftermath(leaveAftermath(closed)).phase).toBe('shop');
  });
});

describe('Run progression and relic offers', () => {
  it('grants an exact administrator-entered gold amount through the Run model', () => {
    const run = deployedRun();
    const granted = grantGold(run, 27);
    expect(granted.goldTenths).toBe(run.goldTenths + 27);
    expect(grantGold(granted, 0)).toBe(granted);
  });

  it('opens a shop with strength-scaled gold after non-final victories and skips the shop after the final boss', () => {
    const firstBattle = deployedRun(12, war(2));
    const afterFirst = openShop(firstBattle, []);
    expect(afterFirst.phase).toBe('shop');
    expect(afterFirst.goldTenths).toBe(firstBattle.goldTenths + GOLD_SCALE);
    expect(afterFirst.shop?.victoryGoldTenths).toBe(GOLD_SCALE);

    const finalBattle = beginBattle(prepareDeployment(leaveShop(afterFirst)), [], [], []);
    const won = openShop(finalBattle, []);
    expect(won.phase).toBe('victory');
    expect(won.shop).toBeNull();
  });

  it('values each enemy King at one gold and every other enemy force at half standard value', () => {
    const snapshot = war(2);
    const level = snapshot.battles[0].level;
    level.layers.units.push(
      { x: 0, y: 0, type: 'pawn', side: 'enemy' },
      { x: 1, y: 0, type: 'knight', side: 'enemy' },
      { x: 2, y: 0, type: 'bishop', side: 'enemy' },
      { x: 3, y: 0, type: 'rook', side: 'enemy' },
      { x: 5, y: 0, type: 'queen', side: 'enemy' },
      { x: 6, y: 0, type: 'rock', side: 'neutral' },
      { x: 7, y: 7, type: 'queen', side: 'player' },
    );
    level.events = [{
      name: 'Enemy reserves',
      trigger: { kind: 'setup' },
      do: [{
        kind: 'spawn',
        side: 'enemy',
        roster: { pawn: 2, rook: 1, king: 1 },
        zoneIds: ['enemy-spawn'],
      }],
    }];

    expect(battleVictoryGoldTenths(level)).toBe(160);
    const battle = deployedRun(12, snapshot);
    const shop = openShop(battle, []);
    expect(shop.goldTenths).toBe(battle.goldTenths + 160);
    expect(shop.shop?.victoryGoldTenths).toBe(160);
  });

  it('upgrades an already-open fixed-reward shop exactly once', () => {
    const snapshot = war(2);
    snapshot.battles[0].level.layers.units.push({ x: 0, y: 0, type: 'queen', side: 'enemy' });
    const currentReward = battleVictoryGoldTenths(snapshot.battles[0].level);
    const current = openShop(deployedRun(12, snapshot), []);
    const legacy = {
      ...current,
      goldTenths: GOLD_SCALE,
      shop: { ...current.shop!, victoryGoldTenths: undefined as never },
    };
    const upgraded = normalizeRunDocument(legacy);

    expect(upgraded.goldTenths).toBe(currentReward);
    expect(upgraded.shop?.victoryGoldTenths).toBe(currentReward);
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('deterministically upgrades unnamed format-1 army units without resetting the Run', () => {
    const opening = createRun(war(), 73);
    const current = leaveShop(buyCard(opening, cheapestOpeningOffer(opening).offerId));
    const legacy = {
      ...current,
      formatVersion: 1,
      army: current.army.map(({ name: _name, ...unit }) => unit),
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    expect(upgraded.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(upgraded.id).toBe(current.id);
    expect(upgraded.army.map((unit) => unit.name)).toEqual(current.army.map((unit) => unit.name));
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('replaces the provisional format-2 fantasy names with role-appropriate historical identities', () => {
    const opening = createRun(war(), 73);
    const current = leaveShop(buyCard(opening, cheapestOpeningOffer(opening).offerId));
    const provisional = {
      ...current,
      formatVersion: 2,
      army: current.army.map((unit, index) => ({ ...unit, name: `Provisional Name ${index}` })),
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(provisional);

    expect(upgraded.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(upgraded.army.map((unit) => unit.name)).toEqual(current.army.map((unit) => unit.name));
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('assigns persistent inspection-scene seeds when upgrading format-3 units', () => {
    const opening = createRun(war(), 73);
    const current = leaveShop(buyCard(opening, cheapestOpeningOffer(opening).offerId));
    const legacy = {
      ...current,
      formatVersion: 3,
      army: current.army.map(({ inspectionSeed: _inspectionSeed, ...unit }) => unit),
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    expect(upgraded.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(upgraded.army.every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('normalizes legacy unit identities and shop reset state once', () => {
    const current = openShop(deployedRun(12, war(2)), []);
    const legacy = {
      ...current,
      army: current.army.map(({ number: _number, ...unit }) => unit),
      nextArmyUnitNumberByType: undefined,
      shop: {
        ...current.shop!,
        soldUnits: undefined,
        entrySnapshot: undefined,
      },
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    for (const type of new Set(upgraded.army.map((unit) => unit.type))) {
      const numbers = upgraded.army.filter((unit) => unit.type === type).map((unit) => unit.number);
      expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1));
    }
    expect(upgraded.shop?.soldUnits).toEqual([]);
    expect(upgraded.shop?.entrySnapshot.army).toEqual(upgraded.army);
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('rejects the retired draft phase and removes its fields from committed Runs', () => {
    const current = createRun(war(), 73);
    expect(() => normalizeRunDocument({
      ...current,
      phase: 'draft',
      draftOffers: [],
      chosenDraftId: null,
    } as unknown as RunDocument)).toThrow('retired Run draft phase');

    const committed = leaveShop(buyCard(current, cheapestOpeningOffer(current).offerId));
    const polluted = {
      ...committed,
      formatVersion: 7,
      army: committed.army.map((unit) => unit.type === 'king' ? unit : { ...unit, source: 'draft' }),
      draftOffers: [{ id: 'retired', draftId: 'retired', pieces: ['pawn'], value: 1 }],
      chosenDraftId: 'retired',
    } as unknown as RunDocument;
    const normalized = normalizeRunDocument(polluted);
    expect(normalized.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect('draftOffers' in normalized).toBe(false);
    expect('chosenDraftId' in normalized).toBe(false);
    expect(normalized.army.every((unit) => String(unit.source) !== 'draft')).toBe(true);
  });

  it('rejects older Shop documents instead of adapting a retired transaction shape', () => {
    const current = createRun(war(), 73);
    expect(() => normalizeRunDocument({
      ...current,
      formatVersion: 9,
    } as unknown as RunDocument)).toThrow('Older Run Shop documents are unsupported.');
  });

  it('burns all three seen Conflict offers, including the two not chosen', () => {
    // Battles 0 and 1 both close a Conflict, so beating each opens Bona Vacantia.
    const first = openShop(deployedRun(44, war(5, [0, 1, 3])), []);
    expect(first.phase).toBe('bona-vacantia');
    const firstOffers = first.vacantia!.offers;
    expect(firstOffers).toHaveLength(3);
    const chosen = takeVacantiaRelic(first, firstOffers[0], first.army[0].id);
    expect(chosen.phase).toBe('shop');
    const secondBattle = beginBattle(prepareDeployment(leaveShop(chosen)), [], [], []);
    const second = openShop(secondBattle, []);
    expect(second.phase).toBe('bona-vacantia');
    expect(second.vacantia!.offers).toHaveLength(3);
    expect(second.vacantia!.offers.some((relic) => firstOffers.includes(relic))).toBe(false);
  });

  it('keeps one Shopkey offer for the whole Conflict', () => {
    const withKey = acquireRelic(deployedRun(57, war(4)), 'merchants-shopkey');
    const firstShop = openShop(withKey, []);
    expect(firstShop.shop!.paidRelicOffer).not.toBeNull();
    const offer = firstShop.shop!.paidRelicOffer;
    const secondBattle = beginBattle(prepareDeployment(leaveShop(firstShop)), [], [], []);
    const secondShop = openShop(secondBattle, []);
    expect(secondShop.conflictIndex).toBe(0);
    expect(secondShop.shop!.paidRelicOffer).toBe(offer);
  });

  it('permanently removes a cashed-out Pawn and grants two gold', () => {
    let run = acquireRelic(deployedRunWithPawn(), 'mercenary-boat');
    const pawn = run.army.find((unit) => unit.type === 'pawn')!;
    const cashed = cashOutPawn(run, pawn.id);
    expect(cashed.army.some((unit) => unit.id === pawn.id)).toBe(false);
    expect(cashed.goldTenths - run.goldTenths).toBe(2 * GOLD_SCALE);
  });
});

describe('Ataraxia ladder identities', () => {
  it('gives the baseline tier the same identity and literal-impact fields as later tiers', () => {
    expect(ATARAXIA_BY_TIER[0]).toEqual({
      tier: 0,
      numeral: '0',
      label: 'Ataraxia 0',
      title: 'The Untroubled Mind',
      effect: 'Standard Run rules. Shop cards may be Legatine, Concinnous or Hieratic but are never Pestiferous.',
    });
  });

  // Every rung carries a numeral, and the label is that numeral qualified by the ladder
  // name — so renumbering a rung is one edit rather than two strings that can disagree.
  it('numbers every installed rung and qualifies each with the ladder name', () => {
    for (const tier of ATARAXIA_TIERS) {
      const definition = ATARAXIA_BY_TIER[tier];
      expect(definition.numeral).toMatch(/^(?:0|[IVX]+)$/);
      expect(definition.label).toBe(`Ataraxia ${definition.numeral}`);
    }
  });
});

describe('Ataraxia I — The Great Mortality', () => {
  it('never marks baseline offers Pestiferous and deterministically realizes both affected rolls', () => {
    const baseline = createRun(war(), 4217, 0);
    const ataraxia = createRun(war(), 4217, 1);
    const baselineOffers = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4)
    ));
    const first = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(ataraxia, card, Math.floor(index / 4), index % 4)
    ));
    const second = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(ataraxia, card, Math.floor(index / 4), index % 4)
    ));

    expect(baselineOffers.every((offer) => offer.cardType !== 'pestiferous')).toBe(true);
    expect(baselineOffers.some((offer) => offer.cardType === 'concinnous')).toBe(true);
    expect(first).toEqual(second);
    expect(first.some((offer) => offer.cardType === 'pestiferous')).toBe(true);
    expect(first.filter((offer) => offer.cardType === 'pestiferous').length).toBeLessThan(RUN_CARD_DECK.length / 2);
  });

  it('persists complete affected offers through Reset Shop and promotes the bought instance into the deck', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedAtaraxiaRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'pestiferous')) shop = candidate;
    }
    expect(shop).not.toBeNull();
    const pestiferous = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'pestiferous')!;
    const originalOffers = structuredClone(shop!.shop!.cardOffers);
    const bought = buyCard(shop!, pestiferous.offerId);
    const owned = bought.cards.find((card) => (
      card.coreId === pestiferous.id && card.effectSeed === pestiferous.effectSeed
    ))!;
    const cacochymicPieceIndex = pestiferous.cacochymicPieceIndex!;
    const plaguedPiece = pestiferous.pieces[cacochymicPieceIndex];
    const discount = { pawn: 0, knight: 1, bishop: 1, rook: 2, queen: 3 }[plaguedPiece];
    const acquiredUnits = bought.army.filter((unit) => owned.unitIds.includes(unit.id));

    expect(cacochymicPieceIndex).toBeGreaterThanOrEqual(0);
    expect(pestiferous.cost).toBe(pestiferous.value - discount);
    expect(owned).toMatchObject({ coreId: pestiferous.id, cardType: 'pestiferous', effectSeed: pestiferous.effectSeed });
    expect(owned.unitIds).toHaveLength(pestiferous.pieces.length);
    expect(owned.cacochymicUnitId).toBe(acquiredUnits[cacochymicPieceIndex].id);
    expect(acquiredUnits.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([owned.cacochymicUnitId]);
    expect(resetShop(bought).shop?.cardOffers).toEqual(originalOffers);
    expect(resetShop(bought).cards).toEqual(shop!.cards);
  });

  it('fills missing current-format offer targets and target-only pricing', () => {
    let current: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !current; seed += 1) {
      const candidate = openShop(deployedAtaraxiaRun(seed), []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'pestiferous')) current = candidate;
    }
    expect(current).not.toBeNull();
    const legacy = {
      ...current!,
      shop: {
        ...current!.shop!,
        cardOffers: current!.shop!.cardOffers.map(({ cacochymicPieceIndex: _target, ...offer }) => ({
          ...offer,
          cost: offer.cardType === 'pestiferous' ? 1 : offer.cost,
        })),
      },
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    for (const offer of upgraded.shop!.cardOffers) {
      const original = current!.shop!.cardOffers.find((candidate) => candidate.offerId === offer.offerId)!;
      expect(offer.cacochymicPieceIndex).toBe(original.cacochymicPieceIndex);
      expect(offer.cost).toBe(original.cost);
    }
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('removes the revealed target, reveals one successor, and retains empty Pestiferous cards', () => {
    const base = deployedAtaraxiaRun(77, war(5));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['cacochymic'] as RunDocument['army'][number]['modifiers']
        : [],
    }));
    const run: RunDocument = {
      ...base,
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 991,
        effectTargetUnitId: null,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        cacochymicUnitId: units[0].id,
        acquiredAfterBattleIndex: 0,
      }],
      nextCardSequence: 2,
    };
    const first = deterioratePestiferousCards(run, 1);
    const retry = deterioratePestiferousCards(run, 1);
    const second = deterioratePestiferousCards(first, 2);
    const empty = deterioratePestiferousCards(second, 3);

    expect(first.army).toHaveLength(run.army.length - 1);
    expect(first.pestiferousLosses).toHaveLength(1);
    expect(first.pestiferousLosses[0].unit.id).toBe(units[0].id);
    expect(first.cards[0].cacochymicUnitId).toBe(units[1].id);
    expect(first.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['cacochymic']);
    expect(retry.pestiferousLosses[0].unit.id).toBe(first.pestiferousLosses[0].unit.id);
    expect(deterioratePestiferousCards(first, 1)).toBe(first);
    expect(second.cards[0].unitIds).toEqual([]);
    expect(second.cards[0].lostUnitIds).toHaveLength(2);
    expect(second.cards[0].cacochymicUnitId).toBeNull();
    expect(empty).toBe(second);
  });

  it('immediately reveals a new target when the Cacochymic unit is sold', () => {
    const base = deployedAtaraxiaRun(79, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['cacochymic'] as RunDocument['army'][number]['modifiers']
        : [],
    }));
    const run: RunDocument = {
      ...base,
      phase: 'shop',
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 992,
        effectTargetUnitId: null,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        cacochymicUnitId: units[0].id,
        acquiredAfterBattleIndex: 0,
      }],
      shop: null,
      nextCardSequence: 2,
    };
    const sold = sellArmyUnit(run, units[0].id);

    expect(sold.cards[0].unitIds).toEqual([units[1].id]);
    expect(sold.cards[0].cacochymicUnitId).toBe(units[1].id);
    expect(sold.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['cacochymic']);
  });

  it('upgrades format-5 all-unit Cacochymic state to one deterministic current target', () => {
    const base = deployedAtaraxiaRun(81, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit) => ({
      ...unit,
      modifiers: ['cacochymic'] as RunDocument['army'][number]['modifiers'],
    }));
    const legacy = {
      ...base,
      formatVersion: 5,
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 993,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        acquiredAfterBattleIndex: 0,
      }],
      nextCardSequence: 2,
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    expect(upgraded.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(upgraded.cards[0].cacochymicUnitId).not.toBeNull();
    expect(upgraded.army.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([upgraded.cards[0].cacochymicUnitId]);
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);

    const missingCurrentTarget = {
      ...upgraded,
      cards: upgraded.cards.map((card) => ({ ...card, cacochymicUnitId: null })),
    };
    const repaired = normalizeRunDocument(missingCurrentTarget);
    expect(repaired.cards[0].cacochymicUnitId).not.toBeNull();
    expect(repaired.army.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([repaired.cards[0].cacochymicUnitId]);
  });
});

describe('Concinnous cards', () => {
  it('persist a concealed eligible target, charge two extra gold, and Position that exact unit on purchase', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'concinnous')) shop = candidate;
    }
    expect(shop).not.toBeNull();
    const concinnous = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'concinnous')!;
    const originalOffers = structuredClone(shop!.shop!.cardOffers);
    const bought = buyCard(shop!, concinnous.offerId);
    const owned = bought.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const positioned = bought.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('eutactic')
    ));

    expect(concinnous.cost).toBe(concinnous.value + EUTACTIC_COST);
    expect(concinnous.effectTargetIndex).toBeGreaterThanOrEqual(0);
    expect(concinnous.effectTargetIndex).toBeLessThan(concinnous.pieces.length);
    expect(owned).toMatchObject({
      coreId: concinnous.id,
      cardType: 'concinnous',
      effectSeed: concinnous.effectSeed,
      effectTargetUnitId: positioned[0].id,
    });
    expect(positioned).toHaveLength(1);
    expect(owned.unitIds[concinnous.effectTargetIndex!]).toBe(positioned[0].id);
    expect(resetShop(bought).shop?.cardOffers).toEqual(originalOffers);
  });

  it('fills missing current-format Pestiferous fields without rerolling Concinnous targets', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'concinnous')) shop = candidate;
    }
    const concinnous = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'concinnous')!;
    const bought = buyCard(shop!, concinnous.offerId);
    const legacy = {
      ...bought,
      cards: bought.cards.map(({ cacochymicUnitId: _cacochymicUnitId, ...card }) => card),
      shop: bought.shop && {
        ...bought.shop,
        cardOffers: bought.shop.cardOffers.map(({ cacochymicPieceIndex: _cacochymicPieceIndex, ...offer }) => offer),
        entrySnapshot: {
          ...bought.shop.entrySnapshot,
          cards: bought.shop.entrySnapshot.cards.map(({ cacochymicUnitId: _cacochymicUnitId, ...card }) => card),
        },
      },
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);
    const upgradedCard = upgraded.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const boughtCard = bought.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const upgradedOffer = upgraded.shop!.cardOffers.find((offer) => offer.offerId === concinnous.offerId)!;

    expect(upgraded.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(upgradedCard.effectTargetUnitId).toBe(boughtCard.effectTargetUnitId);
    expect(upgradedCard.cacochymicUnitId).toBeNull();
    expect(upgradedOffer.effectTargetIndex).toBe(concinnous.effectTargetIndex);
    expect(upgradedOffer.cacochymicPieceIndex).toBeNull();
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('qualifies cards whose Eutactic premium produces a two-digit cost', () => {
    const baseline = createRun(war(), 4217, 0);
    const expensive = RUN_CARD_DECK.filter((card) => card.value >= 8);
    const offers = expensive.map((card, index) => (
      createRunCardOffer(baseline, card, 0, index, 8, 1, 0)
    ));

    expect(CONCINNOUS_OFFER_DENOMINATOR).toBe(8);
    expect(offers.every((offer) => offer.cardType === 'concinnous')).toBe(true);
    expect(offers.every((offer) => offer.cost === offer.value + EUTACTIC_COST)).toBe(true);
    expect(offers.every((offer) => offer.effectTargetIndex !== null)).toBe(true);
    expect(new Set(offers.map((offer) => offer.cost))).toEqual(new Set([10, 11]));
  });
});

describe('Legatine Adlected cards', () => {
  it('rolls every core card at one in eight and permits the Adlected premium through twelve gold', () => {
    const baseline = createRun(war(), 4217, 0);
    const forced = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4, 8, 8, 1)
    ));

    expect(LEGATINE_ADLECTED_OFFER_DENOMINATOR).toBe(8);
    expect(forced.every((offer) => offer.cardType === 'legatine')).toBe(true);
    expect(forced.every((offer) => offer.cost === offer.value + ADLECTED_COST)).toBe(true);
    expect(forced.every((offer) => offer.effectTargetIndex === null)).toBe(true);
    expect(Math.max(...forced.map((offer) => offer.cost))).toBe(12);
  });

  it('chooses and persists exactly one Adlected unit only when the card is acquired', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'legatine')) shop = candidate;
    }
    expect(shop).not.toBeNull();
    const tactical = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'legatine')!;
    expect(tactical.effectTargetIndex).toBeNull();

    const bought = buyCard(shop!, tactical.offerId);
    const owned = bought.cards.find((card) => (
      card.coreId === tactical.id && card.effectSeed === tactical.effectSeed
    ))!;
    const disciplined = bought.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('adlected')
    ));

    expect(owned.cardType).toBe('legatine');
    expect(disciplined).toHaveLength(1);
    expect(owned.effectTargetUnitId).toBe(disciplined[0].id);
    expect(owned.unitIds.indexOf(disciplined[0].id)).toBe(
      legatineAdlectedAcquisitionTarget(tactical.effectSeed, tactical.pieces.length),
    );
  });
});

describe('Hieratic Agminate cards', () => {
  const baseline = { seed: 4217, ataraxiaTier: 0 } as const;

  it('rolls one in eight after the other qualifiers and adds the Agminate price', () => {
    const forced = RUN_CARD_DECK.map((card, index) => (
      // Denominators: Pestiferous, Concinnous, Tactical, Hieratic. Only Hieratic can roll.
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4, 8, 0, 0, 1)
    ));

    expect(HIERATIC_AGMINATE_OFFER_DENOMINATOR).toBe(8);
    expect(AGMINATE_COST).toBe(ADLECTED_COST);
    expect(forced.every((offer) => offer.cardType === 'hieratic')).toBe(true);
    expect(forced.every((offer) => offer.cost === offer.value + AGMINATE_COST)).toBe(true);
    // The target is drawn at acquisition, so the offer carries no seeded index.
    expect(forced.every((offer) => offer.effectTargetIndex === null)).toBe(true);
    expect(forced.every((offer) => offer.cacochymicPieceIndex === null)).toBe(true);

    // Tactical, Pestiferous and Concinnous all resolve first: a card carries one qualifier.
    const outranked = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer({ seed: 4217, ataraxiaTier: 1 }, card, Math.floor(index / 4), index % 4, 1, 1, 1, 1)
    ));
    expect(outranked.every((offer) => offer.cardType === 'legatine')).toBe(true);
  });

  it('chooses and persists exactly one Agminate unit only when the card is acquired', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'hieratic')) shop = candidate;
    }
    expect(shop).not.toBeNull();
    const hieratic = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'hieratic')!;
    expect(hieratic.effectTargetIndex).toBeNull();

    const bought = buyCard(shop!, hieratic.offerId);
    const owned = bought.cards.find((card) => (
      card.coreId === hieratic.id && card.effectSeed === hieratic.effectSeed
    ))!;
    const agminate = bought.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('agminate')
    ));

    expect(owned.cardType).toBe('hieratic');
    expect(agminate).toHaveLength(1);
    expect(owned.effectTargetUnitId).toBe(agminate[0].id);
    expect(owned.unitIds.indexOf(agminate[0].id)).toBe(
      hieraticAgminateAcquisitionTarget(hieratic.effectSeed, hieratic.pieces.length),
    );
    expect(bought.goldTenths).toBe(shop!.goldTenths - (hieratic.value + AGMINATE_COST) * GOLD_SCALE);
    // The Agminate draw is its own; it does not mirror the Tactical one.
    expect(hieraticAgminateAcquisitionTarget(hieratic.effectSeed, 8))
      .not.toBe(legatineAdlectedAcquisitionTarget(hieratic.effectSeed, 8));
  });

  it('survives a document round trip with its acquisition target intact', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'hieratic')) shop = candidate;
    }
    const hieratic = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'hieratic')!;
    const bought = buyCard(shop!, hieratic.offerId);
    const normalized = normalizeRunDocument(structuredClone(bought));

    expect(normalized.formatVersion).toBe(RUN_FORMAT_VERSION);
    expect(normalized.cards.map((card) => card.cardType)).toEqual(bought.cards.map((card) => card.cardType));
    expect(normalized.cards.map((card) => card.effectTargetUnitId))
      .toEqual(bought.cards.map((card) => card.effectTargetUnitId));
    expect(normalized.shop?.cardOffers).toEqual(bought.shop?.cardOffers);
  });
});
