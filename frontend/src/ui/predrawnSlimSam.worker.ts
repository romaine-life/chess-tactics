/// <reference lib="webworker" />

import {
  AutoProcessor,
  RawImage,
  SamModel,
  Tensor,
  type ProgressInfo,
} from '@huggingface/transformers';
import {
  PREDRAWN_SLIMSAM_MODEL_ID,
  PREDRAWN_SLIMSAM_MODEL_REVISION,
  PredrawnSlimSamError,
  createPredrawnSlimSamMaskCandidates,
  type PredrawnSlimSamBackend,
  type PredrawnSlimSamErrorCode,
  type PredrawnSlimSamPoint,
  type PredrawnSlimSamPreparedImage,
  type PredrawnSlimSamProgress,
  type PredrawnSlimSamResultTransfer,
  type PredrawnSlimSamWorkerRequest,
  type PredrawnSlimSamWorkerResponse,
  resolvePredrawnSlimSamImageUrl,
  validatePredrawnSlimSamPoints,
  validatePredrawnSlimSamPrepareRequest,
} from './predrawnSlimSamProtocol';

interface SamProcessedImage {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}

interface SamEmbeddings {
  image_embeddings: Tensor;
  image_positional_embeddings: Tensor;
}

type SamProcessorRuntime =
  Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>
  & {
    (image: RawImage): Promise<SamProcessedImage>;
    post_process_masks(
      masks: Tensor,
      originalSizes: [number, number][],
      reshapedInputSizes: [number, number][],
    ): Promise<Tensor[]>;
  };

interface PreparedState {
  imageId: string;
  imageUrl: string;
  width: number;
  height: number;
  rawImage: RawImage;
  processed: SamProcessedImage;
  embeddings: SamEmbeddings;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<PredrawnSlimSamWorkerRequest>) => void) | null;
  postMessage(message: PredrawnSlimSamWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as WorkerScope;

let processor: SamProcessorRuntime | null = null;
let model: SamModel | null = null;
let backend: PredrawnSlimSamBackend | null = null;
let prepared: PreparedState | null = null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function post(message: PredrawnSlimSamWorkerResponse, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer);
}

function postProgress(
  requestId: number,
  progress: PredrawnSlimSamProgress,
): void {
  post({ type: 'progress', requestId, progress });
}

function postOperationProgress(
  requestId: number,
  stage: PredrawnSlimSamProgress['stage'],
  currentBackend: PredrawnSlimSamBackend,
  completed: number,
  total: number,
  message: string,
  file?: string,
): void {
  postProgress(requestId, {
    stage,
    completed,
    total,
    message,
    backend: currentBackend,
    ...(file ? { file } : {}),
  });
}

function postModelProgress(
  requestId: number,
  targetBackend: PredrawnSlimSamBackend,
  info: ProgressInfo,
): void {
  if (info.status === 'progress') {
    postOperationProgress(
      requestId,
      'downloading-model',
      targetBackend,
      info.loaded,
      info.total,
      `Downloading SlimSAM model data (${Math.round(info.progress)}%).`,
      info.file,
    );
    return;
  }
  if (info.status === 'done') {
    postOperationProgress(
      requestId,
      'downloading-model',
      targetBackend,
      1,
      1,
      `Cached ${info.file}.`,
      info.file,
    );
    return;
  }
  if (info.status === 'download' || info.status === 'initiate') {
    postOperationProgress(
      requestId,
      'downloading-model',
      targetBackend,
      0,
      1,
      `Loading ${info.file}.`,
      info.file,
    );
  }
}

async function loadProcessor(
  requestId: number,
  targetBackend: PredrawnSlimSamBackend,
): Promise<void> {
  if (processor) return;
  processor = await AutoProcessor.from_pretrained(PREDRAWN_SLIMSAM_MODEL_ID, {
    revision: PREDRAWN_SLIMSAM_MODEL_REVISION,
    progress_callback: (info: ProgressInfo) => postModelProgress(requestId, targetBackend, info),
  }) as SamProcessorRuntime;
}

