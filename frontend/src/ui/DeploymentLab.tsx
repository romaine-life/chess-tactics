import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { createBlankLevel, type Level } from '../core/level';
import { levelToEditorBoard } from '../core/levelBoard';
import {
  PIECE_LABEL,
  PLAYABLE_PIECE_TYPES,
  type PlayablePieceType,
} from '../core/pieces';
import {
  advanceDeploymentTransport,
  beginDeploymentDeal,
  completeDeploymentDeal,
  currentDeploymentUnit,
  deploymentOptions,
  disciplinePlacementCells,
  finishDeploymentCardDiscard,
  finishDeploymentCardReveal,
  finishDeploymentUnitSettlement,
  levelWithRunDeployment,
  placeAdlectedDeploymentUnit,
  revealActiveDeploymentCard,
  setDeploymentTransport,
  type RunDeploymentTraceEntry,
} from '../run/deployment';
import {
  createRun,
  mixSeed,
  PIECE_VALUE,
  prepareDeployment,
  type RunAbility,
  type RunArmyUnit,
  type RunDocument,
} from '../run/model';
import { createRng } from '../core/rng';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { StaticReadOnlyBoardView } from './shared/BoardViewFraming';
import { InnerChromeBox } from './shared/ChromeBox';
import { InnerTextButton } from './shared/ChromeButton';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { SliderRow } from './dressing/SliderRow';
import { navigateApp, subscribeAppLocation } from './navigation';
import { deploymentLabPlayerFlowHref } from './playtestRoute';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { useSceneParticipant } from './shell/SceneBoundary';
import { useActiveRun } from '../run/store';

type DedicatedRegion = 'shared' | 'front' | 'back';

export interface DeploymentLabUnitConfig {
  type: PlayablePieceType;
  abilities: RunAbility[];
  /** Generated ordinary-card group. Starter King/Pawns intentionally omit it. */
  cardIndex?: number;
}

export interface DeploymentLabConfig {
  files: number;
  deploymentRows: number;
  rowGap: 0 | 1;
  seed: number;
  kingRegion: DedicatedRegion;
  units: DeploymentLabUnitConfig[];
  obstacles: string[];
  /** Unit indexes are stable until the roster is structurally edited, which clears this map. */
  manualPlacements: Record<string, string>;
}

const DEFAULT_UNITS: DeploymentLabUnitConfig[] = [
  { type: 'king', abilities: [] },
  { type: 'pawn', abilities: [] },
  { type: 'pawn', abilities: [] },
  { type: 'knight', abilities: ['eutactic'], cardIndex: 0 },
  { type: 'bishop', abilities: ['agminate'], cardIndex: 1 },
  { type: 'rook', abilities: [], cardIndex: 2 },
  { type: 'queen', abilities: [], cardIndex: 3 },
];

export const DEFAULT_DEPLOYMENT_LAB_CONFIG: DeploymentLabConfig = {
  files: 8,
  deploymentRows: 5,
  rowGap: 0,
  seed: 4217,
  kingRegion: 'shared',
  units: DEFAULT_UNITS,
  obstacles: [],
  manualPlacements: {},
};

const ROUTE_KEYS = ['df', 'dr', 'dg', 'ds', 'dl', 'dk', 'dmr', 'dsc', 'du', 'do', 'dm'] as const;
const PIECE_CODE: Record<PlayablePieceType, string> = {
  pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k',
};
// Route encoding needs n/k to distinguish Knight from King. Card identity predates that
// route and uses the deck's p/k/b/r/q alphabet, where Kings never appear on ordinary cards.
const CARD_PIECE_CODE: Record<Exclude<PlayablePieceType, 'king'>, string> = {
  pawn: 'p', knight: 'k', bishop: 'b', rook: 'r', queen: 'q',
};
const PIECE_BY_CODE = Object.fromEntries(
  Object.entries(PIECE_CODE).map(([type, code]) => [code, type]),
) as Record<string, PlayablePieceType>;
const ABILITY_CODE: Record<RunAbility, string> = { adlected: 'd', eutactic: 'e', agminate: 'a' };
const ABILITY_ORDER: RunAbility[] = ['adlected', 'eutactic', 'agminate'];
const GENERATED_CREW_MIN = 6;
const GENERATED_CREW_VARIANTS = 5;
const GENERATED_CREW_TYPES = PLAYABLE_PIECE_TYPES.filter((type) => type !== 'king');
const GENERATION_SEED_SPACE = 100_000;

/**
 * Deal one complete, reproducible lab crew. The generated result is ordinary roster data: the
 * viewer may edit every type and ability afterward without entering a separate generated mode.
 */
