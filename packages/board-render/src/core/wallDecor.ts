import type { LiveMediaCatalog, LiveMediaSlot } from '../art/liveMediaCatalog';

export type WallDecorKind = 'banner' | 'relief' | 'lantern' | 'mirror';
export type WallDecorFaceId = 'west' | 'north';
export type WallDecorMirrorCoverage = 'authored-crop' | 'full-body';

/** Flat [u,v,...] polygon in face-sprite coordinates. */
export type NormalizedAperturePolygon = number[];

export interface WallDecorFace {
  /** Immutable content-addressed URL from the applied catalog snapshot. */
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
  /** Immutable aperture-only backing/tint from the same live catalog snapshot. */
  glassSrc: string;
}

interface WallDecorAssetBase {
  id: string;
  label: string;
  kind: WallDecorKind;
  /** Immutable content-addressed URL from the applied catalog snapshot. */
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
}

export interface WallDecorStaticAsset extends WallDecorAssetBase {
  kind: Exclude<WallDecorKind, 'mirror'>;
  faces: Record<WallDecorFaceId, WallDecorFace>;
}

export interface WallDecorMirrorAsset extends WallDecorAssetBase {
  kind: 'mirror';
  mirrorCoverage: WallDecorMirrorCoverage;
  faces: Record<WallDecorFaceId, WallDecorMirrorFace>;
}

export type WallDecorAsset = WallDecorStaticAsset | WallDecorMirrorAsset;

interface WallDecorFaceGeometry {
  mountX: number;
  mountY: number;
  previewX: number;
  previewY: number;
}

interface WallDecorStaticDefinition {
  id: string;
  label: string;
  kind: Exclude<WallDecorKind, 'mirror'>;
  mountX: number;
  mountY: number;
  faces: Record<WallDecorFaceId, WallDecorFaceGeometry>;
}

interface WallDecorMirrorFaceGeometry extends WallDecorFaceGeometry {
  aperture: NormalizedAperturePolygon;
}

interface WallDecorMirrorDefinition {
  id: string;
  label: string;
  kind: 'mirror';
  mirrorCoverage: WallDecorMirrorCoverage;
  mountX: number;
  mountY: number;
  faces: Record<WallDecorFaceId, WallDecorMirrorFaceGeometry>;
}

type WallDecorDefinition = WallDecorStaticDefinition | WallDecorMirrorDefinition;

