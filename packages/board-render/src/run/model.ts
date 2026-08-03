import type { Level, War } from '../core/level';
import type { PieceType } from '../core/types';
import {
  RUN_RELIC_BY_ID,
  RUN_RELICS,
  type RunRelicDefinition,
  type RunRelicId,
} from '../core/runRelics';
import { spawnEventsForLevel } from '../core/levelEvents';
import { createRng } from '../core/rng';
import { runUnitName } from './unitNames';

export {
  RUN_RELIC_BY_ID,
  RUN_RELICS,
  type RunRelicDefinition,
  type RunRelicId,
};

export const RUN_FORMAT_VERSION = 12;
export const GOLD_SCALE = 10;
export const RUN_STARTING_GOLD = 8;
export const RUN_STARTING_GOLD_TENTHS = RUN_STARTING_GOLD * GOLD_SCALE;
export const RUN_OPENING_OFFER_COUNT = 3;
export const INSTALLED_ATARAXIA_MAX_TIER = 1;
export const PESTIFEROUS_OFFER_DENOMINATOR = 8;
export const CONCINNOUS_OFFER_DENOMINATOR = 8;
export const TACTICAL_DISCIPLINE_OFFER_DENOMINATOR = 8;
export const HIERATIC_AGMINATE_OFFER_DENOMINATOR = 8;
export const POSITIONED_COST = 2;
export const DISCIPLINE_COST = 3;
/** Agminate seats a unit in its role's formation instead of a rank, and its King,
 * Rook and Bishop rules interlock, so it carries Discipline's price rather than
 * Positioned's. */
export const AGMINATE_COST = 3;

export type AtaraxiaTier = 0 | 1;
export type RunCardType = 'pestiferous' | 'concinnous' | 'tactical' | 'hieratic';
export type RunUnitModifier = 'plagued';
export const CACOCHYMIC_DISPLAY_NAME = 'Cacochymic';

/**
 * Each tier's presentation. `numeral` is the rung itself and `label` is that rung
 * qualified by the ladder's name, for a surface that names one tier away from the
 * ladder's own heading. Tier zero's numeral is **N** — medieval Latin *nulla*, the
 * Roman zero of the computus tables — so the whole ladder reads in one numbering
 * (ADR-0358). The persisted tier remains numeric `0` (ADR-0291).
 */
export const ATARAXIA_BY_TIER: Readonly<Record<AtaraxiaTier, Readonly<{
  tier: AtaraxiaTier;
  numeral: string;
  label: string;
  title: string;
  effect: string;
}>>> = Object.freeze({
  0: Object.freeze({
    tier: 0,
    numeral: 'N',
    label: 'Ataraxia N',
    title: 'The Untroubled Mind',
    effect: 'Standard Run rules. Shop cards may be Tactical, Concinnous or Hieratic but are never Pestiferous.',
  }),
  1: Object.freeze({
    tier: 1,
    numeral: 'I',
    label: 'Ataraxia I',
    title: 'The Great Mortality',
    effect: `About one in eight shop cards is Pestiferous. Its marked ${CACOCHYMIC_DISPLAY_NAME} unit is lost after each victorious Battle, then another is marked.`,
  }),
});

/**
 * Every installed tier in ladder order (ADR-0268 — one linear, cumulative sequence).
 * The Run preparation selector and the Enchiridion's Ataraxia reference both read this
 * list, so installing a tier cannot appear in one and be forgotten by the other.
 */
export const ATARAXIA_TIERS: readonly AtaraxiaTier[] = Object.freeze(
  Array.from({ length: INSTALLED_ATARAXIA_MAX_TIER + 1 }, (_, tier) => tier as AtaraxiaTier),
);

export type PurchasablePieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen';
export type RunArmyPieceType = PurchasablePieceType | 'king';
export type RunAbility = 'discipline' | 'positioned' | 'marshalled';

export const AGMINATE_DISPLAY_NAME = 'Agminate';

export function runAbilityDisplayName(ability: RunAbility): string {
  if (ability === 'marshalled') return AGMINATE_DISPLAY_NAME;
  return `${ability.slice(0, 1).toUpperCase()}${ability.slice(1)}`;
}

/**
 * The four causal card properties and the unit state each one bestows (ADR-0339). Card
 * faces, the Enchiridion and the Studio fitting instrument all name a property from here
 * so cause and result stay one paired vocabulary instead of lookalike copies.
 */
export const RUN_CARD_TYPE_REFERENCE: Readonly<Record<RunCardType, Readonly<{
  name: string;
  grants: RunAbility | RunUnitModifier;
  effect: string;
}>>> = Object.freeze({
  pestiferous: Object.freeze({
    name: 'Pestiferous',
    grants: 'plagued',
    effect: `Marks one contained unit ${CACOCHYMIC_DISPLAY_NAME}; each victorious Battle loses it and marks another.`,
  }),
  concinnous: Object.freeze({
    name: 'Concinnous',
    grants: 'positioned',
    effect: 'Makes one contained unit Positioned when the card is acquired.',
  }),
  tactical: Object.freeze({
    name: 'Tactical',
    grants: 'discipline',
    effect: 'Grants Discipline to one contained unit when the card is acquired.',
  }),
  hieratic: Object.freeze({
    name: 'Hieratic',
    grants: 'marshalled',
    effect: `Grants ${AGMINATE_DISPLAY_NAME} to one contained unit when the card is acquired.`,
  }),
});

export const PIECE_VALUE: Readonly<Record<RunArmyPieceType, number>> = Object.freeze({
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
});

export const PIECE_LABEL: Readonly<Record<RunArmyPieceType, string>> = Object.freeze({
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
});

function pieceVictoryRewardTenths(type: PieceType, count = 1): number {
  if (type === 'king') return count * GOLD_SCALE;
  if (!(type in PIECE_VALUE)) return 0;
  return count * PIECE_VALUE[type as RunArmyPieceType] * GOLD_SCALE / 2;
}

export function battleVictoryGoldTenths(level: Level): number {
  const fixedReward = level.layers.units.reduce(
    (total, unit) => total + (unit.side === 'enemy' ? pieceVictoryRewardTenths(unit.type) : 0),
    0,
  );
  const spawnedReward = spawnEventsForLevel(level)
    .filter((event) => event.side === 'enemy')
    .reduce((total, event) => (
      total + (Object.entries(event.roster) as Array<[PieceType, number | undefined]>)
        .reduce((rosterTotal, [type, count]) => (
          rosterTotal + pieceVictoryRewardTenths(type, count ?? 0)
        ), 0)
    ), 0);
  return fixedReward + spawnedReward;
}

export interface RunArmyUnit {
  id: string;
  name: string;
  type: RunArmyPieceType;
  number: number;
  /** Persistent seed for the unit's tile-backed Army inspection scene. */
  inspectionSeed: number;
  abilities: RunAbility[];
  modifiers: RunUnitModifier[];
  source: 'king' | 'starting' | 'shop';
}

export type RunArmyNumberState = Record<RunArmyPieceType, number>;

export interface RunCoreCard {
  id: string;
  pieces: PurchasablePieceType[];
  value: number;
}

export interface RunCardOffer extends RunCoreCard {
  offerId: string;
  cost: number;
  cardType: RunCardType | null;
  effectSeed: number;
  plaguedPieceIndex: number | null;
  /** Stored zero-based unit occurrence selected before a Concinnous purchase. */
  effectTargetIndex: number | null;
}

export interface RunOwnedCard {
  id: string;
  coreId: string;
  cardType: RunCardType | null;
  effectSeed: number;
  /** Exact acquired unit enhanced by this card, or null for other card types. */
  effectTargetUnitId: string | null;
  unitIds: string[];
  lostUnitIds: string[];
  plaguedUnitId: string | null;
  acquiredAfterBattleIndex: number;
}

export interface RunPestiferousLoss {
  battleIndex: number;
  cardId: string;
  unit: RunArmyUnit;
}

export interface RunRelicAbilityGrant {
  ability: Extract<RunAbility, 'positioned' | 'marshalled'>;
  unitType: RunArmyPieceType;
}

export const RUN_RELIC_ABILITY_GRANTS: Readonly<Partial<Record<RunRelicId, RunRelicAbilityGrant>>> = Object.freeze({
  'training-linens': { ability: 'positioned', unitType: 'pawn' },
  'royal-decree': { ability: 'positioned', unitType: 'king' },
  'crenellated-rampart': { ability: 'positioned', unitType: 'rook' },
  'popes-staff': { ability: 'positioned', unitType: 'bishop' },
  'ghibelline-rampart': { ability: 'marshalled', unitType: 'rook' },
  'popes-robes': { ability: 'marshalled', unitType: 'bishop' },
  'royal-sceptre': { ability: 'marshalled', unitType: 'king' },
});
export interface RunWarBattleSnapshot {
  level: Level;
  loot: boolean;
}

