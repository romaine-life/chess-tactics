import manifest from '../art/macroTiles.json';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import type { TileFamilyId } from './tileSockets';

export interface MacroTileAsset {
  id: string;
  label: string;
  family: TileFamilyId;
  columns: number;
  rows: number;
  src: string;
  weight: number;
  /** Shared material motif across footprint sizes; generation exhausts these before repeating. */
  variantId?: string;
}

export interface MacroTilePlacement {
  assetId: string;
  x: number;
  y: number;
}

export interface MacroTileFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const DEFAULT_MACRO_TILE_DENSITY = 0.55;

interface MacroTileManifest {
  footprints: Array<{ columns: number; rows: number }>;
  families: Array<{
    id: TileFamilyId;
    variants: Array<{ id: string; label: string; source: string; weight?: number }>;
  }>;
  extras?: Array<{
    id: string;
    label: string;
    family: TileFamilyId;
    columns: number;
    rows: number;
    weight?: number;
  }>;
}

const catalog = manifest as MacroTileManifest;

export const macroTileAssets: readonly MacroTileAsset[] = [
  ...catalog.families.flatMap((family) => catalog.footprints.flatMap((footprint) =>
    family.variants.map((variant) => ({
      id: `${family.id}-${variant.id}-${footprint.columns}x${footprint.rows}`,
      label: `${variant.label} ${footprint.columns}x${footprint.rows}`,
      family: family.id,
      columns: footprint.columns,
      rows: footprint.rows,
      src: `/assets/tiles/macro-tiles/${family.id}-${variant.id}-${footprint.columns}x${footprint.rows}.png`,
      weight: variant.weight ?? 1,
      variantId: variant.id,
    })),
  )),
  ...(catalog.extras ?? []).map((extra) => ({
    id: extra.id,
    label: extra.label,
    family: extra.family,
    columns: extra.columns,
    rows: extra.rows,
    src: `/assets/tiles/macro-tiles/${extra.id}.png`,
    weight: extra.weight ?? 1,
    variantId: extra.id,
  })),
];

const assetById = new Map(macroTileAssets.map((asset) => [asset.id, asset]));

export function macroTileAsset(id: string): MacroTileAsset | undefined {
  return assetById.get(id);
}

/** Tight board-space frame for a projected rectangular cell footprint. */
export function macroTileFrame(asset: Pick<MacroTileAsset, 'columns' | 'rows'>): MacroTileFrame {
  return {
    left: -asset.rows * TILE_STEP_X,
    top: -TILE_STEP_Y,
    width: (asset.columns + asset.rows) * TILE_STEP_X,
    height: (asset.columns + asset.rows) * TILE_STEP_Y,
  };
}

export function macroTileCellIndices(
  placement: MacroTilePlacement,
  columns: number,
  rows: number,
): number[] {
  const asset = macroTileAsset(placement.assetId);
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

interface ResolveMacroTilePlacementsOptions {
  placements: readonly MacroTilePlacement[] | undefined;
  columns: number;
  rows: number;
  familyAt: (x: number, y: number) => TileFamilyId | undefined;
}

/**
 * Resolve the ordered, known placements that may own terrain tops on this board.
 * Invalid, out-of-bounds, overlapping, and mixed-family footprints are ignored.
 */
export function resolveMacroTilePlacements({
  placements,
  columns,
  rows,
  familyAt,
}: ResolveMacroTilePlacementsOptions): MacroTilePlacement[] {
  const occupied = new Set<number>();
  const accepted: MacroTilePlacement[] = [];
  const ordered = [...(placements ?? [])]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));

  for (const placement of ordered) {
    const asset = macroTileAsset(placement.assetId);
    if (!asset || !Number.isInteger(placement.x) || !Number.isInteger(placement.y)) continue;
    const cells = macroTileCellIndices(placement, columns, rows);
    if (cells.length !== asset.columns * asset.rows || cells.some((index) => occupied.has(index))) continue;
    if (cells.some((index) => familyAt(index % columns, Math.floor(index / columns)) !== asset.family)) continue;
    accepted.push(placement);
    cells.forEach((index) => occupied.add(index));
  }

  return accepted;
}

