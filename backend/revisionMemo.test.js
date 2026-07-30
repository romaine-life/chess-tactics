'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createRevisionMemo } = require('./revisionMemo');

const settle = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('an unchanged revision tuple serves the retained manifest without recomputation', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  const compute = async () => {
    calls += 1;
    return { value: { levelA: `/api/media/${calls}` } };
  };
  const first = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1-d1', compute });
  assert.equal(first.source, 'computed');
  const second = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1-d1', compute });
  assert.equal(second.source, 'memo');
  assert.equal(second.value, first.value);
  assert.equal(calls, 1);
});

test('a catalog-input change serves the previous manifest immediately and refreshes once in the background', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  const compute = async () => {
    calls += 1;
    return { value: `manifest-${calls}` };
  };
  await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  const stale = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm2', compute });
  assert.equal(stale.source, 'stale-while-revalidate');
  assert.equal(stale.value, 'manifest-1');
  await settle();
  assert.equal(calls, 2);
  const refreshed = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm2', compute });
  assert.equal(refreshed.source, 'memo');
  assert.equal(refreshed.value, 'manifest-2');
});

test('a document revision change never serves a manifest from another level set', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  const compute = async () => {
    calls += 1;
    return { value: `manifest-${calls}` };
  };
  await memo.read({ key: 'user:owner@example.com', docRevision: 'v1', inputsKey: 'm1', compute });
  const next = await memo.read({ key: 'user:owner@example.com', docRevision: 'v2', inputsKey: 'm1', compute });
  assert.equal(next.source, 'computed');
  assert.equal(next.value, 'manifest-2');
  assert.equal(calls, 2);
});

test('concurrent reads of one tuple share a single computation', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const compute = async () => {
    calls += 1;
    await gate;
    return { value: 'manifest' };
  };
  const reads = Promise.all([
    memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute }),
    memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute }),
  ]);
  release();
  const [first, second] = await reads;
  assert.equal(first.value, 'manifest');
  assert.equal(second.value, 'manifest');
  assert.equal(calls, 1);
});

test('an unsettled manifest is served fast but keeps retrying until a settled result replaces it', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  const compute = async () => {
    calls += 1;
    return calls < 3
      ? { value: `partial-${calls}`, settled: false }
      : { value: 'complete', settled: true };
  };
  const first = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  assert.equal(first.value, 'partial-1');
  const retryOne = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  assert.equal(retryOne.source, 'stale-while-revalidate');
  await settle();
  const retryTwo = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  assert.equal(retryTwo.source, 'stale-while-revalidate');
  assert.equal(retryTwo.value, 'partial-2');
  await settle();
  const settled = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  assert.equal(settled.source, 'memo');
  assert.equal(settled.value, 'complete');
  assert.equal(calls, 3);
});

test('a background refresh failure keeps the retained manifest and reports the error', async () => {
  const failures = [];
  const memo = createRevisionMemo({
    onBackgroundError: (error, key) => failures.push(`${key}:${error.message}`),
  });
  let shouldFail = false;
  const compute = async () => {
    if (shouldFail) throw new Error('refresh exploded');
    return { value: 'manifest-1' };
  };
  await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  shouldFail = true;
  const stale = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm2', compute });
  assert.equal(stale.value, 'manifest-1');
  await settle();
  assert.deepEqual(failures, ['official:default:refresh exploded']);
  shouldFail = false;
  const again = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm2', compute });
  assert.equal(again.source, 'stale-while-revalidate');
  await settle();
  const recovered = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm2', compute });
  assert.equal(recovered.source, 'memo');
});

