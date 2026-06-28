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

// PRODUCTION TILESET — pixel-art tiles chosen from the conversion bake-off:
//   • codex→filter — a faithful pixelation of the Blender source tile (the base look)
//   • pixellab     — fresh-drawn pixel art (a variant)
// The previous textured Blender tiles and the other bake-off methods (filter ×2/×3, codex)
// are non-production now and live in frontend/src/art/nonProductionTiles.ts.
const FAMILIES: readonly TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];

const PRODUCTION_VARIANTS = [
  { key: 'codexfilter', label: 'Codex → Filter', role: 'base' as const, probability: 1 },
  { key: 'pixellab', label: 'PixelLab', role: 'variant' as const, probability: 0.85 },
] as const;

const pixelTile = (family: TileFamilyId, variant: (typeof PRODUCTION_VARIANTS)[number]): TileAsset => ({
  id: `${family}-${variant.key}`,
  label: `${terrainLabels[family]} · ${variant.label}`,
  src: `/assets/tiles/pixel/${family}-${variant.key}.png`,
  role: variant.role,
  kind: 'tile',
  source: `pixel:${variant.key}`,
  method: variant.label,
  probability: variant.probability,
  notes: `${terrainLabels[family]} — ${variant.label} pixel-art tile (production).`,
});

const familyTiles = (family: TileFamilyId): TileAsset[] => PRODUCTION_VARIANTS.map((variant) => pixelTile(family, variant));

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
