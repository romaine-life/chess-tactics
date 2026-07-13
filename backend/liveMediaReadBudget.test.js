'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createByteReadBudget } = require('./liveMediaReadBudget');

test('queued reads resume after byte capacity is released', async () => {
  const budget = createByteReadBudget({ maxBytes: 8, timeoutMs: 500 });
  let releaseFirst;
  const first = budget.run(8, () => new Promise((resolve) => { releaseFirst = resolve; }));
  while (!releaseFirst) await new Promise((resolve) => setImmediate(resolve));
  let secondStarted = false;
  const second = budget.run(1, async () => { secondStarted = true; return 'second'; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondStarted, false);
  releaseFirst('first');
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(budget.snapshot(), { maxBytes: 8, bytesInFlight: 0, waiters: 0 });
});

test('one deadline covers capacity wait and never-resolving storage reads', async () => {
  const budget = createByteReadBudget({ maxBytes: 8, timeoutMs: 40 });
  const never = () => new Promise(() => {});
  const started = Date.now();
  const results = await Promise.allSettled([
    budget.run(4, never),
    budget.run(4, never),
    budget.run(1, never),
  ]);
  assert.ok(Date.now() - started < 1_000, 'deadline did not release blocked reads');
  assert.ok(results.every((result) => result.status === 'rejected'));
  for (const result of results) {
    assert.equal(result.reason.code, 'LIVE_MEDIA_READ_TIMEOUT');
  }
  assert.deepEqual(budget.snapshot(), { maxBytes: 8, bytesInFlight: 0, waiters: 0 });
});

test('an aborted queued waiter is removed without consuming capacity', async () => {
  const budget = createByteReadBudget({ maxBytes: 4, timeoutMs: 500 });
  let releaseFirst;
  const first = budget.run(4, () => new Promise((resolve) => { releaseFirst = resolve; }));
  while (!releaseFirst) await new Promise((resolve) => setImmediate(resolve));
  const controller = new AbortController();
  const queued = budget.run(1, async () => 'never', { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error('caller disconnected'));
  await assert.rejects(queued, /caller disconnected/);
  assert.equal(budget.snapshot().waiters, 0);
  releaseFirst('done');
  assert.equal(await first, 'done');
  assert.deepEqual(budget.snapshot(), { maxBytes: 4, bytesInFlight: 0, waiters: 0 });
});
