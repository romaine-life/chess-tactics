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
// flat top-down PixelLab surface projected into the exact top diamond
// (frontend/scripts/project-tile-surface.py). This sidesteps PixelLab's unreliable iso-top
// drawing: Blender owns the geometry, PixelLab only paints a flat material.
// Eight variants per family. The raw PixelLab blocks, textured Blender tiles, and the
// rejected conversion methods are non-production — see frontend/src/art/nonProductionTiles.ts.
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

export const tileAssets: readonly TileAsset[] = FAMILIES.flatMap((family) => tileFamilies[family]);

export const tileFrameSrc = (asset: TileAsset): string => asset.src;
