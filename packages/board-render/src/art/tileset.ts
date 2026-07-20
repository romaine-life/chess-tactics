import type { TileAssetKind, TileFamilyId, TileSocketAsset } from '../core/tileSockets';
import type { FeatureKind, FeatureMaterial, FenceMaterial, WallMaterial } from '../core/featureAutotile';
import { currentDrawableCatalog, drawableAssets, type DrawableCatalog } from './drawableCatalog';

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

// Production terrain surfaces are database-owned horizontal walkable tops. Vertical
// Subterrain is an independent, opt-in drawable and is never inferred from these rows.
let cachedSurfaceCatalog: DrawableCatalog | null = null;
let cachedSurfaceAssets: TileAsset[] = [];
let cachedTileFamilies: Record<TileFamilyId, readonly TileAsset[]> = {};

const surfaceAssets = (): TileAsset[] => {
  const catalog = currentDrawableCatalog();
  if (cachedSurfaceCatalog === catalog) return cachedSurfaceAssets;
  const assets = drawableAssets('terrain-surface').map((asset): TileAsset => {
  const family = asset.behavior.family;
  const role = asset.behavior.role;
  const probability = asset.behavior.probability;
  const top = asset.media.top?.media;
  if (typeof family !== 'string' || (role !== 'base' && role !== 'variant')
    || !(typeof probability === 'number' && Number.isFinite(probability) && probability > 0) || !top) {
    throw new Error(`terrain surface ${asset.id} lacks family, role, probability, or top data`);
  }
  return {
    id: asset.id,
    label: asset.label,
    src: top.immutableUrl,
    role,
    kind: 'tile',
    source: typeof asset.metadata.source === 'string' ? asset.metadata.source : 'live:drawable',
    method: typeof asset.metadata.method === 'string' ? asset.metadata.method : undefined,
    probability,
    notes: typeof asset.metadata.notes === 'string' ? asset.metadata.notes : '',
    terrains: [family as TileFamilyId],
    ...(typeof asset.behavior.topAnimFrames === 'number' ? { topAnimFrames: asset.behavior.topAnimFrames } : {}),
  };
  });
  const grouped: Record<string, TileAsset[]> = {};
  for (const asset of assets) {
    const family = asset.terrains?.[0];
    if (family) (grouped[family] ??= []).push(asset);
  }
  cachedSurfaceCatalog = catalog;
  cachedSurfaceAssets = assets;
  cachedTileFamilies = grouped as Record<TileFamilyId, readonly TileAsset[]>;
  return assets;
};

const currentTileFamilies = (): Record<TileFamilyId, readonly TileAsset[]> => {
  surfaceAssets();
  return cachedTileFamilies;
};
const dynamicArray = <T>(read: () => T[]): T[] => new Proxy([] as T[], {
  get: (_target, property) => {
    const current = read();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
  ownKeys: () => Reflect.ownKeys(read()),
  getOwnPropertyDescriptor: (_target, property) => Object.getOwnPropertyDescriptor(read(), property),
});

export const tileAssets: readonly TileAsset[] = dynamicArray(surfaceAssets);
export const tileFamilies: Record<TileFamilyId, readonly TileAsset[]> = new Proxy({} as Record<TileFamilyId, readonly TileAsset[]>, {
  get: (_target, property) => currentTileFamilies()[property as TileFamilyId],
  ownKeys: () => Reflect.ownKeys(currentTileFamilies()),
  getOwnPropertyDescriptor: (_target, property) => ({ configurable: true, enumerable: property in currentTileFamilies() }),
});

export const tileFrameSrc = (asset: TileAsset): string => asset.src;

// The database-resolved top descriptor is also the palette preview source.
export const tileTopSrc = (asset: TileAsset): string => asset.src;

const materialDrawable = (kind: string, material: string) => {
  const asset = drawableAssets(kind).find((candidate) => (candidate.behavior.value ?? candidate.id) === material);
  if (!asset) throw new Error(`drawable catalog has no ${kind} ${material}`);
  return asset;
};
const materialMedia = (kind: string, material: string, role: string): string => {
  const media = materialDrawable(kind, material).media[role]?.media;
  if (!media) throw new Error(`drawable catalog ${kind} ${material} has no ${role} media`);
  return media.immutableUrl;
};

// Linear-feature overlays (roads, rivers, bridges) live in their OWN registry,
// deliberately apart from the socket base tiles above: a feature is a transparent
// ribbon composited OVER any base tile, not selected by the socket solver. Baked by
// scripts/build-feature-tiles.py.
//   • road/river AUTOTILE — keyed by material + 4-bit connection mask (0–15).
export const featureFrameSrc = (kind: FeatureKind, material: FeatureMaterial, mask: number): string =>
  materialMedia(`${kind}-material`, material, `frame-${mask}`);

// A per-cell EDGE-FENCE frame: rails on this cell's OWN E(2)/S(4) diamond sides (mask ∈ {2,4,6}),
// so every shared edge is drawn once by its upper-left cell (see featureAutotile.fenceCellMasks).
// Baked by scripts/build-fence-tiles.py, same 96x180 frame geometry as the feature ribbons.
export const fenceFrameSrc = (material: FenceMaterial, mask: number): string =>
  materialMedia('fence-material', material, `frame-${mask}`);

/** Sole native frame geometry for generated perimeter walls. The base remains seated at the
 * board boundary while the full 160px face provides headroom for exact-size unit reflections. */
export const WALL_FRAME_GEOMETRY = {
  width: 128,
  height: 336,
  anchorX: 64,
  anchorY: 192,
  wallHeight: 160,
  /** Wall-bake back-edge apex is local y=164, 28px above the owning cell seat. */
  backEdgeApexOffsetY: -28,
} as const;

/** Direction-neutral post artwork, seated once at a canonical fence vertex. */
export const fencePostSrc = (material: FenceMaterial): string =>
  materialMedia('fence-material', material, 'post');

// A per-cell WALL frame: walls on a board-perimeter cell's OWN N(1)/W(8) diamond
// sides (mask ∈ {1,8,9}). Only northmost/westmost map edges use these frames.
// Baked by scripts/build-wall-tiles.py from generated material. These are tall
// 128x336 frames seated at a wall-specific anchor; they intentionally do not
// reuse the tile/fence frame contract.
export const wallFrameSrc = (material: WallMaterial, mask: number): string =>
  materialMedia('wall-material', material, `frame-${mask}`);

// A square, pre-centered preview icon for editor palettes/brush (the board sprites
// are tall 96x180 frames with the art only in the top diamond, so they don't center
// in a small box — this is cropped + squared at bake time). See build-feature-tiles.py.
export const featureThumbSrc = (kind: FeatureKind, material: FeatureMaterial): string =>
  materialMedia(`${kind}-material`, material, 'thumb');

/** Square preview icon for the fence palette/brush (baked alongside the fence frames). */
export const fenceThumbSrc = (material: FenceMaterial): string =>
  materialMedia('fence-material', material, 'thumb');

/** Square preview icon for a direction-neutral authored/automatic fence post. */
export const fencePostThumbSrc = (material: FenceMaterial): string =>
  materialMedia('fence-material', material, 'post-thumb');

/** Square preview icon for the wall palette/brush (baked alongside the wall frames). */
export const wallThumbSrc = (material: WallMaterial): string =>
  materialMedia('wall-material', material, 'thumb');
