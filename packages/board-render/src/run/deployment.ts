import type { Level, LevelUnit } from '../core/level';
import type { Vec } from '../core/types';
import { createRng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';
import { propCells, propDef } from '../core/props';
import { defaultFacingForSide, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import {
  beginBattle,
  hasLipsanon,
  hasRunAbility,
  mixSeed,
  PIECE_VALUE,
  setDeploymentChoices,
  type RunArmyUnit,
  type RunDocument,
} from './model';

export interface RunDeploymentLayout {
  index: 0 | 1;
  placements: Record<string, Vec>;
  blockedUnitIds: string[];
  reserveUnitIds: string[];
  temporaryRocks: Vec[];
  trace: RunDeploymentTraceEntry[];
}

export type RunDeploymentTraceResult = 'blocked' | 'manual' | 'manual-pending' | 'automatic' | 'stranded';

export interface RunDeploymentTraceEntry {
  unitId: string;
  type: PlayablePieceType;
  result: RunDeploymentTraceResult;
  eligibleCellCount: number;
  availableCellCount?: number;
  agminate: boolean;
  automaticOrder?: number;
  eutacticTargetRowIndex?: number;
  eutacticTargetRow?: number;
  eutacticBestRows?: number[];
  selectedRow?: number;
  candidateCount?: number;
  chosen?: Vec;
  score?: number;
}

export interface RunDeploymentOptions {
  zoneCells: Vec[];
  adlectedUnitIds: string[];
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

function unitIsAdlected(run: RunDocument, unitId: string): boolean {
  const unit = run.army.find((candidate) => candidate.id === unitId);
  return Boolean(unit?.abilities.includes('adlected') || run.deployment?.temporaryAdlectedUnitId === unitId);
}

function eutacticTargetRowIndex(unit: RunArmyUnit, eligibleCells: readonly Vec[]): number {
  const rows = [...new Set(eligibleCells.map((cell) => cell.y))].sort((a, b) => a - b);
  if (unit.type === 'pawn') return 0;
  if (unit.type === 'knight' || unit.type === 'bishop') return Math.min(1, rows.length - 1);
  return Math.max(0, rows.length - 1);
}

function eutacticBestFitRows(
  unit: RunArmyUnit,
  eligibleCells: readonly Vec[],
  availableCells: readonly Vec[],
): number[] {
  const rows = [...new Set(eligibleCells.map((cell) => cell.y))].sort((a, b) => a - b);
  if (!rows.length || !availableCells.length) return [];
  const targetIndex = eutacticTargetRowIndex(unit, eligibleCells);
  const rowIndex = new Map(rows.map((row, index) => [row, index]));
  const availableRows = [...new Set(availableCells.map((cell) => cell.y))];
  const bestDistance = Math.min(...availableRows.map((row) => Math.abs((rowIndex.get(row) ?? targetIndex) - targetIndex)));
  return availableRows.filter((row) => Math.abs((rowIndex.get(row) ?? targetIndex) - targetIndex) === bestDistance);
}

function edgeDistance(cell: Vec, level: Level): number {
  return Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y);
}

function permanentObstructions(level: Level): Set<string> {
  const blocked = new Set(
    level.layers.units
      .filter((unit) => unit.type === 'rock' || unit.type === 'random-rock')
      .map(key),
  );
  for (const terrain of level.layers.terrain) {
    if (!isPassableTerrain(terrain.terrain)) blocked.add(key(terrain));
  }
  for (const placed of level.layers.props ?? []) {
    const def = propDef(placed.propId);
    if (!def?.blocking) continue;
    for (const cell of propCells(placed.x, placed.y, def)) blocked.add(key(cell));
  }
  return blocked;
}

function isOpenFile(level: Level, cell: Vec): boolean {
  const blocked = permanentObstructions(level);
  for (let y = cell.y - 1; y >= 0; y -= 1) {
    if (blocked.has(key({ x: cell.x, y }))) return false;
  }
  return true;
}

function placedOfType(run: RunDocument, placements: Readonly<Record<string, Vec>>, type: PlayablePieceType): Vec[] {
  return Object.entries(placements).flatMap(([unitId, cell]) => (
    run.army.find((candidate) => candidate.id === unitId)?.type === type ? [cell] : []
  ));
}

function chooseAgminateCandidates(
  run: RunDocument,
  level: Level,
  unit: RunArmyUnit,
  candidates: readonly Vec[],
  placements: Readonly<Record<string, Vec>>,
  rng: ReturnType<typeof createRng>,
): Vec[] {
  if (!hasRunAbility(run, unit, 'agminate') || !candidates.length) return [...candidates];
  if (unit.type === 'pawn') {
    const pawns = placedOfType(run, placements, 'pawn');
    const alongside = candidates.filter((cell) => pawns.some((pawn) => pawn.y === cell.y && Math.abs(pawn.x - cell.x) === 1));
    const open = candidates.filter((cell) => isOpenFile(level, cell));
    if (alongside.length && open.length) return rng.int(2) === 0 ? alongside : open;
    if (alongside.length) return alongside;
    if (open.length) return open;
    return [...candidates];
  }
  if (unit.type === 'bishop') {
    const bishops = placedOfType(run, placements, 'bishop');
    if (!bishops.length) return [...candidates];
    const opposite = candidates.filter((cell) => bishops.some((bishop) => (bishop.x + bishop.y) % 2 !== (cell.x + cell.y) % 2));
    if (!opposite.length) return [...candidates];
    const minimum = Math.min(...opposite.map((cell) => Math.min(...bishops.map((bishop) => (
      Math.abs(bishop.x - cell.x) + Math.abs(bishop.y - cell.y)
    )))));
    return opposite.filter((cell) => Math.min(...bishops.map((bishop) => (
      Math.abs(bishop.x - cell.x) + Math.abs(bishop.y - cell.y)
    ))) === minimum);
  }
  if (unit.type === 'queen') {
    const best = Math.max(...candidates.map((cell) => edgeDistance(cell, level)));
    return candidates.filter((cell) => edgeDistance(cell, level) === best);
  }
  if (unit.type === 'knight') {
    const best = Math.min(...candidates.map((cell) => Math.abs(edgeDistance(cell, level) - 1)));
    return candidates.filter((cell) => Math.abs(edgeDistance(cell, level) - 1) === best);
  }
  if (unit.type === 'king') {
    const best = Math.min(...candidates.map((cell) => edgeDistance(cell, level)));
    return candidates.filter((cell) => edgeDistance(cell, level) === best);
  }
  if (unit.type === 'rook') {
    const king = run.army.find((candidate) => candidate.type === 'king');
    const kingCell = king ? placements[king.id] : undefined;
    const rooks = placedOfType(run, placements, 'rook');
    if (kingCell && hasRunAbility(run, king!, 'agminate') && rooks.length === 0) {
      const adjacent = candidates.filter((cell) => Math.abs(cell.x - kingCell.x) + Math.abs(cell.y - kingCell.y) === 1);
      if (adjacent.length) return adjacent;
    }
    const backRow = Math.max(...candidates.map((cell) => cell.y));
    const backCandidates = candidates.filter((cell) => cell.y === backRow);
    const minBackX = Math.min(...backCandidates.map((cell) => cell.x));
    const maxBackX = Math.max(...backCandidates.map((cell) => cell.x));
    const corners = backCandidates.filter((cell) => cell.x === minBackX || cell.x === maxBackX);
    if (corners.length) return corners;
    if (kingCell) {
      const farthest = Math.max(...candidates.map((cell) => Math.abs(cell.x - kingCell.x)));
      const far = candidates.filter((cell) => Math.abs(cell.x - kingCell.x) === farthest);
      if (far.length) return far;
    }
  }
  return [...candidates];
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
  const authoredPools = deploymentPools(level, new Set());
  const used = new Set(Object.values(placements).map(key));
  let candidates = pools.byType[unit.type].filter((cell) => !used.has(key(cell)));
  const availableCellCount = candidates.length;
  const rng = createRng(mixSeed(run.deployment?.seed ?? run.seed, `placement:${unit.id}`, order));
  let eutacticTargetRowIndexValue: number | undefined;
  let eutacticTargetRow: number | undefined;
  let eutacticBestRows: number[] | undefined;
  let selectedRow: number | undefined;
  if (hasRunAbility(run, unit, 'eutactic') && authoredPools.byType[unit.type].length && candidates.length) {
    const rows = [...new Set(authoredPools.byType[unit.type].map((cell) => cell.y))].sort((a, b) => a - b);
    eutacticTargetRowIndexValue = eutacticTargetRowIndex(unit, authoredPools.byType[unit.type]);
    eutacticTargetRow = rows[eutacticTargetRowIndexValue];
    eutacticBestRows = eutacticBestFitRows(unit, authoredPools.byType[unit.type], candidates);
    selectedRow = eutacticBestRows.length === 1 ? eutacticBestRows[0] : eutacticBestRows[rng.int(eutacticBestRows.length)];
    candidates = candidates.filter((cell) => cell.y === selectedRow);
  }
  candidates = chooseAgminateCandidates(run, level, unit, candidates, placements, rng);
  const chosen = candidates.length ? candidates[rng.int(candidates.length)] : null;
  return {
    cell: chosen,
    trace: {
      unitId: unit.id,
      type: unit.type,
      result: chosen ? 'automatic' : 'stranded',
      eligibleCellCount: pools.byType[unit.type].length,
      availableCellCount,
      agminate: hasRunAbility(run, unit, 'agminate'),
      automaticOrder: order + 1,
      eutacticTargetRowIndex: eutacticTargetRowIndexValue,
      eutacticTargetRow,
      eutacticBestRows,
      selectedRow,
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
  if (!hasLipsanon(run, 'royal-tent') || !hasLipsanon(run, 'royal-decree')) return [];
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

function currentLayout(run: RunDocument, level: Level): RunDeploymentLayout {
  const persistedPlacements = decodedPlacements(run);
  const placements: Record<string, Vec> = {};
  const trace: RunDeploymentTraceEntry[] = [];
  const deployment = run.deployment;
  if (deployment) {
    // Replay only the persisted, already-resolved prefix and never preview the hidden future.
    for (let index = 0; index < Math.min(deployment.placementCursor, deployment.queueUnitIds.length); index += 1) {
      const unitId = deployment.queueUnitIds[index];
      const unit = run.army.find((candidate) => candidate.id === unitId);
      if (!unit || deployment.unavailableUnitIds.includes(unitId)) continue;
      const persisted = persistedPlacements[unitId];
      if (persisted) {
        if (deployment.manualPlacements[unitId]) {
          trace.push({
            unitId,
            type: unit.type,
            result: 'manual',
            eligibleCellCount: playerDeploymentPools(level).all.length,
            agminate: hasRunAbility(run, unit, 'agminate'),
            automaticOrder: index + 1,
            chosen: persisted,
          });
        } else {
          trace.push(automaticPlacementChoice(run, level, unit, placements, index).trace);
        }
        placements[unitId] = persisted;
        continue;
      }
      const choice = automaticPlacementChoice(run, level, unit, placements, index);
      trace.push(choice.trace);
      if (choice.cell) placements[unitId] = choice.cell;
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
        agminate: hasRunAbility(run, unit, 'agminate'),
      })),
    ],
  };
}

/** Capacity admission happens once, immediately after the deal. His Grace is already first in
 * the queue; the same seeded order therefore decides both who fits and who later claims squares. */
export function resolveDeploymentCapacity(run: RunDocument, level: Level): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.capacityResolved) return run;
  const capacity = playerDeploymentCells(level).length;
  const queueUnitIds = run.deployment.queueUnitIds.slice(0, capacity);
  const unavailableUnitIds = run.army.map((unit) => unit.id).filter((id) => !queueUnitIds.includes(id));
  const permanentAdlected = new Set(run.army.filter((unit) => unit.abilities.includes('adlected')).map((unit) => unit.id));
  const dawnCandidates = queueUnitIds.filter((id) => !permanentAdlected.has(id));
  const fallbackCandidates = queueUnitIds;
  const temporaryAdlectedUnitId = hasLipsanon(run, 'inspirational-record') && fallbackCandidates.length
    ? createRng(mixSeed(run.deployment.seed, 'inspirational-record')).pick(dawnCandidates.length ? dawnCandidates : fallbackCandidates)
    : undefined;
  return setDeploymentChoices(run, {
    queueUnitIds,
    deployingUnitIds: [...queueUnitIds],
    unavailableUnitIds,
    blockedUnitIds: [...unavailableUnitIds],
    capacityResolved: true,
    temporaryAdlectedUnitId,
  });
}

