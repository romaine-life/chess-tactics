// Craft an active Run directly into a named state so a Run screen can be reached by URL.
//
// Debugging and feature work constantly need "the Shop after Battle 3 with 25 gold and a Rook on
// offer". Playing there by hand is slow, and hand-authoring the document is worse: the server
// validator (validateActiveRunBody) cross-checks army/card membership, Plagued targets, offer
// pricing and the Shop entry snapshot, so a typed-out document is rejected far more often than it
// is accepted.
//
// So this module never authors state directly. It composes the SAME transitions the game plays —
// createRun → buyCard → leaveShop → prepareDeployment → beginBattle → openShop — and only then
// applies the requested overrides in the phase where each one is legal (army and lipsana before a
// Battle, offers and gold in the Shop that a real openShop() produced). What comes out is a
// document the game and the server both accept, because the game built it.
//
// The URL grammar lives here too, so links stay the shared contract between the owner and an agent.

import type { Level, War } from '../core/level';
import { createRng } from '../core/rng';
import {
  AGMINATE_COST,
  ADLECTED_COST,
  GOLD_SCALE,
  PIECE_VALUE,
  CACOCHYMIC_DISCOUNT,
  EUTACTIC_COST,
  RUN_CARD_BY_ID,
  LIPSANON_BY_ID,
  acquireLipsanon,
  addArmyPieces,
  beginBattle,
  buyCard,
  canLeaveShop,
  createRun,
  leaveShop,
  mixSeed,
  openShop,
  prepareDeployment,
  removeUnitFromArmyAndCards,
  seededPestiferousTarget,
  setDeploymentChoices,
  snapshotWar,
  takeVacantiaLipsanon,
  type AtaraxiaTier,
  type PurchasablePieceType,
  type RunAbility,
  type RunCardOffer,
  type RunCardType,
  type RunDocument,
  type LipsanonId,
  type RunWarSnapshot,
} from './model';
import {
  deploymentOptions,
  deploymentReady,
  selectedDeploymentLayout,
  type RunDeploymentLayout,
} from './deployment';

/** Every query parameter the crafter consumes. Stripped from the address once applied so the
 * Run screen keeps its own params (view) and a reload does not craft a second Run. */
export const RUN_CRAFT_PARAMS: readonly string[] = Object.freeze([
  'craft',
  'battle',
  'war',
  'seed',
  'tier',
  'gold',
  'army',
  'add',
  'offers',
  'cards',
  'loot',
  'paid',
  'lipsana',
]);

export const DEFAULT_CRAFT_SEED = 1337;

export type RunCraftPhase = 'bona-vacantia' | 'shop' | 'deployment' | 'battle' | 'victory';

export interface RunCraftCard {
  pieces: PurchasablePieceType[];
  cardType: RunCardType | null;
}

/** One crafted army unit. The URL grammar can only name a piece; a JSON spec can also grant the
 * abilities a unit would otherwise have earned from a card or a lipsanon. */
export interface RunCraftUnit {
  type: PurchasablePieceType;
  abilities: RunAbility[];
}

export interface RunCraftSpec {
  phase: RunCraftPhase;
  /** 1-based Battle number, matching the "Battle 2 / 4" the title bar shows. */
  battle: number;
  warId: string | null;
  seed: number;
  ataraxiaTier: AtaraxiaTier;
  goldTenths: number | null;
  army: RunCraftUnit[] | null;
  add: RunCraftUnit[] | null;
  offers: RunCraftCard[] | null;
  /** Cards the Run already HOLDS. Bought for real in the opening Shop and carried forward, so the
   * army, abilities, Plagued marks and card records are the ones the game itself writes. */
  cards: RunCraftCard[] | null;
  loot: LipsanonId[] | null;
  paidLipsanon: LipsanonId | null;
  lipsana: LipsanonId[] | null;
}

/** A spec the crafter refuses. The message is written for the person reading it on the screen. */
export class RunCraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunCraftError';
  }
}

const PIECE_ALIASES: Readonly<Record<string, PurchasablePieceType>> = Object.freeze({
  p: 'pawn',
  pawn: 'pawn',
  k: 'knight',
  n: 'knight',
  knight: 'knight',
  b: 'bishop',
  bishop: 'bishop',
  r: 'rook',
  rook: 'rook',
  q: 'queen',
  queen: 'queen',
});

/** Each card type answers to its qualifier, its granted state, and the retired words both
 * were called before ADR-0374, so craft links written under the old vocabulary keep
 * resolving. Every spelling lands on the same stored type. */
const CARD_TYPES: Readonly<Record<string, RunCardType | null>> = Object.freeze({
  plain: null,
  none: null,
  legatine: 'legatine',
  adlected: 'legatine',
  tactical: 'legatine',
  discipline: 'legatine',
  concinnous: 'concinnous',
  eutactic: 'concinnous',
  positioned: 'concinnous',
  pestiferous: 'pestiferous',
  plagued: 'pestiferous',
  hieratic: 'hieratic',
  agminate: 'hieratic',
});

const CRAFT_PHASES: readonly RunCraftPhase[] = ['bona-vacantia', 'shop', 'deployment', 'battle', 'victory'];