// Stable semantic identities and deterministic placement geometry remain code-
// owned. Pixel URLs and intrinsic raster dimensions deliberately do not.
const WALL_DECOR_DEFINITIONS: readonly WallDecorDefinition[] = [
  {
    id: 'banner-tattered',
    label: 'Tattered Banner',
    kind: 'banner',
    mountX: 36,
    mountY: 10,
    faces: {
      west: { mountX: 13, mountY: 10, previewX: 42, previewY: 24 },
      north: { mountX: 13, mountY: 11, previewX: 84, previewY: 24 },
    },
  },
  {
    id: 'relief-pawn',
    label: 'Pawn Relief',
    kind: 'relief',
    mountX: 36,
    mountY: 36,
    faces: {
      west: { mountX: 13, mountY: 29, previewX: 42, previewY: 42 },
      north: { mountX: 13, mountY: 25, previewX: 84, previewY: 42 },
    },
  },
  {
    id: 'relief-rook',
    label: 'Rook Relief',
    kind: 'relief',
    mountX: 36,
    mountY: 36,
    faces: {
      west: { mountX: 20, mountY: 29, previewX: 42, previewY: 42 },
      north: { mountX: 20, mountY: 29, previewX: 84, previewY: 42 },
    },
  },
  {
    id: 'lantern-brass',
    label: 'Brass Lantern',
    kind: 'lantern',
    mountX: 28,
    mountY: 8,
    faces: {
      west: { mountX: 8, mountY: 4, previewX: 42, previewY: 28 },
      north: { mountX: 8, mountY: 5, previewX: 84, previewY: 28 },
    },
  },
  {
    id: 'mirror-keep',
    label: 'Keep Mirror',
    kind: 'mirror',
    mirrorCoverage: 'authored-crop',
    mountX: 36,
    mountY: 44,
    faces: {
      west: { mountX: 17, mountY: 35, previewX: 42, previewY: 44, aperture: [0.241176, 0.295423, 0.758824, 0.155986, 0.758824, 0.67993, 0.241176, 0.819366] },
      north: { mountX: 17, mountY: 35, previewX: 84, previewY: 44, aperture: [0.241176, 0.166549, 0.758824, 0.305986, 0.758824, 0.82993, 0.241176, 0.690493] },
    },
  },
  {
    id: 'mirror-court-oval',
    label: 'Court Oval',
    kind: 'mirror',
    mirrorCoverage: 'authored-crop',
    mountX: 36,
    mountY: 44,
    faces: {
      west: { mountX: 15, mountY: 27, previewX: 42, previewY: 44, aperture: [0.5, 0.263289, 0.766, 0.499978, 0.5, 0.812763, 0.234, 0.657478, 0.304, 0.402719] },
      north: { mountX: 15, mountY: 28, previewX: 84, previewY: 44, aperture: [0.5, 0.274254, 0.766, 0.668443, 0.5, 0.823728, 0.234, 0.510943, 0.304, 0.297632] },
    },
  },
  {
    id: 'mirror-chapel-glass',
    label: 'Chapel Glass',
    kind: 'mirror',
    mirrorCoverage: 'authored-crop',
    mountX: 36,
    mountY: 48,
    faces: {
      west: { mountX: 16, mountY: 32, previewX: 42, previewY: 46, aperture: [0.5, 0.146458, 0.6375, 0.187639, 0.72, 0.280347, 0.72, 0.667569, 0.28, 0.777569, 0.28, 0.390347, 0.3625, 0.256389] },
      north: { mountX: 16, mountY: 32, previewX: 84, previewY: 46, aperture: [0.5, 0.156875, 0.6375, 0.266806, 0.72, 0.400764, 0.72, 0.787986, 0.28, 0.677986, 0.28, 0.290764, 0.3625, 0.198056] },
    },
  },
  {
    id: 'mirror-witch-eye',
    label: "Witch's Eye",
    kind: 'mirror',
    mirrorCoverage: 'authored-crop',
    mountX: 36,
    mountY: 36,
    faces: {
      west: { mountX: 19, mountY: 19, previewX: 42, previewY: 42, aperture: [0.5, 0.193056, 0.787368, 0.308556, 0.698947, 0.527889, 0.5, 0.697056, 0.212632, 0.581556, 0.234737, 0.332556] },
      north: { mountX: 19, mountY: 20, previewX: 84, previewY: 42, aperture: [0.5, 0.206944, 0.787368, 0.595444, 0.698947, 0.730778, 0.5, 0.710944, 0.212632, 0.322444, 0.234737, 0.426278] },
    },
  },
  {
    id: 'mirror-grand-gallery',
    label: 'Grand Gallery Mirror',
    kind: 'mirror',
    mirrorCoverage: 'full-body',
    mountX: 108,
    mountY: 215,
    faces: {
      west: {
        mountX: 119,
        mountY: 152,
        previewX: 42,
        previewY: 72,
        aperture: [0.043662, 0.327792, 0.956338, 0.024042, 0.956338, 0.668042, 0.043662, 0.971792],
      },
      north: {
        mountX: 23,
        mountY: 152,
        previewX: 86,
        previewY: 72,
        aperture: [0.956338, 0.971792, 0.043662, 0.668042, 0.043662, 0.024042, 0.956338, 0.327792],
      },
    },
  },
];

export const WALL_DECOR_KIND_LABELS: Record<WallDecorKind, string> = {
  banner: 'Banners',
  relief: 'Reliefs',
  lantern: 'Lanterns',
  mirror: 'Mirrors',
};

export const WALL_DECOR_KINDS: readonly WallDecorKind[] = ['banner', 'relief', 'lantern', 'mirror'];

const wallDecorAssets: WallDecorAsset[] = [];
export const WALL_DECOR_ASSETS: readonly WallDecorAsset[] = wallDecorAssets;

