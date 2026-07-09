import manifest from '../ui/design/wallDecorManifest.json';

export type WallDecorKind = 'banner' | 'relief' | 'lantern';
export type WallDecorFaceId = 'west' | 'north';

export interface WallDecorFace {
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
  previewX: number;
  previewY: number;
}

export interface WallDecorAsset {
  id: string;
  label: string;
  kind: WallDecorKind;
  badge: string;
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
  faces: Record<WallDecorFaceId, WallDecorFace>;
  method: string;
  notes: string;
}

interface WallDecorManifest {
  assets: WallDecorAsset[];
}

const WALL_DECOR_MANIFEST = manifest as WallDecorManifest;

export const WALL_DECOR_KIND_LABELS: Record<WallDecorKind, string> = {
  banner: 'Banners',
  relief: 'Reliefs',
  lantern: 'Lanterns',
};

export const WALL_DECOR_ASSETS: readonly WallDecorAsset[] = WALL_DECOR_MANIFEST.assets;
export const WALL_DECOR_KINDS: readonly WallDecorKind[] = ['banner', 'relief', 'lantern'];

export const wallDecorAsset = (id: string | undefined): WallDecorAsset =>
  WALL_DECOR_ASSETS.find((asset) => asset.id === id) ?? WALL_DECOR_ASSETS[0];