interface GenerateMacroTilesOptions {
  terrainMap: readonly TileFamilyId[];
  columns: number;
  rows: number;
  seed: number;
  density?: number;
  sectionOf?: ArrayLike<number>;
  region?: ReadonlySet<number>;
  assets?: readonly MacroTileAsset[];
}

interface Candidate {
  asset: MacroTileAsset;
  x: number;
  y: number;
  cells: number[];
  boundaryScore: number;
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

function weightedAsset(assets: readonly MacroTileAsset[], next: () => number): MacroTileAsset {
  const total = assets.reduce((sum, asset) => sum + Math.max(0.05, asset.weight), 0);
  let cursor = next() * total;
  for (const asset of assets) {
    cursor -= Math.max(0.05, asset.weight);
    if (cursor <= 0) return asset;
  }
  return assets[assets.length - 1];
}

function footprintKey(asset: Pick<MacroTileAsset, 'columns' | 'rows'>): string {
  return `${asset.columns}x${asset.rows}`;
}

function groupKey(index: number, family: TileFamilyId, sectionOf: ArrayLike<number> | undefined): string {
  const section = sectionOf?.[index];
  return typeof section === 'number' && section >= 0 ? `section:${section}` : `family:${family}`;
}

/**
 * Pack opaque macrotiles inside same-family generated regions without overlap.
 * The result is deterministic for the same board, seed, and density.
 */
export function generateMacroTiles({
  terrainMap,
  columns,
  rows,
  seed,
  density = DEFAULT_MACRO_TILE_DENSITY,
  sectionOf,
  region,
  assets = macroTileAssets,
}: GenerateMacroTilesOptions): MacroTilePlacement[] {
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

  const placements: MacroTilePlacement[] = [];
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
          if (fits) {
            let boundaryScore = 0;
            for (let hy = y - 1; hy <= y + asset.rows; hy += 1) {
              for (let hx = x - 1; hx <= x + asset.columns; hx += 1) {
                const insideFootprint = hx >= x && hx < x + asset.columns && hy >= y && hy < y + asset.rows;
                if (insideFootprint) continue;
                if (hx < 0 || hy < 0 || hx >= columns || hy >= rows || !group.cells.has(hy * columns + hx)) {
                  boundaryScore += 1;
                }
              }
            }
            candidates.push({ asset, x, y, cells, boundaryScore });
          }
        }
      }
      shuffle(candidates, next);
      // Stable sort after shuffling keeps equal-score positions random while larger scores
      // pop first. Hugging section edges leaves a coherent interior for later fresh variants.
      candidates.sort((a, b) => a.boundaryScore - b.boundaryScore);
      candidatesByAsset.set(asset.id, candidates);
    }

    const availableAssets = familyAssets.filter((asset) => (candidatesByAsset.get(asset.id)?.length ?? 0) > 0);
    if (availableAssets.length === 0) continue;
    // Density is the requested macro-owned share of the region. Non-overlapping footprints cap
    // the achievable result naturally; do not silently damp the user's control a second time.
    const targetArea = group.cells.size * Math.max(0, Math.min(1, density));
    let ownedArea = 0;
    const usedVariantIds = new Set<string>();
    let footprintCycle: string[] = [];

    while (ownedArea < targetArea) {
      const choices = availableAssets.filter((asset) => (candidatesByAsset.get(asset.id)?.length ?? 0) > 0);
      let accepted: Candidate | undefined;
      while (choices.length > 0 && !accepted) {
        const availableFootprints = [...new Set(choices.map(footprintKey))];
        footprintCycle = footprintCycle.filter((key) => availableFootprints.includes(key));
        if (footprintCycle.length === 0) {
          footprintCycle = [...availableFootprints];
          shuffle(footprintCycle, next);
        }
        const selectedFootprint = footprintCycle.pop()!;
        const sameFootprint = choices.filter((asset) => footprintKey(asset) === selectedFootprint);
        const freshChoices = sameFootprint.filter((asset) => !usedVariantIds.has(asset.variantId ?? asset.id));
        const preferredChoices = freshChoices.length > 0 ? freshChoices : sameFootprint;
        const asset = weightedAsset(preferredChoices, next);
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
      usedVariantIds.add(accepted.asset.variantId ?? accepted.asset.id);
      ownedArea += accepted.cells.length;
      for (const index of accepted.cells) reserved.add(index);
    }
  }

  return placements.sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
}
