import type { Level, LevelUnit } from '../core/level';
import type { Vec } from '../core/types';
import { createRng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';
import { propCells, propDef } from '../core/props';
import { defaultFacingForSide } from '../core/pieces';
import {
  hasRelic,
  mixSeed,
  PIECE_VALUE,
  shuffled,
  type RunArmyUnit,
  type RunDocument,
} from './model';

export interface RunDeploymentLayout {
  index: 0 | 1;
  placements: Record<string, Vec>;
  blockedUnitIds: string[];
  reserveUnitIds: string[];
  temporaryRocks: Vec[];
}

export interface RunDeploymentOptions {
  zoneCells: Vec[];
  disciplineUnitIds: string[];
  overflowCount: number;
  needsBlockedChoice: boolean;
  blockedChoiceCount: number;
  layouts: [RunDeploymentLayout, RunDeploymentLayout];
}

const key = (cell: Vec): string => `${cell.x},${cell.y}`;
const fromKey = (value: string): Vec | null => {
  const match = /^(-?\d+),(-?\d+)$/.exec(value);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

function authoredOccupied(level: Level): Set<string> {
  const occupied = new Set(level.layers.units.map((unit) => `${unit.x},${unit.y}`));
  for (const placed of level.layers.props ?? []) {
    const def = propDef(placed.propId);
    if (!def?.blocking) continue;
    for (const cell of propCells(placed.x, placed.y, def)) occupied.add(key(cell));
  }
  return occupied;
}

export function playerDeploymentCells(level: Level): Vec[] {
  const occupied = authoredOccupied(level);
  const terrain = new Map(level.layers.terrain.map((cell) => [key(cell), cell]));
  const cells = new Map<string, Vec>();
  for (const zone of level.layers.zones) {
    if (zone.type !== 'player-spawn') continue;
    for (const [x, y] of zone.tiles) {
      const cell = { x, y };
      const terrainCell = terrain.get(key(cell));
      if (
        x < 0 || y < 0 || x >= level.board.cols || y >= level.board.rows
        || occupied.has(key(cell))
        || (terrainCell && !isPassableTerrain(terrainCell.terrain))
      ) continue;
      cells.set(key(cell), cell);
    }
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

function disciplineIds(run: RunDocument): string[] {
  const ids = run.army.filter((unit) => unit.abilities.includes('discipline')).map((unit) => unit.id);
  const temporary = run.deployment?.temporaryDisciplineUnitId;
  if (temporary && !ids.includes(temporary)) ids.push(temporary);
  return ids;
}

function chosenBlocked(run: RunDocument, capacity: number): string[] {
  const overflow = Math.max(0, run.army.length - capacity);
  if (!overflow) return [];
  const nonKing = run.army.filter((unit) => unit.type !== 'king');
  if (hasRelic(run, 'muster-roll') && run.deployment?.chosenBlockedUnitIds) {
    const valid = [...new Set(run.deployment.chosenBlockedUnitIds)]
      .filter((id) => nonKing.some((unit) => unit.id === id))
      .slice(0, overflow);
    if (valid.length === overflow) return valid;
  }
  return shuffled(nonKing, mixSeed(run.deployment?.seed ?? run.seed, 'blocked-units')).slice(0, overflow).map((unit) => unit.id);
}

function edgeDistance(cell: Vec, level: Level): number {
  return Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y);
}

function cellScore(
  run: RunDocument,
  level: Level,
  unit: RunArmyUnit,
  cell: Vec,
  placed: Record<string, Vec>,
  bishopIndex: number,
  rookIndex: number,
  rngNoise: number,
): number {
  const cells = playerDeploymentCells(level);
  const minY = Math.min(...cells.map((candidate) => candidate.y));
  const maxY = Math.max(...cells.map((candidate) => candidate.y));
  let score = rngNoise;
  if (unit.type === 'pawn' && hasRelic(run, 'training-linens')) score += cell.y === minY ? 1000 : -Math.abs(cell.y - minY) * 50;
  if (unit.type === 'king') {
    if (hasRelic(run, 'royal-sceptre')) score += edgeDistance(cell, level) === 0 ? 5000 : -5000;
    if (hasRelic(run, 'royal-decree')) score += cell.y === maxY ? 900 : -Math.abs(cell.y - maxY) * 40;
  }
  if (unit.type === 'rook') {
    if (hasRelic(run, 'crenellated-rampart')) {
      score += cell.y === maxY ? 800 : -Math.abs(cell.y - maxY) * 30;
      score += Math.max(cell.x, level.board.cols - 1 - cell.x) * 10;
    }
    if (hasRelic(run, 'ghibelline-rampart')) {
      const king = run.army.find((candidate) => candidate.type === 'king');
      const kingCell = king ? placed[king.id] : undefined;
      const backRow = cells.filter((candidate) => candidate.y === maxY);
      const minBackX = Math.min(...backRow.map((candidate) => candidate.x));
      const maxBackX = Math.max(...backRow.map((candidate) => candidate.x));
      const corners = backRow.filter((candidate) => candidate.x === minBackX || candidate.x === maxBackX);
      if (kingCell) {
        if (hasRelic(run, 'royal-sceptre') && rookIndex === 0) {
          const adjacent = Math.abs(cell.x - kingCell.x) + Math.abs(cell.y - kingCell.y) === 1;
          score += adjacent ? 4000 : -Math.abs(cell.x - kingCell.x) * 80;
        } else {
          score += Math.abs(cell.x - kingCell.x) * 120;
        }
      }
      if (corners.some((corner) => key(corner) === key(cell))) score += 600;
    }
  }
  if (unit.type === 'bishop') {
    if (hasRelic(run, 'popes-staff')) score += cell.y === maxY ? 800 : -Math.abs(cell.y - maxY) * 30;
    if (hasRelic(run, 'popes-robes')) {
      const extraParity = createRng(mixSeed(run.deployment?.seed ?? run.seed, 'bishop-color')).int(2);
      const desiredParity = bishopIndex % 2 === 0 ? extraParity : 1 - extraParity;
      score += (cell.x + cell.y) % 2 === desiredParity ? 1200 : -1200;
    }
  }
  return score;
}

function unitPlacementOrder(units: RunArmyUnit[]): RunArmyUnit[] {
  const order: Record<RunArmyUnit['type'], number> = {
    king: 0,
    rook: 1,
    bishop: 2,
    pawn: 3,
    knight: 4,
    queen: 5,
  };
  return [...units].sort((a, b) => order[a.type] - order[b.type] || a.id.localeCompare(b.id));
}

function buildLayout(run: RunDocument, level: Level, index: 0 | 1, blockedUnitIds: string[]): RunDeploymentLayout {
  const seed = mixSeed(run.deployment?.seed ?? run.seed, 'layout', index);
  const rng = createRng(seed);
  const blocked = new Set(blockedUnitIds);
  const available = new Map(playerDeploymentCells(level).map((cell) => [key(cell), cell]));
  const placements: Record<string, Vec> = {};
  const deployed = run.army.filter((unit) => !blocked.has(unit.id));
  const disciplined = new Set(disciplineIds(run));

  for (const unit of deployed) {
    if (!disciplined.has(unit.id)) continue;
    const manual = fromKey(run.deployment?.manualPlacements[unit.id] ?? '');
    if (!manual || !available.has(key(manual))) continue;
    placements[unit.id] = manual;
    available.delete(key(manual));
  }

  let bishopIndex = 0;
  let rookIndex = 0;
  for (const unit of unitPlacementOrder(deployed)) {
    if (placements[unit.id] || disciplined.has(unit.id)) continue;
    const candidates = [...available.values()];
    if (!candidates.length) break;
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const cell of candidates) {
      const score = cellScore(run, level, unit, cell, placements, bishopIndex, rookIndex, rng.next());
      if (score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }
    placements[unit.id] = best;
    available.delete(key(best));
    if (unit.type === 'bishop') bishopIndex += 1;
    if (unit.type === 'rook') rookIndex += 1;
  }

  const temporaryRocks: Vec[] = [];
  if (hasRelic(run, 'royal-tent') && hasRelic(run, 'royal-decree')) {
    const king = run.army.find((unit) => unit.type === 'king');
    const kingCell = king ? placements[king.id] : undefined;
    if (kingCell) {
      const occupied = new Set([
        ...authoredOccupied(level),
        ...Object.values(placements).map(key),
      ]);
      const terrain = new Map(level.layers.terrain.map((cell) => [key(cell), cell]));
      for (const dx of [-1, 0, 1]) {
        const cell = { x: kingCell.x + dx, y: kingCell.y - 1 };
        const terrainCell = terrain.get(key(cell));
        if (
          cell.x < 0 || cell.y < 0 || cell.x >= level.board.cols || cell.y >= level.board.rows
          || occupied.has(key(cell))
          || (terrainCell && !isPassableTerrain(terrainCell.terrain))
        ) continue;
        occupied.add(key(cell));
        temporaryRocks.push(cell);
      }
    }
  }

  return {
    index,
    placements,
    blockedUnitIds: [...blockedUnitIds],
    reserveUnitIds: [...blockedUnitIds],
    temporaryRocks,
  };
}

export function deploymentOptions(run: RunDocument, level: Level): RunDeploymentOptions {
  const zoneCells = playerDeploymentCells(level);
  const capacity = zoneCells.length;
  const overflowCount = Math.max(0, run.army.length - capacity);
  const blockedUnitIds = chosenBlocked(run, capacity);
  const chosenCount = run.deployment?.chosenBlockedUnitIds?.filter((id) => run.army.some((unit) => unit.id === id && unit.type !== 'king')).length ?? 0;
  return {
    zoneCells,
    disciplineUnitIds: disciplineIds(run).filter((id) => !blockedUnitIds.includes(id)),
    overflowCount,
    needsBlockedChoice: hasRelic(run, 'muster-roll') && overflowCount > 0 && chosenCount !== overflowCount,
    blockedChoiceCount: overflowCount,
    layouts: [
      buildLayout(run, level, 0, blockedUnitIds),
      buildLayout(run, level, 1, blockedUnitIds),
    ],
  };
}

export function deploymentReady(run: RunDocument, options: RunDeploymentOptions): boolean {
  if (!run.deployment || options.zoneCells.length === 0 || options.needsBlockedChoice) return false;
  const layoutIndex = hasRelic(run, 'surveyors-compass') ? run.deployment.layoutChoice : 0;
  if (layoutIndex !== 0 && layoutIndex !== 1) return false;
  const layout = options.layouts[layoutIndex];
  return options.disciplineUnitIds.every((id) => Boolean(layout.placements[id]));
}

export function selectedDeploymentLayout(run: RunDocument, options: RunDeploymentOptions): RunDeploymentLayout {
  return options.layouts[hasRelic(run, 'surveyors-compass') ? run.deployment?.layoutChoice ?? 0 : 0];
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
    runRules: { occultDagger: hasRelic(run, 'occult-dagger') },
    layers: {
      ...level.layers,
      units: [...level.layers.units, ...runUnits, ...rocks],
    },
  };
}

export function normalReservistCell(run: RunDocument, level: Level, occupied: ReadonlySet<string>, sequence: number): Vec | null {
  const free = playerDeploymentCells(level).filter((cell) => !occupied.has(key(cell)));
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