function pieceList(raw: string, label: string): PurchasablePieceType[] {
  const pieces: PurchasablePieceType[] = [];
  for (const token of raw.split(/[,+\s]+/).filter(Boolean)) {
    const named = PIECE_ALIASES[token.toLowerCase()];
    if (named) {
      pieces.push(named);
      continue;
    }
    // A bare deck id such as "ppk" is the same list written the way the card deck spells it.
    const letters = [...token.toLowerCase()].map((letter) => PIECE_ALIASES[letter]);
    if (letters.some((piece) => !piece)) {
      throw new RunCraftError(
        `craft ${label}: "${token}" is not a piece. Use pawn, knight, bishop, rook or queen (p/k/b/r/q).`,
      );
    }
    pieces.push(...(letters as PurchasablePieceType[]));
  }
  if (!pieces.length) throw new RunCraftError(`craft ${label}: no pieces were listed.`);
  return pieces;
}

/** The deck already holds every legal multiset worth 1-9 gold, so a crafted card is always a real
 * core card — looked up, never synthesized, so card art and names resolve like any other card. */
export function craftCoreCardId(pieces: readonly PurchasablePieceType[]): string {
  const order: readonly PurchasablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
  return [...pieces]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((piece) => piece[0])
    .join('');
}

function cardSpec(raw: string): RunCraftCard {
  const [piecesPart, typePart, ...extra] = raw.split(':');
  if (extra.length) throw new RunCraftError(`craft offers: "${raw}" has more than one ":" card type.`);
  const pieces = pieceList(piecesPart, 'offers');
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  if (!RUN_CARD_BY_ID[craftCoreCardId(pieces)]) {
    throw new RunCraftError(
      `craft offers: "${raw}" is worth ${value} gold; a Shop card must be worth 1-9 gold.`,
    );
  }
  if (typePart === undefined) return { pieces, cardType: null };
  const key = typePart.toLowerCase();
  if (!(key in CARD_TYPES)) {
    throw new RunCraftError(
      `craft offers: "${typePart}" is not a card type. Use legatine, concinnous, pestiferous, hieratic or plain.`,
    );
  }
  return { pieces, cardType: CARD_TYPES[key] };
}

function lipsanonList(raw: string, label: string): LipsanonId[] {
  return raw.split(',').map((token) => token.trim()).filter(Boolean).map((id) => {
    if (!LIPSANON_BY_ID[id as LipsanonId]) throw new RunCraftError(`craft ${label}: "${id}" is not a lipsanon id.`);
    return id as LipsanonId;
  });
}

