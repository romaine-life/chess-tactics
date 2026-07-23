export type RenderFrameRequest = (callback: FrameRequestCallback) => number;
export type RenderFrameCancel = (handle: number) => void;

/**
 * Owns every deferred continuation for one renderer effect. React cleanup invalidates the
 * generation and cancels every pending frame, so a previous board cannot paint, acknowledge, or
 * report an error through callbacks captured for a later board.
 */
export interface RenderEffectGeneration {
  runIfCurrent: <T>(action: () => T) => T | undefined;
  requestFrame: (callback: FrameRequestCallback) => number | undefined;
  cancel: () => void;
}

export function createRenderEffectGeneration(
  requestFrame: RenderFrameRequest = (callback) => window.requestAnimationFrame(callback),
  cancelFrame: RenderFrameCancel = (handle) => window.cancelAnimationFrame(handle),
): RenderEffectGeneration {
  let cancelled = false;
  const pendingFrames = new Set<number>();

  const runIfCurrent = <T,>(action: () => T): T | undefined => (
    cancelled ? undefined : action()
  );

  const requestCurrentFrame = (callback: FrameRequestCallback): number | undefined => {
    if (cancelled) return undefined;
    let handle = 0;
    handle = requestFrame((time) => {
      pendingFrames.delete(handle);
      if (!cancelled) callback(time);
    });
    if (cancelled) {
      cancelFrame(handle);
      return undefined;
    }
    pendingFrames.add(handle);
    return handle;
  };

  return {
    runIfCurrent,
    requestFrame: requestCurrentFrame,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      for (const handle of pendingFrames) cancelFrame(handle);
      pendingFrames.clear();
    },
  };
}

/** Route both promise branches through the same effect-generation guard. */
export function settleRenderEffectGeneration<T>(
  generation: RenderEffectGeneration,
  pending: Promise<T>,
  onFulfilled: (value: T) => void,
  onRejected: (error: unknown) => void,
): void {
  void pending
    .then((value) => generation.runIfCurrent(() => onFulfilled(value)))
    .catch((error: unknown) => generation.runIfCurrent(() => onRejected(error)));
}