export function generateDeploymentLabCrew(seed: number): DeploymentLabUnitConfig[] {
  const rng = createRng(mixSeed(seed >>> 0, 'deployment-lab-crew'));
  const size = GENERATED_CREW_MIN + rng.int(GENERATED_CREW_VARIANTS);
  const crew: DeploymentLabUnitConfig[] = [
    { type: 'king', abilities: [] },
    { type: 'pawn', abilities: [] },
    { type: 'pawn', abilities: [] },
  ];
  while (crew.length < size) crew.push({ type: rng.pick(GENERATED_CREW_TYPES), abilities: [] });
  for (let index = crew.length - 1; index > 3; index -= 1) {
    const other = 3 + rng.int(index - 2);
    [crew[index], crew[other]] = [crew[other], crew[index]];
  }
  let cursor = 3;
  let cardIndex = 0;
  while (cursor < crew.length) {
    let value = 0;
    const group: number[] = [];
    const wanted = 1 + rng.int(3);
    while (cursor < crew.length && group.length < wanted) {
      const type = crew[cursor].type;
      const pieceValue = type === 'queen' ? 9 : type === 'rook' ? 5 : type === 'pawn' ? 1 : 3;
      if (group.length && value + pieceValue > 9) break;
      value += pieceValue;
      group.push(cursor);
      crew[cursor] = { ...crew[cursor], cardIndex };
      cursor += 1;
    }
    const abilityRoll = rng.int(ABILITY_ORDER.length + 1);
    if (abilityRoll > 0 && group.length) {
      const target = rng.pick(group);
      crew[target] = { ...crew[target], abilities: [ABILITY_ORDER[abilityRoll - 1]] };
    }
    cardIndex += 1;
  }
  return crew;
}

/** One Generate click owns both choosing a fresh seed and dealing the crew from it. */
export function generateNextDeploymentLabCrew(
  currentSeed: number,
  random: () => number = Math.random,
): Pick<DeploymentLabConfig, 'seed' | 'units'> {
  const sampled = Math.max(0, Math.min(GENERATION_SEED_SPACE - 1, Math.floor(random() * GENERATION_SEED_SPACE)));
  const seed = sampled === currentSeed ? (sampled + 1) % GENERATION_SEED_SPACE : sampled;
  return { seed, units: generateDeploymentLabCrew(seed) };
}

const clampInt = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};
const cellKey = (x: number, y: number): string => `${x},${y}`;
const validCellKey = (value: string): boolean => /^\d+,\d+$/.test(value);
const fromCellKey = (value: string): { x: number; y: number } | null => {
  const match = /^(\d+),(\d+)$/.exec(value);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

function cloneDefaultConfig(): DeploymentLabConfig {
  return {
    ...DEFAULT_DEPLOYMENT_LAB_CONFIG,
    units: DEFAULT_UNITS.map((unit) => ({ ...unit, abilities: [...unit.abilities] })),
    obstacles: [],
    manualPlacements: {},
  };
}

function parseUnits(value: string | null): DeploymentLabUnitConfig[] {
  if (value === null) return cloneDefaultConfig().units;
  if (value === '-') return [];
  return value.split(',').slice(0, 24).flatMap((token) => {
    const match = /^([pnbrqk])(?:\.([dea]?))(?:\.(\d+))?$/.exec(token);
    const type = match ? PIECE_BY_CODE[match[1]] : undefined;
    if (!match || !type) return [];
    const abilities = ABILITY_ORDER.filter((ability) => match[2]?.includes(ABILITY_CODE[ability]));
    const cardIndex = match[3] === undefined ? undefined : Number(match[3]);
    return [{ type, abilities, ...(cardIndex === undefined ? {} : { cardIndex }) }];
  });
}

function serializeUnits(units: readonly DeploymentLabUnitConfig[]): string {
  if (!units.length) return '-';
  return units.map((unit) => {
    const codes = ABILITY_ORDER.filter((ability) => unit.abilities.includes(ability))
      .map((ability) => ABILITY_CODE[ability])
      .join('');
    return `${PIECE_CODE[unit.type]}.${codes}${unit.cardIndex === undefined ? '' : `.${unit.cardIndex}`}`;
  }).join(',');
}

const readRegion = (value: string | null): DedicatedRegion => (
  value === 'front' || value === 'back' ? value : 'shared'
);

export function readDeploymentLabRoute(search: string): DeploymentLabConfig {
  const params = new URLSearchParams(search);
  const config = cloneDefaultConfig();
  config.files = clampInt(params.get('df'), config.files, 4, 12);
  config.deploymentRows = clampInt(params.get('dr'), config.deploymentRows, 1, 8);
  config.rowGap = params.get('dg') === '1' ? 1 : 0;
  config.seed = clampInt(params.get('ds'), config.seed, 0, 99_999);
  config.kingRegion = readRegion(params.get('dk'));
  config.units = parseUnits(params.get('du'));
  config.obstacles = [...new Set((params.get('do') ?? '').split(';').filter(validCellKey))];
  config.manualPlacements = Object.fromEntries(
    (params.get('dm') ?? '').split(';').flatMap((entry) => {
      const match = /^(\d+)@(\d+,\d+)$/.exec(entry);
      if (!match || Number(match[1]) >= config.units.length) return [];
      return [[match[1], match[2]]];
    }),
  );
  return config;
}

function sameUnits(first: readonly DeploymentLabUnitConfig[], second: readonly DeploymentLabUnitConfig[]): boolean {
  return serializeUnits(first) === serializeUnits(second);
}

export function writeDeploymentLabRouteParams(
  params: URLSearchParams,
  config: DeploymentLabConfig,
): URLSearchParams {
  ROUTE_KEYS.forEach((key) => params.delete(key));
  if (config.files !== DEFAULT_DEPLOYMENT_LAB_CONFIG.files) params.set('df', String(config.files));
  if (config.deploymentRows !== DEFAULT_DEPLOYMENT_LAB_CONFIG.deploymentRows) params.set('dr', String(config.deploymentRows));
  if (config.rowGap) params.set('dg', '1');
  if (config.seed !== DEFAULT_DEPLOYMENT_LAB_CONFIG.seed) params.set('ds', String(config.seed));
  if (config.kingRegion !== 'shared') params.set('dk', config.kingRegion);
  if (!sameUnits(config.units, DEFAULT_UNITS)) params.set('du', serializeUnits(config.units));
  if (config.obstacles.length) params.set('do', [...config.obstacles].sort().join(';'));
  const manual = Object.entries(config.manualPlacements)
    .filter(([index, cell]) => Number(index) < config.units.length && validCellKey(cell))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, cell]) => `${index}@${cell}`)
    .join(';');
  if (manual) params.set('dm', manual);
  return params;
}