export function deploymentOptions(run: RunDocument, level: Level): RunDeploymentOptions {
  const layout = currentLayout(run, level);
  const capacity = playerDeploymentCells(level).length;
  const queue = run.deployment?.queueUnitIds ?? [];
  return {
    zoneCells: playerDeploymentCells(level),
    adlectedUnitIds: queue.filter((id) => unitIsAdlected(run, id)),
    overflowCount: Math.max(0, run.army.length - capacity),
    hasBlockedChoice: false,
    needsBlockedChoice: false,
    blockedChoiceCount: 0,
    layouts: [layout, { ...layout, index: 1 }],
  };
}

export function currentDeploymentUnit(run: RunDocument): RunArmyUnit | null {
  const id = run.deployment?.queueUnitIds[run.deployment.placementCursor];
  return id ? run.army.find((unit) => unit.id === id) ?? null : null;
}

export function disciplinePlacementCells(run: RunDocument, options: RunDeploymentOptions, unitId: string): Vec[] {
  if (!unitIsAdlected(run, unitId) || currentDeploymentUnit(run)?.id !== unitId) return [];
  const occupied = new Set(Object.entries(run.deployment?.placements ?? {})
    .filter(([id]) => id !== unitId)
    .map(([, cell]) => cell));
  return options.zoneCells.filter((cell) => !occupied.has(key(cell)));
}

