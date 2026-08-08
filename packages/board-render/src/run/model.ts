import { validateLevel, type Level, type War } from '../core/level';
import { migrateLevelDocument } from '../core/levelMigration';
import type { PieceType } from '../core/types';
import {
  LIPSANON_BY_ID,
  RUN_LIPSANA,
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
  RUN_LIPSANON_OFFER_POOL,
  type LipsanonDefinition,
  type LipsanonId,
};

/** The schema version of one persisted in-progress Run. Only this exact save shape is read. */
export const CURRENT_RUN_SAVE_VERSION = 32;
export type RunSaveVersion = typeof CURRENT_RUN_SAVE_VERSION;

export class UnsupportedRunSaveError extends Error {
  constructor(message = 'This Run was saved by an unsupported version. Start a new Run.') {
    super(message);
    this.name = 'UnsupportedRunSaveError';
  }
}

const RUN_SAVE_VERSION_FIELD_RENAME_SOURCE = 16;
const RUN_SAVE_VERSION_EXCHANGE_VOCABULARY_SOURCE = 17;
const RUN_SAVE_VERSION_STARTER_CHARTULARY_SOURCE = 18;
const RUN_SAVE_VERSION_EXPUNCTIO_SOURCE = 19;
const RUN_SAVE_VERSION_CARD_ORDER_SOURCE = 20;
const RUN_SAVE_VERSION_DEPLOYMENT_TRANSPORT_SOURCE = 21;
const RUN_SAVE_VERSION_LEVEL_FORMAT_SOURCE = 22;
const RUN_SAVE_VERSION_FORMATION_CARDS_SOURCE = 23;
const RUN_SAVE_VERSION_SIDEWAYS_FORMATIONS_SOURCE = 24;
const RUN_SAVE_VERSION_SECTIO_PILE_SOURCE = 25;
const RUN_SAVE_VERSION_QUEEN_PAWN_FORMATIONS_SOURCE = 26;
const RUN_SAVE_VERSION_IMMUTABLE_FORMATIONS_SOURCE = 27;
const RUN_SAVE_VERSION_DEPLOYMENT_MODE_SOURCE = 28;
const RUN_SAVE_VERSION_PLAYER_FORMATIONS_SOURCE = 29;
const RUN_SAVE_VERSION_ARRANGED_PILE_SOURCE = 30;
const RUN_SAVE_VERSION_OPENING_CARD_GRANT_SOURCE = 31;
export const GOLD_SCALE = 10;
export const RUN_STARTING_GOLD = 8;
export const RUN_STARTING_GOLD_TENTHS = RUN_STARTING_GOLD * GOLD_SCALE;
export const RUN_BATTLE_RETRY_COST_TENTHS = 3 * GOLD_SCALE;
export const RUN_EN_PASSANT_BOUNTY_TENTHS = 5 * GOLD_SCALE;
export const RUN_DEPLOYMENT_REROLL_COST_TENTHS = GOLD_SCALE;
export const RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS = 5 * GOLD_SCALE;
export const RUN_SECTIO_CARD_OFFER_COUNT = 3;
export const RUN_SECTIO_CARD_PILE_SIZE = 20;

/** How often each rarity reaches the market. These are quotas, not roll odds: a pile holds
 * exactly this composition every time, so what a Battle can buy is the same number rather than
 * one that only converges over a long sample. That exactness is the point -- it is what makes
 * value gain between Battles something a Level can be authored against. */
export const RUN_CARD_RARITY_PERCENT: Readonly<Record<RunCardRarity, number>> = Object.freeze({
  common: 80,
  uncommon: 15,
  rare: 5,
});

/** The uncapped pile's seats, which are `RUN_CARD_RARITY_PERCENT` of `RUN_SECTIO_CARD_PILE_SIZE`.
 * A cost ceiling that empties a tier re-apportions these; see `sectioPileRarityQuota`. */
export const RUN_SECTIO_CARD_PILE_RARITY_COUNT: Readonly<Record<RunCardRarity, number>> = Object.freeze({
  common: 16,
  uncommon: 3,
  rare: 1,
});

/**
 * The cost ceiling the market opens under, and the number of Battles it survives -- six gold for
 * the Sectios that follow Battles 1 and 2, then no ceiling at all.
 *
 * Gold already bounds how much material a Battle can buy, because a Battle pays half the enemy
 * force's value and a card costs its value. What broke that relationship was banking: an early
 * row nobody could afford carried its gold forward, and two Battles later it all landed at once.
 * The ceiling removes the banking rather than the gain, so army value per Battle settles onto the
 * reward the Level already authored.
 */
export const RUN_SECTIO_EARLY_CARD_MAX_VALUE = 6;
export const RUN_SECTIO_EARLY_CARD_BATTLE_COUNT = 2;
export const INSTALLED_ATARAXIA_MAX_TIER = 0;
export type AtaraxiaTier = 0;

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
export type RunCardRarity = 'common' | 'uncommon' | 'rare';

/** Rarity in ascending order, so quota apportionment and reference surfaces agree on the ladder. */
export const RUN_CARD_RARITIES: readonly RunCardRarity[] = Object.freeze(['common', 'uncommon', 'rare']);

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
  source: 'king' | 'starting' | 'adlectio';
}

export type RunArmyNumberState = Record<RunArmyPieceType, number>;

export interface RunCoreCard {
  id: string;
  pieces: AdlectablePieceType[];
  /** Temporary shared illustration identity. Formation is the card's gameplay identity;
   * cards may reuse composition art until dedicated scenes are authored. */
  artId?: string;
  /** Board-relative offsets, parallel to `pieces`. Lower y is toward the enemy. */
  formation?: RunCardFormationCell[];
  value: number;
  rarity: RunCardRarity;
}

export interface RunCardFormationCell {
  x: number;
  y: number;
}

export type RunStarterCardId = 'his-grace';

/** Starter-only Chartulary cards. They are never offered by Adlectio, but otherwise
 * participate in the Deployment deal exactly like every card the player holds. */
export interface RunStarterCard {
  id: RunStarterCardId;
  pieces: RunArmyPieceType[];
  artId?: string;
  formation?: RunCardFormationCell[];
  value: number;
  rarity: RunCardRarity;
  name: string;
  flavor: string;
  removable: boolean;
}

export interface RunCardOffer extends RunCoreCard {
  offerId: string;
  cost: number;
}

export interface RunOwnedCard {
  id: string;
  coreId: string;
  /** Stable authored formation seats. A sold or lost unit leaves null at the same index;
   * presentation never reorders or compacts surviving units into another formation cell. */
  unitSeats: Array<string | null>;
  acquiredAfterBattleIndex: number;
}

/** The units still attached to a card, in its persisted left-to-right order. */
export function runCardUnitIds(card: Pick<RunOwnedCard, 'unitSeats'>): string[] {
  return card.unitSeats.filter((unitId): unitId is string => typeof unitId === 'string');
}

export interface RunExpunctioRecord {
  card: RunOwnedCard;
  units: RunArmyUnit[];
  priceTenths: number;
}

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
 * 'bona-vacantia' opens a Conflict: the player takes one lipsanon before its first Battle.
 * It replaced the loot lipsanon that used to be won at a Conflict's END -- same three-per-run
 * cadence, opposite end, so the choice is made looking forward rather than handed out as a reward.
 *
 * 'aftermath' closes a Battle: what the Battle paid and cost gets its own screen before
 * the Run moves on. The reward used to be reported by a line inside the Sectio, which put
 * the result of the fight in the room where the money is spent.
 */
export type RunPhase = 'aftermath' | 'bona-vacantia' | 'deployment' | 'battle' | 'sectio' | 'victory';

export type RunDeploymentTransport = 'paused' | 'playing' | 'full-deploy';
export type RunDeploymentMode = 'automatic' | 'arranged';

export interface RunDeploymentState {
  battleIndex: number;
  seed: number;
  /** Cards dealt in this exact order for this combat. */
  dealtCardIds: string[];
  deployingUnitIds: string[];
  unavailableUnitIds: string[];
  capacityResolved: boolean;
  /** Exact committed formation, preserved across reload and Battle retry. */
  placements: Record<string, string>;
  /** Precommitted whole-card destinations. They remain invisible until each card plays. */
  formationPlans?: Record<string, Record<string, string>>;
  /** Zero-based cursor into the dealt cards and that card's stable seat order. */
  activeCardIndex: number;
  unitCursor: number;
  /** Count of cards whose discard animation has completed. */
  discardCursor: number;
  revealedCardIds: string[];
  /** Units committed together and still completing their compositor-owned arrivals. */
  settlingUnitIds: string[];
  /** One persisted transport controls the same ordered deployment sequence. */
  transport: RunDeploymentTransport;
  /** Each value is a persisted information or animation boundary. */
  stage: 'awaiting-deal' | 'dealing' | 'arranging' | 'card' | 'revealing' | 'unit' | 'settling' | 'discarding' | 'complete';
  /** Battle-runtime aliases for formation units that could not enter the board. */
  blockedUnitIds: string[];
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
  afterBattleIndex: number;
  conflictIndex: number;
  victoryGoldTenths: number;
  cardOffers: RunCardOffer[];
  adlectedCardOfferIds: string[];
  paidLipsanonOffer: LipsanonId | null;
  paidLipsanonBought: boolean;
  /** The sole card struck from the Chartulary during this visit, or null while unused. */
  expunctedCard: RunExpunctioRecord | null;
  entrySnapshot: RunSectioEntrySnapshot;
}

/**
 * The lipsanon offer that opens a Conflict. `kind` says whether taking it hands off directly to
 * Battle 1's Deployment or to the post-Battle Sectio following the Battle just fought.
 * `victoryGoldTenths` is carried through because that later Sectio reports it and the Battle's
 * gold is banked before this screen, not after it.
 */
/**
 * The screen that opens a Conflict. A post-battle Conflict offers lipsana; the Run's opening
 * offers formation cards instead, so the player reaches Battle 1 holding something to arrange.
 * The two offer lists are exclusive -- `kind` decides which one is populated.
 */
