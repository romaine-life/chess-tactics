import { FEATURE_DIRS, parseEdgeKey, resolveFeatureOverlays } from './featureAutotile';
import type { Level, TerrainCell } from './level';
import { familyOfTile, levelToEditorBoard } from './levelBoard';
import { propCells, propDef, type PropDef } from './props';
import { boardLabCellPosition } from '../render/boardProjection';
import { decodeBoard, type EditorBoard, type FeatureCell } from '../ui/boardCode';

export type PredrawnGenerationCoordinate = readonly [x: number, y: number];
export type PredrawnGenerationEdge = readonly [
  a: PredrawnGenerationCoordinate,
  b: PredrawnGenerationCoordinate,
];

export interface PredrawnGenerationCell {
  /** Anonymous surface class. Image 1, not this token, owns its appearance. */
  surface: string;
  elevation: number;
  /** A void coordinate remains inside the rectangular grid envelope but is not traversable. */
  playable: boolean;
}

export interface PredrawnLinearFeatureDefinition {
  id: string;
  kind: FeatureCell['kind'];
  cells: PredrawnGenerationCoordinate[];
  /** Undirected connections between two cells carrying this feature. */
  connections: PredrawnGenerationEdge[];
  /** Authored stubs from a feature cell to a cell/coordinate without that feature. */
  exits: PredrawnGenerationEdge[];
}

export interface PredrawnBarrierDefinition {
  id: string;
  kind: 'fence' | 'wall';
  a: PredrawnGenerationCoordinate;
  b: PredrawnGenerationCoordinate;
  blocksCrossing: true;
}

export interface PredrawnFootprintDefinition {
  id: string;
  kind: 'prop' | 'doodad';
  /** Stable canonical id retained as provenance; prompt copy must not reinterpret its appearance. */
  sourceId: string;
  cells: PredrawnGenerationCoordinate[];
  traversal: 'passable' | 'impassable';
}

export interface PredrawnOuterPerimeterEdge {
  cell: PredrawnGenerationCoordinate;
  neighbor: PredrawnGenerationCoordinate;
}

export interface PredrawnImpassableTransition {
  a: PredrawnGenerationCoordinate;
  b: PredrawnGenerationCoordinate;
}

export interface PredrawnGenerationDefinition {
  schemaVersion: 2;
  runId: string;
  levelId: string;
  reference: { sourceSlot: string };
  request: {
    provider: string;
    model: string;
    mode: 'isolated-top-only';
    referenceCount: 1;
    aspectRatio: '16:9';
  };
  board: {
    columns: number;
    rows: number;
    projection: {
      kind: 'parallel-orthographic-isometric';
      axisX: { screenDx: number; screenDy: number };
      axisY: { screenDx: number; screenDy: number };
      stepLengthRule: 'equal-projected-step-lengths';
    };
    coordinateConvention: {
      order: '(x,y)';
      xAxis: 'increases down-right on screen';
      yAxis: 'increases down-left on screen';
    };
    /** Generic meanings only. Surface identity and finish remain visible-image authority. */
    surfaceDefinitions: Record<string, string>;
    cells: PredrawnGenerationCell[][];
  };
  linearFeatures: PredrawnLinearFeatureDefinition[];
  barriers: PredrawnBarrierDefinition[];
  footprints: PredrawnFootprintDefinition[];
  /** The complete rectangular grid envelope, including envelope edges beside void coordinates. */
  outerPerimeter: {
    edges: PredrawnOuterPerimeterEdge[];
    /** Authored feature continuations that deliberately cross the rectangular envelope. */
    openings: PredrawnOuterPerimeterEdge[];
  };
  /** Passable-to-void internal edges. These are not a replacement outer perimeter. */
  impassableTransitions: PredrawnImpassableTransition[];
}

export interface PredrawnGenerationDefinitionOptions {
  runId: string;
  referenceSourceSlot: string;
  provider: string;
  model: string;
  resolveProp?: (propId: string) => PropDef | undefined;
}

const coordinateKey = ([x, y]: PredrawnGenerationCoordinate): string => `${x},${y}`;
const compareCoordinates = (a: PredrawnGenerationCoordinate, b: PredrawnGenerationCoordinate): number =>
  a[1] - b[1] || a[0] - b[0];

