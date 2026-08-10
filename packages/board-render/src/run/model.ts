import {
  LEVEL_BATTLE_CARDS_DEALT_DEFAULT,
  levelBattleCardsDealt,
  validateLevel,
  type Level,
  type War,
} from '../core/level';
import { migrateLevelDocument } from '../core/levelMigration';
import type { PieceType, Vec } from '../core/types';
import {
  LIPSANON_BY_ID,
  RUN_LIPSANA,
  RUN_LIPSANON_OFFER_POOL,
  type LipsanonDefinition,
  type LipsanonId,
} from '../core/runLipsana';
import { spawnEventsForLevel } from '../core/levelEvents';
import { speedBonusTenths } from '../core/speedBonus';
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
export const CURRENT_RUN_SAVE_VERSION = 38;
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
const RUN_SAVE_VERSION_AUTHORED_DEAL_SOURCE = 33;
const RUN_SAVE_VERSION_KING_CHOICE_SOURCE = 34;
const RUN_SAVE_VERSION_COMMENDATIO_SOURCE = 35;
const RUN_SAVE_VERSION_DEDITIO_SOURCE = 36;
const RUN_SAVE_VERSION_RUN_RULES_SOURCE = 37;
const RUN_SAVE_VERSION_RARITY_BANDS_SOURCE = 32;
/**
 * How much gold one point of material value is worth (ADR-0547).
 *
 * Gold and material points are two different units and this is the only conversion between
 * them. A card costs its value, so a 3-point card costs 30 gold; a Battle pays half the enemy
 * force, so a Pawn on the board pays 5.
 *
 * READ THIS BEFORE TRUSTING A NAME: every identifier suffixed `Tenths` holds GOLD, whole and
 * exact, and is displayed unchanged. The suffix is left over from when gold was carried as
 * tenths of a smaller unit and divided by ten on the way to the screen. Nothing divides any
 * more -- the tenth IS the gold -- so the stored numbers never changed and no Run needed
 * migrating; only what the player reads off them did. A `Tenths` field renamed today would be a
 * document-shape change requiring a schema migration, which is the one thing that would make
 * this change unverifiable, so the names stay until a migration is being shipped anyway.
 */
export const GOLD_SCALE = 10;
/** The material the Run opens able to buy, in POINTS. `RUN_STARTING_GOLD_TENTHS` is that in gold. */
export const RUN_STARTING_GOLD = 8;
export const RUN_STARTING_GOLD_TENTHS = RUN_STARTING_GOLD * GOLD_SCALE;
export const RUN_BATTLE_RETRY_COST_TENTHS = 3 * GOLD_SCALE;
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
 * The cost ceiling the market opens under, and the number of Battles it survives -- six points of
 * material, sixty gold, for the Sectios that follow Battles 1 and 2, then no ceiling at all.
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
 * The rules a Run is created under and then bound to for its whole life.
 *
 * These change which cards the market can deal and what the player may do with one at placement,
 * so they cannot be a client preference: a Run dealt from the two-by-two pool has to keep dealing
 * from it across reload, resume and every later Battle. Immutable once the Run exists, like
 * Ataraxia beside it.
 *
 * The default is the mode the game steers players toward. The others exist to be played with.
 */
export type RunRules = Readonly<{
  /**
   * Longest side, in cells, of a formation the market may offer. Two is the shipped game: the
   * single, the domino, the L and the square. Four opens the straight runs and the tetrominoes.
   */
  cardSpan: 2 | 4;
  /**
   * How a card is priced.
   *
   * `material` charges a card its material and nothing else, which is what the game has always
   * done. `density` charges material WEIGHTED by concentration -- it does not price concentration
   * on its own, which would make one Pawn and four Pawns cost the same. The same material in
   * fewer cells costs more, because board space is the scarce thing and a Queen on one square is
   * not two Knights on two.
   */
  pricing: 'material' | 'density';
  /**
   * Whether the player may turn a formation when placing it. With it on, one card covers all four
   * quarter turns and facing is decided at the board; with it off, facing is whatever the card was
   * dealt with. This does not change which cards exist -- only what may be done with one.
   */
  mayRotate: boolean;
}>;

export const RUN_CARD_SPANS: readonly (2 | 4)[] = Object.freeze([2, 4]);

/**
 * What a new Run is created under unless the player chooses otherwise: the two-by-two catalog,
 * turnable at placement, priced by material weighted by density.
 *
 * Density is the default because board space is the scarce thing a formation game is played on:
 * the same material in fewer cells is worth more, and a market that cannot say so prices a Queen
 * on one square the same as two Knights on two. Flat material remains a mode, not the baseline.
 *
 * Two consequences to know rather than discover.
 *
 * The SHIPPED rarity rule is still the material band, and at a span of two that leaves six
 * distinct commons against sixteen pile seats -- so a pile fills those seats by repeating commons
 * rather than by shrinking. The mode is playable and the repetition is visible; it resolves when
 * the rarity rule moves, which is the open piece.
 *
 * The early-market ceiling is a VALUE ceiling (`runSectioCardMaxValue`), so under density an offer
 * at the ceiling may cost more than the ceiling reads. It still cannot outrun the opening purse:
 * the dearest card the six-value band admits is a lone Rook at six gold against a starting eight.
 */
export const DEFAULT_RUN_RULES: RunRules = Object.freeze({ cardSpan: 2, mayRotate: true, pricing: 'density' });

/**
 * What a Run written before rules existed was already playing: the wide catalog, turnable. NOT the
 * new default -- a Run mid-flight was dealt from the wide pool and is holding cards from it, and
 * narrowing its market now would leave it with formations its own market could no longer offer.
 */
export const LEGACY_RUN_RULES: RunRules = Object.freeze({ cardSpan: 4, mayRotate: true, pricing: 'material' });

/** The longest side of a formation, blind to which way round it was authored. */
export function formationSpan(formation: readonly RunCardFormationCell[] | undefined): number {
  if (!formation || formation.length === 0) return 1;
  const width = Math.max(...formation.map((cell) => cell.x)) - Math.min(...formation.map((cell) => cell.x)) + 1;
  const height = Math.max(...formation.map((cell) => cell.y)) - Math.min(...formation.map((cell) => cell.y)) + 1;
  return Math.max(width, height);
}

/** A Run's rules, defaulting a document written before they existed to the game it was playing. */
export function runRules(run: Pick<RunDocument, 'rules'> | { rules?: RunRules }): RunRules {
  return run.rules ?? LEGACY_RUN_RULES;
}

/**
 * What a card costs a Run playing under `rules`, in whole gold.
 *
 * The density curve is the studio's, at the game's scale rather than the studio's readable one:
 * the x10 there existed so prices read as 5 and 155 instead of 0.5 and 15.5, and gold here is
 * whole (ADR-0547). Same curve, same exponent, one tenth the scale.
 *
 * Floored at one, because a card the market gives away is not an offer.
 */
export function runCardCost(
  card: Pick<RunCoreCard, 'value' | 'formation' | 'pieces'>,
  rules: RunRules,
): number {
  if (rules.pricing === 'material') return card.value;
  const volume = card.formation?.length ?? card.pieces.length ?? 1;
  const density = volume === 0 ? 0 : card.value / volume;
  return Math.max(1, Math.round(card.value * (density / 3) ** 0.5));
}

/** Whether a card may be dealt to a Run playing under `rules`. */
export function cardAllowedByRules(card: Pick<RunCoreCard, 'formation'>, rules: RunRules): boolean {
  return formationSpan(card.formation) <= rules.cardSpan;
}

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