export type RunDeploymentInteractionStage = 'klerosis' | 'primogeniture' | 'draw' | 'place' | 'adlected' | 'ready';

export function deploymentInteractionStage(run: RunDocument, _options?: RunDeploymentOptions): RunDeploymentInteractionStage {
  const deployment = run.deployment;
  if (!deployment || deployment.stage === 'klerosis' || !deployment.mode) return 'klerosis';
  const unit = currentDeploymentUnit(run);
  if (!unit) return 'ready';
  if (unitIsAdlected(run, unit.id) && deployment.revealedUnitId === unit.id) return 'adlected';
  if (deployment.stage === 'primogeniture') return 'primogeniture';
  return deployment.revealedUnitId === unit.id ? 'place' : 'draw';
}

function commitPlacement(run: RunDocument, level: Level, unit: RunArmyUnit, cell: Vec | null, manual: boolean): RunDocument {
  if (!run.deployment) return run;
  const placements = { ...run.deployment.placements };
  const manualPlacements = { ...run.deployment.manualPlacements };
  let deployingUnitIds = [...run.deployment.deployingUnitIds];
  let unavailableUnitIds = [...run.deployment.unavailableUnitIds];
  if (cell) {
    placements[unit.id] = key(cell);
    if (manual) manualPlacements[unit.id] = key(cell);
  } else {
    deployingUnitIds = deployingUnitIds.filter((id) => id !== unit.id);
    unavailableUnitIds = [...new Set([...unavailableUnitIds, unit.id])];
  }
  const placementCursor = run.deployment.placementCursor + 1;
  const atEnd = placementCursor >= run.deployment.queueUnitIds.length;
  let next = setDeploymentChoices(run, {
    placements,
    manualPlacements,
    deployingUnitIds,
    unavailableUnitIds,
    blockedUnitIds: [...unavailableUnitIds],
    placementCursor,
    revealedUnitId: undefined,
    stage: atEnd ? 'farrago' : 'farrago',
  });
  if (atEnd) {
    return beginBattle(next, Object.keys(placements), [], unavailableUnitIds);
  }
  if (next.deployment?.mode === 'deploy-all') next = advanceDeployAll(next, level);
  return next;
}

