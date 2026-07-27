import {
  PredrawnSlimSamError,
  type PredrawnSlimSamErrorCode,
  type PredrawnSlimSamPrepareRequest,
  type PredrawnSlimSamPreparedImage,
  type PredrawnSlimSamProgress,
  type PredrawnSlimSamResult,
  type PredrawnSlimSamSegmentRequest,
  type PredrawnSlimSamWorkerRequest,
  type PredrawnSlimSamWorkerResponse,
  validatePredrawnSlimSamPoints,
  validatePredrawnSlimSamPrepareRequest,
} from './predrawnSlimSamProtocol';

export {
  PREDRAWN_SLIMSAM_CANDIDATE_COUNT,
  PREDRAWN_SLIMSAM_MODEL_ID,
  PREDRAWN_SLIMSAM_MODEL_REVISION,
  PredrawnSlimSamError,
} from './predrawnSlimSamProtocol';
export type {
  PredrawnSlimSamBackend,
  PredrawnSlimSamErrorCode,
  PredrawnSlimSamMaskCandidate,
  PredrawnSlimSamPoint,
  PredrawnSlimSamPointLabel,
  PredrawnSlimSamPrepareRequest,
  PredrawnSlimSamPreparedImage,
  PredrawnSlimSamProgress,
  PredrawnSlimSamProgressStage,
  PredrawnSlimSamResult,
  PredrawnSlimSamSegmentRequest,
} from './predrawnSlimSamProtocol';

export interface PredrawnSlimSamClient {
  /**
   * Loads and encodes one exact raster off the main thread. Re-preparing the same
   * image identity and dimensions reuses its existing image embedding.
   */
  prepare(request: PredrawnSlimSamPrepareRequest): Promise<PredrawnSlimSamPreparedImage>;
  /**
   * Runs only the lightweight prompt decoder against the prepared embedding.
   * All coordinates are native source-image pixels.
   */
  segment(request: PredrawnSlimSamSegmentRequest): Promise<PredrawnSlimSamResult>;
  /** Terminates the worker and releases its model and image embedding. */
  dispose(): void;
}

export interface PredrawnSlimSamWorkerLike {
  onmessage: ((event: MessageEvent<PredrawnSlimSamWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PredrawnSlimSamWorkerRequest): void;
  terminate(): void;
}

interface PredrawnSlimSamClientOptions {
  workerFactory?: () => PredrawnSlimSamWorkerLike;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  onProgress?: (progress: PredrawnSlimSamProgress) => void;
  removeAbortListener: () => void;
}

function abortError(): PredrawnSlimSamError {
  return new PredrawnSlimSamError('cancelled', 'SlimSAM segmentation was cancelled.');
}

function normalizeErrorCode(value: string): PredrawnSlimSamErrorCode {
  const allowed: readonly PredrawnSlimSamErrorCode[] = [
    'worker-unavailable',
    'worker-crashed',
    'model-unavailable',
    'image-load-failed',
    'image-dimension-mismatch',
    'not-prepared',
    'invalid-points',
    'inference-failed',
    'cancelled',
    'disposed',
  ];
  return allowed.includes(value as PredrawnSlimSamErrorCode)
    ? value as PredrawnSlimSamErrorCode
    : 'worker-crashed';
}

function defaultWorkerFactory(): PredrawnSlimSamWorkerLike {
  if (typeof Worker === 'undefined') {
    throw new PredrawnSlimSamError(
      'worker-unavailable',
      'This browser cannot start the off-thread SlimSAM segmentation worker.',
    );
  }
  return new Worker(new URL('./predrawnSlimSam.worker.ts', import.meta.url), {
    type: 'module',
    name: 'predrawn-slimsam',
  });
}

class BrowserPredrawnSlimSamClient implements PredrawnSlimSamClient {
  private readonly workerFactory: () => PredrawnSlimSamWorkerLike;
  private worker: PredrawnSlimSamWorkerLike | null = null;
  private nextRequestId = 1;
  private disposed = false;
  private prepared: PredrawnSlimSamPreparedImage | null = null;
  private readonly pending = new Map<number, PendingRequest<unknown>>();

  constructor(options: PredrawnSlimSamClientOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
  }

