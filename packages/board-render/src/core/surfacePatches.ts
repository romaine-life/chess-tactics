import manifest from '../art/surfacePatches.json';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import type { TileFamilyId } from './tileSockets';

export interface SurfacePatchAsset {
  id: string;
  label: string;
  family: TileFamilyId;
  columns: number;
  rows: number;
  src: string;
  edgeBlendCells: number;
  weight: number;
}

export interface SurfacePatchPlacement {
  assetId: string;
  x: number;
  y: number;
}

export interface SurfacePatchFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const DEFAULT_SURFACE_PATCH_DENSITY = 0.55;

export const surfacePatchAssets: readonly SurfacePatchAsset[] = manifest.assets.map((asset) => ({
  ...asset,
  family: asset.family as TileFamilyId,
}));

const assetById = new Map(surfacePatchAssets.map((asset) => [asset.id, asset]));

export function surfacePatchAsset(id: string): SurfacePatchAsset | undefined {
  return assetById.get(id);
}

/** Tight board-space frame for a projected rectangular cell footprint. */
export function surfacePatchFrame(asset: Pick<SurfacePatchAsset, 'columns' | 'rows'>): SurfacePatchFrame {
  return {
    left: -asset.rows * TILE_STEP_X,
    top: -TILE_STEP_Y,
    width: (asset.columns + asset.rows) * TILE_STEP_X,
    height: (asset.columns + asset.rows) * TILE_STEP_Y,
  };
}

export function surfacePatchCellIndices(
  placement: SurfacePatchPlacement,
  columns: number,
  rows: number,
): number[] {
  const asset = surfacePatchAsset(placement.assetId);
  if (!asset) return [];
  const cells: number[] = [];
  for (let dy = 0; dy < asset.rows; dy += 1) {
    for (let dx = 0; dx < asset.columns; dx += 1) {
      const x = placement.x + dx;
      const y = placement.y + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) return [];
      cells.push(y * columns + x);
    }
  }
  return cells;
}

interface GenerateSurfacePatchesOptions {
  terrainMap: readonly TileFamilyId[];
  columns: number;
  rows: number;
  seed: number;
  density?: number;
  sectionOf?: ArrayLike<number>;
  region?: ReadonlySet<number>;
  assets?: readonly SurfacePatchAsset[];
}

interface Candidate {
  asset: SurfacePatchAsset;
  x: number;
  y: number;
  cells: number[];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function shuffle<T>(items: T[], next: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function weightedAsset(assets: readonly SurfacePatchAsset[], next: () => number): SurfacePatchAsset {
  const total = assets.reduce((sum, asset) => sum + Math.max(0.05, asset.weight), 0);
  let cursor = next() * total;
  for (const asset of assets) {
    cursor -= Math.max(0.05, asset.weight);
    if (cursor <= 0) return asset;
  }
  return assets[assets.length - 1];
}

function groupKey(index: number, family: TileFamilyId, sectionOf: ArrayLike<number> | undefined): string {
  const section = sectionOf?.[index];
  return typeof section === 'number' && section >= 0 ? `section:${section}` : `family:${family}`;
}

/**
 * Place rare, non-touching macro surfaces inside same-family generated regions.
 * The result is deterministic for the same board, seed, and density.
 */
export function generateSurfacePatches({
  terrainMap,
  columns,
  rows,
  seed,
  density = DEFAULT_SURFACE_PATCH_DENSITY,
  sectionOf,
  region,
  assets = surfacePatchAssets,
}: GenerateSurfacePatchesOptions): SurfacePatchPlacement[] {
  if (columns <= 0 || rows <= 0 || terrainMap.length < columns * rows || assets.length === 0) return [];
  const next = seededRandom((seed ^ 0xa511e9b3) >>> 0);
  const target = region ?? new Set(Array.from({ length: columns * rows }, (_, index) => index));
  const groups = new Map<string, { family: TileFamilyId; cells: Set<number> }>();

  for (const index of target) {
    if (index < 0 || index >= columns * rows) continue;
    const family = terrainMap[index];
    const key = groupKey(index, family, sectionOf);
    const group = groups.get(key) ?? { family, cells: new Set<number>() };
    group.cells.add(index);
    groups.set(key, group);
  }

  const placements: SurfacePatchPlacement[] = [];
  const reserved = new Set<number>();
  for (const group of groups.values()) {
    const familyAssets = assets.filter((asset) => asset.family === group.family);
    if (familyAssets.length === 0) continue;

    const candidatesByAsset = new Map<string, Candidate[]>();
    for (const asset of familyAssets) {
      const candidates: Candidate[] = [];
      for (let y = 0; y + asset.rows <= rows; y += 1) {
        for (let x = 0; x + asset.columns <= columns; x += 1) {
          const cells: number[] = [];
          let fits = true;
          for (let dy = 0; dy < asset.rows && fits; dy += 1) {
            for (let dx = 0; dx < asset.columns; dx += 1) {
              const index = (y + dy) * columns + x + dx;
              if (!group.cells.has(index) || terrainMap[index] !== asset.family) {
                fits = false;
                break;
              }
              cells.push(index);
            }
          }
          if (fits) candidates.push({ asset, x, y, cells });
        }
      }
      shuffle(candidates, next);
      candidatesByAsset.set(asset.id, candidates);
    }

    const availableAssets = familyAssets.filter((asset) => (candidatesByAsset.get(asset.id)?.length ?? 0) > 0);
    if (availableAssets.length === 0) continue;
    const averageArea = availableAssets.reduce((sum, asset) => sum + asset.columns * asset.rows, 0) / availableAssets.length;
    const expected = group.cells.size * Math.max(0, Math.min(1, density)) * 0.45 / averageArea;
    let count = Math.floor(expected);
    if (next() < expected - count) count += 1;

    for (let placed = 0; placed < count; placed += 1) {
      const choices = availableAssets.filter((asset) => (candidatesByAsset.get(asset.id)?.length ?? 0) > 0);
      let accepted: Candidate | undefined;
      while (choices.length > 0 && !accepted) {
        const asset = weightedAsset(choices, next);
        const candidates = candidatesByAsset.get(asset.id)!;
        while (candidates.length > 0) {
          const candidate = candidates.pop()!;
          if (candidate.cells.some((index) => reserved.has(index))) continue;
          accepted = candidate;
          break;
        }
        if (!accepted) choices.splice(choices.indexOf(asset), 1);
      }
      if (!accepted) break;

      placements.push({ assetId: accepted.asset.id, x: accepted.x, y: accepted.y });
      for (const index of accepted.cells) {
        const x = index % columns;
        const y = Math.floor(index / columns);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < columns && ny < rows) reserved.add(ny * columns + nx);
          }
        }
      }
    }
  }

  return placements.sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
}
