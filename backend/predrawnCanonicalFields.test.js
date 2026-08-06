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

test('working-copy pre-drawn fields are derived inside a hydrated renderer snapshot', async () => {
  let rendererHydrated = false;
  let snapshotCalls = 0;
  const sandbox = {
    backgroundVersionError: () => new Error('unexpected background version error'),
    predrawnSourceWorkingCopyFields: () => {
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
      'async function dbWorkingCopyPredrawnAttemptFields(',
      '\nasync function dbBindPredrawnSourceToWorkingCopy(',
    )}\nthis.subject = dbWorkingCopyPredrawnAttemptFields;`,
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
      body: { boardCode: 'board' },
    },
  );

  assert.equal(snapshotCalls, 1);
  assert.deepEqual(result, { frame: { width: 160, height: 90 } });
});

test('an undecodable working-copy board is not misreported as a missing generation frame', () => {
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
      'function predrawnSourceWorkingCopyFields(',
      '\nasync function dbWorkingCopyPredrawnAttemptFields(',
    )}\nthis.subject = predrawnSourceWorkingCopyFields;`,
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

test('generation-attempt creation accepts exactly one source-agnostic intake raw', () => {
  const sandbox = {
    isObjectRecord: (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    backgroundVersionId: (value) => (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))
        ? String(value).toLowerCase()
        : null
    ),
  };
  vm.runInNewContext(
    `${serverFunctionSource(
      'function normalizeGenerationAttemptCreate(',
      '\nfunction generationAttemptIdempotencyKey(',
    )}\nthis.subject = normalizeGenerationAttemptCreate;`,
    sandbox,
  );
  const intakeId = 'f53a2944-95ba-4897-a5db-42df04753ed1';

  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.subject({ intake_source_version_id: intakeId }).value)),
    {
      label: 'AI artwork attempt',
      origin: 'source',
      source_version_id: intakeId,
      input_role: 'raw-ai-artwork',
    },
  );
  assert.match(
    sandbox.subject({
      intake_source_version_id: intakeId,
      source_version_id: '2b130a39-6090-48f8-923a-f9d06601829d',
    }).error,
    /exactly one artwork input/,
  );
});

test('only a typed AI artwork intake may reserve a raw before its processing slot exists', () => {
  const sandbox = {
    ATTEMPT_INTAKE_SOURCE_REQUEST_SCHEMA: 'predrawn-ai-artwork-intake-v1',
  };
  vm.runInNewContext(
    `${serverFunctionSource(
      'function isStandaloneAiArtworkIntake(',
      '\nasync function dbCreateBackgroundVersion(',
    )}\nthis.subject = isStandaloneAiArtworkIntake;`,
    sandbox,
  );

  assert.equal(sandbox.subject({
    kind: 'raw',
    operation: { intakeSchema: 'predrawn-ai-artwork-intake-v1' },
  }), true);
  assert.equal(sandbox.subject({ kind: 'raw', operation: {} }), false);
  assert.equal(sandbox.subject({
    kind: 'raw',
    attempt_id: 'f53a2944-95ba-4897-a5db-42df04753ed1',
    operation: { intakeSchema: 'predrawn-ai-artwork-intake-v1' },
  }), false);
  assert.equal(sandbox.subject({
    kind: 'warped',
    operation: { intakeSchema: 'predrawn-ai-artwork-intake-v1' },
  }), false);
});

test('AI artwork intake reservations are server-bound to the current pane and geometry', () => {
  const createSource = serverFunctionSource(
    'async function dbCreateBackgroundVersion(',
    '\nasync function dbUploadBackgroundVersionContent(',
  );
  assert.match(createSource, /dbWorkingCopyPredrawnAttemptFields\(client, currentDocument\)/);
  assert.match(createSource, /sameBackgroundWorldBounds\(storedValue\.world_bounds, fields\.worldBounds\)/);
  assert.match(createSource, /backgroundVersionHasEnvironmentGeometry/);
  assert.match(createSource, /background_version_intake_stale/);
});

test('source-agnostic intake validation sees the raw artwork already occupying its first slot', () => {
  const createSource = serverFunctionSource(
    'async function dbCreateGenerationAttempt(',
    '\nasync function authorizedBackgroundVersionDocument(',
  );
  assert.match(
    createSource,
    /generated_version_id: value\.input_role === 'raw-ai-artwork'[\s\S]*?\? value\.source_version_id[\s\S]*?: null/,
  );
});