export interface RunVacantiaState {
  kind: 'opening' | 'post-battle';
  conflictIndex: number;
  afterBattleIndex: number;
  victoryGoldTenths: number;
  offers: LipsanonId[];
  /** Core card ids, populated only for `kind: 'opening'`. */
  cardOffers: string[];
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
  /** One Run-wide contract selected before creation; it never changes in-flight. */
  deploymentMode: RunDeploymentMode;
  updatedAt: string;
  war: RunWarSnapshot;
  phase: RunPhase;
  battleIndex: number;
  conflictIndex: number;
  goldTenths: number;
  army: RunArmyUnit[];
  cards: RunOwnedCard[];
  lipsana: LipsanonId[];
  seenLipsana: LipsanonId[];
  conflictPaidLipsana: Record<string, { lipsanonId: LipsanonId; bought: boolean }>;
  nextArmyUnitSequence: number;
  nextArmyUnitNumberByType: RunArmyNumberState;
  nextCardSequence: number;
  /** Cards already consumed from the seed-derived hidden Sectio pile. */
  sectioCardCursor: number;
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

/** Raw labeled formations before quarter-turn-equivalent cards are collapsed. */
export const RUN_GENERATED_CARD_COUNT = 720;
export const RUN_AUTHORED_FORMATION_EXCEPTION_COUNT = 6;
export const RUN_OFFER_CARD_COUNT = 269;

const FORMATION_COLUMNS = 4;
const FORMATION_ROWS = 2;
const FORMATION_MAX_UNITS = 4;
const FORMATION_MAX_VALUE = 9;
const ADLECTABLE_CARD_PIECES: readonly Readonly<{
  type: AdlectablePieceType;
  initial: string;
}>[] = Object.freeze([
  Object.freeze({ type: 'pawn', initial: 'p' }),
  Object.freeze({ type: 'knight', initial: 'k' }),
  Object.freeze({ type: 'bishop', initial: 'b' }),
  Object.freeze({ type: 'rook', initial: 'r' }),
  Object.freeze({ type: 'queen', initial: 'q' }),
]);
const CARD_INITIAL_BY_PIECE = new Map(ADLECTABLE_CARD_PIECES.map(({ type, initial }) => [type, initial]));
const CARD_PIECE_ORDER = new Map(ADLECTABLE_CARD_PIECES.map(({ type }, index) => [type, index]));

function cardComposition(pieces: readonly AdlectablePieceType[]): string {
  return [...pieces]
    .sort((left, right) => (CARD_PIECE_ORDER.get(left) ?? 0) - (CARD_PIECE_ORDER.get(right) ?? 0))
    .map((piece) => CARD_INITIAL_BY_PIECE.get(piece))
    .join('');
}

/** The footprint an illustration is drawn for, cells in reading order. */
function cardFootprintId(formation: readonly RunCardFormationCell[]): string {
  return [...formation]
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((cell) => `${cell.x}${cell.y}`)
    .join('');
}

/**
 * One illustration per (footprint, roster). Cards that share both differ only in which seat
 * each piece occupies, which the card face already draws on its own board -- so they share a
 * scene. Splitting art by footprint as well as roster is what lets the picture answer the
 * arrangement: the same four people hold a corner, a line, and a column differently.
 */
function cardCompositionArtId(
  pieces: readonly AdlectablePieceType[],
  formation: readonly RunCardFormationCell[],
): string {
  return `${cardFootprintId(formation)}-${cardComposition(pieces)}`;
}

/** The value bands rarity reads before footprint adjusts it. Four is the most material a card
 * can carry and still be the cheap, always-available tier. */
export const RUN_CARD_COMMON_MAX_VALUE = 4;
export const RUN_CARD_UNCOMMON_MAX_VALUE = 6;

/** Rotation-canonical footprint, blind to which piece sits in which seat. Card identity already
 * collapses quarter turns, so the shapes a rarity rule names have to collapse them too. */
function rotationalFootprintId(formation: readonly RunCardFormationCell[]): string {
  return ([0, 1, 2, 3] as const)
    .map((turns) => {
      const rotated = formation.map((cell) => (
        turns === 1
          ? { x: -cell.y, y: cell.x }
          : turns === 2
            ? { x: -cell.x, y: -cell.y }
            : turns === 3
              ? { x: cell.y, y: -cell.x }
              : cell
      ));
      const minX = Math.min(...rotated.map((cell) => cell.x));
      const minY = Math.min(...rotated.map((cell) => cell.y));
      return rotated
        .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
        .sort((left, right) => left.x - right.x || left.y - right.y)
        .map((cell) => `${cell.x}${cell.y}`)
        .join('-');
    })
    .sort()[0];
}

/**
 * The five four-cell footprints that waste the deployment band, each written here in the form it
 * takes lying in that band. Every one of them is a bar with the fourth seat pushed off the line,
 * so the shape cannot be tucked against a neighbour the way a square, a straight run, or a corner
 * can. Both Z chiralities are separate card identities, and both are listed.
 */
const AWKWARD_CARD_FOOTPRINTS: ReadonlySet<string> = new Set(([
  [[0, 0], [1, 0], [1, 1], [2, 1]], // ##. / .##  Z
  [[1, 0], [2, 0], [0, 1], [1, 1]], // .## / ##.  S
  [[0, 0], [1, 0], [2, 0], [1, 1]], // ### / .#.  T
  [[0, 0], [0, 1], [1, 1], [2, 1]], // #.. / ###  J
  [[0, 0], [1, 0], [2, 0], [0, 1]], // ### / #..  L
] as const).map((cells) => rotationalFootprintId(cells.map(([x, y]) => ({ x, y })))));

/**
 * Rarity is the market's ramp control, and it reads two things.
 *
 * Material value sets the band: Common through four, Uncommon at five and six, Rare above that.
 * Footprint then adjusts it. The five awkward shapes pack badly enough that their material
 * overstates what they are worth on a board, so each drops one tier -- which is what puts genuinely
 * high-value cards in the Common pool without letting the Common pool hand out clean material.
 *
 * An opposite-colour Bishop pair is the exception, and keeps its band on any footprint. The pair
 * is the prize; the shape it arrives on does not spoil it.
 */
export function runCardRarity(
  pieces: readonly AdlectablePieceType[],
  formation: readonly RunCardFormationCell[],
): RunCardRarity {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  const band: RunCardRarity = value <= RUN_CARD_COMMON_MAX_VALUE
    ? 'common'
    : value <= RUN_CARD_UNCOMMON_MAX_VALUE ? 'uncommon' : 'rare';
  const bishops = pieces.flatMap((piece, index) => piece === 'bishop' ? [formation[index]] : []);
  const hasOppositeColorBishopPair = bishops.some((left, index) => bishops
    .slice(index + 1)
    .some((right) => (left.x + left.y) % 2 !== (right.x + right.y) % 2));
  if (hasOppositeColorBishopPair || !AWKWARD_CARD_FOOTPRINTS.has(rotationalFootprintId(formation))) {
    return band;
  }
  return band === 'rare' ? 'uncommon' : 'common';
}

const formationCard = (
  id: string,
  pieces: readonly AdlectablePieceType[],
  formation: readonly RunCardFormationCell[],
): RunCoreCard => {
  if (pieces.length !== formation.length || pieces.length < 1 || pieces.length > FORMATION_MAX_UNITS) {
    throw new Error(`Formation card ${id} must place each of its one-to-four units exactly once.`);
  }
  if (new Set(formation.map((cell) => `${cell.x},${cell.y}`)).size !== formation.length) {
    throw new Error(`Formation card ${id} repeats a cell.`);
  }
  return Object.freeze({
    id,
    pieces: [...pieces],
    formation: formation.map((cell) => ({ ...cell })),
    artId: cardCompositionArtId(pieces, formation),
    value: pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0),
    rarity: runCardRarity(pieces, formation),
  });
};

function connectedFormation(cells: readonly RunCardFormationCell[]): boolean {
  const available = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const visited = new Set<string>();
  const pending = [cells[0]];
  while (pending.length) {
    const cell = pending.pop()!;
    const id = `${cell.x},${cell.y}`;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of [
      { x: cell.x - 1, y: cell.y }, { x: cell.x + 1, y: cell.y },
      { x: cell.x, y: cell.y - 1 }, { x: cell.x, y: cell.y + 1 },
    ]) {
      if (available.has(`${neighbor.x},${neighbor.y}`)) pending.push(neighbor);
    }
  }
  return visited.size === cells.length;
}

function generatedFormationFootprints(): RunCardFormationCell[][] {
  const footprints: RunCardFormationCell[][] = [];
  const cellCount = FORMATION_COLUMNS * FORMATION_ROWS;
  for (let mask = 1; mask < (1 << cellCount); mask += 1) {
    const cells = Array.from({ length: cellCount }, (_, index) => ({
      x: index % FORMATION_COLUMNS,
      y: Math.floor(index / FORMATION_COLUMNS),
    })).filter((_, index) => (mask & (1 << index)) !== 0);
    if (
      cells.length > FORMATION_MAX_UNITS
      || Math.min(...cells.map((cell) => cell.x)) !== 0
      || !connectedFormation(cells)
    ) continue;
    footprints.push(cells.sort((left, right) => left.x - right.x || left.y - right.y));
  }
  return footprints.sort((left, right) => (
    left.length - right.length
    || left.map((cell) => `${cell.x}${cell.y}`).join('').localeCompare(
      right.map((cell) => `${cell.x}${cell.y}`).join(''),
    )
  ));
}

function generatedCardsForFootprint(formation: readonly RunCardFormationCell[]): RunCoreCard[] {
  const cards: RunCoreCard[] = [];
  const pieces: AdlectablePieceType[] = [];
  const visit = (index: number, value: number): void => {
    if (index === formation.length) {
      const footprintId = formation.map((cell) => `${cell.x}${cell.y}`).join('');
      const pieceId = pieces.map((piece) => CARD_INITIAL_BY_PIECE.get(piece)).join('');
      cards.push(formationCard(
        `f-${footprintId}-${pieceId}`,
        pieces,
        formation,
      ));
      return;
    }
    for (const { type } of ADLECTABLE_CARD_PIECES) {
      const nextValue = value + PIECE_VALUE[type];
      const completesQueenPawnPair = formation.length === 2
        && index === 1
        && (
          (pieces[0] === 'queen' && type === 'pawn')
          || (pieces[0] === 'pawn' && type === 'queen')
        );
      if (nextValue > FORMATION_MAX_VALUE && !completesQueenPawnPair) continue;
      pieces.push(type);
      visit(index + 1, nextValue);
      pieces.pop();
    }
  };
  visit(0, 0);
  return cards;
}

function semanticFormationId(card: Pick<RunCoreCard, 'pieces' | 'formation'>): string {
  return (card.formation ?? []).map((cell, index) => ({ cell, piece: card.pieces[index] }))
    .sort((left, right) => left.cell.x - right.cell.x || left.cell.y - right.cell.y)
    .map(({ cell, piece }) => `${cell.x}${cell.y}${CARD_INITIAL_BY_PIECE.get(piece)}`)
    .join('-');
}

function rotatedNormalizedFormation(
  card: Pick<RunCoreCard, 'pieces' | 'formation'>,
  turns: 0 | 1 | 2 | 3,
): Array<{ cell: RunCardFormationCell; piece: AdlectablePieceType }> {
  const rotated = (card.formation ?? []).map((cell, index) => {
    const transformed = turns === 1
      ? { x: -cell.y, y: cell.x }
      : turns === 2
        ? { x: -cell.x, y: -cell.y }
        : turns === 3
          ? { x: cell.y, y: -cell.x }
          : cell;
    return { cell: transformed, piece: card.pieces[index] };
  });
  const minX = Math.min(...rotated.map(({ cell }) => cell.x));
  const minY = Math.min(...rotated.map(({ cell }) => cell.y));
  return rotated
    .map(({ cell, piece }) => ({ cell: { x: cell.x - minX, y: cell.y - minY }, piece }))
    .sort((left, right) => left.cell.x - right.cell.x || left.cell.y - right.cell.y);
}

/** Player rotation makes translated quarter-turns one purchasable card identity. Reflection
 * remains meaningful: the player can rotate a formation, but cannot turn it over. */
function rotationalFormationId(card: Pick<RunCoreCard, 'pieces' | 'formation'>): string {
  return ([0, 1, 2, 3] as const)
    .map((turns) => rotatedNormalizedFormation(card, turns)
      .map(({ cell, piece }) => `${cell.x}${cell.y}${CARD_INITIAL_BY_PIECE.get(piece)}`)
      .join('-'))
    .sort()[0];
}

/** Existing named formations replace an equivalent generated identity when one exists;
 * six shapes outside the connected roster grammar remain explicit additions. */
