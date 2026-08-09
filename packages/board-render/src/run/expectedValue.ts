/**
 * What a War Battle can expect to face, and to be faced BY, in material points.
 *
 * A Battle is authored blind without this. The board says how much the enemy is worth, but what
 * the player brings is the far end of an economy: gold earned from earlier Battles, cards bought
 * with it at prices the market sets, and then a Deployment deal that fields only some of them.
 * This module walks that economy once for a whole War so a Level can be authored against the
 * force that will actually stand opposite it.
 *
 * It is a CEILING, deliberately. Everything here postulates the perfect player -- they buy
 * whatever the row offers, lose nothing, and pay for no retry, reroll or undo. A Battle balanced
 * against this number is balanced against the best case, which is the case that has to hold.
 *
 * What it reads (all exact, from the live economy):
 *  - `RUN_STARTING_GOLD`, and `battleVictoryGoldTenths` for every earlier Battle.
 *  - The Sectio pile's exact rarity quota, so the mean price of an offered card is arithmetic
 *    rather than a sample -- including the early cost ceiling that caps the first two markets.
 *  - The opening card grant, free before Battle 1 in any War that has a loot Battle.
 *  - His Grace, always the first card dealt, and the Level's own `cardsDealt`.
 *
 * What it deliberately leaves out, because none of it is guaranteed and each would only push the
 * ceiling higher: board bounties (en passant, royal fork), the gold some lipsana pay on being
 * taken, the Quartermaster's Ledger's fourth offer row, Expunctio resales, and any unit lost.
 */
import {
  LEVEL_BATTLE_CARDS_DEALT_MAX,
  LEVEL_BATTLE_CARDS_DEALT_MIN,
  type Level,
} from '../core/level';
import { spawnEventsForLevel } from '../core/levelEvents';
import type { PieceType } from '../core/types';
import {
  GOLD_SCALE,
  PIECE_VALUE,
  RUN_CARD_DECK,
  RUN_CARD_RARITIES,
  RUN_SECTIO_CARD_OFFER_COUNT,
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTING_GOLD,
  battleVictoryGoldTenths,
  openingCardGrantPool,
  runSectioCardMaxValue,
  sectioPileRarityQuota,
  type RunArmyPieceType,
  type RunCardRarity,
} from './model';

/** His Grace carries the King and two Pawns and is always dealt first, so its material is on
 * every board regardless of what the deal draws around it. */
export const HIS_GRACE_VALUE = RUN_STARTER_CARD_BY_ID['his-grace'].value;

export interface SectioOfferExpectation {
  /** The cost ceiling this market draws under; Infinity once the early cap lifts. */
  maxValue: number;
  /** Mean material value of one offered card. Cost equals value, so this is also its mean price. */
  meanOfferValue: number;
  byRarity: ReadonlyArray<{ rarity: RunCardRarity; seats: number; meanValue: number }>;
}

/**
 * The mean value of one card the Sectio offers under a cost ceiling.
 *
 * A pile is not a sample: `sectioPileRarityQuota` gives it exactly the same rarity composition
 * every time, and each seat is a uniform draw from that rarity's eligible pool. So the mean is
 * the quota-weighted mean of the pools, exactly -- which is what makes a Battle's expected
 * purchasing power something a Level can be authored against rather than estimated.
 */
const offerExpectationCache = new Map<number, SectioOfferExpectation>();

export function sectioOfferExpectation(maxValue = Number.POSITIVE_INFINITY): SectioOfferExpectation {
  // The deck is a frozen constant, so an answer for a ceiling never changes. Authoring surfaces
  // recompute a whole War's walk on every keystroke; scanning 269 cards per Battle for it is
  // wasted work the second time.
  const cached = offerExpectationCache.get(maxValue);
  if (cached) return cached;
  const quota = sectioPileRarityQuota(maxValue);
  const byRarity = RUN_CARD_RARITIES.map((rarity) => {
    const pool = RUN_CARD_DECK.filter((card) => card.value <= maxValue && card.rarity === rarity);
    const meanValue = pool.length
      ? pool.reduce((total, card) => total + card.value, 0) / pool.length
      : 0;
    return { rarity, seats: quota[rarity], meanValue };
  });
  const seats = byRarity.reduce((total, band) => total + band.seats, 0);
  const meanOfferValue = seats
    ? byRarity.reduce((total, band) => total + band.seats * band.meanValue, 0) / seats
    : 0;
  const expectation: SectioOfferExpectation = Object.freeze({
    maxValue,
    meanOfferValue,
    byRarity: Object.freeze(byRarity),
  });
  offerExpectationCache.set(maxValue, expectation);
  return expectation;
}

/** Mean value of the free card the Run's opening grant deals, drawn from its own value band. */
export function openingCardGrantMeanValue(): number {
  const pool = openingCardGrantPool();
  return pool.length ? pool.reduce((total, card) => total + card.value, 0) / pool.length : 0;
}

const materialValue = (type: PieceType, count = 1): number => (
  type in PIECE_VALUE ? count * PIECE_VALUE[type as RunArmyPieceType] : 0
);

export interface LevelSideMaterial {
  /** Material points, on the same scale the Run prices cards with (P1 N/B3 R5 Q9, King 0). */
  value: number;
  units: number;
  kings: number;
}

/**
 * One side's material on a Level: units painted on the board plus any setup-spawned roster.
 * Read exactly the way `battleVictoryGoldTenths` reads the enemy, so the force a Battle shows
 * and the gold it pays can never disagree about what is standing on it.
 */