export function chooseDeploymentMode(run: RunDocument, level: Level, mode: 'deploy-all' | 'step-through'): RunDocument {
  let next = resolveDeploymentCapacity(run, level);
  if (next.phase !== 'deployment' || !next.deployment) return next;
  const first = next.deployment.queueUnitIds[0];
  next = setDeploymentChoices(next, {
    mode,
    stage: 'primogeniture',
    revealedUnitId: first,
  });
  return mode === 'deploy-all' ? advanceDeployAll(next, level) : next;
}

export function switchDeploymentMode(run: RunDocument, level: Level, mode: 'deploy-all' | 'step-through'): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment?.mode) return run;
  let next = setDeploymentChoices(run, { mode });
  return mode === 'deploy-all' ? advanceDeployAll(next, level) : next;
}

export function drawNextDeploymentUnit(run: RunDocument): RunDocument {
  if (run.phase !== 'deployment' || !run.deployment || run.deployment.stage !== 'farrago') return run;
  const unit = currentDeploymentUnit(run);
  if (!unit || run.deployment.revealedUnitId) return run;
  return setDeploymentChoices(run, { revealedUnitId: unit.id });
}

export function placeRevealedDeploymentUnit(run: RunDocument, level: Level): RunDocument {
  const unit = currentDeploymentUnit(run);
  if (!unit || run.deployment?.revealedUnitId !== unit.id || unitIsAdlected(run, unit.id)) return run;
  const placements = decodedPlacements(run);
  const choice = automaticPlacementChoice(run, level, unit, placements, run.deployment.placementCursor);
  return commitPlacement(run, level, unit, choice.cell, false);
}