function usableWallDecorMedia(slot: LiveMediaSlot | undefined): slot is LiveMediaSlot & {
  media: LiveMediaSlot['media'] & { width: number; height: number };
} {
  return !!slot
    && slot.domain === 'wall-decor'
    && slot.role === 'media'
    && slot.availabilityPolicy === 'decorative'
    && slot.media.mediaType === 'image/png'
    && Number.isSafeInteger(slot.media.width)
    && Number(slot.media.width) > 0
    && Number.isSafeInteger(slot.media.height)
    && Number(slot.media.height) > 0;
}

function usableMirrorGlassMedia(slot: LiveMediaSlot | undefined): slot is LiveMediaSlot & {
  media: LiveMediaSlot['media'] & { width: number; height: number };
} {
  return usableWallDecorMedia(slot);
}

export function isNormalizedAperture(polygon: unknown): polygon is NormalizedAperturePolygon {
  return Array.isArray(polygon)
    && polygon.length >= 6
    && polygon.length % 2 === 0
    && polygon.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

/**
 * Project complete decorative triplets from one live catalog snapshot.
 *
 * Wall decor is optional. A missing or invalid main/west/north member omits the
 * whole semantic asset, so no renderer can assemble a partial set or request a
 * broken URL.
 */
export function applyWallDecorCatalog(catalog: LiveMediaCatalog): void {
  const bySlot = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const next: WallDecorAsset[] = [];
  for (const definition of WALL_DECOR_DEFINITIONS) {
    const base = bySlot.get(`wall-decor/${definition.id}.png`);
    const west = bySlot.get(`wall-decor/${definition.id}-west.png`);
    const north = bySlot.get(`wall-decor/${definition.id}-north.png`);
    if (!usableWallDecorMedia(base) || !usableWallDecorMedia(west) || !usableWallDecorMedia(north)) continue;
    if (definition.kind === 'mirror') {
      const westGlass = bySlot.get(`wall-decor/${definition.id}-west-glass.png`);
      const northGlass = bySlot.get(`wall-decor/${definition.id}-north-glass.png`);
      if (!usableMirrorGlassMedia(westGlass) || !usableMirrorGlassMedia(northGlass)) continue;
      if (!isNormalizedAperture(definition.faces.west.aperture) || !isNormalizedAperture(definition.faces.north.aperture)) continue;
      next.push({
        id: definition.id,
        label: definition.label,
        kind: definition.kind,
        mirrorCoverage: definition.mirrorCoverage,
        src: base.media.immutableUrl,
        width: base.media.width,
        height: base.media.height,
        mountX: definition.mountX,
        mountY: definition.mountY,
        faces: {
          west: {
            src: west.media.immutableUrl,
            glassSrc: westGlass.media.immutableUrl,
            width: west.media.width,
            height: west.media.height,
            ...definition.faces.west,
          },
          north: {
            src: north.media.immutableUrl,
            glassSrc: northGlass.media.immutableUrl,
            width: north.media.width,
            height: north.media.height,
            ...definition.faces.north,
          },
        },
      });
      continue;
    }
    next.push({
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      src: base.media.immutableUrl,
      width: base.media.width,
      height: base.media.height,
      mountX: definition.mountX,
      mountY: definition.mountY,
      faces: {
        west: {
          src: west.media.immutableUrl,
          width: west.media.width,
          height: west.media.height,
          ...definition.faces.west,
        },
        north: {
          src: north.media.immutableUrl,
          width: north.media.width,
          height: north.media.height,
          ...definition.faces.north,
        },
      },
    });
  }
  wallDecorAssets.splice(0, wallDecorAssets.length, ...next);
}

export function resetWallDecorCatalog(): void {
  wallDecorAssets.splice(0, wallDecorAssets.length);
}

export const wallDecorAsset = (id: string | undefined): WallDecorAsset | undefined =>
  id ? WALL_DECOR_ASSETS.find((asset) => asset.id === id) : WALL_DECOR_ASSETS[0];

export function wallDecorMirrorAperture(
  asset: WallDecorAsset | undefined,
  face: WallDecorFaceId,
): NormalizedAperturePolygon | null {
  if (!asset || asset.kind !== 'mirror') return null;
  const aperture = asset.faces[face].aperture;
  return isNormalizedAperture(aperture) ? [...aperture] : null;
}