function integer(raw: string, label: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RunCraftError(`craft ${label}: "${raw}" must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/** Read a craft spec out of a Run address. Returns null when the address asks for no crafting. */
export function parseRunCraftSpec(search: string): RunCraftSpec | null {
  const params = new URLSearchParams(search);
  const phase = params.get('craft');
  if (!phase) return null;
  if (!CRAFT_PHASES.includes(phase as RunCraftPhase)) {
    throw new RunCraftError(`craft: "${phase}" is not a Run phase. Use ${CRAFT_PHASES.join(', ')}.`);
  }
  const goldRaw = params.get('gold');
  const goldTenths = goldRaw === null ? null : Math.round(Number(goldRaw) * GOLD_SCALE);
  if (goldRaw !== null && (!Number.isSafeInteger(goldTenths) || (goldTenths as number) < 0)) {
    throw new RunCraftError(`craft gold: "${goldRaw}" must be a gold amount of 0 or more.`);
  }
  const offers = params.get('offers');
  const cards = params.get('cards');
  const army = params.get('army');
  const add = params.get('add');
  const loot = params.get('loot');
  const paid = params.get('paid');
  const lipsana = params.get('lipsana');
  return {
    phase: phase as RunCraftPhase,
    battle: params.get('battle') === null ? 1 : integer(params.get('battle')!, 'battle', 1, 100),
    warId: params.get('war'),
    seed: params.get('seed') === null ? DEFAULT_CRAFT_SEED : integer(params.get('seed')!, 'seed', 0, 0xffffffff),
    ataraxiaTier: (params.get('tier') === null ? 0 : integer(params.get('tier')!, 'tier', 0, 1)) as AtaraxiaTier,
    goldTenths,
    army: army === null ? null : craftUnits(pieceList(army, 'army')),
    add: add === null ? null : craftUnits(pieceList(add, 'add')),
    offers: offers === null ? null : offers.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec),
    cards: cards === null ? null : cards.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec),
    loot: loot === null ? null : lipsanonList(loot, 'loot'),
    paidLipsanon: paid === null ? null : lipsanonList(paid, 'paid')[0] ?? null,
    lipsana: lipsana === null ? null : lipsanonList(lipsana, 'lipsana'),
  };
}


/** A crafted ability may be written by its name or by its stored value (ADR-0374). The
 * refusal message quotes the names, since those are what the game says out loud. */
const RUN_ABILITY_ALIASES: Readonly<Record<string, RunAbility>> = Object.freeze({
  adlected: 'adlected',
  discipline: 'adlected',
  eutactic: 'eutactic',
  positioned: 'eutactic',
  agminate: 'agminate',
  marshalled: 'agminate',
});

const RUN_ABILITY_NAMES = ['adlected', 'eutactic', 'agminate'] as const;

function craftUnitList(raw: unknown, label: string): RunCraftUnit[] {
  if (typeof raw === 'string') return craftUnits(pieceList(raw, label));
  if (!Array.isArray(raw)) throw new RunCraftError(`craft ${label}: expected a list of units.`);
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      const pieces = pieceList(entry, label);
      if (pieces.length !== 1) throw new RunCraftError(`craft ${label}: "${entry}" names more than one unit.`);
      return { type: pieces[0], abilities: [] };
    }
    if (!entry || typeof entry !== 'object') throw new RunCraftError(`craft ${label}: expected a piece name or a unit object.`);
    const unit = entry as { type?: unknown; abilities?: unknown };
    const pieces = pieceList(String(unit.type ?? ''), label);
    if (pieces.length !== 1) throw new RunCraftError(`craft ${label}: "${String(unit.type)}" names more than one unit.`);
    const abilities = unit.abilities === undefined ? [] : unit.abilities;
    if (!Array.isArray(abilities)) throw new RunCraftError(`craft ${label}: abilities must be a list.`);
    const resolved: RunAbility[] = [];
    for (const ability of abilities) {
      const named = typeof ability === 'string' ? RUN_ABILITY_ALIASES[ability.toLowerCase()] : undefined;
      if (!named) {
        throw new RunCraftError(`craft ${label}: "${String(ability)}" is not an ability. Use ${RUN_ABILITY_NAMES.join(', ')}.`);
      }
      resolved.push(named);
    }
    return { type: pieces[0], abilities: resolved };
  });
}

function lipsanonIdList(raw: unknown, label: string): LipsanonId[] {
  if (typeof raw === 'string') return lipsanonList(raw, label);
  if (!Array.isArray(raw)) throw new RunCraftError(`craft ${label}: expected a list of lipsanon ids.`);
  return lipsanonList(raw.map((id) => String(id)).join(','), label);
}

function jsonInteger(raw: unknown, label: string, min: number, max: number): number {
  return integer(String(raw), label, min, max);
}

/**
 * Read a craft spec out of a request body. Same crafter, richer surface than the address grammar:
 * a JSON spec can carry structured units with abilities and card offers as objects, with no URL
 * length to work around. Every unknown field is refused rather than silently ignored, so a typo in
 * an agent's spec is reported instead of quietly producing the wrong Run.
 */
export function runCraftSpecFromJson(raw: unknown): RunCraftSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RunCraftError('craft: the spec must be an object.');
  const spec = raw as Record<string, unknown>;
  const known = new Set([...RUN_CRAFT_PARAMS, 'phase', 'ataraxiaTier']);
  const unknown = Object.keys(spec).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new RunCraftError(`craft: unknown field${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => `"${key}"`).join(', ')}.`);
  }
  const phase = spec.phase ?? spec.craft;
  if (!CRAFT_PHASES.includes(phase as RunCraftPhase)) {
    throw new RunCraftError(`craft: "${String(phase)}" is not a Run phase. Use ${CRAFT_PHASES.join(', ')}.`);
  }
  const gold = spec.gold;
  const goldTenths = gold === undefined || gold === null ? null : Math.round(Number(gold) * GOLD_SCALE);
  if (goldTenths !== null && (!Number.isSafeInteger(goldTenths) || goldTenths < 0)) {
    throw new RunCraftError(`craft gold: "${String(gold)}" must be a gold amount of 0 or more.`);
  }
  const tier = spec.tier ?? spec.ataraxiaTier;
  const offers = spec.offers;
  return {
    phase: phase as RunCraftPhase,
    battle: spec.battle === undefined || spec.battle === null ? 1 : jsonInteger(spec.battle, 'battle', 1, 100),
    warId: spec.war === undefined || spec.war === null ? null : String(spec.war),
    seed: spec.seed === undefined || spec.seed === null ? DEFAULT_CRAFT_SEED : jsonInteger(spec.seed, 'seed', 0, 0xffffffff),
    ataraxiaTier: (tier === undefined || tier === null ? 0 : jsonInteger(tier, 'tier', 0, 1)) as AtaraxiaTier,
    goldTenths,
    army: spec.army === undefined || spec.army === null ? null : craftUnitList(spec.army, 'army'),
    add: spec.add === undefined || spec.add === null ? null : craftUnitList(spec.add, 'add'),
    offers: offers === undefined || offers === null ? null : craftCardList(offers, 'offers'),
    cards: spec.cards === undefined || spec.cards === null ? null : craftCardList(spec.cards, 'cards'),
    loot: spec.loot === undefined || spec.loot === null ? null : lipsanonIdList(spec.loot, 'loot'),
    paidLipsanon: spec.paid === undefined || spec.paid === null ? null : lipsanonIdList(spec.paid, 'paid')[0] ?? null,
    lipsana: spec.lipsana === undefined || spec.lipsana === null ? null : lipsanonIdList(spec.lipsana, 'lipsana'),
  };
}

function craftCardList(raw: unknown, label: string): RunCraftCard[] {
  if (typeof raw === 'string') return raw.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec);
  if (!Array.isArray(raw)) throw new RunCraftError(`craft ${label}: expected a list of cards.`);
  return raw.map((entry) => {
    if (typeof entry === 'string') return cardSpec(entry);
    if (!entry || typeof entry !== 'object') throw new RunCraftError(`craft ${label}: expected a card string or object.`);
    const card = entry as { pieces?: unknown; type?: unknown; cardType?: unknown };
    const pieces = Array.isArray(card.pieces) ? card.pieces.map((piece) => String(piece)).join('+') : String(card.pieces ?? '');
    const type = card.type ?? card.cardType;
    return cardSpec(type === undefined || type === null ? pieces : `${pieces}:${String(type)}`);
  });
}

/** The address the Run screen keeps once a craft has been applied. */
export function searchWithoutCraftParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of RUN_CRAFT_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function hasRunCraftRequest(search: string): boolean {
  return new URLSearchParams(search).has('craft');
}

/**
 * The address of a crafted Run state (ADR-0354). The id IS the link: the spec lives on the
 * server, so the address stays short and opaque no matter how much the spec grows, survives
 * copy-paste and chat linkifiers intact, and has no grammar to outgrow. It is derived from the
 * spec's own content, so the same state always mints the same address.
 */
export const RUN_CRAFT_LINK_PREFIX = '/run/craft/';

/** A minted craft id: lowercase hex, long enough not to be guessed at from a neighbouring one. */
const RUN_CRAFT_LINK_ID = /^[0-9a-f]{12,64}$/;

export function runCraftLinkForId(id: string): string {
  return `${RUN_CRAFT_LINK_PREFIX}${id}`;
}

/** The craft id an address carries, or null when the address is not a craft link. */
export function runCraftLinkId(pathname: string): string | null {
  if (!pathname.startsWith(RUN_CRAFT_LINK_PREFIX)) return null;
  const id = pathname.slice(RUN_CRAFT_LINK_PREFIX.length).replace(/\/+$/, '').toLowerCase();
  return RUN_CRAFT_LINK_ID.test(id) ? id : null;
}

/** True for any address under the craft-link prefix — including a malformed id, which has to
 * reach the Run screen to be reported rather than falling through to some other route. */
export function isRunCraftLinkPath(pathname: string): boolean {
  return pathname === RUN_CRAFT_LINK_PREFIX.replace(/\/$/, '') || pathname.startsWith(RUN_CRAFT_LINK_PREFIX);
}

/**
 * Write a normalized spec back out in the grammar the parsers read. It is what gets stored
 * behind a craft id, and what the id is derived from, so it has to survive the trip out and
 * back unchanged: a spec that did not round-trip would craft something other than what its
 * link was minted for.
 */
export function runCraftSpecToJson(spec: RunCraftSpec): Record<string, unknown> {
  const unit = (entry: RunCraftUnit) => (entry.abilities.length ? { type: entry.type, abilities: [...entry.abilities] } : entry.type);
  const json: Record<string, unknown> = { phase: spec.phase, battle: spec.battle, seed: spec.seed, tier: spec.ataraxiaTier };
  if (spec.warId !== null) json.war = spec.warId;
  if (spec.goldTenths !== null) json.gold = spec.goldTenths / GOLD_SCALE;
  if (spec.army) json.army = spec.army.map(unit);
  if (spec.add) json.add = spec.add.map(unit);
  if (spec.offers) json.offers = spec.offers.map((card) => ({ pieces: [...card.pieces], type: card.cardType }));
  if (spec.cards) json.cards = spec.cards.map((card) => ({ pieces: [...card.pieces], type: card.cardType }));
  if (spec.loot) json.loot = [...spec.loot];
  if (spec.paidLipsanon !== null) json.paid = spec.paidLipsanon;
  if (spec.lipsana) json.lipsana = [...spec.lipsana];
  return json;
}

/**
 * The canonical text a craft id is derived from. Key order is fixed by runCraftSpecToJson, so
 * the same requested state always produces the same bytes — and therefore the same link, in
 * this session and in one a month from now. Hashing happens where the id is minted (the
 * server); this is the agreed input to it.
 */
export function runCraftSpecFingerprint(spec: RunCraftSpec): string {
  return JSON.stringify(runCraftSpecToJson(spec));
}

/** The readable address grammar, for writing a spec by hand. It is a way to SAY a spec, not the
 * link a crafted state is handed over as — that is always the id (runCraftLinkForId). */
export function runCraftAddressParams(spec: RunCraftSpec): URLSearchParams {
  // An address cannot say "this Rook carries Agminate". Refusing beats writing a shorter spec
  // than the one asked for: the craft id has no such limit, so nothing needs this to lie.
  if ([...(spec.army ?? []), ...(spec.add ?? [])].some((entry) => entry.abilities.length)) {
    throw new RunCraftError('craft: units carrying abilities cannot be written as an address. Mint a craft link for them.');
  }
  const params = new URLSearchParams();
  params.set('craft', spec.phase);
  params.set('battle', String(spec.battle));
  if (spec.warId !== null) params.set('war', spec.warId);
  if (spec.seed !== DEFAULT_CRAFT_SEED) params.set('seed', String(spec.seed));
  if (spec.ataraxiaTier !== 0) params.set('tier', String(spec.ataraxiaTier));
  if (spec.goldTenths !== null) params.set('gold', String(spec.goldTenths / GOLD_SCALE));
  if (spec.army) params.set('army', spec.army.map((entry) => entry.type).join(','));
  if (spec.add) params.set('add', spec.add.map((entry) => entry.type).join(','));
  if (spec.offers) {
    params.set('offers', spec.offers
      .map((card) => card.pieces.join('+') + (card.cardType ? `:${card.cardType}` : ''))
      .join(','));
  }
  if (spec.cards) {
    params.set('cards', spec.cards
      .map((card) => card.pieces.join('+') + (card.cardType ? `:${card.cardType}` : ''))
      .join(','));
  }
  if (spec.loot) params.set('loot', spec.loot.join(','));
  if (spec.paidLipsanon !== null) params.set('paid', spec.paidLipsanon);
  if (spec.lipsana) params.set('lipsana', spec.lipsana.join(','));
  return params;
}

/** The hand-authored address for a spec, for typing a one-off into the browser. */
export function runCraftAddress(spec: RunCraftSpec, path = '/run'): string {
  return `${path}?${runCraftAddressParams(spec).toString()}`;
}

/**
 * A crafted link carries the id of the Run it was made for — identity, never contents. Opened by
 * anyone else, or by the same person signed out, `/run` would otherwise render whatever Run that
 * browser happens to hold and look like it worked. Comparing the assertion catches that silently
 * wrong case; an address with no assertion always means "whatever Run is mine".
 */
export function runLinkTargetMismatch(search: string, activeRunId: string | null): boolean {
  const target = new URLSearchParams(search).get('run');
  if (!target) return false;
  return target !== activeRunId;
}

/** The address that opens a crafted Run and proves it is the one that was crafted. */
export function runLinkForRun(runId: string, path = '/run'): string {
  return `${path}?run=${encodeURIComponent(runId)}`;
}

/** Pick the War a craft link names, falling back to the first Run-eligible official War so a bare
 * ?craft=shop link works with no War id in it. */
export function selectCraftWar(
  spec: RunCraftSpec,
  wars: readonly War[],
  levels: Record<string, Level>,
): RunWarSnapshot {
  const named = spec.warId ? wars.find((war) => war.id === spec.warId) : null;
  if (spec.warId && !named) {
    const eligible = wars.filter((war) => war.battles.length > 0).map((war) => war.id);
    throw new RunCraftError(
      `craft war: "${spec.warId}" is not a loaded War.${eligible.length ? ` Loaded Wars: ${eligible.join(', ')}.` : ''}`,
    );
  }
  const war = named ?? [...wars]
    .filter((candidate) => candidate.origin === 'official' && candidate.eligibleForRun === true && candidate.battles.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!war) throw new RunCraftError('craft: no Run-eligible official War is loaded yet.');
  try {
    return snapshotWar(war, levels);
  } catch (error) {
    throw new RunCraftError(`craft war: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function firstNonKingUnitId(run: RunDocument): string | undefined {
  return run.army.find((unit) => unit.type !== 'king')?.id;
}

function autoDeploy(run: RunDocument): { run: RunDocument; layout: RunDeploymentLayout } {
  let prepared = prepareDeployment(run);
  const level = prepared.war.battles[prepared.battleIndex]?.level;
  if (!level) throw new RunCraftError(`craft: Battle ${prepared.battleIndex + 1} has no Level.`);
  let options = deploymentOptions(prepared, level);
  if (options.needsBlockedChoice) {
    const chosen = prepared.army
      .filter((unit) => unit.type !== 'king')
      .slice(0, options.blockedChoiceCount)
      .map((unit) => unit.id);
    prepared = setDeploymentChoices(prepared, { chosenBlockedUnitIds: chosen });
    options = deploymentOptions(prepared, level);
  }
  if (prepared.deployment?.layoutChoice !== 0 && prepared.deployment?.layoutChoice !== 1) {
    // A Surveyor's Compass makes the layout an unmade player choice; the crafter takes the first.
    prepared = setDeploymentChoices(prepared, { layoutChoice: 0 });
  }
  if (options.adlectedUnitIds.length) {
    // Adlected units are placed by hand in play, so the crafter places them the same way:
    // the first free deployment cells, deterministically.
    const layout = selectedDeploymentLayout(prepared, options);
    const used = new Set(Object.values(layout.placements).map((cell) => `${cell.x},${cell.y}`));
    const manualPlacements = { ...(prepared.deployment?.manualPlacements ?? {}) };
    for (const unitId of options.adlectedUnitIds) {
      if (manualPlacements[unitId]) continue;
      const free = options.zoneCells.find((cell) => !used.has(`${cell.x},${cell.y}`));
      if (!free) break;
      manualPlacements[unitId] = `${free.x},${free.y}`;
      used.add(`${free.x},${free.y}`);
    }
    prepared = setDeploymentChoices(prepared, { manualPlacements });
    options = deploymentOptions(prepared, level);
  }
  if (!deploymentReady(prepared, options)) {
    throw new RunCraftError(`craft: Battle ${prepared.battleIndex + 1} could not be deployed automatically.`);
  }
  return { run: prepared, layout: selectedDeploymentLayout(prepared, options) };
}

function fightBattle(run: RunDocument): RunDocument {
  const { run: deployed, layout } = autoDeploy(run);
  const deployedUnitIds = Object.keys(layout.placements);
  const started = beginBattle(deployed, deployedUnitIds, layout.reserveUnitIds, layout.blockedUnitIds);
  if (started.phase !== 'battle') throw new RunCraftError('craft: the crafted Battle could not be started.');
  // Every deployed unit survives a crafted Battle: the crafter is placing the player at a state,
  // not simulating an outcome.
  return openShop(started, deployedUnitIds);
}

/**
 * Get past a Conflict's lipsanon screen by taking the first offer that will be accepted.
 * Fast-forwarding has to make the same mandatory choice a player would; taking a lipsanon is
 * also what opens the shop behind it, so this is how the crafter reaches any later state.
 */
function takeVacantiaAuto(run: RunDocument): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia) return run;
  const target = firstNonKingUnitId(run);
  for (const lipsanon of run.vacantia.offers) {
    const taken = takeVacantiaLipsanon(run, lipsanon, target);
    if (taken !== run) return taken;
  }
  throw new RunCraftError('craft: the Conflict opened with no lipsanon that could be taken.');
}