export interface RunWarSnapshot {
  id: string;
  name: string;
  description: string;
  battles: RunWarBattleSnapshot[];
}

export type RunPhase = 'deployment' | 'battle' | 'shop' | 'victory';

export interface RunDeploymentState {
  battleIndex: number;
  seed: number;
  blockedUnitIds: string[];
  chosenBlockedUnitIds?: string[];
  manualPlacements: Record<string, string>;
  layoutChoice?: 0 | 1;
  temporaryDisciplineUnitId?: string;
}

export interface RunBattleRuntime {
  battleIndex: number;
  initiallyDeployedUnitIds: string[];
  reserveUnitIds: string[];
  reservistPoolUnitIds: string[];
  deployedReservistUnitIds: string[];
  observedDeadUnitIds: string[];
  cashedOutUnitIds: string[];
  reinforcementSequence: number;
}

export interface RunShopState {
  kind: 'opening' | 'post-battle';
  afterBattleIndex: number;
  conflictIndex: number;
  victoryGoldTenths: number;
  cardOffers: RunCardOffer[];
  purchasedCardOfferIds: string[];
  lootRelicOffers: RunRelicId[];
  chosenLootRelicId: RunRelicId | null;
  paidRelicOffer: RunRelicId | null;
  paidRelicBought: boolean;
  soldUnits: Array<{
    unit: RunArmyUnit;
    proceedsTenths: number;
  }>;
  entrySnapshot: RunShopEntrySnapshot;
}

export interface RunShopEntrySnapshot {
  goldTenths: number;
  army: RunArmyUnit[];
  cards: RunOwnedCard[];
  relics: RunRelicId[];
  seenRelics: RunRelicId[];
  conflictPaidRelics: Record<string, { relicId: RunRelicId; bought: boolean }>;
  nextArmyUnitSequence: number;
  nextArmyUnitNumberByType: RunArmyNumberState;
  nextCardSequence: number;
  paidRelicBought: boolean;
}

export interface RunDocument {
  formatVersion: typeof RUN_FORMAT_VERSION;
  id: string;
  seed: number;
  ataraxiaTier: AtaraxiaTier;
  updatedAt: string;
  war: RunWarSnapshot;
  phase: RunPhase;
  battleIndex: number;
  conflictIndex: number;
  goldTenths: number;
  army: RunArmyUnit[];
  cards: RunOwnedCard[];
  pestiferousLosses: RunPestiferousLoss[];
  relics: RunRelicId[];
  seenRelics: RunRelicId[];
  conflictPaidRelics: Record<string, { relicId: RunRelicId; bought: boolean }>;
  nextArmyUnitSequence: number;
  nextArmyUnitNumberByType: RunArmyNumberState;
  nextCardSequence: number;
  deployment: RunDeploymentState | null;
  battleRuntime: RunBattleRuntime | null;
  shop: RunShopState | null;
}

/** Stable identity for the one playable battle inside a Run. Level ids are not
 * sufficient: different Runs (and later Battles in one War) may reuse a Level. */
export function runBattleActivityId(runId: string, battleIndex: number): string {
  return `run:${encodeURIComponent(runId)}:battle:${battleIndex}`;
}

const PURCHASE_ORDER: readonly PurchasablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const ARMY_PIECE_ORDER: readonly RunArmyPieceType[] = ['king', ...PURCHASE_ORDER];

function initialArmyNumberState(): RunArmyNumberState {
  return {
    pawn: 1,
    knight: 1,
    bishop: 1,
    rook: 1,
    queen: 1,
    king: 1,
  };
}

function cardId(pieces: readonly PurchasablePieceType[]): string {
  return pieces.map((piece) => piece[0]).join('');
}

