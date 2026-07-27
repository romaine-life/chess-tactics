'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MigrationExecutionError,
  MigrationIntegrityError,
  assertMigrationHistoryImmutable,
  compareMigrationHistory,
  formatMigrationRunFailure,
  formatMigrationRunResult,
  migrationChecksum,
  migrationExecutionFailure,
  migrationManifest,
  migrationRunResult,
  planMigrationExecution,
} = require('./schemaMigrationIntegrity');

const MIGRATIONS = [
  { version: 1, name: 'create things', sql: 'CREATE TABLE things (id integer);' },
  { version: 2, name: 'add names', sql: 'ALTER TABLE things ADD COLUMN name text;' },
  { version: 3, name: 'add states', sql: 'ALTER TABLE things ADD COLUMN state text;' },
];

function appliedRow(migration) {
  return {
    version: migration.version,
    name: migration.name,
    checksum: migrationChecksum(migration),
  };
}

test('migration checksums are deterministic across checkout line endings and cover identity plus SQL', () => {
  const lf = { version: 7, name: 'line endings', sql: 'SELECT 1;\nSELECT 2;\n' };
  const crlf = { ...lf, sql: 'SELECT 1;\r\nSELECT 2;\r\n' };
  assert.equal(migrationChecksum(lf), migrationChecksum(crlf));
  assert.match(migrationChecksum(lf), /^[0-9a-f]{64}$/);
  assert.notEqual(migrationChecksum(lf), migrationChecksum({ ...lf, version: 8 }));
  assert.notEqual(migrationChecksum(lf), migrationChecksum({ ...lf, name: 'renamed' }));
  assert.notEqual(migrationChecksum(lf), migrationChecksum({ ...lf, sql: 'SELECT 1;\nSELECT 3;\n' }));
});