export function levelSideMaterial(level: Level, side: 'player' | 'enemy'): LevelSideMaterial {
  let value = 0;
  let units = 0;
  let kings = 0;
  for (const unit of level.layers.units) {
    if (unit.side !== side) continue;
    value += materialValue(unit.type);
    units += 1;
    if (unit.type === 'king') kings += 1;
  }
  for (const event of spawnEventsForLevel(level)) {
    if (event.side !== side) continue;
    for (const [type, count] of Object.entries(event.roster) as Array<[PieceType, number | undefined]>) {
      const rostered = count ?? 0;
      value += materialValue(type, rostered);
      units += rostered;
      if (type === 'king') kings += rostered;
    }
  }
  return { value, units, kings };
}

export function clampCardsDealt(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return LEVEL_BATTLE_CARDS_DEALT_MIN;
  return Math.min(
    LEVEL_BATTLE_CARDS_DEALT_MAX,
    Math.max(LEVEL_BATTLE_CARDS_DEALT_MIN, Math.floor(value)),
  );
}

export interface ExpectedBattleValue {
  /** Zero-based; Battle 1 is index 0. */
  battleIndex: number;
  levelId: string;
  levelName: string;
  /** Gold in hand arriving at this Battle, after every earlier market has been cleared out.
   * In material POINTS, the unit the whole walk works in so gold and card values compare
   * directly; ten gold to the point (`cardCostGold`) on the way to a screen. */
  goldUnspent: number;
  /** Ordinary cards held (His Grace excluded); fractional, because the market is an average. */
  cardsHeld: number;
  /** Material carried by those cards. */
  deckValue: number;
  /** deckValue / cardsHeld -- the "average expected value per card in the deck". */
  meanCardValue: number;
  /** What the Level authors. */
  cardsDealt: number;
  /** Ordinary cards the deal actually reaches: `cardsDealt - 1`, or the whole deck if smaller. */
  ordinaryCardsDealt: number;
  /** The headline: His Grace plus the material the deal is expected to bring with it. */
  playerValue: number;
  enemy: LevelSideMaterial;
  /** Player minus enemy. Negative means the board outweighs the force sent at it. */
  advantage: number;
  /** Gold this Battle pays on being won, in material POINTS like `goldUnspent`; zero for the
   * last one, which pays nothing spendable. */
  victoryGold: number;
  /** The market that follows this Battle: what it offers, and what the player can take from it. */
  nextMarket: { meanOfferValue: number; maxValue: number; rowValue: number; spend: number } | null;
}

export interface ExpectedWarValueOptions {
  /** Offers per Sectio row. Defaults to the standard three; the Ledger's fourth is not assumed. */
  offerCount?: number;
}

/**
 * Walk a whole War's economy and report, for every Battle, the force the player is expected to
 * field on it beside the force it puts there.
 *
 * The walk records each Battle BEFORE advancing past it, because a Battle's Sectio comes after
 * it: the gold a board pays and the cards it buys arrive for the NEXT one, never its own.
 *
 * Purchases are continuous rather than whole cards. That is the point of an average market -- 8
 * points of gold against a row averaging 3.4 buys "2.35 cards" here where a real Sectio buys two and keeps
 * the change. Over a War the fractional reading is the unbiased one, and the discrete one would
 * only be exact for one particular seed.
 */
export function expectedWarValue(
  levels: readonly Level[],
  options: ExpectedWarValueOptions = {},
): ExpectedBattleValue[] {
  const offerCount = Math.max(1, Math.floor(options.offerCount ?? RUN_SECTIO_CARD_OFFER_COUNT));
  let gold = RUN_STARTING_GOLD;
  let cardsHeld = 0;
  let deckValue = 0;
  // Any War with a loot Battle left in it opens on Bona Vacantia, and the Run's opening screen
  // grants a formation card outright -- so Battle 1 is arranged with more than His Grace.
  if (levels.some((level) => level.battle?.loot === true)) {
    const grant = openingCardGrantMeanValue();
    if (grant > 0) {
      cardsHeld += 1;
      deckValue += grant;
    }
  }
  return levels.map((level, battleIndex) => {
    // Everything the player arrives WITH, read before this Battle's own reward is banked.
    const cardsDealt = clampCardsDealt(level.battle?.cardsDealt);
    const meanCardValue = cardsHeld > 0 ? deckValue / cardsHeld : 0;
    const ordinaryCardsDealt = Math.min(cardsDealt - 1, cardsHeld);
    const enemy = levelSideMaterial(level, 'enemy');
    const playerValue = HIS_GRACE_VALUE + ordinaryCardsDealt * meanCardValue;
    const point: ExpectedBattleValue = {
      battleIndex,
      levelId: level.id,
      levelName: level.name,
      goldUnspent: gold,
      cardsHeld,
      deckValue,
      meanCardValue,
      cardsDealt,
      ordinaryCardsDealt,
      playerValue,
      enemy,
      advantage: playerValue - enemy.value,
      // ADR-0220: the last Battle ends the War and grants nothing spendable.
      victoryGold: battleIndex === levels.length - 1 ? 0 : battleVictoryGoldTenths(level) / GOLD_SCALE,
      nextMarket: null,
    };
    // Now advance past it, into the Sectio that stocks the NEXT Battle.
    if (battleIndex < levels.length - 1) {
      gold += point.victoryGold;
      const market = sectioOfferExpectation(runSectioCardMaxValue(battleIndex));
      const rowValue = offerCount * market.meanOfferValue;
      const spend = Math.min(gold, rowValue);
      gold -= spend;
      deckValue += spend;
      if (market.meanOfferValue > 0) cardsHeld += spend / market.meanOfferValue;
      point.nextMarket = { meanOfferValue: market.meanOfferValue, maxValue: market.maxValue, rowValue, spend };
    }
    return point;
  });
}