export function allRunCards(): RunCoreCard[] {
  const cards: RunCoreCard[] = [];
  const visit = (typeIndex: number, remaining: number, pieces: PurchasablePieceType[]): void => {
    if (remaining === 0) {
      const value = pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
      if (value >= 1 && value <= 9) cards.push({ id: cardId(pieces), pieces: [...pieces], value });
      return;
    }
    if (typeIndex >= PURCHASE_ORDER.length) return;
    const piece = PURCHASE_ORDER[typeIndex];
    const value = PIECE_VALUE[piece];
    const max = Math.floor(remaining / value);
    for (let count = 0; count <= max; count += 1) {
      for (let index = 0; index < count; index += 1) pieces.push(piece);
      visit(typeIndex + 1, remaining - count * value, pieces);
      pieces.splice(pieces.length - count, count);
    }
  };
  for (let total = 1; total <= 9; total += 1) visit(0, total, []);
  return cards.sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

export const RUN_CARD_DECK: readonly RunCoreCard[] = Object.freeze(allRunCards());
export const RUN_CARD_BY_ID: Readonly<Record<string, RunCoreCard>> = Object.freeze(
  Object.fromEntries(RUN_CARD_DECK.map((card) => [card.id, card])),
);

export function mixSeed(seed: number, label: string, index = 0): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  for (let cursor = 0; cursor < label.length; cursor += 1) {
    value ^= label.charCodeAt(cursor);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

export function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  const rng = createRng(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.int(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export const PLAGUED_DISCOUNT: Readonly<Record<PurchasablePieceType, number>> = Object.freeze({
  pawn: 0,
  knight: 1,
  bishop: 1,
  rook: 2,
  queen: 3,
});

export function seededPestiferousTarget<T>(
  effectSeed: number,
  candidates: readonly T[],
  sequence: number,
): T | null {
  if (!candidates.length) return null;
  return createRng(mixSeed(effectSeed, 'pestiferous-target', sequence)).pick(candidates);
}

export function pestiferousOfferRoll(
  seed: number,
  battleIndex: number,
  slotIndex: number,
  coreId: string,
  denominator = PESTIFEROUS_OFFER_DENOMINATOR,
): boolean {
  if (!Number.isSafeInteger(denominator) || denominator < 1) return false;
  const rollSeed = mixSeed(seed, `ataraxia-i:pestiferous:${coreId}`, battleIndex * 8 + slotIndex);
  return createRng(rollSeed).int(denominator) === 0;
}

export function concinnousOfferRoll(
  seed: number,
  battleIndex: number,
  slotIndex: number,
  coreId: string,
  denominator = CONCINNOUS_OFFER_DENOMINATOR,
): boolean {
  if (!Number.isSafeInteger(denominator) || denominator < 1) return false;
  const rollSeed = mixSeed(seed, `concinnous:${coreId}`, battleIndex * 8 + slotIndex);
  return createRng(rollSeed).int(denominator) === 0;
}

export function tacticalDisciplineOfferRoll(
  seed: number,
  battleIndex: number,
  slotIndex: number,
  coreId: string,
  denominator = TACTICAL_DISCIPLINE_OFFER_DENOMINATOR,
): boolean {
  if (!Number.isSafeInteger(denominator) || denominator < 1) return false;
  const rollSeed = mixSeed(seed, `tactical:discipline:${coreId}`, battleIndex * 8 + slotIndex);
  return createRng(rollSeed).int(denominator) === 0;
}

export function hieraticAgminateOfferRoll(
  seed: number,
  battleIndex: number,
  slotIndex: number,
  coreId: string,
  denominator = HIERATIC_AGMINATE_OFFER_DENOMINATOR,
): boolean {
  if (!Number.isSafeInteger(denominator) || denominator < 1) return false;
  const rollSeed = mixSeed(seed, `hieratic:agminate:${coreId}`, battleIndex * 8 + slotIndex);
  return createRng(rollSeed).int(denominator) === 0;
}

function acquisitionTarget(effectSeed: number, pieceCount: number, label: string): number | null {
  if (!Number.isSafeInteger(pieceCount) || pieceCount < 1) return null;
  return createRng(mixSeed(effectSeed, label)).int(pieceCount);
}

export function tacticalDisciplineAcquisitionTarget(
  effectSeed: number,
  pieceCount: number,
): number | null {
  return acquisitionTarget(effectSeed, pieceCount, 'tactical-discipline-acquisition-target');
}

export function hieraticAgminateAcquisitionTarget(
  effectSeed: number,
  pieceCount: number,
): number | null {
  return acquisitionTarget(effectSeed, pieceCount, 'hieratic-agminate-acquisition-target');
}

export function createRunCardOffer(
  run: Pick<RunDocument, 'seed' | 'ataraxiaTier'>,
  card: RunCoreCard,
  battleIndex: number,
  slotIndex: number,
  pestiferousDenominator = PESTIFEROUS_OFFER_DENOMINATOR,
  concinnousDenominator = CONCINNOUS_OFFER_DENOMINATOR,
  tacticalDenominator = TACTICAL_DISCIPLINE_OFFER_DENOMINATOR,
  hieraticDenominator = HIERATIC_AGMINATE_OFFER_DENOMINATOR,
): RunCardOffer {
  const tactical = tacticalDisciplineOfferRoll(
    run.seed,
    battleIndex,
    slotIndex,
    card.id,
    tacticalDenominator,
  );
  const pestiferous = !tactical && run.ataraxiaTier >= 1
    && pestiferousOfferRoll(run.seed, battleIndex, slotIndex, card.id, pestiferousDenominator);
  const effectSeed = mixSeed(run.seed, `shop-card:${card.id}`, battleIndex * 8 + slotIndex);
  const concinnous = !tactical
    && !pestiferous
    && concinnousOfferRoll(run.seed, battleIndex, slotIndex, card.id, concinnousDenominator);
  const hieratic = !tactical
    && !pestiferous
    && !concinnous
    && hieraticAgminateOfferRoll(run.seed, battleIndex, slotIndex, card.id, hieraticDenominator);
  const plaguedPieceIndex = pestiferous
    ? seededPestiferousTarget(effectSeed, card.pieces.map((_, index) => index), 0)
    : null;
  const plaguedPiece = plaguedPieceIndex === null ? null : card.pieces[plaguedPieceIndex];
  const cost = plaguedPiece
    ? card.value - PLAGUED_DISCOUNT[plaguedPiece]
    : card.value + (tactical ? DISCIPLINE_COST : concinnous ? POSITIONED_COST : hieratic ? AGMINATE_COST : 0);
  return {
    ...card,
    pieces: [...card.pieces],
    offerId: `shop-${battleIndex}-${slotIndex}-${card.id}`,
    cost,
    cardType: pestiferous
      ? 'pestiferous'
      : tactical
        ? 'tactical'
        : concinnous
          ? 'concinnous'
          : hieratic
            ? 'hieratic'
            : null,
    effectSeed,
    plaguedPieceIndex,
    effectTargetIndex: concinnous
      ? createRng(mixSeed(effectSeed, 'concinnous-target')).int(card.pieces.length)
      : null,
  };
}

const OPENING_SHOP_VALUES: readonly number[] = Object.freeze(
  Array.from({ length: RUN_STARTING_GOLD }, (_, index) => index + 1),
);

/** Opening draws roll in their own index space so a core identity offered in the
 * opening and again in the Shop after Battle 1 — which is also `battleIndex` 0 —
 * rolls its qualifier independently. */
export const OPENING_SHOP_ROLL_BATTLE_INDEX = -1;

/** Deal three distinct uniformly sampled values, then one seeded core card at
 * each value. Sampling values first prevents dense high-value ranks in the
 * 49-card deck from crowding low-value openings out of the Run.
 *
 * Opening draws roll qualifiers exactly like every later Shop draw, at every core
 * value: a Tactical surcharge may price an opening card past the starting gold and
 * out of reach. The one repair is the degenerate deal — ADR-0323 requires a
 * purchase before Continue, so if no offer is affordable the cheapest one drops its
 * qualifier and is offered standard, which no other opening card ever does. */
export function openingShopOffers(seed: number, ataraxiaTier: AtaraxiaTier = 0): RunCardOffer[] {
  const values = shuffled(OPENING_SHOP_VALUES, mixSeed(seed, 'opening-shop-values'))
    .slice(0, RUN_OPENING_OFFER_COUNT);
  const offers = values.map((value, slotIndex) => {
    const candidates = RUN_CARD_DECK.filter((card) => card.value === value);
    const card = shuffled(
      candidates,
      mixSeed(seed, `opening-shop-card:${value}`, slotIndex),
    )[0];
    if (!card) throw new Error(`Opening Shop has no core card worth ${value} gold.`);
    const rolled = createRunCardOffer(
      { seed, ataraxiaTier },
      card,
      OPENING_SHOP_ROLL_BATTLE_INDEX,
      slotIndex,
    );
    return { ...rolled, offerId: `opening-${slotIndex}-${card.id}` };
  });
  if (offers.some((offer) => offer.cost <= RUN_STARTING_GOLD)) return offers;
  const cheapest = offers.reduce(
    (best, offer) => (offer.cost < best.cost ? offer : best),
    offers[0],
  );
  return offers.map((offer) => (offer === cheapest
    ? { ...offer, cost: offer.value, cardType: null, plaguedPieceIndex: null, effectTargetIndex: null }
    : offer));
}

function freshRunId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
}

export function snapshotWar(war: War, levels: Record<string, Level>): RunWarSnapshot {
  const battles = [...war.battles]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((battle) => {
      const level = levels[battle.levelId];
      if (!level) throw new Error(`War ${war.name} is missing Battle level ${battle.levelId}.`);
      return { level: structuredClone(level), loot: level.battle?.loot === true };
    });
  if (!battles.length) throw new Error(`War ${war.name} has no Battles.`);
  return { id: war.id, name: war.name, description: war.description, battles };
}

function initialArmy(seed: number): RunArmyUnit[] {
  return [
    {
      id: 'run-king',
      name: runUnitName(seed, 'king', 0),
      type: 'king',
      number: 1,
      inspectionSeed: mixSeed(seed, 'run-unit-inspection:run-king'),
      abilities: [],
      modifiers: [],
      source: 'king',
    },
    {
      id: 'run-pawn-a',
      name: runUnitName(seed, 'pawn', 0),
      type: 'pawn',
      number: 1,
      inspectionSeed: mixSeed(seed, 'run-unit-inspection:run-pawn-a'),
      abilities: [],
      modifiers: [],
      source: 'starting',
    },
    {
      id: 'run-pawn-b',
      name: runUnitName(seed, 'pawn', 1),
      type: 'pawn',
      number: 2,
      inspectionSeed: mixSeed(seed, 'run-unit-inspection:run-pawn-b'),
      abilities: [],
      modifiers: [],
      source: 'starting',
    },
  ];
}

export function createRun(
  war: RunWarSnapshot,
  seed: number,
  ataraxiaTierOrNow: AtaraxiaTier | string = 0,
  now = new Date().toISOString(),
): RunDocument {
  const ataraxiaTier = typeof ataraxiaTierOrNow === 'number' ? ataraxiaTierOrNow : 0;
  const createdAt = typeof ataraxiaTierOrNow === 'string' ? ataraxiaTierOrNow : now;
  const run: RunDocument = {
    formatVersion: RUN_FORMAT_VERSION,
    id: freshRunId(),
    seed: seed >>> 0,
    ataraxiaTier,
    updatedAt: createdAt,
    war,
    phase: 'shop',
    battleIndex: 0,
    conflictIndex: 0,
    goldTenths: RUN_STARTING_GOLD_TENTHS,
    army: initialArmy(seed),
    cards: [],
    pestiferousLosses: [],
    relics: [],
    seenRelics: [],
    conflictPaidRelics: {},
    nextArmyUnitSequence: 1,
    nextArmyUnitNumberByType: {
      ...initialArmyNumberState(),
      pawn: 3,
      king: 2,
    },
    nextCardSequence: 1,
    deployment: null,
    battleRuntime: null,
    shop: null,
  };
  return {
    ...run,
    shop: {
      kind: 'opening',
      afterBattleIndex: 0,
      conflictIndex: 0,
      victoryGoldTenths: 0,
      cardOffers: openingShopOffers(seed, ataraxiaTier),
      purchasedCardOfferIds: [],
      lootRelicOffers: [],
      chosenLootRelicId: null,
      paidRelicOffer: null,
      paidRelicBought: false,
      soldUnits: [],
      entrySnapshot: createShopEntrySnapshot(run, false),
    },
  };
}

function touch(run: RunDocument): RunDocument {
  return { ...run, updatedAt: new Date().toISOString() };
}

function cloneArmy(army: readonly RunArmyUnit[]): RunArmyUnit[] {
  return army.map((unit) => ({
    ...unit,
    abilities: [...unit.abilities],
    modifiers: [...(unit.modifiers ?? [])],
  }));
}

function cloneCards(cards: readonly RunOwnedCard[]): RunOwnedCard[] {
  return cards.map((card) => ({
    ...card,
    unitIds: [...card.unitIds],
    lostUnitIds: [...card.lostUnitIds],
  }));
}

function normalizeLegacyCards(value: unknown, seed: number): RunOwnedCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): RunOwnedCard[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const card = candidate as Partial<RunOwnedCard> & {
      effect?: { ability?: unknown; targetUnitId?: unknown } | null;
    };
    if (typeof card.id !== 'string' || typeof card.coreId !== 'string') return [];
    const cardType = card.cardType === 'pestiferous'
      ? 'pestiferous'
      : card.cardType === 'concinnous'
        ? 'concinnous'
        : card.cardType === 'tactical'
          ? 'tactical'
          : card.cardType === 'hieratic'
            ? 'hieratic'
        : null;
    const effectSeed = Number.isSafeInteger(card.effectSeed)
      ? Number(card.effectSeed) >>> 0
      : mixSeed(seed, card.id);
    const unitIds = Array.isArray(card.unitIds)
      ? card.unitIds.filter((id): id is string => typeof id === 'string')
      : [];
    const lostUnitIds = Array.isArray(card.lostUnitIds)
      ? card.lostUnitIds.filter((id): id is string => typeof id === 'string')
      : [];
    const storedEffectTargetUnitId = typeof card.effectTargetUnitId === 'string'
      ? card.effectTargetUnitId
      : typeof card.effect?.targetUnitId === 'string'
        ? card.effect.targetUnitId
        : null;
    return [{
      id: card.id,
      coreId: card.coreId,
      cardType,
      effectSeed,
      effectTargetUnitId: (cardType === 'concinnous' || cardType === 'tactical' || cardType === 'hieratic')
        && storedEffectTargetUnitId !== null
        && unitIds.includes(storedEffectTargetUnitId)
        ? storedEffectTargetUnitId
        : null,
      unitIds,
      lostUnitIds,
      plaguedUnitId: cardType === 'pestiferous'
        ? typeof card.plaguedUnitId === 'string' && unitIds.includes(card.plaguedUnitId)
          ? card.plaguedUnitId
          : seededPestiferousTarget(effectSeed, unitIds, lostUnitIds.length)
        : null,
      acquiredAfterBattleIndex: Number.isSafeInteger(card.acquiredAfterBattleIndex)
        ? Math.max(0, Number(card.acquiredAfterBattleIndex))
        : 0,
    }];
  });
}