/**
 * How much the second prong of a royal fork must be worth for the Run to pay for it.
 *
 * Derived from the Rook rather than written as a bare 5, so the bar stays "a Rook or
 * better" if the scale above is ever re-weighted instead of quietly becoming some other
 * piece's worth.
 */
export const RUN_ROYAL_FORK_MIN_VICTIM_VALUE = PIECE_VALUE.rook;

// ---- Manubiae ---------------------------------------------------------------------------
//
// The Roman commander's cash share of what was taken in the field. Here: the things a Run
// pays a player for DOING on the board, as opposed to the Battle reward banked on the way
// out (ADR-0220) or a lipsanon paying on acquisition.
//
// Naming the category is what lets it grow. En passant (ADR-0517) and the royal fork
// (ADR-0527) each arrived as a bespoke constant and a bespoke pay function, and ADR-0527
// closed by saying a third would want a shared name before it wants its own machinery.
// This is that machinery: one catalog, one payment function, one notice shape. A new
// bounty is an entry in the table and a detection at the board seam — never a new path
// through the Run's economy.

export type ManubiumId =
  | 'advantageous-capture'
  | 'royal-fork'
  | 'discovered-check'
  | 'double-check'
  | 'en-passant'
  | 'smothered-mate';

export interface ManubiumDefinition {
  readonly id: ManubiumId;
  /** The name on the log line and the Enchiridion record. */
  readonly name: string;
  /** Exactly what the board must do to earn it, in one sentence, in player words. */
  readonly earnedBy: string;
  /** The fixed price in gold, or null when the award carries its own (see `marginPoints`). */
  readonly goldTenths: number | null;
  /** How the price reads when it is not one fixed number. */
  readonly priceNote?: string;
}

/**
 * What an advantageous capture pays per point of material margin.
 *
 * Scaled rather than flat because this is the one bounty in the category a player earns
 * constantly, and the same flat number would be either too much for a rook taking a queen
 * or too little for a pawn taking one. Two gold a point lands the whole ladder inside the
 * band the fixed bounties already occupy — 4 for a knight taking a rook, 16 for a pawn
 * taking a queen — and it is a whole number of gold, so no rounding rule is needed.
 */
export const RUN_ADVANTAGEOUS_CAPTURE_TENTHS_PER_POINT = 2;

/**
 * Every Manubium, cheapest first, which is also roughly rarest-last-to-first: the ladder
 * runs from what a competent player does several times a Battle to what they may never do.
 *
 * Prices follow the band ADR-0517 and ADR-0527 set between them. Fifty gold is "worth going
 * out of your way for, and you almost never can"; ten gold is "the Run noticing something
 * you were going to do anyway". Everything here is placed against those two poles.
 */
export const RUN_MANUBIAE: readonly ManubiumDefinition[] = Object.freeze([
  {
    id: 'advantageous-capture',
    name: 'Advantageous capture',
    earnedBy: 'Capture an enemy unit worth more than the unit that takes it. A unit is worth what it started as, so a promoted pawn is still a Pawn on both sides of that comparison.',
    goldTenths: null,
    priceNote: '2 gold for each point of material won',
  },
  {
    id: 'royal-fork',
    name: 'Royal fork',
    earnedBy: 'Attack the enemy King and a Rook or Queen with one unit, from the square it just moved to. The fork has to hold: taking that unit must cost the enemy more than the unit is worth.',
    goldTenths: GOLD_SCALE,
  },
  {
    id: 'discovered-check',
    name: 'Discovered check',
    earnedBy: 'Move one unit out of the way so that a different unit behind it gives check.',
    goldTenths: 2 * GOLD_SCALE,
  },
  {
    id: 'double-check',
    name: 'Double check',
    earnedBy: 'Give check with two units at once — the unit you move and the one it uncovers behind it. That is a discovered check as well, so this pays in its place rather than on top of it.',
    goldTenths: 3 * GOLD_SCALE,
  },
  {
    id: 'en-passant',
    name: 'En passant',
    earnedBy: 'Capture a Pawn in passing, on the square it stepped over.',
    goldTenths: 5 * GOLD_SCALE,
  },
  {
    id: 'smothered-mate',
    name: 'Smothered mate',
    earnedBy: 'Checkmate with a Knight while the enemy King is hemmed in on every side by its own men.',
    goldTenths: 5 * GOLD_SCALE,
  },
] as const);

export const RUN_MANUBIUM_BY_ID: Readonly<Record<ManubiumId, ManubiumDefinition>> = Object.freeze(
  Object.fromEntries(RUN_MANUBIAE.map((entry) => [entry.id, entry])) as Record<ManubiumId, ManubiumDefinition>,
);

/**
 * One earned Manubium, described rather than priced: a caller says what the board did and
 * the model says what that is worth. A caller cannot pay the wrong number because it never
 * names one.
 */
export type ManubiumAward =
  | { readonly id: 'advantageous-capture'; readonly marginPoints: number }
  | { readonly id: Exclude<ManubiumId, 'advantageous-capture'> };

/**
 * What a unit is worth when Manubiae compares two of them — what it STARTED as, never what
 * it promoted into.
 *
 * This is not a special case invented for the bounty. The Run roster has no promotion
 * concept at all: a pawn that queens on the board is a Pawn again in the next Battle,
 * because a Pawn is what was bought. Reading `promotedFrom` here keeps one meaning of
 * "worth" across the whole Run rather than letting a board minute mint a Queen nobody paid
 * for — on either side of the comparison.
 *
 * `null` for anything with no purchase price: obstacles, and the King, whose zero above is
 * a sentinel for "priceless, never bought" rather than a claim that it is worth nothing.
 * A null on either side means there is no margin to be had, not a margin of zero.
 */
export function manubiaeUnitWorth(
  piece: { readonly type: string; readonly promotedFrom?: string } | null | undefined,
): number | null {
  const started = piece?.promotedFrom ?? piece?.type;
  if (!started || started === 'king' || !Object.hasOwn(PIECE_VALUE, started)) return null;
  return PIECE_VALUE[started as RunArmyPieceType];
}

/** What an award pays, in gold. */
export function manubiumGoldTenths(award: ManubiumAward): number {
  if (award.id === 'advantageous-capture') {
    return Math.max(0, Math.round(award.marginPoints)) * RUN_ADVANTAGEOUS_CAPTURE_TENTHS_PER_POINT;
  }
  return RUN_MANUBIUM_BY_ID[award.id].goldTenths ?? 0;
}

// The two bounties that predate the category keep their names, derived from the catalog so
// the number lives in exactly one place. `verify:royal-fork` reads the second of these.
export const RUN_EN_PASSANT_BOUNTY_TENTHS = manubiumGoldTenths({ id: 'en-passant' });
export const RUN_ROYAL_FORK_BOUNTY_TENTHS = manubiumGoldTenths({ id: 'royal-fork' });

// ---- Deditio -----------------------------------------------------------------------------
//
// The surrender of a force that was still standing when its King fell. Every Battle is won by
// checkmate -- the win rule wants the enemy King CAPTURED, which legal-move generation never
// permits, so mate is the only ending a Battle has -- and until now the Run paid the same
// whether that mate came on move twelve against a whole army or on move sixty against a
// stripped King. The Battle's own reward is computed from the enemies the level FIELDS, not the
// ones the player took, so grinding the board down cost nothing and was strictly safer.
//
// Deditio is the price on that choice: what the enemy still had on the board when it gave in.
// It is the only reward here that a player can lose by playing longer, which is the whole
// point of it.

/**
 * What each point of enemy force still standing at the mate pays.
 *
 * Two gold a point is the same rate an advantageous capture pays per point of margin, which
 * is the internal consistency worth having: material won and material the player never had to
 * take are priced alike. Against a typical Battle -- an enemy force near sixteen points, paying
 * ninety gold -- mating with the army whole banks 32, about one card, and grinding to a bare
 * King banks nothing at all. That spread is the incentive; the floor is today's payout, so no
 * Run gets worse and only the ceiling moves.
 */
