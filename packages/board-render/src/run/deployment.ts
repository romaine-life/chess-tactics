import type { Level, LevelUnit } from '../core/level';
import type { Vec } from '../core/types';
import { createRng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';
import { propCells, propDef } from '../core/props';
import { defaultFacingForSide, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import {
  beginBattle,
  hasLipsanon,
  mixSeed,
  PIECE_VALUE,
  runCardDefinition,
  runCardUnitIds,
  setDeploymentChoices,
  type RunArmyUnit,
  type RunDeploymentTransport,
  type RunDocument,
  type RunOwnedCard,
} from './model';

export interface RunDeploymentLayout {
  index: 0 | 1;
  placements: Record<string, Vec>;
  blockedUnitIds: string[];
  reserveUnitIds: string[];
  temporaryRocks: Vec[];
  trace: RunDeploymentTraceEntry[];
}

export type RunDeploymentTraceResult = 'blocked' | 'automatic' | 'stranded';

export interface RunDeploymentTraceEntry {
  unitId: string;
  type: PlayablePieceType;
  result: RunDeploymentTraceResult;
  eligibleCellCount: number;
  availableCellCount?: number;
  automaticOrder?: number;
  candidateCount?: number;
  chosen?: Vec;
  score?: number;
  formationCardId?: string;
  formationPreserved?: boolean;
}

export interface RunDeploymentOptions {
  zoneCells: Vec[];
  overflowCount: number;
  hasBlockedChoice: false;
  needsBlockedChoice: false;
  blockedChoiceCount: number;
  layouts: [RunDeploymentLayout, RunDeploymentLayout];
}

export interface PlayerDeploymentPools {
  all: Vec[];
  byType: Record<PlayablePieceType, Vec[]>;
}

const key = (cell: Vec): string => `${cell.x},${cell.y}`;
const fromKey = (value: string): Vec | null => {
  const match = /^(-?\d+),(-?\d+)$/.exec(value);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};
const sortCells = (cells: Iterable<Vec>): Vec[] => [...cells].sort((a, b) => a.y - b.y || a.x - b.x);

function authoredOccupied(level: Level): Set<string> {
  const occupied = new Set(level.layers.units.map((unit) => `${unit.x},${unit.y}`));
  for (const placed of level.layers.props ?? []) {
    const def = propDef(placed.propId);
    if (!def?.blocking) continue;
    for (const cell of propCells(placed.x, placed.y, def)) occupied.add(key(cell));
  }
  return occupied;
}

/** Pawn-only deployment geometry is retired. The general player zone owns every unit;
 * existing King-only geometry remains readable for old authored levels but is not required. */
function deploymentPools(level: Level, occupied: ReadonlySet<string>): PlayerDeploymentPools {
  const terrain = new Map(level.layers.terrain.map((cell) => [key(cell), cell]));
  const all = new Map<string, Vec>();
  const byType = new Map<PlayablePieceType, Map<string, Vec>>(
    PLAYABLE_PIECE_TYPES.map((type) => [type, new Map<string, Vec>()]),
  );
  for (const zone of level.layers.zones) {
    if (zone.type !== 'player-spawn' && zone.type !== 'player-king-spawn') continue;
    const offeredTypes: PlayablePieceType[] = zone.type === 'player-king-spawn'
      ? ['king']
      : PLAYABLE_PIECE_TYPES.filter((type) => type !== 'king' || !zone.excludedPieceTypes?.includes('king'));
    for (const [x, y] of zone.tiles) {
      const cell = { x, y };
      const terrainCell = terrain.get(key(cell));
      if (
        x < 0 || y < 0 || x >= level.board.cols || y >= level.board.rows
        || occupied.has(key(cell))
        || (terrainCell && !isPassableTerrain(terrainCell.terrain))
      ) continue;
      all.set(key(cell), cell);
      for (const type of offeredTypes) byType.get(type)!.set(key(cell), cell);
    }
  }
  return {
    all: sortCells(all.values()),
    byType: Object.fromEntries(
      PLAYABLE_PIECE_TYPES.map((type) => [type, sortCells(byType.get(type)!.values())]),
    ) as Record<PlayablePieceType, Vec[]>,
  };
}

export function playerDeploymentPools(level: Level): PlayerDeploymentPools {
  return deploymentPools(level, authoredOccupied(level));
}

export function playerDeploymentCells(level: Level): Vec[] {
  return playerDeploymentPools(level).all;
}

type PlacementChoice = Readonly<{
  cell: Vec | null;
  trace: RunDeploymentTraceEntry;
}>;

function automaticPlacementChoice(
  run: RunDocument,
  level: Level,
  unit: RunArmyUnit,
  placements: Readonly<Record<string, Vec>>,
  order: number,
): PlacementChoice {
  const pools = playerDeploymentPools(level);
  const used = new Set(Object.values(placements).map(key));
  const candidates = pools.byType[unit.type].filter((cell) => !used.has(key(cell)));
  const availableCellCount = candidates.length;
  const rng = createRng(mixSeed(run.deployment?.seed ?? run.seed, `placement:${unit.id}`, order));
  const chosen = candidates.length ? candidates[rng.int(candidates.length)] : null;
  return {
    cell: chosen,
    trace: {
      unitId: unit.id,
      type: unit.type,
      result: chosen ? 'automatic' : 'stranded',
      eligibleCellCount: pools.byType[unit.type].length,
      availableCellCount,
      automaticOrder: order + 1,
      candidateCount: candidates.length,
      ...(chosen ? { chosen } : {}),
    },
  };
}

function decodedPlacements(run: RunDocument): Record<string, Vec> {
  return Object.fromEntries(Object.entries(run.deployment?.placements ?? {}).flatMap(([unitId, value]) => {
    const cell = fromKey(value);
    return cell ? [[unitId, cell]] : [];
  }));
}

function temporaryTentRocks(run: RunDocument, level: Level, placements: Readonly<Record<string, Vec>>): Vec[] {
  if (!hasLipsanon(run, 'royal-tent')) return [];
  const king = run.army.find((unit) => unit.type === 'king');
  const kingCell = king ? placements[king.id] : undefined;
  if (!kingCell) return [];
  const occupied = new Set([...authoredOccupied(level), ...Object.values(placements).map(key)]);
  const terrain = new Map(level.layers.terrain.map((cell) => [key(cell), cell]));
  const rocks: Vec[] = [];
  for (const dx of [-1, 0, 1]) {
    const cell = { x: kingCell.x + dx, y: kingCell.y - 1 };
    const terrainCell = terrain.get(key(cell));
    if (
      cell.x < 0 || cell.y < 0 || cell.x >= level.board.cols || cell.y >= level.board.rows
      || occupied.has(key(cell))
      || (terrainCell && !isPassableTerrain(terrainCell.terrain))
    ) continue;
    occupied.add(key(cell));
    rocks.push(cell);
  }
  return rocks;
}

function dealtCards(run: RunDocument): RunOwnedCard[] {
  const byId = new Map(run.cards.map((card) => [card.id, card]));
  return (run.deployment?.dealtCardIds ?? []).flatMap((cardId) => {
    const card = byId.get(cardId);
    return card ? [card] : [];
  });
}

export function activeDeploymentCard(run: RunDocument): RunOwnedCard | null {
  return dealtCards(run)[run.deployment?.activeCardIndex ?? -1] ?? null;
}

type FormationPlan = Readonly<{
  placements: Record<string, Vec>;
  preserved: boolean;
}>;

function decodedFormationPlan(run: RunDocument, cardId: string): FormationPlan | null {
  const encoded = run.deployment?.formationPlans?.[cardId];
  if (!encoded) return null;
  const placements = Object.fromEntries(Object.entries(encoded).flatMap(([unitId, value]) => {
    const cell = fromKey(value);
    return cell ? [[unitId, cell]] : [];
  }));
  return { placements, preserved: true };
}

/** Plan one complete visible card shape before any of its units arrive. The plan is
 * persisted separately from committed placements so future figures do not appear early. */
function planCardFormation(
  run: RunDocument,
  level: Level,
  card: RunOwnedCard,
  committed: Readonly<Record<string, Vec>>,
): FormationPlan {
  const definition = runCardDefinition(card.coreId);
  const pools = playerDeploymentPools(level);
  const occupied = new Set(Object.values(committed).map(key));
  const formation = definition?.formation
    ?? card.unitSeats.map((_, x) => ({ x, y: 0 }));
  const seats = formation.flatMap((offset, index) => {
    const unitId = card.unitSeats[index];
    const unit = unitId ? run.army.find((candidate) => candidate.id === unitId) : undefined;
    return unit && run.deployment?.deployingUnitIds.includes(unit.id) && !committed[unit.id]
      ? [{ unit, offset }]
      : [];
  });
  if (!seats.length) return { placements: {}, preserved: true };

  const eligibleByType = new Map(
    PLAYABLE_PIECE_TYPES.map((type) => [type, new Set(pools.byType[type].map(key))]),
  );
  const first = seats[0];
  const anchors = pools.byType[first.unit.type].flatMap((firstCell) => {
    const anchor = { x: firstCell.x - first.offset.x, y: firstCell.y - first.offset.y };
    const targets = seats.map(({ unit, offset }) => ({
      unitId: unit.id,
      cell: { x: anchor.x + offset.x, y: anchor.y + offset.y },
      type: unit.type,
    }));
    const keys = targets.map(({ cell }) => key(cell));
    return keys.length === new Set(keys).size
      && targets.every(({ cell, type }) => eligibleByType.get(type)?.has(key(cell)) && !occupied.has(key(cell)))
      ? [targets]
      : [];
  });
  if (anchors.length) {
    const chosen = createRng(mixSeed(
      run.deployment?.seed ?? run.seed,
      `card-formation:${card.id}`,
      run.deployment?.activeCardIndex ?? 0,
    )).pick(anchors);
    return {
      placements: Object.fromEntries(chosen.map(({ unitId, cell }) => [unitId, cell])),
      preserved: true,
    };
  }

  // Pragmatic first-pass recovery: if the whole shape has no legal anchor, keep the
  // card playable by placing its units individually in the same seeded order.
  const fallback: Record<string, Vec> = {};
  for (const { unit } of seats) {
    const order = deploymentOrderedUnitIds(run).indexOf(unit.id);
    const choice = automaticPlacementChoice(
      run,
      level,
      unit,
      { ...committed, ...fallback },
      Math.max(0, order),
    );
    if (choice.cell) fallback[unit.id] = choice.cell;
  }
  return { placements: fallback, preserved: false };
}

function ensureActiveFormationPlan(
  run: RunDocument,
  level: Level,
): Readonly<{ run: RunDocument; plan: FormationPlan }> {
  const card = activeDeploymentCard(run);
  if (!card || !run.deployment) return { run, plan: { placements: {}, preserved: false } };
  const existing = decodedFormationPlan(run, card.id);
  if (existing) return { run, plan: existing };
  const plan = planCardFormation(run, level, card, decodedPlacements(run));
  return {
    run: setDeploymentChoices(run, {
      formationPlans: {
        ...(run.deployment.formationPlans ?? {}),
        [card.id]: Object.fromEntries(
          Object.entries(plan.placements).map(([unitId, cell]) => [unitId, key(cell)]),
        ),
      },
    }),
    plan,
  };
}

export function deploymentOrderedUnitIds(run: RunDocument): string[] {
  return dealtCards(run).flatMap(runCardUnitIds);
}

function activeCardSeat(run: RunDocument): { index: number; unit: RunArmyUnit } | null {
  const card = activeDeploymentCard(run);
  const deployment = run.deployment;
  if (!card || !deployment) return null;
  for (let index = deployment.unitCursor; index < card.unitSeats.length; index += 1) {
    const unitId = card.unitSeats[index];
    if (!unitId || !deployment.deployingUnitIds.includes(unitId)) continue;
    const unit = run.army.find((candidate) => candidate.id === unitId);
    if (unit) return { index, unit };
  }
  return null;
}

function currentLayout(run: RunDocument, level: Level): RunDeploymentLayout {
  const persistedPlacements = decodedPlacements(run);
  const placements: Record<string, Vec> = {};
  const trace: RunDeploymentTraceEntry[] = [];
  const deployment = run.deployment;
  if (deployment) {
    // Replay only committed destinations in card/seat order and never preview a future card.
    for (const [index, unitId] of deploymentOrderedUnitIds(run).entries()) {
      const unit = run.army.find((candidate) => candidate.id === unitId);
      if (!unit || deployment.unavailableUnitIds.includes(unitId) || !persistedPlacements[unitId]) continue;
      const persisted = persistedPlacements[unitId];
      trace.push(automaticPlacementChoice(run, level, unit, placements, index).trace);
      placements[unitId] = persisted;
    }
  }
  const blockedUnitIds = deployment?.unavailableUnitIds ?? [];
  return {
    index: 0,
    placements,
    blockedUnitIds: [...blockedUnitIds],
    reserveUnitIds: [],
    temporaryRocks: temporaryTentRocks(run, level, placements),
    trace: [
      ...trace,
      ...run.army.filter((unit) => blockedUnitIds.includes(unit.id)).map((unit): RunDeploymentTraceEntry => ({
        unitId: unit.id,
        type: unit.type,
        result: 'blocked',
        eligibleCellCount: playerDeploymentPools(level).byType[unit.type].length,
      })),
    ],
  };
}

/** Capacity admission happens once against card order. Praecipuus puts His Grace first,
 * and each card's persisted seats decide both who fits and who later claims squares. */
export function resolveDeploymentCapacity(run: RunDocument, level: Level): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.capacityResolved) return run;
  const capacity = playerDeploymentCells(level).length;
  const orderedUnitIds = deploymentOrderedUnitIds(run);
  const deployingUnitIds = orderedUnitIds.slice(0, capacity);
  const unavailableUnitIds = run.army.map((unit) => unit.id).filter((id) => !deployingUnitIds.includes(id));
  return setDeploymentChoices(run, {
    deployingUnitIds,
    unavailableUnitIds,
    blockedUnitIds: [...unavailableUnitIds],
    capacityResolved: true,
  });
}

