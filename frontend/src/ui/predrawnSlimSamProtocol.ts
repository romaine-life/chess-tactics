export const PREDRAWN_SLIMSAM_MODEL_ID = 'Xenova/slimsam-77-uniform';
export const PREDRAWN_SLIMSAM_MODEL_REVISION =
  '5850ab45f587c112167512ffef949107115e26a0';
export const PREDRAWN_SLIMSAM_CANDIDATE_COUNT = 3;

export type PredrawnSlimSamBackend = 'webgpu' | 'wasm';
export type PredrawnSlimSamPointLabel = 'positive' | 'negative';

export interface PredrawnSlimSamPoint {
  /** Native source-image pixel coordinate. */
  x: number;
  /** Native source-image pixel coordinate. */
  y: number;
  label: PredrawnSlimSamPointLabel;
}

export type PredrawnSlimSamProgressStage =
  | 'loading-model'
  | 'downloading-model'
  | 'webgpu-fallback'
  | 'loading-image'
  | 'encoding-image'
  | 'predicting-mask';

export interface PredrawnSlimSamProgress {
  stage: PredrawnSlimSamProgressStage;
  completed: number;
  total: number;
  message: string;
  backend: PredrawnSlimSamBackend;
  file?: string;
}

export interface PredrawnSlimSamPrepareRequest {
  /** Exact immutable raster identity (normally its background-version id or hash). */
  imageId: string;
  /** Authorized URL for that exact raster. */
  imageUrl: string;
  /** Expected native width from immutable version metadata. */
  width: number;
  /** Expected native height from immutable version metadata. */
  height: number;
  onProgress?: (progress: PredrawnSlimSamProgress) => void;
  signal?: AbortSignal;
}

export interface PredrawnSlimSamPreparedImage {
  imageId: string;
  width: number;
  height: number;
  backend: PredrawnSlimSamBackend;
  modelId: typeof PREDRAWN_SLIMSAM_MODEL_ID;
  modelRevision: typeof PREDRAWN_SLIMSAM_MODEL_REVISION;
}

export interface PredrawnSlimSamSegmentRequest {
  points: readonly PredrawnSlimSamPoint[];
  onProgress?: (progress: PredrawnSlimSamProgress) => void;
  signal?: AbortSignal;
}

export interface PredrawnSlimSamMaskCandidate {
  index: number;
  score: number;
  /** Native-size binary alpha: 0 is excluded, 255 is included. */
  alpha: Uint8Array;
}

export interface PredrawnSlimSamResult {
  imageId: string;
  width: number;
  height: number;
  backend: PredrawnSlimSamBackend;
  modelId: typeof PREDRAWN_SLIMSAM_MODEL_ID;
  modelRevision: typeof PREDRAWN_SLIMSAM_MODEL_REVISION;
  candidates: PredrawnSlimSamMaskCandidate[];
  recommendedIndex: number;
}

export type PredrawnSlimSamErrorCode =
  | 'worker-unavailable'
  | 'worker-crashed'
  | 'model-unavailable'
  | 'image-load-failed'
  | 'image-dimension-mismatch'
  | 'not-prepared'
  | 'invalid-points'
  | 'inference-failed'
  | 'cancelled'
  | 'disposed';

export class PredrawnSlimSamError extends Error {
  readonly code: PredrawnSlimSamErrorCode;

  constructor(code: PredrawnSlimSamErrorCode, message: string) {
    super(message);
    this.name = 'PredrawnSlimSamError';
    this.code = code;
  }
}

export interface PredrawnSlimSamPrepareWorkerRequest {
  type: 'prepare';
  requestId: number;
  imageId: string;
  imageUrl: string;
  width: number;
  height: number;
}

export interface PredrawnSlimSamSegmentWorkerRequest {
  type: 'segment';
  requestId: number;
  imageId: string;
  points: PredrawnSlimSamPoint[];
}

export type PredrawnSlimSamWorkerRequest =
  | PredrawnSlimSamPrepareWorkerRequest
  | PredrawnSlimSamSegmentWorkerRequest;

export interface PredrawnSlimSamProgressWorkerResponse {
  type: 'progress';
  requestId: number;
  progress: PredrawnSlimSamProgress;
}

export interface PredrawnSlimSamPreparedWorkerResponse {
  type: 'prepared';
  requestId: number;
  prepared: PredrawnSlimSamPreparedImage;
}

export interface PredrawnSlimSamMaskCandidateTransfer {
  index: number;
  score: number;
  alphaBuffer: ArrayBuffer;
}

export interface PredrawnSlimSamResultTransfer
  extends Omit<PredrawnSlimSamResult, 'candidates'> {
  candidates: PredrawnSlimSamMaskCandidateTransfer[];
}

export interface PredrawnSlimSamSegmentedWorkerResponse {
  type: 'segmented';
  requestId: number;
  result: PredrawnSlimSamResultTransfer;
}

export interface PredrawnSlimSamErrorWorkerResponse {
  type: 'error';
  requestId: number;
  code: PredrawnSlimSamErrorCode;
  message: string;
}