function leaveShopAuto(run: RunDocument): RunDocument {
  const next = takeVacantiaAuto(run);
  if (!canLeaveShop(next)) {
    throw new RunCraftError(`craft: the Shop after Battle ${(next.shop?.afterBattleIndex ?? 0) + 1} could not be left.`);
  }
  return leaveShop(next);
}

function buyOpeningCard(run: RunDocument): RunDocument {
  const affordable = [...(run.shop?.cardOffers ?? [])]
    .filter((offer) => offer.cost * GOLD_SCALE <= run.goldTenths)
    .sort((a, b) => a.cost - b.cost || a.offerId.localeCompare(b.offerId));
  const chosen = affordable[0];
  if (!chosen) throw new RunCraftError('craft: the opening Shop offered nothing affordable.');
  const bought = buyCard(run, chosen.offerId);
  if (bought === run) throw new RunCraftError('craft: the opening Shop purchase was refused.');
  return bought;
}

/**
 * Buy the cards the Run should already HOLD, in the opening Shop it is standing in.
 *
 * The point of the field is the Chartulary and everything downstream of a purchase: real units
 * with real ids, the abilities and Plagued marks `buyCard` grants, and card records the server
 * validator accepts. So each card is staged as an ordinary offer and bought — never written into
 * `run.cards` directly. Gold is restored afterwards, so held cards do not silently pay for
 * themselves out of what the Run has to spend, and the staged offers are withdrawn so the Shop
 * that is about to be left still reads as the one the game dealt.
 *
 * They are bought at the START of the fast-forward, which means they then live through every
 * Battle before the target: units die, Pestiferous cards deteriorate, and what arrives is a card
 * with a history rather than a fresh purchase.
 */
