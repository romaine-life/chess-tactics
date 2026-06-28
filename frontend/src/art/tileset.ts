import type { TileAssetKind, TileFamilyId, TileSocketAsset } from '../core/tileSockets';
import { terrainLabels } from '../core/tileSockets';

export interface TileAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  role: string;
  kind: TileAssetKind;
  source: string;
  probability: number;
  notes: string;
  /**
   * Non-production tiles: kept in the Studio catalog for reference/comparison but held OUT
   * of `tileFamilies`, board generation, and the shipped game. The legacy textured tiles and
   * the rejected bake-off methods live there — see frontend/src/art/nonProductionTiles.ts.
   */
  speculative?: boolean;
  /** How a tile was produced (e.g. "Codex → Filter", "PixelLab", "Textured"). */
  method?: string;
}

// PRODUCTION TILESET — surface-swap tiles. Each tile is a Blender-derived iso EDGE
// (the codexfilter pixelation, perfect grid geometry) with a separately-generated
// flat top-down PixelLab surface projected into the exact top diamond, then the side
// faces palette-tied to a darker tone of that tile's own top so top↔side reads as one
// material (the approved seam treatment). This sidesteps PixelLab's unreliable iso-top
// drawing: Blender owns the geometry, PixelLab only paints a flat material.
// On the BOARD these render as two layers — top over side (ADR-0039); split-tiles.py derives
// the -top/-side halves, and `src` here is the combined sprite (the split source + the
// catalog/inspector image).
// Built by frontend/scripts/build-surface-tiles.py. Eight variants per family. The raw
// PixelLab blocks, textured Blender tiles, and the rejected conversion methods are
// non-production — see frontend/src/art/nonProductionTiles.ts.
const FAMILIES: readonly TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];

interface ProductionVariant {
  key: string;
  label: string;
  role: 'base' | 'variant';
  probability: number;
}

const PRODUCTION_VARIANTS: ProductionVariant[] = Array.from({ length: 8 }, (_, n) => ({
  key: `${n}`,
  label: `Surface ${n + 1}`,
  role: n === 0 ? 'base' : 'variant',
  probability: n === 0 ? 1 : 0.8,
}));

const surfaceTile = (family: TileFamilyId, variant: ProductionVariant): TileAsset => ({
  id: `${family}-surf-${variant.key}`,
  label: `${terrainLabels[family]} · ${variant.label}`,
  src: `/assets/tiles/surface/${family}-${variant.key}.png`,
  role: variant.role,
  kind: 'tile',
  source: 'pixel:surface',
  method: 'Surface (Blender edge + PixelLab top)',
  probability: variant.probability,
  notes: `${terrainLabels[family]} — ${variant.label}: Blender-derived iso edge with a generated pixel-art top (production).`,
});

const familyTiles = (family: TileFamilyId): TileAsset[] => PRODUCTION_VARIANTS.map((variant) => surfaceTile(family, variant));

export const tileFamilies: Record<TileFamilyId, readonly TileAsset[]> = {
  grass: familyTiles('grass'),
  dirt: familyTiles('dirt'),
  stone: familyTiles('stone'),
  pebble: familyTiles('pebble'),
  sand: familyTiles('sand'),
  water: familyTiles('water'),
};

// No transition tiles in the hard-edge tileset; kept exported (empty) for back-compat.
export const transitionAssets: readonly TileAsset[] = [];

// Rich perimeter EDGE tiles (ADR-0039). The cliff side is authored GEOLOGY — a codex
// material slab (turf+roots / strata / mossy bedrock …) projected onto the two iso faces and
// masked to the frayed silhouette — composed under the cell's own top. Several DISTINCT
// variants per family so a long board edge reads rich AND non-repeating; the solver picks one
// per void-facing cell (weighted, anti-adjacent). Built by frontend/scripts/build-rich-edges.py.
const EDGE_VARIANTS = 3;
const edgeVariant = (family: TileFamilyId, v: number): TileAsset => ({
  id: `${family}-edge-${v}`,
  label: `${terrainLabels[family]} · Edge ${v + 1}`,
  src: `/assets/tiles/surface/${family}-edge-${v}.png`,
  role: 'edge',
  kind: 'tile',
  source: 'pixel:surface',
  method: 'Edge (rich cliff)',
  probability: v === 0 ? 1 : 0.7, // variant 0 slightly commoner; rest punctuate the run
  notes: `${terrainLabels[family]} — rich perimeter cliff (variant ${v + 1}).`,
  terrains: [family],
});

// Families with rich edges. Water is intentionally excluded — its edge is the (animated)
// waterfall, gated on river types; a static frayed water lip reads as clip-art.
const EDGE_FAMILIES: readonly TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand'];
export const edgeTiles: Partial<Record<TileFamilyId, TileAsset[]>> = Object.fromEntries(
  EDGE_FAMILIES.map((family) => [family, Array.from({ length: EDGE_VARIANTS }, (_, v) => edgeVariant(family, v))]),
) as Partial<Record<TileFamilyId, TileAsset[]>>;

export const tileAssets: readonly TileAsset[] = FAMILIES.flatMap((family) => tileFamilies[family]);

export const tileFrameSrc = (asset: TileAsset): string => asset.src;
