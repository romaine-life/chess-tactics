import { describe, expect, it, vi } from 'vitest';
import {
  PREDRAWN_SLIMSAM_MODEL_ID,
  PREDRAWN_SLIMSAM_MODEL_REVISION,
  PredrawnSlimSamError,
  createPredrawnSlimSamClient,
  type PredrawnSlimSamPreparedImage,
  type PredrawnSlimSamWorkerLike,
} from './predrawnSlimSamClient';
import type {
  PredrawnSlimSamWorkerRequest,
  PredrawnSlimSamWorkerResponse,
} from './predrawnSlimSamProtocol';

const PREPARED: PredrawnSlimSamPreparedImage = {
  imageId: 'warp-version-1',
  width: 3,
  height: 2,
  backend: 'webgpu',
  modelId: PREDRAWN_SLIMSAM_MODEL_ID,
  modelRevision: PREDRAWN_SLIMSAM_MODEL_REVISION,
};

class FakeSlimSamWorker implements PredrawnSlimSamWorkerLike {
  onmessage: ((event: MessageEvent<PredrawnSlimSamWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: PredrawnSlimSamWorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage(message: PredrawnSlimSamWorkerRequest): void {
    this.posted.push(message);
  }

  emit(message: PredrawnSlimSamWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<PredrawnSlimSamWorkerResponse>);
  }
}

async function preparedClient(): Promise<{
  client: ReturnType<typeof createPredrawnSlimSamClient>;
  worker: FakeSlimSamWorker;
}> {
  const worker = new FakeSlimSamWorker();
  const client = createPredrawnSlimSamClient({ workerFactory: () => worker });
  const preparing = client.prepare({
    imageId: PREPARED.imageId,
    imageUrl: '/api/background-versions/warp-version-1/content',
    width: PREPARED.width,
    height: PREPARED.height,
  });
  worker.emit({ type: 'prepared', requestId: 1, prepared: PREPARED });
  await preparing;
  return { client, worker };
}

describe('browser SlimSAM worker client', () => {
  it('rejects invalid immutable dimensions before starting a worker', async () => {
    const factory = vi.fn(() => new FakeSlimSamWorker());
    const client = createPredrawnSlimSamClient({ workerFactory: factory });
    await expect(client.prepare({
      imageId: PREPARED.imageId,
      imageUrl: '/api/background-versions/warp-version-1/content',
      width: 0,
      height: PREPARED.height,
    })).rejects.toMatchObject({ code: 'image-dimension-mismatch' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('starts the worker lazily and forwards simple model progress', async () => {
    const worker = new FakeSlimSamWorker();
    const factory = vi.fn(() => worker);
    const onProgress = vi.fn();
    const client = createPredrawnSlimSamClient({ workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();

    const preparing = client.prepare({
      imageId: PREPARED.imageId,
      imageUrl: '/api/background-versions/warp-version-1/content',
      width: PREPARED.width,
      height: PREPARED.height,
      onProgress,
    });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(worker.posted).toEqual([{
      type: 'prepare',
      requestId: 1,
      imageId: PREPARED.imageId,
      imageUrl: '/api/background-versions/warp-version-1/content',
      width: 3,
      height: 2,
    }]);

    worker.emit({
      type: 'progress',
      requestId: 1,
      progress: {
        stage: 'downloading-model',
        completed: 5,
        total: 10,
        message: 'Downloading SlimSAM model data (50%).',
        backend: 'webgpu',
        file: 'vision_encoder_fp16.onnx',
      },
    });
    worker.emit({ type: 'prepared', requestId: 1, prepared: PREPARED });

    await expect(preparing).resolves.toEqual(PREPARED);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'downloading-model',
      completed: 5,
      total: 10,
      backend: 'webgpu',
    }));
  });

  it('returns all native mask planes and their scores without copying model identity away', async () => {
    const { client, worker } = await preparedClient();
    const segmenting = client.segment({
      points: [
        { x: 1, y: 1, label: 'positive' },
        { x: 2.5, y: 0.5, label: 'negative' },
      ],
    });
    expect(worker.posted[1]).toEqual({
      type: 'segment',
      requestId: 2,
      imageId: PREPARED.imageId,
      points: [
        { x: 1, y: 1, label: 'positive' },
        { x: 2.5, y: 0.5, label: 'negative' },
      ],
    });

    const candidateBytes = [
      new Uint8Array([0, 255, 0, 255, 0, 255]),
      new Uint8Array([255, 255, 0, 0, 255, 0]),
      new Uint8Array([0, 0, 255, 255, 255, 255]),
    ];
    worker.emit({
      type: 'segmented',
      requestId: 2,
      result: {
        ...PREPARED,
        candidates: candidateBytes.map((alpha, index) => ({
          index,
          score: [0.25, 0.91, 0.6][index],
          alphaBuffer: alpha.buffer,
        })),
        recommendedIndex: 1,
      },
    });

    const result = await segmenting;
    expect(result).toMatchObject({
      ...PREPARED,
      recommendedIndex: 1,
      candidates: [
        { index: 0, score: 0.25 },
        { index: 1, score: 0.91 },
        { index: 2, score: 0.6 },
      ],
    });
    expect(result.candidates.map((candidate) => [...candidate.alpha])).toEqual(
      candidateBytes.map((alpha) => [...alpha]),
    );
  });

  it('logically cancels a request and ignores its eventual worker result', async () => {
    const { client, worker } = await preparedClient();
    const controller = new AbortController();
    const segmenting = client.segment({
      points: [{ x: 1, y: 1, label: 'positive' }],
      signal: controller.signal,
    });
    controller.abort();
    await expect(segmenting).rejects.toMatchObject({
      name: 'PredrawnSlimSamError',
      code: 'cancelled',
    });

    worker.emit({
      type: 'error',
      requestId: 2,
      code: 'inference-failed',
      message: 'late result',
    });
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('preserves worker error codes instead of flattening fallback failures', async () => {
    const worker = new FakeSlimSamWorker();
    const client = createPredrawnSlimSamClient({ workerFactory: () => worker });
    const preparing = client.prepare({
      imageId: PREPARED.imageId,
      imageUrl: '/api/background-versions/warp-version-1/content',
      width: PREPARED.width,
      height: PREPARED.height,
    });
    worker.emit({
      type: 'error',
      requestId: 1,
      code: 'model-unavailable',
      message: 'SlimSAM could not start on the browser GPU or CPU.',
    });

    const error = await preparing.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PredrawnSlimSamError);
    expect(error).toMatchObject({ code: 'model-unavailable' });
    expect((error as Error).message).toMatch(/browser GPU or CPU/i);
  });
});
