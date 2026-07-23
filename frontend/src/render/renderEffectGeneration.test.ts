import { describe, expect, it, vi } from 'vitest';
import { createRenderEffectGeneration, settleRenderEffectGeneration } from './renderEffectGeneration';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function frameQueue() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    callbacks,
    request: (callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle: number) => { callbacks.delete(handle); },
    flush: () => {
      const current = [...callbacks.entries()];
      callbacks.clear();
      current.forEach(([, callback]) => callback(0));
    },
  };
}

describe('render effect generations', () => {
  it('drops a stale successful load and cancels its scheduled first-frame acknowledgement', async () => {
    const beforeSettle = deferred<string>();
    const queue = frameQueue();
    const staleLoad = vi.fn();
    const staleError = vi.fn();
    const staleGeneration = createRenderEffectGeneration(queue.request, queue.cancel);
    settleRenderEffectGeneration(staleGeneration, beforeSettle.promise, staleLoad, staleError);

    staleGeneration.cancel();
    beforeSettle.resolve('old board');
    await beforeSettle.promise;
    await Promise.resolve();

    expect(staleLoad).not.toHaveBeenCalled();
    expect(staleError).not.toHaveBeenCalled();

    const afterSettle = deferred<string>();
    const acknowledgement = vi.fn();
    const scheduledGeneration = createRenderEffectGeneration(queue.request, queue.cancel);
    settleRenderEffectGeneration(scheduledGeneration, afterSettle.promise, () => {
      scheduledGeneration.requestFrame(acknowledgement);
    }, staleError);
    afterSettle.resolve('old board');
    await afterSettle.promise;
    await Promise.resolve();
    expect(queue.callbacks.size).toBe(1);

    scheduledGeneration.cancel();
    queue.flush();
    expect(acknowledgement).not.toHaveBeenCalled();
  });

  it('drops a stale rejection instead of failing the current board', async () => {
    const load = deferred<string>();
    const queue = frameQueue();
    const fulfilled = vi.fn();
    const rejected = vi.fn();
    const generation = createRenderEffectGeneration(queue.request, queue.cancel);
    settleRenderEffectGeneration(generation, load.promise, fulfilled, rejected);

    generation.cancel();
    load.reject(new Error('old board failed'));
    await load.promise.catch(() => undefined);
    await Promise.resolve();

    expect(fulfilled).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
  });

  it('keeps recurring animation work inside the generation lifetime', () => {
    const queue = frameQueue();
    const tick = vi.fn();
    const generation = createRenderEffectGeneration(queue.request, queue.cancel);
    const animate: FrameRequestCallback = (time) => {
      tick(time);
      generation.requestFrame(animate);
    };
    generation.requestFrame(animate);

    queue.flush();
    expect(tick).toHaveBeenCalledOnce();
    expect(queue.callbacks.size).toBe(1);

    generation.cancel();
    queue.flush();
    expect(tick).toHaveBeenCalledOnce();
  });
});