async function loadRuntime(
  requestId: number,
  targetBackend: PredrawnSlimSamBackend,
): Promise<void> {
  postOperationProgress(
    requestId,
    'loading-model',
    targetBackend,
    0,
    1,
    targetBackend === 'webgpu'
      ? 'Loading SlimSAM on this browser’s GPU.'
      : 'Loading SlimSAM on the CPU fallback.',
  );
  await loadProcessor(requestId, targetBackend);
  model = await SamModel.from_pretrained(PREDRAWN_SLIMSAM_MODEL_ID, {
    revision: PREDRAWN_SLIMSAM_MODEL_REVISION,
    device: targetBackend,
    dtype: targetBackend === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: (info: ProgressInfo) => postModelProgress(requestId, targetBackend, info),
  }) as SamModel;
  backend = targetBackend;
  postOperationProgress(
    requestId,
    'loading-model',
    targetBackend,
    1,
    1,
    targetBackend === 'webgpu'
      ? 'SlimSAM is ready on the browser GPU.'
      : 'SlimSAM is ready on the CPU fallback.',
  );
}

function webGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function switchToWasm(
  requestId: number,
  webGpuFailure: unknown,
): Promise<void> {
  const reason = describeError(webGpuFailure);
  postOperationProgress(
    requestId,
    'webgpu-fallback',
    'wasm',
    0,
    1,
    `Browser GPU segmentation failed (${reason}). Retrying locally on the CPU.`,
  );
  if (model) {
    try {
      await model.dispose();
    } catch {
      // The failed GPU runtime is being abandoned regardless.
    }
  }
  model = null;
  backend = null;
  try {
    await loadRuntime(requestId, 'wasm');
  } catch (wasmFailure) {
    throw new PredrawnSlimSamError(
      'model-unavailable',
      `SlimSAM could not start on the browser GPU (${reason}) or CPU (${describeError(wasmFailure)}).`,
    );
  }
}

async function ensureRuntime(requestId: number): Promise<void> {
  if (model && backend) return;
  if (!webGpuAvailable()) {
    postOperationProgress(
      requestId,
      'webgpu-fallback',
      'wasm',
      0,
      1,
      'WebGPU is unavailable in this browser worker. Using the local CPU fallback.',
    );
    try {
      await loadRuntime(requestId, 'wasm');
    } catch (error) {
      throw new PredrawnSlimSamError(
        'model-unavailable',
        `SlimSAM could not start on the CPU fallback (${describeError(error)}).`,
      );
    }
    return;
  }
  try {
    await loadRuntime(requestId, 'webgpu');
  } catch (error) {
    await switchToWasm(requestId, error);
  }
}

