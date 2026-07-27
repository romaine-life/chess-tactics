'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  prepareGenerationAttemptArchiveThumbnail,
} = require('./generationAttemptArchiveThumbnail');

test('an archived replay retries a canonical derivative that failed after the detach committed', async () => {
  const canonicalLevel = { id: 'level-1', boardCode: 'board-code' };
  const calls = [];
  const first = await prepareGenerationAttemptArchiveThumbnail({
    canonicalChanged: true,
    canonicalThumbnailRequiresEnsure: true,
    canonicalLevel,
    idempotentReplay: false,
  }, 'user:owner@example.com:level-1', async (...args) => {
    calls.push(args);
    throw new Error('injected thumbnail failure after commit');
  });
  assert.equal(first.attempted, true);
  assert.equal(first.ready, false);
  assert.match(first.error.message, /injected thumbnail failure/);

  const replay = await prepareGenerationAttemptArchiveThumbnail({
    canonicalChanged: false,
    canonicalThumbnailRequiresEnsure: true,
    canonicalLevel,
    idempotentReplay: true,
  }, 'user:owner@example.com:level-1', async (...args) => {
    calls.push(args);
  });
  assert.equal(replay.attempted, true);
  assert.equal(replay.ready, true);
  assert.equal(replay.error, null);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(([authority, level]) => [authority, level.id]), [
    ['user:owner@example.com:level-1', 'level-1'],
    ['user:owner@example.com:level-1', 'level-1'],
  ]);
});

test('an archive with no canonical thumbnail work does not call the derivative function', async () => {
  let calls = 0;
  const result = await prepareGenerationAttemptArchiveThumbnail({
    canonicalThumbnailRequiresEnsure: false,
    canonicalLevel: { id: 'level-1' },
  }, 'user:owner@example.com:level-1', async () => {
    calls += 1;
  });
  assert.deepEqual(result, { attempted: false, ready: true, error: null });
  assert.equal(calls, 0);
});