function normalizeCardOffers(value: unknown): RunCardOffer[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    const offer = candidate as RunCardOffer & {
      effect?: { ability?: unknown; targetPieceIndex?: unknown } | null;
    };
    const cardType = offer.cardType === 'pestiferous'
      ? 'pestiferous'
      : offer.cardType === 'concinnous'
        ? 'concinnous'
        : offer.cardType === 'tactical'
          ? 'tactical'
          : offer.cardType === 'hieratic'
            ? 'hieratic'
        : null;
    const plaguedPieceIndex = cardType === 'pestiferous'
      ? Number.isSafeInteger(offer.plaguedPieceIndex)
        && offer.plaguedPieceIndex !== null
        && offer.plaguedPieceIndex >= 0
        && offer.plaguedPieceIndex < offer.pieces.length
        ? offer.plaguedPieceIndex
        : seededPestiferousTarget(offer.effectSeed, offer.pieces.map((_, index) => index), 0)
      : null;
    const plaguedPiece = plaguedPieceIndex === null ? null : offer.pieces[plaguedPieceIndex];
    const storedEffectTargetIndex = Number.isSafeInteger(offer.effectTargetIndex)
      ? offer.effectTargetIndex
      : Number.isSafeInteger(offer.effect?.targetPieceIndex)
        ? Number(offer.effect?.targetPieceIndex)
        : null;
    const effectTargetIndex = cardType === 'concinnous'
      ? Number.isSafeInteger(storedEffectTargetIndex)
        && storedEffectTargetIndex !== null
        && storedEffectTargetIndex >= 0
        && storedEffectTargetIndex < offer.pieces.length
        ? storedEffectTargetIndex
        : createRng(mixSeed(offer.effectSeed, 'concinnous-target')).int(offer.pieces.length)
      : null;
    return {
      ...offer,
      cardType,
      cost: plaguedPiece
        ? offer.value - PLAGUED_DISCOUNT[plaguedPiece]
        : offer.value + (cardType === 'tactical'
          ? DISCIPLINE_COST
          : cardType === 'concinnous'
            ? POSITIONED_COST
            : cardType === 'hieratic'
              ? AGMINATE_COST
              : 0),
      plaguedPieceIndex,
      effectTargetIndex,
    };
  });
}

function cardsNeedTargetNormalization(cards: readonly RunOwnedCard[]): boolean {
  return cards.some((card) => (
    card.cardType === 'pestiferous'
      ? card.unitIds.length > 0
        ? typeof card.plaguedUnitId !== 'string' || !card.unitIds.includes(card.plaguedUnitId)
        : card.plaguedUnitId !== null
      : card.plaguedUnitId !== null
  )) || cards.some((card) => (
    (card.cardType === 'concinnous' || card.cardType === 'tactical' || card.cardType === 'hieratic')
      ? typeof card.effectTargetUnitId !== 'string' || card.effectTargetUnitId.length === 0
      : card.effectTargetUnitId !== null
  ));
}

function offersNeedTargetNormalization(offers: readonly RunCardOffer[]): boolean {
  return offers.some((offer) => (
    offer.cardType === 'pestiferous'
      ? !Number.isSafeInteger(offer.plaguedPieceIndex)
        || offer.plaguedPieceIndex === null
        || offer.plaguedPieceIndex < 0
        || offer.plaguedPieceIndex >= offer.pieces.length
      : offer.plaguedPieceIndex !== null
  )) || offers.some((offer) => (
    offer.cardType === 'concinnous'
      ? !Number.isSafeInteger(offer.effectTargetIndex)
        || offer.effectTargetIndex === null
        || offer.effectTargetIndex < 0
        || offer.effectTargetIndex >= offer.pieces.length
      : offer.effectTargetIndex !== null
  ));
}

function synchronizePlaguedModifiers(
  army: RunArmyUnit[],
  cards: readonly RunOwnedCard[],
): RunArmyUnit[] {
  const plaguedUnitIds = new Set(cards.flatMap((card) => (
    card.cardType === 'pestiferous' && card.plaguedUnitId ? [card.plaguedUnitId] : []
  )));
  let changed = false;
  const synchronized = army.map((unit) => {
    const shouldBePlagued = plaguedUnitIds.has(unit.id);
    const isPlagued = unit.modifiers.includes('plagued');
    if (shouldBePlagued === isPlagued) return unit;
    changed = true;
    return {
      ...unit,
      modifiers: shouldBePlagued
        ? [...unit.modifiers, 'plagued' as const]
        : unit.modifiers.filter((modifier) => modifier !== 'plagued'),
    };
  });
  return changed ? synchronized : army;
}

function cloneConflictPaidRelics(
  conflictPaidRelics: RunDocument['conflictPaidRelics'],
): RunDocument['conflictPaidRelics'] {
  return Object.fromEntries(
    Object.entries(conflictPaidRelics).map(([key, value]) => [key, { ...value }]),
  );
}

function createShopEntrySnapshot(run: RunDocument, paidRelicBought: boolean): RunShopEntrySnapshot {
  return {
    goldTenths: run.goldTenths,
    army: cloneArmy(run.army),
    cards: cloneCards(run.cards),
    relics: [...run.relics],
    seenRelics: [...run.seenRelics],
    conflictPaidRelics: cloneConflictPaidRelics(run.conflictPaidRelics),
    nextArmyUnitSequence: run.nextArmyUnitSequence,
    nextArmyUnitNumberByType: { ...run.nextArmyUnitNumberByType },
    nextCardSequence: run.nextCardSequence,
    paidRelicBought,
  };
}

