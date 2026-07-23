import {
  PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
  predrawnBoardRasterBounds,
  predrawnBoardRasterTransform,
  predrawnEnvironmentGeometryFingerprintInput,
  predrawnEnvironmentGeometryFingerprintInputV1,
  predrawnOcclusionMaskOps,
  decodePredrawnOcclusionDepth,
  encodePredrawnOcclusionDepth,
  rasterizePredrawnBoardPixels,
  serializePredrawnBoardPreviewRegistration,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardWorldBounds,
  type PredrawnRasterViewport,
  type EditorBoard,
} from '@chess-tactics/board-render';
import { drawBoardOps } from './BoardCanvasLayer';
import { loadDecodedImage, loadDecodedImageMap } from './imageResources';

export interface GeneratedPredrawnRaster {
  blob: Blob;
  frameWidth: number;
  frameHeight: number;
  worldBounds: PredrawnBoardWorldBounds;
  operation: Record<string, unknown>;
}

export interface PredrawnOcclusionDepthHeatmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  minDepth: number | null;
  maxDepth: number | null;
  opaquePixelCount: number;
}

export interface PredrawnOcclusionRasterRegion {
  frameX: number;
  frameY: number;
  width: number;
  height: number;
  worldBounds: PredrawnBoardWorldBounds;
}

export const PREDRAWN_DEPTH_HEATMAP_FAR_RGB = [24, 104, 255] as const;
export const PREDRAWN_DEPTH_HEATMAP_NEAR_RGB = [255, 70, 42] as const;

export const PREDRAWN_PNG_ENCODER = 'png-rgba8-filter0-stored-deflate-v1';
export const PREDRAWN_MAX_FRAME_DIMENSION = 8192;
export const PREDRAWN_MAX_RASTER_PIXELS = 8 * 1024 * 1024;
export const PREDRAWN_MAX_PNG_BYTES = 32 * 1024 * 1024;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

/**
 * Decode the mask's RGB24 depth lanes into a review-only color ramp. The source is sampled by
 * integer pixel address so a browser resampler can never invent an in-between encoded depth.
 * Each sampled pixel retains its exact source alpha, including antialiased silhouette edges.
 */