function canonicalEdgeKey(a: PredrawnGenerationCoordinate, b: PredrawnGenerationCoordinate): string {
  const aKey = coordinateKey(a);
  const bKey = coordinateKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function canonicalEdge(a: PredrawnGenerationCoordinate, b: PredrawnGenerationCoordinate): PredrawnGenerationEdge {
  return coordinateKey(a) < coordinateKey(b) ? [a, b] : [b, a];
}

function compareEdges(a: PredrawnGenerationEdge, b: PredrawnGenerationEdge): number {
  return canonicalEdgeKey(a[0], a[1]).localeCompare(canonicalEdgeKey(b[0], b[1]));
}

function inBoard(cell: PredrawnGenerationCoordinate, columns: number, rows: number): boolean {
  return Number.isInteger(cell[0])
    && Number.isInteger(cell[1])
    && cell[0] >= 0
    && cell[0] < columns
    && cell[1] >= 0
    && cell[1] < rows;
}

function exactTerrain(level: Level): Map<string, TerrainCell> {
  const { cols, rows } = level.board;
  const terrain = new Map<string, TerrainCell>();
  for (const cell of level.layers.terrain) {
    const coordinate: PredrawnGenerationCoordinate = [cell.x, cell.y];
    if (!inBoard(coordinate, cols, rows)) {
      throw new Error(`predrawn definition: terrain coordinate ${coordinateKey(coordinate)} is outside ${cols}x${rows}`);
    }
    const key = coordinateKey(coordinate);
    if (terrain.has(key)) throw new Error(`predrawn definition: duplicate terrain coordinate ${key}`);
    terrain.set(key, cell);
  }
  if (terrain.size !== cols * rows) {
    throw new Error(`predrawn definition: terrain has ${terrain.size} coordinates, expected ${cols * rows}`);
  }
  return terrain;
}

function assertCanonicalAgreement(level: Level, board: EditorBoard, terrain: ReadonlyMap<string, TerrainCell>): void {
  if (board.cols !== level.board.cols || board.rows !== level.board.rows) {
    throw new Error(
      `predrawn definition: boardCode is ${board.cols}x${board.rows}, level board is ${level.board.cols}x${level.board.rows}`,
    );
  }
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const semantic = terrain.get(key);
      if (!semantic) throw new Error(`predrawn definition: missing terrain coordinate ${key}`);
      const hasSurface = typeof board.cells[key] === 'string' && board.cells[key].length > 0;
      if (hasSurface === (semantic.terrain === 'void')) {
        throw new Error(`predrawn definition: boardCode and terrain disagree about void coordinate ${key}`);
      }
      const hasRoad = board.features[key]?.kind === 'road';
      if (hasRoad !== (semantic.terrain === 'road')) {
        throw new Error(`predrawn definition: boardCode and terrain disagree about road coordinate ${key}`);
      }
    }
  }

  const visualProps = Object.entries(board.props ?? {})
    .map(([key, placement]) => `${key}=${placement.propId}`)
    .sort();
  const durableProps = (level.layers.props ?? [])
    .map((placement) => `${placement.x},${placement.y}=${placement.propId}`)
    .sort();
  if (visualProps.join('|') !== durableProps.join('|')) {
    throw new Error('predrawn definition: boardCode and level props disagree');
  }

  const visualBarrierKeys = new Set([
    ...Object.keys(board.fences ?? {}),
    ...Object.keys(board.walls ?? {}),
  ]);
  const durableBarrierKeys = new Set(level.layers.fences ?? []);
  if (
    visualBarrierKeys.size !== durableBarrierKeys.size
    || [...visualBarrierKeys].some((edge) => !durableBarrierKeys.has(edge))
  ) {
    throw new Error('predrawn definition: boardCode and level blocking edges disagree');
  }
}

function anonymousSurfaceClasses(board: EditorBoard): {
  sourceToToken: ReadonlyMap<string, string>;
  definitions: Record<string, string>;
} {
  const sourceSurfaces = [...new Set(
    Object.values(board.cells).map((tileId) => {
      const family = familyOfTile(tileId);
      if (!family) throw new Error(`predrawn definition: unknown canonical terrain tile ${tileId}`);
      return family;
    }),
  )].sort();
  const sourceToToken = new Map(sourceSurfaces.map((surface, index) => [surface, `S${index + 1}`]));
  const definitions = Object.fromEntries(
    [...sourceToToken.values()].map((token) => [
      token,
      'a distinct canonical top-surface class whose appearance is owned only by Image 1',
    ]),
  );
  definitions.VOID = 'a non-playable void coordinate whose environmental appearance is owned only by Image 1';
  return { sourceToToken, definitions };
}

function boardCells(
  board: EditorBoard,
  terrain: ReadonlyMap<string, TerrainCell>,
): Pick<PredrawnGenerationDefinition['board'], 'surfaceDefinitions' | 'cells'> {
  const { sourceToToken, definitions } = anonymousSurfaceClasses(board);
  const cells: PredrawnGenerationCell[][] = [];
  for (let y = 0; y < board.rows; y += 1) {
    const row: PredrawnGenerationCell[] = [];
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const cell = terrain.get(key);
      if (!cell) throw new Error(`predrawn definition: missing terrain coordinate ${key}`);
      if (cell.terrain === 'void') {
        row.push({ surface: 'VOID', elevation: cell.elevation, playable: false });
        continue;
      }
      const tileId = board.cells[key];
      const family = tileId ? familyOfTile(tileId) : undefined;
      const surface = family ? sourceToToken.get(family) : undefined;
      if (!surface) throw new Error(`predrawn definition: no canonical surface class for ${key}`);
      row.push({ surface, elevation: cell.elevation, playable: true });
    }
    cells.push(row);
  }
  return { surfaceDefinitions: definitions, cells };
}

