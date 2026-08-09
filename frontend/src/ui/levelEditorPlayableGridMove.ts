import {
  decorativeTerrainApronCoordinates,
  normalizeBoardCameraBounds,
  projectBoardPoint,
  scenicTerrainValueAt,
} from '@chess-tactics/board-render';
import { propCells, propDef } from '../core/props';
import { isNorthWestBoundaryWallEdge } from '../core/featureAutotile';
import { wallArtSpanEdges, wallArtSpanForId } from '../core/wallArt';
import {
  zoneCellMapFromEntries,
  zoneEntriesFromCellMap,
  type EditorBoard,
} from './boardCode';
import { isPropFootprintOnAuthoredSurface } from './placedArtPolicy';

export const MAX_SCENIC_TERRAIN_EXTENT = 16;

export const PLAYABLE_GRID_MOVE_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export type PlayableGridMoveDirection = typeof PLAYABLE_GRID_MOVE_DIRECTIONS[number];

type ScenicSide = 'top' | 'right' | 'bottom' | 'left';

interface PlayableGridMovePlan {
  direction: PlayableGridMoveDirection;
  sourceSide: ScenicSide;
  destinationSide: ScenicSide;
  dx: number;
  dy: number;
}

export interface PlayableGridMoveAvailability {
  allowed: boolean;
  reason?: string;
}

export interface PlayableGridMoveDroppedContent {
  units: number;
  doodads: number;
  props: number;
  zoneTiles: number;
  total: number;
}

export interface PlayableGridMoveResult {
  board: EditorBoard;
  /** Coordinate delta applied to scene-authored content, opposite the grid's requested motion. */
  contentDelta: { x: number; y: number };
  dropped: PlayableGridMoveDroppedContent;
}

const MOVE_PLAN: Record<PlayableGridMoveDirection, PlayableGridMovePlan> = {
  north: { direction: 'north', sourceSide: 'top', destinationSide: 'bottom', dx: 0, dy: 1 },
  east: { direction: 'east', sourceSide: 'right', destinationSide: 'left', dx: -1, dy: 0 },
  south: { direction: 'south', sourceSide: 'bottom', destinationSide: 'top', dx: 0, dy: -1 },
  west: { direction: 'west', sourceSide: 'left', destinationSide: 'right', dx: 1, dy: 0 },
};

const EMPTY_APRON = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function directionLabel(direction: PlayableGridMoveDirection): string {
  return direction[0].toUpperCase() + direction.slice(1);
}

function parseCellKey(key: string): { x: number; y: number } | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return undefined;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  return { x, y };
}

function shiftedCellKey(key: string, dx: number, dy: number): string | undefined {
  const coordinate = parseCellKey(key);
  return coordinate ? `${coordinate.x + dx},${coordinate.y + dy}` : undefined;
}

function shiftCellMap<T>(
  values: Readonly<Record<string, T>> | undefined,
  dx: number,
  dy: number,
): Record<string, T> {
  const shifted: Record<string, T> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const nextKey = shiftedCellKey(key, dx, dy);
    if (nextKey) shifted[nextKey] = value;
  }
  return shifted;
}

function shiftEdgeMap<T>(
  values: Readonly<Record<string, T>> | undefined,
  dx: number,
  dy: number,
): Record<string, T> {
  const shifted: Record<string, T> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const endpoints = key.split('|');
    if (endpoints.length !== 2) continue;
    const first = shiftedCellKey(endpoints[0], dx, dy);
    const second = shiftedCellKey(endpoints[1], dx, dy);
    if (first && second) shifted[`${first}|${second}`] = value;
  }
  return shifted;
}

function shiftSubterrainMap<T>(
  values: Readonly<Record<string, T>> | undefined,
  dx: number,
  dy: number,
): Record<string, T> {
  const shifted: Record<string, T> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const match = /^(-?\d+),(-?\d+):(south|east)$/.exec(key);
    if (!match) continue;
    shifted[`${Number(match[1]) + dx},${Number(match[2]) + dy}:${match[3]}`] = value;
  }
  return shifted;
}