export function deploymentOptions(run: RunDocument, level: Level): RunDeploymentOptions {
  const layout = currentLayout(run, level);
  const capacity = playerDeploymentCells(level).length;
  return {
    zoneCells: playerDeploymentCells(level),
    overflowCount: Math.max(0, deploymentOrderedUnitIds(run).length - capacity),
    hasBlockedChoice: false,
    needsBlockedChoice: false,
    blockedChoiceCount: 0,
    layouts: [layout, { ...layout, index: 1 }],
  };
}

export function currentDeploymentUnit(run: RunDocument): RunArmyUnit | null {
  return activeCardSeat(run)?.unit ?? null;
}

export type RunDeploymentInteractionStage =
  | 'await-deal'
  | 'dealing'
  | 'reveal-card'
  | 'revealing-card'
  | 'place'
  | 'settling'
  | 'discarding'
  | 'ready';

export function deploymentInteractionStage(run: RunDocument, _options?: RunDeploymentOptions): RunDeploymentInteractionStage {
  const deployment = run.deployment;
  if (!deployment || deployment.stage === 'awaiting-deal') return 'await-deal';
  if (deployment.stage === 'dealing') return 'dealing';
  if (deployment.stage === 'card') return 'reveal-card';
  if (deployment.stage === 'revealing') return 'revealing-card';
  if (deployment.stage === 'settling') return 'settling';
  if (deployment.stage === 'discarding') return 'discarding';
  if (deployment.stage === 'complete') return 'ready';
  const unit = currentDeploymentUnit(run);
  if (!unit) return 'ready';
  return 'place';
}

