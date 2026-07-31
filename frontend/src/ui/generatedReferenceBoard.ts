// The Level Editor's Generate (terrain scatter) feature as a pure whole-board dressing —
// the same canonical pipeline the panel runs (scatterTerrainDetailed → solveSocketBoard →
// generateMacroTiles → per-section ground-cover rolls with coverNoise patchiness), without
// editor state, selections, or apron/preservation concerns. Reference surfaces (the
// Enchiridion's unit movement boards) use it to dress a small board so it reads like a real
// Battle board instead of flat default grass.
//
// Movement honesty: the section list is restricted to ordinary-ground families (never
// water — the one scatter family whose terrain changes movement), so a movement diagram
// drawn over this dressing shows exactly what the engine would return on the pictured board.

import { GROUND_COVER_ASSETS, type GroundCoverId } from './groundCoverCatalog';
import { DEFAULT_MACRO_TILE_BREAKUP, DEFAULT_MACRO_TILE_DENSITY, generateMacroTiles } from '../core/macroTiles';
import { createRng } from '../core/rng';
import { coverNoise, largestRemainder, scatterTerrainDetailed } from '../core/terrainScatter';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { defaultTerrainFamily, terrainFamiliesForRole, type TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from './boardCode';
import { studioFamilies, type StudioAsset } from './studioBoard';

export interface GeneratedTerrainDressing {
  cells: EditorBoard['cells'];
  cover: EditorBoard['cover'];
  coverTypes: NonNullable<EditorBoard['coverTypes']>;
  macroTiles: NonNullable<EditorBoard['macroTiles']>;
}

// Gentler than the editor Generate panel's defaults: a reference board is tiny and its unit
// and movement marks must stay the loudest thing on it, so cover lands in scattered accents
// rather than the panel's lusher field, and macro tops stay occasional.
const COVER_KNOBS = { amount: 0.25, amountRandom: 0.2, density: 0.3, densityRandom: 0.25 } as const;
const MACRO_TILE_DENSITY_SCALE = 0.4;
// Compact borders read as patches rather than sprawl on a small board.
const DRESSING_WIGGLE = 0.4;
// Reference boards stay mostly grass so the unit and its marks carry the card; two seeded
// accent families take a small remainder as patches (five families on a 25-cell board
// reads as a quilt, not a place).
const ACCENT_SHARES = [10, 8] as const;

const isGroundCoverId = (id: string): id is GroundCoverId =>
  GROUND_COVER_ASSETS.some((asset) => asset.id === id);

interface DressingSection {
  terrain: TileFamilyId;
  share: number;
  cover: { id: number; type: GroundCoverId }[];
}

/** Ordinary-ground scatter sections: the default (grass) family dominant, two seeded accents. */
function dressingSections(seed: number): DressingSection[] {
  const families = terrainFamiliesForRole('level-editor-scatter')
    .filter((family) => family.gameplayTerrain !== 'water');
  if (!families.length) throw new Error('drawable catalog offers no walkable scatter terrain');
  const defaultId = defaultTerrainFamily().id;
  const defaultFamily = families.find((family) => family.id === defaultId) ?? families[0];
  const accentPool = families.filter((family) => family !== defaultFamily);
  const rng = createRng((seed ^ 0x51ed270b) >>> 0);
  const accents: typeof accentPool = [];
  const pool = [...accentPool];
  while (pool.length && accents.length < ACCENT_SHARES.length) {
    accents.push(...pool.splice(rng.int(pool.length), 1));
  }
  const accentShare = accents.reduce((sum, _, index) => sum + ACCENT_SHARES[index], 0);
  const sections = [
    { family: defaultFamily, share: 100 - accentShare },
    ...accents.map((family, index) => ({ family, share: ACCENT_SHARES[index] })),
  ];
  return sections.map(({ family, share }, index) => ({
    terrain: family.id,
    share,
    cover: family.defaultGroundCoverId && isGroundCoverId(family.defaultGroundCoverId)
      ? [{ id: index + 1, type: family.defaultGroundCoverId }]
      : [],
  }));
}

const tileAssetsOnly = (): StudioAsset[] =>
  studioFamilies.flatMap((family) => family.assets.filter((asset) => asset.kind === 'tile'));

const familyTileAssets = (): Record<TileFamilyId, readonly StudioAsset[]> =>
  studioFamilies.reduce((acc, family) => {
    acc[family.id] = family.assets.filter((asset) => asset.kind === 'tile');
    return acc;
  }, {} as Record<TileFamilyId, readonly StudioAsset[]>);

const defaultTileId = (): string => {
  const family = studioFamilies.find((candidate) => candidate.id === defaultTerrainFamily().id);
  const tile = family?.assets.find((asset) => asset.kind === 'tile') ?? family?.assets[0];
  if (!tile) throw new Error('drawable catalog has no terrain surfaces');
  return tile.id;
};

/**
 * Deterministic in `seed`: the same seed always dresses the same board. `keepClear` cells
 * ("x,y" keys — a diagram's marked squares and piece cells) end up the default family with
 * no ground cover or macro top, so tactical content always reads against calm grass.
 *
 * The scatter runs over the WHOLE board and the cleared cells are stamped back to grass
 * afterwards — carving them out of the scatter region instead would split the board into
 * islands (a bishop's rays quarter it) and the one-contiguous-blob grower would flood each
 * island with a single section, ignoring the shares.
 */
export function generateTerrainDressing({ cols, rows, seed, keepClear }: {
  cols: number;
  rows: number;
  seed: number;
  keepClear?: ReadonlySet<string>;
}): GeneratedTerrainDressing {
  const sections = dressingSections(seed);
  const defaultFamilyId = defaultTerrainFamily().id;
  const clearIndices = new Set<number>();
  for (const key of keepClear ?? []) {
    const [x, y] = key.split(',').map(Number);
    if (x >= 0 && x < cols && y >= 0 && y < rows) clearIndices.add(y * cols + x);
  }
  const dressedRegion = new Set(
    Array.from({ length: cols * rows }, (_, index) => index).filter((index) => !clearIndices.has(index)),
  );
  const scatter = scatterTerrainDetailed({
    columns: cols,
    rows,
    sections: sections.map(({ terrain, share }) => ({ terrain, share })),
    randomnessBuffer: 0,
    wiggle: DRESSING_WIGGLE,
    seed,
  });
  for (const index of clearIndices) {
    scatter.terrain[index] = defaultFamilyId;
    scatter.sectionOf[index] = -1;
  }
  const solved = solveSocketBoard({
    assets: tileAssetsOnly(),
    terrainMap: scatter.terrain,
    seed,
    columns: cols,
    rows,
    familyAssets: familyTileAssets(),
  });
  const macroTiles = generateMacroTiles({
    terrainMap: scatter.terrain,
    columns: cols,
    rows,
    seed,
    sectionOf: scatter.sectionOf,
    densityBySection: sections.map(() => DEFAULT_MACRO_TILE_DENSITY * MACRO_TILE_DENSITY_SCALE),
    breakupBySection: sections.map(() => DEFAULT_MACRO_TILE_BREAKUP),
    region: dressedRegion,
  });

  const cells: EditorBoard['cells'] = {};
  const cover: EditorBoard['cover'] = {};
  const coverTypes: NonNullable<EditorBoard['coverTypes']> = {};
  const fallbackTile = defaultTileId();
  const coverRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
  for (const cell of solved.cells) {
    const key = `${cell.x},${cell.y}`;
    cells[key] = cell.asset?.id ?? fallbackTile;
    const index = cell.y * cols + cell.x;
    if (clearIndices.has(index)) continue;
    const section = scatter.sectionOf[index];
    const covers = section >= 0 ? sections[section].cover : [];
    for (const entry of covers) {
      const coverage = clamp01(COVER_KNOBS.amount
        + (coverNoise(cell.x, cell.y, (seed ^ entry.id) >>> 0) - 0.5) * 2 * COVER_KNOBS.amountRandom);
      if (coverRng.next() >= coverage) continue;
      const filledChance = clamp01(COVER_KNOBS.density
        + (coverNoise(cell.x, cell.y, (seed ^ 0x2545f491 ^ entry.id) >>> 0) - 0.5) * 2 * COVER_KNOBS.densityRandom);
      cover[key] = coverRng.next() < filledChance ? 'filled' : 'sparse';
      coverTypes[key] = entry.type;
      break;
    }
  }
  return { cells, cover, coverTypes, macroTiles };
}