function countEntries(value: object | undefined): number {
  return Object.keys(value ?? {}).length;
}

/**
 * The board-coordinate step the ARTWORK takes when the grid moves one square that way.
 *
 * Derived from the same plan the legacy rebase uses, so the two paths can never disagree about
 * which way "north" is.
 */
export const PLAYABLE_GRID_MOVE_PLATE_STEP: Record<
  PlayableGridMoveDirection,
  { x: number; y: number }
> = Object.fromEntries(PLAYABLE_GRID_MOVE_DIRECTIONS.map((direction) => [
  direction,
  { x: MOVE_PLAN[direction].dx, y: MOVE_PLAN[direction].dy },
])) as Record<PlayableGridMoveDirection, { x: number; y: number }>;

export function playableGridMoveAvailability(
  board: Pick<EditorBoard, 'decorativeApron'>,
  direction: PlayableGridMoveDirection,
): PlayableGridMoveAvailability {
  const plan = MOVE_PLAN[direction];
  const apron = board.decorativeApron ?? EMPTY_APRON;
  if (apron[plan.sourceSide] < 1) {
    return {
      allowed: false,
      reason: `Extend scenic terrain to the ${directionLabel(direction)} first.`,
    };
  }
  if (apron[plan.destinationSide] >= MAX_SCENIC_TERRAIN_EXTENT) {
    return {
      allowed: false,
      reason: `The opposite scenic extent is already at ${MAX_SCENIC_TERRAIN_EXTENT} tiles.`,
    };
  }
  return { allowed: true };
}

/**
 * Move the zero-based playable projection one cell inside its authored scenic rectangle.
 *
 * Persisted board coordinates are intentionally relative to the playable origin. Moving the grid
 * therefore rebases every scene-authored coordinate in the opposite direction, transfers one
 * scenic row/column between opposite extents, and reprojects the entering terrain band. The board
 * dimensions do not change and the complete operation remains one EditorBoard history entry.
 */
