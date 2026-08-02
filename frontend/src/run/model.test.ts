import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  ATARAXIA_BY_TIER,
  CONCINNOUS_OFFER_DENOMINATOR,
  DISCIPLINE_COST,
  GOLD_SCALE,
  RUN_CARD_DECK,
  PIECE_VALUE,
  POSITIONED_COST,
  RUN_FORMAT_VERSION,
  RUN_OPENING_OFFER_COUNT,
  RUN_STARTING_GOLD_TENTHS,
  TACTICAL_DISCIPLINE_OFFER_DENOMINATOR,
  acquireRelic,
  battleVictoryGoldTenths,
  beginBattle,
  buyCard,
  canLeaveShop,
  cashOutPawn,
  createRun,
  createRunCardOffer,
  deterioratePestiferousCards,
  formatGold,
  grantGold,
  leaveShop,
  normalizeRunDocument,
  openingShopOffers,
  openShop,
  prepareDeployment,
  resetShop,
  sellArmyUnit,
  shopHasChanges,
  takeLootRelic,
  tacticalDisciplineAcquisitionTarget,
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

function deployedRun(seed = 17, snapshot = war()): RunDocument {
  let run = createRun(snapshot, seed, '2026-01-01T00:00:00.000Z');
  run = buyCard(run, run.shop!.cardOffers[0].offerId);
  run = prepareDeployment(leaveShop(run));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

function deployedAtaraxiaRun(seed = 17, snapshot = war()): RunDocument {
  let run = createRun(snapshot, seed, 1, '2026-01-01T00:00:00.000Z');
  run = buyCard(run, run.shop!.cardOffers[0].offerId);
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
    expect(run.shop?.cardOffers.every((offer) => offer.cost === offer.value)).toBe(true);
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
    const offer = fresh.shop!.cardOffers[0];
    const bought = buyCard(fresh, offer.offerId);
    const card = bought.cards[0];

    expect(bought.phase).toBe('shop');
    expect(bought.shop?.kind).toBe('opening');
    expect(bought.shop?.purchasedCardOfferIds).toEqual([offer.offerId]);
    expect(bought.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS - offer.value * GOLD_SCALE);
    expect(card).toMatchObject({ coreId: offer.id, cardType: null, acquiredAfterBattleIndex: 0 });
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

  it('keeps every affordable core Units card reachable from seeded openings', () => {
    const observed = new Set<string>();
    for (let seed = 1; seed <= 10_000; seed += 1) {
      for (const offer of openingShopOffers(seed)) observed.add(offer.id);
    }
    expect(observed).toEqual(new Set(RUN_CARD_DECK.filter((card) => card.value <= 8).map((card) => card.id)));
  });

  it('names opening and later Shop units in the same transaction that adds them to the army', () => {
    const fresh = createRun(war(), 91);
    const openingPurchase = buyCard(fresh, fresh.shop!.cardOffers[0].offerId);
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
    const current = leaveShop(buyCard(opening, opening.shop!.cardOffers[0].offerId));
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
    const current = leaveShop(buyCard(opening, opening.shop!.cardOffers[0].offerId));
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
    const current = leaveShop(buyCard(opening, opening.shop!.cardOffers[0].offerId));
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

    const committed = leaveShop(buyCard(current, current.shop!.cardOffers[0].offerId));
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

  it('burns all three seen Loot offers, including the two not chosen', () => {
    const firstShop = openShop(deployedRun(44, war(3, [0, 1])), []);
    const firstOffers = firstShop.shop!.lootRelicOffers;
    expect(firstOffers).toHaveLength(3);
    const target = firstShop.army[0].id;
    const chosen = takeLootRelic(firstShop, firstOffers[0], target);
    const secondBattle = beginBattle(prepareDeployment(leaveShop(chosen)), [], [], []);
    const secondShop = openShop(secondBattle, []);
    expect(secondShop.shop!.lootRelicOffers).toHaveLength(3);
    expect(secondShop.shop!.lootRelicOffers.some((relic) => firstOffers.includes(relic))).toBe(false);
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
  it('gives Ataraxia 0 the same identity and literal-impact fields as later tiers', () => {
    expect(ATARAXIA_BY_TIER[0]).toEqual({
      tier: 0,
      label: 'Ataraxia 0',
      title: 'The Untroubled Mind',
      effect: 'Standard Run rules. Shop cards may be Tactical or Concinnous but are never Pestiferous.',
    });
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
    const plaguedPieceIndex = pestiferous.plaguedPieceIndex!;
    const plaguedPiece = pestiferous.pieces[plaguedPieceIndex];
    const discount = { pawn: 0, knight: 1, bishop: 1, rook: 2, queen: 3 }[plaguedPiece];
    const acquiredUnits = bought.army.filter((unit) => owned.unitIds.includes(unit.id));

    expect(plaguedPieceIndex).toBeGreaterThanOrEqual(0);
    expect(pestiferous.cost).toBe(pestiferous.value - discount);
    expect(owned).toMatchObject({ coreId: pestiferous.id, cardType: 'pestiferous', effectSeed: pestiferous.effectSeed });
    expect(owned.unitIds).toHaveLength(pestiferous.pieces.length);
    expect(owned.plaguedUnitId).toBe(acquiredUnits[plaguedPieceIndex].id);
    expect(acquiredUnits.filter((unit) => unit.modifiers.includes('plagued')).map((unit) => unit.id))
      .toEqual([owned.plaguedUnitId]);
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
        cardOffers: current!.shop!.cardOffers.map(({ plaguedPieceIndex: _target, ...offer }) => ({
          ...offer,
          cost: offer.cardType === 'pestiferous' ? 1 : offer.cost,
        })),
      },
    } as unknown as RunDocument;
    const upgraded = normalizeRunDocument(legacy);

    for (const offer of upgraded.shop!.cardOffers) {
      const original = current!.shop!.cardOffers.find((candidate) => candidate.offerId === offer.offerId)!;
      expect(offer.plaguedPieceIndex).toBe(original.plaguedPieceIndex);
      expect(offer.cost).toBe(original.cost);
    }
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('removes the revealed target, reveals one successor, and retains empty Pestiferous cards', () => {
    const base = deployedAtaraxiaRun(77, war(5));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['plagued'] as RunDocument['army'][number]['modifiers']
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
        plaguedUnitId: units[0].id,
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
    expect(first.cards[0].plaguedUnitId).toBe(units[1].id);
    expect(first.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['plagued']);
    expect(retry.pestiferousLosses[0].unit.id).toBe(first.pestiferousLosses[0].unit.id);
    expect(deterioratePestiferousCards(first, 1)).toBe(first);
    expect(second.cards[0].unitIds).toEqual([]);
    expect(second.cards[0].lostUnitIds).toHaveLength(2);
    expect(second.cards[0].plaguedUnitId).toBeNull();
    expect(empty).toBe(second);
  });

  it('immediately reveals a new target when the Plagued unit is sold', () => {
    const base = deployedAtaraxiaRun(79, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['plagued'] as RunDocument['army'][number]['modifiers']
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
        plaguedUnitId: units[0].id,
        acquiredAfterBattleIndex: 0,
      }],
      shop: null,
      nextCardSequence: 2,
    };
    const sold = sellArmyUnit(run, units[0].id);

    expect(sold.cards[0].unitIds).toEqual([units[1].id]);
    expect(sold.cards[0].plaguedUnitId).toBe(units[1].id);
    expect(sold.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['plagued']);
  });

  it('upgrades format-5 all-unit Plagued state to one deterministic current target', () => {
    const base = deployedAtaraxiaRun(81, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit) => ({
      ...unit,
      modifiers: ['plagued'] as RunDocument['army'][number]['modifiers'],
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
    expect(upgraded.cards[0].plaguedUnitId).not.toBeNull();
    expect(upgraded.army.filter((unit) => unit.modifiers.includes('plagued')).map((unit) => unit.id))
      .toEqual([upgraded.cards[0].plaguedUnitId]);
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);

    const missingCurrentTarget = {
      ...upgraded,
      cards: upgraded.cards.map((card) => ({ ...card, plaguedUnitId: null })),
    };
    const repaired = normalizeRunDocument(missingCurrentTarget);
    expect(repaired.cards[0].plaguedUnitId).not.toBeNull();
    expect(repaired.army.filter((unit) => unit.modifiers.includes('plagued')).map((unit) => unit.id))
      .toEqual([repaired.cards[0].plaguedUnitId]);
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
      owned.unitIds.includes(unit.id) && unit.abilities.includes('positioned')
    ));

    expect(concinnous.cost).toBe(concinnous.value + POSITIONED_COST);
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
      cards: bought.cards.map(({ plaguedUnitId: _plaguedUnitId, ...card }) => card),
      shop: bought.shop && {
        ...bought.shop,
        cardOffers: bought.shop.cardOffers.map(({ plaguedPieceIndex: _plaguedPieceIndex, ...offer }) => offer),
        entrySnapshot: {
          ...bought.shop.entrySnapshot,
          cards: bought.shop.entrySnapshot.cards.map(({ plaguedUnitId: _plaguedUnitId, ...card }) => card),
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
    expect(upgradedCard.plaguedUnitId).toBeNull();
    expect(upgradedOffer.effectTargetIndex).toBe(concinnous.effectTargetIndex);
    expect(upgradedOffer.plaguedPieceIndex).toBeNull();
    expect(normalizeRunDocument(upgraded)).toBe(upgraded);
  });

  it('qualifies cards whose Positioned premium produces a two-digit cost', () => {
    const baseline = createRun(war(), 4217, 0);
    const expensive = RUN_CARD_DECK.filter((card) => card.value >= 8);
    const offers = expensive.map((card, index) => (
      createRunCardOffer(baseline, card, 0, index, 8, 1, 0)
    ));

    expect(CONCINNOUS_OFFER_DENOMINATOR).toBe(8);
    expect(offers.every((offer) => offer.cardType === 'concinnous')).toBe(true);
    expect(offers.every((offer) => offer.cost === offer.value + POSITIONED_COST)).toBe(true);
    expect(offers.every((offer) => offer.effectTargetIndex !== null)).toBe(true);
    expect(new Set(offers.map((offer) => offer.cost))).toEqual(new Set([10, 11]));
  });
});

describe('Tactical Discipline cards', () => {
  it('rolls every core card at one in eight and permits the Discipline premium through twelve gold', () => {
    const baseline = createRun(war(), 4217, 0);
    const forced = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4, 8, 8, 1)
    ));

    expect(TACTICAL_DISCIPLINE_OFFER_DENOMINATOR).toBe(8);
    expect(forced.every((offer) => offer.cardType === 'tactical')).toBe(true);
    expect(forced.every((offer) => offer.cost === offer.value + DISCIPLINE_COST)).toBe(true);
    expect(forced.every((offer) => offer.effectTargetIndex === null)).toBe(true);
    expect(Math.max(...forced.map((offer) => offer.cost))).toBe(12);
  });

  it('chooses and persists exactly one Disciplined unit only when the card is acquired', () => {
    let shop: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !shop; seed += 1) {
      const candidate = openShop({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.shop?.cardOffers.some((offer) => offer.cardType === 'tactical')) shop = candidate;
    }
    expect(shop).not.toBeNull();
    const tactical = shop!.shop!.cardOffers.find((offer) => offer.cardType === 'tactical')!;
    expect(tactical.effectTargetIndex).toBeNull();

    const bought = buyCard(shop!, tactical.offerId);
    const owned = bought.cards.find((card) => (
      card.coreId === tactical.id && card.effectSeed === tactical.effectSeed
    ))!;
    const disciplined = bought.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('discipline')
    ));

    expect(owned.cardType).toBe('tactical');
    expect(disciplined).toHaveLength(1);
    expect(owned.effectTargetUnitId).toBe(disciplined[0].id);
    expect(owned.unitIds.indexOf(disciplined[0].id)).toBe(
      tacticalDisciplineAcquisitionTarget(tactical.effectSeed, tactical.pieces.length),
    );
  });
});