function linearFeatures(board: EditorBoard): PredrawnLinearFeatureDefinition[] {
  const overlays = resolveFeatureOverlays(
    board.features,
    (edge) => board.featureCuts[edge] === true,
    (edge) => board.featureExits[edge] === true,
  );
  const kinds = [...new Set(Object.values(board.features).map((feature) => feature.kind))].sort();
  return kinds.map((kind) => {
    const cells = Object.entries(board.features)
      .filter(([, feature]) => feature.kind === kind)
      .map(([key]) => key.split(',').map(Number) as [number, number])
      .sort(compareCoordinates);
    const connections = new Map<string, PredrawnGenerationEdge>();
    const exits = new Map<string, PredrawnGenerationEdge>();
    for (const cell of cells) {
      const overlay = overlays[coordinateKey(cell)];
      if (!overlay) throw new Error(`predrawn definition: missing resolved ${kind} feature at ${coordinateKey(cell)}`);
      for (const direction of FEATURE_DIRS) {
        if ((overlay.mask & direction.bit) === 0) continue;
        const neighbor: PredrawnGenerationCoordinate = [cell[0] + direction.dx, cell[1] + direction.dy];
        if (board.features[coordinateKey(neighbor)]?.kind === kind) {
          const edge = canonicalEdge(cell, neighbor);
          connections.set(canonicalEdgeKey(edge[0], edge[1]), edge);
        } else {
          const edge: PredrawnGenerationEdge = [cell, neighbor];
          exits.set(`${coordinateKey(cell)}>${coordinateKey(neighbor)}`, edge);
        }
      }
    }
    return {
      id: kind,
      kind,
      cells,
      connections: [...connections.values()].sort(compareEdges),
      exits: [...exits.values()].sort((a, b) => `${coordinateKey(a[0])}>${coordinateKey(a[1])}`.localeCompare(`${coordinateKey(b[0])}>${coordinateKey(b[1])}`)),
    };
  });
}

function barriers(board: EditorBoard): PredrawnBarrierDefinition[] {
  const definitions: PredrawnBarrierDefinition[] = [];
  const seen = new Set<string>();
  for (const [kind, entries] of [
    ['fence', board.fences ?? {}],
    ['wall', board.walls ?? {}],
  ] as const) {
    for (const edgeKey of Object.keys(entries).sort()) {
      const parsed = parseEdgeKey(edgeKey);
      if (!parsed || Math.abs(parsed.ax - parsed.bx) + Math.abs(parsed.ay - parsed.by) !== 1) {
        throw new Error(`predrawn definition: malformed ${kind} edge ${edgeKey}`);
      }
      const a: PredrawnGenerationCoordinate = [parsed.ax, parsed.ay];
      const b: PredrawnGenerationCoordinate = [parsed.bx, parsed.by];
      const canonical = canonicalEdgeKey(a, b);
      if (seen.has(canonical)) throw new Error(`predrawn definition: overlapping barriers at ${canonical}`);
      seen.add(canonical);
      definitions.push({
        id: `${kind}-${definitions.length + 1}`,
        kind,
        a,
        b,
        blocksCrossing: true,
      });
    }
  }
  return definitions;
}

