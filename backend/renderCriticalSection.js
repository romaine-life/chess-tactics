'use strict';

/**
 * A small FIFO async mutex for the process-global board-render registries.
 * The registries are intentionally shared with the browser build, but on the
 * server one request must own apply -> plan/hash -> render as one operation.
 */
function createRenderCriticalSection() {
  let tail = Promise.resolve();
  return async function withRenderCriticalSection(task) {
    if (typeof task !== 'function') throw new TypeError('render critical section task must be a function');
    let release;
    const predecessor = tail;
    tail = new Promise((resolve) => { release = resolve; });
    await predecessor;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

module.exports = { createRenderCriticalSection };