/** Crosses the persisted player/auto-deal boundary without revealing a card. */
export function beginDeploymentDeal(
  run: RunDocument,
  transport: RunDeploymentTransport = 'paused',
): RunDocument {
  if (run.phase !== 'deployment' || run.deployment?.stage !== 'awaiting-deal') return run;
  return setDeploymentChoices(run, { stage: 'dealing', transport });
}

/** Persists that both face-down branches of the deck partition have settled. */
export function completeDeploymentDeal(run: RunDocument, level: Level): RunDocument {
  const resolved = resolveDeploymentCapacity(run, level);
  if (resolved.phase !== 'deployment' || resolved.deployment?.stage !== 'dealing') return resolved;
  return setDeploymentChoices(resolved, { stage: 'card' });
}

function stageAfterCommittedUnits(run: RunDocument): RunDocument {
  if (!run.deployment) return run;
  const nextUnit = currentDeploymentUnit(run);
  const completedCardPrefixPendingDiscard = run.deployment.activeCardIndex > run.deployment.discardCursor;
  const next = setDeploymentChoices(run, {
    settlingUnitIds: [],
    stage: nextUnit
      ? completedCardPrefixPendingDiscard ? 'discarding' : 'unit'
      : 'discarding',
  });
  return next;
}

function commitPlacement(
  run: RunDocument,
  _level: Level,
  unit: RunArmyUnit,
  cell: Vec | null,
  deferSettlement = false,
): RunDocument {
  if (!run.deployment) return run;
  const seat = activeCardSeat(run);
  if (!seat || seat.unit.id !== unit.id) return run;
  const placements = { ...run.deployment.placements };
  let deployingUnitIds = [...run.deployment.deployingUnitIds];
  let unavailableUnitIds = [...run.deployment.unavailableUnitIds];
  if (cell) {
    placements[unit.id] = key(cell);
  } else {
    deployingUnitIds = deployingUnitIds.filter((id) => id !== unit.id);
    unavailableUnitIds = [...new Set([...unavailableUnitIds, unit.id])];
  }
  const next = setDeploymentChoices(run, {
    placements,
    deployingUnitIds,
    unavailableUnitIds,
    blockedUnitIds: [...unavailableUnitIds],
    unitCursor: seat.index + 1,
    settlingUnitIds: cell
      ? [...run.deployment.settlingUnitIds, unit.id]
      : [...run.deployment.settlingUnitIds],
    stage: deferSettlement ? 'unit' : cell ? 'settling' : 'unit',
  });
  return cell || deferSettlement ? next : stageAfterCommittedUnits(next);
}

