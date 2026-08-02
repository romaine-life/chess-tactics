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
// applies the requested overrides in the phase where each one is legal (army and relics before a
// Battle, offers and gold in the Shop that a real openShop() produced). What comes out is a
// document the game and the server both accept, because the game built it.
//
// The URL grammar lives here too, so links stay the shared contract between the owner and an agent.

import type { Level, War } from '../core/level';
import { createRng } from '../core/rng';
import {
  DISCIPLINE_COST,
  GOLD_SCALE,
  PIECE_VALUE,
  PLAGUED_DISCOUNT,
  POSITIONED_COST,
  RUN_CARD_BY_ID,
  RUN_RELIC_BY_ID,
  acquireRelic,
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
  takeLootRelic,
  type AtaraxiaTier,
  type PurchasablePieceType,
  type RunCardOffer,
  type RunCardType,
  type RunDocument,
  type RunRelicId,
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
  'loot',
  'paid',
  'relics',
]);

export const DEFAULT_CRAFT_SEED = 1337;

export type RunCraftPhase = 'shop' | 'deployment' | 'battle' | 'victory';

export interface RunCraftCard {
  pieces: PurchasablePieceType[];
  cardType: RunCardType | null;
}

export interface RunCraftSpec {
  phase: RunCraftPhase;
  /** 1-based Battle number, matching the "Battle 2 / 4" the title bar shows. */
  battle: number;
  warId: string | null;
  seed: number;
  ataraxiaTier: AtaraxiaTier;
  goldTenths: number | null;
  army: PurchasablePieceType[] | null;
  add: PurchasablePieceType[] | null;
  offers: RunCraftCard[] | null;
  loot: RunRelicId[] | null;
  paidRelic: RunRelicId | null;
  relics: RunRelicId[] | null;
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

const CARD_TYPES: Readonly<Record<string, RunCardType | null>> = Object.freeze({
  plain: null,
  none: null,
  tactical: 'tactical',
  discipline: 'tactical',
  concinnous: 'concinnous',
  positioned: 'concinnous',
  pestiferous: 'pestiferous',
  plagued: 'pestiferous',
});

const CRAFT_PHASES: readonly RunCraftPhase[] = ['shop', 'deployment', 'battle', 'victory'];

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
      `craft offers: "${typePart}" is not a card type. Use tactical, concinnous, pestiferous or plain.`,
    );
  }
  return { pieces, cardType: CARD_TYPES[key] };
}

