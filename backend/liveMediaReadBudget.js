'use strict';

function abortReason(signal, fallback = 'live media read aborted') {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error(fallback);
  error.name = 'AbortError';
  return error;
}

function raceWithAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function createByteReadBudget({ maxBytes, timeoutMs }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive safe integer');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive safe integer');

  let bytesInFlight = 0;
  const waiters = [];

  const release = (bytes) => {
    bytesInFlight = Math.max(0, bytesInFlight - bytes);
    for (let index = 0; index < waiters.length;) {
      const waiter = waiters[index];
      if (waiter.signal.aborted) {
        waiters.splice(index, 1);
        waiter.cleanup();
        waiter.reject(abortReason(waiter.signal));
        continue;
      }
      if (bytesInFlight + waiter.bytes > maxBytes) {
        index += 1;
        continue;
      }
      waiters.splice(index, 1);
      bytesInFlight += waiter.bytes;
      waiter.cleanup();
      waiter.resolve();
    }
  };

  const acquire = (bytes, signal) => {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    if (bytesInFlight + bytes <= maxBytes) {
      bytesInFlight += bytes;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = { bytes, signal, resolve, reject, cleanup: () => {} };
      const onAbort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        waiter.cleanup();
        reject(abortReason(signal));
      };
      waiter.cleanup = () => signal.removeEventListener('abort', onAbort);
      signal.addEventListener('abort', onAbort, { once: true });
      waiters.push(waiter);
    });
  };

  const run = async (bytes, fn, { signal: externalSignal = null, deadlineMs = timeoutMs } = {}) => {
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > maxBytes) {
      throw new Error('live media record has an invalid byte length');
    }
    if (typeof fn !== 'function') throw new Error('live media read callback is required');
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error('deadlineMs must be a positive safe integer');

    const controller = new AbortController();
    const timeoutError = new Error(`live media read exceeded its ${deadlineMs}ms deadline`);
    timeoutError.name = 'TimeoutError';
    timeoutError.code = 'LIVE_MEDIA_READ_TIMEOUT';
    const timer = setTimeout(() => controller.abort(timeoutError), deadlineMs);
    // The deadline is part of the read's completion contract. Keeping this
    // timer referenced ensures a pending storage promise still settles even in
    // a worker/test process with no unrelated event-loop handles.
    const onExternalAbort = () => controller.abort(abortReason(externalSignal));
    if (externalSignal) {
      if (externalSignal.aborted) onExternalAbort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    let acquired = false;
    try {
      await acquire(bytes, controller.signal);
      acquired = true;
      if (controller.signal.aborted) throw abortReason(controller.signal);
      return await raceWithAbort(Promise.resolve().then(() => fn(controller.signal)), controller.signal);
    } finally {
      if (acquired) release(bytes);
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };

  return {
    run,
    snapshot: () => ({ maxBytes, bytesInFlight, waiters: waiters.length }),
  };
}

module.exports = { createByteReadBudget };
