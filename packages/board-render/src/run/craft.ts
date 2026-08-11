// Craft an active Run directly into a named state so a Run screen can be reached by URL.
//
// Debugging and feature work constantly need "the Sectio after Battle 3 with 250 gold and a Rook on
// offer". Playing there by hand is slow, and hand-authoring the document is worse: the server
// validator (validateActiveRunBody) cross-checks army/card membership, offer pricing and the
// Sectio entry snapshot, so a typed-out document is rejected far more often than it
// is accepted.
//
// So this module never authors state directly. It composes the SAME transitions the game plays —
// createRun → prepareDeployment → beginBattle → openSectio → performAdlectio → leaveSectio — and only then
// applies the requested overrides in the phase where each one is legal (army and lipsana before a
// Battle, offers and gold in the Sectio that a real openSectio() produced). What comes out is a
// document the game and the server both accept, because the game built it.
//
// The URL grammar lives here too, so links stay the shared contract between the owner and an agent.

import type { Level, War } from '../core/level';
import {
  GOLD_SCALE,
  RUN_CARD_BY_ID,
  RUN_LIPSANA,
  acquireLipsanon,
  addArmyPieces,
  beginBattle,
  performAdlectio,
  canLeaveSectio,
  closeBattle,
  levelEnemyForceValue,
  createRun,
  leaveAftermath,
  leaveSectio,
  mixSeed,
  observeRunUnitDeath,
  prepareDeployment,
  removeUnitFromArmyAndCards,
  runCardCost,
  runRules,
  setDeploymentChoices,
  snapshotWar,
  takeVacantiaCard,
  takeVacantiaLipsanon,
  type AtaraxiaTier,
  type AdlectablePieceType,
  type RunCardOffer,
  type RunDocument,
  type RunDeploymentMode,
  type LipsanonId,
  type RunWarSnapshot,
} from './model';
import {
  advanceDeploymentTransport,
  arrangedCardPlacementOptions,
  arrangedDeploymentCards,
  beginArrangedBattle,
  beginDeploymentDeal,
  completeDeploymentDeal,
  deploymentOptions,
  finishDeploymentCardDiscard,
  finishDeploymentCardReveal,
  finishDeploymentUnitSettlement,
  placeRevealedDeploymentUnit,
  placeArrangedDeploymentCard,
  revealActiveDeploymentCard,
  resolveDeploymentCapacity,
  selectedDeploymentLayout,
  setDeploymentTransport,
  type RunDeploymentLayout,
  type RunFormationRotation,
} from './deployment';

/** Every query parameter the crafter consumes. Stripped from the address once applied so the
 * Run screen keeps its own params (view) and a reload does not craft a second Run. */
export const RUN_CRAFT_PARAMS: readonly string[] = Object.freeze([
  'craft',
  'battle',
  'war',
  'seed',
  'tier',
  'deployment',
  'gold',
  'army',
  'add',
  'offers',
  'cards',
  'loot',
  'paid',
  'lipsana',
  'turns',
  'seconds',
  'fallen',
  'standing',
]);

export const DEFAULT_CRAFT_SEED = 1337;

export type RunCraftPhase = 'aftermath' | 'bona-vacantia' | 'commendatio' | 'sectio' | 'deployment' | 'battle' | 'battle-victory' | 'victory';

/**
 * What a crafted aftermath reports when the spec does not say. A crafted Battle is placed,
 * not played, so it has no turn count or clock of its own; these stand in for one that reads
 * like a real Battle rather than an empty ledger.
 */
export const DEFAULT_CRAFT_AFTERMATH_TURNS = 14;
export const DEFAULT_CRAFT_AFTERMATH_ELAPSED_MS = 277_000;

export interface RunCraftCard {
  coreId: string;
  pieces: AdlectablePieceType[];
}

/** One crafted army unit. */
export interface RunCraftUnit {
  type: AdlectablePieceType;
}

export interface RunCraftSpec {
  phase: RunCraftPhase;
  /** 1-based Battle number, matching the "Battle 2 / 4" the title bar shows. */
  battle: number;
  warId: string | null;
  seed: number;
  ataraxiaTier: AtaraxiaTier;
  /** Retained in the craft shape as the single explicit placement contract. */
  deploymentMode?: RunDeploymentMode;
  goldTenths: number | null;
  army: RunCraftUnit[] | null;
  add: RunCraftUnit[] | null;
  offers: RunCraftCard[] | null;
  /** Cards the Run already holds. Acquired in the first reachable post-Battle Sectio. */
  cards: RunCraftCard[] | null;
  loot: LipsanonId[] | null;
  paidLipsanon: LipsanonId | null;
  lipsana: LipsanonId[] | null;
  /** Aftermath only: what the Battle's report says it cost. A crafted Battle is not played,
   * so these are the only way to put a specific result on that screen. */
  turns: number | null;
  elapsedMs: number | null;
  fallen: number | null;
  /**
   * Points of enemy force the report says were still standing at the mate, which Deditio is
   * paid on. Defaults to the WHOLE force the level fields: a placed Battle killed nothing, so
   * an untouched enemy army is the honest reading, and it is also the state worth looking at.
   * Give 0 for the ground-down mate that pays nothing.
   */
  standingEnemyValue: number | null;
}

