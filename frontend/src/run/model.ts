import type { Level, War } from '../core/level';
import type { PieceType } from '../core/types';
import { spawnEventsForLevel } from '../core/levelEvents';
import { createRng } from '../core/rng';

export const RUN_FORMAT_VERSION = 1;
export const GOLD_SCALE = 10;

export type PurchasablePieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen';
export type RunArmyPieceType = PurchasablePieceType | 'king';
export type RunAbility = 'discipline';

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
  type: RunArmyPieceType;
  abilities: RunAbility[];
  source: 'king' | 'starting' | 'draft' | 'shop';
}

export interface PieceBundle {
  id: string;
  pieces: PurchasablePieceType[];
  value: number;
}

export interface DraftOffer extends PieceBundle {
  draftId: 'pawn-rook' | 'knight-bishop' | 'bishop-bishop' | 'knight-knight' | 'three-pawns-minor';
}

export type RunRelicId =
  | 'conscription-notice'
  | 'congressional-approval'
  | 'inspirational-record'
  | 'training-linens'
  | 'royal-decree'
  | 'crenellated-rampart'
  | 'ghibelline-rampart'
  | 'popes-staff'
  | 'popes-robes'
  | 'royal-tent'
  | 'royal-sceptre'
  | 'mercenarys-rifle'
  | 'merchants-shopkey'
  | 'occult-dagger'
  | 'deployment-vehicle'
  | 'mercenary-boat'
  | 'quartermasters-ledger'
  | 'fair-scales'
  | 'muster-roll'
  | 'surveyors-compass';

export interface RunRelicDefinition {
  id: RunRelicId;
  name: string;
  description: string;
  requires?: RunRelicId;
  immediate?: boolean;
}

export const RUN_RELICS: readonly RunRelicDefinition[] = Object.freeze([
  { id: 'conscription-notice', name: 'Conscription Notice', description: 'Choose one army unit. It permanently gains Discipline.' },
  { id: 'congressional-approval', name: 'Congressional Approval', description: 'Gain 5 gold immediately.', immediate: true },
  { id: 'inspirational-record', name: 'Inspirational Record', description: 'Before each Battle, one random persistent unit gains Discipline for that Battle.' },
  { id: 'training-linens', name: 'Training Linens', description: 'Pawns gain Positioned and prefer the front deployment row.' },
  { id: 'royal-decree', name: 'Royal Decree', description: 'Your King gains Positioned and prefers the back deployment row.' },
  { id: 'crenellated-rampart', name: 'Crenellated Rampart', description: 'Rooks gain Positioned and prefer the outer back-row squares.' },
  { id: 'ghibelline-rampart', name: 'Ghibelline Rampart', description: 'Rooks prefer opposite sides of the King and retain corner placement when possible.' },
  { id: 'popes-staff', name: "Pope's Staff", description: 'Bishops prefer the back deployment row.' },
  { id: 'popes-robes', name: "Pope's Robes", description: 'Bishops alternate light and dark starting squares; an odd extra color is random.' },
  { id: 'royal-tent', name: 'Royal Tent', description: 'Place up to three temporary rocks in front of the King.', requires: 'royal-decree' },
  { id: 'royal-sceptre', name: 'Royal Sceptre', description: 'Your King starts on a board-edge square in the placement zone.' },
  { id: 'mercenarys-rifle', name: "Mercenary's Rifle", description: 'After victory, gain 10% of the value of surviving persistent units.' },
  { id: 'merchants-shopkey', name: "Merchant's Shopkey", description: 'Each Conflict keeps one additional relic in its shops for 10 gold.' },
  { id: 'occult-dagger', name: 'Occult Dagger', description: 'Gain 10 gold. Eliminate every enemy non-King before checkmating the King.', immediate: true },
  { id: 'deployment-vehicle', name: 'Deployment Vehicle', description: 'Deaths can call equal-or-lower-value blocked units through the Reservist pool.' },
  { id: 'mercenary-boat', name: 'Mercenary Boat', description: 'A promoting persistent Pawn may vanish permanently instead and grant 2 gold.' },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", description: 'Piece shops reveal four bundles instead of three.' },
  { id: 'fair-scales', name: 'Fair Scales', description: 'Units sell for 75% of their value instead of 50%.' },
  { id: 'muster-roll', name: 'Muster Roll', description: 'When capacity is short, choose which army units sit out.' },
  { id: 'surveyors-compass', name: "Surveyor's Compass", description: 'Choose between two deterministic random deployment layouts.' },
] as const);

export const RUN_RELIC_BY_ID: Readonly<Record<RunRelicId, RunRelicDefinition>> = Object.freeze(
  Object.fromEntries(RUN_RELICS.map((relic) => [relic.id, relic])) as Record<RunRelicId, RunRelicDefinition>,
);

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

export type RunPhase = 'draft' | 'deployment' | 'battle' | 'shop' | 'victory';

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
  afterBattleIndex: number;
  conflictIndex: number;
  victoryGoldTenths: number;
  bundleOfferIds: string[];
  purchasedBundleId: string | null;
  lootRelicOffers: RunRelicId[];
  chosenLootRelicId: RunRelicId | null;
  paidRelicOffer: RunRelicId | null;
  paidRelicBought: boolean;
}