function normalizedArmyIdentity(run: RunDocument): {
  army: RunArmyUnit[];
  shop: RunShopState | null;
  nextArmyUnitNumberByType: RunArmyNumberState;
  changed: boolean;
} {
  const entryArmy = run.shop?.entrySnapshot?.army ?? [];
  const soldArmy = run.shop?.soldUnits?.map((entry) => entry.unit) ?? [];
  const units = [...entryArmy, ...run.army, ...soldArmy];
  const byId = new Map<string, RunArmyUnit>();
  for (const unit of units) {
    if (!byId.has(unit.id)) byId.set(unit.id, unit);
  }

  const used = Object.fromEntries(ARMY_PIECE_ORDER.map((type) => [type, new Set<number>()])) as Record<
    RunArmyPieceType,
    Set<number>
  >;
  const assignedNumbers = new Map<string, number>();
  const assignedNames = new Map<string, string>();
  const assignedInspectionSeeds = new Map<string, number>();
  const roleOrdinals = initialArmyNumberState();
  for (const type of ARMY_PIECE_ORDER) roleOrdinals[type] = 0;
  const replacesLegacyNames = Number(run.formatVersion) < 3;
  for (const unit of byId.values()) {
    let number = Number.isSafeInteger(unit.number) && unit.number > 0 ? unit.number : 1;
    while (used[unit.type].has(number)) number += 1;
    used[unit.type].add(number);
    assignedNumbers.set(unit.id, number);

    const roleOrdinal = roleOrdinals[unit.type];
    roleOrdinals[unit.type] += 1;
    const validName = typeof unit.name === 'string'
      && unit.name.trim().length > 0
      && unit.name.length <= 80;
    assignedNames.set(
      unit.id,
      !replacesLegacyNames && validName
        ? unit.name
        : runUnitName(run.seed, unit.type, roleOrdinal),
    );
    assignedInspectionSeeds.set(
      unit.id,
      Number.isSafeInteger(unit.inspectionSeed)
        && unit.inspectionSeed >= 0
        && unit.inspectionSeed <= 0xffffffff
        ? unit.inspectionSeed
        : mixSeed(run.seed, `run-unit-inspection:${unit.id}`, roleOrdinal),
    );
  }

  let changed = false;
  const rewriteArmy = (army: readonly RunArmyUnit[]): RunArmyUnit[] => army.map((unit) => {
    const number = assignedNumbers.get(unit.id) ?? 1;
    const name = assignedNames.get(unit.id) ?? runUnitName(run.seed, unit.type, number - 1);
    const inspectionSeed = assignedInspectionSeeds.get(unit.id)
      ?? mixSeed(run.seed, `run-unit-inspection:${unit.id}`, number - 1);
    const modifiers = Array.isArray(unit.modifiers)
      ? unit.modifiers.filter((modifier): modifier is RunUnitModifier => modifier === 'plagued')
      : [];
    const source = String(unit.source) === 'draft' ? 'shop' : unit.source;
    if (
      unit.number === number
      && unit.name === name
      && unit.inspectionSeed === inspectionSeed
      && Array.isArray(unit.modifiers)
      && modifiers.length === unit.modifiers.length
      && unit.source === source
    ) return unit;
    changed = true;
    return { ...unit, name, number, inspectionSeed, modifiers, source };
  });
  const army = rewriteArmy(run.army);
  let shop = run.shop;
  if (shop) {
    const soldUnits = (shop.soldUnits ?? []).map((entry) => {
      const [unit] = rewriteArmy([entry.unit]);
      return unit === entry.unit ? entry : { ...entry, unit };
    });
    const entrySnapshot = shop.entrySnapshot
      ? { ...shop.entrySnapshot, army: rewriteArmy(shop.entrySnapshot.army) }
      : shop.entrySnapshot;
    if (soldUnits !== shop.soldUnits || entrySnapshot !== shop.entrySnapshot) {
      shop = { ...shop, soldUnits, entrySnapshot };
    }
  }

  const existingNumbers = run.nextArmyUnitNumberByType;
  const nextArmyUnitNumberByType = initialArmyNumberState();
  for (const type of ARMY_PIECE_ORDER) {
    const highestUsed = used[type].size ? Math.max(...used[type]) + 1 : 1;
    const existing = Number.isSafeInteger(existingNumbers?.[type]) && existingNumbers[type] > 0
      ? existingNumbers[type]
      : 1;
    nextArmyUnitNumberByType[type] = Math.max(highestUsed, existing);
  }
  if (
    !existingNumbers
    || ARMY_PIECE_ORDER.some((type) => existingNumbers[type] !== nextArmyUnitNumberByType[type])
  ) changed = true;

  return { army, shop, nextArmyUnitNumberByType, changed };
}

export function normalizeRunDocument(run: RunDocument): RunDocument {
  const raw = run as Omit<RunDocument, 'phase'> & {
    phase: RunPhase | 'draft';
    draftOffers?: unknown;
    chosenDraftId?: unknown;
  };
  if (raw.phase === 'draft') throw new Error('The retired Run draft phase is unsupported.');
  if (raw.phase === 'shop' && Number(raw.formatVersion) !== RUN_FORMAT_VERSION) {
    throw new Error('Older Run Shop documents are unsupported.');
  }
  let next = run;
  if ('draftOffers' in raw || 'chosenDraftId' in raw) {
    const withoutDraft = { ...raw } as Record<string, unknown>;
    delete withoutDraft.draftOffers;
    delete withoutDraft.chosenDraftId;
    next = withoutDraft as unknown as RunDocument;
  }
  if (
    next.phase !== 'shop'
    || !next.shop
    || (Number.isSafeInteger(next.shop.victoryGoldTenths) && next.shop.victoryGoldTenths >= 0)
  ) {
    // Current documents already carry the exact reward.
  } else {
    const battle = next.war.battles[next.shop.afterBattleIndex];
    if (battle) {
      const reward = battleVictoryGoldTenths(battle.level);
      next = {
        ...next,
        goldTenths: Math.max(0, next.goldTenths + reward - GOLD_SCALE),
        shop: { ...next.shop, victoryGoldTenths: reward },
      };
    }
  }

  const legacy = next as RunDocument & {
    ataraxiaTier?: unknown;
    cards?: unknown;
    pestiferousLosses?: unknown;
    nextCardSequence?: unknown;
  };
  const ataraxiaTier: AtaraxiaTier = legacy.ataraxiaTier === 1 ? 1 : 0;
  const storedCards = Array.isArray(legacy.cards) ? legacy.cards as RunOwnedCard[] : [];
  const cards = Number(next.formatVersion) === RUN_FORMAT_VERSION
    && !cardsNeedTargetNormalization(storedCards)
    ? storedCards
    : normalizeLegacyCards(legacy.cards, next.seed);
  const pestiferousLosses = Array.isArray(legacy.pestiferousLosses)
    ? legacy.pestiferousLosses as RunPestiferousLoss[]
    : [];
  const nextCardSequence = Number.isSafeInteger(legacy.nextCardSequence) && Number(legacy.nextCardSequence) > 0
    ? Number(legacy.nextCardSequence)
    : cards.length + 1;
  let shop = legacy.shop;
  if (shop && shop.kind !== 'opening' && shop.kind !== 'post-battle') {
    shop = { ...shop, kind: 'post-battle' };
  }
  if (shop && (
    offersNeedTargetNormalization(shop.cardOffers)
    || (shop.entrySnapshot && cardsNeedTargetNormalization(shop.entrySnapshot.cards))
  )) {
    shop = {
      ...shop,
      cardOffers: normalizeCardOffers(shop.cardOffers),
      ...(shop.entrySnapshot
        ? {
            entrySnapshot: {
              ...shop.entrySnapshot,
              cards: normalizeLegacyCards(shop.entrySnapshot.cards, next.seed),
            },
          }
        : {}),
    };
  }
  if (
    next.ataraxiaTier !== ataraxiaTier
    || next.cards !== cards
    || next.pestiferousLosses !== pestiferousLosses
    || next.nextCardSequence !== nextCardSequence
    || next.shop !== shop
  ) {
    next = { ...next, ataraxiaTier, cards, pestiferousLosses, nextCardSequence, shop };
  }

  const identity = normalizedArmyIdentity(next);
  const army = synchronizePlaguedModifiers(identity.army, next.cards);
  let identityShop = identity.shop;
  if (identityShop?.entrySnapshot) {
    const entryArmy = synchronizePlaguedModifiers(
      identityShop.entrySnapshot.army,
      identityShop.entrySnapshot.cards,
    );
    if (entryArmy !== identityShop.entrySnapshot.army) {
      identityShop = {
        ...identityShop,
        entrySnapshot: { ...identityShop.entrySnapshot, army: entryArmy },
      };
    }
  }
  const versionChanged = Number(next.formatVersion) !== RUN_FORMAT_VERSION;
  if (identity.changed || versionChanged || army !== identity.army || identityShop !== identity.shop) {
    next = {
      ...next,
      formatVersion: RUN_FORMAT_VERSION,
      army,
      shop: identityShop,
      nextArmyUnitNumberByType: identity.nextArmyUnitNumberByType,
    };
  }
  if (
    next.phase === 'shop'
    && next.shop
    && (
      !next.shop.entrySnapshot
      || !Array.isArray(next.shop.soldUnits)
      || !Array.isArray(next.shop.entrySnapshot.cards)
      || !Number.isSafeInteger(next.shop.entrySnapshot.nextCardSequence)
    )
  ) {
    const paidRelicBought = next.shop.paidRelicBought === true;
    next = {
      ...next,
      shop: {
        ...next.shop,
        soldUnits: Array.isArray(next.shop.soldUnits) ? next.shop.soldUnits : [],
        entrySnapshot: next.shop.entrySnapshot
          ? {
              ...next.shop.entrySnapshot,
              cards: Array.isArray(next.shop.entrySnapshot.cards)
                ? cloneCards(next.shop.entrySnapshot.cards)
                : cloneCards(next.cards),
              nextCardSequence: Number.isSafeInteger(next.shop.entrySnapshot.nextCardSequence)
                ? next.shop.entrySnapshot.nextCardSequence
                : next.nextCardSequence,
            }
          : createShopEntrySnapshot(next, paidRelicBought),
      },
    };
  }
  return next;
}