function existingFormationCards(): RunCoreCard[] {
  return [
    formationCard('p', ['pawn'], [{ x: 0, y: 0 }]),
    formationCard('pp', ['pawn', 'pawn'], [{ x: 0, y: 0 }, { x: 1, y: 0 }]),
    formationCard('ppp', ['pawn', 'pawn', 'pawn'], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]),
    formationCard('k', ['knight'], [{ x: 0, y: 0 }]),
    formationCard('b', ['bishop'], [{ x: 0, y: 0 }]),
    formationCard('pk-front', ['knight', 'pawn'], [{ x: 0, y: 1 }, { x: 0, y: 0 }]),
    formationCard('pb-front', ['bishop', 'pawn'], [{ x: 0, y: 1 }, { x: 0, y: 0 }]),
    formationCard('ppk-reversed', ['knight', 'pawn', 'pawn'], [
      { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 },
    ]),
    formationCard('ppb-reversed', ['bishop', 'pawn', 'pawn'], [
      { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 },
    ]),
    formationCard('bb-diagonal', ['bishop', 'bishop'], [{ x: 0, y: 0 }, { x: 1, y: 1 }]),
    formationCard('r', ['rook'], [{ x: 0, y: 0 }]),
    formationCard('pr-front', ['rook', 'pawn'], [{ x: 0, y: 1 }, { x: 0, y: 0 }]),
    formationCard('kk-horizontal', ['knight', 'knight'], [{ x: 0, y: 0 }, { x: 1, y: 0 }]),
    formationCard('ppk-protected', ['knight', 'pawn', 'pawn'], [
      { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 },
    ]),
    formationCard('ppb-protected', ['bishop', 'pawn', 'pawn'], [
      { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 },
    ]),
    formationCard('q', ['queen'], [{ x: 0, y: 0 }]),
    formationCard('pq-front', ['queen', 'pawn'], [{ x: 0, y: 1 }, { x: 0, y: 0 }]),
    formationCard('bb-vertical', ['bishop', 'bishop'], [{ x: 0, y: 0 }, { x: 0, y: 1 }]),
    formationCard('rr-vertical', ['rook', 'rook'], [{ x: 0, y: 0 }, { x: 0, y: 1 }]),
  ];
}

function legacyRunCards(): RunCoreCard[] {
  const generated = generatedFormationFootprints().flatMap(generatedCardsForFootprint);
  if (generated.length !== RUN_GENERATED_CARD_COUNT) {
    throw new Error(`Generated ${generated.length} formation cards; expected ${RUN_GENERATED_CARD_COUNT}.`);
  }
  const cards = new Map(generated.map((card) => [semanticFormationId(card), card]));
  for (const existing of existingFormationCards()) cards.set(semanticFormationId(existing), existing);
  return [...cards.values()].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

/**
 * A formation is a CLUSTER: its squares touch orthogonally, and the card face prints that shape as
 * the thing the card grants. generatedFormationFootprints already refuses anything else, so a
 * diagonal chain could only reach the market through the named-card injection below — which is
 * exactly how Country Parish, Outrider Patrol and Crooked Diocese were still being dealt, three
 * shapes the generator had closed the door on.
 *
 * A named card may still sit outside the grammar on MATERIAL — pq-front is the admitted
 * ten-material roster. Connectivity is the part that is not negotiable, because squares that never
 * touch cannot read as one shape however they are drawn.
 *
 * Dropping them here retires them from the OFFER deck only. legacyRunCards keeps every named id
 * resolvable, so a Run already holding one still reads its name, art and formation.
 */
export function allRunCards(): RunCoreCard[] {
  const generated = generatedFormationFootprints().flatMap(generatedCardsForFootprint);
  const cards = new Map(generated.map((card) => [rotationalFormationId(card), card]));
  // Named cards remain the visual and textual anchor for their rotational class.
  for (const existing of existingFormationCards()) {
    const formation = existing.formation ?? [];
    if (formation.length === 0 || !connectedFormation(formation)) continue;
    cards.set(rotationalFormationId(existing), existing);
  }
  if (cards.size !== RUN_OFFER_CARD_COUNT) {
    throw new Error(`Built ${cards.size} Run offer cards; expected ${RUN_OFFER_CARD_COUNT}.`);
  }
  return [...cards.values()].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

const LEGACY_RUN_CARD_DECK: readonly RunCoreCard[] = Object.freeze(legacyRunCards());
export const RUN_CARD_DECK: readonly RunCoreCard[] = Object.freeze(allRunCards());
export const RUN_CARD_BY_ID: Readonly<Record<string, RunCoreCard>> = Object.freeze(
  // Old held cards remain readable after the offer catalog collapses rotational duplicates.
  // Only RUN_CARD_DECK is dealt, so these aliases cannot re-enter the market.
  Object.fromEntries(LEGACY_RUN_CARD_DECK.map((card) => [card.id, card])),
);

export const RUN_STARTER_CARDS: readonly RunStarterCard[] = Object.freeze([
  Object.freeze<RunStarterCard>({
    id: 'his-grace',
    pieces: ['king', 'pawn', 'pawn'],
    artId: 'his-grace',
    formation: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    value: 2,
    rarity: 'common',
    name: 'His Grace',
    flavor: 'Two names stood before his. Neither was entered twice.',
    removable: false,
  }),
]);

export const RUN_STARTER_CARD_BY_ID: Readonly<Record<RunStarterCardId, RunStarterCard>> = Object.freeze(
  Object.fromEntries(RUN_STARTER_CARDS.map((card) => [card.id, card])) as Record<RunStarterCardId, RunStarterCard>,
);

export type RunCardDefinition = RunCoreCard | RunStarterCard;

/** Every authored card identity shown by card-reference surfaces. The offer deck remains
 * RUN_CARD_DECK so starter-only cards cannot leak into ordinary Sectio draws. */
export const RUN_CARD_CATALOG: readonly RunCardDefinition[] = Object.freeze([
  ...RUN_STARTER_CARDS,
  ...RUN_CARD_DECK,
]);

export function runCardDefinition(coreId: string): RunCardDefinition | undefined {
  return RUN_CARD_BY_ID[coreId]
    ?? RUN_STARTER_CARD_BY_ID[coreId as RunStarterCardId];
}

/** True for a card the Run begins holding rather than one Sectio can offer. */
export function isRunStarterCard(card: Pick<RunCardDefinition, 'id'>): boolean {
  return Boolean(RUN_STARTER_CARD_BY_ID[card.id as RunStarterCardId]);
}

/**
 * How a card gallery bands its cards. A starter card is not for sale, so banding it by the
 * gold it is nominally worth files it beside cards a player could buy for that price and
 * implies a purchase that cannot happen. It gets its own band, ahead of every priced one.
 */
export type RunCardTier = number | 'starter';

/** Starter first, then ascending price. */
export function runCardTierRank(tier: RunCardTier): number {
  return tier === 'starter' ? -1 : tier;
}

export function runCardTierOf(card: Pick<RunCardDefinition, 'id' | 'value'>): RunCardTier {
  return isRunStarterCard(card) ? 'starter' : card.value;
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

export function createRunCardOffer(
  run: Pick<RunDocument, 'seed'>,
  card: RunCoreCard,
  battleIndex: number,
  slotIndex: number,
): RunCardOffer {
  void run.seed;
  return {
    ...card,
    pieces: [...card.pieces],
    formation: card.formation?.map((cell) => ({ ...cell })),
    offerId: `sectio-${battleIndex}-${slotIndex}-${card.id}`,
    cost: card.value,
  };
}

export function runCardRarityForRoll(roll: number): RunCardRarity {
  const normalized = Math.max(0, Math.min(99, Math.floor(roll)));
  if (normalized < RUN_CARD_RARITY_PERCENT.common) return 'common';
  if (normalized < RUN_CARD_RARITY_PERCENT.common + RUN_CARD_RARITY_PERCENT.uncommon) return 'uncommon';
  return 'rare';
}

/** Historical version-23-to-24 migration deal. This is not a live Sectio source. */
function legacySectioCardOffers(
  seed: number,
  battleIndex: number,
  offerCount: number,
  label: string,
  maximumValue = Number.POSITIVE_INFINITY,
): RunCardOffer[] {
  const chosen = new Set<string>();
  return Array.from({ length: offerCount }, (_, slotIndex) => {
    const rarityRoll = createRng(mixSeed(seed, `${label}:rarity`, slotIndex)).int(100);
    const rarity = runCardRarityForRoll(rarityRoll);
    const eligible = RUN_CARD_DECK.filter((card) => card.value <= maximumValue && !chosen.has(card.id));
    const tier = eligible.filter((card) => card.rarity === rarity);
    const candidates = tier.length ? tier : eligible;
    const card = shuffled(candidates, mixSeed(seed, `${label}:card`, slotIndex))[0];
    if (!card) throw new Error(`Historical Sectio has no eligible card for offer ${slotIndex + 1}.`);
    chosen.add(card.id);
    return createRunCardOffer({ seed }, card, battleIndex, slotIndex);
  });
}

function legacyOpeningSectioOffers(seed: number, offerCount: number): RunCardOffer[] {
  return legacySectioCardOffers(seed, -1, offerCount, 'opening-sectio', RUN_STARTING_GOLD)
    .map((offer, slotIndex) => ({ ...offer, offerId: `opening-${slotIndex}-${offer.id}` }));
}

/**
 * The market's cost ceiling for the Sectio that follows `battleIndex` -- zero-based, so the Sectio
 * after Battle 1 asks with zero. The opening market is bounded so early gold converts into cards
 * rather than banking behind a row nobody can afford; past that the ceiling lifts for good.
 */
export function runSectioCardMaxValue(battleIndex: number): number {
  return battleIndex < RUN_SECTIO_EARLY_CARD_BATTLE_COUNT
    ? RUN_SECTIO_EARLY_CARD_MAX_VALUE
    : Number.POSITIVE_INFINITY;
}

/**
 * How many pile seats each rarity owns under a cost ceiling. A ceiling that empties a tier hands
 * that tier's share to the ones still standing -- under six gold there is no Rare card in the
 * catalog at all, so the opening market is Common and Uncommon apportioned between themselves.
 * Seats are handed out by largest remainder, so a pile is always exactly its declared size.
 */
export function sectioPileRarityQuota(
  maxValue = Number.POSITIVE_INFINITY,
): Record<RunCardRarity, number> {
  const quota: Record<RunCardRarity, number> = { common: 0, uncommon: 0, rare: 0 };
  const present = RUN_CARD_RARITIES.filter((rarity) => RUN_CARD_DECK
    .some((card) => card.value <= maxValue && card.rarity === rarity));
  const declared = present.reduce((total, rarity) => total + RUN_CARD_RARITY_PERCENT[rarity], 0);
  if (!declared) return quota;
  const remainders = present.map((rarity) => {
    const exact = RUN_SECTIO_CARD_PILE_SIZE * RUN_CARD_RARITY_PERCENT[rarity] / declared;
    quota[rarity] = Math.floor(exact);
    return { rarity, remainder: exact - Math.floor(exact) };
  });
  let seats = RUN_SECTIO_CARD_PILE_SIZE - present.reduce((total, rarity) => total + quota[rarity], 0);
  for (const { rarity } of [...remainders].sort((left, right) => right.remainder - left.remainder)) {
    if (seats <= 0) break;
    quota[rarity] += 1;
    seats -= 1;
  }
  return quota;
}

/**
 * One seed-derived pile carrying the exact rarity quota, drawn from the cards a cost ceiling
 * leaves eligible and then shuffled together so the row order stays a surprise. Each rarity draws
 * from its own independently seeded shuffle; exhausting a pile builds the next one the same way.
 */
export function sectioCardPile(
  seed: number,
  pileIndex: number,
  maxValue = Number.POSITIVE_INFINITY,
): RunCoreCard[] {
  const epoch = Math.max(0, Math.floor(pileIndex));
  const quota = sectioPileRarityQuota(maxValue);
  const seats = RUN_CARD_RARITIES.flatMap((rarity) => {
    const pool = RUN_CARD_DECK.filter((card) => card.value <= maxValue && card.rarity === rarity);
    const drawn: RunCoreCard[] = [];
    // A tier smaller than its quota repeats identities rather than shrinking the pile; no live
    // ceiling reaches that, but a pile is defined by its size and must not silently lose seats.
    for (let pass = 0; pool.length && drawn.length < quota[rarity]; pass += 1) {
      drawn.push(...shuffled(pool, mixSeed(seed, `sectio-pile:${rarity}:${pass}`, epoch))
        .slice(0, quota[rarity] - drawn.length));
    }
    return drawn;
  });
  if (!seats.length) {
    throw new Error(`Sectio has no card at or below a cost of ${maxValue}.`);
  }
  return shuffled(seats, mixSeed(seed, 'sectio-pile:order', epoch));
}

/** The value band the Run's opening card grant draws from. Low enough that the grant is a
 * formation to solve rather than a finished answer, high enough to be more than a lone Pawn. */
export const RUN_OPENING_CARD_VALUE_MIN = 4;
export const RUN_OPENING_CARD_VALUE_MAX = 6;
export const RUN_OPENING_CARD_OFFER_COUNT = 3;

/** Every live offer card the opening grant may present, cheapest identity order. */
export function openingCardGrantPool(): RunCoreCard[] {
  return RUN_CARD_DECK.filter((card) => (
    card.value >= RUN_OPENING_CARD_VALUE_MIN && card.value <= RUN_OPENING_CARD_VALUE_MAX
  ));
}

/** The Run's opening card offers: distinct identities drawn from the band, fixed by seed. */
export function openingCardGrantOffers(seed: number): string[] {
  return shuffled(openingCardGrantPool(), mixSeed(seed, 'vacantia-opening-cards', 0))
    .slice(0, RUN_OPENING_CARD_OFFER_COUNT)
    .map((card) => card.id);
}

/**
 * The row a Sectio reveals. The cursor runs continuously, but the pile it indexes is the one the
 * Battle's own cost ceiling defines -- so when the ceiling lifts the Run reads a different pile at
 * the same cursor, and a card passed over while the market was capped can be offered again once it
 * is not. That is a market, not a draft: what the row guarantees is its own composition.
 */
export function sectioCardOffersAtCursor(
  seed: number,
  battleIndex: number,
  cursor: number,
  offerCount: number,
): RunCardOffer[] {
  const start = Math.max(0, Math.floor(cursor));
  const maxValue = runSectioCardMaxValue(battleIndex);
  const piles = new Map<number, RunCoreCard[]>();
  return Array.from({ length: offerCount }, (_, slotIndex) => {
    const absoluteIndex = start + slotIndex;
    const pileIndex = Math.floor(absoluteIndex / RUN_SECTIO_CARD_PILE_SIZE);
    const pileCursor = absoluteIndex % RUN_SECTIO_CARD_PILE_SIZE;
    let pile = piles.get(pileIndex);
    if (!pile) {
      pile = sectioCardPile(seed, pileIndex, maxValue);
      piles.set(pileIndex, pile);
    }
    const card = pile[pileCursor];
    if (!card) throw new Error(`Sectio pile has no card at cursor ${absoluteIndex}.`);
    return createRunCardOffer({ seed }, card, battleIndex, absoluteIndex);
  });
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
      source: 'king',
    },
    {
      id: 'run-pawn-a',
      name: runUnitName(seed, 'pawn', 0),
      type: 'pawn',
      number: 1,
      inspectionSeed: mixSeed(seed, 'run-unit-inspection:run-pawn-a'),
      source: 'starting',
    },
    {
      id: 'run-pawn-b',
      name: runUnitName(seed, 'pawn', 1),
      type: 'pawn',
      number: 2,
      inspectionSeed: mixSeed(seed, 'run-unit-inspection:run-pawn-b'),
      source: 'starting',
    },
  ];
}

function initialCards(seed: number): RunOwnedCard[] {
  void seed;
  return [
    {
      id: 'run-card-his-grace',
      coreId: 'his-grace',
      unitSeats: ['run-king', 'run-pawn-a', 'run-pawn-b'],
      acquiredAfterBattleIndex: 0,
    },
  ];
}

export function createRun(
  war: RunWarSnapshot,
  seed: number,
  ataraxiaTierOrNow: AtaraxiaTier | string = 0,
  nowOrOptions: string | Readonly<{ now?: string }> = new Date().toISOString(),
): RunDocument {
  const ataraxiaTier: AtaraxiaTier = 0;
  const options = typeof nowOrOptions === 'string' ? null : nowOrOptions;
  const createdAt = typeof ataraxiaTierOrNow === 'string'
    ? ataraxiaTierOrNow
    : typeof nowOrOptions === 'string'
      ? nowOrOptions
      : options?.now ?? new Date().toISOString();
  const run: RunDocument = {
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    id: freshRunId(),
    seed: seed >>> 0,
    ataraxiaTier,
    deploymentMode: 'arranged',
    updatedAt: createdAt,
    war,
    phase: 'deployment',
    battleIndex: 0,
    conflictIndex: 0,
    goldTenths: RUN_STARTING_GOLD_TENTHS,
    army: initialArmy(seed),
    cards: initialCards(seed),
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
    sectioCardCursor: 0,
    deployment: null,
    battleRuntime: null,
    aftermath: null,
    sectio: null,
    vacantia: null,
  };
  // A Conflict that ends in loot opens with Bona Vacantia. The Run's opening screen grants a
  // formation card rather than a lipsanon, so Battle 1 is arranged with something beyond His
  // Grace and teaches placement instead of demonstrating it with one fixed shape. Taking it
  // leads straight into Battle 1; a war with no loot Battles begins in Deployment immediately.
  if (conflictOpensWithVacantia(war, 0)) {
    return {
      ...run,
      phase: 'bona-vacantia',
      vacantia: {
        kind: 'opening',
        conflictIndex: 0,
        afterBattleIndex: 0,
        victoryGoldTenths: 0,
        offers: [],
        cardOffers: openingCardGrantOffers(seed),
      },
    };
  }
  return run;
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
  return army.map((unit) => ({ ...unit }));
}

function cloneCards(cards: readonly RunOwnedCard[]): RunOwnedCard[] {
  return cards.map((card) => ({
    ...card,
    unitSeats: [...card.unitSeats],
  }));
}

function repairRunCards(value: unknown): RunOwnedCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): RunOwnedCard[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const card = candidate as Record<string, unknown>;
    if (typeof card.id !== 'string' || typeof card.coreId !== 'string') return [];
    if (!runCardDefinition(card.coreId)) return [];
    const unitSeats = Array.isArray(card.unitSeats)
      ? card.unitSeats.filter((id): id is string | null => id === null || typeof id === 'string')
      : [];
    return [{
      id: card.id,
      coreId: card.coreId,
      unitSeats,
      acquiredAfterBattleIndex: Number.isSafeInteger(card.acquiredAfterBattleIndex)
        ? Math.max(0, Number(card.acquiredAfterBattleIndex))
        : 0,
    }];
  });
}