test('an inline computation failure propagates, retains nothing, and the next read retries', async () => {
  const memo = createRevisionMemo();
  let calls = 0;
  const compute = async () => {
    calls += 1;
    if (calls === 1) throw new Error('cold pass failed');
    return { value: 'manifest' };
  };
  await assert.rejects(
    memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute }),
    /cold pass failed/,
  );
  assert.equal(memo.peek('official:default'), null);
  const recovered = await memo.read({ key: 'official:default', docRevision: 'v1', inputsKey: 'm1', compute });
  assert.equal(recovered.source, 'computed');
  assert.equal(calls, 2);
});

test('eviction is bounded and keeps recently read authorities', async () => {
  const memo = createRevisionMemo({ maxEntries: 2 });
  const compute = (name) => async () => ({ value: name });
  await memo.read({ key: 'a', docRevision: 'v1', inputsKey: 'm1', compute: compute('a') });
  await memo.read({ key: 'b', docRevision: 'v1', inputsKey: 'm1', compute: compute('b') });
  await memo.read({ key: 'a', docRevision: 'v1', inputsKey: 'm1', compute: compute('a') });
  await memo.read({ key: 'c', docRevision: 'v1', inputsKey: 'm1', compute: compute('c') });
  assert.equal(memo.size(), 2);
  assert.equal(memo.peek('b'), null);
  assert.ok(memo.peek('a'));
  assert.ok(memo.peek('c'));
});

test('inputs are validated', async () => {
  const memo = createRevisionMemo();
  const compute = async () => ({ value: 'manifest' });
  await assert.rejects(memo.read({ key: '', docRevision: 'v1', inputsKey: 'm1', compute }), TypeError);
  await assert.rejects(memo.read({ key: 'k', docRevision: '', inputsKey: 'm1', compute }), TypeError);
  await assert.rejects(memo.read({ key: 'k', docRevision: 'v1', inputsKey: '', compute }), TypeError);
  await assert.rejects(memo.read({ key: 'k', docRevision: 'v1', inputsKey: 'm1', compute: null }), TypeError);
  await assert.rejects(
    memo.read({ key: 'k', docRevision: 'v1', inputsKey: 'm1', compute: async () => 'bare' }),
    TypeError,
  );
  assert.throws(() => createRevisionMemo({ maxEntries: 0 }), TypeError);
});

// --- ADR-0256 wiring projections -------------------------------------------
// The memo only helps if the read routes actually consult it. Pin the wiring the
// same way thumbnailAvailability.test.js pins the repair path.

const sourceSection = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `projection start marker missing: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `projection end marker missing: ${endMarker}`);
  return source.slice(start, end);
};

test('workspace and officials reads consult the revision memo', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  const officials = sourceSection(server, "app.get('/api/official-campaigns/:id'", "app.put('/api/official-campaigns/:id'");
  assert.match(officials, /memoizedLevelThumbnailUrls\(\s*`official:\$\{id\}`,\s*`v\$\{portfolio\.revision\}`/);

  const workspace = sourceSection(server, "app.get('/api/campaign-workspace',", "app.put('/api/campaign-workspace',");
  assert.match(workspace, /memoizedLevelThumbnailUrls\(\s*`user:\$\{user\.email\}`,\s*`v\$\{workspace\.revision\}`/);

  const memoized = sourceSection(server, 'async function memoizedLevelThumbnailUrls(', '\nfunction warmOfficialCampaignThumbnailManifest(');
  assert.match(memoized, /thumbnailManifestMemo\.read\(/);
  assert.match(memoized, /storedLevelThumbnailManifest\(authorityEntries\)/);

  const manifest = sourceSection(server, 'async function storedLevelThumbnailManifest(', '\nasync function memoizedLevelThumbnailUrls(');
  assert.match(manifest, /storedLevelThumbnailUrls\(authorityEntries\)/);
});

test('the cold pass yields between levels and officials warm at boot', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const prepare = sourceSection(server, 'async function prepareLevelThumbnailEntries(', '\nasync function storedLevelThumbnail(');
  assert.match(prepare, /setImmediate/);
  assert.match(server, /warmOfficialCampaignThumbnailManifest\('boot'\)/);
});