export function addArmyPieces(
  run: RunDocument,
  pieces: readonly PurchasablePieceType[],
  source: RunArmyUnit['source'],
  modifiers: readonly RunUnitModifier[] = [],
): Pick<RunDocument, 'army' | 'nextArmyUnitSequence' | 'nextArmyUnitNumberByType'> & {
  addedUnits: RunArmyUnit[];
} {
  let sequence = run.nextArmyUnitSequence;
  const nextArmyUnitNumberByType = { ...run.nextArmyUnitNumberByType };
  const added = pieces.map((type): RunArmyUnit => {
    const number = nextArmyUnitNumberByType[type];
    const unit = {
      id: `run-unit-${sequence}`,
      name: runUnitName(run.seed, type, number - 1),
      type,
      number,
      inspectionSeed: mixSeed(run.seed, `run-unit-inspection:run-unit-${sequence}`, sequence),
      abilities: [],
      modifiers: [...modifiers],
      source,
    };
    sequence += 1;
    nextArmyUnitNumberByType[type] += 1;
    return unit;
  });
  return {
    army: [...run.army, ...added],
    nextArmyUnitSequence: sequence,
    nextArmyUnitNumberByType,
    addedUnits: added,
  };
}

export function hasRelic(run: RunDocument, relic: RunRelicId): boolean {
  return run.relics.includes(relic);
}

export function relicGrantingRunAbility(
  run: RunDocument,
  unit: RunArmyUnit,
  ability: RunAbility,
): RunRelicId | null {
  for (const relicId of run.relics) {
    const grant = RUN_RELIC_ABILITY_GRANTS[relicId];
    if (grant?.ability === ability && grant.unitType === unit.type) return relicId;
  }
  return null;
}

export function hasRunAbility(run: RunDocument, unit: RunArmyUnit, ability: RunAbility): boolean {
  return unit.abilities.includes(ability) || relicGrantingRunAbility(run, unit, ability) !== null;
}

function availableRelics(run: RunDocument): RunRelicId[] {
  const held = new Set(run.relics);
  const seen = new Set(run.seenRelics);
  return RUN_RELICS
    .filter((relic) => !held.has(relic.id) && !seen.has(relic.id) && (!relic.requires || held.has(relic.requires)))
    .map((relic) => relic.id);
}

function revealRelics(run: RunDocument, count: number, label: string, index: number): {
  offers: RunRelicId[];
  seenRelics: RunRelicId[];
} {
  const offers = shuffled(availableRelics(run), mixSeed(run.seed, label, index)).slice(0, count);
  return { offers, seenRelics: [...run.seenRelics, ...offers] };
}

export function prepareDeployment(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment') return run;
  const seed = mixSeed(run.seed, 'deployment', run.battleIndex);
  const temporaryDisciplineUnitId = hasRelic(run, 'inspirational-record')
    ? createRng(mixSeed(seed, 'inspirational-record')).pick(run.army).id
    : undefined;
  return touch({
    ...run,
    deployment: run.deployment?.battleIndex === run.battleIndex
      ? run.deployment
      : {
          battleIndex: run.battleIndex,
          seed,
          blockedUnitIds: [],
          manualPlacements: {},
          temporaryDisciplineUnitId,
        },
    battleRuntime: null,
  });
}

export function setDeploymentChoices(
  run: RunDocument,
  choices: Partial<Pick<RunDeploymentState, 'chosenBlockedUnitIds' | 'manualPlacements' | 'layoutChoice'>>,
): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  return touch({ ...run, deployment: { ...run.deployment, ...choices } });
}

export function beginBattle(
  run: RunDocument,
  deployedUnitIds: readonly string[],
  reserveUnitIds: readonly string[],
  blockedUnitIds: readonly string[],
): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  return touch({
    ...run,
    phase: 'battle',
    deployment: { ...run.deployment, blockedUnitIds: [...blockedUnitIds] },
    battleRuntime: {
      battleIndex: run.battleIndex,
      initiallyDeployedUnitIds: [...deployedUnitIds],
      reserveUnitIds: [...reserveUnitIds],
      reservistPoolUnitIds: [],
      deployedReservistUnitIds: [],
      observedDeadUnitIds: [],
      cashedOutUnitIds: [],
      reinforcementSequence: 0,
    },
  });
}

export function restartBattle(run: RunDocument): RunDocument {
  if (run.phase !== 'battle' || !run.deployment) return run;
  return touch({
    ...run,
    battleRuntime: {
      battleIndex: run.battleIndex,
      initiallyDeployedUnitIds: run.army
        .filter((unit) => !run.deployment?.blockedUnitIds.includes(unit.id))
        .map((unit) => unit.id),
      reserveUnitIds: [...run.deployment.blockedUnitIds],
      reservistPoolUnitIds: [],
      deployedReservistUnitIds: [],
      observedDeadUnitIds: [],
      cashedOutUnitIds: [],
      reinforcementSequence: 0,
    },
  });
}

export function cashOutPawn(run: RunDocument, unitId: string): RunDocument {
  const unit = run.army.find((candidate) => candidate.id === unitId);
  if (run.phase !== 'battle' || unit?.type !== 'pawn') return run;
  const removal = removeUnitFromArmyAndCards(run, unitId);
  return touch({
    ...run,
    ...removal,
    goldTenths: run.goldTenths + 2 * GOLD_SCALE,
    battleRuntime: run.battleRuntime
      ? {
          ...run.battleRuntime,
          cashedOutUnitIds: [...new Set([...run.battleRuntime.cashedOutUnitIds, unitId])],
        }
      : null,
  });
}

export function observeRunUnitDeath(run: RunDocument, unitId: string): {
  run: RunDocument;
  reservistUnitId: string | null;
} {
  const runtime = run.battleRuntime;
  if (run.phase !== 'battle' || !runtime || runtime.observedDeadUnitIds.includes(unitId)) {
    return { run, reservistUnitId: null };
  }
  let nextRuntime: RunBattleRuntime = {
    ...runtime,
    observedDeadUnitIds: [...runtime.observedDeadUnitIds, unitId],
    reinforcementSequence: runtime.reinforcementSequence + 1,
  };
  if (!hasRelic(run, 'deployment-vehicle') || runtime.cashedOutUnitIds.includes(unitId)) {
    return { run: touch({ ...run, battleRuntime: nextRuntime }), reservistUnitId: null };
  }
  const dead = run.army.find((unit) => unit.id === unitId);
  const alreadyReservists = new Set([...runtime.reservistPoolUnitIds, ...runtime.deployedReservistUnitIds]);
  const eligible = runtime.reserveUnitIds.flatMap((id) => {
    const unit = run.army.find((candidate) => candidate.id === id);
    return unit && dead && !alreadyReservists.has(id) && PIECE_VALUE[unit.type] <= PIECE_VALUE[dead.type] ? [unit] : [];
  });
  if (eligible.length) {
    const added = createRng(mixSeed(run.deployment?.seed ?? run.seed, 'reservist-add', nextRuntime.reinforcementSequence)).pick(eligible);
    nextRuntime = {
      ...nextRuntime,
      reservistPoolUnitIds: [...nextRuntime.reservistPoolUnitIds, added.id],
    };
  }
  if (!nextRuntime.reservistPoolUnitIds.length) {
    return { run: touch({ ...run, battleRuntime: nextRuntime }), reservistUnitId: null };
  }
  const reservistUnitId = createRng(mixSeed(run.deployment?.seed ?? run.seed, 'reservist-draw', nextRuntime.reinforcementSequence))
    .pick(nextRuntime.reservistPoolUnitIds);
  return { run: touch({ ...run, battleRuntime: nextRuntime }), reservistUnitId };
}