function buyHeldCards(run: RunDocument, cards: readonly RunCraftCard[] | null): RunDocument {
  if (!cards?.length) return run;
  if (!run.shop) throw new RunCraftError('craft cards: there is no Shop to buy the held cards in.');
  const goldTenths = run.goldTenths;
  let next = run;
  cards.forEach((card, index) => {
    const shop = next.shop!;
    const offer = craftOffer(next, card, HELD_CARD_SLOT_BASE + index);
    const staged: RunDocument = {
      ...next,
      goldTenths: next.goldTenths + offer.cost * GOLD_SCALE,
      shop: { ...shop, cardOffers: [...shop.cardOffers, offer] },
    };
    const bought = buyCard(staged, offer.offerId);
    if (bought === staged) {
      throw new RunCraftError(`craft cards: "${card.pieces.join('+')}" could not be bought.`);
    }
    next = {
      ...bought,
      shop: {
        ...bought.shop!,
        cardOffers: bought.shop!.cardOffers.filter((entry) => entry.offerId !== offer.offerId),
        purchasedCardOfferIds: bought.shop!.purchasedCardOfferIds.filter((id) => id !== offer.offerId),
      },
    };
  });
  // The Shop's own entry snapshot moves with them: they are cards the Run came in holding, not
  // purchases a Discard changes should undo.
  return {
    ...next,
    goldTenths,
    shop: {
      ...next.shop!,
      entrySnapshot: { ...next.shop!.entrySnapshot, army: next.army, cards: next.cards, goldTenths },
    },
  };
}