/** Commit every remaining automatic seat, across card boundaries, as one compositor arrival wave.
 * Cards stay in Controls until that wave settles, then the completed prefix discards together. */
function placeAutomaticDeploymentWave(run: RunDocument, level: Level): RunDocument {
  let next = run;
  while (
    next.phase === 'deployment'
    && (next.deployment?.stage === 'card' || next.deployment?.stage === 'unit')
  ) {
    const unit = currentDeploymentUnit(next);
    if (!unit) {
      const deployment = next.deployment;
      const nextCardIndex = deployment.activeCardIndex + 1;
      if (nextCardIndex >= deployment.dealtCardIds.length) {
        next = setDeploymentChoices(next, {
          activeCardIndex: deployment.dealtCardIds.length,
          unitCursor: 0,
          stage: deployment.settlingUnitIds.length > 0 ? 'settling' : 'discarding',
        });
        break;
      }
      next = setDeploymentChoices(next, {
        activeCardIndex: nextCardIndex,
        unitCursor: 0,
        stage: 'unit',
      });
      continue;
    }
    const planned = ensureActiveFormationPlan(next, level);
    next = commitPlacement(
      planned.run,
      level,
      unit,
      planned.plan.placements[unit.id] ?? null,
      true,
    );
  }
  if (next.phase !== 'deployment' || !next.deployment) return next;
  if (next.deployment.stage === 'settling' || next.deployment.stage === 'discarding') return next;
  if (next.deployment.settlingUnitIds.length > 0) {
    return setDeploymentChoices(next, { stage: 'settling' });
  }
  return next;
}