export function predrawnOcclusionDepthHeatmapPixels(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  options: { maxWidth?: number; maxHeight?: number } = {},
): PredrawnOcclusionDepthHeatmap {
  if (
    !Number.isSafeInteger(sourceWidth)
    || !Number.isSafeInteger(sourceHeight)
    || sourceWidth < 1
    || sourceHeight < 1
    || source.length !== sourceWidth * sourceHeight * 4
  ) throw new Error('Occlusion heatmap source dimensions do not match its RGBA pixels.');
  const maxWidth = options.maxWidth ?? 512;
  const maxHeight = options.maxHeight ?? 512;
  if (
    !Number.isSafeInteger(maxWidth)
    || !Number.isSafeInteger(maxHeight)
    || maxWidth < 1
    || maxHeight < 1
  ) throw new Error('Occlusion heatmap bounds must be positive integers.');

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  let opaquePixelCount = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    const depth = decodePredrawnOcclusionDepth(source[offset], source[offset + 1], source[offset + 2]);
    minDepth = Math.min(minDepth, depth);
    maxDepth = Math.max(maxDepth, depth);
    opaquePixelCount += 1;
  }

  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const hasDepth = opaquePixelCount > 0;
  const depthRange = hasDepth ? maxDepth - minDepth : 0;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(((y + 0.5) * sourceHeight) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(((x + 0.5) * sourceWidth) / width));
      const sourceOffset = ((sourceY * sourceWidth) + sourceX) * 4;
      const targetOffset = ((y * width) + x) * 4;
      const alpha = source[sourceOffset + 3];
      data[targetOffset + 3] = alpha;
      if (alpha === 0 || !hasDepth) continue;
      const depth = decodePredrawnOcclusionDepth(
        source[sourceOffset],
        source[sourceOffset + 1],
        source[sourceOffset + 2],
      );
      const ratio = depthRange > 0 ? (depth - minDepth) / depthRange : 0.5;
      for (let channel = 0; channel < 3; channel += 1) {
        const far = PREDRAWN_DEPTH_HEATMAP_FAR_RGB[channel];
        const near = PREDRAWN_DEPTH_HEATMAP_NEAR_RGB[channel];
        data[targetOffset + channel] = Math.round(far + ((near - far) * ratio));
      }
    }
  }

  return {
    data,
    width,
    height,
    minDepth: hasDepth ? minDepth : null,
    maxDepth: hasDepth ? maxDepth : null,
    opaquePixelCount,
  };
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BigEndian(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  writeUint32BigEndian(chunk, 8 + data.length, pngCrc32(crcInput));
  return chunk;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let offset = 0; offset < bytes.length; offset += 5552) {
    const end = Math.min(offset + 5552, bytes.length);
    for (let index = offset; index < end; index += 1) {
      a += bytes[index];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** A byte-stable zlib stream made from uncompressed DEFLATE blocks. */
function storedDeflate(bytes: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(bytes.length / 65535));
  const output = new Uint8Array(2 + bytes.length + (blockCount * 5) + 4);
  output[0] = 0x78;
  output[1] = 0x01;
  let sourceOffset = 0;
  let outputOffset = 2;
  for (let block = 0; block < blockCount; block += 1) {
    const length = Math.min(65535, bytes.length - sourceOffset);
    const complement = (~length) & 0xffff;
    output[outputOffset] = block === blockCount - 1 ? 0x01 : 0x00;
    output[outputOffset + 1] = length & 0xff;
    output[outputOffset + 2] = (length >>> 8) & 0xff;
    output[outputOffset + 3] = complement & 0xff;
    output[outputOffset + 4] = (complement >>> 8) & 0xff;
    outputOffset += 5;
    output.set(bytes.subarray(sourceOffset, sourceOffset + length), outputOffset);
    sourceOffset += length;
    outputOffset += length;
  }
  writeUint32BigEndian(output, outputOffset, adler32(bytes));
  return output;
}

export function deterministicRgbaPngByteLength(width: number, height: number): number {
  const scanlineBytes = height * ((width * 4) + 1);
  const blockCount = Math.max(1, Math.ceil(scanlineBytes / 65535));
  return 63 + scanlineBytes + (blockCount * 5);
}

export function assertPredrawnRasterDimensions(
  width: number,
  height: number,
  options: { deterministicPng?: boolean } = {},
): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('Background dimensions must be positive integers.');
  }
  if (width > PREDRAWN_MAX_FRAME_DIMENSION || height > PREDRAWN_MAX_FRAME_DIMENSION) {
    throw new Error(`Background dimensions cannot exceed ${PREDRAWN_MAX_FRAME_DIMENSION} pixels per side.`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > PREDRAWN_MAX_RASTER_PIXELS) {
    throw new Error(`Backgrounds cannot exceed ${PREDRAWN_MAX_RASTER_PIXELS.toLocaleString()} pixels.`);
  }
  if (options.deterministicPng && deterministicRgbaPngByteLength(width, height) > PREDRAWN_MAX_PNG_BYTES) {
    throw new Error('This transform is too large for the deterministic PNG artifact limit. Tighten the fitted grid or viewing pane.');
  }
}

/**
 * Encode exact RGBA pixels without delegating compression or filtering choices to the browser.
 * This intentionally favors byte-for-byte reproducibility over a smaller generated artifact.
 */
