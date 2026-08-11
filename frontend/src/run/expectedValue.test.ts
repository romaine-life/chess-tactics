import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level, type LevelEvent } from '../core/level';
import {
  GOLD_SCALE,
  PIECE_VALUE,
  RUN_SECTIO_CARD_OFFER_COUNT,
  RUN_SECTIO_EARLY_CARD_MAX_VALUE,
  RUN_STARTING_GOLD,
  battleVictoryGoldTenths,
} from './model';
import {
  HIS_GRACE_VALUE,
  clampCardsDealt,
  expectedWarValue,
  levelSideMaterial,
  openingCardGrantMeanValue,
  sectioOfferExpectation,
} from './expectedValue';

type EnemyUnit = { type: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'; x: number };

function battle(
  id: string,
  cardsDealt: number,
  enemies: readonly EnemyUnit[] = [{ type: 'king', x: 4 }],
  extra: Partial<Pick<Level, 'battle' | 'events'>> = {},
): Level {
  const level = createBlankLevel(id, id, 8, 8);
  for (const enemy of enemies) level.layers.units.push({ x: enemy.x, y: 0, type: enemy.type, side: 'enemy' });
  level.battle = { loot: false, cardsDealt, ...extra.battle };
  if (extra.events) level.events = extra.events;
  return level;
}

describe('sectio offer expectation', () => {
  it('is the pile quota weighted mean, not a sample', () => {
    const uncapped = sectioOfferExpectation();
    const seats = uncapped.byRarity.reduce((total, band) => total + band.seats, 0);
    expect(seats).toBe(20);
    const byHand = uncapped.byRarity
      .reduce((total, band) => total + band.seats * band.meanValue, 0) / seats;
    expect(uncapped.meanOfferValue).toBeCloseTo(byHand, 12);
    // The pile is 16/3/1 common/uncommon/rare, so the mean sits near the common band.
    //
    // That mean is MATERIAL, and it rose when the bands moved from material to price: a card is now
    // Common because it is cheap, and under density pricing the cheap cards are the ones spreading
    // their material over four squares. So the Common tier hands out more material per offer than
    // it did, for the same gold. Growth per Battle is still authored in gold, which is the number
    // the ceiling below holds down.
    expect(uncapped.meanOfferValue).toBeGreaterThan(2);
    expect(uncapped.meanOfferValue).toBeLessThan(9);
  });

  it('is cheaper while the early cost ceiling holds', () => {
    const capped = sectioOfferExpectation(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(capped.meanOfferValue).toBeLessThan(sectioOfferExpectation().meanOfferValue);
    for (const band of capped.byRarity) expect(band.meanValue).toBeLessThanOrEqual(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
  });
});

describe('level material', () => {
  it('counts painted units and setup-spawned rosters, per side', () => {
    const spawn: LevelEvent = {
      id: 'reinforce',
      name: 'Reinforce',
      trigger: { kind: 'setup' },
      do: [{ kind: 'spawn', side: 'enemy', roster: { rook: 2, pawn: 1 }, zoneIds: [] }],
    };
    const level = battle('spawner', 3, [{ type: 'king', x: 4 }, { type: 'queen', x: 3 }], { events: [spawn] });
    const enemy = levelSideMaterial(level, 'enemy');
    expect(enemy.value).toBe(PIECE_VALUE.queen + 2 * PIECE_VALUE.rook + PIECE_VALUE.pawn);
    expect(enemy.units).toBe(5);
    expect(enemy.kings).toBe(1);
    expect(levelSideMaterial(level, 'player').value).toBe(0);
  });

  it('reads the same force the victory reward is paid on', () => {
    const level = battle('reward', 3, [{ type: 'king', x: 4 }, { type: 'rook', x: 0 }, { type: 'knight', x: 2 }]);
    const enemy = levelSideMaterial(level, 'enemy');
    // A Battle pays half the enemy's material, plus a gold for the King.
    expect(battleVictoryGoldTenths(level) / GOLD_SCALE).toBeCloseTo(enemy.value / 2 + enemy.kings, 10);
  });
});

describe('expected war value', () => {
  it('starts Battle 1 on His Grace plus the free opening grant, with nothing bought yet', () => {
    const levels = [
      battle('b1', 3, [{ type: 'king', x: 4 }, { type: 'rook', x: 0 }]),
      battle('b2', 3),
    ];
    levels[0].battle = { ...levels[0].battle, loot: true, cardsDealt: 3 };
    const [first] = expectedWarValue(levels);
    expect(first.goldUnspent).toBe(RUN_STARTING_GOLD);
    expect(first.cardsHeld).toBe(1);
    expect(first.deckValue).toBeCloseTo(openingCardGrantMeanValue(), 12);
    // A deal of 3 is His Grace and two more, but only one ordinary card exists to deal.
    expect(first.ordinaryCardsDealt).toBe(1);
    expect(first.playerValue).toBeCloseTo(HIS_GRACE_VALUE + openingCardGrantMeanValue(), 12);
  });

  it('grants no opening card in a War with no loot Battle', () => {
    const [first] = expectedWarValue([battle('b1', 4), battle('b2', 4)]);
    expect(first.cardsHeld).toBe(0);
    expect(first.playerValue).toBe(HIS_GRACE_VALUE);
  });

  it('banks each Battle reward into the next market and spends it on cards', () => {
    const levels = [
      battle('b1', 4, [{ type: 'king', x: 4 }, { type: 'queen', x: 3 }, { type: 'rook', x: 0 }]),
      battle('b2', 4, [{ type: 'king', x: 4 }, { type: 'rook', x: 0 }]),
      battle('b3', 4),
    ];
    const curve = expectedWarValue(levels);
    const market = curve[0].nextMarket!;
    expect(market.maxValue).toBe(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(market.rowValue).toBeCloseTo(RUN_SECTIO_CARD_OFFER_COUNT * market.meanOfferValue, 12);
    // Cost equals value, so every gold spent lands in the deck as a material point.
    expect(curve[1].deckValue - curve[0].deckValue).toBeCloseTo(market.spend, 12);
    expect(curve[1].goldUnspent).toBeCloseTo(
      curve[0].goldUnspent + curve[0].victoryGold - market.spend,
      12,
    );
    expect(curve[1].playerValue).toBeGreaterThan(curve[0].playerValue);
  });

  it('lifts the cost ceiling after the second Battle', () => {
    const levels = Array.from({ length: 5 }, (_, index) => battle(`b${index}`, 4));
    const curve = expectedWarValue(levels);
    expect(curve[0].nextMarket!.maxValue).toBe(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(curve[1].nextMarket!.maxValue).toBe(RUN_SECTIO_EARLY_CARD_MAX_VALUE);
    expect(curve[2].nextMarket!.maxValue).toBe(Number.POSITIVE_INFINITY);
  });

  it('pays nothing spendable for the final Battle and opens no market after it', () => {
    const levels = [battle('b1', 3), battle('last', 3, [{ type: 'king', x: 4 }, { type: 'queen', x: 3 }])];
    const curve = expectedWarValue(levels);
    expect(curve[1].victoryGold).toBe(0);
    expect(curve[1].nextMarket).toBeNull();
  });

  it('scales the fielded force with the Level cards-dealt setting alone', () => {
    const enemies: EnemyUnit[] = [{ type: 'king', x: 4 }, { type: 'queen', x: 3 }, { type: 'rook', x: 0 }];
    const curveOf = (dealt: number): number => expectedWarValue([
      battle('b1', 3, enemies),
      battle('b2', 3, enemies),
      battle('b3', 3, enemies),
      battle('target', dealt, enemies),
    ])[3].playerValue;
    expect(curveOf(1)).toBe(HIS_GRACE_VALUE);
    expect(curveOf(4)).toBeGreaterThan(curveOf(2));
    expect(curveOf(4) - curveOf(3)).toBeCloseTo(curveOf(3) - curveOf(2), 12);
  });

  it('never deals more ordinary cards than the deck holds', () => {
    const curve = expectedWarValue([battle('b1', 12), battle('b2', 12)]);
    expect(curve[0].ordinaryCardsDealt).toBe(curve[0].cardsHeld);
    expect(curve[0].playerValue).toBeCloseTo(HIS_GRACE_VALUE + curve[0].deckValue, 12);
  });

  it('reports the advantage against the board the Battle actually puts up', () => {
    const levels = [battle('b1', 3), battle('b2', 3, [{ type: 'king', x: 4 }, { type: 'queen', x: 3 }])];
    const curve = expectedWarValue(levels);
    expect(curve[1].enemy.value).toBe(PIECE_VALUE.queen);
    expect(curve[1].advantage).toBeCloseTo(curve[1].playerValue - PIECE_VALUE.queen, 12);
  });
});

describe('clampCardsDealt', () => {
  it('holds an authored count inside the Level bounds', () => {
    expect(clampCardsDealt(undefined)).toBe(1);
    expect(clampCardsDealt(0)).toBe(1);
    expect(clampCardsDealt(400)).toBe(12);
    expect(clampCardsDealt(5.9)).toBe(5);
  });
});