export function setDeploymentTransport(
  run: RunDocument,
  transport: RunDeploymentTransport,
): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  if (run.deployment.stage === 'awaiting-deal' || run.deployment.stage === 'dealing' || run.deployment.stage === 'complete') {
    return run;
  }
  return setDeploymentChoices(run, { transport });
}

export function revealActiveDeploymentCard(run: RunDocument): RunDocument {
  const card = activeDeploymentCard(run);
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.stage !== 'card' || !card) return run;
  return setDeploymentChoices(run, {
    revealedCardIds: [...new Set([...run.deployment.revealedCardIds, card.id])],
    stage: 'revealing',
  });
}

export function finishDeploymentCardReveal(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.stage !== 'revealing') return run;
  return setDeploymentChoices(run, { stage: currentDeploymentUnit(run) ? 'unit' : 'discarding' });
}

export function placeRevealedDeploymentUnit(run: RunDocument, level: Level): RunDocument {
  const activeCardId = activeDeploymentCard(run)?.id;
  if (!activeCardId || run.deployment?.stage !== 'unit') return run;
  let next = run;
  while (next.phase === 'deployment' && activeDeploymentCard(next)?.id === activeCardId) {
    const unit = currentDeploymentUnit(next);
    if (!unit) break;
    const planned = ensureActiveFormationPlan(next, level);
    next = commitPlacement(
      planned.run,
      level,
      unit,
      planned.plan.placements[unit.id] ?? null,
      true,
    );
  }
  if (next.phase !== 'deployment' || !next.deployment) return next;
  if (next.deployment.settlingUnitIds.length > 0) {
    return setDeploymentChoices(next, { stage: 'settling' });
  }
  return stageAfterCommittedUnits(next);
}