function footprints(
  board: EditorBoard,
  resolveProp: (propId: string) => PropDef | undefined,
): PredrawnFootprintDefinition[] {
  const definitions: PredrawnFootprintDefinition[] = [];
  for (const [key, placement] of Object.entries(board.props ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const [x, y] = key.split(',').map(Number);
    const definition = resolveProp(placement.propId);
    if (!definition) throw new Error(`predrawn definition: unknown canonical prop ${placement.propId}`);
    const cells = propCells(x, y, definition).map(({ x: cellX, y: cellY }) => [cellX, cellY] as const);
    if (cells.some((cell) => !inBoard(cell, board.cols, board.rows))) {
      throw new Error(`predrawn definition: prop ${placement.propId} leaves the board`);
    }
    definitions.push({
      id: `footprint-${definitions.length + 1}`,
      kind: 'prop',
      sourceId: placement.propId,
      cells,
      traversal: definition.blocking ? 'impassable' : 'passable',
    });
  }
  for (const [key, placement] of Object.entries(board.doodads).sort(([a], [b]) => a.localeCompare(b))) {
    const [x, y] = key.split(',').map(Number);
    const cell: PredrawnGenerationCoordinate = [x, y];
    if (!inBoard(cell, board.cols, board.rows)) {
      throw new Error(`predrawn definition: doodad ${placement.doodadId} leaves the board`);
    }
    definitions.push({
      id: `footprint-${definitions.length + 1}`,
      kind: 'doodad',
      sourceId: placement.doodadId,
      cells: [cell],
      traversal: 'passable',
    });
  }
  return definitions;
}

function outerPerimeter(columns: number, rows: number): PredrawnOuterPerimeterEdge[] {
  const edges: PredrawnOuterPerimeterEdge[] = [];
  for (let x = 0; x < columns; x += 1) {
    edges.push(
      { cell: [x, 0], neighbor: [x, -1] },
      { cell: [x, rows - 1], neighbor: [x, rows] },
    );
  }
  for (let y = 0; y < rows; y += 1) {
    edges.push(
      { cell: [0, y], neighbor: [-1, y] },
      { cell: [columns - 1, y], neighbor: [columns, y] },
    );
  }
  return edges.sort((a, b) => canonicalEdgeKey(a.cell, a.neighbor).localeCompare(canonicalEdgeKey(b.cell, b.neighbor)));
}

function impassableTransitions(cells: readonly (readonly PredrawnGenerationCell[])[]): PredrawnImpassableTransition[] {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const edges: PredrawnImpassableTransition[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!cells[y][x].playable) continue;
      for (const direction of FEATURE_DIRS) {
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (nx < 0 || nx >= columns || ny < 0 || ny >= rows || cells[ny][nx].playable) continue;
        edges.push({ a: [x, y], b: [nx, ny] });
      }
    }
  }
  return edges.sort((a, b) => canonicalEdgeKey(a.a, a.b).localeCompare(canonicalEdgeKey(b.a, b.b)));
}

/**
 * Serialize one canonical Level into the complete deterministic geometry/semantics packet used
 * by whole-board image generation. The clean top-only image remains the sole appearance authority.
 */
export function buildPredrawnGenerationDefinition(
  level: Level,
  options: PredrawnGenerationDefinitionOptions,
): PredrawnGenerationDefinition {
  if (!options.runId.trim()) throw new Error('predrawn definition: runId is required');
  if (!options.referenceSourceSlot.trim()) throw new Error('predrawn definition: reference source slot is required');
  if (level.boardCode && !decodeBoard(level.boardCode)) {
    throw new Error('predrawn definition: canonical boardCode is invalid');
  }
  const board = levelToEditorBoard(level);
  const terrain = exactTerrain(level);
  assertCanonicalAgreement(level, board, terrain);
  const serializedCells = boardCells(board, terrain);
  const origin = boardLabCellPosition({ x: 0, y: 0 });
  const axisX = boardLabCellPosition({ x: 1, y: 0 });
  const axisY = boardLabCellPosition({ x: 0, y: 1 });
  const serializedLinearFeatures = linearFeatures(board);
  const perimeterOpenings = serializedLinearFeatures.flatMap((feature) => feature.exits)
    .filter(([cell, neighbor]) => (
      inBoard(cell, board.cols, board.rows) && !inBoard(neighbor, board.cols, board.rows)
    ))
    .map(([cell, neighbor]) => ({ cell, neighbor }))
    .sort((a, b) => canonicalEdgeKey(a.cell, a.neighbor).localeCompare(canonicalEdgeKey(b.cell, b.neighbor)));
  return {
    schemaVersion: 2,
    runId: options.runId,
    levelId: level.id,
    reference: { sourceSlot: options.referenceSourceSlot },
    request: {
      provider: options.provider,
      model: options.model,
      mode: 'isolated-top-only',
      referenceCount: 1,
      aspectRatio: '16:9',
    },
    board: {
      columns: board.cols,
      rows: board.rows,
      projection: {
        kind: 'parallel-orthographic-isometric',
        axisX: { screenDx: axisX.left - origin.left, screenDy: axisX.top - origin.top },
        axisY: { screenDx: axisY.left - origin.left, screenDy: axisY.top - origin.top },
        stepLengthRule: 'equal-projected-step-lengths',
      },
      coordinateConvention: {
        order: '(x,y)',
        xAxis: 'increases down-right on screen',
        yAxis: 'increases down-left on screen',
      },
      ...serializedCells,
    },
    linearFeatures: serializedLinearFeatures,
    barriers: barriers(board),
    footprints: footprints(board, options.resolveProp ?? propDef),
    outerPerimeter: {
      edges: outerPerimeter(board.cols, board.rows),
      openings: perimeterOpenings,
    },
    impassableTransitions: impassableTransitions(serializedCells.cells),
  };
}