function repairRunCardOffers(value: unknown): RunCardOffer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): RunCardOffer[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const offer = candidate as Record<string, unknown>;
    const core = typeof offer.id === 'string' ? RUN_CARD_BY_ID[offer.id] : undefined;
    if (!core || typeof offer.offerId !== 'string') return [];
    return [{
      ...core,
      pieces: [...core.pieces],
      formation: core.formation?.map((cell) => ({ ...cell })),
      offerId: offer.offerId,
      cost: core.value,
    }];
  });
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
  const expunctedArmy = run.sectio?.expunctedCard?.units ?? [];
  const units = [...entryArmy, ...run.army, ...expunctedArmy];
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
    const source = unit.source;
    if (
      unit.number === number
      && unit.name === name
      && unit.inspectionSeed === inspectionSeed
      && unit.source === source
    ) return unit;
    changed = true;
    return {
      id: unit.id,
      name,
      type: unit.type,
      number,
      inspectionSeed,
      source,
    };
  });
  const army = rewriteArmy(run.army);
  let sectio = run.sectio;
  if (sectio) {
    const expunctedCard = sectio.expunctedCard
      ? { ...sectio.expunctedCard, units: rewriteArmy(sectio.expunctedCard.units) }
      : null;
    const entrySnapshot = sectio.entrySnapshot
      ? {
          ...sectio.entrySnapshot,
          army: rewriteArmy(sectio.entrySnapshot.army),
        }
      : sectio.entrySnapshot;
    if (
      expunctedCard !== sectio.expunctedCard
      || entrySnapshot !== sectio.entrySnapshot
    ) {
      sectio = { ...sectio, expunctedCard, entrySnapshot };
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
  if (raw.deploymentMode !== 'arranged') {
    throw new UnsupportedRunSaveError('This Run contains a retired Deployment mode.');
  }
  if (
    !raw.war
    || !Array.isArray(raw.war.battles)
    || raw.war.battles.some((battle) => !battle || !validateLevel(battle.level).ok)
  ) {
    throw new UnsupportedRunSaveError('This Run contains an unsupported Battle Level.');
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
  if (rawSectio && ('purchasedCardOfferIds' in rawSectio || 'soldUnits' in rawSectio || 'alienatedUnits' in rawSectio)) {
    throw new UnsupportedRunSaveError('This Run contains retired Sectio operation data. Start a new Run.');
  }
  if (rawSectio && 'kind' in rawSectio) {
    throw new UnsupportedRunSaveError('This Run contains a retired opening-Sectio marker.');
  }
  if (!Number.isSafeInteger(raw.sectioCardCursor) || raw.sectioCardCursor < 0) {
    throw new UnsupportedRunSaveError('This Run contains an invalid Sectio card cursor.');
  }
  const persistedUnits: unknown[] = [
    ...(Array.isArray(run.army) ? run.army : []),
    ...(Array.isArray(run.sectio?.expunctedCard?.units) ? run.sectio.expunctedCard.units : []),
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
  if (next.vacantia && !Array.isArray(next.vacantia.cardOffers)) {
    next = { ...next, vacantia: { ...next.vacantia, cardOffers: [] } };
  }
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
    nextCardSequence?: unknown;
  };
  const ataraxiaTier: AtaraxiaTier = 0;
  const cards = repairRunCards(stored.cards);
  const nextCardSequence = Number.isSafeInteger(stored.nextCardSequence) && Number(stored.nextCardSequence) > 0
    ? Number(stored.nextCardSequence)
    : cards.length + 1;
  let sectio = stored.sectio;
  if (sectio) {
    sectio = {
      ...sectio,
      cardOffers: repairRunCardOffers(sectio.cardOffers),
      ...(sectio.entrySnapshot
        ? {
            entrySnapshot: {
              ...sectio.entrySnapshot,
              cards: repairRunCards(sectio.entrySnapshot.cards),
            },
          }
        : {}),
    };
  }
  if (
    next.ataraxiaTier !== ataraxiaTier
    || JSON.stringify(next.cards) !== JSON.stringify(cards)
    || next.nextCardSequence !== nextCardSequence
    || next.sectio !== sectio
  ) {
    next = { ...next, ataraxiaTier, cards, nextCardSequence, sectio };
  }

  const identity = normalizedArmyIdentity(next);
  if (identity.changed) {
    next = {
      ...next,
      army: identity.army,
      sectio: identity.sectio,
      nextArmyUnitNumberByType: identity.nextArmyUnitNumberByType,
    };
  }
  if (
    next.phase === 'sectio'
    && next.sectio
    && (
      !next.sectio.entrySnapshot
      || next.sectio.expunctedCard === undefined
      || !Array.isArray(next.sectio.entrySnapshot.cards)
      || !Number.isSafeInteger(next.sectio.entrySnapshot.nextCardSequence)
    )
  ) {
    const paidLipsanonBought = next.sectio.paidLipsanonBought === true;
    next = {
      ...next,
      sectio: {
        ...next.sectio,
        expunctedCard: next.sectio.expunctedCard ?? null,
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
): Array<Record<string, unknown>> {
  const cards = Array.isArray(value) ? value.filter((card): card is Record<string, unknown> => (
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
        id: 'run-card-his-grace',
        coreId: 'his-grace',
        cardType: null,
        effectSeed: 0,
        effectTargetUnitId: null,
        unitIds: [kingId],
        lostUnitIds: [],
        cacochymicUnitId: null,
        acquiredAfterBattleIndex: 0,
      });
    }
  }
  if (!next.some((card) => card.coreId === 'front-lines')) {
    const pawnIds = army
      .filter((unit) => unit.source === 'starting' && unit.type === 'pawn' && typeof unit.id === 'string')
      .map((unit) => unit.id as string);
    next.splice(Math.min(1, next.length), 0, {
      id: 'run-card-front-lines',
      coreId: 'front-lines',
      cardType: null,
      effectSeed: 0,
      effectTargetUnitId: null,
      unitIds: pawnIds,
      lostUnitIds: [],
      cacochymicUnitId: null,
      acquiredAfterBattleIndex: 0,
    });
  }
  return next;
}

function migrateRunToStarterChartulary(stored: Record<string, unknown>): Record<string, unknown> {
  const army = migrateRunArmyToPrimogeniture(stored.army);
  const cards = migrateCardsToStarterChartulary(stored.cards, army);
  // Version 18 never persisted automatic destinations, so an in-flight Battle cannot be
  // represented truthfully in the exact version-19 formation. Return it to the deal boundary before
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
    runSaveVersion: RUN_SAVE_VERSION_EXPUNCTIO_SOURCE,
    phase: reenterDeployment ? 'deployment' : stored.phase,
    army,
    cards,
    deployment: null,
    ...(reenterDeployment ? { battleRuntime: null, aftermath: null } : {}),
    ...(sectio ? { sectio: migratedSectio } : {}),
  };
}

function migrateRunToExpunctio(stored: Record<string, unknown>): Record<string, unknown> {
  const sectio = stored.sectio && typeof stored.sectio === 'object' && !Array.isArray(stored.sectio)
    ? stored.sectio as Record<string, unknown>
    : null;
  const entrySnapshot = sectio?.entrySnapshot
    && typeof sectio.entrySnapshot === 'object'
    && !Array.isArray(sectio.entrySnapshot)
    ? sectio.entrySnapshot as Record<string, unknown>
    : null;
  const migratedSectio = sectio
    ? {
        ...sectio,
        expunctedCard: null,
        ...(entrySnapshot
          ? {
              entrySnapshot: {
                ...entrySnapshot,
                pestiferousLosses: Array.isArray(stored.pestiferousLosses)
                  ? stored.pestiferousLosses
                  : [],
              },
            }
          : {}),
      }
    : sectio;
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_CARD_ORDER_SOURCE,
    ...(sectio ? { sectio: migratedSectio } : {}),
  };
}

function migrateRunArmyUnitFromPrimogeniture(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const unit = value as Record<string, unknown>;
  if (!Array.isArray(unit.abilities)) return unit;
  return {
    ...unit,
    abilities: unit.abilities.filter((ability) => ability !== 'primogeniture'),
  };
}

function migrateRunArmyFromPrimogeniture(value: unknown): unknown {
  return Array.isArray(value) ? value.map(migrateRunArmyUnitFromPrimogeniture) : value;
}

function migrateRunCardToSeats(value: unknown, armyValue: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const card = value as Record<string, unknown>;
  const { unitIds: retiredUnitIds, ...current } = card;
  const unitIds = Array.isArray(retiredUnitIds)
    ? retiredUnitIds.filter((unitId): unitId is string => typeof unitId === 'string')
    : [];
  const definition = typeof card.coreId === 'string' ? runCardDefinition(card.coreId) : undefined;
  let unitSeats: Array<string | null> = [...unitIds];
  if (definition && unitIds.length < definition.pieces.length) {
    const unitTypeById = new Map(
      (Array.isArray(armyValue) ? armyValue : []).flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
        const unit = candidate as Record<string, unknown>;
        return typeof unit.id === 'string' && typeof unit.type === 'string'
          ? [[unit.id, unit.type] as const]
          : [];
      }),
    );
    const remaining = [...unitIds];
    unitSeats = definition.pieces.map((piece) => {
      const index = remaining.findIndex((unitId) => unitTypeById.get(unitId) === piece);
      return index < 0 ? null : remaining.splice(index, 1)[0];
    });
    // A malformed predecessor must not silently lose a still-attached unit. Normalization
    // will reject the fallback shape, but the migration itself remains lossless.
    if (remaining.length > 0) unitSeats = [...unitIds];
  }
  return {
    ...current,
    unitSeats,
  };
}