  prepare(request: PredrawnSlimSamPrepareRequest): Promise<PredrawnSlimSamPreparedImage> {
    try {
      validatePredrawnSlimSamPrepareRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.send<PredrawnSlimSamPreparedImage>({
      type: 'prepare',
      requestId: this.nextRequestId++,
      imageId: request.imageId,
      imageUrl: request.imageUrl,
      width: request.width,
      height: request.height,
    }, request.signal, request.onProgress).then((prepared) => {
      this.prepared = prepared;
      return prepared;
    });
  }

  segment(request: PredrawnSlimSamSegmentRequest): Promise<PredrawnSlimSamResult> {
    if (!this.prepared) {
      return Promise.reject(new PredrawnSlimSamError(
        'not-prepared',
        'Prepare the exact warped artwork before asking SlimSAM for a mask.',
      ));
    }
    try {
      validatePredrawnSlimSamPoints(
        request.points,
        this.prepared.width,
        this.prepared.height,
      );
    } catch (error) {
      return Promise.reject(error);
    }
    return this.send<PredrawnSlimSamResult>({
      type: 'segment',
      requestId: this.nextRequestId++,
      imageId: this.prepared.imageId,
      points: request.points.map((point) => ({ ...point })),
    }, request.signal, request.onProgress);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.prepared = null;
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new PredrawnSlimSamError(
      'disposed',
      'The SlimSAM segmentation session was closed.',
    ));
  }

  private ensureWorker(): PredrawnSlimSamWorkerLike {
    if (this.disposed) {
      throw new PredrawnSlimSamError('disposed', 'The SlimSAM segmentation session was closed.');
    }
    if (this.worker) return this.worker;
    try {
      const worker = this.workerFactory();
      worker.onmessage = (event) => this.receive(event.data);
      worker.onerror = (event) => {
        const message = event.message?.trim() || 'The SlimSAM worker crashed.';
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        this.prepared = null;
        this.rejectAll(new PredrawnSlimSamError('worker-crashed', message));
      };
      this.worker = worker;
      return worker;
    } catch (error) {
      if (error instanceof PredrawnSlimSamError) throw error;
      throw new PredrawnSlimSamError(
        'worker-unavailable',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private send<T>(
    message: PredrawnSlimSamWorkerRequest,
    signal?: AbortSignal,
    onProgress?: (progress: PredrawnSlimSamProgress) => void,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    let worker: PredrawnSlimSamWorkerLike;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        const entry = this.pending.get(message.requestId);
        if (!entry) return;
        this.pending.delete(message.requestId);
        entry.removeAbortListener();
        reject(abortError());
      };
      const removeAbortListener = (): void => signal?.removeEventListener('abort', onAbort);
      this.pending.set(message.requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
        removeAbortListener,
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        worker.postMessage(message);
      } catch (error) {
        this.pending.delete(message.requestId);
        removeAbortListener();
        reject(new PredrawnSlimSamError(
          'worker-crashed',
          error instanceof Error ? error.message : String(error),
        ));
      }
    });
  }

  private receive(message: PredrawnSlimSamWorkerResponse): void {
    const entry = this.pending.get(message.requestId);
    if (!entry) return;
    if (message.type === 'progress') {
      try {
        entry.onProgress?.(message.progress);
      } catch {
        // Reporting progress must never abort model loading or inference.
      }
      return;
    }

    this.pending.delete(message.requestId);
    entry.removeAbortListener();
    if (message.type === 'error') {
      entry.reject(new PredrawnSlimSamError(
        normalizeErrorCode(message.code),
        message.message,
      ));
      return;
    }
    if (message.type === 'prepared') {
      entry.resolve(message.prepared);
      return;
    }
    entry.resolve({
      ...message.result,
      candidates: message.result.candidates.map((candidate) => ({
        index: candidate.index,
        score: candidate.score,
        alpha: new Uint8Array(candidate.alphaBuffer),
      })),
    } satisfies PredrawnSlimSamResult);
  }

  private rejectAll(error: PredrawnSlimSamError): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      entry.removeAbortListener();
      entry.reject(error);
    }
  }
}

export function createPredrawnSlimSamClient(
  options: PredrawnSlimSamClientOptions = {},
): PredrawnSlimSamClient {
  return new BrowserPredrawnSlimSamClient(options);
}