export function markReservistDeployed(run: RunDocument, unitId: string): RunDocument {
  if (!run.battleRuntime || !run.battleRuntime.reservistPoolUnitIds.includes(unitId)) return run;
  return touch({
    ...run,
    battleRuntime: {
      ...run.battleRuntime,
      reservistPoolUnitIds: run.battleRuntime.reservistPoolUnitIds.filter((id) => id !== unitId),
      deployedReservistUnitIds: [...run.battleRuntime.deployedReservistUnitIds, unitId],
    },
  });
}

function immediateRelic(run: RunDocument, relic: RunRelicId, targetUnitId?: string): RunDocument {
  let next = run;
  if (relic === 'congressional-approval') next = { ...next, goldTenths: next.goldTenths + 5 * GOLD_SCALE };
  if (relic === 'occult-dagger') next = { ...next, goldTenths: next.goldTenths + 10 * GOLD_SCALE };
  if (relic === 'conscription-notice' && targetUnitId) {
    next = {
      ...next,
      army: next.army.map((unit) => (
        unit.id === targetUnitId && !unit.abilities.includes('discipline')
          ? { ...unit, abilities: [...unit.abilities, 'discipline'] }
          : unit
      )),
    };
  }
  return next;
}

export function acquireRelic(run: RunDocument, relic: RunRelicId, targetUnitId?: string): RunDocument {
  if (run.relics.includes(relic)) return run;
  if (relic === 'conscription-notice' && !run.army.some((unit) => unit.id === targetUnitId)) return run;
  return touch(immediateRelic({ ...run, relics: [...run.relics, relic] }, relic, targetUnitId));
}

/** Administrator-only caller helper. Authorization belongs to the server endpoint;
 * the Run model still owns the actual currency mutation and timestamp. */
export function grantGold(run: RunDocument, amountTenths: number): RunDocument {
  if (!Number.isSafeInteger(amountTenths) || amountTenths <= 0) return run;
  return touch({ ...run, goldTenths: run.goldTenths + amountTenths });
}

function cardsWithoutUnit(cards: readonly RunOwnedCard[], unitId: string): RunOwnedCard[] {
  return cards.map((card) => {
    if (!card.unitIds.includes(unitId)) return card;
    const unitIds = card.unitIds.filter((id) => id !== unitId);
    const plaguedUnitId = card.cardType === 'pestiferous'
      ? card.plaguedUnitId === unitId || !unitIds.includes(card.plaguedUnitId ?? '')
        ? seededPestiferousTarget(card.effectSeed, unitIds, card.lostUnitIds.length)
        : card.plaguedUnitId
      : null;
    return { ...card, unitIds, plaguedUnitId };
  });
}

export function removeUnitFromArmyAndCards(
  run: Pick<RunDocument, 'army' | 'cards'>,
  unitId: string,
): Pick<RunDocument, 'army' | 'cards'> {
  const cards = cardsWithoutUnit(run.cards, unitId);
  const army = synchronizePlaguedModifiers(
    run.army.filter((candidate) => candidate.id !== unitId),
    cards,
  );
  return { army, cards };
}

export function deterioratePestiferousCards(run: RunDocument, battleIndex: number): RunDocument {
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  const removedIds = new Set<string>();
  const losses: RunPestiferousLoss[] = [];
  const cards = run.cards.map((card) => {
    if (card.cardType !== 'pestiferous') return card;
    if (run.pestiferousLosses.some((loss) => loss.cardId === card.id && loss.battleIndex === battleIndex)) {
      return card;
    }
    const remaining = card.unitIds.filter((id) => armyById.has(id) && !removedIds.has(id));
    if (!remaining.length) return card;
    const unitId = card.plaguedUnitId && remaining.includes(card.plaguedUnitId)
      ? card.plaguedUnitId
      : seededPestiferousTarget(card.effectSeed, remaining, card.lostUnitIds.length);
    if (!unitId) return card;
    const unit = armyById.get(unitId);
    if (!unit) return card;
    removedIds.add(unitId);
    const plaguedUnit = unit.modifiers.includes('plagued')
      ? unit
      : { ...unit, modifiers: [...unit.modifiers, 'plagued' as const] };
    losses.push({ battleIndex, cardId: card.id, unit: cloneArmy([plaguedUnit])[0] });
    const unitIds = card.unitIds.filter((id) => id !== unitId);
    const lostUnitIds = [...card.lostUnitIds, unitId];
    return {
      ...card,
      unitIds,
      lostUnitIds,
      plaguedUnitId: seededPestiferousTarget(card.effectSeed, unitIds, lostUnitIds.length),
    };
  });
  if (!losses.length) return run;
  const army = synchronizePlaguedModifiers(
    run.army.filter((unit) => !removedIds.has(unit.id)),
    cards,
  );
  return {
    ...run,
    army,
    cards,
    pestiferousLosses: [...run.pestiferousLosses, ...losses],
  };
}

export function openShop(run: RunDocument, survivingUnitIds: readonly string[]): RunDocument {
  if (run.phase !== 'battle') return run;
  const finalBattle = run.battleIndex >= run.war.battles.length - 1;

  const survivorSet = new Set(survivingUnitIds);
  const rifleTenths = hasRelic(run, 'mercenarys-rifle')
    ? run.army.reduce((total, unit) => total + (survivorSet.has(unit.id) ? PIECE_VALUE[unit.type] : 0), 0)
    : 0;
  const victoryGoldTenths = battleVictoryGoldTenths(run.war.battles[run.battleIndex].level);
  const deteriorated = deterioratePestiferousCards(run, run.battleIndex);
  if (finalBattle) {
    return touch({ ...deteriorated, phase: 'victory', shop: null, deployment: null, battleRuntime: null });
  }
  let next: RunDocument = {
    ...deteriorated,
    phase: 'shop',
    goldTenths: run.goldTenths + victoryGoldTenths + rifleTenths,
    deployment: null,
    battleRuntime: null,
  };
  const cardCount = hasRelic(next, 'quartermasters-ledger') ? 4 : 3;
  const cardOffers = shuffled(RUN_CARD_DECK, mixSeed(next.seed, 'shop-cards', next.battleIndex))
    .slice(0, cardCount)
    .map((card, slotIndex) => createRunCardOffer(next, card, next.battleIndex, slotIndex));
  const loot = next.war.battles[next.battleIndex]?.loot === true;
  const lootReveal = loot ? revealRelics(next, 3, 'loot-relics', next.battleIndex) : { offers: [], seenRelics: next.seenRelics };
  next = { ...next, seenRelics: lootReveal.seenRelics };
  let paidRelicOffer: RunRelicId | null = null;
  let paidRelicBought = false;
  if (hasRelic(next, 'merchants-shopkey')) {
    const existing = next.conflictPaidRelics[String(next.conflictIndex)];
    if (existing) {
      paidRelicOffer = existing.relicId;
      paidRelicBought = existing.bought;
    } else {
      const paidReveal = revealRelics(next, 1, 'shopkey-relic', next.conflictIndex);
      paidRelicOffer = paidReveal.offers[0] ?? null;
      next = {
        ...next,
        seenRelics: paidReveal.seenRelics,
        conflictPaidRelics: paidRelicOffer
          ? {
              ...next.conflictPaidRelics,
              [String(next.conflictIndex)]: { relicId: paidRelicOffer, bought: false },
            }
          : next.conflictPaidRelics,
      };
    }
  }
  const entrySnapshot = createShopEntrySnapshot(next, paidRelicBought);
  return touch({
    ...next,
    shop: {
      kind: 'post-battle',
      afterBattleIndex: next.battleIndex,
      conflictIndex: next.conflictIndex,
      victoryGoldTenths,
      cardOffers,
      purchasedCardOfferIds: [],
      lootRelicOffers: lootReveal.offers,
      chosenLootRelicId: null,
      paidRelicOffer,
      paidRelicBought,
      soldUnits: [],
      entrySnapshot,
    },
  });
}

