import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  GOLD_SCALE,
  PIECE_BUNDLE_DECK,
  PIECE_VALUE,
  acquireRelic,
  beginBattle,
  buyBundle,
  cashOutPawn,
  chooseDraft,
  createRun,
  formatGold,
  grantGold,
  leaveShop,
  openShop,
  prepareDeployment,
  sellArmyUnit,
  takeLootRelic,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function war(battles = 4, lootAt: number[] = []): RunWarSnapshot {
  return {
    id: 'war-test',
    name: 'Test War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => ({
      level: createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8),
      loot: lootAt.includes(index),
    })),
  };
}

function deployedRun(seed = 17, snapshot = war()): RunDocument {
  let run = createRun(snapshot, seed, '2026-01-01T00:00:00.000Z');
  run = prepareDeployment(chooseDraft(run, run.draftOffers[0].draftId));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

describe('Run piece economy', () => {
  it('enumerates every unique multiset worth 1–9 points exactly once', () => {
    expect(PIECE_BUNDLE_DECK).toHaveLength(49);
    expect(new Set(PIECE_BUNDLE_DECK.map((bundle) => bundle.id)).size).toBe(49);
    for (const bundle of PIECE_BUNDLE_DECK) {
      expect(bundle.value).toBeGreaterThanOrEqual(1);
      expect(bundle.value).toBeLessThanOrEqual(9);
      expect(bundle.pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0)).toBe(bundle.value);
    }
  });

  it('deals two different six-point opening hands from the approved five', () => {
    const run = createRun(war(), 91);
    expect(run.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn', 'pawn']);
    expect(run.draftOffers).toHaveLength(2);
    expect(new Set(run.draftOffers.map((offer) => offer.draftId)).size).toBe(2);
    expect(run.draftOffers.every((offer) => offer.value === 6)).toBe(true);
  });

  it('allows at most one bundle purchase in a shop', () => {
    const shop = openShop({ ...deployedRun(), goldTenths: 100 * GOLD_SCALE }, []);
    const [first, second] = shop.shop!.bundleOfferIds;
    const bought = buyBundle(shop, first);
    expect(bought.shop?.purchasedBundleId).toBe(first);
    expect(buyBundle(bought, second)).toBe(bought);
  });

  it('sells every non-King and formats Fair Scales quarter-gold exactly', () => {
    let shop = openShop(deployedRun(), []);
    shop = acquireRelic(shop, 'fair-scales');
    const pawn = shop.army.find((unit) => unit.type === 'pawn')!;
    const sold = sellArmyUnit(shop, pawn.id);
    expect(sold.goldTenths - shop.goldTenths).toBe(7.5);
    expect(formatGold(7.5)).toBe('0.75');
    expect(sellArmyUnit(sold, 'run-king')).toBe(sold);
  });
});

describe('Run progression and relic offers', () => {
  it('grants an exact administrator-entered gold amount through the Run model', () => {
    const run = deployedRun();
    const granted = grantGold(run, 27);
    expect(granted.goldTenths).toBe(run.goldTenths + 27);
    expect(grantGold(granted, 0)).toBe(granted);
  });

  it('opens a shop with one gold after non-final victories and skips the shop after the final boss', () => {
    const afterFirst = openShop(deployedRun(12, war(2)), []);
    expect(afterFirst.phase).toBe('shop');
    expect(afterFirst.goldTenths).toBe(GOLD_SCALE);

    const finalBattle = beginBattle(prepareDeployment(leaveShop(afterFirst)), [], [], []);
    const won = openShop(finalBattle, []);
    expect(won.phase).toBe('victory');
    expect(won.shop).toBeNull();
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
    let run = acquireRelic(deployedRun(), 'mercenary-boat');
    const pawn = run.army.find((unit) => unit.type === 'pawn')!;
    const cashed = cashOutPawn(run, pawn.id);
    expect(cashed.army.some((unit) => unit.id === pawn.id)).toBe(false);
    expect(cashed.goldTenths - run.goldTenths).toBe(2 * GOLD_SCALE);
  });
});
