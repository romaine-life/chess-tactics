import { createRng } from './rng';
import type { EdgeName, TileFamilyId, TileSocketAsset } from './tileSockets';
import { tileSocketsForAsset } from './tileSockets';

export interface SocketBoardCell<TAsset extends TileSocketAsset = TileSocketAsset> {
  x: number;
  y: number;
  asset: TAsset;
}

export interface SocketBoardFallback {
  x: number;
  y: number;
  requiredNorth?: TileFamilyId;
  requiredWest?: TileFamilyId;
  candidateCount: number;
}

export interface SocketBoardStats {
  placed: number;
  fallbackPlacements: number;
  illegalEdges: number;
  candidateAssets: number;
}

export interface SocketBoardResult<TAsset extends TileSocketAsset = TileSocketAsset> {
  cells: SocketBoardCell<TAsset>[];
  fallbacks: SocketBoardFallback[];
  stats: SocketBoardStats;
}

export interface SocketBoardOptions<TAsset extends TileSocketAsset> {
  assets: readonly TAsset[];
  seed: number;
  columns: number;
  rows: number;
  familyAssets: Record<TileFamilyId, readonly TAsset[]>;
}

const oppositeEdges: Array<[EdgeName, EdgeName]> = [
  ['east', 'west'],
  ['south', 'north'],
];

export function pickWeightedAsset<TAsset extends TileSocketAsset>(assets: readonly TAsset[], next: () => number): TAsset {
  const total = assets.reduce((sum, asset) => sum + Math.max(0.05, asset.probability), 0);
  let cursor = next() * total;
  for (const asset of assets) {
    cursor -= Math.max(0.05, asset.probability);
    if (cursor <= 0) return asset;
  }
  return assets[assets.length - 1];
}

export function countIllegalEdges<TAsset extends TileSocketAsset>(
  cells: readonly SocketBoardCell<TAsset>[],
  familyAssets: Record<TileFamilyId, readonly TAsset[]>,
): number {
  const cellAt = new Map(cells.map((cell) => [`${cell.x}-${cell.y}`, cell]));
  return cells.reduce((count, cell) => {
    const sockets = tileSocketsForAsset(cell.asset, familyAssets);
    const east = cellAt.get(`${cell.x + 1}-${cell.y}`);
    const south = cellAt.get(`${cell.x}-${cell.y + 1}`);
    const eastMismatch = east && sockets[oppositeEdges[0][0]] !== tileSocketsForAsset(east.asset, familyAssets)[oppositeEdges[0][1]] ? 1 : 0;
    const southMismatch = south && sockets[oppositeEdges[1][0]] !== tileSocketsForAsset(south.asset, familyAssets)[oppositeEdges[1][1]] ? 1 : 0;
    return count + eastMismatch + southMismatch;
  }, 0);
}

export function generateSocketBoard<TAsset extends TileSocketAsset>({
  assets,
  seed,
  columns,
  rows,
  familyAssets,
}: SocketBoardOptions<TAsset>): SocketBoardResult<TAsset> {
  const usableAssets = assets.filter((asset) => asset.kind === 'tile' && asset.probability > 0);
  const boardAssets = usableAssets.length > 0 ? usableAssets : assets.filter((asset) => asset.kind === 'tile');
  const rng = createRng(seed);
  const cells: SocketBoardCell<TAsset>[] = [];
  const fallbacks: SocketBoardFallback[] = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const y = Math.floor(index / columns);
    const x = index % columns;
    const north = cells.find((cell) => cell.x === x && cell.y === y - 1);
    const west = cells.find((cell) => cell.x === x - 1 && cell.y === y);
    const requiredNorth = north ? tileSocketsForAsset(north.asset, familyAssets).south : undefined;
    const requiredWest = west ? tileSocketsForAsset(west.asset, familyAssets).east : undefined;
    const candidates = boardAssets.filter((asset) => {
      const sockets = tileSocketsForAsset(asset, familyAssets);
      return (!requiredNorth || sockets.north === requiredNorth) && (!requiredWest || sockets.west === requiredWest);
    });
    const finalCandidates = candidates.length > 0 ? candidates : boardAssets;
    const asset = pickWeightedAsset(finalCandidates, rng.next);
    if (candidates.length === 0) {
      fallbacks.push({ x, y, requiredNorth, requiredWest, candidateCount: candidates.length });
    }
    cells.push({ x, y, asset });
  }

  return {
    cells,
    fallbacks,
    stats: {
      placed: cells.length,
      fallbackPlacements: fallbacks.length,
      illegalEdges: countIllegalEdges(cells, familyAssets),
      candidateAssets: boardAssets.length,
    },
  };
}
