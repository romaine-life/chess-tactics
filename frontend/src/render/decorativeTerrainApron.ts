import type { TerrainCanvasCell } from './BoardTerrainLayer';

export interface DecorativeTerrainExtents {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DecorativeTerrainCoordinate {
  x: number;
  y: number;
}

function authoredDecorativeTerrainCoordinate(key: string): DecorativeTerrainCoordinate | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return undefined;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  return { x, y };
}

export type DecorativeTerrainSide = keyof DecorativeTerrainExtents;

export interface DecorativeTerrainExtension<T> {
  extents: DecorativeTerrainExtents;
  authored: Record<string, T>;
}

export type DecorativeTerrainGrowthMode<T> =
  | { kind: 'match-reference' }
  | { kind: 'fill'; value: T };

/**
 * Extend one side of the scenic rectangle by one cell. Explicit terrain on the current whole-canvas
 * edge is copied to the new aligned edge; an unpainted edge remains unpainted so ordinary playable-
 * boundary projection stays the fallback. Existing destination cells survive shrink/re-expand.
 */
export function extendDecorativeTerrainApron<T>(
  cols: number,
  rows: number,
  extents: DecorativeTerrainExtents,
  authored: Readonly<Record<string, T>>,
  side: DecorativeTerrainSide,
  mode: DecorativeTerrainGrowthMode<T> = { kind: 'match-reference' },
): DecorativeTerrainExtension<T> {
  const nextExtents = { ...extents, [side]: extents[side] + 1 };
  const nextAuthored = { ...authored };
  const minX = -extents.left;
  const maxX = cols + extents.right - 1;
  const minY = -extents.top;
  const maxY = rows + extents.bottom - 1;

  const copyAuthoredScenicCell = (sourceX: number, sourceY: number, targetX: number, targetY: number): void => {
    const sourceKey = `${sourceX},${sourceY}`;
    const targetKey = `${targetX},${targetY}`;
    if (Object.prototype.hasOwnProperty.call(nextAuthored, targetKey)) return;
    if (mode.kind === 'fill') {
      nextAuthored[targetKey] = mode.value;
      return;
    }
    const sourceIsPlayable = sourceX >= 0 && sourceX < cols && sourceY >= 0 && sourceY < rows;
    if (sourceIsPlayable) return;
    if (Object.prototype.hasOwnProperty.call(authored, sourceKey)) nextAuthored[targetKey] = authored[sourceKey];
  };

  if (side === 'top') {
    for (let x = minX; x <= maxX; x += 1) copyAuthoredScenicCell(x, minY, x, minY - 1);
  } else if (side === 'right') {
    for (let y = minY; y <= maxY; y += 1) copyAuthoredScenicCell(maxX, y, maxX + 1, y);
  } else if (side === 'bottom') {
    for (let x = minX; x <= maxX; x += 1) copyAuthoredScenicCell(x, maxY, x, maxY + 1);
  } else {
    for (let y = minY; y <= maxY; y += 1) copyAuthoredScenicCell(minX, y, minX - 1, y);
  }

  return { extents: nextExtents, authored: nextAuthored };
}

/**
 * Every visual-only coordinate in the requested scenic rectangle, including projected voids,
 * plus any explicitly active sparse scenic cells outside that rectangle. Sparse keys are treated as
 * untrusted serialized coordinates: malformed/non-integer keys and playable cells are ignored.
 */
export function decorativeTerrainApronCoordinates(
  cols: number,
  rows: number,
  extents: DecorativeTerrainExtents,
  activeCoordinateKeys: Iterable<string> = [],
): DecorativeTerrainCoordinate[] {
  if (cols <= 0 || rows <= 0) return [];
  const byCoordinate = new Map<string, DecorativeTerrainCoordinate>();
  const addScenicCoordinate = (x: number, y: number): void => {
    if (x >= 0 && x < cols && y >= 0 && y < rows) return;
    const coordinate = { x, y };
    byCoordinate.set(`${x},${y}`, coordinate);
  };

  for (let y = -extents.top; y < rows + extents.bottom; y += 1) {
    for (let x = -extents.left; x < cols + extents.right; x += 1) {
      addScenicCoordinate(x, y);
    }
  }

  for (const key of activeCoordinateKeys) {
    const coordinate = authoredDecorativeTerrainCoordinate(key);
    if (coordinate) addScenicCoordinate(coordinate.x, coordinate.y);
  }

  return [...byCoordinate.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Resolve the visible terrain at an authored-board coordinate. Outside the playable rectangle,
 * an explicitly authored scenic value wins; otherwise the exact clamped boundary coordinate is
 * projected outward. A void boundary therefore remains a void instead of borrowing nearby terrain.
 */
export function scenicTerrainValueAt<T>(
  x: number,
  y: number,
  cols: number,
  rows: number,
  playableAt: (x: number, y: number) => T | undefined,
  authoredAt: (x: number, y: number) => T | undefined,
): T | undefined {
  if (cols <= 0 || rows <= 0) return undefined;
  const inside = x >= 0 && x < cols && y >= 0 && y < rows;
  if (!inside) {
    const authored = authoredAt(x, y);
    if (authored !== undefined) return authored;
  }
  const sourceX = inside ? x : Math.max(0, Math.min(cols - 1, x));
  const sourceY = inside ? y : Math.max(0, Math.min(rows - 1, y));
  return playableAt(sourceX, sourceY);
}

/** One depth-coherent terrain pass; scenic review freezes animated tops on their first frame. */
export function scenicTerrainRenderCells(
  playable: readonly TerrainCanvasCell[],
  apron: readonly TerrainCanvasCell[],
): TerrainCanvasCell[] {
  if (apron.length === 0) return [...playable];
  return [...playable, ...apron].map((cell) => ({ ...cell, animate: false }));
}

/** Attach resolved feature art to every scenic cell, including synthesized boundary cells. */
export function withDecorativeTerrainFeatures<T>(
  cells: readonly TerrainCanvasCell[],
  features: Readonly<Record<string, T>>,
  sourceFor: (feature: T) => string,
): TerrainCanvasCell[] {
  return cells.map((cell) => {
    const feature = features[`${cell.x},${cell.y}`];
    return feature ? { ...cell, featureSrc: sourceFor(feature) } : cell;
  });
}

/**
 * Build a visual-only terrain field around a tactical board. The returned cells deliberately
 * carry only terrain tops: no features, macrotiles, cover, props, overlays, or hit targets can
 * leak outside the playable coordinate range.
 */
export function decorativeTerrainApronCells(
  playable: readonly TerrainCanvasCell[],
  cols: number,
  rows: number,
  extents: DecorativeTerrainExtents,
  authored: ReadonlyMap<string, TerrainCanvasCell> = new Map(),
  activeCoordinateKeys: Iterable<string> = [],
): TerrainCanvasCell[] {
  const byCoordinate = new Map(playable.map((cell) => [`${cell.x},${cell.y}`, cell]));

  const apron: TerrainCanvasCell[] = [];
  for (const { x, y } of decorativeTerrainApronCoordinates(cols, rows, extents, activeCoordinateKeys)) {
    const source = scenicTerrainValueAt(
      x,
      y,
      cols,
      rows,
      (sourceX, sourceY) => byCoordinate.get(`${sourceX},${sourceY}`),
      (authoredX, authoredY) => authored.get(`${authoredX},${authoredY}`),
    );
    if (!source?.topSrc) continue;
    apron.push({
      key: `decorative-apron:${x},${y}`,
      x,
      y,
      topSrc: source.topSrc,
      topAnimFrames: source.topAnimFrames,
      animate: false,
    });
  }
  return apron;
}