export function finishDeploymentUnitSettlement(run: RunDocument, _level?: Level): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  if (run.deployment.stage !== 'settling' || run.deployment.settlingUnitIds.length === 0) return run;
  return stageAfterCommittedUnits(run);
}

export function finishDeploymentCardDiscard(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.stage !== 'discarding') return run;
  if (run.deployment.activeCardIndex > run.deployment.discardCursor) {
    if (run.deployment.activeCardIndex >= run.deployment.dealtCardIds.length) {
      const completed = setDeploymentChoices(run, {
        activeCardIndex: run.deployment.dealtCardIds.length,
        unitCursor: 0,
        discardCursor: run.deployment.dealtCardIds.length,
        settlingUnitIds: [],
        stage: 'complete',
      });
      return beginBattle(completed, Object.keys(run.deployment.placements), [], run.deployment.unavailableUnitIds);
    }
    return setDeploymentChoices(run, {
      discardCursor: run.deployment.activeCardIndex,
      settlingUnitIds: [],
      stage: 'unit',
      transport: 'paused',
    });
  }
  const nextCardIndex = run.deployment.activeCardIndex + 1;
  if (nextCardIndex >= run.deployment.dealtCardIds.length) {
    const completed = setDeploymentChoices(run, {
      activeCardIndex: nextCardIndex,
      unitCursor: 0,
      discardCursor: nextCardIndex,
      settlingUnitIds: [],
      stage: 'complete',
    });
    return beginBattle(completed, Object.keys(run.deployment.placements), [], run.deployment.unavailableUnitIds);
  }
  return setDeploymentChoices(run, {
    activeCardIndex: nextCardIndex,
    unitCursor: 0,
    discardCursor: run.deployment.discardCursor + 1,
    settlingUnitIds: [],
    stage: 'card',
  });
}

