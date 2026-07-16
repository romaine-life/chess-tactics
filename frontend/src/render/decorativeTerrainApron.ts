import type { TerrainCanvasCell } from './BoardTerrainLayer';

export interface DecorativeTerrainExtents {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Attach resolved feature art to every scenic cell, including synthesized nearest-edge cells. */
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
): TerrainCanvasCell[] {
  const sources = playable.filter((cell) => Boolean(cell.topSrc));
  if (!sources.length || cols <= 0 || rows <= 0 || Object.values(extents).every((value) => value <= 0)) return [];
  const byCoordinate = new Map(sources.map((cell) => [`${cell.x},${cell.y}`, cell]));
  const nearestSource = (x: number, y: number): TerrainCanvasCell => {
    const clampedX = Math.max(0, Math.min(cols - 1, x));
    const clampedY = Math.max(0, Math.min(rows - 1, y));
    const direct = byCoordinate.get(`${clampedX},${clampedY}`);
    if (direct) return direct;
    return sources.reduce((nearest, candidate) => {
      const candidateDistance = Math.abs(candidate.x - clampedX) + Math.abs(candidate.y - clampedY);
      const nearestDistance = Math.abs(nearest.x - clampedX) + Math.abs(nearest.y - clampedY);
      return candidateDistance < nearestDistance ? candidate : nearest;
    });
  };

  const apron: TerrainCanvasCell[] = [];
  for (let y = -extents.top; y < rows + extents.bottom; y += 1) {
    for (let x = -extents.left; x < cols + extents.right; x += 1) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) continue;
      const source = authored.get(`${x},${y}`) ?? nearestSource(x, y);
      apron.push({
        key: `decorative-apron:${x},${y}`,
        x,
        y,
        topSrc: source.topSrc,
        topAnimFrames: source.topAnimFrames,
        animate: false,
      });
    }
  }
  return apron;
}
