import type { TileAssetKind, TileFamilyId, TileSocketAsset } from '../core/tileSockets';

export interface TileAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  role: string;
  kind: TileAssetKind;
  source: string;
  probability: number;
  notes: string;
}

// Textured iso tiles (Blender-rendered from real PBR texture packs, calibrated to the
// 96x140 board grid). Hard edges — no transition tiles; terrains butt up directly.
const tile = (id: string, label: string, file: string, role: 'base' | 'variant', probability: number): TileAsset => ({
  id,
  label,
  src: `/assets/tiles/textured/${file}.png`,
  role,
  kind: 'tile',
  source: 'textured',
  probability,
  notes: `${label} — textured tile.`,
});

export const tileFamilies: Record<TileFamilyId, readonly TileAsset[]> = {
  grass: [
    tile('grass-a', 'Grass A', 'grass-a', 'base', 1),
    tile('grass-b', 'Grass B', 'grass-b', 'variant', 0.85),
    tile('grass-c', 'Grass C', 'grass-c', 'variant', 0.85),
    tile('grass-d', 'Grass D', 'grass-d', 'variant', 0.7),
    tile('grass-e', 'Grass E', 'grass-e', 'variant', 0.7),
    tile('grass-f', 'Grass F', 'grass-f', 'variant', 0.7),
    tile('grass-g', 'Grass G', 'grass-g', 'variant', 0.6),
  ],
  dirt: [
    tile('dirt-a', 'Dirt A', 'dirt-a', 'base', 1),
    tile('dirt-b', 'Dirt B', 'dirt-b', 'variant', 0.8),
    tile('dirt-c', 'Dirt C', 'dirt-c', 'variant', 0.75),
    tile('dirt-d', 'Dirt D', 'dirt-d', 'variant', 0.7),
  ],
  stone: [
    tile('stone-a', 'Stone A', 'stone-a', 'base', 1),
    tile('stone-b', 'Stone B', 'stone-b', 'variant', 0.8),
    tile('stone-c', 'Stone C', 'stone-c', 'variant', 0.75),
  ],
  pebble: [
    tile('pebble-a', 'Pebble A', 'pebble-a', 'base', 1),
  ],
  sand: [
    tile('sand-a', 'Sand A', 'sand-a', 'base', 1),
  ],
  water: [
    tile('water-a', 'Water A', 'water-a', 'base', 1),
    tile('water-b', 'Water B', 'water-b', 'variant', 0.8),
  ],
};

// No transition tiles in the hard-edge tileset; kept exported (empty) for back-compat.
export const transitionAssets: readonly TileAsset[] = [];

export const tileAssets: readonly TileAsset[] = [
  ...tileFamilies.grass,
  ...tileFamilies.dirt,
  ...tileFamilies.stone,
  ...tileFamilies.pebble,
  ...tileFamilies.sand,
  ...tileFamilies.water,
];

export const tileFrameSrc = (asset: TileAsset): string => asset.src;