export function deploymentLabRowCoordinates(config: Pick<DeploymentLabConfig, 'deploymentRows' | 'rowGap'>): number[] {
  const stride = config.rowGap + 1;
  return Array.from({ length: config.deploymentRows }, (_, index) => 3 + index * stride);
}

function deploymentLabBoardRows(config: Pick<DeploymentLabConfig, 'deploymentRows' | 'rowGap'>): number {
  return deploymentLabRowCoordinates(config).at(-1)! + 1;
}

function buildLevel(config: DeploymentLabConfig): Level {
  const rows = deploymentLabBoardRows(config);
  const level = createBlankLevel('deployment-lab', 'Deployment Lab', config.files, rows);
  const rowCoordinates = deploymentLabRowCoordinates(config);
  const allCells = rowCoordinates.flatMap((y) => (
    Array.from({ length: config.files }, (_, x) => [x, y] as [number, number])
  ));
  const excludedPieceTypes: PlayablePieceType[] = [];
  if (config.kingRegion !== 'shared') excludedPieceTypes.push('king');
  level.layers.zones = [{
    id: 'deployment-lab-general',
    name: 'Player Deployment',
    type: 'player-spawn',
    excludedPieceTypes,
    tiles: allCells,
  }];
  const dedicatedRow = (region: Exclude<DedicatedRegion, 'shared'>): number => (
    region === 'front' ? rowCoordinates[0] : rowCoordinates.at(-1)!
  );
  if (config.kingRegion !== 'shared') {
    const y = dedicatedRow(config.kingRegion);
    level.layers.zones.push({
      id: 'deployment-lab-king',
      name: 'King Deployment',
      type: 'player-king-spawn',
      tiles: Array.from({ length: config.files }, (_, x) => [x, y]),
    });
  }
  const deploymentRowSet = new Set(rowCoordinates);
  const rocks = config.obstacles.flatMap((key, index) => {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= config.files || y >= rows || !deploymentRowSet.has(y)) return [];
    return [{ x, y, type: 'rock' as const, side: 'neutral' as const, runUnitId: `deployment-lab-rock-${index}` }];
  });
  const enemyKingX = Math.floor((config.files - 1) / 2);
  level.layers.units = [
    ...rocks,
    { x: enemyKingX, y: 0, type: 'king', side: 'enemy' },
    { x: Math.max(0, enemyKingX - 1), y: 1, type: 'pawn', side: 'enemy' },
    { x: Math.min(config.files - 1, enemyKingX + 1), y: 1, type: 'pawn', side: 'enemy' },
  ];
  return level;
}

