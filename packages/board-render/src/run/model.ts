import type { Level, War } from '../core/level';
import type { PieceType } from '../core/types';
import {
  LIPSANON_BY_ID,
  RUN_LIPSANA,
  lipsanonNeedsUnitTarget,
  RUN_LIPSANON_OFFER_POOL,
  type LipsanonDefinition,
  type LipsanonId,
} from '../core/runLipsana';
import { spawnEventsForLevel } from '../core/levelEvents';
import { createRng } from '../core/rng';
import { runUnitName } from './unitNames';

export {
  LIPSANON_BY_ID,
  RUN_LIPSANA,
  lipsanonNeedsUnitTarget,
  RUN_LIPSANON_OFFER_POOL,
  type LipsanonDefinition,
  type LipsanonId,
};

/** The schema version of one persisted in-progress Run. Only this exact save shape is read. */
export const CURRENT_RUN_SAVE_VERSION = 19;
export type RunSaveVersion = typeof CURRENT_RUN_SAVE_VERSION;

export class UnsupportedRunSaveError extends Error {
  constructor(message = 'This Run was saved by an unsupported version. Start a new Run.') {
    super(message);
    this.name = 'UnsupportedRunSaveError';
  }
}

const RUN_SAVE_VERSION_FIELD_RENAME_SOURCE = 16;
const RUN_SAVE_VERSION_EXCHANGE_VOCABULARY_SOURCE = 17;
const RUN_SAVE_VERSION_KLEROSIS_SOURCE = 18;
export const GOLD_SCALE = 10;
export const RUN_STARTING_GOLD = 8;
export const RUN_STARTING_GOLD_TENTHS = RUN_STARTING_GOLD * GOLD_SCALE;
export const RUN_OPENING_OFFER_COUNT = 3;
export const INSTALLED_ATARAXIA_MAX_TIER = 1;
export const PESTIFEROUS_OFFER_DENOMINATOR = 8;
export const CONCINNOUS_OFFER_DENOMINATOR = 8;
export const LEGATINE_ADLECTED_OFFER_DENOMINATOR = 8;
export const HIERATIC_AGMINATE_OFFER_DENOMINATOR = 8;
export const EUTACTIC_COST = 2;
export const ADLECTED_COST = 3;
/** Agminate applies one piece-specific station rule during automatic deployment.
 * Its six roles and relational formation rules justify the same premium as Adlected. */
export const AGMINATE_COST = 3;

export type AtaraxiaTier = 0 | 1;
export type RunCardType = 'pestiferous' | 'concinnous' | 'legatine' | 'hieratic';
export type RunUnitModifier = 'cacochymic';
export const CACOCHYMIC_DISPLAY_NAME = 'Cacochymic';

/**
 * Each tier's presentation. `numeral` is the rung itself and `label` is that rung
 * qualified by the ladder's name, for a surface that names one tier away from the
 * ladder's own heading (ADR-0363). Roman numbering has no zero, so the baseline keeps
 * the plain `0` ADR-0291 authored rather than an antiquarian stand-in for one.
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
    numeral: '0',
    label: 'Ataraxia 0',
    title: 'The Untroubled Mind',
    effect: 'Standard rules.',
  }),
  1: Object.freeze({
    tier: 1,
    numeral: 'I',
    label: 'Ataraxia I',
    title: 'The Great Mortality',
    effect: `About one in eight Sectio cards is Pestiferous. Its marked ${CACOCHYMIC_DISPLAY_NAME} unit dies when combat ends; when it does, the card marks another remaining unit.`,
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

export type AdlectablePieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen';
export type RunArmyPieceType = AdlectablePieceType | 'king';
export type RunAbility = 'adlected' | 'eutactic' | 'agminate' | 'primogeniture';

export const AGMINATE_DISPLAY_NAME = 'Agminate';
export const EUTACTIC_DISPLAY_NAME = 'Eutactic';
export const ADLECTED_DISPLAY_NAME = 'Adlected';
export const PRIMOGENITURE_DISPLAY_NAME = 'Primogeniture';

/**
 * Every unit state's player-facing name (ADR-0374). Since the vocabulary cutover a stored
 * value and its name are the same word, so this resolves a complete table rather than
 * capitalizing the storage identity: a fallback would surface whatever a state was
 * spelled as the moment one was left out.
 */
const RUN_ABILITY_DISPLAY_NAME: Readonly<Record<RunAbility, string>> = Object.freeze({
  adlected: ADLECTED_DISPLAY_NAME,
  eutactic: EUTACTIC_DISPLAY_NAME,
  agminate: AGMINATE_DISPLAY_NAME,
  primogeniture: PRIMOGENITURE_DISPLAY_NAME,
});

export function runAbilityDisplayName(ability: RunAbility): string {
  return RUN_ABILITY_DISPLAY_NAME[ability];
}

/**
 * What a state means to the player, in one vocabulary (ADR-0339). The Army ledger's
 * ability tips and the card face's contents markers both read this, so a state cannot
 * come to mean two things depending on where it is shown. Eutactic and Agminate read
 * per piece because their deployment rule genuinely differs by piece.
 */
export function runAbilityDescription(ability: RunAbility, unit: RunArmyPieceType): string {
  if (ability === 'primogeniture') return 'Is placed before every other unit.';
  if (ability === 'adlected') {
    return runAbilityGeneralDescription('adlected');
  }
  if (ability === 'eutactic') {
    if (unit === 'pawn') return 'Prefers the front row during automatic deployment.';
    if (unit === 'knight' || unit === 'bishop') return 'Prefers the row immediately behind the front during automatic deployment.';
    return 'Prefers the back row during automatic deployment.';
  }
  if (unit === 'pawn') return 'Prefers a square alongside another Pawn or in an open file.';
  if (unit === 'queen') return 'Gravitates toward the middle of the board.';
  if (unit === 'knight') return 'Prefers squares one step in from the board edge.';
  if (unit === 'king') return 'Prefers a board-edge square in the player placement zone.';
  if (unit === 'rook') return 'Prefers a back-row corner, except the first Rook flanks an Agminate King when possible.';
  if (unit === 'bishop') return 'Prefers the nearest square of opposite color from another Bishop.';
  return runAbilityGeneralDescription('agminate');
}

/**
 * The same rule with no unit in hand — what the keyword means before it is attached to a
 * piece (ADR-0370). `runAbilityDescription` states the piece-specific case and falls back
 * to this one, so the glossary and the per-unit tip cannot drift apart.
 */
export function runAbilityGeneralDescription(ability: RunAbility): string {
  if (ability === 'primogeniture') return 'Is placed before every other unit.';
  if (ability === 'adlected') {
    return 'The player chooses its square when its deployment turn arrives.';
  }
  if (ability === 'eutactic') return "Prefers its piece type's formation row during automatic deployment.";
  return 'Prefers its piece-specific station during automatic deployment.';
}

