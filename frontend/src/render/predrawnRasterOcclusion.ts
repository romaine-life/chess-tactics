import {
  CELL_DEPTH_STRIDE,
  OBJECT_DEPTH_OFFSET,
  TILE_STEP_Y,
  encodePredrawnOcclusionDepth,
  type EditorBoard,
  type PredrawnBoardWorldBounds,
} from '@chess-tactics/board-render';
import {
  PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
} from '@chess-tactics/board-render/render/predrawnOcclusion';
import {
  PREDRAWN_PNG_ENCODER,
  assertPredrawnRasterDimensions,
  encodeDeterministicRgbaPng,
  predrawnEnvironmentGeometrySha256,
  type GeneratedPredrawnRaster,
} from './predrawnBackgroundProcessing';

export const PREDRAWN_RASTER_SELECTION_PROCESSOR = 'owner-raster-selection-v1';
export const PREDRAWN_RASTER_SELECTION_DEPTH_ASSIGNMENT =
  'screen-column-bottom-envelope-v1';

export interface PredrawnRasterSelectionProvenance {
  modelId: string;
  modelRevision: string;
  backend: 'webgpu' | 'wasm' | 'manual';
  positivePointCount: number;
  negativePointCount: number;
  manualEditCount: number;
}

export interface PredrawnRasterSelectionDepthPixels {
  data: Uint8ClampedArray;
  componentCount: number;
  opaquePixelCount: number;
}

function assertSelectionAlpha(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): void {
  assertPredrawnRasterDimensions(width, height, { deterministicPng: true });
  if (alpha.length !== width * height) {
    throw new Error('Occlusion selection dimensions do not match its alpha pixels.');
  }
}

function selected(alpha: Uint8Array | Uint8ClampedArray, index: number): boolean {
  return alpha[index] > 0;
}

/**
 * Turn owner-approved raster pixels into the depth-aware format consumed by the board renderer.
 *
 * Each connected selection component derives a ground-contact envelope independently. For every
 * image column occupied by that component, its bottom-most selected pixel supplies the projected
 * board depth for all selected pixels above it. This keeps vertical scenery at its ground depth
 * while allowing a long diagonal fence to advance through depth along its painted base.
 */
export function predrawnRasterSelectionDepthPixels(input: {
  alpha: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  worldBounds: PredrawnBoardWorldBounds;
}): PredrawnRasterSelectionDepthPixels {
  const {
    alpha,
    width,
    height,
    worldBounds,
  } = input;
  assertSelectionAlpha(alpha, width, height);
  if (
    !Number.isFinite(worldBounds.minY)
    || !Number.isFinite(worldBounds.height)
    || worldBounds.height <= 0
  ) {
    throw new Error('Occlusion selection requires valid projected board bounds.');
  }

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const output = new Uint8ClampedArray(pixelCount * 4);
  const bottomByColumn = new Int32Array(width);
  const touchedColumns = new Uint32Array(width);
  bottomByColumn.fill(-1);

  const scaleY = height / worldBounds.height;
  let componentCount = 0;
  let opaquePixelCount = 0;

  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (visited[seed] || !selected(alpha, seed)) continue;
    componentCount += 1;
    let head = 0;
    let tail = 0;
    let touchedColumnCount = 0;
    queue[tail] = seed;
    tail += 1;
    visited[seed] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (bottomByColumn[x] < 0) {
        touchedColumns[touchedColumnCount] = x;
        touchedColumnCount += 1;
      }
      bottomByColumn[x] = Math.max(bottomByColumn[x], y);

      const minY = Math.max(0, y - 1);
      const maxY = Math.min(height - 1, y + 1);
      const minX = Math.max(0, x - 1);
      const maxX = Math.min(width - 1, x + 1);
      for (let neighborY = minY; neighborY <= maxY; neighborY += 1) {
        for (let neighborX = minX; neighborX <= maxX; neighborX += 1) {
          if (neighborX === x && neighborY === y) continue;
          const neighbor = (neighborY * width) + neighborX;
          if (visited[neighbor] || !selected(alpha, neighbor)) continue;
          visited[neighbor] = 1;
          queue[tail] = neighbor;
          tail += 1;
        }
      }
    }

    for (let componentIndex = 0; componentIndex < tail; componentIndex += 1) {
      const index = queue[componentIndex];
      const x = index % width;
      const baseY = bottomByColumn[x];
      const projectedTop = worldBounds.minY + ((baseY + 0.5) / scaleY);
      const depth = OBJECT_DEPTH_OFFSET
        + ((projectedTop / TILE_STEP_Y) * CELL_DEPTH_STRIDE);
      const [red, green, blue] = encodePredrawnOcclusionDepth(depth);
      const outputOffset = index * 4;
      output[outputOffset] = red;
      output[outputOffset + 1] = green;
      output[outputOffset + 2] = blue;
      output[outputOffset + 3] = alpha[index];
      opaquePixelCount += 1;
    }

    for (let touchedIndex = 0; touchedIndex < touchedColumnCount; touchedIndex += 1) {
      bottomByColumn[touchedColumns[touchedIndex]] = -1;
    }
  }

  return {
    data: output,
    componentCount,
    opaquePixelCount,
  };
}

async function sha256Bytes(bytes: Uint8Array | Uint8ClampedArray): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Materialize an immutable depth-mask child from exact owner-approved raster pixels.
 * The selected warped artwork supplies pixels; legacy sprite pixels are never sampled.
 */
export async function generatePredrawnRasterSelectionOcclusion(input: {
  board: EditorBoard;
  alpha: Uint8Array | Uint8ClampedArray;
  frameWidth: number;
  frameHeight: number;
  worldBounds: PredrawnBoardWorldBounds;
  sourceBackgroundVersionId: string;
  selection: PredrawnRasterSelectionProvenance;
}): Promise<GeneratedPredrawnRaster> {
  const generated = predrawnRasterSelectionDepthPixels({
    alpha: input.alpha,
    width: input.frameWidth,
    height: input.frameHeight,
    worldBounds: input.worldBounds,
  });
  const [environmentGeometrySha256, selectionAlphaSha256] = await Promise.all([
    predrawnEnvironmentGeometrySha256(input.board),
    sha256Bytes(input.alpha),
  ]);
  const png = encodeDeterministicRgbaPng(
    input.frameWidth,
    input.frameHeight,
    generated.data,
  );
  return {
    blob: new Blob([png.buffer], { type: 'image/png' }),
    frameWidth: input.frameWidth,
    frameHeight: input.frameHeight,
    worldBounds: { ...input.worldBounds },
    operation: {
      kind: 'occlusion-depth-v1',
      encoding: 'rgb24-signed-half-depth-alpha',
      sourceBackgroundVersionId: input.sourceBackgroundVersionId,
      maskCount: generated.componentCount,
      opaquePixelCount: generated.opaquePixelCount,
      encoder: PREDRAWN_PNG_ENCODER,
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySha256,
      environmentGeometrySchema: PREDRAWN_ENVIRONMENT_GEOMETRY_SCHEMA_V2,
      selection: {
        processor: PREDRAWN_RASTER_SELECTION_PROCESSOR,
        alphaSha256: selectionAlphaSha256,
        modelId: input.selection.modelId,
        modelRevision: input.selection.modelRevision,
        backend: input.selection.backend,
        positivePointCount: input.selection.positivePointCount,
        negativePointCount: input.selection.negativePointCount,
        manualEditCount: input.selection.manualEditCount,
      },
      depthAssignment: {
        processor: PREDRAWN_RASTER_SELECTION_DEPTH_ASSIGNMENT,
      },
    },
  };
}
