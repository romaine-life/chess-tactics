'use strict';

function createAsyncWorkLimiter(rawConcurrency) {
  const concurrency = Number(rawConcurrency);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new TypeError('async work limiter concurrency must be a positive integer');
  }
  let active = 0;
  const queue = [];

  const drain = () => {
    while (active < concurrency && queue.length) {
      const entry = queue.shift();
      active += 1;
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return function withAsyncWorkLimit(task) {
    if (typeof task !== 'function') {
      return Promise.reject(new TypeError('async work limiter task must be a function'));
    }
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
  };
}

module.exports = { createAsyncWorkLimiter };