function migrateRunCardsToSeats(value: unknown, armyValue: unknown): unknown {
  return Array.isArray(value) ? value.map((card) => migrateRunCardToSeats(card, armyValue)) : value;
}

function migrateRunLossesFromPrimogeniture(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
    const loss = candidate as Record<string, unknown>;
    return { ...loss, unit: migrateRunArmyUnitFromPrimogeniture(loss.unit) };
  });
}

function migrateRunToCardOrder(stored: Record<string, unknown>): Record<string, unknown> {
  const sectio = stored.sectio && typeof stored.sectio === 'object' && !Array.isArray(stored.sectio)
    ? stored.sectio as Record<string, unknown>
    : null;
  const entrySnapshot = sectio?.entrySnapshot
    && typeof sectio.entrySnapshot === 'object'
    && !Array.isArray(sectio.entrySnapshot)
    ? sectio.entrySnapshot as Record<string, unknown>
    : null;
  const expunctedCard = sectio?.expunctedCard
    && typeof sectio.expunctedCard === 'object'
    && !Array.isArray(sectio.expunctedCard)
    ? sectio.expunctedCard as Record<string, unknown>
    : null;
  const migratedSectio = sectio
    ? {
        ...sectio,
        alienatedUnits: Array.isArray(sectio.alienatedUnits)
          ? sectio.alienatedUnits.map((candidate) => {
              if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
              const alienated = candidate as Record<string, unknown>;
              return { ...alienated, unit: migrateRunArmyUnitFromPrimogeniture(alienated.unit) };
            })
          : sectio.alienatedUnits,
        expunctedCard: expunctedCard
          ? {
              ...expunctedCard,
              card: migrateRunCardToSeats(expunctedCard.card, expunctedCard.units),
              units: migrateRunArmyFromPrimogeniture(expunctedCard.units),
            }
          : sectio.expunctedCard,
        entrySnapshot: entrySnapshot
          ? {
              ...entrySnapshot,
              army: migrateRunArmyFromPrimogeniture(entrySnapshot.army),
              cards: migrateRunCardsToSeats(entrySnapshot.cards, entrySnapshot.army),
              pestiferousLosses: migrateRunLossesFromPrimogeniture(entrySnapshot.pestiferousLosses),
            }
          : sectio.entrySnapshot,
      }
    : sectio;
  const reenterDeployment = stored.phase === 'deployment' || stored.phase === 'battle';
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_DEPLOYMENT_TRANSPORT_SOURCE,
    phase: reenterDeployment ? 'deployment' : stored.phase,
    army: migrateRunArmyFromPrimogeniture(stored.army),
    cards: migrateRunCardsToSeats(stored.cards, stored.army),
    pestiferousLosses: migrateRunLossesFromPrimogeniture(stored.pestiferousLosses),
    deployment: reenterDeployment ? null : stored.deployment,
    ...(reenterDeployment ? { battleRuntime: null, aftermath: null } : {}),
    ...(sectio ? { sectio: migratedSectio } : {}),
  };
}

function migrateRunToDeploymentTransport(stored: Record<string, unknown>): Record<string, unknown> {
  const deployment = stored.deployment
    && typeof stored.deployment === 'object'
    && !Array.isArray(stored.deployment)
    ? stored.deployment as Record<string, unknown>
    : null;
  let migratedDeployment: Record<string, unknown> | null = deployment;
  if (deployment) {
    const { mode: _retiredMode, ...current } = deployment;
    const stage = deployment.stage === 'dealing'
      ? 'awaiting-deal'
      : deployment.stage === 'pace'
        ? 'card'
        : deployment.stage;
    migratedDeployment = {
      ...current,
      transport: 'paused',
      stage,
    };
  }
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_LEVEL_FORMAT_SOURCE,
    ...(deployment ? { deployment: migratedDeployment } : {}),
  };
}

function migrateRunToCurrentLevelFormat(stored: Record<string, unknown>): Record<string, unknown> {
  const war = stored.war && typeof stored.war === 'object' && !Array.isArray(stored.war)
    ? stored.war as Record<string, unknown>
    : null;
  if (!war || !Array.isArray(war.battles)) throw new UnsupportedRunSaveError();
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_FORMATION_CARDS_SOURCE,
    war: {
      ...war,
      battles: war.battles.map((battle) => {
        if (!battle || typeof battle !== 'object' || Array.isArray(battle)) {
          throw new UnsupportedRunSaveError();
        }
        const record = battle as Record<string, unknown>;
        return { ...record, level: migrateLevelDocument(record.level) };
      }),
    },
  };
}

const CURRENT_LIPSANON_IDS = new Set<LipsanonId>(RUN_LIPSANA.map((lipsanon) => lipsanon.id));

function migratePlainRunUnit(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const {
    abilities: _retiredAbilities,
    modifiers: _retiredModifiers,
    ...unit
  } = value as Record<string, unknown>;
  return unit;
}

function migratePlainRunArmy(value: unknown): unknown {
  return Array.isArray(value) ? value.map(migratePlainRunUnit) : value;
}

function migratedOwnedCard(
  id: string,
  coreId: string,
  unitSeats: Array<string | null>,
  acquiredAfterBattleIndex: number,
): Record<string, unknown> {
  return { id, coreId, unitSeats, acquiredAfterBattleIndex };
}

/** Rewrite every predecessor card into the active formation catalog. Existing active shapes are
 * preserved; an old large composition becomes one plain single-piece card per surviving unit. */
function migrateOwnedFormationCards(value: unknown, armyValue: unknown): Record<string, unknown>[] {
  const cards = Array.isArray(value) ? value.filter((card): card is Record<string, unknown> => (
    Boolean(card && typeof card === 'object' && !Array.isArray(card))
  )) : [];
  const army = Array.isArray(armyValue)
    ? armyValue.filter((unit): unit is Record<string, unknown> => (
        Boolean(unit && typeof unit === 'object' && !Array.isArray(unit))
      ))
    : [];
  const typeById = new Map<string, RunArmyPieceType>(army.flatMap((unit) => (
    typeof unit.id === 'string'
      && (unit.type === 'king' || ADLECTIO_PIECE_ORDER.includes(unit.type as AdlectablePieceType))
      ? [[unit.id, unit.type as RunArmyPieceType]]
      : []
  )));
  const usedUnitIds = new Set<string>();
  const usedCardIds = new Set<string>();
  const result: Record<string, unknown>[] = [];
  const existingStarter = cards.find((card) => card.coreId === 'his-grace');
  const kingId = army.find((unit) => unit.type === 'king' && typeof unit.id === 'string')?.id as string | undefined;
  const pawnIds = army
    .filter((unit) => unit.type === 'pawn' && unit.source === 'starting' && typeof unit.id === 'string')
    .map((unit) => unit.id as string)
    .slice(0, 2);
  const starterId = typeof existingStarter?.id === 'string' ? existingStarter.id : 'run-card-his-grace';
  result.push(migratedOwnedCard(starterId, 'his-grace', [kingId ?? null, pawnIds[0] ?? null, pawnIds[1] ?? null], 0));
  usedCardIds.add(starterId);
  if (kingId) usedUnitIds.add(kingId);
  pawnIds.forEach((id) => usedUnitIds.add(id));

  const uniqueCardId = (preferred: string): string => {
    let id = preferred;
    let suffix = 2;
    while (usedCardIds.has(id)) id = `${preferred}-${suffix++}`;
    usedCardIds.add(id);
    return id;
  };
  const addSingle = (unitId: string, afterBattle: number): void => {
    const type = typeById.get(unitId);
    if (!type || type === 'king' || usedUnitIds.has(unitId)) return;
    usedUnitIds.add(unitId);
    result.push(migratedOwnedCard(
      uniqueCardId(`run-card-formation-${unitId}`),
      type === 'knight' ? 'k' : type[0],
      [unitId],
      afterBattle,
    ));
  };

  for (const card of cards) {
    if (card === existingStarter || card.coreId === 'front-lines') continue;
    const seats = Array.isArray(card.unitSeats)
      ? card.unitSeats.filter((unitId): unitId is string => typeof unitId === 'string' && !usedUnitIds.has(unitId))
      : [];
    const afterBattle = Number.isSafeInteger(card.acquiredAfterBattleIndex)
      ? Math.max(0, Number(card.acquiredAfterBattleIndex))
      : 0;
    const definition = typeof card.coreId === 'string' ? RUN_CARD_BY_ID[card.coreId] : undefined;
    if (
      definition
      && seats.length === definition.pieces.length
      && seats.every((unitId, index) => typeById.get(unitId) === definition.pieces[index])
    ) {
      const id = uniqueCardId(typeof card.id === 'string' ? card.id : `run-card-formation-${definition.id}`);
      seats.forEach((unitId) => usedUnitIds.add(unitId));
      result.push(migratedOwnedCard(id, definition.id, [...seats], afterBattle));
    } else {
      seats.forEach((unitId) => addSingle(unitId, afterBattle));
    }
  }
  for (const unitId of typeById.keys()) addSingle(unitId, 0);
  return result;
}