/** Far above any real Shop slot, so a staged held-card offer can never collide with a dealt one. */
const HELD_CARD_SLOT_BASE = 1000;

/** Fast-forward from the opening Shop to the deployment of a target Battle by playing every
 * Battle before it. */
function advanceToDeployment(run: RunDocument, battleIndex: number, held: readonly RunCraftCard[] | null): RunDocument {
  let next = leaveShopAuto(buyHeldCards(buyOpeningCard(takeVacantiaAuto(run)), held));
  let guard = 0;
  while (next.battleIndex < battleIndex) {
    if ((guard += 1) > 200) throw new RunCraftError('craft: fast-forward made no progress.');
    const shopped = takeVacantiaAuto(fightBattle(next));
    if (shopped.phase !== 'shop') {
      throw new RunCraftError(`craft: the War ended before Battle ${battleIndex + 1}.`);
    }
    next = leaveShopAuto(shopped);
  }
  return next;
}

function craftUnits(pieces: readonly PurchasablePieceType[]): RunCraftUnit[] {
  return pieces.map((type) => ({ type, abilities: [] }));
}

/** Add crafted units, then grant each one the abilities the spec asked for. Abilities are stored on
 * the unit exactly as a card or lipsanon would leave them, so the game reads them normally. */
function addPieces(run: RunDocument, units: readonly RunCraftUnit[]): RunDocument {
  const { addedUnits, ...update } = addArmyPieces(run, units.map((unit) => unit.type), 'shop');
  const granted = new Map(addedUnits.map((added, index) => [added.id, units[index].abilities]));
  return {
    ...run,
    ...update,
    army: update.army.map((unit) => {
      const abilities = granted.get(unit.id);
      return abilities?.length ? { ...unit, abilities: [...new Set([...unit.abilities, ...abilities])] } : unit;
    }),
  };
}