export function movePlayableGrid(
  source: EditorBoard,
  direction: PlayableGridMoveDirection,
): PlayableGridMoveResult | undefined {
  const availability = playableGridMoveAvailability(source, direction);
  if (!availability.allowed) return undefined;

  const plan = MOVE_PLAN[direction];
  const { dx, dy } = plan;
  const next = structuredClone(source) as EditorBoard;
  const oldApron = source.decorativeApron ?? EMPTY_APRON;
  next.decorativeApron = {
    ...oldApron,
    [plan.sourceSide]: oldApron[plan.sourceSide] - 1,
    [plan.destinationSide]: oldApron[plan.destinationSide] + 1,
  };

  const inPlayable = (key: string): boolean => {
    const coordinate = parseCellKey(key);
    return Boolean(
      coordinate
      && coordinate.x >= 0
      && coordinate.x < source.cols
      && coordinate.y >= 0
      && coordinate.y < source.rows,
    );
  };

  const shiftedFootprint = [...new Set((source.decorativeFootprint ?? [])
    .map((key) => shiftedCellKey(key, dx, dy))
    .filter((key): key is string => key !== undefined && !inPlayable(key)))]
    .sort((left, right) => {
      const a = parseCellKey(left)!;
      const b = parseCellKey(right)!;
      return a.y - b.y || a.x - b.x;
    });
  next.decorativeFootprint = shiftedFootprint;

  const authoredScenicKeys = new Set(
    decorativeTerrainApronCoordinates(
      source.cols,
      source.rows,
      next.decorativeApron,
      shiftedFootprint,
    ).map(({ x, y }) => `${x},${y}`),
  );
  const onAuthoredSurface = (x: number, y: number): boolean => (
    (x >= 0 && x < source.cols && y >= 0 && y < source.rows)
    || authoredScenicKeys.has(`${x},${y}`)
  );

  // Terrain is split into playable and explicit scenic stores. Rebase their union, then materialize
  // the scenic band that entered play so an inherited boundary tile does not become a void merely
  // because it had never needed an explicit decorativeCells entry before this move.
  const shiftedTerrain = shiftCellMap(
    { ...(source.decorativeCells ?? {}), ...source.cells },
    dx,
    dy,
  );
  for (let y = 0; y < source.rows; y += 1) {
    for (let x = 0; x < source.cols; x += 1) {
      const key = `${x},${y}`;
      if (shiftedTerrain[key] !== undefined) continue;
      const oldX = x - dx;
      const oldY = y - dy;
      const value = scenicTerrainValueAt(
        oldX,
        oldY,
        source.cols,
        source.rows,
        (cellX, cellY) => source.cells[`${cellX},${cellY}`],
        (cellX, cellY) => source.decorativeCells?.[`${cellX},${cellY}`],
      );
      if (value !== undefined) shiftedTerrain[key] = value;
    }
  }
  next.cells = {};
  next.decorativeCells = {};
  for (const [key, value] of Object.entries(shiftedTerrain)) {
    if (inPlayable(key)) next.cells[key] = value;
    else next.decorativeCells[key] = value;
  }

  // Visual cell/edge channels already accept scenic coordinates. Fold their legacy decorative
  // stores into the canonical editable maps before applying the shared rebase.
  next.features = shiftCellMap(
    { ...(source.decorativeFeatures ?? {}), ...source.features },
    dx,
    dy,
  );
  next.decorativeFeatures = {};
  next.fences = shiftEdgeMap(
    { ...(source.decorativeFences ?? {}), ...(source.fences ?? {}) },
    dx,
    dy,
  );
  next.decorativeFences = {};
  next.fencePosts = shiftCellMap(
    { ...(source.decorativeFencePosts ?? {}), ...(source.fencePosts ?? {}) },
    dx,
    dy,
  );
  next.decorativeFencePosts = {};

  const shiftedWalls = shiftEdgeMap(
    { ...(source.decorativeWalls ?? {}), ...(source.walls ?? {}) },
    dx,
    dy,
  );
  next.walls = {};
  next.decorativeWalls = {};
  for (const [edge, material] of Object.entries(shiftedWalls)) {
    if (isNorthWestBoundaryWallEdge(edge, { cols: source.cols, rows: source.rows })) {
      next.walls[edge] = material;
    } else {
      next.decorativeWalls[edge] = material;
    }
  }

  const shiftedWallArt = shiftEdgeMap(source.wallArt, dx, dy);
  next.wallArt = {};
  for (const [edge, artId] of Object.entries(shiftedWallArt)) {
    const spanEdges = wallArtSpanEdges(edge, artId, { cols: source.cols, rows: source.rows });
    if (
      spanEdges.length === wallArtSpanForId(artId)
      && spanEdges.every((spanEdge) => Boolean(next.walls?.[spanEdge]))
    ) next.wallArt[edge] = artId;
  }

  next.cover = shiftCellMap(source.cover, dx, dy);
  next.coverTypes = shiftCellMap(source.coverTypes, dx, dy);
  next.coverSeeds = shiftCellMap(source.coverSeeds, dx, dy);
  next.subterrain = shiftSubterrainMap(source.subterrain, dx, dy);
  next.featureCuts = shiftEdgeMap(source.featureCuts, dx, dy);
  next.featureExits = shiftEdgeMap(source.featureExits, dx, dy);

  const shiftedUnits = shiftCellMap(source.units, dx, dy);
  next.units = Object.fromEntries(Object.entries(shiftedUnits).filter(([key]) => inPlayable(key)));
  const shiftedDoodads = shiftCellMap(source.doodads, dx, dy);
  next.doodads = Object.fromEntries(Object.entries(shiftedDoodads).filter(([key]) => inPlayable(key)));

  const shiftedProps = shiftCellMap(source.props, dx, dy);
  next.props = {};
  for (const [key, placement] of Object.entries(shiftedProps)) {
    const anchor = parseCellKey(key);
    if (!anchor) continue;
    const definition = propDef(placement.propId);
    const fits = definition
      ? isPropFootprintOnAuthoredSurface(
          propCells(anchor.x, anchor.y, definition),
          source.cols,
          source.rows,
          onAuthoredSurface,
        )
      : onAuthoredSurface(anchor.x, anchor.y);
    if (fits) next.props[key] = placement;
  }
  // Live markers are anchor keys, so a rebase has to carry them to the anchors their props landed
  // on. Leaving the old keys behind would silently sink every obstacle back into the artwork
  // (ADR-0534). A marker whose prop did not survive the move is dropped with it.
  if (source.liveProps?.length) {
    const moved = Object.fromEntries(
      Object.keys(shiftCellMap(
        Object.fromEntries(source.liveProps.map((key) => [key, true])),
        dx,
        dy,
      )).map((key) => [key, true]),
    );
    const carried = Object.keys(next.props).filter((key) => moved[key]).sort();
    if (carried.length) next.liveProps = carried;
    else delete next.liveProps;
  }

  const sourceZoneEntries = source.zoneEntries
    ?? zoneEntriesFromCellMap(source.zones, source.cols, source.rows);
  next.zoneEntries = sourceZoneEntries.map((entry) => ({
    ...entry,
    tiles: entry.tiles
      .map((key) => shiftedCellKey(key, dx, dy))
      .filter((key): key is string => key !== undefined && inPlayable(key)),
  }));
  next.zones = zoneCellMapFromEntries(next.zoneEntries);

  next.macroTiles = (source.macroTiles ?? []).map((placement) => ({
    ...placement,
    x: placement.x + dx,
    y: placement.y + dy,
  }));
  next.generatedRegions = (source.generatedRegions ?? []).map((region) => ({
    ...region,
    cells: region.cells
      .map((key) => shiftedCellKey(key, dx, dy))
      .filter((key): key is string => {
        if (!key) return false;
        const coordinate = parseCellKey(key);
        return Boolean(coordinate && onAuthoredSurface(coordinate.x, coordinate.y));
      }),
  }));
  next.towns = (source.towns ?? []).map((town) => ({
    ...town,
    bounds: {
      minX: town.bounds.minX + dx,
      minY: town.bounds.minY + dy,
      maxX: town.bounds.maxX + dx,
      maxY: town.bounds.maxY + dy,
    },
  }));
  next.forests = (source.forests ?? []).map((forest) => ({
    ...forest,
    bounds: {
      minX: forest.bounds.minX + dx,
      minY: forest.bounds.minY + dy,
      maxX: forest.bounds.maxX + dx,
      maxY: forest.bounds.maxY + dy,
    },
  }));

  const projectedDelta = projectBoardPoint({ x: dx, y: dy });
  next.floatingArtwork = (source.floatingArtwork ?? []).map((placement) => ({
    ...placement,
    pixelX: placement.pixelX + projectedDelta.left,
    pixelY: placement.pixelY + projectedDelta.top,
  }));
  if (source.predrawnGenerationFrame) {
    next.predrawnGenerationFrame = {
      ...source.predrawnGenerationFrame,
      x: source.predrawnGenerationFrame.x + projectedDelta.left,
      y: source.predrawnGenerationFrame.y + projectedDelta.top,
    };
  }
  if (source.cameraBounds) {
    next.cameraBounds = normalizeBoardCameraBounds({
      ...source.cameraBounds,
      minX: source.cameraBounds.minX + projectedDelta.left,
      minY: source.cameraBounds.minY + projectedDelta.top,
    }, source);
  }

  const oldZoneTileCount = sourceZoneEntries.reduce((total, entry) => total + entry.tiles.length, 0);
  const newZoneTileCount = next.zoneEntries.reduce((total, entry) => total + entry.tiles.length, 0);
  const dropped = {
    units: countEntries(source.units) - countEntries(next.units),
    doodads: countEntries(source.doodads) - countEntries(next.doodads),
    props: countEntries(source.props) - countEntries(next.props),
    zoneTiles: oldZoneTileCount - newZoneTileCount,
    total: 0,
  };
  dropped.total = dropped.units + dropped.doodads + dropped.props + dropped.zoneTiles;

  return { board: next, contentDelta: { x: dx, y: dy }, dropped };
}
