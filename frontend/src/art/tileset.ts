import type { TileAssetKind, TileFamilyId, TileSocketAsset } from '../core/tileSockets';
import { terrainLabels } from '../core/tileSockets';
import type { FeatureKind, RoadMaterial } from '../core/featureAutotile';

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

// Frayed perimeter EDGE tiles. Same top diamond as the family base (so the surface seams
// invisibly with interior tiles), but the cliff face is recolored to torn earth/rock with
// an irregular broken bottom that fades into shadow — the diorama "tearaway base" so the
// board reads as a chunk of land, not a machine cut. Held OUT of tileFamilies and random
// placement (no probability); the board solver injects them ONLY on the front screen edges
// by position. Built by frontend/scripts/build-edge-tiles.py.
const edgeTile = (family: TileFamilyId): TileAsset => ({
  id: `${family}-edge`,
  label: `${terrainLabels[family]} · Edge`,
  src: `/assets/tiles/surface/${family}-edge.png`,
  role: 'edge',
  kind: 'tile',
  source: 'pixel:surface',
  method: 'Edge (frayed cliff)',
  probability: 0,
  notes: `${terrainLabels[family]} — frayed perimeter edge (torn land cross-section).`,
  terrains: [family],
});

// Families with a generated frayed edge. Water is intentionally excluded — its edge is the
// (animated) waterfall, gated on river types; a static frayed water lip reads as clip-art.
const EDGE_FAMILIES: readonly TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand'];
export const edgeTiles: Partial<Record<TileFamilyId, TileAsset>> = Object.fromEntries(
  EDGE_FAMILIES.map((family) => [family, edgeTile(family)]),
) as Partial<Record<TileFamilyId, TileAsset>>;

export const tileAssets: readonly TileAsset[] = FAMILIES.flatMap((family) => tileFamilies[family]);

export const tileFrameSrc = (asset: TileAsset): string => asset.src;

// Linear-feature overlays (roads now; rivers later) live in their OWN registry,
// deliberately apart from the socket base tiles above: a feature is a transparent
// ribbon composited OVER any base tile, keyed by its material and 4-bit connection
// mask (0–15), not selected by the socket solver. Baked by scripts/build-road-tiles.py.
export const featureFrameSrc = (kind: FeatureKind, material: RoadMaterial, mask: number): string =>
  `/assets/tiles/feature/${kind}-${material}-${mask}.png`;

// A square, pre-centered preview icon for editor palettes/brush (the board sprites
// are tall 96x180 frames with the art only in the top diamond, so they don't center
// in a small box — this is cropped + squared at bake time). See build-road-tiles.py.
export const featureThumbSrc = (kind: FeatureKind, material: RoadMaterial): string =>
  `/assets/tiles/feature/${kind}-${material}-thumb.png`;
