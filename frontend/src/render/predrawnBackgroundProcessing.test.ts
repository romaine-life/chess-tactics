import { afterEach, describe, expect, it, vi } from 'vitest';
// pngjs intentionally ships without TypeScript declarations; it is used here only to verify that
// the production encoder emits a standards-compliant raster with the exact source pixels.
// @ts-expect-error pngjs has no declaration file
import { PNG } from 'pngjs';
import { encodePredrawnOcclusionDepth } from '@chess-tactics/board-render';
import {
  assertDecodablePngBlob,
  assertPredrawnRasterDimensions,
  deterministicRgbaPngByteLength,
  encodeDeterministicRgbaPng,
  integerPredrawnRasterViewport,
  predrawnOcclusionDepthHeatmapPixels,
  predrawnOcclusionRasterRegion,
  predrawnWarpAlgorithmForRegistration,
  PREDRAWN_MAX_PNG_BYTES,
  PREDRAWN_PNG_ENCODER,
} from './predrawnBackgroundProcessing';

declare const Buffer: { from(bytes: Uint8Array): unknown };

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('predrawn background processing', () => {
  it('pairs legacy and mesh registrations with their exact raster algorithm identities', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 80,
      north: [50, 0],
      east: [100, 40],
      south: [50, 80],
      west: [0, 40],
      gridColumns: 2,
      gridRows: 2,
      columnGuides: [0, 0.5, 1],
      rowGuides: [0, 0.5, 1],
    } as const;
    expect(predrawnWarpAlgorithmForRegistration(registration)).toEqual({
      operationKind: 'grid-warp-v1',
      processor: 'shared-predrawn-rasterizer-v1',
    });
    expect(predrawnWarpAlgorithmForRegistration({
      ...registration,
      meshOverrides: [{ column: 1, row: 1, point: [51, 40] }],
    })).toEqual({
      operationKind: 'grid-warp-v2',
      processor: 'shared-predrawn-rasterizer-v2',
    });
    expect(predrawnWarpAlgorithmForRegistration({
      ...registration,
      meshOverrides: [{ column: 1, row: 1, point: [50, 40] }],
    })).toEqual({
      operationKind: 'grid-warp-v1',
      processor: 'shared-predrawn-rasterizer-v1',
    });
  });

  it('decodes RGB24 depth before nearest-neighbor preview sampling and preserves sampled alpha', () => {
    const pixels = new Uint8ClampedArray([
      ...encodePredrawnOcclusionDepth(-2), 10,
      ...encodePredrawnOcclusionDepth(0), 20,
      ...encodePredrawnOcclusionDepth(2), 30,
      ...encodePredrawnOcclusionDepth(4), 40,
    ]);
    const heatmap = predrawnOcclusionDepthHeatmapPixels(pixels, 4, 1, { maxWidth: 2, maxHeight: 1 });
    expect(heatmap).toMatchObject({
      width: 2,
      height: 1,
      minDepth: -2,
      maxDepth: 4,
      opaquePixelCount: 4,
    });
    // Center-addressed nearest-neighbor sampling selects source pixels 1 and 3 exactly.
    expect([...heatmap.data]).toEqual([
      101, 93, 184, 20,
      255, 70, 42, 40,
    ]);
  });

  it('keeps transparent mask pixels transparent and reports an empty depth range truthfully', () => {
    const empty = predrawnOcclusionDepthHeatmapPixels(new Uint8ClampedArray([
      255, 0, 255, 0,
      0, 255, 0, 0,
    ]), 2, 1);
    expect(empty.minDepth).toBeNull();
    expect(empty.maxDepth).toBeNull();
    expect(empty.opaquePixelCount).toBe(0);
    expect([...empty.data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('rounds transformed bounds outward without changing the one-pixel world scale', () => {
    expect(integerPredrawnRasterViewport({
      minX: -620.25,
      minY: -349.01,
      width: 1240.5,
      height: 698.02,
    })).toEqual({
      minX: -621,
      minY: -350,
      width: 1242,
      height: 700,
      pixelWidth: 1242,
      pixelHeight: 700,
    });
  });

  it('maps an occluder to its exact clipped full-frame pixel region', () => {
    expect(predrawnOcclusionRasterRegion(
      { dx: -95, dy: -45, dw: 20, dh: 10 },
      800,
      400,
      { minX: -100, minY: -50, width: 400, height: 200 },
    )).toEqual({
      frameX: 10,
      frameY: 10,
      width: 40,
      height: 20,
      worldBounds: { minX: -95, minY: -45, width: 20, height: 10 },
    });
    expect(predrawnOcclusionRasterRegion(
      { dx: 5, dy: 5, dw: -10, dh: -10 },
      10,
      10,
      { minX: 0, minY: 0, width: 10, height: 10 },
    )).toEqual({
      frameX: 0,
      frameY: 0,
      width: 5,
      height: 5,
      worldBounds: { minX: 0, minY: 0, width: 5, height: 5 },
    });
  });

  it('bounds many-op 8MP mask readback by local sprite area instead of ops times full frame', () => {
    const frameWidth = 8192;
    const frameHeight = 1024;
    const fullFramePixels = frameWidth * frameHeight;
    const regions = Array.from({ length: 128 }, (_, index) => predrawnOcclusionRasterRegion(
      { dx: (index % 64) * 100, dy: Math.floor(index / 64) * 100, dw: 64, dh: 64 },
      frameWidth,
      frameHeight,
      { minX: 0, minY: 0, width: frameWidth, height: frameHeight },
    ));
    const readbackPixels = regions.reduce((sum, region) => sum + (region ? region.width * region.height : 0), 0);
    expect(regions.every((region) => region && region.width === 64 && region.height === 64)).toBe(true);
    expect(readbackPixels).toBe(128 * 64 * 64);
    expect(readbackPixels).toBeLessThan(fullFramePixels / 10);
  });

  it('encodes byte-stable, decodable RGBA PNGs without browser-selected compression', async () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 64,
      255, 255, 255, 0,
    ]);
    const first = encodeDeterministicRgbaPng(2, 2, pixels);
    const second = encodeDeterministicRgbaPng(2, 2, pixels);
    expect(PREDRAWN_PNG_ENCODER).toBe('png-rgba8-filter0-stored-deflate-v1');
    expect(second).toEqual(first);
    expect(await sha256(first)).toBe('c597c766b55705c2657a46f2543fb4046ae54ae62cfc5f49c609fc0410528942');
    const decoded = PNG.sync.read(Buffer.from(first));
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
    expect([...decoded.data]).toEqual([...pixels]);
  });

  it('rejects pathological fitted output before allocating its raster', () => {
    expect(() => assertPredrawnRasterDimensions(100_000, 100_000, { deterministicPng: true }))
      .toThrow(/cannot exceed 8192 pixels per side/);
    expect(deterministicRgbaPngByteLength(8192, 1024)).toBeGreaterThan(PREDRAWN_MAX_PNG_BYTES);
    expect(() => assertPredrawnRasterDimensions(8192, 1024, { deterministicPng: true }))
      .toThrow(/too large for the deterministic PNG artifact limit/);
    expect(() => assertPredrawnRasterDimensions(8192, 1024)).not.toThrow();
  });

  it('validates repeated upload blobs with closed one-shot decoders and no shared-cache URLs', async () => {
    const png = encodeDeterministicRgbaPng(2, 2, new Uint8Array(16).fill(255));
    const closeCalls: Array<ReturnType<typeof vi.fn>> = [];
    const createImageBitmapOnce = vi.fn(async () => {
      const close = vi.fn();
      closeCalls.push(close);
      return { width: 2, height: 2, close };
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapOnce);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    const candidates = Array.from(
      { length: 24 },
      () => new Blob([png], { type: 'image/png' }),
    );
    await expect(Promise.all(candidates.map(assertDecodablePngBlob))).resolves.toEqual(
      candidates.map(() => ({ width: 2, height: 2 })),
    );

    expect(createImageBitmapOnce).toHaveBeenCalledTimes(candidates.length);
    expect(closeCalls).toHaveLength(candidates.length);
    for (const close of closeCalls) expect(close).toHaveBeenCalledOnce();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