async function fetchRawImage(
  requestId: number,
  imageUrl: string,
): Promise<RawImage> {
  postOperationProgress(
    requestId,
    'loading-image',
    backend ?? 'webgpu',
    0,
    1,
    'Loading the exact warped artwork.',
  );
  let response: Response;
  try {
    response = await fetch(resolvePredrawnSlimSamImageUrl(
      imageUrl,
      self.location.href,
    ), {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch (error) {
    throw new PredrawnSlimSamError(
      'image-load-failed',
      `The exact warped artwork could not be loaded (${describeError(error)}).`,
    );
  }
  if (!response.ok) {
    throw new PredrawnSlimSamError(
      'image-load-failed',
      `The exact warped artwork could not be loaded (${response.status}).`,
    );
  }
  try {
    const image = await RawImage.fromBlob(await response.blob());
    postOperationProgress(
      requestId,
      'loading-image',
      backend ?? 'webgpu',
      1,
      1,
      'The exact warped artwork is loaded.',
    );
    return image;
  } catch (error) {
    throw new PredrawnSlimSamError(
      'image-load-failed',
      `The stored warped artwork is not a decodable image (${describeError(error)}).`,
    );
  }
}

async function encodeImage(
  requestId: number,
  source: Omit<PreparedState, 'processed' | 'embeddings'>,
): Promise<PreparedState> {
  if (!processor || !model || !backend) {
    throw new PredrawnSlimSamError('model-unavailable', 'SlimSAM is not loaded.');
  }
  postOperationProgress(
    requestId,
    'encoding-image',
    backend,
    0,
    1,
    'Encoding this artwork once for interactive selection.',
  );
  const processed = await processor(source.rawImage) as SamProcessedImage;
  const embeddings = await model.get_image_embeddings({
    pixel_values: processed.pixel_values,
  });
  postOperationProgress(
    requestId,
    'encoding-image',
    backend,
    1,
    1,
    'Artwork encoding is ready. Include and exclude clicks now reuse it.',
  );
  return { ...source, processed, embeddings };
}

async function encodeWithFallback(
  requestId: number,
  source: Omit<PreparedState, 'processed' | 'embeddings'>,
): Promise<PreparedState> {
  try {
    return await encodeImage(requestId, source);
  } catch (error) {
    if (backend !== 'webgpu') {
      throw new PredrawnSlimSamError(
        'inference-failed',
        `SlimSAM could not encode this artwork (${describeError(error)}).`,
      );
    }
    await switchToWasm(requestId, error);
    try {
      return await encodeImage(requestId, source);
    } catch (wasmFailure) {
      throw new PredrawnSlimSamError(
        'inference-failed',
        `SlimSAM could not encode this artwork on the CPU fallback (${describeError(wasmFailure)}).`,
      );
    }
  }
}

function preparedResult(state: PreparedState): PredrawnSlimSamPreparedImage {
  if (!backend) {
    throw new PredrawnSlimSamError('model-unavailable', 'SlimSAM is not loaded.');
  }
  return {
    imageId: state.imageId,
    width: state.width,
    height: state.height,
    backend,
    modelId: PREDRAWN_SLIMSAM_MODEL_ID,
    modelRevision: PREDRAWN_SLIMSAM_MODEL_REVISION,
  };
}

async function prepareImage(
  request: Extract<PredrawnSlimSamWorkerRequest, { type: 'prepare' }>,
): Promise<PredrawnSlimSamPreparedImage> {
  validatePredrawnSlimSamPrepareRequest(request);
  if (
    prepared
    && prepared.imageId === request.imageId
    && prepared.width === request.width
    && prepared.height === request.height
  ) {
    return preparedResult(prepared);
  }

  prepared = null;
  const rawImage = await fetchRawImage(request.requestId, request.imageUrl);
  if (rawImage.width !== request.width || rawImage.height !== request.height) {
    throw new PredrawnSlimSamError(
      'image-dimension-mismatch',
      `The stored artwork decoded as ${rawImage.width}×${rawImage.height}, but its immutable metadata says ${request.width}×${request.height}.`,
    );
  }
  await ensureRuntime(request.requestId);
  prepared = await encodeWithFallback(request.requestId, {
    imageId: request.imageId,
    imageUrl: request.imageUrl,
    width: request.width,
    height: request.height,
    rawImage,
  });
  return preparedResult(prepared);
}

async function decodeMask(
  requestId: number,
  state: PreparedState,
  points: readonly PredrawnSlimSamPoint[],
): Promise<PredrawnSlimSamResultTransfer> {
  if (!processor || !model || !backend) {
    throw new PredrawnSlimSamError('model-unavailable', 'SlimSAM is not loaded.');
  }
  const [reshapedHeight, reshapedWidth] = state.processed.reshaped_input_sizes[0];
  const pointValues = new Float32Array(points.length * 2);
  const labelValues = new BigInt64Array(points.length);
  points.forEach((point, index) => {
    pointValues[index * 2] = point.x * reshapedWidth / state.width;
    pointValues[index * 2 + 1] = point.y * reshapedHeight / state.height;
    labelValues[index] = point.label === 'positive' ? 1n : 0n;
  });

  postOperationProgress(
    requestId,
    'predicting-mask',
    backend,
    0,
    1,
    'Updating three mask candidates from your include and exclude points.',
  );
  const inputPoints = new Tensor('float32', pointValues, [1, 1, points.length, 2]);
  const inputLabels = new Tensor('int64', labelValues, [1, 1, points.length]);
  const output = await model({
    ...state.embeddings,
    input_points: inputPoints,
    input_labels: inputLabels,
  });
  const masks = await processor.post_process_masks(
    output.pred_masks,
    state.processed.original_sizes,
    state.processed.reshaped_input_sizes,
  ) as Tensor[];
  const built = createPredrawnSlimSamMaskCandidates(
    masks[0],
    output.iou_scores.data as ArrayLike<number>,
    state.width,
    state.height,
  );
  postOperationProgress(
    requestId,
    'predicting-mask',
    backend,
    1,
    1,
    'Three native-size mask candidates are ready.',
  );

  return {
    imageId: state.imageId,
    width: state.width,
    height: state.height,
    backend,
    modelId: PREDRAWN_SLIMSAM_MODEL_ID,
    modelRevision: PREDRAWN_SLIMSAM_MODEL_REVISION,
    candidates: built.candidates.map((candidate) => ({
      index: candidate.index,
      score: candidate.score,
      alphaBuffer: candidate.alpha.buffer as ArrayBuffer,
    })),
    recommendedIndex: built.recommendedIndex,
  };
}

async function segmentImage(
  request: Extract<PredrawnSlimSamWorkerRequest, { type: 'segment' }>,
): Promise<PredrawnSlimSamResultTransfer> {
  if (!prepared || prepared.imageId !== request.imageId) {
    throw new PredrawnSlimSamError(
      'not-prepared',
      'The requested artwork is not the exact raster currently encoded by SlimSAM.',
    );
  }
  validatePredrawnSlimSamPoints(request.points, prepared.width, prepared.height);
  try {
    return await decodeMask(request.requestId, prepared, request.points);
  } catch (error) {
    if (backend !== 'webgpu') {
      throw new PredrawnSlimSamError(
        'inference-failed',
        `SlimSAM could not update the mask (${describeError(error)}).`,
      );
    }
    const source = {
      imageId: prepared.imageId,
      imageUrl: prepared.imageUrl,
      width: prepared.width,
      height: prepared.height,
      rawImage: prepared.rawImage,
    };
    await switchToWasm(request.requestId, error);
    prepared = await encodeImage(request.requestId, source);
    try {
      return await decodeMask(request.requestId, prepared, request.points);
    } catch (wasmFailure) {
      throw new PredrawnSlimSamError(
        'inference-failed',
        `SlimSAM could not update the mask on the CPU fallback (${describeError(wasmFailure)}).`,
      );
    }
  }
}

async function handle(request: PredrawnSlimSamWorkerRequest): Promise<void> {
  try {
    if (request.type === 'prepare') {
      post({
        type: 'prepared',
        requestId: request.requestId,
        prepared: await prepareImage(request),
      });
      return;
    }

    const result = await segmentImage(request);
    post({
      type: 'segmented',
      requestId: request.requestId,
      result,
    }, result.candidates.map((candidate) => candidate.alphaBuffer));
  } catch (error) {
    const code: PredrawnSlimSamErrorCode = error instanceof PredrawnSlimSamError
      ? error.code
      : request.type === 'prepare'
        ? 'model-unavailable'
        : 'inference-failed';
    post({
      type: 'error',
      requestId: request.requestId,
      code,
      message: describeError(error),
    });
  }
}

let operationQueue = Promise.resolve();
workerScope.onmessage = (event): void => {
  operationQueue = operationQueue.then(() => handle(event.data));
};