function retireLipsanonIds(value: unknown): unknown {
  return Array.isArray(value)
    ? value.filter((id): id is LipsanonId => typeof id === 'string' && CURRENT_LIPSANON_IDS.has(id as LipsanonId))
    : value;
}

function retireConflictPaidLipsana(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => (
    Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)
      && typeof (entry as Record<string, unknown>).lipsanonId === 'string'
      && CURRENT_LIPSANON_IDS.has((entry as Record<string, unknown>).lipsanonId as LipsanonId))
  )));
}

function migrateFormationSectio(
  value: unknown,
  stored: Record<string, unknown>,
  army: unknown,
  cards: Record<string, unknown>[],
  lipsana: unknown,
  seenLipsana: unknown,
  conflictPaidLipsana: unknown,
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const sectio = value as Record<string, unknown>;
  const seed = Number(stored.seed) >>> 0;
  const battleIndex = Number.isSafeInteger(stored.battleIndex) ? Number(stored.battleIndex) : 0;
  const offerCount = Array.isArray(lipsana) && lipsana.includes('quartermasters-ledger') ? 4 : RUN_SECTIO_CARD_OFFER_COUNT;
  const cardOffers = sectio.kind === 'opening'
    ? legacyOpeningSectioOffers(seed, offerCount)
    : legacySectioCardOffers(seed, battleIndex, offerCount, `post-battle-sectio:${battleIndex}`);
  const paidLipsanonOffer = typeof sectio.paidLipsanonOffer === 'string'
    && CURRENT_LIPSANON_IDS.has(sectio.paidLipsanonOffer as LipsanonId)
    ? sectio.paidLipsanonOffer
    : null;
  return {
    ...sectio,
    cardOffers,
    adlectedCardOfferIds: [],
    paidLipsanonOffer,
    paidLipsanonBought: paidLipsanonOffer === null ? false : sectio.paidLipsanonBought,
    alienatedUnits: [],
    expunctedCard: null,
    entrySnapshot: {
      goldTenths: stored.goldTenths,
      army,
      cards,
      lipsana,
      seenLipsana,
      conflictPaidLipsana,
      nextArmyUnitSequence: stored.nextArmyUnitSequence,
      nextArmyUnitNumberByType: stored.nextArmyUnitNumberByType,
      nextCardSequence: stored.nextCardSequence,
      paidLipsanonBought: paidLipsanonOffer === null ? false : sectio.paidLipsanonBought === true,
    },
  };
}

/** Version 24 installs positional cards as the only live card ruleset. Existing units and
 * material remain intact, while retired qualifiers, states, and their relics are neutralized.
 * A Battle is returned to Deployment so its new formation plan is derived honestly. */
function migrateRunToFormationCards(stored: Record<string, unknown>): Record<string, unknown> {
  const army = migratePlainRunArmy(stored.army);
  const cards = migrateOwnedFormationCards(stored.cards, army);
  const lipsana = retireLipsanonIds(stored.lipsana);
  let seenLipsana = retireLipsanonIds(stored.seenLipsana);
  const conflictPaidLipsana = retireConflictPaidLipsana(stored.conflictPaidLipsana);
  const reenterDeployment = stored.phase === 'battle' || stored.phase === 'deployment';
  const vacantia = stored.vacantia && typeof stored.vacantia === 'object' && !Array.isArray(stored.vacantia)
    ? stored.vacantia as Record<string, unknown>
    : null;
  let migratedVacantia = stored.vacantia;
  if (vacantia) {
    const existing = retireLipsanonIds(vacantia.offers);
    const held = new Set(Array.isArray(lipsana) ? lipsana : []);
    const active = Array.isArray(existing) ? [...existing] : [];
    const candidates = shuffled(
      RUN_LIPSANON_OFFER_POOL.map((entry) => entry.id).filter((id) => !held.has(id) && !active.includes(id)),
      mixSeed(Number(stored.seed) >>> 0, 'vacantia-formation-migration', Number(vacantia.conflictIndex) || 0),
    );
    const offers = [...active, ...candidates].slice(0, 3);
    seenLipsana = [...new Set([...(Array.isArray(seenLipsana) ? seenLipsana : []), ...offers])];
    migratedVacantia = { ...vacantia, offers };
  }
  const {
    pestiferousLosses: _retiredPestiferousLosses,
    ...current
  } = stored;
  return {
    ...current,
    runSaveVersion: RUN_SAVE_VERSION_SIDEWAYS_FORMATIONS_SOURCE,
    ataraxiaTier: 0,
    phase: reenterDeployment ? 'deployment' : stored.phase,
    army,
    cards,
    lipsana,
    seenLipsana,
    conflictPaidLipsana,
    deployment: reenterDeployment ? null : stored.deployment,
    ...(reenterDeployment ? { battleRuntime: null, aftermath: null } : {}),
    sectio: migrateFormationSectio(stored.sectio, stored, army, cards, lipsana, seenLipsana, conflictPaidLipsana),
    vacantia: migratedVacantia,
  };
}

/** Version 25 keeps every version-24 card identity and seat, but an in-flight random
 * destination plan cannot become a sideways-fall plan. Return that Battle to the deal
 * boundary so the new solver owns every persisted destination. */
function migrateRunToSidewaysFormations(stored: Record<string, unknown>): Record<string, unknown> {
  const reenterDeployment = stored.phase === 'battle' || stored.phase === 'deployment';
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_SECTIO_PILE_SOURCE,
    phase: reenterDeployment ? 'deployment' : stored.phase,
    deployment: reenterDeployment ? null : stored.deployment,
    ...(reenterDeployment ? { battleRuntime: null, aftermath: null } : {}),
  };
}

/** Version 26 removes the opening Sectio and installs the seed-derived hidden card pile.
 * Existing post-Battle offers remain exactly as saved; their first future deal begins at
 * cursor zero. An in-progress opening Sectio keeps every completed transaction and proceeds
 * directly to Battle 1's Deployment. */
function migrateRunToSectioPile(stored: Record<string, unknown>): Record<string, unknown> {
  const rawSectio = stored.sectio && typeof stored.sectio === 'object' && !Array.isArray(stored.sectio)
    ? stored.sectio as Record<string, unknown>
    : null;
  const openingSectio = stored.phase === 'sectio' && rawSectio?.kind === 'opening';
  let sectio = stored.sectio;
  if (rawSectio && !openingSectio) {
    const { kind: _retiredKind, ...currentSectio } = rawSectio;
    sectio = currentSectio;
  }
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_QUEEN_PAWN_FORMATIONS_SOURCE,
    phase: openingSectio ? 'deployment' : stored.phase,
    sectioCardCursor: 0,
    sectio: openingSectio ? null : sectio,
    ...(openingSectio ? {
      vacantia: null,
      deployment: null,
      battleRuntime: null,
      aftermath: null,
    } : {}),
  };
}

/** Version 27 admits every connected Queen + Pawn arrangement into the generated catalog.
 * Existing visible offers, held cards, and Deployment state keep their exact identities. The
 * hidden cursor restarts explicitly because its seed-derived future changed with the catalog. */
function migrateRunToQueenPawnFormations(stored: Record<string, unknown>): Record<string, unknown> {
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_IMMUTABLE_FORMATIONS_SOURCE,
    sectioCardCursor: 0,
  };
}

function currentLipsanonList(value: unknown): LipsanonId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is LipsanonId => (
    typeof id === 'string' && CURRENT_LIPSANON_IDS.has(id as LipsanonId)
  )))];
}

function refillCurrentLipsanonOffers(
  value: unknown,
  held: readonly LipsanonId[],
  count: number,
): LipsanonId[] {
  const active = currentLipsanonList(value).slice(0, count);
  const heldIds = new Set(held);
  const candidates = RUN_LIPSANON_OFFER_POOL
    .map((entry) => entry.id)
    .filter((id) => !heldIds.has(id) && !active.includes(id));
  return [...active, ...candidates].slice(0, count);
}

/** Version 28 retires every action that can remove one member from a held formation.
 * An in-progress Sectio returns to its exact entry snapshot so no partial Alienatio
 * transaction survives. The two lipsana that mutated individual units leave every
 * held/seen/offer collection, and in-flight Battle runtime drops its cash-out ledger. */
function migrateRunToImmutableFormations(stored: Record<string, unknown>): Record<string, unknown> {
  const rawSectio = stored.sectio && typeof stored.sectio === 'object' && !Array.isArray(stored.sectio)
    ? stored.sectio as Record<string, unknown>
    : null;
  const rawSnapshot = stored.phase === 'sectio'
    && rawSectio?.entrySnapshot
    && typeof rawSectio.entrySnapshot === 'object'
    && !Array.isArray(rawSectio.entrySnapshot)
    ? rawSectio.entrySnapshot as Record<string, unknown>
    : null;
  const restored = rawSnapshot ?? stored;
  const lipsana = currentLipsanonList(restored.lipsana);
  let seenLipsana = currentLipsanonList(restored.seenLipsana);
  let conflictPaidLipsana = retireConflictPaidLipsana(restored.conflictPaidLipsana) as RunDocument['conflictPaidLipsana'];
  const battleRuntime = stored.battleRuntime && typeof stored.battleRuntime === 'object' && !Array.isArray(stored.battleRuntime)
    ? (({ cashedOutUnitIds: _retiredCashOuts, ...runtime }) => runtime)(stored.battleRuntime as Record<string, unknown>)
    : stored.battleRuntime;

  let vacantia = stored.vacantia;
  if (vacantia && typeof vacantia === 'object' && !Array.isArray(vacantia)) {
    const current = vacantia as Record<string, unknown>;
    const offers = refillCurrentLipsanonOffers(
      current.offers,
      lipsana,
      3,
    );
    seenLipsana = [...new Set([...seenLipsana, ...offers])];
    vacantia = { ...current, offers };
  }

  let sectio: unknown = rawSectio;
  if (rawSectio) {
    const {
      alienatedUnits: _retiredAlienatedUnits,
      ...currentSectio
    } = rawSectio;
    let paidLipsanonOffer = typeof currentSectio.paidLipsanonOffer === 'string'
      && CURRENT_LIPSANON_IDS.has(currentSectio.paidLipsanonOffer as LipsanonId)
      ? currentSectio.paidLipsanonOffer as LipsanonId
      : null;
    let paidLipsanonBought = rawSnapshot?.paidLipsanonBought === true && paidLipsanonOffer !== null;
    const conflictKey = String(Number(currentSectio.conflictIndex) || 0);
    if (paidLipsanonOffer) {
      conflictPaidLipsana = {
        ...conflictPaidLipsana,
        [conflictKey]: { lipsanonId: paidLipsanonOffer, bought: paidLipsanonBought },
      };
      seenLipsana = [...new Set([...seenLipsana, paidLipsanonOffer])];
    } else {
      const { [conflictKey]: _retiredPaidOffer, ...remainingPaid } = conflictPaidLipsana;
      conflictPaidLipsana = remainingPaid;
    }
    const army = Array.isArray(restored.army) ? restored.army : stored.army;
    const cards = Array.isArray(restored.cards) ? restored.cards : stored.cards;
    const nextArmyUnitSequence = restored.nextArmyUnitSequence ?? stored.nextArmyUnitSequence;
    const nextArmyUnitNumberByType = restored.nextArmyUnitNumberByType ?? stored.nextArmyUnitNumberByType;
    const nextCardSequence = restored.nextCardSequence ?? stored.nextCardSequence;
    sectio = {
      ...currentSectio,
      adlectedCardOfferIds: [],
      paidLipsanonOffer,
      paidLipsanonBought,
      expunctedCard: null,
      entrySnapshot: {
        goldTenths: restored.goldTenths,
        army,
        cards,
        lipsana,
        seenLipsana,
        conflictPaidLipsana,
        nextArmyUnitSequence,
        nextArmyUnitNumberByType,
        nextCardSequence,
        paidLipsanonBought,
      },
    };
  }

  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_DEPLOYMENT_MODE_SOURCE,
    ...(rawSnapshot ? {
      goldTenths: restored.goldTenths,
      army: restored.army,
      cards: restored.cards,
      nextArmyUnitSequence: restored.nextArmyUnitSequence,
      nextArmyUnitNumberByType: restored.nextArmyUnitNumberByType,
      nextCardSequence: restored.nextCardSequence,
    } : {}),
    lipsana,
    seenLipsana,
    conflictPaidLipsana,
    battleRuntime,
    vacantia,
    sectio,
  };
}