export const RUN_DEDITIO_TENTHS_PER_POINT = 2;

/** A board unit as Deditio reads it -- the same structural shape `manubiaeUnitWorth` prices. */
interface StandingForceUnit {
  readonly side: string;
  readonly alive: boolean;
  readonly type: string;
  readonly promotedFrom?: string;
}

/**
 * What the enemy still had on the board, in points.
 *
 * Priced through `manubiaeUnitWorth`, so this agrees with every other place the Run values a
 * unit: a promoted pawn counts as the Pawn it started as, and anything with no purchase price
 * -- the King, an obstacle -- counts for nothing. The King costing zero is what makes a
 * ground-down force score zero rather than one, which is exactly the reading intended.
 */
export function standingEnemyForceValue(pieces: readonly StandingForceUnit[]): number {
  return pieces.reduce(
    (total, piece) => total + (piece.alive && piece.side === 'enemy' ? manubiaeUnitWorth(piece) ?? 0 : 0),
    0,
  );
}

/** The whole enemy force a level fields, in points -- what a Battle nobody has fought yet
 * still has standing. The crafter places Battles rather than playing them, so this is the
 * honest default for one of its reports. */
export function levelEnemyForceValue(level: Level): number {
  return standingEnemyForceValue(
    level.layers.units.map((unit) => ({ side: unit.side, alive: true, type: unit.type })),
  );
}

/** What a surrender of `standingEnemyValue` points pays, in gold. */
export function deditioGoldTenths(standingEnemyValue: number): number {
  return Math.max(0, Math.round(standingEnemyValue)) * RUN_DEDITIO_TENTHS_PER_POINT;
}

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

export type RunStarterCardId =
  | 'sole-surviving-issue'
  | 'entered-without-objection'
  | 'his-grace'
  | 'household-roll'
  | 'staggered-muster'
  | 'muster-incomplete'
  | 'turning-stone'
  | 'called-to-the-bounds'
  | 'one-left-at-the-marker'
  | 'within-the-old-bounds'
  | 'witness-to-the-oath'
  | 'anointed-late'
  | 'the-anointing'
  | 'homage-withheld'
  | 'homage-done-mounted';

/** Starter-only Chartulary cards. They are never offered by Adlectio, but otherwise
 * participate in the Deployment deal exactly like every card the player holds.
 *
 * One of these is chosen before the Run exists (there is no Run without a King), so the whole
 * set is the opening decision rather than a fixed prologue. Every arrangement is its own King:
 * the same three units in a line and around a corner are different cards, because where the
 * crown stands in its own formation is the thing being picked. */
export interface RunStarterCard {
  id: RunStarterCardId;
  pieces: RunArmyPieceType[];
  artId?: string;
  formation?: RunCardFormationCell[];
  value: number;
  /**
   * Gold handed over with the card, to price a thin King against a fat one. Material cannot
   * balance these: a Pawn is 1 and a Knight is 3, so no King carrying a minor can ever cost the
   * same as one carrying only Pawns. Gold is the only lever with the granularity to close it.
   */
  goldBonusTenths: number;
  rarity: RunCardRarity;
  name: string;
  flavor: string;
  removable: boolean;
}

/** The material a King is topped up to. Every starter is worth 4 once its gold is counted. */
export const RUN_STARTER_GOLD_BASELINE_VALUE = 4;

function starterGoldBonusTenths(value: number): number {
  return Math.max(0, RUN_STARTER_GOLD_BASELINE_VALUE - value) * GOLD_SCALE;
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
export type RunPhase =
  | 'aftermath' | 'bona-vacantia' | 'commendatio' | 'deployment' | 'battle' | 'sectio' | 'victory';

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
  /**
   * Points of enemy force still standing at the mate, which Deditio is paid on.
   *
   * The FACT is stored rather than the gold, the way `elapsedMs` is stored rather than the
   * speed bonus: this screen and the Continue that banks it then price one number twice
   * instead of agreeing by luck. The board it was read off is gone by the time either asks.
   */
  standingEnemyValue: number;
  survivingUnitIds: string[];
  fallenUnits: RunAftermathFallenUnit[];
}

