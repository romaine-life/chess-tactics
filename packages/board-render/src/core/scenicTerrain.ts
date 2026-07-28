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

/**
 * Every visual-only coordinate in the requested scenic rectangle, including projected voids,
 * plus any explicitly active sparse scenic cells outside that rectangle. Sparse keys are treated
 * as untrusted serialized coordinates: malformed/non-integer keys and playable cells are ignored.
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