export function encodeDeterministicRgbaPng(
  width: number,
  height: number,
  pixels: Uint8Array | Uint8ClampedArray,
): Uint8Array<ArrayBuffer> {
  assertPredrawnRasterDimensions(width, height, { deterministicPng: true });
  const rowBytes = width * 4;
  if (!Number.isSafeInteger(rowBytes) || pixels.length !== rowBytes * height) {
    throw new Error('PNG RGBA byte length does not match its dimensions.');
  }
  const scanlines = new Uint8Array((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const targetOffset = row * (rowBytes + 1);
    scanlines[targetOffset] = 0;
    scanlines.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), targetOffset + 1);
  }
  const ihdr = new Uint8Array(13);
  writeUint32BigEndian(ihdr, 0, width);
  writeUint32BigEndian(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', storedDeflate(scanlines)), pngChunk('IEND', new Uint8Array())];
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function deterministicPngBlob(width: number, height: number, pixels: Uint8Array | Uint8ClampedArray): Blob {
  return new Blob([encodeDeterministicRgbaPng(width, height, pixels).buffer], { type: 'image/png' });
}

async function environmentGeometrySha256(fingerprint: string): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Cover-independent fingerprint used by every newly created artwork version. */
export async function predrawnEnvironmentGeometrySha256(board: EditorBoard): Promise<string> {
  return environmentGeometrySha256(predrawnEnvironmentGeometryFingerprintInput(board));
}

/** Exact v1 migration proof for immutable rows created before live Cover was restored. */
export async function legacyPredrawnEnvironmentGeometrySha256V1(board: EditorBoard): Promise<string> {
  return environmentGeometrySha256(predrawnEnvironmentGeometryFingerprintInputV1(board));
}

function decodedImagePixels(image: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The browser could not read the source background pixels.');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Preserve every transformed source pixel at one output pixel per canonical board-space pixel.
 * Integer outward rounding avoids silently cropping a fractional transformed frame boundary.
 */
export function integerPredrawnRasterViewport(bounds: {
  minX: number;
  minY: number;
  width: number;
  height: number;
}): PredrawnRasterViewport {
  const minX = Math.floor(bounds.minX);
  const minY = Math.floor(bounds.minY);
  const maxX = Math.ceil(bounds.minX + bounds.width);
  const maxY = Math.ceil(bounds.minY + bounds.height);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, width, height, pixelWidth: width, pixelHeight: height };
}

/**
 * Clip one canonical draw op to the immutable raster and preserve the exact full-frame pixel
 * grid. Rendering against this local world rectangle produces the same destination coordinates
 * as a full-frame canvas without reading every unrelated pixel for every occluder.
 */
export function predrawnOcclusionRasterRegion(
  op: { dx: number; dy: number; dw: number; dh: number },
  frameWidth: number,
  frameHeight: number,
  worldBounds: PredrawnBoardWorldBounds,
): PredrawnOcclusionRasterRegion | null {
  if (
    !Number.isSafeInteger(frameWidth)
    || !Number.isSafeInteger(frameHeight)
    || frameWidth < 1
    || frameHeight < 1
    || !Number.isFinite(worldBounds.minX)
    || !Number.isFinite(worldBounds.minY)
    || !(Number.isFinite(worldBounds.width) && worldBounds.width > 0)
    || !(Number.isFinite(worldBounds.height) && worldBounds.height > 0)
  ) return null;
  const scaleX = frameWidth / worldBounds.width;
  const scaleY = frameHeight / worldBounds.height;
  const left = Math.min(op.dx, op.dx + op.dw);
  const top = Math.min(op.dy, op.dy + op.dh);
  const right = Math.max(op.dx, op.dx + op.dw);
  const bottom = Math.max(op.dy, op.dy + op.dh);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  const frameX = Math.max(0, Math.floor((left - worldBounds.minX) * scaleX));
  const frameY = Math.max(0, Math.floor((top - worldBounds.minY) * scaleY));
  const frameRight = Math.min(frameWidth, Math.ceil((right - worldBounds.minX) * scaleX));
  const frameBottom = Math.min(frameHeight, Math.ceil((bottom - worldBounds.minY) * scaleY));
  const width = frameRight - frameX;
  const height = frameBottom - frameY;
  if (width <= 0 || height <= 0) return null;
  return {
    frameX,
    frameY,
    width,
    height,
    worldBounds: {
      minX: worldBounds.minX + (frameX / scaleX),
      minY: worldBounds.minY + (frameY / scaleY),
      width: width / scaleX,
      height: height / scaleY,
    },
  };
}

export async function generateWarpedPredrawnRaster(input: {
  src: string;
  registration: PredrawnBoardCornerRegistration;
  cells: readonly { x: number; y: number }[];
  environmentGeometrySha256: string;
}): Promise<GeneratedPredrawnRaster> {
  const image = await loadDecodedImage(input.src);
  if (image.naturalWidth < 1 || image.naturalHeight < 1) {
    throw new Error('The source background has no decodable pixels.');
  }
  const transform = predrawnBoardRasterTransform({
    frameWidth: image.naturalWidth,
    frameHeight: image.naturalHeight,
  }, input.cells, input.registration);
  if (!transform) throw new Error('The saved grid does not define a valid background transform.');
  const bounds = predrawnBoardRasterBounds(transform);
  if (!bounds) throw new Error('The transformed background has no valid output bounds.');
  const viewport = integerPredrawnRasterViewport(bounds);
  assertPredrawnRasterDimensions(viewport.pixelWidth, viewport.pixelHeight, { deterministicPng: true });
  const source = decodedImagePixels(image);
  const output = rasterizePredrawnBoardPixels({
    width: source.width,
    height: source.height,
    data: source.data,
  }, transform, viewport);
  return {
    blob: deterministicPngBlob(viewport.pixelWidth, viewport.pixelHeight, output),
    frameWidth: viewport.pixelWidth,
    frameHeight: viewport.pixelHeight,
    worldBounds: {
      minX: viewport.minX,
      minY: viewport.minY,
      width: viewport.width,
      height: viewport.height,
    },
    operation: {
      kind: 'grid-warp-v1',
      registration: serializePredrawnBoardPreviewRegistration(input.registration),
      sourceWidth: source.width,
      sourceHeight: source.height,
      rasterScale: 1,
      encoder: PREDRAWN_PNG_ENCODER,
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySha256: input.environmentGeometrySha256,
      environmentGeometrySchema: PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
    },
  };
}

/**
 * Emit one persisted, reviewable depth mask aligned to an exact background version. RGB stores
 * signed half-depth and alpha stores the canonical occluder silhouette. Runtime compares that
 * depth with each live unit instead of treating every foreground pixel as universally in front.
 */
export async function generatePredrawnOcclusionDepthRaster(input: {
  board: EditorBoard;
  sourceSrc: string;
  frameWidth: number;
  frameHeight: number;
  worldBounds: PredrawnBoardWorldBounds;
  sourceBackgroundVersionId: string;
}): Promise<GeneratedPredrawnRaster> {
  assertPredrawnRasterDimensions(input.frameWidth, input.frameHeight, { deterministicPng: true });
  const sourceImage = await loadDecodedImage(input.sourceSrc);
  if (
    sourceImage.naturalWidth !== input.frameWidth
    || sourceImage.naturalHeight !== input.frameHeight
  ) throw new Error('The selected background dimensions changed before mask generation.');
  const maskOps = predrawnOcclusionMaskOps(input.board);
  const environmentGeometrySha256 = await predrawnEnvironmentGeometrySha256(input.board);
  const sources = [...new Set(maskOps.map((op) => op.src))];
  const images = await loadDecodedImageMap(sources);
  const scratch = document.createElement('canvas');
  scratch.width = 1;
  scratch.height = 1;
  const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
  if (!scratchContext) throw new Error('The browser could not create an occlusion-mask workspace.');
  const scaleX = input.frameWidth / input.worldBounds.width;
  const scaleY = input.frameHeight / input.worldBounds.height;
  const output = new Uint8ClampedArray(input.frameWidth * input.frameHeight * 4);
  // predrawnOcclusionMaskOps is stable-sorted from back to front. Later nontransparent pixels
  // therefore replace earlier depth/alpha exactly, including equal-depth painter-order ties.
  for (const op of maskOps) {
    const region = predrawnOcclusionRasterRegion(
      op,
      input.frameWidth,
      input.frameHeight,
      input.worldBounds,
    );
    if (!region) continue;
    if (scratch.width < region.width) scratch.width = region.width;
    if (scratch.height < region.height) scratch.height = region.height;
    scratchContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    drawBoardOps(scratchContext, [op], region.worldBounds, images, 0);
    scratchContext.resetTransform();
    const pixels = scratchContext.getImageData(0, 0, region.width, region.height).data;
    const [red, green, blue] = encodePredrawnOcclusionDepth(op.z);
    for (let y = 0; y < region.height; y += 1) {
      let sourceOffset = y * region.width * 4;
      let outputOffset = (((region.frameY + y) * input.frameWidth) + region.frameX) * 4;
      for (let x = 0; x < region.width; x += 1) {
        const alpha = pixels[sourceOffset + 3];
        if (alpha !== 0) {
          output[outputOffset] = red;
          output[outputOffset + 1] = green;
          output[outputOffset + 2] = blue;
          output[outputOffset + 3] = alpha;
        }
        sourceOffset += 4;
        outputOffset += 4;
      }
    }
  }
  return {
    blob: deterministicPngBlob(input.frameWidth, input.frameHeight, output),
    frameWidth: input.frameWidth,
    frameHeight: input.frameHeight,
    worldBounds: { ...input.worldBounds },
    operation: {
      kind: 'occlusion-depth-v1',
      encoding: 'rgb24-signed-half-depth-alpha',
      sourceBackgroundVersionId: input.sourceBackgroundVersionId,
      maskCount: maskOps.length,
      encoder: PREDRAWN_PNG_ENCODER,
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySha256,
      environmentGeometrySchema: PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
    },
  };
}

export async function sourcePngBlob(src: string): Promise<{ blob: Blob; width: number; height: number }> {
  const response = await fetch(src, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`The generated background could not be loaded (${response.status}).`);
  const blob = await response.blob();
  const dimensions = await assertDecodablePngBlob(blob);
  return { blob, width: dimensions.width, height: dimensions.height };
}

/**
 * Decode an upload candidate without admitting its short-lived Blob URL to the shared immutable
 * image cache. Chromium's ImageBitmap path needs no URL at all and is explicitly released after
 * validation. The Image fallback likewise owns and revokes its URL inside this single call.
 */
async function decodePngBlobOnce(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.decoding = 'async';
      image.onload = () => {
        const finish = () => resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        const decoded = image.decode?.();
        if (decoded) decoded.then(finish, reject);
        else finish();
      };
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

export async function assertDecodablePngBlob(blob: Blob): Promise<{ width: number; height: number }> {
  if (blob.type !== 'image/png') throw new Error('Raw backgrounds must be PNG files.');
  if (blob.size > PREDRAWN_MAX_PNG_BYTES) throw new Error('Raw background PNGs cannot exceed 32 MiB.');
  const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const signature = PNG_SIGNATURE;
  if (
    header.length < 24
    || signature.some((byte, index) => header[index] !== byte)
    || String.fromCharCode(...header.subarray(12, 16)) !== 'IHDR'
  ) throw new Error('The selected file does not have a valid PNG header.');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const headerWidth = view.getUint32(16);
  const headerHeight = view.getUint32(20);
  assertPredrawnRasterDimensions(headerWidth, headerHeight);
  try {
    const decoded = await decodePngBlobOnce(blob);
    if (decoded.width !== headerWidth || decoded.height !== headerHeight) {
      throw new Error('The decoded PNG dimensions do not match its header.');
    }
    return decoded;
  } catch {
    throw new Error('The selected file is not a decodable PNG image.');
  }
}
