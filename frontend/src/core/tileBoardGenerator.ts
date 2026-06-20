import { createRng } from './rng';
import type { EdgeName, EdgeSockets, TerrainPairId, TileFamilyId, TileSocketAsset } from './tileSockets';
import { baseSocketsForFamily, familyIdForAsset, tileSocketsForAsset, transitionPairs } from './tileSockets';

export interface SocketBoardCell<TAsset extends TileSocketAsset = TileSocketAsset> {
  x: number;
  y: number;
  asset?: TAsset;
  sockets: EdgeSockets;
  terrain: TileFamilyId;
  missing?: {
    kind: 'missing-art' | 'unsupported-junction';
    label: string;
    pairId?: TerrainPairId;
    mask?: number;
    families: TileFamilyId[];
  };
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
  missingPlacements: number;
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
    const east = cellAt.get(`${cell.x + 1}-${cell.y}`);
    const south = cellAt.get(`${cell.x}-${cell.y + 1}`);
    const eastMismatch = east && cell.sockets[oppositeEdges[0][0]] !== east.sockets[oppositeEdges[0][1]] ? 1 : 0;
    const southMismatch = south && cell.sockets[oppositeEdges[1][0]] !== south.sockets[oppositeEdges[1][1]] ? 1 : 0;
    return count + eastMismatch + southMismatch;
  }, 0);
}

function assetFamily<TAsset extends TileSocketAsset>(asset: TAsset, familyAssets: Record<TileFamilyId, readonly TAsset[]>): TileFamilyId {
  return familyIdForAsset(asset, familyAssets);
}

function terrainFamiliesForAssets<TAsset extends TileSocketAsset>(assets: readonly TAsset[], familyAssets: Record<TileFamilyId, readonly TAsset[]>): TileFamilyId[] {
  const families = new Set<TileFamilyId>();
  assets.forEach((asset) => {
    if (asset.kind !== 'tile' || asset.probability <= 0) return;
    if (asset.terrains) {
      asset.terrains.forEach((terrain) => families.add(terrain));
    } else {
      families.add(assetFamily(asset, familyAssets));
    }
  });
  return [...families];
}

function generateTerrainMap(families: readonly TileFamilyId[], seed: number, columns: number, rows: number): TileFamilyId[] {
  if (families.length <= 1) return Array.from({ length: columns * rows }, () => families[0] ?? 'grass');
  const rng = createRng(seed);
  const anchors = families.flatMap((family) =>
    Array.from({ length: 2 }, () => ({
      family,
      x: rng.int(columns),
      y: rng.int(rows),
      bias: rng.next() * 2.4,
    })),
  );
  return Array.from({ length: columns * rows }, (_, index) => {
    const y = Math.floor(index / columns);
    const x = index % columns;
    const best = anchors.reduce((winner, anchor) => {
      const distance = Math.abs(anchor.x - x) + Math.abs(anchor.y - y) + anchor.bias;
      return distance < winner.distance ? { family: anchor.family, distance } : winner;
    }, { family: families[0], distance: Number.POSITIVE_INFINITY });
    return best.family;
  });
}

function terrainAt(map: readonly TileFamilyId[], x: number, y: number, columns: number, rows: number): TileFamilyId | undefined {
  if (x < 0 || y < 0 || x >= columns || y >= rows) return undefined;
  return map[y * columns + x];
}

function boundaryChoice(a: TileFamilyId, b: TileFamilyId, x: number, y: number, seed: number): TileFamilyId {
  if (a === b) return a;
  const n = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  return (n ^ (n >>> 13)) % 2 === 0 ? a : b;
}

function compatibleEdgeFamilies(
  knownEdges: readonly TileFamilyId[],
  preferredEdges: readonly TileFamilyId[],
  center: TileFamilyId,
  x: number,
  y: number,
  seed: number,
): Set<TileFamilyId> {
  const allowed = new Set(knownEdges);
  if (allowed.size >= 2) return allowed;
  if (allowed.size === 0) allowed.add(center);

  const [only] = allowed;
  const preferredBoundary = preferredEdges.find((family) => family !== only);
  const alternate = preferredBoundary ?? (center !== only ? center : only);
  if (alternate !== only) {
    const chosenAlternate = preferredEdges.length > 1 && preferredEdges[0] !== preferredEdges[1]
      ? boundaryChoice(preferredEdges[0], preferredEdges[1], x, y, seed)
      : alternate;
    allowed.add(chosenAlternate);
  }
  return allowed;
}

function compatibleEdgeValue(preferred: TileFamilyId, allowed: ReadonlySet<TileFamilyId>, x: number, y: number, seed: number): TileFamilyId {
  if (allowed.has(preferred)) return preferred;
  const families = [...allowed];
  if (families.length <= 1) return families[0] ?? preferred;
  return boundaryChoice(families[0], families[1], x, y, seed);
}