export function advanceDeploymentTransport(run: RunDocument, level: Level): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment) return run;
  if (
    run.deployment.transport === 'full-deploy'
    && (run.deployment.stage === 'card' || run.deployment.stage === 'unit')
  ) {
    return placeAutomaticDeploymentWave(run, level);
  }
  if (run.deployment.stage === 'card') {
    return run.deployment.transport === 'playing' ? revealActiveDeploymentCard(run) : run;
  }
  if (run.deployment.stage !== 'unit') return run;
  const unit = currentDeploymentUnit(run);
  if (!unit) {
    return setDeploymentChoices(run, { transport: 'paused' });
  }
  if (run.deployment.transport === 'playing') return placeRevealedDeploymentUnit(run, level);
  return run;
}

export function resolveForcedDeploymentChoices(run: RunDocument, level: Level): RunDocument {
  return resolveDeploymentCapacity(run, level);
}

export function deploymentHasMeaningfulChoice(_run?: RunDocument, _options?: RunDeploymentOptions): boolean {
  return true;
}

export function deploymentHasCompassChoice(_run?: RunDocument, _options?: RunDeploymentOptions): boolean {
  return false;
}

export function advanceAutomaticDeployment(run: RunDocument, level: Level): RunDocument {
  return advanceDeploymentTransport(resolveDeploymentCapacity(run, level), level);
}

export function advanceReadyDeployment(run: RunDocument, level: Level): RunDocument {
  return advanceDeploymentTransport(run, level);
}

export function deploymentReady(run: RunDocument, _options?: RunDeploymentOptions): boolean {
  return run.phase === 'battle';
}

export function selectedDeploymentLayout(run: RunDocument, options: RunDeploymentOptions): RunDeploymentLayout {
  return options.layouts[0];
}

export function levelWithRunDeployment(run: RunDocument, level: Level, layout: RunDeploymentLayout): Level {
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  const runUnits: LevelUnit[] = Object.entries(layout.placements).flatMap(([unitId, cell]) => {
    const unit = armyById.get(unitId);
    if (!unit) return [];
    return [{
      ...cell,
      type: unit.type,
      side: 'player' as const,
      facing: defaultFacingForSide('player'),
      runUnitId: unit.id,
      runUnitName: unit.name,
    }];
  });
  const rocks: LevelUnit[] = layout.temporaryRocks.map((cell, index) => ({
    ...cell,
    type: 'rock',
    side: 'neutral',
    runUnitId: `run-tent-rock-${index}`,
  }));
  return {
    ...level,
    runRules: { occultDagger: hasLipsanon(run, 'occult-dagger') },
    layers: { ...level.layers, units: [...level.layers.units, ...runUnits, ...rocks] },
  };
}

export function levelForRunDeployment(
  run: RunDocument,
  level: Level,
  layout: RunDeploymentLayout,
  _includeAutomaticFormation = false,
): Level {
  const projected = levelWithRunDeployment(run, level, layout);
  return {
    ...projected,
    layers: {
      ...projected.layers,
      units: projected.layers.units.filter((unit) => unit.side !== 'enemy'),
    },
  };
}

export function normalReservistCell(
  run: RunDocument,
  level: Level,
  occupied: ReadonlySet<string>,
  sequence: number,
  unitType?: PlayablePieceType,
): Vec | null {
  const pools = playerDeploymentPools(level);
  const pool = unitType ? pools.byType[unitType] : pools.all;
  const free = pool.filter((cell) => !occupied.has(key(cell)));
  if (!free.length) return null;
  return createRng(mixSeed(run.deployment?.seed ?? run.seed, 'reservist-cell', sequence)).pick(free);
}

export function eligibleReserveUnits(run: RunDocument, deadUnitId: string): RunArmyUnit[] {
  const runtime = run.battleRuntime;
  const dead = run.army.find((unit) => unit.id === deadUnitId);
  if (!runtime || !dead) return [];
  const alreadyReservists = new Set([...runtime.reservistPoolUnitIds, ...runtime.deployedReservistUnitIds]);
  return runtime.reserveUnitIds.filter((id) => !alreadyReservists.has(id)).flatMap((id) => {
    const unit = run.army.find((candidate) => candidate.id === id);
    return unit && PIECE_VALUE[unit.type] <= PIECE_VALUE[dead.type] ? [unit] : [];
  });
}