export type PredrawnSlimSamWorkerResponse =
  | PredrawnSlimSamProgressWorkerResponse
  | PredrawnSlimSamPreparedWorkerResponse
  | PredrawnSlimSamSegmentedWorkerResponse
  | PredrawnSlimSamErrorWorkerResponse;

interface MaskTensorLike {
  dims: readonly number[];
  data: ArrayLike<number | bigint | boolean>;
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function validatePredrawnSlimSamPrepareRequest(
  request: Pick<PredrawnSlimSamPrepareWorkerRequest, 'imageId' | 'imageUrl' | 'width' | 'height'>,
): void {
  if (!request.imageId.trim()) {
    throw new PredrawnSlimSamError('image-load-failed', 'The source raster has no immutable identity.');
  }
  if (!request.imageUrl.trim()) {
    throw new PredrawnSlimSamError('image-load-failed', 'The source raster has no content URL.');
  }
  if (!positiveInteger(request.width) || !positiveInteger(request.height)) {
    throw new PredrawnSlimSamError(
      'image-dimension-mismatch',
      `The source raster metadata has invalid dimensions ${request.width}×${request.height}.`,
    );
  }
}

export function resolvePredrawnSlimSamImageUrl(
  imageUrl: string,
  workerLocationHref: string,
): string {
  let source: URL;
  let workerLocation: URL;
  try {
    source = new URL(imageUrl, workerLocationHref);
    workerLocation = new URL(workerLocationHref);
  } catch {
    throw new PredrawnSlimSamError(
      'image-load-failed',
      'The exact warped artwork has an invalid content URL.',
    );
  }
  if (
    (workerLocation.protocol !== 'http:' && workerLocation.protocol !== 'https:')
    || source.origin !== workerLocation.origin
  ) {
    throw new PredrawnSlimSamError(
      'image-load-failed',
      'The segmentation worker accepts only same-origin warped artwork.',
    );
  }
  return source.href;
}

export function validatePredrawnSlimSamPoints(
  points: readonly PredrawnSlimSamPoint[],
  width: number,
  height: number,
): void {
  if (points.length === 0) {
    throw new PredrawnSlimSamError(
      'invalid-points',
      'Add at least one include or exclude point before asking for a mask.',
    );
  }
  if (points.length > 256) {
    throw new PredrawnSlimSamError(
      'invalid-points',
      'This selection has more than 256 prompt points. Remove old points before continuing.',
    );
  }
  for (const [index, point] of points.entries()) {
    if (
      !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || point.x < 0
      || point.y < 0
      || point.x >= width
      || point.y >= height
    ) {
      throw new PredrawnSlimSamError(
        'invalid-points',
        `Prompt point ${index + 1} is outside the ${width}×${height} source raster.`,
      );
    }
    if (point.label !== 'positive' && point.label !== 'negative') {
      throw new PredrawnSlimSamError(
        'invalid-points',
        `Prompt point ${index + 1} is neither an include nor an exclude point.`,
      );
    }
  }
}

/**
 * Converts SAM's post-processed [1, candidate, height, width] boolean tensor into
 * independent native-size 0/255 alpha planes. Keeping this conversion pure makes
 * the worker transport and native-coordinate guarantee directly testable.
 */
export function createPredrawnSlimSamMaskCandidates(
  masks: MaskTensorLike,
  rawScores: ArrayLike<number>,
  width: number,
  height: number,
): {
  candidates: PredrawnSlimSamMaskCandidate[];
  recommendedIndex: number;
} {
  const pixelCount = width * height;
  const dims = [...masks.dims];
  if (
    dims.length < 3
    || dims[dims.length - 2] !== height
    || dims[dims.length - 1] !== width
  ) {
    throw new PredrawnSlimSamError(
      'inference-failed',
      `SlimSAM returned ${dims.join('×') || 'unknown'} mask dimensions for a ${width}×${height} raster.`,
    );
  }

  const candidateCount = masks.data.length / pixelCount;
  if (
    !Number.isInteger(candidateCount)
    || candidateCount !== PREDRAWN_SLIMSAM_CANDIDATE_COUNT
    || rawScores.length !== PREDRAWN_SLIMSAM_CANDIDATE_COUNT
  ) {
    throw new PredrawnSlimSamError(
      'inference-failed',
      `SlimSAM must return exactly ${PREDRAWN_SLIMSAM_CANDIDATE_COUNT} mask candidates and scores.`,
    );
  }

  const candidates: PredrawnSlimSamMaskCandidate[] = [];
  let recommendedIndex = 0;
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const alpha = new Uint8Array(pixelCount);
    const candidateOffset = candidateIndex * pixelCount;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      alpha[pixelIndex] = masks.data[candidateOffset + pixelIndex] ? 255 : 0;
    }
    const score = Number(rawScores[candidateIndex]);
    if (!Number.isFinite(score)) {
      throw new PredrawnSlimSamError(
        'inference-failed',
        `SlimSAM candidate ${candidateIndex + 1} returned an invalid score.`,
      );
    }
    if (score > Number(rawScores[recommendedIndex])) recommendedIndex = candidateIndex;
    candidates.push({ index: candidateIndex, score, alpha });
  }

  return { candidates, recommendedIndex };
}