export const CACOCHYMIC_DESCRIPTION = 'Dies when combat ends.';

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
    grants: 'cacochymic',
    effect: `Marks one contained unit ${CACOCHYMIC_DISPLAY_NAME}; whenever that unit dies, the card marks another remaining unit.`,
  }),
  concinnous: Object.freeze({
    name: 'Concinnous',
    grants: 'eutactic',
    effect: `Makes one contained unit ${EUTACTIC_DISPLAY_NAME} when the card is acquired.`,
  }),
  legatine: Object.freeze({
    name: 'Legatine',
    grants: 'adlected',
    effect: `Grants ${ADLECTED_DISPLAY_NAME} to one contained unit when the card is acquired.`,
  }),
  hieratic: Object.freeze({
    name: 'Hieratic',
    grants: 'agminate',
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
  source: 'king' | 'starting' | 'adlectio';
}

export type RunArmyNumberState = Record<RunArmyPieceType, number>;

export interface RunCoreCard {
  id: string;
  pieces: AdlectablePieceType[];
  value: number;
}

export type RunStarterCardId = 'his-grace' | 'front-lines';

/** Starter-only Chartulary cards. They are never offered by Adlectio, but otherwise
 * participate in Klerosis exactly like every card the player holds. */
export interface RunStarterCard {
  id: RunStarterCardId;
  pieces: RunArmyPieceType[];
  value: number;
  name: string;
  flavor: string;
  property: 'praecipuus' | null;
  removable: boolean;
}

export interface RunCardOffer extends RunCoreCard {
  offerId: string;
  cost: number;
  cardType: RunCardType | null;
  effectSeed: number;
  cacochymicPieceIndex: number | null;
  /** Stored zero-based unit occurrence selected before a Concinnous Adlectio. */
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
  cacochymicUnitId: string | null;
  acquiredAfterBattleIndex: number;
}

export interface RunPestiferousLoss {
  battleIndex: number;
  cardId: string;
  unit: RunArmyUnit;
}

export interface LipsanonAbilityGrant {
  ability: Extract<RunAbility, 'eutactic' | 'agminate'>;
  unitType: RunArmyPieceType;
}

export const RUN_LIPSANON_ABILITY_GRANTS: Readonly<Partial<Record<LipsanonId, LipsanonAbilityGrant>>> = Object.freeze({
  'training-linens': { ability: 'eutactic', unitType: 'pawn' },
  'royal-decree': { ability: 'eutactic', unitType: 'king' },
  'crenellated-rampart': { ability: 'eutactic', unitType: 'rook' },
  'popes-staff': { ability: 'eutactic', unitType: 'bishop' },
  'ghibelline-rampart': { ability: 'agminate', unitType: 'rook' },
  'popes-robes': { ability: 'agminate', unitType: 'bishop' },
  'royal-sceptre': { ability: 'agminate', unitType: 'king' },
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

/**
 * 'bona-vacantia' opens a Conflict: the player takes one lipsanon before the Sectio that leads
 * into the Conflict's first Battle. It replaced the loot lipsanon that used to be won at a
 * Conflict's END, inside the Sectio -- same three-per-run cadence, opposite end, so the
 * choice is made looking forward rather than handed out as a reward.
 *
 * 'aftermath' closes a Battle: what the Battle paid and cost gets its own screen before
 * the Run moves on. The reward used to be reported by a line inside the Sectio, which put
 * the result of the fight in the room where the money is spent.
 */
export type RunPhase = 'aftermath' | 'bona-vacantia' | 'deployment' | 'battle' | 'sectio' | 'victory';

export interface RunDeploymentState {
  battleIndex: number;
  seed: number;
  /** Cards revealed together by Klerosis for this combat. */
  dealtCardIds: string[];
  /** One hidden seeded order owns capacity admission and later Farrago placement. */
  queueUnitIds: string[];
  deployingUnitIds: string[];
  unavailableUnitIds: string[];
  capacityResolved: boolean;
  /** Exact committed formation, preserved across reload and Battle retry. */
  placements: Record<string, string>;
  placementCursor: number;
  revealedUnitId?: string;
  mode?: 'deploy-all' | 'step-through';
  stage: 'klerosis' | 'primogeniture' | 'farrago';
  /** Compatibility aliases used by the Battle runtime while reservists are retired. */
  blockedUnitIds: string[];
  manualPlacements: Record<string, string>;
  temporaryAdlectedUnitId?: string;
}

export interface RunBattleRuntime {
  battleIndex: number;
  /** Wall clock at the moment the Battle started, so the aftermath can report how long it
   * took. Stored on the document rather than held in the battlefield's own memory, which a
   * reload discards. Absent on a Battle already in progress when this arrived. */
  startedAtMs?: number;
  initiallyDeployedUnitIds: string[];
  reserveUnitIds: string[];
  reservistPoolUnitIds: string[];
  deployedReservistUnitIds: string[];
  observedDeadUnitIds: string[];
  cashedOutUnitIds: string[];
  reinforcementSequence: number;
}

/**
 * The Run-owned half of one Battle move checkpoint.
 *
 * The board store owns the matching chess position. This bounded slice is enough to
 * reverse every Run mutation a committed move can cause without turning the complete
 * Run document into a second browser-owned authority (ADR-0394).
 */
export interface RunBattleUndoCheckpoint {
  runId: string;
  battleIndex: number;
  goldTenths: number;
  army: RunArmyUnit[];
  cards: RunOwnedCard[];
  battleRuntime: RunBattleRuntime;
}

/** One unit that fell during the Battle. Persistent units are not lost for falling -- they
 * return for the next Battle -- so this is the Battle's casualty list, not the roster's. */
export interface RunAftermathFallenUnit {
  id: string;
  name: string;
  type: RunArmyPieceType;
}

/**
 * What one Battle paid and cost, reported on its own screen before the Run moves on.
 *
 * The numbers are captured at the moment the Battle ends because nothing else keeps them:
 * the Battle's runtime is torn down when the Sectio opens, and the battlefield's turn count
 * and clock live only in the board store, which unmounts with the board.
 */
export interface RunAftermathState {
  battleIndex: number;
  /** Completed player->enemy rounds, as the Battle's own objective clock counted them. */
  turns: number;
  /** Wall-clock time on the Battle, or null when its start was never recorded. */
  elapsedMs: number | null;
  /** Total gold the Battle awarded -- banked when the player leaves this screen. */
  goldTenths: number;
  /** The part of `goldTenths` a lipsanon paid on top of the Battle's own reward. */
  bonusGoldTenths: number;
  survivingUnitIds: string[];
  fallenUnits: RunAftermathFallenUnit[];
}

/** What the battlefield hands back when its Battle is won. */
export interface RunBattleReport {
  survivingUnitIds: readonly string[];
  turns: number;
}

export interface RunSectioState {
  kind: 'opening' | 'post-battle';
  afterBattleIndex: number;
  conflictIndex: number;
  victoryGoldTenths: number;
  cardOffers: RunCardOffer[];
  adlectedCardOfferIds: string[];
  paidLipsanonOffer: LipsanonId | null;
  paidLipsanonBought: boolean;
  alienatedUnits: Array<{
    unit: RunArmyUnit;
    proceedsTenths: number;
  }>;
  entrySnapshot: RunSectioEntrySnapshot;
}

/**
 * The lipsanon offer that opens a Conflict. `kind` says which Sectio this hands off to once a
 * lipsanon is taken: the run's pinned opening Sectio, or the post-Battle Sectio that follows the
 * Battle just fought. `victoryGoldTenths` is carried through because that Sectio reports it
 * and the Battle's gold is banked before this screen, not after it.
 */
export interface RunVacantiaState {
  kind: 'opening' | 'post-battle';
  conflictIndex: number;
  afterBattleIndex: number;
  victoryGoldTenths: number;
  offers: LipsanonId[];
}

export interface RunSectioEntrySnapshot {
  goldTenths: number;
  army: RunArmyUnit[];
  cards: RunOwnedCard[];
  lipsana: LipsanonId[];
  seenLipsana: LipsanonId[];
  conflictPaidLipsana: Record<string, { lipsanonId: LipsanonId; bought: boolean }>;
  nextArmyUnitSequence: number;
  nextArmyUnitNumberByType: RunArmyNumberState;
  nextCardSequence: number;
  paidLipsanonBought: boolean;
}

export interface RunDocument {
  runSaveVersion: RunSaveVersion;
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
  lipsana: LipsanonId[];
  seenLipsana: LipsanonId[];
  conflictPaidLipsana: Record<string, { lipsanonId: LipsanonId; bought: boolean }>;
  nextArmyUnitSequence: number;
  nextArmyUnitNumberByType: RunArmyNumberState;
  nextCardSequence: number;
  deployment: RunDeploymentState | null;
  battleRuntime: RunBattleRuntime | null;
  aftermath: RunAftermathState | null;
  sectio: RunSectioState | null;
  vacantia: RunVacantiaState | null;
}

/** Stable identity for the one playable battle inside a Run. Level ids are not
 * sufficient: different Runs (and later Battles in one War) may reuse a Level. */
export function runBattleActivityId(runId: string, battleIndex: number): string {
  return `run:${encodeURIComponent(runId)}:battle:${battleIndex}`;
}

const ADLECTIO_PIECE_ORDER: readonly AdlectablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const ARMY_PIECE_ORDER: readonly RunArmyPieceType[] = ['king', ...ADLECTIO_PIECE_ORDER];

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

function cardId(pieces: readonly AdlectablePieceType[]): string {
  return pieces.map((piece) => piece[0]).join('');
}

export function allRunCards(): RunCoreCard[] {
  const cards: RunCoreCard[] = [];
  const visit = (typeIndex: number, remaining: number, pieces: AdlectablePieceType[]): void => {
    if (remaining === 0) {
      const value = pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
      if (value >= 1 && value <= 9) cards.push({ id: cardId(pieces), pieces: [...pieces], value });
      return;
    }
    if (typeIndex >= ADLECTIO_PIECE_ORDER.length) return;
    const piece = ADLECTIO_PIECE_ORDER[typeIndex];
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

export const RUN_STARTER_CARDS: readonly RunStarterCard[] = Object.freeze([
  Object.freeze<RunStarterCard>({
    id: 'his-grace',
    pieces: ['king'],
    value: 0,
    name: 'His Grace',
    flavor: 'None before the King.',
    property: 'praecipuus',
    removable: false,
  }),
  Object.freeze<RunStarterCard>({
    id: 'front-lines',
    pieces: ['pawn', 'pawn'],
    value: 2,
    name: 'Front Lines',
    flavor: 'The first order was enough.',
    property: null,
    removable: true,
  }),
]);

export const RUN_STARTER_CARD_BY_ID: Readonly<Record<RunStarterCardId, RunStarterCard>> = Object.freeze(
  Object.fromEntries(RUN_STARTER_CARDS.map((card) => [card.id, card])) as Record<RunStarterCardId, RunStarterCard>,
);

export type RunCardDefinition = RunCoreCard | RunStarterCard;

export function runCardDefinition(coreId: string): RunCardDefinition | undefined {
  return RUN_CARD_BY_ID[coreId] ?? RUN_STARTER_CARD_BY_ID[coreId as RunStarterCardId];
}

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

export const CACOCHYMIC_DISCOUNT: Readonly<Record<AdlectablePieceType, number>> = Object.freeze({
  pawn: 0,
  knight: 1,
  bishop: 1,
  rook: 2,
  queen: 3,
});

/**
 * What a card's qualifier does to its price: Pestiferous discounts by the marked piece,
 * every other property charges its state's surcharge. Offer creation, stored-offer
 * normalization and review specimens all price through here, so a card cannot cost one
 * thing in the Sectio and another wherever else it is shown.
 */
export function runCardOfferCost(
  value: number,
  cardType: RunCardType | null,
  plaguedPiece: AdlectablePieceType | null,
): number {
  if (plaguedPiece) return value - CACOCHYMIC_DISCOUNT[plaguedPiece];
  if (cardType === 'legatine') return value + ADLECTED_COST;
  if (cardType === 'concinnous') return value + EUTACTIC_COST;
  if (cardType === 'hieratic') return value + AGMINATE_COST;
  return value;
}

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

export function legatineAdlectedOfferRoll(
  seed: number,
  battleIndex: number,
  slotIndex: number,
  coreId: string,
  denominator = LEGATINE_ADLECTED_OFFER_DENOMINATOR,
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

export function legatineAdlectedAcquisitionTarget(
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
  tacticalDenominator = LEGATINE_ADLECTED_OFFER_DENOMINATOR,
  hieraticDenominator = HIERATIC_AGMINATE_OFFER_DENOMINATOR,
): RunCardOffer {
  const tactical = legatineAdlectedOfferRoll(
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
  const cacochymicPieceIndex = pestiferous
    ? seededPestiferousTarget(effectSeed, card.pieces.map((_, index) => index), 0)
    : null;
  const plaguedPiece = cacochymicPieceIndex === null ? null : card.pieces[cacochymicPieceIndex];
  const cost = runCardOfferCost(
    card.value,
    pestiferous ? 'pestiferous' : tactical ? 'legatine' : concinnous ? 'concinnous' : hieratic ? 'hieratic' : null,
    plaguedPiece,
  );
  return {
    ...card,
    pieces: [...card.pieces],
    offerId: `sectio-${battleIndex}-${slotIndex}-${card.id}`,
    cost,
    cardType: pestiferous
      ? 'pestiferous'
      : tactical
        ? 'legatine'
        : concinnous
          ? 'concinnous'
          : hieratic
            ? 'hieratic'
            : null,
    effectSeed,
    cacochymicPieceIndex,
    effectTargetIndex: concinnous
      ? createRng(mixSeed(effectSeed, 'concinnous-target')).int(card.pieces.length)
      : null,
  };
}

const OPENING_SECTIO_VALUES: readonly number[] = Object.freeze(
  Array.from({ length: RUN_STARTING_GOLD }, (_, index) => index + 1),
);

/** Opening draws roll in their own index space so a core identity offered in the
 * opening and again in the Sectio after Battle 1 — which is also `battleIndex` 0 —
 * rolls its qualifier independently. */
export const OPENING_SECTIO_ROLL_BATTLE_INDEX = -1;

/** Deal three distinct uniformly sampled values, then one seeded core card at
 * each value. Sampling values first prevents dense high-value ranks in the
 * 49-card deck from crowding low-value openings out of the Run.
 *
 * Opening draws roll qualifiers exactly like every later Sectio draw, at every core
 * value: a Tactical surcharge may price an opening card past the starting gold and
 * out of reach. The one repair is the degenerate deal — ADR-0323 requires a
 * Adlectio before Continue, so if no offer is affordable the cheapest one drops its
 * qualifier and is offered standard, which no other opening card ever does. */
export function openingSectioOffers(seed: number, ataraxiaTier: AtaraxiaTier = 0): RunCardOffer[] {
  const values = shuffled(OPENING_SECTIO_VALUES, mixSeed(seed, 'opening-shop-values'))
    .slice(0, RUN_OPENING_OFFER_COUNT);
  const offers = values.map((value, slotIndex) => {
    const candidates = RUN_CARD_DECK.filter((card) => card.value === value);
    const card = shuffled(
      candidates,
      mixSeed(seed, `opening-shop-card:${value}`, slotIndex),
    )[0];
    if (!card) throw new Error(`Opening Sectio has no core card worth ${value} gold.`);
    const rolled = createRunCardOffer(
      { seed, ataraxiaTier },
      card,
      OPENING_SECTIO_ROLL_BATTLE_INDEX,
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
    ? { ...offer, cost: offer.value, cardType: null, cacochymicPieceIndex: null, effectTargetIndex: null }
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
      abilities: ['primogeniture'],
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

function initialCards(): RunOwnedCard[] {
  return [
    {
      id: 'run-card-his-grace',
      coreId: 'his-grace',
      cardType: null,
      effectSeed: 0,
      effectTargetUnitId: null,
      unitIds: ['run-king'],
      lostUnitIds: [],
      cacochymicUnitId: null,
      acquiredAfterBattleIndex: 0,
    },
    {
      id: 'run-card-front-lines',
      coreId: 'front-lines',
      cardType: null,
      effectSeed: 0,
      effectTargetUnitId: null,
      unitIds: ['run-pawn-a', 'run-pawn-b'],
      lostUnitIds: [],
      cacochymicUnitId: null,
      acquiredAfterBattleIndex: 0,
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
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    id: freshRunId(),
    seed: seed >>> 0,
    ataraxiaTier,
    updatedAt: createdAt,
    war,
    phase: 'sectio',
    battleIndex: 0,
    conflictIndex: 0,
    goldTenths: RUN_STARTING_GOLD_TENTHS,
    army: initialArmy(seed),
    cards: initialCards(),
    pestiferousLosses: [],
    lipsana: [],
    seenLipsana: [],
    conflictPaidLipsana: {},
    nextArmyUnitSequence: 1,
    nextArmyUnitNumberByType: {
      ...initialArmyNumberState(),
      pawn: 3,
      king: 2,
    },
    nextCardSequence: 1,
    deployment: null,
    battleRuntime: null,
    aftermath: null,
    sectio: null,
    vacantia: null,
  };
  // A Conflict that ends in loot opens with Bona Vacantia; a war with no loot battles at
  // all still starts straight in the Sectio, exactly as it used to.
  if (conflictOpensWithVacantia(war, 0)) {
    const reveal = revealLipsana(run, 3, 'vacantia-lipsana', 0);
    return {
      ...run,
      phase: 'bona-vacantia',
      seenLipsana: reveal.seenLipsana,
      vacantia: {
        kind: 'opening',
        conflictIndex: 0,
        afterBattleIndex: 0,
        victoryGoldTenths: 0,
        offers: reveal.offers,
      },
    };
  }
  return openOpeningSectio(run, seed, ataraxiaTier);
}

/**
 * The Run's pinned opening Sectio. Held apart from createRun because Bona Vacantia now sits
 * in front of it: the lipsanon is taken first, and only then is this Sectio built -- so its
 * entry snapshot records the army and lipsana the player actually walks in with.
 */
function openOpeningSectio(run: RunDocument, seed: number, ataraxiaTier: AtaraxiaTier): RunDocument {
  return {
    ...run,
    phase: 'sectio',
    vacantia: null,
    sectio: {
      kind: 'opening',
      afterBattleIndex: 0,
      conflictIndex: 0,
      victoryGoldTenths: 0,
      cardOffers: openingSectioOffers(seed, ataraxiaTier),
      adlectedCardOfferIds: [],
      paidLipsanonOffer: null,
      paidLipsanonBought: false,
      alienatedUnits: [],
      entrySnapshot: createSectioEntrySnapshot(run, false),
    },
  };
}

/**
 * Whether the Conflict beginning at `firstBattleIndex` opens with a lipsanon. A Conflict runs
 * up to and including its loot Battle, so a stretch with no loot Battle left in it is the
 * run's final approach and gets nothing -- which is what keeps the last Battle lipsanon-free
 * without hardcoding a Battle number.
 */
function conflictOpensWithVacantia(war: RunWarSnapshot, firstBattleIndex: number): boolean {
  return war.battles.slice(firstBattleIndex).some((battle) => battle.loot === true);
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

function repairRunCards(value: unknown, seed: number): RunOwnedCard[] {
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
        : card.cardType === 'legatine'
          ? 'legatine'
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
      effectTargetUnitId: (cardType === 'concinnous' || cardType === 'legatine' || cardType === 'hieratic')
        && storedEffectTargetUnitId !== null
        && unitIds.includes(storedEffectTargetUnitId)
        ? storedEffectTargetUnitId
        : null,
      unitIds,
      lostUnitIds,
      cacochymicUnitId: cardType === 'pestiferous'
        ? typeof card.cacochymicUnitId === 'string' && unitIds.includes(card.cacochymicUnitId)
          ? card.cacochymicUnitId
          : seededPestiferousTarget(effectSeed, unitIds, lostUnitIds.length)
        : null,
      acquiredAfterBattleIndex: Number.isSafeInteger(card.acquiredAfterBattleIndex)
        ? Math.max(0, Number(card.acquiredAfterBattleIndex))
        : 0,
    }];
  });
}

function repairRunCardOffers(value: unknown): RunCardOffer[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    const offer = candidate as RunCardOffer & {
      effect?: { ability?: unknown; targetPieceIndex?: unknown } | null;
    };
    const cardType = offer.cardType === 'pestiferous'
      ? 'pestiferous'
      : offer.cardType === 'concinnous'
        ? 'concinnous'
        : offer.cardType === 'legatine'
          ? 'legatine'
          : offer.cardType === 'hieratic'
            ? 'hieratic'
        : null;
    const cacochymicPieceIndex = cardType === 'pestiferous'
      ? Number.isSafeInteger(offer.cacochymicPieceIndex)
        && offer.cacochymicPieceIndex !== null
        && offer.cacochymicPieceIndex >= 0
        && offer.cacochymicPieceIndex < offer.pieces.length
        ? offer.cacochymicPieceIndex
        : seededPestiferousTarget(offer.effectSeed, offer.pieces.map((_, index) => index), 0)
      : null;
    const plaguedPiece = cacochymicPieceIndex === null ? null : offer.pieces[cacochymicPieceIndex];
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
      cost: runCardOfferCost(offer.value, cardType, plaguedPiece),
      cacochymicPieceIndex,
      effectTargetIndex,
    };
  });
}

function cardsNeedRepair(cards: readonly RunOwnedCard[]): boolean {
  return cards.some((card) => (
    card.cardType === 'pestiferous'
      ? card.unitIds.length > 0
        ? typeof card.cacochymicUnitId !== 'string' || !card.unitIds.includes(card.cacochymicUnitId)
        : card.cacochymicUnitId !== null
      : card.cacochymicUnitId !== null
  )) || cards.some((card) => (
    (card.cardType === 'concinnous' || card.cardType === 'legatine' || card.cardType === 'hieratic')
      ? typeof card.effectTargetUnitId !== 'string' || card.effectTargetUnitId.length === 0
      : card.effectTargetUnitId !== null
  ));
}

function offersNeedRepair(offers: readonly RunCardOffer[]): boolean {
  return offers.some((offer) => (
    offer.cardType === 'pestiferous'
      ? !Number.isSafeInteger(offer.cacochymicPieceIndex)
        || offer.cacochymicPieceIndex === null
        || offer.cacochymicPieceIndex < 0
        || offer.cacochymicPieceIndex >= offer.pieces.length
      : offer.cacochymicPieceIndex !== null
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
  const cacochymicUnitIds = new Set(cards.flatMap((card) => (
    card.cardType === 'pestiferous' && card.cacochymicUnitId ? [card.cacochymicUnitId] : []
  )));
  let changed = false;
  const synchronized = army.map((unit) => {
    const shouldBePlagued = cacochymicUnitIds.has(unit.id);
    const isPlagued = unit.modifiers.includes('cacochymic');
    if (shouldBePlagued === isPlagued) return unit;
    changed = true;
    return {
      ...unit,
      modifiers: shouldBePlagued
        ? [...unit.modifiers, 'cacochymic' as const]
        : unit.modifiers.filter((modifier) => modifier !== 'cacochymic'),
    };
  });
  return changed ? synchronized : army;
}

function cloneConflictPaidLipsana(
  conflictPaidLipsana: RunDocument['conflictPaidLipsana'],
): RunDocument['conflictPaidLipsana'] {
  return Object.fromEntries(
    Object.entries(conflictPaidLipsana).map(([key, value]) => [key, { ...value }]),
  );
}

function createSectioEntrySnapshot(run: RunDocument, paidLipsanonBought: boolean): RunSectioEntrySnapshot {
  return {
    goldTenths: run.goldTenths,
    army: cloneArmy(run.army),
    cards: cloneCards(run.cards),
    lipsana: [...run.lipsana],
    seenLipsana: [...run.seenLipsana],
    conflictPaidLipsana: cloneConflictPaidLipsana(run.conflictPaidLipsana),
    nextArmyUnitSequence: run.nextArmyUnitSequence,
    nextArmyUnitNumberByType: { ...run.nextArmyUnitNumberByType },
    nextCardSequence: run.nextCardSequence,
    paidLipsanonBought,
  };
}

function normalizedArmyIdentity(run: RunDocument): {
  army: RunArmyUnit[];
  sectio: RunSectioState | null;
  nextArmyUnitNumberByType: RunArmyNumberState;
  changed: boolean;
} {
  const entryArmy = run.sectio?.entrySnapshot?.army ?? [];
  const alienatedArmy = run.sectio?.alienatedUnits?.map((entry) => entry.unit) ?? [];
  const units = [...entryArmy, ...run.army, ...alienatedArmy];
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
      validName
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
      ? unit.modifiers.filter((modifier): modifier is RunUnitModifier => modifier === 'cacochymic')
      : [];
    const source = unit.source;
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
  let sectio = run.sectio;
  if (sectio) {
    const alienatedUnits = (sectio.alienatedUnits ?? []).map((entry) => {
      const [unit] = rewriteArmy([entry.unit]);
      return unit === entry.unit ? entry : { ...entry, unit };
    });
    const entrySnapshot = sectio.entrySnapshot
      ? { ...sectio.entrySnapshot, army: rewriteArmy(sectio.entrySnapshot.army) }
      : sectio.entrySnapshot;
    if (alienatedUnits !== sectio.alienatedUnits || entrySnapshot !== sectio.entrySnapshot) {
      sectio = { ...sectio, alienatedUnits, entrySnapshot };
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

  return { army, sectio, nextArmyUnitNumberByType, changed };
}

export function normalizeRunDocument(run: RunDocument): RunDocument {
  const raw = run as Omit<RunDocument, 'phase'> & {
    phase: RunPhase | 'draft';
    formatVersion?: unknown;
    shop?: unknown;
    draftOffers?: unknown;
    chosenDraftId?: unknown;
  };
  if (raw.runSaveVersion !== CURRENT_RUN_SAVE_VERSION || 'formatVersion' in raw) {
    throw new UnsupportedRunSaveError();
  }
  if (raw.phase === 'draft' || 'draftOffers' in raw || 'chosenDraftId' in raw) {
    throw new UnsupportedRunSaveError('This Run contains retired draft data. Start a new Run.');
  }
  if ('shop' in raw) {
    throw new UnsupportedRunSaveError('This Run contains retired Shop data. Start a new Run.');
  }
  const rawSectio = raw.sectio && typeof raw.sectio === 'object' && !Array.isArray(raw.sectio)
    ? raw.sectio as unknown as Record<string, unknown>
    : null;
  if (rawSectio && ('purchasedCardOfferIds' in rawSectio || 'soldUnits' in rawSectio)) {
    throw new UnsupportedRunSaveError('This Run contains retired Sectio operation data. Start a new Run.');
  }
  const persistedUnits: unknown[] = [
    ...(Array.isArray(run.army) ? run.army : []),
    ...(Array.isArray(run.pestiferousLosses)
      ? run.pestiferousLosses.map((loss) => loss?.unit)
      : []),
    ...(Array.isArray(run.sectio?.alienatedUnits)
      ? run.sectio.alienatedUnits.map((alienated) => alienated?.unit)
      : []),
    ...(Array.isArray(run.sectio?.entrySnapshot?.army) ? run.sectio.entrySnapshot.army : []),
  ];
  if (persistedUnits.some((value) => (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && ((value as Record<string, unknown>).source === 'shop'
      || (value as Record<string, unknown>).source === 'draft'
      || (value as Record<string, unknown>).source === 'sectio')
  ))) {
    throw new UnsupportedRunSaveError('This Run contains retired unit-source data. Start a new Run.');
  }
  if (
    run.sectio?.cardOffers?.some((offer) => offer.offerId.startsWith('shop-'))
    || run.sectio?.adlectedCardOfferIds?.some((offerId) => offerId.startsWith('shop-'))
  ) {
    throw new UnsupportedRunSaveError('This Run contains retired Shop offer ids. Start a new Run.');
  }
  // The aftermath phase IS its report; a document standing in it without one has nothing to
  // show and no survivors to open the Sectio with.
  if (raw.phase === 'aftermath' && !run.aftermath) {
    throw new Error('A Run aftermath document with no battle report is unsupported.');
  }
  let next = run;
  if (next.vacantia === undefined) next = { ...next, vacantia: null };
  // The aftermath report belongs to the Battle it closed, so it is not carried into any
  // later phase. Repair an incomplete current save rather than leaking the report forward.
  if (next.aftermath === undefined || (next.phase !== 'aftermath' && next.aftermath !== null)) {
    next = { ...next, aftermath: next.phase === 'aftermath' ? next.aftermath ?? null : null };
  }
  if (
    next.phase !== 'sectio'
    || !next.sectio
    || (Number.isSafeInteger(next.sectio.victoryGoldTenths) && next.sectio.victoryGoldTenths >= 0)
  ) {
    // Current documents already carry the exact reward.
  } else {
    const battle = next.war.battles[next.sectio.afterBattleIndex];
    if (battle) {
      const reward = battleVictoryGoldTenths(battle.level);
      next = {
        ...next,
        goldTenths: Math.max(0, next.goldTenths + reward - GOLD_SCALE),
        sectio: { ...next.sectio, victoryGoldTenths: reward },
      };
    }
  }

  const stored = next as RunDocument & {
    ataraxiaTier?: unknown;
    cards?: unknown;
    pestiferousLosses?: unknown;
    nextCardSequence?: unknown;
  };
  const ataraxiaTier: AtaraxiaTier = stored.ataraxiaTier === 1 ? 1 : 0;
  const storedCards = Array.isArray(stored.cards) ? stored.cards as RunOwnedCard[] : [];
  const cards = !cardsNeedRepair(storedCards)
    ? storedCards
    : repairRunCards(stored.cards, next.seed);
  const pestiferousLosses = Array.isArray(stored.pestiferousLosses)
    ? stored.pestiferousLosses as RunPestiferousLoss[]
    : [];
  const nextCardSequence = Number.isSafeInteger(stored.nextCardSequence) && Number(stored.nextCardSequence) > 0
    ? Number(stored.nextCardSequence)
    : cards.length + 1;
  let sectio = stored.sectio;
  if (sectio && sectio.kind !== 'opening' && sectio.kind !== 'post-battle') {
    sectio = { ...sectio, kind: 'post-battle' };
  }
  if (sectio && (
    offersNeedRepair(sectio.cardOffers)
    || (sectio.entrySnapshot && cardsNeedRepair(sectio.entrySnapshot.cards))
  )) {
    sectio = {
      ...sectio,
      cardOffers: repairRunCardOffers(sectio.cardOffers),
      ...(sectio.entrySnapshot
        ? {
            entrySnapshot: {
              ...sectio.entrySnapshot,
              cards: repairRunCards(sectio.entrySnapshot.cards, next.seed),
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
    || next.sectio !== sectio
  ) {
    next = { ...next, ataraxiaTier, cards, pestiferousLosses, nextCardSequence, sectio };
  }

  const identity = normalizedArmyIdentity(next);
  const army = synchronizePlaguedModifiers(identity.army, next.cards);
  let identitySectio = identity.sectio;
  if (identitySectio?.entrySnapshot) {
    const entryArmy = synchronizePlaguedModifiers(
      identitySectio.entrySnapshot.army,
      identitySectio.entrySnapshot.cards,
    );
    if (entryArmy !== identitySectio.entrySnapshot.army) {
      identitySectio = {
        ...identitySectio,
        entrySnapshot: { ...identitySectio.entrySnapshot, army: entryArmy },
      };
    }
  }
  if (identity.changed || army !== identity.army || identitySectio !== identity.sectio) {
    next = {
      ...next,
      army,
      sectio: identitySectio,
      nextArmyUnitNumberByType: identity.nextArmyUnitNumberByType,
    };
  }
  if (
    next.phase === 'sectio'
    && next.sectio
    && (
      !next.sectio.entrySnapshot
      || !Array.isArray(next.sectio.alienatedUnits)
      || !Array.isArray(next.sectio.entrySnapshot.cards)
      || !Number.isSafeInteger(next.sectio.entrySnapshot.nextCardSequence)
    )
  ) {
    const paidLipsanonBought = next.sectio.paidLipsanonBought === true;
    next = {
      ...next,
      sectio: {
        ...next.sectio,
        alienatedUnits: Array.isArray(next.sectio.alienatedUnits) ? next.sectio.alienatedUnits : [],
        entrySnapshot: next.sectio.entrySnapshot
          ? {
              ...next.sectio.entrySnapshot,
              cards: Array.isArray(next.sectio.entrySnapshot.cards)
                ? cloneCards(next.sectio.entrySnapshot.cards)
                : cloneCards(next.cards),
              nextCardSequence: Number.isSafeInteger(next.sectio.entrySnapshot.nextCardSequence)
                ? next.sectio.entrySnapshot.nextCardSequence
                : next.nextCardSequence,
            }
          : createSectioEntrySnapshot(next, paidLipsanonBought),
      },
    };
  }
  return next;
}

function migrateRunArmyUnitAdlectioVocabulary(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const unit = value as Record<string, unknown>;
  return unit.source === 'shop' || unit.source === 'draft'
    ? { ...unit, source: 'adlectio' }
    : unit;
}

function migrateRunArmyAdlectioVocabulary(value: unknown): unknown {
  return Array.isArray(value) ? value.map(migrateRunArmyUnitAdlectioVocabulary) : value;
}

function migrateRunOfferIdSectioVocabulary(value: unknown): unknown {
  return typeof value === 'string' && value.startsWith('shop-')
    ? `sectio-${value.slice('shop-'.length)}`
    : value;
}

function migrateRunSectioOperationsVocabulary(value: unknown): unknown {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const sectio = value as Record<string, unknown>;
  const cardOffers = Array.isArray(sectio.cardOffers)
    ? sectio.cardOffers.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const offer = value as Record<string, unknown>;
        return { ...offer, offerId: migrateRunOfferIdSectioVocabulary(offer.offerId) };
      })
    : sectio.cardOffers;
  const adlectedCardOfferIds = Array.isArray(sectio.purchasedCardOfferIds)
    ? sectio.purchasedCardOfferIds.map(migrateRunOfferIdSectioVocabulary)
    : sectio.purchasedCardOfferIds;
  const alienatedUnits = Array.isArray(sectio.soldUnits)
    ? sectio.soldUnits.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const alienated = value as Record<string, unknown>;
        return { ...alienated, unit: migrateRunArmyUnitAdlectioVocabulary(alienated.unit) };
      })
    : sectio.soldUnits;
  const entrySnapshot = sectio.entrySnapshot
    && typeof sectio.entrySnapshot === 'object'
    && !Array.isArray(sectio.entrySnapshot)
    ? {
        ...(sectio.entrySnapshot as Record<string, unknown>),
        army: migrateRunArmyAdlectioVocabulary(
          (sectio.entrySnapshot as Record<string, unknown>).army,
        ),
      }
    : sectio.entrySnapshot;
  const {
    purchasedCardOfferIds: _retiredPurchasedCardOfferIds,
    soldUnits: _retiredSoldUnits,
    ...currentSectio
  } = sectio;
  return { ...currentSectio, cardOffers, adlectedCardOfferIds, alienatedUnits, entrySnapshot };
}

function migrateRunArmyToPrimogeniture(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
    const unit = candidate as Record<string, unknown>;
    if (unit.type !== 'king') return unit;
    const abilities = Array.isArray(unit.abilities)
      ? unit.abilities.filter((ability): ability is string => typeof ability === 'string')
      : [];
    return abilities.includes('primogeniture')
      ? unit
      : { ...unit, abilities: [...abilities, 'primogeniture'] };
  });
}

function migrateCardsToStarterChartulary(
  value: unknown,
  armyValue: unknown,
): RunOwnedCard[] {
  const cards = Array.isArray(value) ? value.filter((card): card is RunOwnedCard => (
    Boolean(card && typeof card === 'object' && !Array.isArray(card))
  )) : [];
  const army = Array.isArray(armyValue)
    ? armyValue.filter((unit): unit is Record<string, unknown> => Boolean(unit && typeof unit === 'object' && !Array.isArray(unit)))
    : [];
  const next = [...cards];
  if (!next.some((card) => card.coreId === 'his-grace')) {
    const kingId = army.find((unit) => unit.type === 'king' && typeof unit.id === 'string')?.id;
    if (typeof kingId === 'string') {
      next.unshift({
        ...initialCards()[0],
        effectSeed: 0,
        unitIds: [kingId],
      });
    }
  }
  if (!next.some((card) => card.coreId === 'front-lines')) {
    const pawnIds = army
      .filter((unit) => unit.source === 'starting' && unit.type === 'pawn' && typeof unit.id === 'string')
      .map((unit) => unit.id as string);
    next.splice(Math.min(1, next.length), 0, {
      ...initialCards()[1],
      effectSeed: 0,
      unitIds: pawnIds,
    });
  }
  return next;
}

function migrateRunToKlerosis(stored: Record<string, unknown>): Record<string, unknown> {
  const army = migrateRunArmyToPrimogeniture(stored.army);
  const cards = migrateCardsToStarterChartulary(stored.cards, army);
  // Version 18 never persisted automatic destinations, so an in-flight Battle cannot be
  // represented truthfully in the exact version-19 formation. Return it to Klerosis before
  // any new information is exposed; prepareDeployment will persist the new deal immediately.
  const reenterDeployment = stored.phase === 'deployment' || stored.phase === 'battle';
  const sectio = stored.sectio && typeof stored.sectio === 'object' && !Array.isArray(stored.sectio)
    ? stored.sectio as Record<string, unknown>
    : null;
  const entrySnapshot = sectio?.entrySnapshot && typeof sectio.entrySnapshot === 'object' && !Array.isArray(sectio.entrySnapshot)
    ? sectio.entrySnapshot as Record<string, unknown>
    : null;
  const migratedSectio = sectio && entrySnapshot
    ? {
        ...sectio,
        entrySnapshot: {
          ...entrySnapshot,
          army: migrateRunArmyToPrimogeniture(entrySnapshot.army),
          cards: migrateCardsToStarterChartulary(entrySnapshot.cards, entrySnapshot.army),
        },
      }
    : sectio;
  return {
    ...stored,
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    phase: reenterDeployment ? 'deployment' : stored.phase,
    army,
    cards,
    deployment: null,
    ...(reenterDeployment ? { battleRuntime: null, aftermath: null } : {}),
    ...(sectio ? { sectio: migratedSectio } : {}),
  };
}

/**
 * Advances every losslessly migratable predecessor through the declared save chain.
 * Version 16 first receives the version-marker rename from 17, version 17's Shop
 * vocabulary is rewritten into version 18's Sectio, Adlectio, and Alienatio vocabulary,
 * then version 18 receives starter cards and persisted Klerosis state. Older saves remain
 * unsupported rather than being interpreted through a compatibility reader.
 */
export function migrateRunSaveDocument(value: unknown): RunDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnsupportedRunSaveError();
  }
  let stored = value as Record<string, unknown>;
  if (
    stored.formatVersion === RUN_SAVE_VERSION_FIELD_RENAME_SOURCE
    && !Object.hasOwn(stored, 'runSaveVersion')
  ) {
    const { formatVersion: _retiredFormatVersion, ...run } = stored;
    stored = {
      ...run,
      runSaveVersion: RUN_SAVE_VERSION_EXCHANGE_VOCABULARY_SOURCE,
    };
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_EXCHANGE_VOCABULARY_SOURCE) {
    if (!Object.hasOwn(stored, 'shop')) throw new UnsupportedRunSaveError();
    const { shop, ...run } = stored;
    const pestiferousLosses = Array.isArray(stored.pestiferousLosses)
      ? stored.pestiferousLosses.map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
          const loss = value as Record<string, unknown>;
          return { ...loss, unit: migrateRunArmyUnitAdlectioVocabulary(loss.unit) };
        })
      : stored.pestiferousLosses;
    stored = {
      ...run,
      runSaveVersion: RUN_SAVE_VERSION_KLEROSIS_SOURCE,
      phase: stored.phase === 'shop' ? 'sectio' : stored.phase,
      army: migrateRunArmyAdlectioVocabulary(stored.army),
      pestiferousLosses,
      sectio: migrateRunSectioOperationsVocabulary(shop),
    };
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_KLEROSIS_SOURCE) {
    stored = migrateRunToKlerosis(stored);
  }
  return normalizeRunDocument(stored as unknown as RunDocument);
}

export function addArmyPieces(
  run: RunDocument,
  pieces: readonly AdlectablePieceType[],
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

export function hasLipsanon(run: RunDocument, lipsanon: LipsanonId): boolean {
  return run.lipsana.includes(lipsanon);
}

export function lipsanonGrantingRunAbility(
  run: RunDocument,
  unit: RunArmyUnit,
  ability: RunAbility,
): LipsanonId | null {
  // Unit-type lipsana never pile a second deployment rule onto an ordinary unit that
  // already owns one. The King is the sole exception: Primogeniture is inherent, so one
  // held unit-type grant may sit beside it. If several matching lipsana are held, their
  // stable acquisition order decides which one is effective.
  const inherentDeploymentAbilities = unit.abilities.filter((candidate) => candidate !== 'primogeniture');
  if (unit.type === 'king' ? inherentDeploymentAbilities.length > 0 : unit.abilities.length > 0) return null;
  for (const lipsanonId of run.lipsana) {
    const grant = RUN_LIPSANON_ABILITY_GRANTS[lipsanonId];
    if (grant?.unitType !== unit.type) continue;
    return grant.ability === ability ? lipsanonId : null;
  }
  return null;
}

export function hasRunAbility(run: RunDocument, unit: RunArmyUnit, ability: RunAbility): boolean {
  return unit.abilities.includes(ability) || lipsanonGrantingRunAbility(run, unit, ability) !== null;
}

/** Whether a target-required lipsanon can add its permanent state without violating
 * ordinary-unit cardinality. The King may receive one state beside Primogeniture. */
export function canTargetLipsanon(run: RunDocument, lipsanon: LipsanonId, unitId: string): boolean {
  if (!lipsanonNeedsUnitTarget(lipsanon)) return false;
  const unit = run.army.find((candidate) => candidate.id === unitId);
  if (!unit) return false;
  if (lipsanon === 'conscription-notice') {
    return unit.abilities.filter((ability) => ability !== 'primogeniture').length === 0;
  }
  return true;
}

function availableLipsana(run: RunDocument): LipsanonId[] {
  const held = new Set(run.lipsana);
  const seen = new Set(run.seenLipsana);
  return RUN_LIPSANON_OFFER_POOL
    .filter((lipsanon) => (
      !held.has(lipsanon.id)
      && !seen.has(lipsanon.id)
      && (!lipsanon.requires || held.has(lipsanon.requires))
      && (!lipsanon.unitTarget || run.army.some((unit) => canTargetLipsanon(run, lipsanon.id, unit.id)))
    ))
    .map((lipsanon) => lipsanon.id);
}

function revealLipsana(run: RunDocument, count: number, label: string, index: number): {
  offers: LipsanonId[];
  seenLipsana: LipsanonId[];
} {
  const offers = shuffled(availableLipsana(run), mixSeed(run.seed, label, index)).slice(0, count);
  return { offers, seenLipsana: [...run.seenLipsana, ...offers] };
}

export function prepareDeployment(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment') return run;
  if (run.deployment?.battleIndex === run.battleIndex) {
    return touch({ ...run, battleRuntime: null });
  }
  const seed = mixSeed(run.seed, 'deployment', run.battleIndex);
  const hisGrace = run.cards.find((card) => card.coreId === 'his-grace');
  const ordinary = shuffled(
    run.cards.filter((card) => card.id !== hisGrace?.id),
    mixSeed(seed, 'klerosis-cards'),
  );
  const dealCount = Math.max(1, 3 + run.conflictIndex);
  const dealtCards = [...(hisGrace ? [hisGrace] : []), ...ordinary].slice(0, dealCount);
  const dealtUnitIds = [...new Set(dealtCards.flatMap((card) => card.unitIds))]
    .filter((unitId) => run.army.some((unit) => unit.id === unitId));
  const kingIds = dealtUnitIds.filter((unitId) => run.army.find((unit) => unit.id === unitId)?.type === 'king');
  const queueUnitIds = [
    ...kingIds,
    ...shuffled(
      dealtUnitIds.filter((unitId) => !kingIds.includes(unitId)),
      mixSeed(seed, 'deployment-unit-order'),
    ),
  ];
  const unavailableUnitIds = run.army
    .map((unit) => unit.id)
    .filter((unitId) => !queueUnitIds.includes(unitId));
  return touch({
    ...run,
    deployment: {
      battleIndex: run.battleIndex,
      seed,
      dealtCardIds: dealtCards.map((card) => card.id),
      queueUnitIds,
      deployingUnitIds: [...queueUnitIds],
      unavailableUnitIds,
      capacityResolved: false,
      placements: {},
      placementCursor: 0,
      stage: 'klerosis',
      blockedUnitIds: [...unavailableUnitIds],
      manualPlacements: {},
    },
    battleRuntime: null,
  });
}

export function setDeploymentChoices(
  run: RunDocument,
  choices: Partial<Pick<RunDeploymentState,
    | 'manualPlacements'
    | 'placements'
    | 'placementCursor'
    | 'revealedUnitId'
    | 'mode'
    | 'stage'
    | 'deployingUnitIds'
    | 'unavailableUnitIds'
    | 'capacityResolved'
    | 'queueUnitIds'
    | 'blockedUnitIds'
    | 'temporaryAdlectedUnitId'
  >>,
): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  return touch({
    ...run,
    deployment: {
      ...run.deployment,
      ...choices,
    },
  });
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
      startedAtMs: Date.now(),
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
      // A retry is a fresh Battle, so its clock starts again rather than counting the
      // attempt that was thrown away.
      startedAtMs: Date.now(),
      initiallyDeployedUnitIds: [...run.deployment.deployingUnitIds],
      reserveUnitIds: [],
      reservistPoolUnitIds: [],
      deployedReservistUnitIds: [],
      observedDeadUnitIds: [],
      cashedOutUnitIds: [],
      reinforcementSequence: 0,
    },
  });
}

export const RUN_BATTLE_UNDO_COST_TENTHS = GOLD_SCALE;

function cloneRunBattleRuntime(runtime: RunBattleRuntime): RunBattleRuntime {
  return {
    ...runtime,
    initiallyDeployedUnitIds: [...runtime.initiallyDeployedUnitIds],
    reserveUnitIds: [...runtime.reserveUnitIds],
    reservistPoolUnitIds: [...runtime.reservistPoolUnitIds],
    deployedReservistUnitIds: [...runtime.deployedReservistUnitIds],
    observedDeadUnitIds: [...runtime.observedDeadUnitIds],
    cashedOutUnitIds: [...runtime.cashedOutUnitIds],
  };
}

function cloneRunBattleUndoArmy(army: readonly RunArmyUnit[]): RunArmyUnit[] {
  return army.map((unit) => ({
    ...unit,
    abilities: [...unit.abilities],
    modifiers: [...unit.modifiers],
  }));
}

function cloneRunBattleUndoCards(cards: readonly RunOwnedCard[]): RunOwnedCard[] {
  return cards.map((card) => ({
    ...card,
    unitIds: [...card.unitIds],
    lostUnitIds: [...card.lostUnitIds],
  }));
}

export function captureRunBattleUndo(run: RunDocument): RunBattleUndoCheckpoint | null {
  if (run.phase !== 'battle' || !run.battleRuntime) return null;
  return {
    runId: run.id,
    battleIndex: run.battleIndex,
    goldTenths: run.goldTenths,
    army: cloneRunBattleUndoArmy(run.army),
    cards: cloneRunBattleUndoCards(run.cards),
    battleRuntime: cloneRunBattleRuntime(run.battleRuntime),
  };
}

function isRunBattleUndoCheckpoint(value: unknown): value is RunBattleUndoCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<RunBattleUndoCheckpoint>;
  const runtime = checkpoint.battleRuntime as Partial<RunBattleRuntime> | null | undefined;
  const armyIsValid = Array.isArray(checkpoint.army)
    && checkpoint.army.every((unit) => Boolean(
      unit
      && typeof unit === 'object'
      && Array.isArray(unit.abilities)
      && Array.isArray(unit.modifiers),
    ));
  const cardsAreValid = Array.isArray(checkpoint.cards)
    && checkpoint.cards.every((card) => Boolean(
      card
      && typeof card === 'object'
      && Array.isArray(card.unitIds)
      && Array.isArray(card.lostUnitIds),
    ));
  const runtimeIsValid = Boolean(
    runtime
    && typeof runtime === 'object'
    && Number.isSafeInteger(runtime.battleIndex)
    && Array.isArray(runtime.initiallyDeployedUnitIds)
    && Array.isArray(runtime.reserveUnitIds)
    && Array.isArray(runtime.reservistPoolUnitIds)
    && Array.isArray(runtime.deployedReservistUnitIds)
    && Array.isArray(runtime.observedDeadUnitIds)
    && Array.isArray(runtime.cashedOutUnitIds)
    && Number.isSafeInteger(runtime.reinforcementSequence),
  );
  return typeof checkpoint.runId === 'string'
    && Number.isSafeInteger(checkpoint.battleIndex)
    && Number.isSafeInteger(checkpoint.goldTenths)
    && (checkpoint.goldTenths ?? -1) >= 0
    && armyIsValid
    && cardsAreValid
    && runtimeIsValid;
}