export function placeAdlectedDeploymentUnit(run: RunDocument, level: Level, cell: Vec): RunDocument {
  const unit = currentDeploymentUnit(run);
  if (!unit || run.deployment?.revealedUnitId !== unit.id || !unitIsAdlected(run, unit.id)) return run;
  const options = deploymentOptions(run, level);
  if (!disciplinePlacementCells(run, options, unit.id).some((candidate) => key(candidate) === key(cell))) return run;
  return commitPlacement(run, level, unit, cell, true);
}

export function advanceDeployAll(run: RunDocument, level: Level): RunDocument {
  let next = run;
  while (next.phase === 'deployment' && next.deployment?.mode === 'deploy-all') {
    const unit = currentDeploymentUnit(next);
    if (!unit) return beginBattle(next, Object.keys(next.deployment.placements), [], next.deployment.unavailableUnitIds);
    if (unitIsAdlected(next, unit.id)) {
      if (next.deployment.revealedUnitId === unit.id) return next;
      return setDeploymentChoices(next, { revealedUnitId: unit.id });
    }
    if (next.deployment.revealedUnitId !== unit.id) {
      next = setDeploymentChoices(next, { revealedUnitId: unit.id });
    }
    const before = next;
    next = placeRevealedDeploymentUnit(next, level);
    if (next === before) return next;
  }
  return next;
}

/** Legacy entry points now stop on Klerosis. Choosing a mode is the information gate. */
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
  return resolveDeploymentCapacity(run, level);
}

export function advanceReadyDeployment(run: RunDocument, level: Level): RunDocument {
  return run.deployment?.mode === 'deploy-all' ? advanceDeployAll(run, level) : run;
}

export function deploymentReady(run: RunDocument, _options?: RunDeploymentOptions): boolean {
  return Boolean(run.deployment && run.deployment.placementCursor >= run.deployment.queueUnitIds.length);
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