function relicList(raw: string, label: string): RunRelicId[] {
  return raw.split(',').map((token) => token.trim()).filter(Boolean).map((id) => {
    if (!RUN_RELIC_BY_ID[id as RunRelicId]) throw new RunCraftError(`craft ${label}: "${id}" is not a relic id.`);
    return id as RunRelicId;
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
  const army = params.get('army');
  const add = params.get('add');
  const loot = params.get('loot');
  const paid = params.get('paid');
  const relics = params.get('relics');
  return {
    phase: phase as RunCraftPhase,
    battle: params.get('battle') === null ? 1 : integer(params.get('battle')!, 'battle', 1, 100),
    warId: params.get('war'),
    seed: params.get('seed') === null ? DEFAULT_CRAFT_SEED : integer(params.get('seed')!, 'seed', 0, 0xffffffff),
    ataraxiaTier: (params.get('tier') === null ? 0 : integer(params.get('tier')!, 'tier', 0, 1)) as AtaraxiaTier,
    goldTenths,
    army: army === null ? null : pieceList(army, 'army'),
    add: add === null ? null : pieceList(add, 'add'),
    offers: offers === null ? null : offers.split(',').map((token) => token.trim()).filter(Boolean).map(cardSpec),
    loot: loot === null ? null : relicList(loot, 'loot'),
    paidRelic: paid === null ? null : relicList(paid, 'paid')[0] ?? null,
    relics: relics === null ? null : relicList(relics, 'relics'),
  };
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
  if (options.disciplineUnitIds.length) {
    // Disciplined units are placed by hand in play, so the crafter places them the same way:
    // the first free deployment cells, deterministically.
    const layout = selectedDeploymentLayout(prepared, options);
    const used = new Set(Object.values(layout.placements).map((cell) => `${cell.x},${cell.y}`));
    const manualPlacements = { ...(prepared.deployment?.manualPlacements ?? {}) };
    for (const unitId of options.disciplineUnitIds) {
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

function leaveShopAuto(run: RunDocument): RunDocument {
  let next = run;
  const shop = next.shop;
  if (shop && shop.lootRelicOffers.length && !shop.chosenLootRelicId) {
    const target = firstNonKingUnitId(next);
    for (const relic of shop.lootRelicOffers) {
      const taken = takeLootRelic(next, relic, target);
      if (taken !== next) {
        next = taken;
        break;
      }
    }
  }
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

/** Fast-forward from the opening Shop to the deployment of a target Battle by playing every
 * Battle before it. */
function advanceToDeployment(run: RunDocument, battleIndex: number): RunDocument {
  let next = leaveShopAuto(buyOpeningCard(run));
  let guard = 0;
  while (next.battleIndex < battleIndex) {
    if ((guard += 1) > 200) throw new RunCraftError('craft: fast-forward made no progress.');
    const shopped = fightBattle(next);
    if (shopped.phase !== 'shop') {
      throw new RunCraftError(`craft: the War ended before Battle ${battleIndex + 1}.`);
    }
    next = leaveShopAuto(shopped);
  }
  return next;
}

function addPieces(run: RunDocument, pieces: readonly PurchasablePieceType[]): RunDocument {
  const { addedUnits: _addedUnits, ...update } = addArmyPieces(run, pieces, 'shop');
  return { ...run, ...update };
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

function applyRelics(run: RunDocument, spec: RunCraftSpec): RunDocument {
  let next = run;
  for (const relic of spec.relics ?? []) {
    const target = firstNonKingUnitId(next);
    const acquired = acquireRelic(next, relic, target);
    if (acquired === next) throw new RunCraftError(`craft relics: "${relic}" could not be acquired.`);
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
  const plaguedPieceIndex = card.cardType === 'pestiferous'
    ? seededPestiferousTarget(effectSeed, core.pieces.map((_piece, index) => index), 0)
    : null;
  const plaguedPiece = plaguedPieceIndex === null ? null : core.pieces[plaguedPieceIndex];
  return {
    ...core,
    pieces: [...core.pieces],
    offerId: `craft-${slotIndex}-${core.id}`,
    // The exact pricing the game and the server both derive; a hand-set cost is rejected.
    cost: plaguedPiece
      ? core.value - PLAGUED_DISCOUNT[plaguedPiece]
      : core.value + (card.cardType === 'tactical'
        ? DISCIPLINE_COST
        : card.cardType === 'concinnous' ? POSITIONED_COST : 0),
    cardType: card.cardType,
    effectSeed,
    plaguedPieceIndex,
    effectTargetIndex: card.cardType === 'concinnous'
      ? createRng(mixSeed(effectSeed, 'concinnous-target')).int(core.pieces.length)
      : null,
  };
}

function applyShopOffers(run: RunDocument, spec: RunCraftSpec): RunDocument {
  const shop = run.shop;
  if (!shop) return run;
  const held = new Set(run.relics);
  for (const relic of [...(spec.loot ?? []), ...(spec.paidRelic ? [spec.paidRelic] : [])]) {
    if (held.has(relic)) throw new RunCraftError(`craft: "${relic}" is already held, so it cannot also be offered.`);
  }
  const cardOffers = spec.offers ? spec.offers.map((card, index) => craftOffer(run, card, index)) : shop.cardOffers;
  const offerIds = new Set(cardOffers.map((offer) => offer.offerId));
  if (offerIds.size !== cardOffers.length) {
    throw new RunCraftError('craft offers: the same card was offered twice; each Shop card must be distinct.');
  }
  const lootRelicOffers = spec.loot ?? shop.lootRelicOffers;
  const paidRelicOffer = spec.paidRelic ?? shop.paidRelicOffer;
  return {
    ...run,
    seenRelics: [...new Set([...run.seenRelics, ...lootRelicOffers, ...(paidRelicOffer ? [paidRelicOffer] : [])])],
    shop: {
      ...shop,
      cardOffers,
      purchasedCardOfferIds: [],
      lootRelicOffers,
      chosenLootRelicId: null,
      paidRelicOffer,
      paidRelicBought: false,
    },
  };
}

/** Gold is set last so relic payouts and Battle rewards cannot move the number off the request.
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

const OPENING_SHOP_OVERRIDES: readonly (keyof RunCraftSpec)[] = ['goldTenths', 'army', 'add', 'offers', 'loot', 'paidRelic', 'relics'];

/** Build the crafted Run. Every state is reached by the transitions the game itself plays. */
export function craftRunDocument(spec: RunCraftSpec, war: RunWarSnapshot): RunDocument {
  const battles = war.battles.length;
  const targetIndex = spec.battle - 1;
  if (spec.phase !== 'victory' && targetIndex >= battles) {
    throw new RunCraftError(`craft battle: ${war.name} has ${battles} Battle${battles === 1 ? '' : 's'}.`);
  }
  const opening = createRun(war, spec.seed, spec.ataraxiaTier);

  // The opening Shop is pinned by the server contract — its offers, army and 8 starting gold are
  // checked value by value — so it is craftable only as itself.
  if (spec.phase === 'shop' && targetIndex === 0) {
    const overridden = OPENING_SHOP_OVERRIDES.filter((key) => spec[key] !== null);
    if (overridden.length) {
      throw new RunCraftError(
        'craft: the opening Shop is fixed by the Run contract and takes no overrides. Craft battle=2 or later for a Shop with crafted contents.',
      );
    }
    return opening;
  }

  const deploymentIndex = spec.phase === 'shop'
    ? targetIndex - 1
    : spec.phase === 'victory' ? battles - 1 : targetIndex;
  let run = advanceToDeployment(opening, deploymentIndex);
  run = applyRelics(applyArmy(run, spec), spec);

  if (spec.phase === 'deployment') return applyGold(prepareDeployment(run), spec.goldTenths);

  if (spec.phase === 'battle') {
    const { run: deployed, layout } = autoDeploy(run);
    return applyGold(
      beginBattle(deployed, Object.keys(layout.placements), layout.reserveUnitIds, layout.blockedUnitIds),
      spec.goldTenths,
    );
  }

  const shopped = fightBattle(run);
  if (spec.phase === 'victory') {
    if (shopped.phase !== 'victory') throw new RunCraftError('craft: the final Battle did not end the War.');
    return applyGold(shopped, spec.goldTenths);
  }
  if (shopped.phase !== 'shop') {
    throw new RunCraftError(`craft: Battle ${deploymentIndex + 1} ended the War, so it has no Shop after it.`);
  }
  return applyGold(applyShopOffers(shopped, spec), spec.goldTenths);
}