test('migration manifest rejects every registry that is not the exact 1 through N sequence', () => {
  assert.throws(
    () => migrationManifest([MIGRATIONS[1], MIGRATIONS[0]]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.expected_version === 1
      && error.details.actual_version === 2,
  );
  assert.throws(
    () => migrationManifest([MIGRATIONS[0], { ...MIGRATIONS[0], name: 'duplicate' }]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.expected_version === 2
      && error.details.actual_version === 1,
  );
  assert.throws(
    () => migrationManifest([MIGRATIONS[0], MIGRATIONS[2]]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.expected_version === 2
      && error.details.actual_version === 3,
  );
});

test('history comparison separates matching, pending, and legacy unsealed rows', () => {
  const comparison = compareMigrationHistory(MIGRATIONS, [
    appliedRow(MIGRATIONS[0]),
    { version: 2, name: null, checksum: null },
  ]);
  assert.deepEqual(comparison.matching.map(({ version }) => version), [1]);
  assert.deepEqual(comparison.unsealed.map(({ version }) => version), [2]);
  assert.deepEqual(comparison.pending.map(({ version }) => version), [3]);
  assert.deepEqual(comparison.changed, []);
  assert.deepEqual(comparison.unexpected, []);
  assert.deepEqual(comparison.gaps, []);
  assert.throws(
    () => assertMigrationHistoryImmutable(comparison),
    (error) => error instanceof MigrationIntegrityError
      && error.details.unsealed_versions.join(',') === '2',
  );
  assert.equal(assertMigrationHistoryImmutable(comparison, { allowUnsealed: true }), comparison);
});

test('applied history must be a contiguous prefix rather than an out-of-order set', () => {
  const historyWithGap = [
    appliedRow(MIGRATIONS[0]),
    appliedRow(MIGRATIONS[2]),
  ];
  const comparison = compareMigrationHistory(MIGRATIONS, historyWithGap);
  assert.deepEqual(comparison.pending.map(({ version }) => version), [2]);
  assert.deepEqual(comparison.gaps.map(({ version }) => version), [3]);
  assert.throws(
    () => planMigrationExecution(MIGRATIONS, historyWithGap),
    (error) => error instanceof MigrationIntegrityError
      && error.code === 'schema_migration_history_invalid'
      && error.details.out_of_order_versions.join(',') === '3',
  );
});

test('an explicitly named numeric-only legacy sparse row may be bridged once', () => {
  const numericOnlyLegacyHistory = [
    { version: 1, name: null, checksum: null },
    { version: 3, name: null, checksum: null },
  ];
  const plan = planMigrationExecution(MIGRATIONS, numericOnlyLegacyHistory, {
    allowUnsealed: true,
    allowLegacySparseVersions: [3],
  });
  assert.deepEqual(plan.skipped.map(({ version }) => version), [1, 3]);
  assert.deepEqual(plan.pending.map(({ version }) => version), [2]);

  assert.throws(
    () => planMigrationExecution(MIGRATIONS, numericOnlyLegacyHistory, {
      allowUnsealed: true,
      allowLegacySparseVersions: [2],
    }),
    (error) => error instanceof MigrationIntegrityError
      && error.details.out_of_order_versions.join(',') === '3',
  );
});

test('the legacy sparse exception rejects a checksummed or partially identified gap row', () => {
  const checksummedGap = [
    { version: 1, name: null, checksum: null },
    appliedRow(MIGRATIONS[2]),
  ];
  assert.throws(
    () => planMigrationExecution(MIGRATIONS, checksummedGap, {
      allowUnsealed: true,
      allowLegacySparseVersions: [3],
    }),
    (error) => error instanceof MigrationIntegrityError
      && error.details.out_of_order_versions.join(',') === '3',
  );

  const partiallyIdentifiedGap = [
    { version: 1, name: null, checksum: null },
    { version: 3, name: MIGRATIONS[2].name, checksum: null },
  ];
  assert.throws(
    () => planMigrationExecution(MIGRATIONS, partiallyIdentifiedGap, {
      allowUnsealed: true,
      allowLegacySparseVersions: [3],
    }),
    (error) => error instanceof MigrationIntegrityError
      && error.details.out_of_order_versions.join(',') === '3',
  );
});

test('legacy null metadata is sealable but any recorded drift still fails closed', () => {
  const expected = MIGRATIONS[0];
  const checksumDrift = compareMigrationHistory(MIGRATIONS, [{
    version: expected.version,
    name: null,
    checksum: 'f'.repeat(64),
  }]);
  assert.deepEqual(checksumDrift.changed[0].fields, ['checksum']);
  assert.throws(
    () => assertMigrationHistoryImmutable(checksumDrift, { allowUnsealed: true }),
    MigrationIntegrityError,
  );

  const nameDrift = compareMigrationHistory(MIGRATIONS, [{
    version: expected.version,
    name: 'a different migration',
    checksum: null,
  }]);
  assert.deepEqual(nameDrift.changed[0].fields, ['name']);
  assert.throws(
    () => assertMigrationHistoryImmutable(nameDrift, { allowUnsealed: true }),
    MigrationIntegrityError,
  );

  const malformedMetadata = compareMigrationHistory(MIGRATIONS, [{
    version: expected.version,
    name: 42,
    checksum: '',
  }]);
  assert.deepEqual(malformedMetadata.changed[0].fields, ['name', 'checksum']);
  assert.throws(
    () => assertMigrationHistoryImmutable(malformedMetadata, { allowUnsealed: true }),
    MigrationIntegrityError,
  );
});

test('editing an applied migration is an integrity failure rather than a pending migration', () => {
  const originalHistory = MIGRATIONS.map(appliedRow);
  const edited = MIGRATIONS.map((migration) => ({ ...migration }));
  edited[1].sql = 'ALTER TABLE things ADD COLUMN changed_name text;';
  const comparison = compareMigrationHistory(edited, originalHistory);
  assert.deepEqual(comparison.pending, []);
  assert.deepEqual(comparison.changed.map(({ version, fields }) => [version, fields]), [
    [2, ['checksum']],
  ]);
  assert.throws(
    () => planMigrationExecution(edited, originalHistory),
    (error) => error instanceof MigrationIntegrityError
      && error.code === 'schema_migration_history_invalid'
      && error.details.changed_versions.join(',') === '2',
  );
});

test('renaming or removing an applied migration fails immutable-history verification', () => {
  const originalHistory = MIGRATIONS.map(appliedRow);
  const renamed = MIGRATIONS.map((migration) => ({ ...migration }));
  renamed[0].name = 'different name';
  const renamedComparison = compareMigrationHistory(renamed, originalHistory);
  assert.deepEqual(renamedComparison.changed[0].fields, ['name', 'checksum']);
  assert.throws(() => assertMigrationHistoryImmutable(renamedComparison), MigrationIntegrityError);

  const removedComparison = compareMigrationHistory(MIGRATIONS.slice(0, 2), originalHistory);
  assert.deepEqual(removedComparison.unexpected.map(({ version }) => version), [3]);
  assert.throws(() => assertMigrationHistoryImmutable(removedComparison), MigrationIntegrityError);
});

test('execution report names what really committed, what was skipped, and what remains', () => {
  const plan = planMigrationExecution(MIGRATIONS, [appliedRow(MIGRATIONS[0])]);
  assert.deepEqual(plan.skipped.map(({ version }) => version), [1]);
  assert.deepEqual(plan.pending.map(({ version }) => version), [2, 3]);

  const afterOneCommit = migrationRunResult(plan, [2]);
  assert.deepEqual(afterOneCommit.applied.map(({ version }) => version), [2]);
  assert.deepEqual(afterOneCommit.skipped.map(({ version }) => version), [1]);
  assert.deepEqual(afterOneCommit.pending.map(({ version }) => version), [3]);
  assert.equal(
    formatMigrationRunResult(afterOneCommit),
    'schema migrations applied: 2 (add names); skipped (already applied): 1 (create things); pending: 3 (add states); relation repair steps completed: none; contract repair steps completed: none; sealed legacy migration identities: none',
  );

  const noOpPlan = planMigrationExecution(MIGRATIONS, MIGRATIONS.map(appliedRow));
  const noOpResult = migrationRunResult(noOpPlan, []);
  assert.equal(
    formatMigrationRunResult(noOpResult),
    'schema migrations applied: none; skipped (already applied): 1 (create things), 2 (add names), 3 (add states); pending: none; relation repair steps completed: none; contract repair steps completed: none; sealed legacy migration identities: none',
  );
});

test('execution report rejects claims that a skipped or unknown migration was applied', () => {
  const plan = planMigrationExecution(MIGRATIONS, [appliedRow(MIGRATIONS[0])]);
  assert.throws(
    () => migrationRunResult(plan, [1]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.unplanned_applied_version === 1,
  );
  assert.throws(
    () => migrationRunResult(plan, [99]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.unplanned_applied_version === 99,
  );
  assert.throws(
    () => migrationRunResult(plan, [2, 2]),
    (error) => error instanceof MigrationIntegrityError
      && error.details.duplicate_applied_version === 2,
  );
});

test('partial-commit failure names the exact committed and failing migrations', () => {
  const plan = planMigrationExecution(MIGRATIONS, [appliedRow(MIGRATIONS[0])]);
  const cause = new Error('relation already exists');
  const failure = migrationExecutionFailure(
    plan,
    [2],
    MIGRATIONS[2],
    'apply',
    cause,
  );

  assert.ok(failure instanceof MigrationExecutionError);
  assert.equal(failure.code, 'schema_migration_execution_failed');
  assert.equal(failure.cause, cause);
  assert.deepEqual(
    failure.migrationRunResult.applied.map(({ version }) => version),
    [2],
  );
  assert.deepEqual(
    failure.migrationRunResult.pending.map(({ version }) => version),
    [3],
  );
  assert.deepEqual(failure.details.failed_migration, {
    version: 3,
    name: 'add states',
    phase: 'apply',
  });
  assert.equal(
    formatMigrationRunFailure(failure),
    'schema migrations applied: 2 (add names); skipped (already applied): 1 (create things); pending: 3 (add states); relation repair steps completed: none; contract repair steps completed: none; sealed legacy migration identities: none; failed: 3 (add states) during apply; cause: relation already exists',
  );
});

test('a skipped migration can be the exact failing replay-repair step', () => {
  const plan = planMigrationExecution(MIGRATIONS, MIGRATIONS.map(appliedRow));
  const failure = migrationExecutionFailure(
    plan,
    [],
    MIGRATIONS[1],
    'repair relation things',
    new Error('repair rejected'),
  );
  assert.equal(failure.details.failed_migration.version, 2);
  assert.match(
    formatMigrationRunFailure(failure),
    /schema migrations applied: none[\s\S]*failed: 2 \(add names\) during repair relation things/,
  );
});

test('postcondition failure still carries the exact partial-commit report', () => {
  const plan = planMigrationExecution(MIGRATIONS, [appliedRow(MIGRATIONS[0])]);
  const failure = migrationExecutionFailure(
    plan,
    [2],
    null,
    'verify required schema postconditions',
    new Error('identity check is missing'),
  );
  assert.deepEqual(failure.migrationRunResult.applied.map(({ version }) => version), [2]);
  assert.equal(failure.details.failed_migration, null);
  assert.match(
    formatMigrationRunFailure(failure),
    /schema migrations applied: 2 \(add names\)[\s\S]*failed: verify required schema postconditions/,
  );
});

test('later relation-repair failure retains each earlier completed repair step without claiming completion', () => {
  const plan = planMigrationExecution(MIGRATIONS, MIGRATIONS.map(appliedRow));
  const failure = migrationExecutionFailure(
    plan,
    [],
    MIGRATIONS[2],
    'repair relation working_copies',
    new Error('second repair step rejected'),
    {
      completedRelationRepairSteps: [
        { relation: 'working_copies', migration_version: 2 },
      ],
    },
  );
  assert.deepEqual(failure.migrationRunResult.completed_relation_repair_steps, [
    { relation: 'working_copies', migration_version: 2 },
  ]);
  assert.match(
    formatMigrationRunFailure(failure),
    /relation repair steps completed: working_copies \(migration 2\)[\s\S]*failed: 3 \(add states\) during repair relation working_copies/,
  );
});

test('migration report names relation, contract, and legacy-identity repairs', () => {
  const plan = planMigrationExecution(MIGRATIONS, MIGRATIONS.map(appliedRow));
  const result = migrationRunResult(plan, [], {
    completedRelationRepairSteps: [
      { relation: 'level_working_copy_revisions', migration_version: 2 },
    ],
    completedContractRepairSteps: [
      { contract: 'working-copy revision reasons', migration_version: 3 },
    ],
    sealedLegacyVersions: [2, 1, 2],
  });
  assert.equal(
    formatMigrationRunResult(result),
    'schema migrations applied: none; skipped (already applied): 1 (create things), 2 (add names), 3 (add states); pending: none; relation repair steps completed: level_working_copy_revisions (migration 2); contract repair steps completed: working-copy revision reasons (migration 3); sealed legacy migration identities: 1, 2',
  );
});