/** Version 29 makes the placement rule a Run-owned choice. Every predecessor already used
 * automatic sideways settling, so naming that exact behavior preserves its current position. */
function migrateRunToDeploymentMode(stored: Record<string, unknown>): Record<string, unknown> {
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_PLAYER_FORMATIONS_SOURCE,
    deploymentMode: 'automatic',
  };
}

/** Version 30 makes direct formation arrangement the only Deployment rule and replaces the
 * rarity-quota pile with complete shuffled catalog epochs. An in-progress Deployment returns
 * to its deal boundary; a Battle already underway keeps its exact committed board. */
function migrateRunToPlayerFormations(stored: Record<string, unknown>): Record<string, unknown> {
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_ARRANGED_PILE_SOURCE,
    deploymentMode: 'arranged',
    sectioCardCursor: 0,
    deployment: stored.phase === 'deployment' ? null : stored.deployment,
  };
}

/**
 * Version 31 replaces the Run's opening lipsanon with a formation-card grant. Only a document
 * still sitting on the opening screen can be affected: it has no card offers, so it is dealt
 * the ones its own seed would have produced. Every later Bona Vacantia keeps its lipsana, and
 * a Run that already left the opening screen carries the lipsanon it took -- the grant is not
 * retroactive, and taking that lipsanon was a real choice that should stand.
 */
function migrateRunToOpeningCardGrant(stored: Record<string, unknown>): Record<string, unknown> {
  const vacantia = stored.vacantia && typeof stored.vacantia === 'object' && !Array.isArray(stored.vacantia)
    ? stored.vacantia as Record<string, unknown>
    : null;
  if (!vacantia) {
    return { ...stored, runSaveVersion: RUN_SAVE_VERSION_OPENING_CARD_GRANT_SOURCE };
  }
  const opening = vacantia.kind === 'opening';
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_OPENING_CARD_GRANT_SOURCE,
    vacantia: {
      ...vacantia,
      offers: opening ? [] : vacantia.offers,
      cardOffers: opening ? openingCardGrantOffers(Number(stored.seed) >>> 0) : [],
    },
  };
}

/**
 * Version 32 rebuilds the market. Rarity becomes a material band adjusted by footprint, piles
 * carry an exact rarity quota instead of a flat catalog shuffle, and the Sectios following the
 * first two Battles cap card cost at six.
 *
 * The pile sequence changed outright, so the hidden cursor restarts. A Sectio already open keeps
 * the row it is showing: those offers are a transaction the player is part-way through, and each
 * one re-reads its rarity from the live catalog on load, so the row relabels itself without being
 * redealt. Everything already bought, sold, or expuncted stands.
 */
function migrateRunToRarityBands(stored: Record<string, unknown>): Record<string, unknown> {
  return {
    ...stored,
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    sectioCardCursor: 0,
  };
}

/**
 * Advances every losslessly migratable predecessor through the declared save chain.
 * Version 16 first receives the version-marker rename from 17, version 17's Shop
 * vocabulary is rewritten into version 18's Sectio, Adlectio, and Alienatio vocabulary,
 * then version 18 receives starter cards and persisted deal state. Version 19 receives
 * Expunctio's once-per-Sectio record and reset-complete loss snapshot. Version 20 retires
 * Primogeniture and replaces shrinking card membership plus the independent unit shuffle
 * with stable card seats and card-ordered Deployment. Version 21 replaces the one-time
 * Deployment mode choice with an explicit deal boundary and persisted transport. Version 22
 * advances every embedded War Battle through the Level document chain. Version 23 then retires
 * unit abilities and installs authored formation cards. Version 24 expands that catalog and
 * resets in-flight placement plans for sideways settling. Version 25 removes the opening
 * Sectio and begins a seed-derived card pile. Version 26 then restarts that hidden sequence,
 * and Version 27 expands the Queen + Pawn formation catalog. Version 28 retires individual
 * formation mutation and its two dependent lipsana. Version 29 names automatic or arranged
 * Deployment as an immutable Run rule. Version 30 retires automatic placement, collapses
 * quarter-turn-equivalent offer identities, and deals complete random catalog shuffles.
 * Version 31 replaces the Run's opening lipsanon with a formation-card grant. Version 32 rebuilds
 * the card market on material bands adjusted by footprint, exact per-pile rarity quotas, and an
 * opening cost ceiling, restarting the hidden card sequence.
 * Older saves remain unsupported.
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
      runSaveVersion: RUN_SAVE_VERSION_STARTER_CHARTULARY_SOURCE,
      phase: stored.phase === 'shop' ? 'sectio' : stored.phase,
      army: migrateRunArmyAdlectioVocabulary(stored.army),
      pestiferousLosses,
      sectio: migrateRunSectioOperationsVocabulary(shop),
    };
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_STARTER_CHARTULARY_SOURCE) {
    stored = migrateRunToStarterChartulary(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_EXPUNCTIO_SOURCE) {
    stored = migrateRunToExpunctio(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_CARD_ORDER_SOURCE) {
    stored = migrateRunToCardOrder(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_DEPLOYMENT_TRANSPORT_SOURCE) {
    stored = migrateRunToDeploymentTransport(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_LEVEL_FORMAT_SOURCE) {
    stored = migrateRunToCurrentLevelFormat(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_FORMATION_CARDS_SOURCE) {
    stored = migrateRunToFormationCards(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_SIDEWAYS_FORMATIONS_SOURCE) {
    stored = migrateRunToSidewaysFormations(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_SECTIO_PILE_SOURCE) {
    stored = migrateRunToSectioPile(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_QUEEN_PAWN_FORMATIONS_SOURCE) {
    stored = migrateRunToQueenPawnFormations(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_IMMUTABLE_FORMATIONS_SOURCE) {
    stored = migrateRunToImmutableFormations(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_DEPLOYMENT_MODE_SOURCE) {
    stored = migrateRunToDeploymentMode(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_PLAYER_FORMATIONS_SOURCE) {
    stored = migrateRunToPlayerFormations(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_ARRANGED_PILE_SOURCE) {
    stored = migrateRunToOpeningCardGrant(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_OPENING_CARD_GRANT_SOURCE) {
    stored = migrateRunToRarityBands(stored);
  }
  return normalizeRunDocument(stored as unknown as RunDocument);
}

export function addArmyPieces(
  run: RunDocument,
  pieces: readonly AdlectablePieceType[],
  source: RunArmyUnit['source'],
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

/** One shared answer for every Sectio deal and the server-side persistence contract. */
export function runSectioCardOfferCount(run: Pick<RunDocument, 'lipsana'>): number {
  return run.lipsana.includes('quartermasters-ledger') ? 4 : RUN_SECTIO_CARD_OFFER_COUNT;
}

function availableLipsana(run: RunDocument): LipsanonId[] {
  const held = new Set(run.lipsana);
  const seen = new Set(run.seenLipsana);
  return RUN_LIPSANON_OFFER_POOL
    .filter((lipsanon) => (
      !held.has(lipsanon.id)
      && !seen.has(lipsanon.id)
      && (!lipsanon.requires || held.has(lipsanon.requires))
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

function freshDeploymentState(
  run: RunDocument,
  seed: number,
  dealtCardIds: readonly string[],
): RunDeploymentState {
  const cardsById = new Map(run.cards.map((card) => [card.id, card]));
  const dealtCards = dealtCardIds.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card ? [card] : [];
  });
  const dealtUnitIds = [...new Set(dealtCards.flatMap(runCardUnitIds))]
    .filter((unitId) => run.army.some((unit) => unit.id === unitId));
  const unavailableUnitIds = run.army
    .map((unit) => unit.id)
    .filter((unitId) => !dealtUnitIds.includes(unitId));
  return {
    battleIndex: run.battleIndex,
    seed,
    dealtCardIds: dealtCards.map((card) => card.id),
    deployingUnitIds: [...dealtUnitIds],
    unavailableUnitIds,
    capacityResolved: false,
    placements: {},
    formationPlans: {},
    activeCardIndex: 0,
    unitCursor: 0,
    discardCursor: 0,
    revealedCardIds: [],
    settlingUnitIds: [],
    transport: 'paused',
    stage: 'awaiting-deal',
    blockedUnitIds: [...unavailableUnitIds],
  };
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
    mixSeed(seed, 'deployment-cards'),
  );
  const dealCount = Math.max(1, 3 + run.conflictIndex);
  const dealtCardIds = [...(hisGrace ? [hisGrace] : []), ...ordinary]
    .slice(0, dealCount)
    .map((card) => card.id);
  return touch({
    ...run,
    deployment: freshDeploymentState(run, seed, dealtCardIds),
    battleRuntime: null,
  });
}

export function deploymentRerollCostTenths(run: RunDocument): number | null {
  if (run.phase === 'deployment') return null;
  if (run.phase === 'battle') return RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS;
  return null;
}

export function canRerollDeployment(run: RunDocument): boolean {
  const cost = deploymentRerollCostTenths(run);
  return cost !== null
    && run.deployment?.battleIndex === run.battleIndex
    && run.goldTenths >= cost;
}

/**
 * Pay to throw away every committed placement and replay the current combat's Deployment.
 * The combat deal and authored card-seat order stay fixed: this is a position reroll, not a
 * second chance to draw a different combat pool.
 */
export function rerollDeployment(run: RunDocument): RunDocument {
  const cost = deploymentRerollCostTenths(run);
  if (cost === null || !canRerollDeployment(run) || !run.deployment) return run;
  const mixedSeed = mixSeed(run.deployment.seed, 'deployment-reroll');
  const nextSeed = mixedSeed === run.deployment.seed ? (mixedSeed + 1) >>> 0 : mixedSeed;
  const fresh = freshDeploymentState(run, nextSeed, run.deployment.dealtCardIds);
  const deployment = run.phase === 'battle'
    ? {
        ...fresh,
        revealedCardIds: [...fresh.dealtCardIds],
        stage: 'arranging' as const,
      }
    : fresh;
  return touch({
    ...run,
    phase: 'deployment',
    goldTenths: run.goldTenths - cost,
    deployment,
    battleRuntime: null,
    aftermath: null,
  });
}

