import manifest from '../ui/design/wallDecorManifest.json';

export type WallDecorKind = 'banner' | 'relief' | 'lantern' | 'mirror';
export type WallDecorFaceId = 'west' | 'north';
export type WallDecorMirrorCoverage = 'authored-crop' | 'full-body';

/** Flat [u,v,...] polygon in face-sprite coordinates. Values are authored in the closed 0..1
 * interval so the same aperture follows every runtime scale and wall-face projection. */
export type NormalizedAperturePolygon = number[];

export interface WallDecorFace {
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
  previewX: number;
  previewY: number;
}

export interface WallDecorMirrorFace extends WallDecorFace {
  aperture: NormalizedAperturePolygon;
  /** Generated aperture-only backing/tint, composited below live subjects. `src` is the cleared
   * foreground frame/material overlay composited above them. */
  glassSrc: string;
}

interface WallDecorAssetBase {
  id: string;
  label: string;
  badge: string;
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
  method: string;
  notes: string;
}

export interface WallDecorStaticAsset extends WallDecorAssetBase {
  kind: Exclude<WallDecorKind, 'mirror'>;
  faces: Record<WallDecorFaceId, WallDecorFace>;
}

export interface WallDecorMirrorAsset extends WallDecorAssetBase {
  kind: 'mirror';
  /** Whether the authored glass intentionally crops an exact-size subject or proves complete
   * tallest-unit coverage. This is optical semantics, never a supporting-wall height switch. */
  mirrorCoverage: WallDecorMirrorCoverage;
  faces: Record<WallDecorFaceId, WallDecorMirrorFace>;
}

export type WallDecorAsset = WallDecorStaticAsset | WallDecorMirrorAsset;

interface WallDecorManifest {
  assets: WallDecorAsset[];
}

const WALL_DECOR_MANIFEST = manifest as WallDecorManifest;

export const WALL_DECOR_KIND_LABELS: Record<WallDecorKind, string> = {
  banner: 'Banners',
  relief: 'Reliefs',
  lantern: 'Lanterns',
  mirror: 'Mirrors',
};

export const WALL_DECOR_ASSETS: readonly WallDecorAsset[] = WALL_DECOR_MANIFEST.assets;
export const WALL_DECOR_KINDS: readonly WallDecorKind[] = ['banner', 'relief', 'lantern', 'mirror'];

export const wallDecorAsset = (id: string | undefined): WallDecorAsset =>
  WALL_DECOR_ASSETS.find((asset) => asset.id === id) ?? WALL_DECOR_ASSETS[0];

export function isNormalizedAperture(polygon: unknown): polygon is NormalizedAperturePolygon {
  return Array.isArray(polygon)
    && polygon.length >= 6
    && polygon.length % 2 === 0
    && polygon.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

/** The authored glass opening for a mirror face. A missing/malformed polygon is never replaced by
 * a decorative full-frame fallback: invalid mirror data produces no reflective surface. */
export function wallDecorMirrorAperture(
  asset: WallDecorAsset,
  face: WallDecorFaceId,
): NormalizedAperturePolygon | null {
  if (asset.kind !== 'mirror') return null;
  const aperture = asset.faces[face].aperture;
  return isNormalizedAperture(aperture) ? [...aperture] : null;
}