/** Cards are the Run's purchase history; a crafted army rewrites the roster, so cards keep only the
 * units that still exist and empty leftovers are dropped rather than left as ghosts. */
function pruneEmptyCards(run: RunDocument): RunDocument {
  const unitIds = new Set(run.army.map((unit) => unit.id));
  const cards = run.cards
    .filter((card) => card.unitIds.length > 0 || card.lostUnitIds.length > 0)
    .map((card) => (
      card.effectTargetUnitId && !unitIds.has(card.effectTargetUnitId)
        ? { ...card, effectTargetUnitId: null }
        : card
    ));
  const cardIds = new Set(cards.map((card) => card.id));
  return {
    ...run,
    cards,
    pestiferousLosses: run.pestiferousLosses.filter((loss) => cardIds.has(loss.cardId)),
  };
}

function applyArmy(run: RunDocument, spec: RunCraftSpec): RunDocument {
  let next = run;
  if (spec.army) {
    for (const unit of run.army.filter((candidate) => candidate.type !== 'king')) {
      next = { ...next, ...removeUnitFromArmyAndCards(next, unit.id) };
    }
    next = addPieces(pruneEmptyCards(next), spec.army);
  }
  if (spec.add) next = addPieces(next, spec.add);
  return next;
}

function applyLipsana(run: RunDocument, spec: RunCraftSpec): RunDocument {
  let next = run;
  for (const lipsanon of spec.lipsana ?? []) {
    const target = firstNonKingUnitId(next);
    const acquired = acquireLipsanon(next, lipsanon, target);
    if (acquired === next) throw new RunCraftError(`craft lipsana: "${lipsanon}" could not be acquired.`);
    next = acquired;
  }
  return next;
}

function craftOffer(
  run: RunDocument,
  card: RunCraftCard,
  slotIndex: number,
): RunCardOffer {
  const core = RUN_CARD_BY_ID[craftCoreCardId(card.pieces)];
  const effectSeed = mixSeed(run.seed, `craft-offer:${core.id}`, slotIndex);
  const cacochymicPieceIndex = card.cardType === 'pestiferous'
    ? seededPestiferousTarget(effectSeed, core.pieces.map((_piece, index) => index), 0)
    : null;
  const plaguedPiece = cacochymicPieceIndex === null ? null : core.pieces[cacochymicPieceIndex];
  return {
    ...core,
    pieces: [...core.pieces],
    offerId: `craft-${slotIndex}-${core.id}`,
    // The exact pricing the game and the server both derive; a hand-set cost is rejected.
    cost: plaguedPiece
      ? core.value - CACOCHYMIC_DISCOUNT[plaguedPiece]
      : core.value + (card.cardType === 'legatine'
        ? ADLECTED_COST
        : card.cardType === 'hieratic'
          ? AGMINATE_COST
          : card.cardType === 'concinnous' ? EUTACTIC_COST : 0),
    cardType: card.cardType,
    effectSeed,
    cacochymicPieceIndex,
    effectTargetIndex: card.cardType === 'concinnous'
      ? createRng(mixSeed(effectSeed, 'concinnous-target')).int(core.pieces.length)
      : null,
  };
}

function applyShopOffers(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const shop = run.shop;
  if (!shop) return run;
  const held = new Set(run.lipsana);
  for (const lipsanon of [...(spec.loot ?? []), ...(spec.paidLipsanon ? [spec.paidLipsanon] : [])]) {
    if (held.has(lipsanon)) throw new RunCraftError(`craft: "${lipsanon}" is already held, so it cannot also be offered.`);
  }
  const cardOffers = spec.offers ? spec.offers.map((card, index) => craftOffer(run, card, index)) : shop.cardOffers;
  const offerIds = new Set(cardOffers.map((offer) => offer.offerId));
  if (offerIds.size !== cardOffers.length) {
    throw new RunCraftError('craft offers: the same card was offered twice; each Shop card must be distinct.');
  }
  const paidLipsanonOffer = spec.paidLipsanon ?? shop.paidLipsanonOffer;
  return {
    ...run,
    seenLipsana: [...new Set([...run.seenLipsana, ...(paidLipsanonOffer ? [paidLipsanonOffer] : [])])],
    shop: {
      ...shop,
      cardOffers,
      purchasedCardOfferIds: [],
      paidLipsanonOffer,
      paidLipsanonBought: false,
    },
  };
}