export interface RunDocument {
  formatVersion: typeof RUN_FORMAT_VERSION;
  id: string;
  seed: number;
  updatedAt: string;
  war: RunWarSnapshot;
  phase: RunPhase;
  battleIndex: number;
  conflictIndex: number;
  goldTenths: number;
  army: RunArmyUnit[];
  relics: RunRelicId[];
  seenRelics: RunRelicId[];
  conflictPaidRelics: Record<string, { relicId: RunRelicId; bought: boolean }>;
  draftOffers: DraftOffer[];
  chosenDraftId: DraftOffer['draftId'] | null;
  nextArmyUnitSequence: number;
  deployment: RunDeploymentState | null;
  battleRuntime: RunBattleRuntime | null;
  shop: RunShopState | null;
}

const PURCHASE_ORDER: readonly PurchasablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

function bundleId(pieces: readonly PurchasablePieceType[]): string {
  return pieces.map((piece) => piece[0]).join('');
}

export function allPieceBundles(): PieceBundle[] {
  const bundles: PieceBundle[] = [];
  const visit = (typeIndex: number, remaining: number, pieces: PurchasablePieceType[]): void => {
    if (remaining === 0) {
      const value = pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
      if (value >= 1 && value <= 9) bundles.push({ id: bundleId(pieces), pieces: [...pieces], value });
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
  return bundles.sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

export const PIECE_BUNDLE_DECK: readonly PieceBundle[] = Object.freeze(allPieceBundles());
export const PIECE_BUNDLE_BY_ID: Readonly<Record<string, PieceBundle>> = Object.freeze(
  Object.fromEntries(PIECE_BUNDLE_DECK.map((bundle) => [bundle.id, bundle])),
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

function openingDraftPool(seed: number): DraftOffer[] {
  const minor = createRng(mixSeed(seed, 'draft-minor')).pick(['knight', 'bishop'] as const);
  const offer = (
    draftId: DraftOffer['draftId'],
    pieces: PurchasablePieceType[],
  ): DraftOffer => ({
    draftId,
    pieces,
    id: `draft-${draftId}-${pieces.join('-')}`,
    value: pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0),
  });
  return [
    offer('pawn-rook', ['pawn', 'rook']),
    offer('knight-bishop', ['knight', 'bishop']),
    offer('bishop-bishop', ['bishop', 'bishop']),
    offer('knight-knight', ['knight', 'knight']),
    offer('three-pawns-minor', ['pawn', 'pawn', 'pawn', minor]),
  ];
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

function initialArmy(): RunArmyUnit[] {
  return [
    { id: 'run-king', type: 'king', abilities: [], source: 'king' },
    { id: 'run-pawn-a', type: 'pawn', abilities: [], source: 'starting' },
    { id: 'run-pawn-b', type: 'pawn', abilities: [], source: 'starting' },
    { id: 'run-pawn-c', type: 'pawn', abilities: [], source: 'starting' },
  ];
}

export function createRun(war: RunWarSnapshot, seed: number, now = new Date().toISOString()): RunDocument {
  const offers = shuffled(openingDraftPool(seed), mixSeed(seed, 'draft-offers')).slice(0, 2);
  return {
    formatVersion: RUN_FORMAT_VERSION,
    id: freshRunId(),
    seed: seed >>> 0,
    updatedAt: now,
    war,
    phase: 'draft',
    battleIndex: 0,
    conflictIndex: 0,
    goldTenths: 0,
    army: initialArmy(),
    relics: [],
    seenRelics: [],
    conflictPaidRelics: {},
    draftOffers: offers,
    chosenDraftId: null,
    nextArmyUnitSequence: 1,
    deployment: null,
    battleRuntime: null,
    shop: null,
  };
}

function touch(run: RunDocument): RunDocument {
  return { ...run, updatedAt: new Date().toISOString() };
}

export function normalizeRunDocument(run: RunDocument): RunDocument {
  if (
    run.phase !== 'shop'
    || !run.shop
    || (Number.isSafeInteger(run.shop.victoryGoldTenths) && run.shop.victoryGoldTenths >= 0)
  ) return run;
  const battle = run.war.battles[run.shop.afterBattleIndex];
  if (!battle) return run;
  const reward = battleVictoryGoldTenths(battle.level);
  return {
    ...run,
    goldTenths: Math.max(0, run.goldTenths + reward - GOLD_SCALE),
    shop: { ...run.shop, victoryGoldTenths: reward },
  };
}

function addArmyPieces(
  run: RunDocument,
  pieces: readonly PurchasablePieceType[],
  source: RunArmyUnit['source'],
): Pick<RunDocument, 'army' | 'nextArmyUnitSequence'> {
  let sequence = run.nextArmyUnitSequence;
  const added = pieces.map((type): RunArmyUnit => {
    const unit = { id: `run-unit-${sequence}`, type, abilities: [], source };
    sequence += 1;
    return unit;
  });
  return { army: [...run.army, ...added], nextArmyUnitSequence: sequence };
}

export function chooseDraft(run: RunDocument, draftId: DraftOffer['draftId']): RunDocument {
  if (run.phase !== 'draft') return run;
  const offer = run.draftOffers.find((candidate) => candidate.draftId === draftId);
  if (!offer) return run;
  return touch({
    ...run,
    ...addArmyPieces(run, offer.pieces, 'draft'),
    chosenDraftId: draftId,
    phase: 'deployment',
  });
}

export function hasRelic(run: RunDocument, relic: RunRelicId): boolean {
  return run.relics.includes(relic);
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
  return touch({
    ...run,
    army: run.army.filter((candidate) => candidate.id !== unitId),
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

export function openShop(run: RunDocument, survivingUnitIds: readonly string[]): RunDocument {
  if (run.phase !== 'battle') return run;
  const finalBattle = run.battleIndex >= run.war.battles.length - 1;
  if (finalBattle) return touch({ ...run, phase: 'victory', shop: null, deployment: null, battleRuntime: null });

  const survivorSet = new Set(survivingUnitIds);
  const rifleTenths = hasRelic(run, 'mercenarys-rifle')
    ? run.army.reduce((total, unit) => total + (survivorSet.has(unit.id) ? PIECE_VALUE[unit.type] : 0), 0)
    : 0;
  const victoryGoldTenths = battleVictoryGoldTenths(run.war.battles[run.battleIndex].level);
  let next: RunDocument = {
    ...run,
    phase: 'shop',
    goldTenths: run.goldTenths + victoryGoldTenths + rifleTenths,
    deployment: null,
    battleRuntime: null,
  };
  const bundleCount = hasRelic(next, 'quartermasters-ledger') ? 4 : 3;
  const bundleOfferIds = shuffled(PIECE_BUNDLE_DECK, mixSeed(next.seed, 'shop-bundles', next.battleIndex))
    .slice(0, bundleCount)
    .map((bundle) => bundle.id);
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
  return touch({
    ...next,
    shop: {
      afterBattleIndex: next.battleIndex,
      conflictIndex: next.conflictIndex,
      victoryGoldTenths,
      bundleOfferIds,
      purchasedBundleId: null,
      lootRelicOffers: lootReveal.offers,
      chosenLootRelicId: null,
      paidRelicOffer,
      paidRelicBought,
    },
  });
}

export function buyBundle(run: RunDocument, offerId: string): RunDocument {
  const bundle = PIECE_BUNDLE_BY_ID[offerId];
  if (run.phase !== 'shop' || !run.shop || run.shop.purchasedBundleId || !run.shop.bundleOfferIds.includes(offerId) || !bundle) return run;
  const cost = bundle.value * GOLD_SCALE;
  if (run.goldTenths < cost) return run;
  return touch({
    ...run,
    ...addArmyPieces(run, bundle.pieces, 'shop'),
    goldTenths: run.goldTenths - cost,
    shop: { ...run.shop, purchasedBundleId: offerId },
  });
}

export function sellArmyUnit(run: RunDocument, unitId: string): RunDocument {
  if (run.phase !== 'shop') return run;
  const unit = run.army.find((candidate) => candidate.id === unitId);
  if (!unit || unit.type === 'king') return run;
  const numerator = hasRelic(run, 'fair-scales') ? 75 : 50;
  const proceedsTenths = (PIECE_VALUE[unit.type] * GOLD_SCALE * numerator) / 100;
  return touch({
    ...run,
    army: run.army.filter((candidate) => candidate.id !== unitId),
    goldTenths: run.goldTenths + proceedsTenths,
  });
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
  if (run.phase !== 'shop' || !run.shop) return run;
  if (run.shop.lootRelicOffers.length > 0 && !run.shop.chosenLootRelicId) return run;
  const endedConflict = run.war.battles[run.shop.afterBattleIndex]?.loot === true;
  return touch({
    ...run,
    phase: 'deployment',
    battleIndex: run.battleIndex + 1,
    conflictIndex: run.conflictIndex + (endedConflict ? 1 : 0),
    deployment: null,
    battleRuntime: null,
    shop: null,
  });
}

export function formatGold(goldTenths: number): string {
  const gold = goldTenths / GOLD_SCALE;
  return gold.toFixed(Number.isInteger(gold) ? 0 : Number.isInteger(gold * 10) ? 1 : 2);
}

export function bundleLabel(bundle: Pick<PieceBundle, 'pieces'>): string {
  const counts = new Map<PurchasablePieceType, number>();
  for (const piece of bundle.pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return PURCHASE_ORDER
    .filter((piece) => counts.has(piece))
    .map((piece) => `${counts.get(piece)! > 1 ? `${counts.get(piece)} ` : ''}${PIECE_LABEL[piece]}${counts.get(piece)! > 1 ? 's' : ''}`)
    .join(' + ');
}

export function isRunArmyPieceType(value: PieceType): value is RunArmyPieceType {
  return value === 'pawn' || value === 'knight' || value === 'bishop' || value === 'rook' || value === 'queen' || value === 'king';
}
