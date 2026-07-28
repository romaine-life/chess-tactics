const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function serverFunctionSource(startMarker, endMarker) {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `server contract markers must remain inspectable: ${startMarker}`);
  return source.slice(start, end);
}

test('canonical pre-drawn fields are derived inside a hydrated renderer snapshot', async () => {
  let rendererHydrated = false;
  let snapshotCalls = 0;
  const sandbox = {
    backgroundVersionError: () => new Error('unexpected background version error'),
    dbCanonicalLevel: async () => ({ level: { boardCode: 'board' } }),
    editorDocumentBaselineChanged: () => false,
    predrawnSourceCanonicalFields: () => {
      assert.equal(rendererHydrated, true, 'board decoding must happen after snapshot hydration');
      return { frame: { width: 160, height: 90 } };
    },
    withThumbnailRenderInputs: async (task) => {
      snapshotCalls += 1;
      rendererHydrated = true;
      try {
        return await task({});
      } finally {
        rendererHydrated = false;
      }
    },
  };
  vm.runInNewContext(
    `${serverFunctionSource(
      'async function dbCanonicalPredrawnAttemptFields(',
      '\nasync function dbCanonicalizePredrawnSourceVersion(',
    )}\nthis.subject = dbCanonicalPredrawnAttemptFields;`,
    sandbox,
  );

  const result = await sandbox.subject(
    {},
    {
      owner_email: 'owner@example.test',
      workspace_kind: 'official',
      workspace_id: 'default',
      level_id: 'level-1',
      revision: 7,
      saved_revision: 7,
      baseline_hash: 'same',
    },
  );

  assert.equal(snapshotCalls, 1);
  assert.deepEqual(result, { frame: { width: 160, height: 90 } });
});

test('an undecodable saved board is not misreported as a missing generation frame', () => {
  const sandbox = {
    crypto: require('node:crypto'),
    serverRender: { decodeBoard: () => null },
    editorDocumentError: (_status, code) => Object.assign(new Error(code), { code }),
    backgroundVersionError: (_status, code, details) => Object.assign(
      new Error(String(details)),
      { code, details },
    ),
  };
  vm.runInNewContext(
    `${serverFunctionSource(
      'function predrawnSourceCanonicalFields(',
      '\nasync function dbCanonicalPredrawnAttemptFields(',
    )}\nthis.subject = predrawnSourceCanonicalFields;`,
    sandbox,
  );

  assert.throws(
    () => sandbox.subject(
      { boardCode: 'macro-tile-board' },
      { levelId: 'level-1', documentRevision: 7 },
    ),
    (error) => (
      error.code === 'background_source_board_invalid'
      && /could not be decoded/.test(error.details)
    ),
  );
});
