'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createAsyncWorkLimiter } = require('./asyncWorkLimiter');

test('bounds process-wide work and starts queued tasks in FIFO order', async () => {
  const limit = createAsyncWorkLimiter(2);
  const starts = [];
  const releases = [];
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 5 }, (_, index) => limit(async () => {
    starts.push(index);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => { releases[index] = resolve; });
    active -= 1;
    return index;
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, [0, 1]);
  releases[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, [0, 1, 2]);
  releases[1]();
  releases[2]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, [0, 1, 2, 3, 4]);
  releases[3]();
  releases[4]();

  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4]);
  assert.equal(peak, 2);
});

test('a rejected task releases capacity for the next queued task', async () => {
  const limit = createAsyncWorkLimiter(1);
  const order = [];
  const rejected = limit(async () => {
    order.push('first');
    throw new Error('failed');
  });
  const recovered = limit(async () => {
    order.push('second');
    return 'ok';
  });

  await assert.rejects(rejected, /failed/);
  assert.equal(await recovered, 'ok');
  assert.deepEqual(order, ['first', 'second']);
});