export function setDeploymentChoices(
  run: RunDocument,
  choices: Partial<Pick<RunDeploymentState,
    | 'placements'
    | 'formationPlans'
    | 'activeCardIndex'
    | 'unitCursor'
    | 'discardCursor'
    | 'revealedCardIds'
    | 'settlingUnitIds'
    | 'transport'
    | 'stage'
    | 'deployingUnitIds'
    | 'unavailableUnitIds'
    | 'capacityResolved'
    | 'blockedUnitIds'
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
      reinforcementSequence: 0,
    },
  });
}

export function canRestartBattle(run: RunDocument): boolean {
  return run.phase === 'battle'
    && Boolean(run.deployment)
    && run.goldTenths >= RUN_BATTLE_RETRY_COST_TENTHS;
}

export function restartBattle(run: RunDocument): RunDocument {
  if (!canRestartBattle(run) || !run.deployment) return run;
  return touch({
    ...run,
    goldTenths: run.goldTenths - RUN_BATTLE_RETRY_COST_TENTHS,
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
  };
}

function cloneRunBattleUndoArmy(army: readonly RunArmyUnit[]): RunArmyUnit[] {
  return cloneArmy(army);
}

function cloneRunBattleUndoCards(cards: readonly RunOwnedCard[]): RunOwnedCard[] {
  return cards.map((card) => ({
    ...card,
    unitSeats: [...card.unitSeats],
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
      && typeof unit.id === 'string',
    ));
  const cardsAreValid = Array.isArray(checkpoint.cards)
    && checkpoint.cards.every((card) => Boolean(
      card
      && typeof card === 'object'
      && Array.isArray(card.unitSeats),
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

/**
 * One en passant capture the player landed pays a bounty, in gold.
 *
 * It is paid the moment the capture commits rather than banked with the Battle's reward,
 * so the gold measure moves while the fight is still on -- the capture is the whole of the
 * reason, and a number that only appears two screens later does not read as one. That also
 * makes the Undo checkpoint the exact reversal: it restores the pre-move balance, so a
 * taken-back en passant takes its bounty back with it.
 *
 * Board law is untouched. The Run pays for what the pieces did; it does not change what
 * they may do (ADR-0193).
 */
export function payRunEnPassantBounty(run: RunDocument): RunDocument {
  if (run.phase !== 'battle' || !run.battleRuntime) return run;
  return touch({ ...run, goldTenths: run.goldTenths + RUN_EN_PASSANT_BOUNTY_TENTHS });
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
  if (!hasLipsanon(run, 'deployment-vehicle')) {
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
 * Gold a lipsanon pays the moment it is taken. Data rather than branches keeps immediate
 * acquisition effects in one exact table shared by every transition and persistence surface.
 */
export const RUN_LIPSANON_IMMEDIATE_GOLD: Readonly<Partial<Record<LipsanonId, number>>> = Object.freeze({
  'congressional-approval': 5,
  'occult-dagger': 10,
});

/** The gold these lipsana have already paid out, in tenths. */
export function lipsanonImmediateGoldTenths(lipsana: readonly LipsanonId[]): number {
  return lipsana.reduce((total, lipsanon) => total + (RUN_LIPSANON_IMMEDIATE_GOLD[lipsanon] ?? 0) * GOLD_SCALE, 0);
}

function immediateLipsanon(run: RunDocument, lipsanon: LipsanonId): RunDocument {
  let next = run;
  const payout = RUN_LIPSANON_IMMEDIATE_GOLD[lipsanon];
  if (payout) next = { ...next, goldTenths: next.goldTenths + payout * GOLD_SCALE };
  return next;
}

export function acquireLipsanon(run: RunDocument, lipsanon: LipsanonId): RunDocument {
  if (run.lipsana.includes(lipsanon)) return run;
  if (!CURRENT_LIPSANON_IDS.has(lipsanon)) return run;
  return touch(immediateLipsanon({ ...run, lipsana: [...run.lipsana, lipsanon] }, lipsanon));
}

/** Administrator-only caller helper. Authorization belongs to the server endpoint;
 * the Run model still owns the actual currency mutation and timestamp. */
export function grantGold(run: RunDocument, amountTenths: number): RunDocument {
  if (!Number.isSafeInteger(amountTenths) || amountTenths <= 0) return run;
  return touch({ ...run, goldTenths: run.goldTenths + amountTenths });
}

/**
 * What the Battle just fought pays out: its own reward, plus whatever a lipsanon adds on top
 * of it. Shared by the aftermath report and the transition that banks it, so the screen
 * cannot quote a number the Run then fails to pay.
 */
function cardsWithoutFallenUnit(cards: readonly RunOwnedCard[], unitId: string): RunOwnedCard[] {
  return cards.map((card) => {
    if (!card.unitSeats.includes(unitId)) return card;
    return {
      ...card,
      unitSeats: card.unitSeats.map((id) => id === unitId ? null : id),
    };
  });
}

/** Removes a casualty from the army and its original card seat. This remains a
 * Battle/craft primitive; voluntary individual-unit disposal is not a Run rule. */
export function removeUnitFromArmyAndCards(
  run: Pick<RunDocument, 'army' | 'cards'>,
  unitId: string,
): Pick<RunDocument, 'army' | 'cards'> {
  return {
    army: run.army.filter((candidate) => candidate.id !== unitId),
    cards: cardsWithoutFallenUnit(run.cards, unitId),
  };
}

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
    deployment: null,
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
  if (finalBattle) {
    return touch({ ...run, phase: 'victory', sectio: null, deployment: null, battleRuntime: null, aftermath: null });
  }
  const banked: RunDocument = {
    ...run,
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
        cardOffers: [],
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
  const cardCount = runSectioCardOfferCount(next);
  const cardOffers = sectioCardOffersAtCursor(
    next.seed,
    next.battleIndex,
    next.sectioCardCursor,
    cardCount,
  );
  next = { ...next, sectioCardCursor: next.sectioCardCursor + cardCount };
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
      afterBattleIndex: next.battleIndex,
      conflictIndex: next.conflictIndex,
      victoryGoldTenths,
      cardOffers,
      adlectedCardOfferIds: [],
      paidLipsanonOffer,
      paidLipsanonBought,
      expunctedCard: null,
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
  const card: RunOwnedCard = {
    id: `run-card-${run.nextCardSequence}`,
    coreId: offer.id,
    unitSeats: addedUnits.map((unit) => unit.id),
    acquiredAfterBattleIndex: run.sectio.afterBattleIndex,
  };
  const cards = [...run.cards, card];
  return touch({
    ...run,
    ...armyUpdate,
    army: armyUpdate.army,
    cards,
    nextCardSequence: run.nextCardSequence + 1,
    goldTenths: run.goldTenths - cost,
    sectio: {
      ...run.sectio,
      adlectedCardOfferIds: [...run.sectio.adlectedCardOfferIds, offerId],
    },
  });
}

/** The exact fee for striking a held card and its intact formation. */
export function cardExpunctioPriceTenths(
  card: RunOwnedCard,
  attachedUnits: readonly RunArmyUnit[],
): number | null {
  const definition = runCardDefinition(card.coreId);
  if (!definition) return null;
  return (
    definition.value
    + attachedUnits.reduce((total, unit) => total + PIECE_VALUE[unit.type], 0)
  ) * GOLD_SCALE;
}

export function performExpunctio(run: RunDocument, cardId: string): RunDocument {
  if (run.phase !== 'sectio' || !run.sectio || run.sectio.expunctedCard) return run;
  const card = run.cards.find((candidate) => candidate.id === cardId);
  if (!card) return run;
  const definition = runCardDefinition(card.coreId);
  if (!definition || ('removable' in definition && !definition.removable)) return run;
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  const attachedUnitIds = runCardUnitIds(card);
  const attachedUnits = attachedUnitIds.flatMap((unitId) => {
    const unit = armyById.get(unitId);
    return unit ? [unit] : [];
  });
  if (attachedUnits.length !== attachedUnitIds.length) return run;
  const priceTenths = cardExpunctioPriceTenths(card, attachedUnits);
  if (priceTenths === null || run.goldTenths < priceTenths) return run;
  const removedUnitIds = new Set(attachedUnitIds);
  const cards = run.cards.filter((candidate) => candidate.id !== card.id);
  const army = run.army.filter((unit) => !removedUnitIds.has(unit.id));
  return touch({
    ...run,
    goldTenths: run.goldTenths - priceTenths,
    army,
    cards,
    sectio: {
      ...run.sectio,
      expunctedCard: {
        card: cloneCards([card])[0],
        units: cloneArmy(attachedUnits),
        priceTenths,
      },
    },
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
      expunctedCard: null,
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
    || run.sectio.expunctedCard !== null
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
 * screen without one. The opening choice leads directly to Battle 1; later choices still
 * lead to the Sectio following the Battle that closed the prior Conflict.
 */
export function takeVacantiaLipsanon(run: RunDocument, lipsanon: LipsanonId): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia || !run.vacantia.offers.includes(lipsanon)) return run;
  const acquired = acquireLipsanon(run, lipsanon);
  if (acquired === run) return run;
  const vacantia = run.vacantia;
  const opened = vacantia.kind === 'opening'
    ? { ...acquired, phase: 'deployment' as const, vacantia: null, sectio: null }
    : openPostBattleSectio(acquired, vacantia.victoryGoldTenths);
  return touch(opened);
}

/**
 * Take the Run's opening formation card. Mandatory and free, exactly as the lipsanon it
 * replaced was: the grant is what the player carries into Battle 1 beside His Grace, and
 * taking it is what opens Deployment. It admits the card the same way Adlectio does, so the
 * units, seats, and card sequence are indistinguishable from a purchased formation.
 */
export function takeVacantiaCard(run: RunDocument, coreId: string): RunDocument {
  if (
    run.phase !== 'bona-vacantia'
    || run.vacantia?.kind !== 'opening'
    || !run.vacantia.cardOffers.includes(coreId)
  ) return run;
  // Deck lookup, not runCardDefinition: the grant is an offer card, and the starter
  // catalog it would also reach carries a King that no admission may add.
  const definition = RUN_CARD_BY_ID[coreId];
  if (!definition) return run;
  const { addedUnits, ...armyUpdate } = addArmyPieces(run, definition.pieces, 'adlectio');
  const card: RunOwnedCard = {
    id: `run-card-${run.nextCardSequence}`,
    coreId,
    unitSeats: addedUnits.map((unit) => unit.id),
    acquiredAfterBattleIndex: run.vacantia.afterBattleIndex,
  };
  return touch({
    ...run,
    ...armyUpdate,
    army: armyUpdate.army,
    cards: [...run.cards, card],
    nextCardSequence: run.nextCardSequence + 1,
    phase: 'deployment',
    vacantia: null,
    sectio: null,
  });
}

export function buyPaidLipsanon(run: RunDocument): RunDocument {
  if (run.phase !== 'sectio' || !run.sectio || !run.sectio.paidLipsanonOffer || run.sectio.paidLipsanonBought || run.goldTenths < 10 * GOLD_SCALE) return run;
  const acquired = acquireLipsanon(run, run.sectio.paidLipsanonOffer);
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
  const endedConflict = run.war.battles[run.sectio.afterBattleIndex]?.loot === true;
  return touch({
    ...run,
    phase: 'deployment',
    battleIndex: run.battleIndex + 1,
    conflictIndex: run.conflictIndex + (endedConflict ? 1 : 0),
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