function buildSocketGrid(map: readonly TileFamilyId[], columns: number, rows: number, seed: number): EdgeSockets[] {
  const horizontalEdges: TileFamilyId[][] = Array.from({ length: rows + 1 }, () => Array<TileFamilyId>(columns));
  const verticalEdges: TileFamilyId[][] = Array.from({ length: rows }, () => Array<TileFamilyId>(columns + 1));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const center = terrainAt(map, x, y, columns, rows) ?? 'grass';
      if (y === 0) horizontalEdges[y][x] = center;
      if (x === 0) verticalEdges[y][x] = center;

      const eastTerrain = terrainAt(map, x + 1, y, columns, rows);
      const southTerrain = terrainAt(map, x, y + 1, columns, rows);
      const preferredEast = eastTerrain ? boundaryChoice(center, eastTerrain, x + 1, y, seed + 43) : center;
      const preferredSouth = southTerrain ? boundaryChoice(center, southTerrain, x, y + 1, seed + 17) : center;
      const allowed = compatibleEdgeFamilies(
        [horizontalEdges[y][x], verticalEdges[y][x]],
        [preferredEast, preferredSouth],
        center,
        x,
        y,
        seed + 71,
      );

      verticalEdges[y][x + 1] = compatibleEdgeValue(preferredEast, allowed, x + 1, y, seed + 89);
      horizontalEdges[y + 1][x] = compatibleEdgeValue(preferredSouth, allowed, x, y + 1, seed + 107);
    }
  }

  return Array.from({ length: columns * rows }, (_, index) => {
    const y = Math.floor(index / columns);
    const x = index % columns;
    return {
      north: horizontalEdges[y][x],
      east: verticalEdges[y][x + 1],
      south: horizontalEdges[y + 1][x],
      west: verticalEdges[y][x],
    };
  });
}

function pairForFamilies(families: readonly TileFamilyId[]) {
  return transitionPairs.find((pair) => families.every((family) => pair.terrains.includes(family)));
}

function assetMatchesSockets<TAsset extends TileSocketAsset>(asset: TAsset, sockets: EdgeSockets, familyAssets: Record<TileFamilyId, readonly TAsset[]>): boolean {
  const assetSockets = tileSocketsForAsset(asset, familyAssets);
  return assetSockets.north === sockets.north && assetSockets.east === sockets.east && assetSockets.south === sockets.south && assetSockets.west === sockets.west;
}

function missingForSockets(sockets: EdgeSockets): SocketBoardCell['missing'] {
  const families = [...new Set(Object.values(sockets))];
  if (families.length <= 1) {
    return { kind: 'missing-art', label: `${families[0]} base`, families };
  }
  const pair = pairForFamilies(families);
  if (!pair) {
    return { kind: 'unsupported-junction', label: `${families.join('-')} junction`, families };
  }
  const mask = pair.terrains.reduce((bits, family, pairIndex) => {
    if (pairIndex !== 0) return bits;
    return (Object.entries(sockets) as Array<[EdgeName, TileFamilyId]>).reduce((edgeBits, [edge, socketFamily], edgeIndex) => {
      return socketFamily === family ? edgeBits | (1 << edgeIndex) : edgeBits;
    }, bits);
  }, 0);
  return { kind: 'missing-art', label: `${pair.label} ${mask.toString(2).padStart(4, '0')}`, pairId: pair.id, mask, families };
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
  const rng = createRng(seed + 99);
  const terrainFamilies = terrainFamiliesForAssets(boardAssets, familyAssets);
  const terrainMap = generateTerrainMap(terrainFamilies, seed, columns, rows);
  const socketGrid = buildSocketGrid(terrainMap, columns, rows, seed);
  const cells: SocketBoardCell<TAsset>[] = [];
  const fallbacks: SocketBoardFallback[] = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const y = Math.floor(index / columns);
    const x = index % columns;
    const terrain = terrainAt(terrainMap, x, y, columns, rows) ?? terrainFamilies[0] ?? 'grass';
    const sockets = socketGrid[index];
    const candidates = boardAssets.filter((asset) => assetMatchesSockets(asset, sockets, familyAssets));
    if (candidates.length === 0) {
      const missing = missingForSockets(sockets);
      fallbacks.push({ x, y, requiredNorth: sockets.north, requiredWest: sockets.west, candidateCount: candidates.length });
      cells.push({ x, y, sockets, terrain, missing });
    } else {
      cells.push({ x, y, sockets, terrain, asset: pickWeightedAsset(candidates, rng.next) });
    }
  }

  return {
    cells,
    fallbacks,
    stats: {
      placed: cells.length,
      missingPlacements: fallbacks.length,
      illegalEdges: countIllegalEdges(cells, familyAssets),
      candidateAssets: boardAssets.length,
    },
  };
}