/** A spec the crafter refuses. The message is written for the person reading it on the screen. */
export class RunCraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunCraftError';
  }
}

const PIECE_ALIASES: Readonly<Record<string, AdlectablePieceType>> = Object.freeze({
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

const CRAFT_PHASES: readonly RunCraftPhase[] = ['aftermath', 'bona-vacantia', 'commendatio', 'sectio', 'deployment', 'battle', 'battle-victory', 'victory'];

function pieceList(raw: string, label: string): AdlectablePieceType[] {
  const pieces: AdlectablePieceType[] = [];
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
    pieces.push(...(letters as AdlectablePieceType[]));
  }
  if (!pieces.length) throw new RunCraftError(`craft ${label}: no pieces were listed.`);
  return pieces;
}

/** Legacy composition shorthand used only when exactly one active formation has that roster. */
export function craftCoreCardId(pieces: readonly AdlectablePieceType[]): string {
  const order: readonly AdlectablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
  return [...pieces]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((piece) => piece[0])
    .join('');
}

function cardSpec(raw: string): RunCraftCard {
  const [piecesPart, typePart, ...extra] = raw.split(':');
  if (extra.length) throw new RunCraftError(`craft offers: "${raw}" has more than one ":" card type.`);
  if (typePart !== undefined) throw new RunCraftError(`craft offers: card qualifiers are unsupported; omit ":${typePart}".`);
  const exact = RUN_CARD_BY_ID[piecesPart.toLowerCase()];
  if (exact) return { coreId: exact.id, pieces: [...exact.pieces] };

  const pieces = pieceList(piecesPart, 'offers');
  const composition = craftCoreCardId(pieces);
  const matches = Object.values(RUN_CARD_BY_ID).filter((card) => craftCoreCardId(card.pieces) === composition);
  if (matches.length !== 1) {
    const choices = matches.map((card) => card.id).join(', ');
    throw new RunCraftError(
      matches.length
        ? `craft offers: "${piecesPart}" has multiple formations. Use one card id: ${choices}.`
        : `craft offers: "${raw}" is not an active formation card.`,
    );
  }
  return { coreId: matches[0].id, pieces: [...matches[0].pieces] };
}

function lipsanonList(raw: string, label: string): LipsanonId[] {
  return raw.split(',').map((token) => token.trim()).filter(Boolean).map((id) => {
    if (!RUN_LIPSANA.some((lipsanon) => lipsanon.id === id)) {
      throw new RunCraftError(`craft ${label}: "${id}" is not an active lipsanon id.`);
    }
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

function deploymentMode(raw: unknown): RunDeploymentMode {
  if (raw === undefined || raw === null || raw === '' || raw === 'arranged') return 'arranged';
  throw new RunCraftError(`craft deployment: "${String(raw)}" is retired; formations are player-arranged.`);
}

/** Read a craft spec out of a Run address. Returns null when the address asks for no crafting. */
export function parseRunCraftSpec(search: string): RunCraftSpec | null {
  const params = new URLSearchParams(search);
  const phase = params.get('craft');
  if (!phase) return null;
  if (!CRAFT_PHASES.includes(phase as RunCraftPhase)) {
    throw new RunCraftError(`craft: "${phase}" is not a Run phase. Use ${CRAFT_PHASES.join(', ')}.`);
  }
  // Gold is whole and exact (ADR-0547), so the address carries the number the screen shows.
  const goldRaw = params.get('gold');
  const goldTenths = goldRaw === null ? null : Number(goldRaw);
  if (goldRaw !== null && (!Number.isSafeInteger(goldTenths) || (goldTenths as number) < 0)) {
    throw new RunCraftError(`craft gold: "${goldRaw}" must be a whole gold amount of 0 or more.`);
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
    ataraxiaTier: (params.get('tier') === null ? 0 : integer(params.get('tier')!, 'tier', 0, 0)) as AtaraxiaTier,
    deploymentMode: deploymentMode(params.get('deployment')),
    goldTenths,
    army: army === null ? null : craftUnits(pieceList(army, 'army')),
    add: add === null ? null : craftUnits(pieceList(add, 'add')),
    offers: offers === null ? null : offers.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec),
    cards: cards === null ? null : cards.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec),
    loot: loot === null ? null : lipsanonList(loot, 'loot'),
    paidLipsanon: paid === null ? null : lipsanonList(paid, 'paid')[0] ?? null,
    lipsana: lipsana === null ? null : lipsanonList(lipsana, 'lipsana'),
    turns: params.get('turns') === null ? null : integer(params.get('turns')!, 'turns', 0, 999),
    elapsedMs: params.get('seconds') === null
      ? null
      : integer(params.get('seconds')!, 'seconds', 0, 86_400) * 1000,
    fallen: params.get('fallen') === null ? null : integer(params.get('fallen')!, 'fallen', 0, 100),
    standingEnemyValue: params.get('standing') === null
      ? null
      : integer(params.get('standing')!, 'standing', 0, 999),
  };
}


function craftUnitList(raw: unknown, label: string): RunCraftUnit[] {
  if (typeof raw === 'string') return craftUnits(pieceList(raw, label));
  if (!Array.isArray(raw)) throw new RunCraftError(`craft ${label}: expected a list of units.`);
  return raw.map((entry) => {
    if (typeof entry === 'string') {
      const pieces = pieceList(entry, label);
      if (pieces.length !== 1) throw new RunCraftError(`craft ${label}: "${entry}" names more than one unit.`);
      return { type: pieces[0] };
    }
    if (!entry || typeof entry !== 'object') throw new RunCraftError(`craft ${label}: expected a piece name or a unit object.`);
    const unit = entry as Record<string, unknown>;
    const unknown = Object.keys(unit).filter((key) => key !== 'type');
    if (unknown.length) throw new RunCraftError(`craft ${label}: unknown unit field "${unknown[0]}".`);
    const pieces = pieceList(String(unit.type ?? ''), label);
    if (pieces.length !== 1) throw new RunCraftError(`craft ${label}: "${String(unit.type)}" names more than one unit.`);
    return { type: pieces[0] };
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
 * a JSON spec can carry structured units and card offers as objects, with no URL
 * length to work around. Every unknown field is refused rather than silently ignored, so a typo in
 * an agent's spec is reported instead of quietly producing the wrong Run.
 */
export function runCraftSpecFromJson(raw: unknown): RunCraftSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RunCraftError('craft: the spec must be an object.');
  const spec = raw as Record<string, unknown>;
  const known = new Set([...RUN_CRAFT_PARAMS, 'phase', 'ataraxiaTier', 'deploymentMode']);
  const unknown = Object.keys(spec).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new RunCraftError(`craft: unknown field${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => `"${key}"`).join(', ')}.`);
  }
  const phase = spec.phase ?? spec.craft;
  if (!CRAFT_PHASES.includes(phase as RunCraftPhase)) {
    throw new RunCraftError(`craft: "${String(phase)}" is not a Run phase. Use ${CRAFT_PHASES.join(', ')}.`);
  }
  const gold = spec.gold;
  const goldTenths = gold === undefined || gold === null ? null : Number(gold);
  if (goldTenths !== null && (!Number.isSafeInteger(goldTenths) || goldTenths < 0)) {
    throw new RunCraftError(`craft gold: "${String(gold)}" must be a whole gold amount of 0 or more.`);
  }
  const tier = spec.tier ?? spec.ataraxiaTier;
  const offers = spec.offers;
  return {
    phase: phase as RunCraftPhase,
    battle: spec.battle === undefined || spec.battle === null ? 1 : jsonInteger(spec.battle, 'battle', 1, 100),
    warId: spec.war === undefined || spec.war === null ? null : String(spec.war),
    seed: spec.seed === undefined || spec.seed === null ? DEFAULT_CRAFT_SEED : jsonInteger(spec.seed, 'seed', 0, 0xffffffff),
    ataraxiaTier: (tier === undefined || tier === null ? 0 : jsonInteger(tier, 'tier', 0, 0)) as AtaraxiaTier,
    deploymentMode: deploymentMode(spec.deploymentMode ?? spec.deployment),
    goldTenths,
    army: spec.army === undefined || spec.army === null ? null : craftUnitList(spec.army, 'army'),
    add: spec.add === undefined || spec.add === null ? null : craftUnitList(spec.add, 'add'),
    offers: offers === undefined || offers === null ? null : craftCardList(offers, 'offers'),
    cards: spec.cards === undefined || spec.cards === null ? null : craftCardList(spec.cards, 'cards'),
    loot: spec.loot === undefined || spec.loot === null ? null : lipsanonIdList(spec.loot, 'loot'),
    paidLipsanon: spec.paid === undefined || spec.paid === null ? null : lipsanonIdList(spec.paid, 'paid')[0] ?? null,
    lipsana: spec.lipsana === undefined || spec.lipsana === null ? null : lipsanonIdList(spec.lipsana, 'lipsana'),
    turns: spec.turns === undefined || spec.turns === null ? null : jsonInteger(spec.turns, 'turns', 0, 999),
    elapsedMs: spec.seconds === undefined || spec.seconds === null
      ? null
      : jsonInteger(spec.seconds, 'seconds', 0, 86_400) * 1000,
    fallen: spec.fallen === undefined || spec.fallen === null ? null : jsonInteger(spec.fallen, 'fallen', 0, 100),
    standingEnemyValue: spec.standing === undefined || spec.standing === null
      ? null
      : jsonInteger(spec.standing, 'standing', 0, 999),
  };
}

function craftCardList(raw: unknown, label: string): RunCraftCard[] {
  if (typeof raw === 'string') return raw.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec);
  if (!Array.isArray(raw)) throw new RunCraftError(`craft ${label}: expected a list of cards.`);
  return raw.map((entry) => {
    if (typeof entry === 'string') return cardSpec(entry);
    if (!entry || typeof entry !== 'object') throw new RunCraftError(`craft ${label}: expected a card string or object.`);
    const card = entry as Record<string, unknown>;
    const unknown = Object.keys(card).filter((key) => key !== 'id' && key !== 'coreId' && key !== 'pieces');
    if (unknown.length) throw new RunCraftError(`craft ${label}: unknown card field "${unknown[0]}".`);
    const id = card.id ?? card.coreId;
    if (id !== undefined && id !== null) return cardSpec(String(id));
    const pieces = Array.isArray(card.pieces) ? card.pieces.map((piece) => String(piece)).join('+') : String(card.pieces ?? '');
    return cardSpec(pieces);
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
  const json: Record<string, unknown> = { phase: spec.phase, battle: spec.battle, seed: spec.seed, tier: spec.ataraxiaTier };
  if (spec.deploymentMode === 'arranged') json.deployment = 'arranged';
  if (spec.warId !== null) json.war = spec.warId;
  if (spec.goldTenths !== null) json.gold = spec.goldTenths;
  if (spec.army) json.army = spec.army.map((entry) => entry.type);
  if (spec.add) json.add = spec.add.map((entry) => entry.type);
  if (spec.offers) json.offers = spec.offers.map((card) => card.coreId);
  if (spec.cards) json.cards = spec.cards.map((card) => card.coreId);
  if (spec.loot) json.loot = [...spec.loot];
  if (spec.paidLipsanon !== null) json.paid = spec.paidLipsanon;
  if (spec.lipsana) json.lipsana = [...spec.lipsana];
  if (spec.turns !== null) json.turns = spec.turns;
  if (spec.elapsedMs !== null) json.seconds = spec.elapsedMs / 1000;
  if (spec.fallen !== null) json.fallen = spec.fallen;
  if (spec.standingEnemyValue !== null) json.standing = spec.standingEnemyValue;
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
  const params = new URLSearchParams();
  params.set('craft', spec.phase);
  params.set('battle', String(spec.battle));
  if (spec.warId !== null) params.set('war', spec.warId);
  if (spec.seed !== DEFAULT_CRAFT_SEED) params.set('seed', String(spec.seed));
  if (spec.ataraxiaTier !== 0) params.set('tier', String(spec.ataraxiaTier));
  if (spec.deploymentMode === 'arranged') params.set('deployment', 'arranged');
  if (spec.goldTenths !== null) params.set('gold', String(spec.goldTenths));
  if (spec.army) params.set('army', spec.army.map((entry) => entry.type).join(','));
  if (spec.add) params.set('add', spec.add.map((entry) => entry.type).join(','));
  if (spec.offers) {
    params.set('offers', spec.offers
      .map((card) => card.coreId)
      .join(','));
  }
  if (spec.cards) {
    params.set('cards', spec.cards
      .map((card) => card.coreId)
      .join(','));
  }
  if (spec.loot) params.set('loot', spec.loot.join(','));
  if (spec.paidLipsanon !== null) params.set('paid', spec.paidLipsanon);
  if (spec.lipsana) params.set('lipsana', spec.lipsana.join(','));
  if (spec.turns !== null) params.set('turns', String(spec.turns));
  if (spec.elapsedMs !== null) params.set('seconds', String(spec.elapsedMs / 1000));
  if (spec.fallen !== null) params.set('fallen', String(spec.fallen));
  if (spec.standingEnemyValue !== null) params.set('standing', String(spec.standingEnemyValue));
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
 * ?craft=sectio link works with no War id in it. */
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

function autoDeploy(run: RunDocument): { run: RunDocument; layout: RunDeploymentLayout } {
  let prepared = prepareDeployment(run);
  const level = prepared.war.battles[prepared.battleIndex]?.level;
  if (!level) throw new RunCraftError(`craft: Battle ${prepared.battleIndex + 1} has no Level.`);
  prepared = resolveDeploymentCapacity(prepared, level);
  prepared = beginDeploymentDeal(prepared);
  prepared = completeDeploymentDeal(prepared, level);
  if (prepared.deploymentMode === 'arranged') {
    const rotations: RunFormationRotation[] = [0, 1, 2, 3];
    const primaryKingId = prepared.army.find((unit) => unit.type === 'king')?.id;
    const summaries = arrangedDeploymentCards(prepared).sort((left, right) => (
      Number(right.card.unitSeats.includes(primaryKingId ?? ''))
      - Number(left.card.unitSeats.includes(primaryKingId ?? ''))
    ));
    // Craft links are diagnostic conveniences rather than a second player-facing deployment mode.
    // Seat the required king first so a greedy preview cannot strand it behind optional formations.
    for (const summary of summaries) {
      if (!summary.admitted) continue;
      const option = rotations.flatMap((rotation) => (
        arrangedCardPlacementOptions(prepared, level, summary.card.id, rotation)
      ))[0];
      if (option) {
        prepared = placeArrangedDeploymentCard(
          prepared,
          level,
          summary.card.id,
          option.rotation,
          option.anchor,
        );
      }
    }
    const started = beginArrangedBattle(prepared);
    if (started.phase !== 'battle') {
      throw new RunCraftError(`craft: Battle ${prepared.battleIndex + 1} could not be arranged automatically.`);
    }
    return { run: started, layout: selectedDeploymentLayout(started, deploymentOptions(started, level)) };
  }
  prepared = setDeploymentTransport(prepared, 'full-deploy');
  while (prepared.phase === 'deployment') {
    if (prepared.deployment?.stage === 'card') {
      prepared = revealActiveDeploymentCard(prepared);
      continue;
    }
    if (prepared.deployment?.stage === 'revealing') {
      prepared = finishDeploymentCardReveal(prepared);
      continue;
    }
    if (prepared.deployment?.stage === 'settling') {
      prepared = finishDeploymentUnitSettlement(prepared, level);
      continue;
    }
    if (prepared.deployment?.stage === 'discarding') {
      prepared = finishDeploymentCardDiscard(prepared);
      continue;
    }
    const next = prepared.deployment?.stage === 'unit'
      ? placeRevealedDeploymentUnit(prepared, level)
      : advanceDeploymentTransport(prepared, level);
    if (next === prepared) {
      throw new RunCraftError(`craft: Battle ${prepared.battleIndex + 1} could not be deployed automatically.`);
    }
    prepared = next;
  }
  const options = deploymentOptions(prepared, level);
  return { run: prepared, layout: selectedDeploymentLayout(prepared, options) };
}

function fightBattle(run: RunDocument): RunDocument {
  const { run: deployed, layout } = autoDeploy(run);
  const deployedUnitIds = Object.keys(layout.placements);
  const started = deployed.phase === 'battle'
    ? deployed
    : beginBattle(deployed, deployedUnitIds, layout.reserveUnitIds, layout.blockedUnitIds);
  if (started.phase !== 'battle') throw new RunCraftError('craft: the crafted Battle could not be started.');
  // Every deployed unit survives a crafted Battle: the crafter is placing the player at a state,
  // not simulating an outcome.
  //
  // It is CLOSED and then left, rather than fast-forwarded straight into the Sectio, so the
  // Sectio a craft link lands on carries the Victory report it followed and can hand the player
  // back to it (ADR-0567). The accounting is unchanged: nothing was taken, so nothing surrendered
  // and the clock reads the same instant openSectio would have read. Only the turn count is
  // dressed, and turns pay nothing — par is a benchmark and the bonus is the clock (ADR-0539).
  const closed = closeBattle(started, {
    survivingUnitIds: deployedUnitIds,
    turns: DEFAULT_CRAFT_AFTERMATH_TURNS,
    standingEnemyValue: 0,
  });
  return leaveAftermath(closed);
}

/**
 * Stop at the aftermath report of the Battle the spec names, rather than fast-forwarding
 * through it into the Sectio.
 *
 * A crafted Battle is placed and not played, so it has no casualties, no turn count and no
 * clock. All three are put there through the transitions that would have written them: the
 * fallen are observed one at a time, and the Battle's recorded start is backdated so
 * closeBattle measures the elapsed time the spec asked for.
 */
function craftAftermath(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const { run: deployed, layout } = autoDeploy(run);
  const deployedUnitIds = Object.keys(layout.placements);
  let started = deployed.phase === 'battle'
    ? deployed
    : beginBattle(deployed, deployedUnitIds, layout.reserveUnitIds, layout.blockedUnitIds);
  if (started.phase !== 'battle') throw new RunCraftError('craft: the crafted Battle could not be started.');

  // A King that fell would have lost the Battle, so it is never on the casualty list.
  const canFall = deployedUnitIds.filter((id) => started.army.find((unit) => unit.id === id)?.type !== 'king');
  const fallenCount = spec.fallen ?? 0;
  if (fallenCount > canFall.length) {
    throw new RunCraftError(
      `craft fallen: Battle ${started.battleIndex + 1} deploys ${canFall.length} unit${canFall.length === 1 ? '' : 's'} that could fall.`,
    );
  }
  const fallen = new Set(canFall.slice(0, fallenCount));
  for (const unitId of fallen) started = observeRunUnitDeath(started, unitId).run;

  const elapsedMs = spec.elapsedMs ?? DEFAULT_CRAFT_AFTERMATH_ELAPSED_MS;
  started = {
    ...started,
    battleRuntime: started.battleRuntime
      ? { ...started.battleRuntime, startedAtMs: Date.now() - elapsedMs }
      : null,
  };
  // Nothing on the enemy side was taken in a Battle nobody played, so the force the level
  // fields is what a placed mate found still standing -- and that is also the report worth
  // landing on, since a Deditio of zero shows an empty measure.
  const closed = closeBattle(started, {
    survivingUnitIds: deployedUnitIds.filter((id) => !fallen.has(id)),
    turns: spec.turns ?? DEFAULT_CRAFT_AFTERMATH_TURNS,
    standingEnemyValue: spec.standingEnemyValue
      ?? levelEnemyForceValue(started.war.battles[started.battleIndex].level),
  });
  if (closed.phase !== 'aftermath') {
    throw new RunCraftError(
      `craft: Battle ${started.battleIndex + 1} ends the War, so the War's victory screen follows it rather than a Battle report. Craft victory instead.`,
    );
  }
  return closed;
}

/**
 * Get past a Conflict's opening screen by taking the first offer that will be accepted.
 * Fast-forwarding has to make the same mandatory choice a player would, and taking the offer
 * is also what advances the Run, so this is how the crafter reaches any later state. The Run's
 * opening grants a formation card; every later Conflict grants a lipsanon.
 */
function takeVacantiaAuto(run: RunDocument): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia) return run;
  if (run.vacantia.kind === 'opening') {
    for (const coreId of run.vacantia.cardOffers) {
      const taken = takeVacantiaCard(run, coreId);
      if (taken !== run) return taken;
    }
    throw new RunCraftError('craft: the Run opened with no card grant that could be taken.');
  }
  for (const lipsanon of run.vacantia.offers) {
    const taken = takeVacantiaLipsanon(run, lipsanon);
    if (taken !== run) return taken;
  }
  throw new RunCraftError('craft: the Conflict opened with no lipsanon that could be taken.');
}

function leaveSectioAuto(run: RunDocument): RunDocument {
  const next = takeVacantiaAuto(run);
  if (!canLeaveSectio(next)) {
    throw new RunCraftError(`craft: the Sectio after Battle ${(next.sectio?.afterBattleIndex ?? 0) + 1} could not be left.`);
  }
  return leaveSectio(next);
}

/**
 * Adlect the cards the Run should already HOLD in its first post-Battle Sectio.
 *
 * The point of the field is the Chartulary and everything downstream of Adlectio: real units
 * with real ids and card records the server validator accepts. Each card is staged as an ordinary
 * offer and acquired — never written into
 * `run.cards` directly. Gold is restored afterwards, so held cards do not silently pay for
 * themselves out of what the Run has to spend, and the staged offers are withdrawn so the Sectio
 * that is about to be left still reads as the one the game dealt.
 *
 * That withdrawal also takes the offer back out of `adlectedCardOfferIds`, which is what lets a
 * spec name more than one held card: a Sectio admits ONE card (`SECTIO_ADLECTIO_LIMIT`), and each
 * staged admission is retracted before the next is staged, so no card is ever adlected into a
 * visit that has already spent its admission.
 *
 * They are adlected at the earliest legal point, after Battle 1, and then live through every
 * later Battle before the target.
 */
function adlectHeldCards(run: RunDocument, cards: readonly RunCraftCard[] | null): RunDocument {
  if (!cards?.length) return run;
  if (!run.sectio) throw new RunCraftError('craft cards: there is no Sectio in which to perform Adlectio.');
  const goldTenths = run.goldTenths;
  let next = run;
  cards.forEach((card, index) => {
    const sectio = next.sectio!;
    const offer = craftOffer(next, card, HELD_CARD_SLOT_BASE + index);
    const staged: RunDocument = {
      ...next,
      goldTenths: next.goldTenths + offer.cost * GOLD_SCALE,
      sectio: { ...sectio, cardOffers: [...sectio.cardOffers, offer] },
    };
    const adlected = performAdlectio(staged, offer.offerId);
    if (adlected === staged) {
      throw new RunCraftError(`craft cards: "${card.pieces.join('+')}" could not be adlected.`);
    }
    next = {
      ...adlected,
      sectio: {
        ...adlected.sectio!,
        cardOffers: adlected.sectio!.cardOffers.filter((entry) => entry.offerId !== offer.offerId),
        adlectedCardOfferIds: adlected.sectio!.adlectedCardOfferIds.filter((id) => id !== offer.offerId),
      },
    };
  });
  // The Sectio's own entry snapshot moves with them: they are cards the Run came in holding, not
  // Adlectiones a Discard changes should undo.
  return {
    ...next,
    goldTenths,
    sectio: {
      ...next.sectio!,
      entrySnapshot: { ...next.sectio!.entrySnapshot, army: next.army, cards: next.cards, goldTenths },
    },
  };
}

/** Far above any real Sectio slot, so a staged held-card offer can never collide with a dealt one. */
const HELD_CARD_SLOT_BASE = 1000;

/** Fast-forward from the opening to the deployment of a target Battle by playing every Battle
 * before it. Held cards enter through the first post-Battle Sectio because no card acquisition
 * exists before Battle 1. */
function advanceToDeployment(run: RunDocument, battleIndex: number, held: readonly RunCraftCard[] | null): RunDocument {
  if (battleIndex === 0 && held?.length) {
    throw new RunCraftError('craft cards: cards cannot be held before the Sectio after Battle 1.');
  }
  let next = takeVacantiaAuto(run);
  let heldAdlected = false;
  let guard = 0;
  while (next.battleIndex < battleIndex) {
    if ((guard += 1) > 200) throw new RunCraftError('craft: fast-forward made no progress.');
    let inSectio = takeVacantiaAuto(fightBattle(next));
    if (inSectio.phase !== 'sectio') {
      throw new RunCraftError(`craft: the War ended before Battle ${battleIndex + 1}.`);
    }
    if (!heldAdlected && held?.length) {
      inSectio = adlectHeldCards(inSectio, held);
      heldAdlected = true;
    }
    next = leaveSectioAuto(inSectio);
  }
  return next;
}

function craftUnits(pieces: readonly AdlectablePieceType[]): RunCraftUnit[] {
  return pieces.map((type) => ({ type }));
}

/** The one-seat card that supplies a single unit of each adlectable type. */
const CRAFT_SUPPLYING_CARD_BY_TYPE: Readonly<Record<AdlectablePieceType, string>> = Object.freeze({
  pawn: 'p',
  knight: 'k',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
});

/**
 * Add units, AND the cards that seat them.
 *
 * The Chartulary is the roster: every army unit sits in a seat of a held card, and the server
 * refuses a document where one does not. `addArmyPieces` only appends units, because its caller in
 * Adlectio mints the card that seats them — craft names units rather than cards, so it has to mint
 * that card itself. Skipping it produced a document the validator rejected outright, which made
 * `army` and `add` unusable in every craft spec that carried them.
 *
 * One single-seat card per unit is the honest shape. The spec asked for units, and this is the
 * smallest Chartulary that legitimately supplies exactly those units and no others.
 */
function addPieces(run: RunDocument, units: readonly RunCraftUnit[]): RunDocument {
  const { addedUnits, ...update } = addArmyPieces(
    run,
    units.map((unit) => unit.type),
    'adlectio',
  );
  // Cards record the Battle they were acquired after, and the validator holds that inside the War.
  const acquiredAfterBattleIndex = Math.max(0, Math.min(run.battleIndex, run.war.battles.length - 1));
  let sequence = run.nextCardSequence;
  // addArmyPieces adds one unit per piece it is given, in order, so the crafted type is the one
  // at the same index — and that type is adlectable, which the added unit's wider type is not.
  const supplied = addedUnits.map((unit, index) => {
    const card = {
      id: `run-card-${sequence}`,
      coreId: CRAFT_SUPPLYING_CARD_BY_TYPE[units[index].type],
      unitSeats: [unit.id],
      acquiredAfterBattleIndex,
    };
    sequence += 1;
    return card;
  });
  return {
    ...run,
    ...update,
    cards: [...run.cards, ...supplied],
    nextCardSequence: sequence,
  };
}

/** Cards are the Run's Adlectio history; a crafted army rewrites the roster, so cards keep only the
 * units that still exist and empty leftovers are dropped rather than left as ghosts. */
function pruneEmptyCards(run: RunDocument): RunDocument {
  const unitIds = new Set(run.army.map((unit) => unit.id));
  const cards = run.cards
    .map((card) => ({
      ...card,
      unitSeats: card.unitSeats.map((unitId) => unitId && unitIds.has(unitId) ? unitId : null),
    }))
    .filter((card) => card.unitSeats.some(Boolean));
  return { ...run, cards };
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
    const acquired = acquireLipsanon(next, lipsanon);
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
  const core = RUN_CARD_BY_ID[card.coreId];
  if (!core) throw new RunCraftError(`craft offers: "${card.coreId}" is not an active formation card.`);
  void run.seed;
  return {
    ...core,
    pieces: [...core.pieces],
    formation: core.formation?.map((cell) => ({ ...cell })),
    offerId: `craft-${slotIndex}-${core.id}`,
    // A pinned offer names the CARD, not its price. Pricing is a Run rule, so the price is the
    // one this Run's market would print -- restating it as the card's material dealt a flat
    // market into a density Run, which is a state the game cannot reach and the server refuses.
    cost: runCardCost(core, runRules(run)),
  };
}

function applySectioOffers(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const sectio = run.sectio;
  if (!sectio) return run;
  const held = new Set(run.lipsana);
  for (const lipsanon of [...(spec.loot ?? []), ...(spec.paidLipsanon ? [spec.paidLipsanon] : [])]) {
    if (held.has(lipsanon)) throw new RunCraftError(`craft: "${lipsanon}" is already held, so it cannot also be offered.`);
  }
  const cardOffers = spec.offers ? spec.offers.map((card, index) => craftOffer(run, card, index)) : sectio.cardOffers;
  const offerIds = new Set(cardOffers.map((offer) => offer.offerId));
  if (offerIds.size !== cardOffers.length) {
    throw new RunCraftError('craft offers: the same card was offered twice; each Sectio card must be distinct.');
  }
  const paidLipsanonOffer = spec.paidLipsanon ?? sectio.paidLipsanonOffer;
  return {
    ...run,
    seenLipsana: [...new Set([...run.seenLipsana, ...(paidLipsanonOffer ? [paidLipsanonOffer] : [])])],
    sectio: {
      ...sectio,
      cardOffers,
      adlectedCardOfferIds: [],
      paidLipsanonOffer,
      paidLipsanonBought: false,
    },
  };
}

/** `loot=` now writes the Conflict's opening offers, which is where the lipsanon moved to. */
function applyVacantiaOffers(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const vacantia = run.vacantia;
  if (!vacantia || !spec.loot) return run;
  if (vacantia.kind === 'opening') {
    throw new RunCraftError('craft loot: the Run opens with a formation-card grant, not lipsana.');
  }
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
 * Inside a Sectio the entry snapshot moves with it, so Discard changes restores the crafted gold. */
function applyGold(run: RunDocument, goldTenths: number | null): RunDocument {
  if (goldTenths === null) return run;
  return {
    ...run,
    goldTenths,
    sectio: run.sectio
      ? { ...run.sectio, entrySnapshot: { ...run.sectio.entrySnapshot, goldTenths } }
      : run.sectio,
  };
}

/** Build the crafted Run. Every state is reached by the transitions the game itself plays. */
export function craftRunDocument(spec: RunCraftSpec, war: RunWarSnapshot): RunDocument {
  const battles = war.battles.length;
  const targetIndex = spec.battle - 1;
  if (spec.phase !== 'victory' && targetIndex >= battles) {
    throw new RunCraftError(`craft battle: ${war.name} has ${battles} Battle${battles === 1 ? '' : 's'}.`);
  }
  const opening = createRun(war, spec.seed, spec.ataraxiaTier, {
    chooseKing: spec.phase === 'commendatio',
  });

  // Commendatio is the Run's very first screen: the King has not been chosen, so the document
  // holds no army, no card and no King-borne gold. Nothing about a later Battle can be crafted
  // onto it, which is why it takes no overrides at all.
  if (spec.phase === 'commendatio') {
    if (targetIndex !== 0) throw new RunCraftError('craft: Commendatio is only ever before Battle 1.');
    if (spec.cards?.length || spec.army?.length || spec.add?.length) {
      throw new RunCraftError('craft: Commendatio precedes the King, so it can hold no army or cards.');
    }
    return opening;
  }

  // The Run's own first state. Bona Vacantia sits directly in front of Battle 1.
  if (spec.phase === 'bona-vacantia' && targetIndex === 0) {
    if (opening.phase !== 'bona-vacantia') {
      throw new RunCraftError(`craft: ${war.name} has no loot Battle, so no Conflict opens with a grant.`);
    }
    if (spec.cards?.length) {
      throw new RunCraftError('craft cards: cards cannot be held before the Sectio after Battle 1.');
    }
    // Offers last: the held-lipsanon guard can only see a lipsanon the
    // spec granted once applyLipsana has actually granted it.
    return applyGold(applyVacantiaOffers(applyLipsana(applyArmy(opening, spec), spec), spec), spec.goldTenths);
  }

  // There is intentionally no Sectio before Battle 1.
  if (spec.phase === 'sectio' && targetIndex === 0) {
    throw new RunCraftError('craft: the first Sectio follows Battle 1. Use craft=sectio&battle=2.');
  }

  const deploymentIndex = spec.phase === 'sectio'
    ? targetIndex - 1
    : spec.phase === 'victory' ? battles - 1 : targetIndex;
  if (
    spec.phase !== 'aftermath'
    && (spec.turns !== null || spec.elapsedMs !== null || spec.fallen !== null || spec.standingEnemyValue !== null)
  ) {
    throw new RunCraftError('craft: turns, seconds, fallen and standing describe a Battle report, so they belong to craft=aftermath.');
  }
  // A crafted army REPLACES the roster, which takes the units the held cards put there with it —
  // so the two ways of saying what the Run has cannot both be given.
  if (spec.cards && spec.army) {
    throw new RunCraftError('craft: cards and army cannot both be given. A crafted army replaces the roster the held cards put there; use add for extra units beside them.');
  }

  // A Conflict's lipsanon screen sits between the Battle that closed the previous Conflict and
  // the Sectio that follows it, so it is reached by fighting up to that Battle and stopping.
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

  // battle-victory is the same valid persisted Battle document. Its terminal board result is
  // an admin-only presentation instruction returned with the crafted response, never a second
  // Run phase or a field smuggled into the save document.
  if (spec.phase === 'battle' || spec.phase === 'battle-victory') {
    const { run: deployed } = autoDeploy(run);
    return applyGold(deployed, spec.goldTenths);
  }

  // The Battle report stands between the Battle and the Sectio, so it is reached by fighting
  // the Battle the spec names and stopping on the screen that closes it.
  if (spec.phase === 'aftermath') return applyGold(craftAftermath(run, spec), spec.goldTenths);

  const inSectio = takeVacantiaAuto(fightBattle(run));
  if (spec.phase === 'victory') {
    if (inSectio.phase !== 'victory') throw new RunCraftError('craft: the final Battle did not end the War.');
    return applyGold(inSectio, spec.goldTenths);
  }
  if (inSectio.phase !== 'sectio') {
    throw new RunCraftError(`craft: Battle ${deploymentIndex + 1} ended the War, so it has no Sectio after it.`);
  }
  return applyGold(applySectioOffers(inSectio, spec), spec.goldTenths);
}