export function buyCard(run: RunDocument, offerId: string): RunDocument {
  const offer = run.shop?.cardOffers.find((candidate) => candidate.offerId === offerId);
  if (
    run.phase !== 'shop'
    || !run.shop
    || run.shop.purchasedCardOfferIds.includes(offerId)
    || !offer
  ) return run;
  const cost = offer.cost * GOLD_SCALE;
  if (run.goldTenths < cost) return run;
  const { addedUnits, ...armyUpdate } = addArmyPieces(run, offer.pieces, 'shop');
  const plaguedUnitId = offer.cardType === 'pestiferous' && offer.plaguedPieceIndex !== null
    ? addedUnits[offer.plaguedPieceIndex]?.id ?? null
    : null;
  const effectTargetUnit = offer.cardType === 'concinnous'
    && Number.isSafeInteger(offer.effectTargetIndex)
    ? addedUnits[offer.effectTargetIndex!]
    : offer.cardType === 'tactical'
      ? addedUnits[tacticalDisciplineAcquisitionTarget(offer.effectSeed, addedUnits.length) ?? -1]
      : offer.cardType === 'hieratic'
        ? addedUnits[hieraticAgminateAcquisitionTarget(offer.effectSeed, addedUnits.length) ?? -1]
        : undefined;
  const grantedAbility: RunAbility | null = offer.cardType === 'tactical'
    ? 'discipline'
    : offer.cardType === 'concinnous'
      ? 'positioned'
      : offer.cardType === 'hieratic'
        ? 'marshalled'
        : null;
  const abilityArmy = effectTargetUnit
    ? armyUpdate.army.map((unit): RunArmyUnit => unit.id === effectTargetUnit.id
      ? {
          ...unit,
          abilities: grantedAbility && !unit.abilities.includes(grantedAbility)
            ? [...unit.abilities, grantedAbility]
            : unit.abilities,
        }
      : unit)
    : armyUpdate.army;
  const card: RunOwnedCard = {
    id: `run-card-${run.nextCardSequence}`,
    coreId: offer.id,
    cardType: offer.cardType,
    effectSeed: offer.effectSeed,
    effectTargetUnitId: effectTargetUnit?.id ?? null,
    unitIds: addedUnits.map((unit) => unit.id),
    lostUnitIds: [],
    plaguedUnitId,
    acquiredAfterBattleIndex: run.shop.afterBattleIndex,
  };
  const cards = [...run.cards, card];
  return touch({
    ...run,
    ...armyUpdate,
    army: synchronizePlaguedModifiers(abilityArmy, cards),
    cards,
    nextCardSequence: run.nextCardSequence + 1,
    goldTenths: run.goldTenths - cost,
    shop: {
      ...run.shop,
      purchasedCardOfferIds: [...run.shop.purchasedCardOfferIds, offerId],
    },
  });
}

export function sellArmyUnit(run: RunDocument, unitId: string): RunDocument {
  if (run.phase !== 'shop') return run;
  const unit = run.army.find((candidate) => candidate.id === unitId);
  if (!unit || unit.type === 'king') return run;
  const numerator = hasRelic(run, 'fair-scales') ? 75 : 50;
  const proceedsTenths = (PIECE_VALUE[unit.type] * GOLD_SCALE * numerator) / 100;
  const removal = removeUnitFromArmyAndCards(run, unitId);
  return touch({
    ...run,
    ...removal,
    goldTenths: run.goldTenths + proceedsTenths,
    shop: run.shop
      ? {
          ...run.shop,
          soldUnits: [...run.shop.soldUnits, { unit: cloneArmy([unit])[0], proceedsTenths }],
        }
      : null,
  });
}

export function resetShop(run: RunDocument): RunDocument {
  if (run.phase !== 'shop' || !run.shop?.entrySnapshot) return run;
  const snapshot = run.shop.entrySnapshot;
  return touch({
    ...run,
    goldTenths: snapshot.goldTenths,
    army: cloneArmy(snapshot.army),
    cards: cloneCards(snapshot.cards),
    relics: [...snapshot.relics],
    seenRelics: [...snapshot.seenRelics],
    conflictPaidRelics: cloneConflictPaidRelics(snapshot.conflictPaidRelics),
    nextArmyUnitSequence: snapshot.nextArmyUnitSequence,
    nextArmyUnitNumberByType: { ...snapshot.nextArmyUnitNumberByType },
    nextCardSequence: snapshot.nextCardSequence,
    shop: {
      ...run.shop,
      purchasedCardOfferIds: [],
      chosenLootRelicId: null,
      paidRelicBought: snapshot.paidRelicBought,
      soldUnits: [],
    },
  });
}

export function shopHasChanges(run: RunDocument): boolean {
  if (run.phase !== 'shop' || !run.shop?.entrySnapshot) return false;
  const snapshot = run.shop.entrySnapshot;
  return (
    run.goldTenths !== snapshot.goldTenths
    || run.nextArmyUnitSequence !== snapshot.nextArmyUnitSequence
    || run.shop.purchasedCardOfferIds.length > 0
    || run.shop.chosenLootRelicId !== null
    || run.shop.paidRelicBought !== snapshot.paidRelicBought
    || run.shop.soldUnits.length > 0
    || JSON.stringify(run.army) !== JSON.stringify(snapshot.army)
    || JSON.stringify(run.cards) !== JSON.stringify(snapshot.cards)
    || JSON.stringify(run.relics) !== JSON.stringify(snapshot.relics)
    || JSON.stringify(run.conflictPaidRelics) !== JSON.stringify(snapshot.conflictPaidRelics)
  );
}

export function canLeaveShop(run: RunDocument): boolean {
  if (run.phase !== 'shop' || !run.shop) return false;
  if (run.shop.lootRelicOffers.length > 0 && !run.shop.chosenLootRelicId) return false;
  return true;
}

export function takeLootRelic(run: RunDocument, relic: RunRelicId, targetUnitId?: string): RunDocument {
  if (run.phase !== 'shop' || !run.shop || run.shop.chosenLootRelicId || !run.shop.lootRelicOffers.includes(relic)) return run;
  const acquired = acquireRelic(run, relic, targetUnitId);
  if (acquired === run) return run;
  return touch({ ...acquired, shop: { ...run.shop, chosenLootRelicId: relic } });
}

export function buyPaidRelic(run: RunDocument, targetUnitId?: string): RunDocument {
  if (run.phase !== 'shop' || !run.shop || !run.shop.paidRelicOffer || run.shop.paidRelicBought || run.goldTenths < 10 * GOLD_SCALE) return run;
  const acquired = acquireRelic(run, run.shop.paidRelicOffer, targetUnitId);
  if (acquired === run) return run;
  return touch({
    ...acquired,
    goldTenths: acquired.goldTenths - 10 * GOLD_SCALE,
    conflictPaidRelics: {
      ...acquired.conflictPaidRelics,
      [String(run.conflictIndex)]: { relicId: run.shop.paidRelicOffer, bought: true },
    },
    shop: { ...run.shop, paidRelicBought: true },
  });
}

export function leaveShop(run: RunDocument): RunDocument {
  if (!canLeaveShop(run) || !run.shop) return run;
  const opening = run.shop.kind === 'opening';
  const endedConflict = run.war.battles[run.shop.afterBattleIndex]?.loot === true;
  return touch({
    ...run,
    phase: 'deployment',
    battleIndex: opening ? run.battleIndex : run.battleIndex + 1,
    conflictIndex: run.conflictIndex + (!opening && endedConflict ? 1 : 0),
    deployment: null,
    battleRuntime: null,
    shop: null,
  });
}

export function formatGold(goldTenths: number): string {
  const gold = goldTenths / GOLD_SCALE;
  return gold.toFixed(Number.isInteger(gold) ? 0 : Number.isInteger(gold * 10) ? 1 : 2);
}

export function cardContentsLabel(card: Pick<RunCoreCard, 'pieces'>): string {
  const counts = new Map<PurchasablePieceType, number>();
  for (const piece of card.pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return PURCHASE_ORDER
    .filter((piece) => counts.has(piece))
    .map((piece) => `${counts.get(piece)! > 1 ? `${counts.get(piece)} ` : ''}${PIECE_LABEL[piece]}${counts.get(piece)! > 1 ? 's' : ''}`)
    .join(' + ');
}

export function isRunArmyPieceType(value: PieceType): value is RunArmyPieceType {
  return value === 'pawn' || value === 'knight' || value === 'bishop' || value === 'rook' || value === 'queen' || value === 'king';
}
