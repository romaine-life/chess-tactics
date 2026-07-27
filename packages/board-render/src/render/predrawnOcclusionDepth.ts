import {
  isVersionedPredrawnBoardSurface,
  type PredrawnBoardSurface,
  type PredrawnBoardWorldBounds,
} from '../ui/boardCode';

/** Half-depth lanes are represented exactly while retaining a wide signed board-depth range. */
export const PREDRAWN_OCCLUSION_DEPTH_SCALE = 2;
export const PREDRAWN_OCCLUSION_DEPTH_BIAS = 0x800000;

export interface PredrawnOcclusionDepthMap {
  src: string;
  frameWidth: number;
  frameHeight: number;
  worldBounds: PredrawnBoardWorldBounds;
}

/** Resolve the exact persisted mask selected by a versioned complete-scene surface. */
export function predrawnOcclusionDepthMapForSurface(
  surface: PredrawnBoardSurface | undefined,
): PredrawnOcclusionDepthMap | undefined {
  if (!surface || !isVersionedPredrawnBoardSurface(surface) || !surface.occlusionVersionId) {
    return undefined;
  }
  return {
    src: `/api/background-versions/${encodeURIComponent(surface.occlusionVersionId)}/content`,
    frameWidth: surface.frameWidth,
    frameHeight: surface.frameHeight,
    worldBounds: surface.worldBounds,
  };
}

export function encodePredrawnOcclusionDepth(depth: number): readonly [number, number, number] {
  const encoded = Math.max(0, Math.min(
    0xffffff,
    Math.round(depth * PREDRAWN_OCCLUSION_DEPTH_SCALE) + PREDRAWN_OCCLUSION_DEPTH_BIAS,
  ));
  return [(encoded >>> 16) & 0xff, (encoded >>> 8) & 0xff, encoded & 0xff];
}

export function decodePredrawnOcclusionDepth(red: number, green: number, blue: number): number {
  const encoded = ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff);
  return (encoded - PREDRAWN_OCCLUSION_DEPTH_BIAS) / PREDRAWN_OCCLUSION_DEPTH_SCALE;
}

/**
 * Convert an aligned depth raster into a destination-out mask for one live draw op.
 * Transparent pixels remain transparent; an opaque pixel erases the op only when the
 * generated scene geometry at that pixel is strictly in front of the op's depth lane.
 */
export function filterPredrawnOcclusionDepthPixels(
  pixels: Uint8ClampedArray,
  opDepth: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels);
  for (let index = 0; index + 3 < output.length; index += 4) {
    const inFront = output[index + 3] > 0
      && decodePredrawnOcclusionDepth(output[index], output[index + 1], output[index + 2]) > opDepth;
    output[index] = 0;
    output[index + 1] = 0;
    output[index + 2] = 0;
    if (!inFront) output[index + 3] = 0;
  }
  return output;
}