function buildArmy(config: DeploymentLabConfig): RunArmyUnit[] {
  const numberByType = new Map<PlayablePieceType, number>();
  let retainedKingAssigned = false;
  let startingPawnsAssigned = 0;
  return config.units.map((unit, index) => {
    const number = (numberByType.get(unit.type) ?? 0) + 1;
    numberByType.set(unit.type, number);
    const isRetainedKing = unit.type === 'king' && !retainedKingAssigned;
    if (isRetainedKing) retainedKingAssigned = true;
    const isStartingPawn = unit.type === 'pawn' && startingPawnsAssigned < 2;
    const startingPawnId = isStartingPawn ? `run-pawn-${startingPawnsAssigned === 0 ? 'a' : 'b'}` : null;
    if (isStartingPawn) startingPawnsAssigned += 1;
    return {
      id: isRetainedKing ? 'run-king' : startingPawnId ?? `deployment-lab-unit-${index}`,
      name: `${PIECE_LABEL[unit.type]} ${number}`,
      type: unit.type,
      number,
      inspectionSeed: config.seed + index,
      abilities: unit.abilities.slice(0, 1),
      modifiers: [],
      source: isRetainedKing ? 'king' : isStartingPawn ? 'starting' : 'adlectio',
    };
  });
}

function buildCards(
  config: DeploymentLabConfig,
  army: readonly RunArmyUnit[],
  starters: RunDocument['cards'],
): RunDocument['cards'] {
  const startingPawnIds = army.filter((unit) => unit.source === 'starting' && unit.type === 'pawn').map((unit) => unit.id);
  const starterCards = starters.map((card) => card.coreId === 'his-grace'
    ? { ...card, unitSeats: ['run-king'] }
    : card.coreId === 'front-lines'
      ? { ...card, unitSeats: startingPawnIds }
      : card);
  const ordinary = config.units.flatMap((unit, index) => {
    const member = army[index];
    return member && member.source === 'adlectio' && member.type !== 'king'
      ? [{ config: unit, unit: member, index }]
      : [];
  });
  const grouped = new Map<number, typeof ordinary>();
  for (const entry of ordinary) {
    const group = entry.config.cardIndex ?? (10_000 + entry.index);
    grouped.set(group, [...(grouped.get(group) ?? []), entry]);
  }
  const packs: typeof ordinary[] = [];
  for (const entries of grouped.values()) {
    let current: typeof ordinary = [];
    let value = 0;
    let enhanced = false;
    for (const entry of entries) {
      const nextValue = PIECE_VALUE[entry.unit.type];
      const nextEnhanced = entry.unit.abilities.length > 0;
      if (current.length && (value + nextValue > 9 || (enhanced && nextEnhanced))) {
        packs.push(current);
        current = [];
        value = 0;
        enhanced = false;
      }
      current.push(entry);
      value += nextValue;
      enhanced ||= nextEnhanced;
    }
    if (current.length) packs.push(current);
  }
  const pieceOrder: readonly Exclude<PlayablePieceType, 'king'>[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
  return [
    ...starterCards,
    ...packs.map((entries, index) => {
      const enhanced = entries.find((entry) => entry.unit.abilities.length > 0);
      const ability = enhanced?.unit.abilities[0];
      const cardType: RunDocument['cards'][number]['cardType'] = ability === 'adlected' ? 'legatine'
        : ability === 'eutactic' ? 'concinnous'
          : ability === 'agminate' ? 'hieratic' : null;
      const coreId = [...entries]
        .sort((a, b) => pieceOrder.indexOf(a.unit.type as Exclude<PlayablePieceType, 'king'>)
          - pieceOrder.indexOf(b.unit.type as Exclude<PlayablePieceType, 'king'>))
        .map((entry) => CARD_PIECE_CODE[entry.unit.type as Exclude<PlayablePieceType, 'king'>])
        .join('');
      return {
        id: `deployment-lab-card-${index + 1}`,
        coreId,
        cardType,
        effectSeed: mixSeed(config.seed, 'deployment-lab-card', index),
        effectTargetUnitId: enhanced?.unit.id ?? null,
        unitSeats: entries.map((entry) => entry.unit.id),
        lostUnitIds: [],
        cacochymicUnitId: null,
        acquiredAfterBattleIndex: 0,
      };
    }),
  ];
}

export interface DeploymentLabSnapshot {
  level: Level;
  run: RunDocument;
  options: ReturnType<typeof deploymentOptions>;
  layout: ReturnType<typeof deploymentOptions>['layouts'][number];
  board: ReturnType<typeof levelToEditorBoard>;
}

/** Build one lab result entirely through the Run's canonical deployment and projection paths. */
export function buildDeploymentLabSnapshot(config: DeploymentLabConfig): DeploymentLabSnapshot {
  const level = buildLevel(config);
  const army = buildArmy(config);
  const war = {
    id: 'deployment-lab-war',
    name: 'Deployment Lab War',
    description: 'Synthetic Studio input for the canonical Run deployment placer.',
    battles: [{ level, loot: false }],
  };
  const base = createRun(war, config.seed, '2026-01-01T00:00:00.000Z');
  const cards = buildCards(config, army, base.cards);
  let run = prepareDeployment({
    ...base,
    phase: 'deployment',
    battleIndex: 0,
    // The algorithm view traces the whole configured crew. The real player-flow launch below
    // resets this to Conflict 0, where Deployment draws exactly three cards.
    conflictIndex: 99,
    army,
    cards,
    sectio: null,
    vacantia: null,
    deployment: null,
    battleRuntime: null,
  });
  const manualPlacements = Object.fromEntries(
    Object.entries(config.manualPlacements).flatMap(([index, cell]) => {
      const unit = army[Number(index)];
      return unit && validCellKey(cell) ? [[unit.id, cell]] : [];
    }),
  );
  run = beginDeploymentDeal(run);
  run = completeDeploymentDeal(run, level);
  run = setDeploymentTransport(run, 'full-deploy');
  while (run.phase === 'deployment') {
    if (run.deployment?.stage === 'card') {
      run = revealActiveDeploymentCard(run);
      continue;
    }
    if (run.deployment?.stage === 'revealing') {
      run = finishDeploymentCardReveal(run);
      continue;
    }
    if (run.deployment?.stage === 'settling') {
      run = finishDeploymentUnitSettlement(run, level);
      continue;
    }
    if (run.deployment?.stage === 'discarding') {
      run = finishDeploymentCardDiscard(run);
      continue;
    }
    const unit = currentDeploymentUnit(run);
    if (!unit) break;
    const options = deploymentOptions(run, level);
    const configured = fromCellKey(manualPlacements[unit.id] ?? '');
    const cell = configured && disciplinePlacementCells(run, options, unit.id).some((candidate) => (
      candidate.x === configured.x && candidate.y === configured.y
    ))
      ? configured
      : disciplinePlacementCells(run, options, unit.id)[0];
    const next = cell ? placeAdlectedDeploymentUnit(run, level, cell) : advanceDeploymentTransport(run, level);
    if (next === run) break;
    run = next;
  }
  const options = deploymentOptions(run, level);
  const layout = options.layouts[0];
  const board = levelToEditorBoard(levelWithRunDeployment(run, level, layout));
  return { level, run, options, layout, board };
}

/**
 * Produce the exact active-Run document the player-flow launcher hands to RunScreen. Debug-only
 * manual/layout selections are cleared so the real Deployment UI must resolve every choice.
 */
export function buildDeploymentLabFlowRun(config: DeploymentLabConfig): RunDocument {
  const snapshot = buildDeploymentLabSnapshot({ ...config, manualPlacements: {} });
  return prepareDeployment({
    ...snapshot.run,
    phase: 'deployment',
    conflictIndex: 0,
    lipsana: [],
    seenLipsana: [],
    deployment: null,
    battleRuntime: null,
  });
}

export function deploymentLabFlowIssue(config: DeploymentLabConfig): string | null {
  if (!config.units.length) return 'Add at least one unit before starting the player flow.';
  const kingCount = config.units.filter((unit) => unit.type === 'king').length;
  if (kingCount === 0) return 'Add a King before starting the player flow.';
  if (kingCount > 1) return 'Keep exactly one King before starting the player flow.';
  if (config.units.some((unit) => unit.abilities.length > 1)) {
    return 'Each unit may carry only one deployment ability.';
  }
  return null;
}

const PIECE_OPTIONS: readonly HouseSelectOption<PlayablePieceType>[] = PLAYABLE_PIECE_TYPES.map((type) => ({
  value: type,
  label: PIECE_LABEL[type],
}));
const REGION_OPTIONS: readonly HouseSelectOption<DedicatedRegion>[] = [
  { value: 'shared', label: 'Shared zone' },
  { value: 'front', label: 'Front row only' },
  { value: 'back', label: 'Back row only' },
];
const ABILITY_LABEL: Record<RunAbility, string> = {
  adlected: 'Adlected', eutactic: 'Eutactic', agminate: 'Agminate',
};

function stationSummary(trace: RunDeploymentTraceEntry): string {
  if (trace.result === 'manual' || trace.result === 'manual-pending') return 'Manual (Adlected)';
  if (trace.result === 'blocked') return '—';
  if (!trace.agminate) return 'Seeded random';
  if (trace.type === 'pawn') return 'Pawn line / open file';
  if (trace.type === 'queen') return 'Center';
  if (trace.type === 'knight') return 'One square in';
  if (trace.type === 'bishop') return 'Opposite colors';
  if (trace.type === 'rook') return 'King / corners';
  return 'Edge';
}

function rowSummary(trace: RunDeploymentTraceEntry): string {
  if (trace.result === 'manual' || trace.result === 'manual-pending') return 'Manual (Adlected)';
  if (trace.result === 'blocked') return '—';
  if (trace.eutacticTargetRowIndex === undefined) return 'Any eligible row';
  const target = trace.type === 'pawn'
    ? 'Front'
    : trace.type === 'knight' || trace.type === 'bishop'
      ? trace.eutacticTargetRowIndex === 0 ? 'Only row' : 'Front − 1'
      : 'Back';
  if (trace.selectedRow === undefined) return target;
  const fallback = trace.eutacticTargetRow !== trace.selectedRow ? ' · fallback' : '';
  return `${target} → y${trace.selectedRow}${fallback}`;
}

function resultSummary(trace: RunDeploymentTraceEntry): string {
  if (trace.result === 'automatic' && trace.chosen) {
    return `(${trace.chosen.x},${trace.chosen.y}) · ${trace.score?.toFixed(2) ?? '—'}`;
  }
  if (trace.result === 'manual' && trace.chosen) return `Manual (${trace.chosen.x},${trace.chosen.y})`;
  if (trace.result === 'manual-pending') return 'Awaiting square';
  if (trace.result === 'blocked') return 'Overflow reserve';
  return 'No eligible square';
}

export function DeploymentLabCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="tileset-studio-grid deployment-lab-catalog" aria-label="Deployment instruments">
      <StudioCatalogCard
        title="Deployment Lab"
        badge="Canonical Run placement"
        titleText="Deployment Lab — canonical Run placement"
        onSelect={onOpen}
        onOpen={onOpen}
        media={<span className="deployment-lab-card-media" aria-hidden="true">♙ ♘ ♗ ♖ ♕ ♔</span>}
        textExtra={<span>Rows, regions, obstacles, abilities, seeds, and per-unit trace.</span>}
      />
    </div>
  );
}

