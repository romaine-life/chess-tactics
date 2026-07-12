import type { LiveMediaCatalog, LiveMediaSlot } from '../art/liveMediaCatalog';

export type WallDecorKind = 'banner' | 'relief' | 'lantern';
export type WallDecorFaceId = 'west' | 'north';

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

export interface WallDecorAsset {
  id: string;
  label: string;
  kind: WallDecorKind;
  /** Immutable content-addressed URL from the applied catalog snapshot. */
  src: string;
  width: number;
  height: number;
  mountX: number;
  mountY: number;
  faces: Record<WallDecorFaceId, WallDecorFace>;
}

interface WallDecorFaceGeometry {
  mountX: number;
  mountY: number;
  previewX: number;
  previewY: number;
}

interface WallDecorDefinition {
  id: string;
  label: string;
  kind: WallDecorKind;
  mountX: number;
  mountY: number;
  faces: Record<WallDecorFaceId, WallDecorFaceGeometry>;
}

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
];

export const WALL_DECOR_KIND_LABELS: Record<WallDecorKind, string> = {
  banner: 'Banners',
  relief: 'Reliefs',
  lantern: 'Lanterns',
};

export const WALL_DECOR_KINDS: readonly WallDecorKind[] = ['banner', 'relief', 'lantern'];

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