/** What the battlefield hands back when its Battle is won. */
export interface RunBattleReport {
  survivingUnitIds: readonly string[];
  turns: number;
  /** Points of enemy force alive on the committed final board (`standingEnemyForceValue`). */
  standingEnemyValue: number;
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
/**
 * Commendatio: the act of entering a lord's service, and the Run's opening screen. It asks whose
 * household you join and deals three Kings to choose between. It is NOT Bona Vacantia -- that is
 * the relic phase a Conflict opens with, later and repeatedly. They shared a state once and the
 * conflation was immediately confusing.
 */
export interface RunCommendatioState {
  /** Starter card ids, three of the fifteen, shuffled by the Run's own seed. */
  kingOffers: string[];
}

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
  /** The rules this Run was created under. Immutable for its life; see RunRules. */
  rules: RunRules;
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
  commendatio: RunCommendatioState | null;
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

/** One step along the rarity ladder, clamped at both ends. */
function stepRarity(rarity: RunCardRarity, steps: number): RunCardRarity {
  const index = RUN_CARD_RARITIES.indexOf(rarity) + steps;
  return RUN_CARD_RARITIES[Math.max(0, Math.min(RUN_CARD_RARITIES.length - 1, index))];
}

/**
 * Rarity is the market's ramp control, and it reads three things.
 *
 * Material value sets the band: Common through four, Uncommon at five and six, Rare above that.
 *
 * Footprint then adjusts it. The five awkward shapes pack badly enough that their material
 * overstates what they are worth on a board, so each drops one tier -- which is what puts genuinely
 * high-value cards in the Common pool without letting the Common pool hand out clean material.
 *
 * A Bishop then costs a band back, because material understates it. The player places every
 * formation by hand (ADR-0526), so they choose the square each Bishop lands on: any two Bishops
 * they own become the opposite-colour pair. The pair is assembled in the deployment band out of
 * whatever cards it came from, and every Bishop card is half of it. Card-local parity is therefore
 * not read at all -- it decides what one card's own two Bishops cover, never whether the player
 * ends the Run holding the pair, which is the thing rarity is pricing.
 *
 * The two adjustments cancel on an awkward shape carrying a Bishop, and that is the intended
 * reading rather than a coincidence: a Bishop is worth exactly the band a wasteful shape costs.
 */
export function runCardRarity(
  pieces: readonly AdlectablePieceType[],
  formation: readonly RunCardFormationCell[],
): RunCardRarity {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  const band: RunCardRarity = value <= RUN_CARD_COMMON_MAX_VALUE
    ? 'common'
    : value <= RUN_CARD_UNCOMMON_MAX_VALUE ? 'uncommon' : 'rare';
  const shaped = AWKWARD_CARD_FOOTPRINTS.has(rotationalFootprintId(formation))
    ? stepRarity(band, -1)
    : band;
  return pieces.includes('bishop') ? stepRarity(shaped, 1) : shaped;
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

const starter = (
  id: RunStarterCardId,
  pieces: RunArmyPieceType[],
  formation: RunCardFormationCell[],
  name: string,
  flavor: string,
): RunStarterCard => {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  return Object.freeze<RunStarterCard>({
    id,
    pieces,
    artId: `k-${id}`,
    formation,
    value,
    goldBonusTenths: starterGoldBonusTenths(value),
    rarity: 'common',
    name,
    flavor,
    removable: false,
  });
};

/**
 * The fifteen Kings, in ascending material. Each is a real administrative act, anchored for
 * authoring purposes to the monarch whose reign best attests it (docs/art/run-king-prompts-v2.json)
 * -- that name drives the illustration and never reaches the card face, exactly as the historical
 * anchors do. Pawn-free Kings are absent on purpose: K+N, K+B and K+NN cannot force mate against a
 * lone King, and Battle 1 is a lone King.
 *
 * No King is a straight run of four. That shape needs a deployment band with a four-long axis, which
 * is a harder demand on every authored Battle than the rest of the pool makes; the widest footprint
 * here is two by three. Retiring it also put the minors at exactly a third of the pool.
 */
export const RUN_STARTER_CARDS: readonly RunStarterCard[] = Object.freeze([
  starter('sole-surviving-issue', ['king', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }],
    'Sole Surviving Issue',
    'The inquest returned one name. It had not been a long inquest.'),
  starter('entered-without-objection', ['king', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
    'Entered Without Objection',
    'A space was ruled beneath the entry for objections. It reached the binder still empty.'),
  // His Grace keeps its authored bend. A straight line of three cannot be placed in the smallest
  // supported two-by-two deployment band in any rotation, and this is the card every Run that does
  // not choose otherwise begins holding, so its shape is load-bearing rather than decorative.
  starter('his-grace', ['king', 'pawn', 'pawn'],
    [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    'His Grace',
    'Two names stood before his. Neither was entered twice.'),
  starter('household-roll', ['king', 'pawn', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    'The Household Roll',
    'The same roll once served a household of forty. It is still ruled for forty.'),
  starter('staggered-muster', ['king', 'pawn', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    'Staggered Muster',
    'The muster was called for dawn. The clerk held the roll open until dark, then ruled it off where it stood.'),
  starter('muster-incomplete', ['pawn', 'king', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    'Muster Incomplete',
    'Absent men are written in the same ink as present ones. Only the column changes.'),
  starter('turning-stone', ['king', 'pawn', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 0 }],
    'The Turning Stone',
    'The stone marks a boundary older than the wall it leans on. Both are described as original.'),
  starter('called-to-the-bounds', ['king', 'pawn', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    'Called to the Bounds',
    'The parish walked its line once a year, so someone would still know it when the maps were gone.'),
  starter('one-left-at-the-marker', ['king', 'pawn', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
    'One Left at the Marker',
    'At each marker a boy was struck, so that he would remember the place. It was held to be a sound method.'),
  starter('within-the-old-bounds', ['pawn', 'king', 'pawn', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 0 }],
    'Within the Old Bounds',
    'The bank is older than the grant, the grant older than the survey. Only the survey can be produced.'),
  starter('witness-to-the-oath', ['king', 'bishop', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
    'Witness to the Oath',
    'The articles were read out, agreed to, and written down in the same afternoon. The agreeing is the only part anyone later disputed.'),
  starter('anointed-late', ['king', 'pawn', 'bishop'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
    'Anointed Late',
    'The oil does not spoil. Whether the delay had was not asked aloud.'),
  starter('the-anointing', ['bishop', 'king', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }],
    'The Anointing',
    'He went in behind the man who could make him king, and came out ahead of him.'),
  starter('homage-withheld', ['king', 'knight', 'pawn'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
    'Homage Withheld',
    'He came, and was counted as having come. Nothing else was written beside his name.'),
  starter('homage-done-mounted', ['king', 'pawn', 'knight'],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
    'Homage Done Mounted',
    'Homage is sworn kneeling and unarmed. What he swore from the saddle was entered under the same heading.'),
]);

/** The opening pick. Every starter is a King, and a Run cannot exist without one. */
export const RUN_KING_CARDS: readonly RunStarterCard[] = RUN_STARTER_CARDS;

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

/**
 * True for a card identity the Run begins holding rather than one Sectio can offer. Every King is
 * one of these (#850), so this is how the Run's own King card is picked out of a Chartulary --
 * by identity rather than by naming His Grace, which is only the default of fifteen.
 */
export function isRunStarterCardId(coreId: string): boolean {
  return Boolean(RUN_STARTER_CARD_BY_ID[coreId as RunStarterCardId]);
}

/** True for a card the Run begins holding rather than one Sectio can offer. */
export function isRunStarterCard(card: Pick<RunCardDefinition, 'id'>): boolean {
  return isRunStarterCardId(card.id);
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
  rules: RunRules = LEGACY_RUN_RULES,
): RunCardOffer {
  void run.seed;
  return {
    ...card,
    pieces: [...card.pieces],
    formation: card.formation?.map((cell) => ({ ...cell })),
    offerId: `sectio-${battleIndex}-${slotIndex}-${card.id}`,
    cost: runCardCost(card, rules),
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
 * that tier's share to the ones still standing. The live six-gold ceiling empties nothing: cheap
 * Bishop cards are Rare on material a first Battle can afford, so the opening market keeps its
 * whole ladder and only its prices are held down.
 * Seats are handed out by largest remainder, so a pile is always exactly its declared size.
 */
export function sectioPileRarityQuota(
  maxValue = Number.POSITIVE_INFINITY,
  rules: RunRules = LEGACY_RUN_RULES,
): Record<RunCardRarity, number> {
  const quota: Record<RunCardRarity, number> = { common: 0, uncommon: 0, rare: 0 };
  // A tier the Run's rules leave empty is not "present": its seats re-apportion to the tiers that
  // can actually fill them, exactly as a cost ceiling emptying a tier already does.
  const present = RUN_CARD_RARITIES.filter((rarity) => RUN_CARD_DECK
    .some((card) => card.value <= maxValue && card.rarity === rarity && cardAllowedByRules(card, rules)));
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
  rules: RunRules = LEGACY_RUN_RULES,
): RunCoreCard[] {
  const epoch = Math.max(0, Math.floor(pileIndex));
  const quota = sectioPileRarityQuota(maxValue, rules);
  const seats = RUN_CARD_RARITIES.flatMap((rarity) => {
    const pool = RUN_CARD_DECK.filter((card) => (
      card.value <= maxValue && card.rarity === rarity && cardAllowedByRules(card, rules)
    ));
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
/**
 * The Kings the opening screen deals, shuffled by the Run's own seed.
 *
 * The Run's rules bind the King as firmly as the market. A Run playing the two-by-two catalog
 * cannot open by handing the player a three-long or Z-shaped starter -- it would break the rule
 * on the very first card, before the market has offered anything, and that formation then sits in
 * the army for the whole Run.
 */
export function openingKingOffers(seed: number, rules: RunRules = LEGACY_RUN_RULES): string[] {
  const eligible = RUN_STARTER_CARDS.filter((card) => cardAllowedByRules(card, rules));
  if (!eligible.length) throw new Error('No King fits this Run’s formation rules.');
  return shuffled([...eligible], mixSeed(seed, 'vacantia-opening-kings', 0))
    .slice(0, RUN_OPENING_CARD_OFFER_COUNT)
    .map((card) => card.id);
}

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
  rules: RunRules = LEGACY_RUN_RULES,
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
      pile = sectioCardPile(seed, pileIndex, maxValue, rules);
      piles.set(pileIndex, pile);
    }
    const card = pile[pileCursor];
    if (!card) throw new Error(`Sectio pile has no card at cursor ${absoluteIndex}.`);
    return createRunCardOffer({ seed }, card, battleIndex, absoluteIndex, rules);
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
      // A Battle that does not say how many cards it deals is unfinished, not merely untuned:
      // there is no progression left to stand in for it. Refuse the War rather than start a Run
      // that cannot deal a hand when it reaches that Battle.
      if (typeof level.battle?.cardsDealt !== 'number') {
        throw new Error(`War ${war.name}: Battle level ${battle.levelId} does not author how many cards it deals.`);
      }
      return { level: structuredClone(level), loot: level.battle?.loot === true };
    });
  if (!battles.length) throw new Error(`War ${war.name} has no Battles.`);
  return { id: war.id, name: war.name, description: war.description, battles };
}

const STARTER_SEAT_SUFFIX = ['a', 'b', 'c', 'd'] as const;

/**
 * The unit ids a King's own formation seats, in seat order. Exported because the server verifies
 * the same seats when it accepts a saved Run, and fifteen Kings each seat a different roster
 * (#850): restating the ids there is what refused to save the fourteen that are not His Grace.
 */
export function starterFormationSeatIds(card: RunStarterCard): string[] {
  const seenByType = new Map<RunArmyPieceType, number>();
  return card.pieces.map((type) => {
    const index = seenByType.get(type) ?? 0;
    seenByType.set(type, index + 1);
    return type === 'king' ? 'run-king' : `run-${type}-${STARTER_SEAT_SUFFIX[index]}`;
  });
}

/**
 * The chosen King's own formation, built as units in seat order. The unit ids stay derived from
 * type and seat rather than from the card, so a Run's army reads the same whichever King opened
 * it and `run-king` remains the King's stable id everywhere downstream.
 */
function initialArmy(seed: number, card: RunStarterCard): RunArmyUnit[] {
  const seatIds = starterFormationSeatIds(card);
  const seenByType = new Map<RunArmyPieceType, number>();
  return card.pieces.map((type, seat) => {
    const index = seenByType.get(type) ?? 0;
    seenByType.set(type, index + 1);
    const id = seatIds[seat];
    return {
      id,
      name: runUnitName(seed, type, index),
      type,
      number: index + 1,
      inspectionSeed: mixSeed(seed, `run-unit-inspection:${id}`),
      source: type === 'king' ? 'king' : 'starting',
    } satisfies RunArmyUnit;
  });
}

function initialCards(card: RunStarterCard, army: readonly RunArmyUnit[]): RunOwnedCard[] {
  return [
    {
      id: `run-card-${card.id}`,
      coreId: card.id,
      unitSeats: army.map((unit) => unit.id),
      acquiredAfterBattleIndex: 0,
    },
  ];
}

function initialArmyNumbersFor(card: RunStarterCard): RunArmyNumberState {
  const numbers = initialArmyNumberState();
  for (const type of card.pieces) numbers[type] += 1;
  return numbers;
}

export interface RunCreateOptions {
  now?: string;
  /** The King this Run opens on. Defaults to His Grace, the Run's original starter. */
  kingId?: RunStarterCardId;
  /** Open on the King choice rather than starting one. Only the player-facing entry sets this. */
  chooseKing?: boolean;
  /** The rules to bind this Run to. Defaults to DEFAULT_RUN_RULES. */
  rules?: RunRules;
}

export function createRun(
  war: RunWarSnapshot,
  seed: number,
  ataraxiaTierOrNow: AtaraxiaTier | string | RunCreateOptions = 0,
  nowOrOptions: string | RunCreateOptions = new Date().toISOString(),
): RunDocument {
  const ataraxiaTier: AtaraxiaTier = 0;
  // Options are accepted in either trailing slot. The tier argument is vestigial (every Run is
  // tier 0), so `createRun(war, seed, { kingId })` is the call a reader expects to work.
  const options = typeof nowOrOptions === 'object' && nowOrOptions
    ? nowOrOptions
    : typeof ataraxiaTierOrNow === 'object' && ataraxiaTierOrNow
      ? ataraxiaTierOrNow
      : null;
  const createdAt = typeof ataraxiaTierOrNow === 'string'
    ? ataraxiaTierOrNow
    : typeof nowOrOptions === 'string'
      ? nowOrOptions
      : options?.now ?? new Date().toISOString();
  // The King is chosen on the Run's opening screen -- the same screen the formation-card grant
  // used, dealing Kings instead of the broader deck -- so a Run begins holding nothing and is
  // given its army by that choice. `kingId` skips the screen, for craft links and tests.
  const named = options?.kingId ? RUN_STARTER_CARD_BY_ID[options.kingId] : null;
  if (options?.kingId && !named) throw new Error(`createRun: ${String(options.kingId)} is not a King.`);
  const chooseKing = options?.chooseKing === true && !named;
  const king = named ?? RUN_STARTER_CARD_BY_ID['his-grace'];
  const army = initialArmy(seed, king);
  const base = {
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    id: freshRunId(),
    seed: seed >>> 0,
    ataraxiaTier,
    rules: options?.rules ?? DEFAULT_RUN_RULES,
    deploymentMode: 'arranged',
    updatedAt: createdAt,
    war,
    phase: 'deployment',
    battleIndex: 0,
    conflictIndex: 0,
    goldTenths: RUN_STARTING_GOLD_TENTHS + king.goldBonusTenths,
    army,
    cards: initialCards(king, army),
    lipsana: [],
    seenLipsana: [],
    conflictPaidLipsana: {},
    nextArmyUnitSequence: 1,
    nextArmyUnitNumberByType: initialArmyNumbersFor(king),
    nextCardSequence: 1,
    sectioCardCursor: 0,
    deployment: null,
    battleRuntime: null,
    aftermath: null,
    sectio: null,
    vacantia: null,
    commendatio: null,
  } satisfies RunDocument;
  // Only the player-facing entry asks for the choice. Craft links, the War editor and every test
  // name their King (or take the default) and get a Run that is already in Deployment.
  if (!chooseKing) return base;
  return {
    ...base,
    phase: 'commendatio',
    goldTenths: RUN_STARTING_GOLD_TENTHS,
    army: [],
    cards: [],
    nextArmyUnitNumberByType: initialArmyNumberState(),
    commendatio: { kingOffers: openingKingOffers(seed, options?.rules ?? DEFAULT_RUN_RULES) },
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
      // Keep the price the offer was DEALT at. A repair reconstructs a row the Run has already
      // been quoted, and re-deriving the cost here would silently re-price a live market -- which
      // was invisible while every Run priced by material and every re-derivation agreed.
      cost: typeof offer.cost === 'number' && Number.isFinite(offer.cost) && offer.cost >= 0
        ? offer.cost
        : core.value,
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
  // A report whose standing count is missing or nonsense surrendered nothing, which is the
  // reading that keeps Continue banking the total this screen already showed.
  if (next.aftermath && !(Number.isSafeInteger(next.aftermath.standingEnemyValue) && next.aftermath.standingEnemyValue >= 0)) {
    next = { ...next, aftermath: { ...next.aftermath, standingEnemyValue: 0 } };
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
    runSaveVersion: RUN_SAVE_VERSION_RARITY_BANDS_SOURCE,
    sectioCardCursor: 0,
  };
}

/**
 * Version 33 makes the Deployment deal a property of the Battle rather than of run progress.
 * Every embedded Battle level that predates the requirement receives the authoring default, so a
 * Run in flight keeps dealing a hand at every Battle it has left. It is a neutral replacement,
 * not a reconstruction: the progression this retires was `3 + conflictIndex`, so a Run deep into
 * a War will find its later Battles dealing fewer cards than it did yesterday. That is the
 * design change landing, and the alternative — baking one Run's progress into levels it merely
 * snapshotted — would make the same Battle deal differently for every player who reached it.
 */
function migrateRunToAuthoredDeal(stored: Record<string, unknown>): Record<string, unknown> {
  const war = stored.war && typeof stored.war === 'object' && !Array.isArray(stored.war)
    ? stored.war as Record<string, unknown>
    : null;
  const battles = Array.isArray(war?.battles) ? war.battles : null;
  if (!war || !battles) return { ...stored, runSaveVersion: RUN_SAVE_VERSION_AUTHORED_DEAL_SOURCE };
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_AUTHORED_DEAL_SOURCE,
    war: {
      ...war,
      battles: battles.map((entry) => {
        const battle = entry && typeof entry === 'object' && !Array.isArray(entry)
          ? entry as Record<string, unknown>
          : null;
        const level = battle?.level && typeof battle.level === 'object' && !Array.isArray(battle.level)
          ? battle.level as Record<string, unknown>
          : null;
        if (!battle || !level) return entry;
        const settings = level.battle && typeof level.battle === 'object' && !Array.isArray(level.battle)
          ? level.battle as Record<string, unknown>
          : {};
        if (typeof settings.cardsDealt === 'number') return entry;
        return {
          ...battle,
          level: { ...level, battle: { ...settings, cardsDealt: LEVEL_BATTLE_CARDS_DEALT_DEFAULT } },
        };
      }),
    },
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
 * opening cost ceiling, restarting the hidden card sequence. Version 33 retires the run-progress
 * Deployment deal and gives every embedded Battle level the authored count it now requires.
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
  if (stored.runSaveVersion === RUN_SAVE_VERSION_RARITY_BANDS_SOURCE) {
    stored = migrateRunToAuthoredDeal(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_AUTHORED_DEAL_SOURCE) {
    stored = migrateRunToKingChoice(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_KING_CHOICE_SOURCE) {
    stored = migrateRunToCommendatio(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_COMMENDATIO_SOURCE) {
    stored = migrateRunToDeditio(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_DEDITIO_SOURCE) {
    stored = migrateRunToRunRules(stored);
  }
  if (stored.runSaveVersion === RUN_SAVE_VERSION_RUN_RULES_SOURCE) {
    stored = migrateRunToCardPricing(stored);
  }
  return normalizeRunDocument(stored as unknown as RunDocument);
}

/**
 * The King became the opening decision, so the opening Bona Vacantia card grant that used to be
 * the Run's first screen no longer exists. A save parked on that screen has not taken its card
 * yet and there is nothing left to take it from, so it moves to the Deployment the grant used to
 * lead into. The army and the held King are already correct: the grant only ever added to them.
 * Mid-run Bona Vacantia (kind 'conflict') is untouched -- only the opening one is retired.
 */
function migrateRunToKingChoice(stored: Record<string, unknown>): Record<string, unknown> {
  const vacantia = stored.vacantia && typeof stored.vacantia === 'object' && !Array.isArray(stored.vacantia)
    ? stored.vacantia as Record<string, unknown>
    : null;
  const parkedOnOpeningGrant = stored.phase === 'bona-vacantia' && vacantia?.kind === 'opening';
  return {
    ...stored,
    runSaveVersion: RUN_SAVE_VERSION_KING_CHOICE_SOURCE,
    ...(parkedOnOpeningGrant ? { phase: 'deployment', vacantia: null } : {}),
  };
}

/**
 * Commendatio becomes its own phase. It had been riding Bona Vacantia, which is the RELIC phase a
 * Conflict opens with -- one state doing two unrelated jobs, and the conflation read immediately as
 * a bug. The previous migration already cleared every Run off the retired opening screen, so
 * nothing is in flight there and each Run simply gains the empty field.
 */
function migrateRunToCommendatio(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, runSaveVersion: RUN_SAVE_VERSION_COMMENDATIO_SOURCE, commendatio: null };
}

/**
 * The Battle report gains what the enemy still had standing when its King fell (ADR-0543).
 *
 * A Run parked on an aftermath earned its gold under the old rules and its `goldTenths` is
 * already settled, so the field arrives as the zero it truthfully was: that report was never
 * paid a Deditio, and Continue must bank exactly the total the screen has been showing. Every
 * Battle from here on reads its own count off the board.
 */
/**
 * Runs predate the rules that now bind them, so they take the game they were actually playing:
 * the wide catalog, turnable at placement. NOT the new default -- a Run mid-flight has already
 * been dealt cards from the wide pool and has them in hand, and narrowing its market now would
 * leave it holding formations its own market can no longer offer.
 */
function migrateRunToRunRules(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, runSaveVersion: RUN_SAVE_VERSION_RUN_RULES_SOURCE, rules: { ...LEGACY_RUN_RULES } };
}

/**
 * Pricing joins the Run's rules. Every Run written before it was paying material, and its offers
 * were priced that way when they were dealt -- so it keeps material, not the new option.
 */
function migrateRunToCardPricing(stored: Record<string, unknown>): Record<string, unknown> {
  const rules = stored.rules && typeof stored.rules === 'object' && !Array.isArray(stored.rules)
    ? stored.rules as Record<string, unknown>
    : { ...LEGACY_RUN_RULES };
  return {
    ...stored,
    runSaveVersion: CURRENT_RUN_SAVE_VERSION,
    rules: { ...rules, pricing: 'material' },
  };
}

function migrateRunToDeditio(stored: Record<string, unknown>): Record<string, unknown> {
  const aftermath = stored.aftermath && typeof stored.aftermath === 'object' && !Array.isArray(stored.aftermath)
    ? { ...stored.aftermath as Record<string, unknown>, standingEnemyValue: 0 }
    : stored.aftermath;
  return { ...stored, runSaveVersion: RUN_SAVE_VERSION_DEDITIO_SOURCE, aftermath };
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

/**
 * How many cards a Battle's Deployment deals — the count its own Level authors, and nothing else.
 * There is no run-side progression behind this: a War's authored counts are the whole curve, so
 * how large a force a board can be asked to hold is a property of the board.
 *
 * Every Battle that reaches here has one. `snapshotWar` refuses a War with an unauthored Battle,
 * `validateWarBattlePlayability` refuses to save one, and save version 33 wrote the default into
 * the Runs that predate the requirement. Reading and clamping the stored value is
 * `levelBattleCardsDealt`, shared with the Sectio readout that reports the count ahead of time;
 * what this adds is the Run's refusal to proceed without one.
 */
export function runDeploymentDealCount(
  run: Pick<RunDocument, 'war' | 'battleIndex'>,
): number {
  const level = run.war.battles[run.battleIndex]?.level;
  const dealt = level ? levelBattleCardsDealt(level) : null;
  if (dealt === null) {
    throw new Error(`Battle ${run.battleIndex + 1} does not author how many cards it deals.`);
  }
  return dealt;
}

export function prepareDeployment(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment') return run;
  if (run.deployment?.battleIndex === run.battleIndex) {
    return touch({ ...run, battleRuntime: null });
  }
  const seed = mixSeed(run.seed, 'deployment', run.battleIndex);
  // The Run's King card is always dealt, ahead of the shuffle: it seats the King, and a Battle
  // that did not deal it could not deploy him at all. Which card that is depends on the King the
  // Run opened on (#850), so it is found through the starter catalog -- naming His Grace left the
  // other fourteen Kings' cards to be shuffled in like any other and missed out of small deals.
  const kingCard = run.cards.find((card) => isRunStarterCardId(card.coreId));
  const ordinary = shuffled(
    run.cards.filter((card) => card.id !== kingCard?.id),
    mixSeed(seed, 'deployment-cards'),
  );
  const dealCount = runDeploymentDealCount(run);
  const dealtCardIds = [...(kingCard ? [kingCard] : []), ...ordinary]
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
 * Charge a checkpoint older than one just restored for the Undo that restoring it cost.
 *
 * A checkpoint records the purse the Battle held before its move, so it is a photograph of a
 * moment, not a running balance. Undoing back to it restores that photograph -- including
 * gold that has since been spent undoing everything in between, which would make the whole
 * walk back through a Battle cost the single gold of its last step. Every earlier checkpoint
 * therefore pays the price the moment it is passed over, and the purse it will restore stays
 * the one the player would really be holding there.
 *
 * The floor is the empty purse rather than a debt: a checkpoint too poor to buy its own Undo
 * is unreachable, and `canUndoRunBattleMove` already says so from the price alone. Letting it
 * go negative would say the same thing by making the checkpoint malformed instead.
 */
export function chargeRunBattleUndoCheckpoint(
  checkpoint: RunBattleUndoCheckpoint,
): RunBattleUndoCheckpoint {
  return {
    ...checkpoint,
    goldTenths: Math.max(0, checkpoint.goldTenths - RUN_BATTLE_UNDO_COST_TENTHS),
  };
}

/**
 * One thing the Run did to a live Battle, said in the words the Battle will use.
 *
 * The Run reaches into a running Battle to pay bounties and land Reservists -- changes the
 * board store makes no decision about and therefore cannot narrate on the Run's behalf. So
 * every such change hands one of these back, and it is not optional: the functions below
 * return the notice welded to the document they produce, and the transform that carries
 * them out can only return them together (see `RunBattleTransformResult` in the store).
 * A Run change the player is never told about is not a quieter feature, it is a missing
 * one -- so there is deliberately no way to make the change and drop the telling.
 *
 * `at` is the board cell it happened over, so the Battle can seat a notice there as well as
 * write the line. `goldTenths` is present exactly when the Run's economy moved.
 */
export interface RunBattleNotice {
  /** The Battle log line, already in log voice. */
  readonly log: string;
  /** Where on the board it happened. */
  readonly at: Vec;
  /** The signed gold delta, when this notice moved the economy. */
  readonly goldTenths?: number;
}

/** A Run document and the notice that accounts for how it got that way. */
export interface RunBattleChange {
  readonly run: RunDocument;
  readonly notice: RunBattleNotice;
}

/**
 * One Manubium the player earned on the board pays out, in gold.
 *
 * Paid the moment the move commits rather than banked with the Battle's reward, so the gold
 * measure moves while the fight is still on -- the move is the whole of the reason, and a
 * number that only appears two screens later does not read as one. That also makes the Undo
 * checkpoint the exact reversal: it predates the move, so taking the move back takes its
 * gold back with it, and no bounty is ever worth undoing for profit.
 *
 * Per earning, not per Battle: two of the same thing in one Battle pay twice. The enemy's
 * are never paid -- the earner is read off the committed board, so a Reservist or a promoted
 * pawn earns like any other player unit.
 *
 * Board law is untouched. The Run pays for what the pieces did; it does not change what they
 * may do (ADR-0193). A Skirmish or campaign level outside the Run economy pays nothing.
 *
 * `null` when this Run has no live Battle to be paid from, or when the award is worth
 * nothing. Otherwise the paid document arrives with its notice attached, because the gold
 * and the report of the gold are the same event (ADR-0525).
 */
export function payRunManubium(run: RunDocument, award: ManubiumAward, at: Vec): RunBattleChange | null {
  if (run.phase !== 'battle' || !run.battleRuntime) return null;
  const goldTenths = manubiumGoldTenths(award);
  if (goldTenths <= 0) return null;
  return {
    run: touch({ ...run, goldTenths: run.goldTenths + goldTenths }),
    notice: {
      log: `${RUN_MANUBIUM_BY_ID[award.id].name} — ${formatGold(goldTenths)} gold claimed.`,
      at: { x: at.x, y: at.y },
      goldTenths,
    },
  };
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

/**
 * A Reservist takes the field mid-Battle. Like the bounty, this is the Run adding something
 * to a board the player is watching, so it hands back the line that says so -- an extra unit
 * appearing out of an unannounced turn is exactly the kind of thing the log exists for.
 *
 * `null` when this unit is not a Reservist awaiting deployment.
 */
export function markReservistDeployed(run: RunDocument, unitId: string, at: Vec): RunBattleChange | null {
  if (!run.battleRuntime || !run.battleRuntime.reservistPoolUnitIds.includes(unitId)) return null;
  const unit = run.army.find((candidate) => candidate.id === unitId);
  return {
    run: touch({
      ...run,
      battleRuntime: {
        ...run.battleRuntime,
        reservistPoolUnitIds: run.battleRuntime.reservistPoolUnitIds.filter((id) => id !== unitId),
        deployedReservistUnitIds: [...run.battleRuntime.deployedReservistUnitIds, unitId],
      },
    }),
    notice: {
      log: `${unit ? `${unit.name} answers` : 'A Reservist answers'} the call and takes the field.`,
      at: { x: at.x, y: at.y },
    },
  };
}

/**
 * Gold a lipsanon pays the moment it is taken. Data rather than branches keeps immediate
 * acquisition effects in one exact table shared by every transition and persistence surface.
 */
export const RUN_LIPSANON_IMMEDIATE_GOLD: Readonly<Partial<Record<LipsanonId, number>>> = Object.freeze({
  'congressional-approval': 5,
  'occult-dagger': 10,
});

/** The gold these lipsana have already paid out. */
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
  // Holding one implies having seen it. The document invariant is that lipsana is a subset of
  // seenLipsana, and the offer pool draws on seenLipsana to avoid repeating itself — so a
  // lipsanon granted without passing through the offer that would have shown it still must not
  // come back around as a fresh offer. Along the ordinary path it is already seen and this is a
  // no-op; it is the granting callers that were leaving the document inconsistent.
  const seenLipsana = run.seenLipsana.includes(lipsanon)
    ? run.seenLipsana
    : [...run.seenLipsana, lipsanon];
  return touch(immediateLipsanon({ ...run, lipsana: [...run.lipsana, lipsanon], seenLipsana }, lipsanon));
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

/**
 * How long the Battle took, for the purpose of paying its speed bonus.
 *
 * Once the aftermath exists, its `elapsedMs` is the frozen answer and the ONLY one that may
 * be used: the player may sit on the report for a minute or an hour, and re-reading the wall
 * clock at Continue would bank a smaller bonus than the screen promised. Before then (the
 * final Battle, and the crafter's fast-forwarded ones) the live runtime is all there is.
 */
function battleElapsedMsForReward(run: RunDocument): number | null {
  if (run.phase === 'aftermath' && run.aftermath) return run.aftermath.elapsedMs;
  const startedAtMs = run.battleRuntime?.startedAtMs;
  return Number.isSafeInteger(startedAtMs) ? Math.max(0, Date.now() - (startedAtMs as number)) : null;
}

function battleRewardTenths(
  run: RunDocument,
  survivingUnitIds: readonly string[],
  standingEnemyValue: number,
  elapsedMs?: number | null,
): {
  victoryGoldTenths: number;
  bonusGoldTenths: number;
  speedGoldTenths: number;
  deditioGoldTenths: number;
} {
  const survivorSet = new Set(survivingUnitIds);
  const level = run.war.battles[run.battleIndex].level;
  return {
    victoryGoldTenths: battleVictoryGoldTenths(level),
    bonusGoldTenths: hasLipsanon(run, 'mercenarys-rifle')
      ? run.army.reduce((total, unit) => total + (survivorSet.has(unit.id) ? PIECE_VALUE[unit.type] : 0), 0)
      : 0,
    // Derived from the Battle's own level and elapsed time, so the aftermath screen can
    // re-derive the identical number without the persisted report carrying a field for it
    // (ADR-0539).
    speedGoldTenths: speedBonusTenths(level, elapsedMs === undefined ? battleElapsedMsForReward(run) : elapsedMs),
    // What the enemy still had standing when its King fell (ADR-0543). Priced from the report's
    // own count for the same reason the speed bonus is priced from its frozen clock: the board
    // is gone, and the screen and the banking must not read two different numbers.
    deditioGoldTenths: deditioGoldTenths(standingEnemyValue),
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
  if (run.battleIndex >= run.war.battles.length - 1) {
    return openSectio(run, report.survivingUnitIds, report.standingEnemyValue);
  }
  const startedAtMs = run.battleRuntime?.startedAtMs;
  // Read the wall clock ONCE and settle the report on it, so the elapsed time the screen
  // shows and the elapsed time the speed bonus is paid on are the same reading.
  const elapsedMs = Number.isSafeInteger(startedAtMs)
    ? Math.max(0, Date.now() - (startedAtMs as number))
    : null;
  const standingEnemyValue = Number.isSafeInteger(report.standingEnemyValue)
    ? Math.max(0, report.standingEnemyValue)
    : 0;
  const { victoryGoldTenths, bonusGoldTenths, speedGoldTenths, deditioGoldTenths: deditioTenths } =
    battleRewardTenths(run, report.survivingUnitIds, standingEnemyValue, elapsedMs);
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  return touch({
    ...run,
    phase: 'aftermath',
    deployment: null,
    aftermath: {
      battleIndex: run.battleIndex,
      turns: Number.isSafeInteger(report.turns) && report.turns > 0 ? report.turns : 0,
      elapsedMs,
      goldTenths: victoryGoldTenths + bonusGoldTenths + speedGoldTenths + deditioTenths,
      bonusGoldTenths,
      standingEnemyValue,
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
  return openSectio(run, run.aftermath.survivingUnitIds, run.aftermath.standingEnemyValue);
}

/**
 * `standingEnemyValue` defaults to nothing standing, which is what a Battle that was PLACED
 * rather than played has to report: the crafter fast-forwards through Battles nobody fought,
 * and a mate that never happened surrendered no army. A real victory always passes its own
 * count, from the report or from the aftermath that froze it.
 */
export function openSectio(
  run: RunDocument,
  survivingUnitIds: readonly string[],
  standingEnemyValue = 0,
): RunDocument {
  // Reachable from the Battle itself (the final one, and every fast-forwarded Battle the
  // crafter plays) and from the aftermath report the other Battles stop at.
  if (run.phase !== 'battle' && run.phase !== 'aftermath') return run;
  const finalBattle = run.battleIndex >= run.war.battles.length - 1;

  const { victoryGoldTenths, bonusGoldTenths: rifleTenths, speedGoldTenths, deditioGoldTenths: deditioTenths } =
    battleRewardTenths(run, survivingUnitIds, standingEnemyValue);
  if (finalBattle) {
    return touch({ ...run, phase: 'victory', sectio: null, deployment: null, battleRuntime: null, aftermath: null });
  }
  const banked: RunDocument = {
    ...run,
    goldTenths: run.goldTenths + victoryGoldTenths + rifleTenths + speedGoldTenths + deditioTenths,
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
    runRules(next),
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

/**
 * How many cards one Sectio admits. A visit is a CHOICE between the faces it dealt, not a
 * shopping list drawn against whatever gold the Run happens to be carrying: an army that can
 * buy the whole row outgrows its War in a Sectio or two, and every Battle after that is priced
 * for someone else. One is also what the visit's other two transactions already allow --
 * Expunctio strikes one card, the After-Hours Key sells one lipsanon -- so the card row stops
 * being the surface that behaves differently.
 *
 * Reset Sectio restores the whole visit, which is what keeps the single admission a decision
 * rather than a misclick.
 */
export const SECTIO_ADLECTIO_LIMIT = 1;

/**
 * Whether this Sectio's admission has been spent. The unbought offers stay on the table and
 * stay readable; they simply cannot be taken until Reset returns the visit to its entry.
 */
export function sectioAdlectioSpent(run: RunDocument): boolean {
  return (run.sectio?.adlectedCardOfferIds.length ?? 0) >= SECTIO_ADLECTIO_LIMIT;
}

export function performAdlectio(run: RunDocument, offerId: string): RunDocument {
  const offer = run.sectio?.cardOffers.find((candidate) => candidate.offerId === offerId);
  if (
    run.phase !== 'sectio'
    || !run.sectio
    || sectioAdlectioSpent(run)
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

/**
 * The cards THIS Sectio visit admitted: held (or already struck) now, absent from the snapshot the
 * visit was entered with. Reset Sectio takes back exactly these, so a surface that lists held cards
 * can say which ones the visit is still holding provisionally instead of leaving the player to
 * remember what was just bought. The struck card is included because it too was admitted this
 * visit — Expunctio shows that record alongside the cards still held.
 *
 * The entry snapshot is the authority rather than `acquiredAfterBattleIndex`, which numbers the
 * Sectio a card came from and cannot separate this visit's Adlectiones from what the visit opened
 * holding once a Run is crafted or migrated. An absent snapshot yields nothing: no Run holds zero
 * cards, so an empty one means the visit has no record to compare against, not that everything is
 * new.
 */
export function sectioAdmittedCardIds(run: RunDocument): ReadonlySet<string> {
  if (run.phase !== 'sectio' || !run.sectio) return new Set();
  const entryCards = run.sectio.entrySnapshot?.cards ?? [];
  if (entryCards.length === 0) return new Set();
  const entryCardIds = new Set(entryCards.map((card) => card.id));
  const struck = run.sectio.expunctedCard ? [run.sectio.expunctedCard.card] : [];
  return new Set(
    [...run.cards, ...struck]
      .filter((card) => !entryCardIds.has(card.id))
      .map((card) => card.id),
  );
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
/**
 * Entering a King's service. This is what gives the Run its army, its one held card and its
 * opening gold, so a Run genuinely cannot exist without the choice having been made.
 */
export function takeCommendatioKing(run: RunDocument, kingId: string): RunDocument {
  if (
    run.phase !== 'commendatio'
    || !run.commendatio?.kingOffers.includes(kingId)
  ) return run;
  const king = RUN_STARTER_CARD_BY_ID[kingId as RunStarterCardId];
  if (!king) return run;
  const army = initialArmy(run.seed, king);
  return touch({
    ...run,
    army,
    cards: initialCards(king, army),
    goldTenths: run.goldTenths + king.goldBonusTenths,
    nextArmyUnitNumberByType: initialArmyNumbersFor(king),
    phase: 'deployment',
    commendatio: null,
    vacantia: null,
    sectio: null,
  });
}

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

/**
 * The Battle a Sectio leads INTO. `battleIndex` still names the Battle just fought while the
 * Sectio is open — `leaveSectio` is what advances it — so any surface that reports the upcoming
 * Battle from the Sectio must ask here rather than reading `battleIndex` directly. A Sectio only
 * exists when a Battle follows it (winning the final Battle ends the War instead), so the clamp
 * guards a repaired document rather than an expected branch.
 */
export function sectioUpcomingBattleIndex(run: RunDocument): number {
  return Math.min(
    (run.sectio?.afterBattleIndex ?? run.battleIndex) + 1,
    run.war.battles.length - 1,
  );
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

/**
 * Gold as the player reads it. Whole numbers only: every price and every award in the Run is an
 * exact number of gold, so there is nothing here to round and no decimal point to print.
 */
export function formatGold(goldTenths: number): string {
  return String(Math.round(goldTenths));
}

/** What a card of `value` points costs, in gold — the price on its coin. */
export function cardCostGold(value: number): number {
  return value * GOLD_SCALE;
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