/** `loot=` now writes the Conflict's opening offers, which is where the lipsanon moved to. */
function applyVacantiaOffers(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const vacantia = run.vacantia;
  if (!vacantia || !spec.loot) return run;
  const held = new Set(run.lipsana);
  for (const lipsanon of spec.loot) {
    if (held.has(lipsanon)) throw new RunCraftError(`craft: "${lipsanon}" is already held, so it cannot also be offered.`);
  }
  return {
    ...run,
    seenLipsana: [...new Set([...run.seenLipsana, ...spec.loot])],
    vacantia: { ...vacantia, offers: [...spec.loot] },
  };
}

/** Gold is set last so lipsanon payouts and Battle rewards cannot move the number off the request.
 * Inside a Shop the entry snapshot moves with it, so Discard changes restores the crafted gold. */
function applyGold(run: RunDocument, goldTenths: number | null): RunDocument {
  if (goldTenths === null) return run;
  return {
    ...run,
    goldTenths,
    shop: run.shop
      ? { ...run.shop, entrySnapshot: { ...run.shop.entrySnapshot, goldTenths } }
      : run.shop,
  };
}

const OPENING_SHOP_OVERRIDES: readonly (keyof RunCraftSpec)[] = ['goldTenths', 'army', 'add', 'offers', 'cards', 'loot', 'paidLipsanon', 'lipsana'];

/** Build the crafted Run. Every state is reached by the transitions the game itself plays. */
export function craftRunDocument(spec: RunCraftSpec, war: RunWarSnapshot): RunDocument {
  const battles = war.battles.length;
  const targetIndex = spec.battle - 1;
  if (spec.phase !== 'victory' && targetIndex >= battles) {
    throw new RunCraftError(`craft battle: ${war.name} has ${battles} Battle${battles === 1 ? '' : 's'}.`);
  }
  const opening = createRun(war, spec.seed, spec.ataraxiaTier);

  // The run's own first state. Bona Vacantia now sits in front of the opening Shop, so
  // battle=1 reaches it without playing anything.
  if (spec.phase === 'bona-vacantia' && targetIndex === 0) {
    if (opening.phase !== 'bona-vacantia') {
      throw new RunCraftError(`craft: ${war.name} has no loot Battle, so no Conflict opens with a lipsanon.`);
    }
    // Offers last, matching the Shop path: the held-lipsanon guard can only see a lipsanon the
    // spec granted once applyLipsana has actually granted it.
    return applyGold(applyVacantiaOffers(applyLipsana(applyArmy(opening, spec), spec), spec), spec.goldTenths);
  }

  // The opening Shop is pinned by the server contract — its offers, army and starting gold are
  // checked value by value — so it is craftable only as itself. It now sits behind the opening
  // lipsanon screen, so reaching it means taking that lipsanon first.
  if (spec.phase === 'shop' && targetIndex === 0) {
    const overridden = OPENING_SHOP_OVERRIDES.filter((key) => spec[key] !== null);
    if (overridden.length) {
      throw new RunCraftError(
        'craft: the opening Shop is fixed by the Run contract and takes no overrides. Craft battle=2 or later for a Shop with crafted contents.',
      );
    }
    return takeVacantiaAuto(opening);
  }

  const deploymentIndex = spec.phase === 'shop'
    ? targetIndex - 1
    : spec.phase === 'victory' ? battles - 1 : targetIndex;
  // A crafted army REPLACES the roster, which takes the units the held cards put there with it —
  // so the two ways of saying what the Run has cannot both be given.
  if (spec.cards && spec.army) {
    throw new RunCraftError('craft: cards and army cannot both be given. A crafted army replaces the roster the held cards put there; use add for extra units beside them.');
  }

  // A Conflict's lipsanon screen sits between the Battle that closed the previous Conflict and
  // the Shop that follows it, so it is reached by fighting up to that Battle and stopping.
  if (spec.phase === 'bona-vacantia') {
    const closing = advanceToDeployment(opening, targetIndex - 1, spec.cards);
    const opened = fightBattle(applyLipsana(applyArmy(closing, spec), spec));
    if (opened.phase !== 'bona-vacantia') {
      throw new RunCraftError(`craft: Battle ${targetIndex} does not close a Conflict, so no lipsanon screen follows it.`);
    }
    return applyGold(applyVacantiaOffers(opened, spec), spec.goldTenths);
  }

  let run = advanceToDeployment(opening, deploymentIndex, spec.cards);
  run = applyLipsana(applyArmy(run, spec), spec);

  if (spec.phase === 'deployment') return applyGold(prepareDeployment(run), spec.goldTenths);

  if (spec.phase === 'battle') {
    const { run: deployed, layout } = autoDeploy(run);
    return applyGold(
      beginBattle(deployed, Object.keys(layout.placements), layout.reserveUnitIds, layout.blockedUnitIds),
      spec.goldTenths,
    );
  }

  const shopped = takeVacantiaAuto(fightBattle(run));
  if (spec.phase === 'victory') {
    if (shopped.phase !== 'victory') throw new RunCraftError('craft: the final Battle did not end the War.');
    return applyGold(shopped, spec.goldTenths);
  }
  if (shopped.phase !== 'shop') {
    throw new RunCraftError(`craft: Battle ${deploymentIndex + 1} ended the War, so it has no Shop after it.`);
  }
  return applyGold(applyShopOffers(shopped, spec), spec.goldTenths);
}