export function canUndoRunBattleMove(
  run: RunDocument,
  checkpoint: RunBattleUndoCheckpoint | null,
): boolean {
  return isRunBattleUndoCheckpoint(checkpoint)
    && run.phase === 'battle'
    && run.id === checkpoint.runId
    && run.battleIndex === checkpoint.battleIndex
    && checkpoint.battleRuntime.battleIndex === checkpoint.battleIndex
    && checkpoint.goldTenths >= RUN_BATTLE_UNDO_COST_TENTHS;
}

/** Restore move-owned Run state and pay for the Undo from the pre-move economy. */
export function undoRunBattleMove(
  run: RunDocument,
  checkpoint: RunBattleUndoCheckpoint | null,
): RunDocument {
  if (!checkpoint || !canUndoRunBattleMove(run, checkpoint)) return run;
  return touch({
    ...run,
    goldTenths: checkpoint.goldTenths - RUN_BATTLE_UNDO_COST_TENTHS,
    army: cloneRunBattleUndoArmy(checkpoint.army),
    cards: cloneRunBattleUndoCards(checkpoint.cards),
    battleRuntime: cloneRunBattleRuntime(checkpoint.battleRuntime),
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
  if (!hasLipsanon(run, 'deployment-vehicle') || runtime.cashedOutUnitIds.includes(unitId)) {
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

/**
 * Gold a lipsanon pays the moment it is taken. Data rather than branches because the server
 * has to verify it independently: the opening Sectio's gold is pinned value-by-value, and
 * Bona Vacantia now runs BEFORE that Sectio, so an opening lipsanon can legitimately move the
 * number the contract checks. Both sides read this map, so neither can drift.
 */
export const RUN_LIPSANON_IMMEDIATE_GOLD: Readonly<Partial<Record<LipsanonId, number>>> = Object.freeze({
  'congressional-approval': 5,
  'occult-dagger': 10,
});

/** The gold these lipsana have already paid out, in tenths. */
export function lipsanonImmediateGoldTenths(lipsana: readonly LipsanonId[]): number {
  return lipsana.reduce((total, lipsanon) => total + (RUN_LIPSANON_IMMEDIATE_GOLD[lipsanon] ?? 0) * GOLD_SCALE, 0);
}

function immediateLipsanon(run: RunDocument, lipsanon: LipsanonId, targetUnitId?: string): RunDocument {
  let next = run;
  const payout = RUN_LIPSANON_IMMEDIATE_GOLD[lipsanon];
  if (payout) next = { ...next, goldTenths: next.goldTenths + payout * GOLD_SCALE };
  if (lipsanonNeedsUnitTarget(lipsanon) && targetUnitId) {
    next = {
      ...next,
      army: next.army.map((unit) => (
        unit.id === targetUnitId && !unit.abilities.includes('adlected')
          ? { ...unit, abilities: [...unit.abilities, 'adlected'] }
          : unit
      )),
    };
  }
  return next;
}

export function acquireLipsanon(run: RunDocument, lipsanon: LipsanonId, targetUnitId?: string): RunDocument {
  if (run.lipsana.includes(lipsanon)) return run;
  if (lipsanonNeedsUnitTarget(lipsanon) && !canTargetLipsanon(run, lipsanon, targetUnitId ?? '')) return run;
  return touch(immediateLipsanon({ ...run, lipsana: [...run.lipsana, lipsanon] }, lipsanon, targetUnitId));
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
    const cacochymicUnitId = card.cardType === 'pestiferous'
      ? card.cacochymicUnitId === unitId || !unitIds.includes(card.cacochymicUnitId ?? '')
        ? seededPestiferousTarget(card.effectSeed, unitIds, card.lostUnitIds.length)
        : card.cacochymicUnitId
      : null;
    return { ...card, unitIds, cacochymicUnitId };
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

/** Resolve Cacochymic units' committed combat-end deaths. Each owning Pestiferous card
 * then selects its next surviving member, while the battle-index ledger keeps retries idempotent. */
export function resolveCacochymicCombatDeaths(run: RunDocument, battleIndex: number): RunDocument {
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
    const unitId = card.cacochymicUnitId && remaining.includes(card.cacochymicUnitId)
      ? card.cacochymicUnitId
      : seededPestiferousTarget(card.effectSeed, remaining, card.lostUnitIds.length);
    if (!unitId) return card;
    const unit = armyById.get(unitId);
    if (!unit) return card;
    removedIds.add(unitId);
    const plaguedUnit = unit.modifiers.includes('cacochymic')
      ? unit
      : { ...unit, modifiers: [...unit.modifiers, 'cacochymic' as const] };
    losses.push({ battleIndex, cardId: card.id, unit: cloneArmy([plaguedUnit])[0] });
    const unitIds = card.unitIds.filter((id) => id !== unitId);
    const lostUnitIds = [...card.lostUnitIds, unitId];
    return {
      ...card,
      unitIds,
      lostUnitIds,
      cacochymicUnitId: seededPestiferousTarget(card.effectSeed, unitIds, lostUnitIds.length),
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

/**
 * What the Battle just fought pays out: its own reward, plus whatever a lipsanon adds on top
 * of it. Shared by the aftermath report and the transition that banks it, so the screen
 * cannot quote a number the Run then fails to pay.
 */
function battleRewardTenths(run: RunDocument, survivingUnitIds: readonly string[]): {
  victoryGoldTenths: number;
  bonusGoldTenths: number;
} {
  const survivorSet = new Set(survivingUnitIds);
  return {
    victoryGoldTenths: battleVictoryGoldTenths(run.war.battles[run.battleIndex].level),
    bonusGoldTenths: hasLipsanon(run, 'mercenarys-rifle')
      ? run.army.reduce((total, unit) => total + (survivorSet.has(unit.id) ? PIECE_VALUE[unit.type] : 0), 0)
      : 0,
  };
}

/**
 * The Battle is won. Its result gets a screen of its own before the Run moves on, so the
 * Sectio is not opened underneath a report of the fight that paid for it.
 *
 * The final Battle is the exception on both counts: it ends the War, whose own victory
 * screen is the report, and it grants no spendable reward (ADR-0220) -- so an aftermath
 * screen there would announce gold that is never banked.
 */
export function closeBattle(run: RunDocument, report: RunBattleReport): RunDocument {
  if (run.phase !== 'battle') return run;
  if (run.battleIndex >= run.war.battles.length - 1) return openSectio(run, report.survivingUnitIds);
  const { victoryGoldTenths, bonusGoldTenths } = battleRewardTenths(run, report.survivingUnitIds);
  const startedAtMs = run.battleRuntime?.startedAtMs;
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  return touch({
    ...run,
    phase: 'aftermath',
    aftermath: {
      battleIndex: run.battleIndex,
      turns: Number.isSafeInteger(report.turns) && report.turns > 0 ? report.turns : 0,
      elapsedMs: Number.isSafeInteger(startedAtMs)
        ? Math.max(0, Date.now() - (startedAtMs as number))
        : null,
      goldTenths: victoryGoldTenths + bonusGoldTenths,
      bonusGoldTenths,
      survivingUnitIds: [...report.survivingUnitIds],
      fallenUnits: (run.battleRuntime?.observedDeadUnitIds ?? []).flatMap((id) => {
        const unit = armyById.get(id);
        return unit ? [{ id: unit.id, name: unit.name, type: unit.type }] : [];
      }),
    },
  });
}

/** Leave the aftermath report; whatever follows the Battle opens now. */
export function leaveAftermath(run: RunDocument): RunDocument {
  if (run.phase !== 'aftermath' || !run.aftermath) return run;
  return openSectio(run, run.aftermath.survivingUnitIds);
}

export function openSectio(run: RunDocument, survivingUnitIds: readonly string[]): RunDocument {
  // Reachable from the Battle itself (the final one, and every fast-forwarded Battle the
  // crafter plays) and from the aftermath report the other Battles stop at.
  if (run.phase !== 'battle' && run.phase !== 'aftermath') return run;
  const finalBattle = run.battleIndex >= run.war.battles.length - 1;

  const { victoryGoldTenths, bonusGoldTenths: rifleTenths } = battleRewardTenths(run, survivingUnitIds);
  const resolvedDeaths = resolveCacochymicCombatDeaths(run, run.battleIndex);
  if (finalBattle) {
    return touch({ ...resolvedDeaths, phase: 'victory', sectio: null, deployment: null, battleRuntime: null, aftermath: null });
  }
  const banked: RunDocument = {
    ...resolvedDeaths,
    goldTenths: run.goldTenths + victoryGoldTenths + rifleTenths,
    deployment: null,
    battleRuntime: null,
    aftermath: null,
  };
  // A loot Battle closes a Conflict, so the next one opens here -- before the Sectio, so the
  // player inherits the lipsanon and then decides what to spend on. The Battle's gold is
  // already banked above, which is why this screen can precede the Sectio without the Sectio's
  // entry snapshot going stale.
  const closedConflict = banked.war.battles[banked.battleIndex]?.loot === true;
  if (closedConflict && conflictOpensWithVacantia(banked.war, banked.battleIndex + 1)) {
    const reveal = revealLipsana(banked, 3, 'vacantia-lipsana', banked.battleIndex + 1);
    return touch({
      ...banked,
      phase: 'bona-vacantia',
      seenLipsana: reveal.seenLipsana,
      sectio: null,
      vacantia: {
        kind: 'post-battle',
        conflictIndex: banked.conflictIndex + 1,
        afterBattleIndex: banked.battleIndex,
        victoryGoldTenths,
        offers: reveal.offers,
      },
    });
  }
  return touch(openPostBattleSectio(banked, victoryGoldTenths));
}

/**
 * The Sectio that follows a Battle. Split out of openSectio because Bona Vacantia can land in
 * between: when a Conflict closes, the lipsanon screen comes first and then hands off here.
 */
function openPostBattleSectio(run: RunDocument, victoryGoldTenths: number): RunDocument {
  let next: RunDocument = { ...run, phase: 'sectio', vacantia: null };
  const cardCount = hasLipsanon(next, 'quartermasters-ledger') ? 4 : 3;
  const cardOffers = shuffled(RUN_CARD_DECK, mixSeed(next.seed, 'shop-cards', next.battleIndex))
    .slice(0, cardCount)
    .map((card, slotIndex) => createRunCardOffer(next, card, next.battleIndex, slotIndex));
  let paidLipsanonOffer: LipsanonId | null = null;
  let paidLipsanonBought = false;
  if (hasLipsanon(next, 'merchants-shopkey')) {
    const existing = next.conflictPaidLipsana[String(next.conflictIndex)];
    if (existing) {
      paidLipsanonOffer = existing.lipsanonId;
      paidLipsanonBought = existing.bought;
    } else {
      const paidReveal = revealLipsana(next, 1, 'shopkey-lipsanon', next.conflictIndex);
      paidLipsanonOffer = paidReveal.offers[0] ?? null;
      next = {
        ...next,
        seenLipsana: paidReveal.seenLipsana,
        conflictPaidLipsana: paidLipsanonOffer
          ? {
              ...next.conflictPaidLipsana,
              [String(next.conflictIndex)]: { lipsanonId: paidLipsanonOffer, bought: false },
            }
          : next.conflictPaidLipsana,
      };
    }
  }
  const entrySnapshot = createSectioEntrySnapshot(next, paidLipsanonBought);
  return {
    ...next,
    sectio: {
      kind: 'post-battle',
      afterBattleIndex: next.battleIndex,
      conflictIndex: next.conflictIndex,
      victoryGoldTenths,
      cardOffers,
      adlectedCardOfferIds: [],
      paidLipsanonOffer,
      paidLipsanonBought,
      alienatedUnits: [],
      entrySnapshot,
    },
  };
}

export function performAdlectio(run: RunDocument, offerId: string): RunDocument {
  const offer = run.sectio?.cardOffers.find((candidate) => candidate.offerId === offerId);
  if (
    run.phase !== 'sectio'
    || !run.sectio
    || run.sectio.adlectedCardOfferIds.includes(offerId)
    || !offer
  ) return run;
  const cost = offer.cost * GOLD_SCALE;
  if (run.goldTenths < cost) return run;
  const { addedUnits, ...armyUpdate } = addArmyPieces(run, offer.pieces, 'adlectio');
  const cacochymicUnitId = offer.cardType === 'pestiferous' && offer.cacochymicPieceIndex !== null
    ? addedUnits[offer.cacochymicPieceIndex]?.id ?? null
    : null;
  const effectTargetUnit = offer.cardType === 'concinnous'
    && Number.isSafeInteger(offer.effectTargetIndex)
    ? addedUnits[offer.effectTargetIndex!]
    : offer.cardType === 'legatine'
      ? addedUnits[legatineAdlectedAcquisitionTarget(offer.effectSeed, addedUnits.length) ?? -1]
      : offer.cardType === 'hieratic'
        ? addedUnits[hieraticAgminateAcquisitionTarget(offer.effectSeed, addedUnits.length) ?? -1]
        : undefined;
  const grantedAbility: RunAbility | null = offer.cardType === 'legatine'
    ? 'adlected'
    : offer.cardType === 'concinnous'
      ? 'eutactic'
      : offer.cardType === 'hieratic'
        ? 'agminate'
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
    cacochymicUnitId,
    acquiredAfterBattleIndex: run.sectio.afterBattleIndex,
  };
  const cards = [...run.cards, card];
  return touch({
    ...run,
    ...armyUpdate,
    army: synchronizePlaguedModifiers(abilityArmy, cards),
    cards,
    nextCardSequence: run.nextCardSequence + 1,
    goldTenths: run.goldTenths - cost,
    sectio: {
      ...run.sectio,
      adlectedCardOfferIds: [...run.sectio.adlectedCardOfferIds, offerId],
    },
  });
}

export function performAlienatio(run: RunDocument, unitId: string): RunDocument {
  if (run.phase !== 'sectio') return run;
  const unit = run.army.find((candidate) => candidate.id === unitId);
  if (!unit || unit.type === 'king') return run;
  const numerator = hasLipsanon(run, 'fair-scales') ? 75 : 50;
  const proceedsTenths = (PIECE_VALUE[unit.type] * GOLD_SCALE * numerator) / 100;
  const removal = removeUnitFromArmyAndCards(run, unitId);
  return touch({
    ...run,
    ...removal,
    goldTenths: run.goldTenths + proceedsTenths,
    sectio: run.sectio
      ? {
          ...run.sectio,
          alienatedUnits: [...run.sectio.alienatedUnits, { unit: cloneArmy([unit])[0], proceedsTenths }],
        }
      : null,
  });
}

export function resetSectio(run: RunDocument): RunDocument {
  if (run.phase !== 'sectio' || !run.sectio?.entrySnapshot) return run;
  const snapshot = run.sectio.entrySnapshot;
  return touch({
    ...run,
    goldTenths: snapshot.goldTenths,
    army: cloneArmy(snapshot.army),
    cards: cloneCards(snapshot.cards),
    lipsana: [...snapshot.lipsana],
    seenLipsana: [...snapshot.seenLipsana],
    conflictPaidLipsana: cloneConflictPaidLipsana(snapshot.conflictPaidLipsana),
    nextArmyUnitSequence: snapshot.nextArmyUnitSequence,
    nextArmyUnitNumberByType: { ...snapshot.nextArmyUnitNumberByType },
    nextCardSequence: snapshot.nextCardSequence,
    sectio: {
      ...run.sectio,
      adlectedCardOfferIds: [],
      paidLipsanonBought: snapshot.paidLipsanonBought,
      alienatedUnits: [],
    },
  });
}

export function sectioHasChanges(run: RunDocument): boolean {
  if (run.phase !== 'sectio' || !run.sectio?.entrySnapshot) return false;
  const snapshot = run.sectio.entrySnapshot;
  return (
    run.goldTenths !== snapshot.goldTenths
    || run.nextArmyUnitSequence !== snapshot.nextArmyUnitSequence
    || run.sectio.adlectedCardOfferIds.length > 0
    || run.sectio.paidLipsanonBought !== snapshot.paidLipsanonBought
    || run.sectio.alienatedUnits.length > 0
    || JSON.stringify(run.army) !== JSON.stringify(snapshot.army)
    || JSON.stringify(run.cards) !== JSON.stringify(snapshot.cards)
    || JSON.stringify(run.lipsana) !== JSON.stringify(snapshot.lipsana)
    || JSON.stringify(run.conflictPaidLipsana) !== JSON.stringify(snapshot.conflictPaidLipsana)
  );
}

export function canLeaveSectio(run: RunDocument): boolean {
  return run.phase === 'sectio' && Boolean(run.sectio);
}

/**
 * Take the Conflict's lipsanon. Mandatory, as the loot lipsanon was: there is no way past this
 * screen without one, so taking it is also what opens the Sectio behind it.
 */
export function takeVacantiaLipsanon(run: RunDocument, lipsanon: LipsanonId, targetUnitId?: string): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia || !run.vacantia.offers.includes(lipsanon)) return run;
  const acquired = acquireLipsanon(run, lipsanon, targetUnitId);
  if (acquired === run) return run;
  const vacantia = run.vacantia;
  const opened = vacantia.kind === 'opening'
    ? openOpeningSectio(acquired, acquired.seed, acquired.ataraxiaTier)
    : openPostBattleSectio(acquired, vacantia.victoryGoldTenths);
  return touch(opened);
}

export function buyPaidLipsanon(run: RunDocument, targetUnitId?: string): RunDocument {
  if (run.phase !== 'sectio' || !run.sectio || !run.sectio.paidLipsanonOffer || run.sectio.paidLipsanonBought || run.goldTenths < 10 * GOLD_SCALE) return run;
  const acquired = acquireLipsanon(run, run.sectio.paidLipsanonOffer, targetUnitId);
  if (acquired === run) return run;
  return touch({
    ...acquired,
    goldTenths: acquired.goldTenths - 10 * GOLD_SCALE,
    conflictPaidLipsana: {
      ...acquired.conflictPaidLipsana,
      [String(run.conflictIndex)]: { lipsanonId: run.sectio.paidLipsanonOffer, bought: true },
    },
    sectio: { ...run.sectio, paidLipsanonBought: true },
  });
}

export function leaveSectio(run: RunDocument): RunDocument {
  if (!canLeaveSectio(run) || !run.sectio) return run;
  const opening = run.sectio.kind === 'opening';
  const endedConflict = run.war.battles[run.sectio.afterBattleIndex]?.loot === true;
  return touch({
    ...run,
    phase: 'deployment',
    battleIndex: opening ? run.battleIndex : run.battleIndex + 1,
    conflictIndex: run.conflictIndex + (!opening && endedConflict ? 1 : 0),
    deployment: null,
    battleRuntime: null,
    sectio: null,
  });
}

export function formatGold(goldTenths: number): string {
  const gold = goldTenths / GOLD_SCALE;
  return gold.toFixed(Number.isInteger(gold) ? 0 : Number.isInteger(gold * 10) ? 1 : 2);
}

export function cardContentsLabel(card: Readonly<{ pieces: readonly RunArmyPieceType[] }>): string {
  const counts = new Map<RunArmyPieceType, number>();
  for (const piece of card.pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return (['king', ...ADLECTIO_PIECE_ORDER] as const)
    .filter((piece) => counts.has(piece))
    .map((piece) => `${counts.get(piece)! > 1 ? `${counts.get(piece)} ` : ''}${PIECE_LABEL[piece]}${counts.get(piece)! > 1 ? 's' : ''}`)
    .join(' + ');
}

export function isRunArmyPieceType(value: PieceType): value is RunArmyPieceType {
  return value === 'pawn' || value === 'knight' || value === 'bishop' || value === 'rook' || value === 'queen' || value === 'king';
}