export function DeploymentLabViewer(): ReactElement {
  useSceneParticipant('studio:deployment-lab-viewer', 'painted');
  const replaceActiveRun = useActiveRun((state) => state.replace);
  const hydrateActiveRun = useActiveRun((state) => state.hydrate);
  const [config, setConfig] = useState<DeploymentLabConfig>(() => readDeploymentLabRoute(window.location.search));
  const [addType, setAddType] = useState<PlayablePieceType>('pawn');
  const [tool, setTool] = useState('obstacle');
  const [flowLaunchState, setFlowLaunchState] = useState<'idle' | 'preparing' | 'error'>('idle');
  const snapshot = useMemo(() => buildDeploymentLabSnapshot(config), [config]);
  const zoneCells = useMemo(() => new Set(snapshot.options.zoneCells.map((cell) => cellKey(cell.x, cell.y))), [snapshot.options.zoneCells]);
  const kingCells = useMemo(() => new Set(snapshot.level.layers.zones.find((zone) => zone.type === 'player-king-spawn')?.tiles.map(([x, y]) => cellKey(x, y)) ?? []), [snapshot.level]);
  const obstacleCells = useMemo(() => new Set(config.obstacles), [config.obstacles]);
  const flowIssue = deploymentLabFlowIssue(config);
  const selectedUnitIndex = tool.startsWith('unit:') ? Number(tool.slice(5)) : -1;
  const selectedUnit = snapshot.run.army[selectedUnitIndex];
  const legalManualCells = useMemo(() => new Set(
    selectedUnit
      ? disciplinePlacementCells(snapshot.run, snapshot.options, selectedUnit.id).map((cell) => cellKey(cell.x, cell.y))
      : [],
  ), [selectedUnit, snapshot.options, snapshot.run]);
  const toolOptions = useMemo<HouseSelectOption[]>(() => [
    { value: 'obstacle', label: 'Toggle obstacles' },
    ...snapshot.run.army.flatMap((unit, index) => unit.abilities.includes('adlected')
      ? [{ value: `unit:${index}`, label: `Place ${unit.name}` }]
      : []),
  ], [snapshot.run.army]);

  useEffect(() => subscribeAppLocation(() => {
    setConfig(readDeploymentLabRoute(window.location.search));
  }), []);

  useEffect(() => {
    const params = writeDeploymentLabRouteParams(new URLSearchParams(window.location.search), config);
    const next = `${window.location.pathname}?${params.toString()}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) navigateApp(next, { replace: true, scroll: false });
  }, [config]);

  useEffect(() => {
    if (tool === 'obstacle') return;
    if (!selectedUnit?.abilities.includes('adlected')) setTool('obstacle');
  }, [selectedUnit, tool]);

  const update = useCallback((patch: Partial<DeploymentLabConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  }, []);
  const updateUnit = useCallback((index: number, next: DeploymentLabUnitConfig) => {
    setConfig((current) => ({
      ...current,
      units: current.units.map((unit, unitIndex) => unitIndex === index ? next : unit),
    }));
  }, []);
  const toggleAbility = useCallback((index: number, ability: RunAbility) => {
    const unit = config.units[index];
    if (!unit) return;
    const abilities = unit.abilities.includes(ability)
      ? []
      : [ability];
    updateUnit(index, { ...unit, abilities });
  }, [config.units, updateUnit]);
  const generateCrew = useCallback(() => {
    setConfig((current) => ({ ...current, ...generateNextDeploymentLabCrew(current.seed), manualPlacements: {} }));
    setTool('obstacle');
  }, []);
  const handleCell = useCallback((key: string) => {
    if (tool === 'obstacle') {
      if (!zoneCells.has(key)) return;
      setConfig((current) => ({
        ...current,
        obstacles: current.obstacles.includes(key)
          ? current.obstacles.filter((cell) => cell !== key)
          : [...current.obstacles, key],
      }));
      return;
    }
    if (!legalManualCells.has(key) || selectedUnitIndex < 0) return;
    setConfig((current) => ({
      ...current,
      manualPlacements: { ...current.manualPlacements, [selectedUnitIndex]: key },
    }));
  }, [legalManualCells, selectedUnitIndex, tool, zoneCells]);

  const startPlayerFlow = useCallback(async () => {
    const issue = deploymentLabFlowIssue(config);
    if (issue) return;
    setFlowLaunchState('preparing');
    try {
      // Studio does not otherwise need the active Run. Join the account/browser document before
      // replacing it, so navigation cannot hydrate an older account Run over this lab fixture.
      await hydrateActiveRun();
      replaceActiveRun(buildDeploymentLabFlowRun(config));
      navigateApp(deploymentLabPlayerFlowHref(window.location.href));
    } catch {
      setFlowLaunchState('error');
    }
  }, [config, hydrateActiveRun, replaceActiveRun]);

  const deployedCount = Object.keys(snapshot.layout.placements).length;
  const rowCoordinates = deploymentLabRowCoordinates(config);

  return (
    <>
      <section className="al-lab-main deployment-lab-main" aria-label="Deployment Lab output">
        <header className="deployment-lab-heading">
          <div>
            <h2>Deployment Lab</h2>
            <p>Real Run placer · generated seed {config.seed}</p>
          </div>
          <dl>
            <div><dt>Rows</dt><dd>{rowCoordinates.join(', ')}</dd></div>
            <div><dt>Placed</dt><dd>{deployedCount}/{config.units.length}</dd></div>
            <div><dt>Capacity</dt><dd>{snapshot.options.zoneCells.length}</dd></div>
          </dl>
        </header>

        <div className="deployment-lab-output">
          <InnerChromeBox className="deployment-lab-board-frame">
            <StaticReadOnlyBoardView
              board={snapshot.board}
              ariaLabel={`Deployment result for seed ${config.seed}`}
              renderCellOverlay={(cell) => {
                const key = cellKey(cell.x, cell.y);
                const legal = tool !== 'obstacle' && legalManualCells.has(key);
                const selected = obstacleCells.has(key)
                  || (selectedUnitIndex >= 0 && config.manualPlacements[selectedUnitIndex] === key);
                const zoneClass = kingCells.has(key) ? 'gold' : zoneCells.has(key) ? 'blue' : null;
                return (
                  <button
                    type="button"
                    className={`skirmish-board-cell-hit deployment-lab-cell${legal ? ' is-move' : ''}${selected ? ' is-selected' : ''}`}
                    aria-label={tool === 'obstacle'
                      ? zoneCells.has(key)
                        ? `${obstacleCells.has(key) ? 'Remove' : 'Add'} obstacle at ${key}`
                        : `${key} is outside Player Deployment`
                      : `${legal ? 'Place' : 'Cannot place'} ${selectedUnit?.name ?? 'unit'} at ${key}`}
                    aria-pressed={selected}
                    onClick={() => handleCell(key)}
                  >
                    {zoneClass ? <span className={`le-zone-cell le-zone-${zoneClass}`} aria-hidden="true" /> : null}
                    {legal ? <PredrawnMoveHighlightPaint /> : null}
                  </button>
                );
              }}
            />
          </InnerChromeBox>

          <InnerChromeBox className="deployment-lab-trace-frame">
            <div className="deployment-lab-trace-heading">
              <div>
                <h3>Placement trace</h3>
                <p>Eutactic chooses a best-fit row; Agminate chooses a piece-specific station.</p>
              </div>
              <span>{tool === 'obstacle' ? 'Board clicks toggle rocks' : `Board clicks place ${selectedUnit?.name ?? 'unit'}`}</span>
            </div>
            <div className="deployment-lab-trace-scroll">
              <table>
                <thead>
                  <tr><th>Pass</th><th>Unit</th><th>Abilities</th><th>Row</th><th>Station</th><th>Candidates</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {snapshot.layout.trace.map((trace) => {
                    const unit = snapshot.run.army.find((candidate) => candidate.id === trace.unitId)!;
                    return (
                      <tr key={trace.unitId} className={trace.result === 'stranded' || trace.result === 'manual-pending' ? 'is-warning' : ''}>
                        <td>{trace.automaticOrder ?? '—'}</td>
                        <td>{unit.name}</td>
                        <td>{unit.abilities.length ? unit.abilities.map((ability) => ABILITY_LABEL[ability]).join(' · ') : 'None'}</td>
                        <td>{rowSummary(trace)}</td>
                        <td>{stationSummary(trace)}</td>
                        <td>{trace.availableCellCount ?? '—'} → {trace.candidateCount ?? '—'}</td>
                        <td>{resultSummary(trace)}</td>
                      </tr>
                    );
                  })}
                  {!snapshot.layout.trace.length ? (
                    <tr><td colSpan={7}>Add a unit in Controls to begin.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </InnerChromeBox>
        </div>
      </section>

      <aside className="tileset-view-controls deployment-lab-controls" aria-label="Deployment Lab controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            <div className="deployment-lab-control-group deployment-lab-flow-controls">
              <h3>Player flow</h3>
              <p>
                Replace the active Run with this case and enter the real Deployment battlefield.
                Three cards draw face down into Controls, then the real controls carry the case into Battle.
              </p>
              <InnerTextButton
                tone="primary"
                data-testid="deployment-lab-start-flow"
                disabled={Boolean(flowIssue) || flowLaunchState === 'preparing'}
                onClick={() => { void startPlayerFlow(); }}
              >{flowLaunchState === 'preparing' ? 'Preparing active Run…' : 'Start real Deployment'}</InnerTextButton>
              {flowIssue ? <p className="deployment-lab-flow-issue" role="status">{flowIssue}</p> : null}
              {flowLaunchState === 'error' ? (
                <p className="deployment-lab-flow-issue" role="alert">The active Run could not be prepared. Try again.</p>
              ) : null}
            </div>

            <SliderRow label={`Files · ${config.files}`} value={config.files} set={(files) => update({ files })} min={4} max={12} dflt={8} />
            <SliderRow label={`Deployment rows · ${config.deploymentRows}`} value={config.deploymentRows} set={(deploymentRows) => update({ deploymentRows })} min={1} max={8} dflt={5} />
            <SliderRow label={`Gap between rows · ${config.rowGap}`} value={config.rowGap} set={(rowGap) => update({ rowGap: rowGap ? 1 : 0 })} min={0} max={1} dflt={0} />
            <div className="deployment-lab-control-group deployment-lab-generate-controls">
              <h3>Crew generator</h3>
              <p>
                Generate picks a fresh random seed and deals new unit types and abilities.
                The resulting roster remains fully editable below.
              </p>
              <InnerTextButton
                tone="primary"
                data-testid="deployment-lab-generate-crew"
                onClick={generateCrew}
              >Generate</InnerTextButton>
            </div>

            <div className="deployment-lab-control-group">
              <h3>Automatic eligibility</h3>
              <label>King region
                <HouseSelect value={config.kingRegion} options={REGION_OPTIONS} onChange={(kingRegion) => update({ kingRegion })} ariaLabel="King deployment region" />
              </label>
            </div>

            <div className="deployment-lab-control-group">
              <h3>Board click</h3>
              <HouseSelect value={tool} options={toolOptions} onChange={setTool} ariaLabel="Board click tool" />
            </div>

            <div className="deployment-lab-control-group deployment-lab-roster-controls">
              <h3>Roster</h3>
              {config.units.map((unit, index) => (
                <InnerChromeBox className="deployment-lab-unit-control" key={`${index}-${unit.type}`}>
                  <div className="deployment-lab-unit-control-head">
                    <HouseSelect
                      value={unit.type}
                      options={PIECE_OPTIONS}
                      onChange={(type) => updateUnit(index, { ...unit, type })}
                      ariaLabel={`Unit ${index + 1} type`}
                    />
                    <InnerTextButton
                      aria-label={`Remove unit ${index + 1}`}
                      title="Remove unit"
                      onClick={() => setConfig((current) => ({
                        ...current,
                        units: current.units.filter((_, unitIndex) => unitIndex !== index),
                        manualPlacements: {},
                      }))}
                    >×</InnerTextButton>
                  </div>
                  <div className="deployment-lab-ability-toggles">
                    {ABILITY_ORDER.map((ability) => (
                      <label key={ability} title={ABILITY_LABEL[ability]}>
                        <input
                          type="checkbox"
                          checked={unit.abilities.includes(ability)}
                          onChange={() => toggleAbility(index, ability)}
                        />
                        {ABILITY_LABEL[ability]}
                      </label>
                    ))}
                  </div>
                </InnerChromeBox>
              ))}
              <div className="deployment-lab-add-unit">
                <HouseSelect value={addType} options={PIECE_OPTIONS} onChange={setAddType} ariaLabel="New unit type" />
                <InnerTextButton onClick={() => setConfig((current) => ({
                  ...current,
                  units: [...current.units, { type: addType, abilities: [] }],
                  manualPlacements: {},
                }))}>Add unit</InnerTextButton>
              </div>
            </div>

            <InnerTextButton
              onClick={() => {
                setConfig(cloneDefaultConfig());
                setTool('obstacle');
              }}
            >Reset lab</InnerTextButton>
          </div>
        </section>
      </aside>
    </>
  );
}
