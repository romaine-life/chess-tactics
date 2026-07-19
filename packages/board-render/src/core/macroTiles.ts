import { drawableAssets } from '../art/drawableCatalog';
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
  /** Local row-major footprint cells whose normal 1x1 terrain top remains visible. */
  breaks?: number[];
}

export interface MacroTileFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const DEFAULT_MACRO_TILE_DENSITY = 0.55;
export const DEFAULT_MACRO_TILE_BREAKUP = 0.15;

const currentMacroTileAssets = (): MacroTileAsset[] => drawableAssets('terrain-composite').map((asset) => {
  const { family, columns, rows, weight, variantId } = asset.behavior;
  const media = asset.media.surface?.media;
  if (typeof family !== 'string' || !Number.isInteger(columns) || !Number.isInteger(rows) || !media) {
    throw new Error(`terrain composite ${asset.id} lacks family, footprint, or surface media`);
  }
  return {
    id: asset.id,
    label: asset.label,
    family,
    columns: Number(columns),
    rows: Number(rows),
    src: media.immutableUrl,
    weight: typeof weight === 'number' ? weight : 1,
    ...(typeof variantId === 'string' ? { variantId } : {}),
  };
});

export const macroTileAssets: readonly MacroTileAsset[] = new Proxy([] as MacroTileAsset[], {
  get: (_target, property) => {
    const current = currentMacroTileAssets();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export function macroTileAsset(id: string): MacroTileAsset | undefined {
  return currentMacroTileAssets().find((asset) => asset.id === id);
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

export function macroTileBreakIndices(
  placement: Pick<MacroTilePlacement, 'assetId' | 'breaks'>,
): number[] {
  const asset = macroTileAsset(placement.assetId);
  const area = asset ? asset.columns * asset.rows : Number.MAX_SAFE_INTEGER;
  return [...new Set((placement.breaks ?? []).filter((index) =>
    Number.isInteger(index) && index >= 0 && index < area,
  ))].sort((a, b) => a - b);
}

export function macroTileOwnedCellIndices(
  placement: MacroTilePlacement,
  columns: number,
  rows: number,
): number[] {
  const cells = macroTileCellIndices(placement, columns, rows);
  if (cells.length === 0) return [];
  const breaks = new Set(macroTileBreakIndices(placement));
  return cells.filter((_, localIndex) => !breaks.has(localIndex));
}

/** Reveal one ordinary terrain cell while preserving the rest of every macrotile it touches. */
export function breakMacroTilesAtCell(
  placements: readonly MacroTilePlacement[] | undefined,
  x: number,
  y: number,
): MacroTilePlacement[] {
  return (placements ?? []).flatMap((placement) => {
    const asset = macroTileAsset(placement.assetId);
    if (!asset || x < placement.x || y < placement.y
      || x >= placement.x + asset.columns || y >= placement.y + asset.rows) {
      return [{ ...placement, ...(placement.breaks ? { breaks: [...placement.breaks] } : {}) }];
    }
    const localIndex = (y - placement.y) * asset.columns + x - placement.x;
    const breaks = [...new Set([...macroTileBreakIndices(placement), localIndex])].sort((a, b) => a - b);
    return breaks.length < asset.columns * asset.rows ? [{ ...placement, breaks }] : [];
  });
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
    const ownedCells = macroTileOwnedCellIndices(placement, columns, rows);
    if (cells.length !== asset.columns * asset.rows || ownedCells.length === 0 || cells.some((index) => occupied.has(index))) continue;
    if (ownedCells.some((index) => familyAt(index % columns, Math.floor(index / columns)) !== asset.family)) continue;
    const breaks = macroTileBreakIndices(placement);
    if (breaks.length) accepted.push({ ...placement, breaks });
    else accepted.push({ assetId: placement.assetId, x: placement.x, y: placement.y });
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
  breakup?: number;
  sectionOf?: ArrayLike<number>;
  densityBySection?: ArrayLike<number>;
  breakupBySection?: ArrayLike<number>;
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

function sectionValue(values: ArrayLike<number> | undefined, section: number | undefined, fallback: number): number {
  const value = section === undefined ? undefined : values?.[section];
  return Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : fallback));
}

function randomBreaks(asset: MacroTileAsset, amount: number, next: () => number): number[] {
  const area = asset.columns * asset.rows;
  if (area <= 1 || amount <= 0) return [];
  const breaks = Array.from({ length: area }, (_, index) => index).filter(() => next() < amount);
  if (breaks.length >= area) breaks.splice(Math.floor(next() * breaks.length), 1);
  return breaks.sort((a, b) => a - b);
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
  breakup = 0,
  sectionOf,
  densityBySection,
  breakupBySection,
  region,
  assets = macroTileAssets,
}: GenerateMacroTilesOptions): MacroTilePlacement[] {
  if (columns <= 0 || rows <= 0 || terrainMap.length < columns * rows || assets.length === 0) return [];
  const next = seededRandom((seed ^ 0xa511e9b3) >>> 0);
  const target = region ?? new Set(Array.from({ length: columns * rows }, (_, index) => index));
  const groups = new Map<string, { family: TileFamilyId; cells: Set<number>; section?: number }>();

  for (const index of target) {
    if (index < 0 || index >= columns * rows) continue;
    const family = terrainMap[index];
    const rawSection = sectionOf?.[index];
    const section = typeof rawSection === 'number' && rawSection >= 0 ? rawSection : undefined;
    const key = groupKey(index, family, sectionOf);
    const group = groups.get(key) ?? { family, cells: new Set<number>(), section };
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
    const groupDensity = sectionValue(densityBySection, group.section, density);
    const groupBreakup = sectionValue(breakupBySection, group.section, breakup);
    const targetArea = group.cells.size * groupDensity;
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

      const breaks = randomBreaks(accepted.asset, groupBreakup, next);
      placements.push({
        assetId: accepted.asset.id,
        x: accepted.x,
        y: accepted.y,
        ...(breaks.length ? { breaks } : {}),
      });
      usedVariantIds.add(accepted.asset.variantId ?? accepted.asset.id);
      ownedArea += accepted.cells.length - breaks.length;
      for (const index of accepted.cells) reserved.add(index);
    }
  }

  return placements.sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
}
