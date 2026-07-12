'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRenderCriticalSection } = require('./renderCriticalSection');

test('renderer apply and async render cannot interleave across snapshots', async () => {
  const critical = createRenderCriticalSection();
  let installedRevision = 0;
  let releaseFirst;
  const firstMayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  let firstEntered;
  const firstDidEnter = new Promise((resolve) => { firstEntered = resolve; });
  const observations = [];

  const first = critical(async () => {
    installedRevision = 1;
    firstEntered();
    await firstMayFinish;
    observations.push(installedRevision);
  });
  await firstDidEnter;
  const second = critical(async () => {
    installedRevision = 2;
    observations.push(installedRevision);
  });

  // The queued request cannot replace singleton state while the first render
  // is suspended on dynamic sprite I/O.
  await Promise.resolve();
  assert.equal(installedRevision, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(observations, [1, 2]);
});

test('a failed render releases the next snapshot', async () => {
  const critical = createRenderCriticalSection();
  await assert.rejects(critical(async () => { throw new Error('render failed'); }), /render failed/);
  assert.equal(await critical(async () => 'recovered'), 'recovered');
});
