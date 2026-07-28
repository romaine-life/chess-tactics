'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  schemaMigrationIdentityBoundaryIssues,
  schemaMigrationIdentityBoundaryIssuesPresent,
  schemaMigrationIdentityRepair,
} = require('./schemaMigrationBoundary');
const {
  formatMigrationRunResult,
  migrationChecksum,
  migrationRunResult,
  planMigrationExecution,
} = require('./schemaMigrationIntegrity');

const COLUMNS = [
  { column_name: 'name', is_nullable: 'NO', data_type: 'text' },
  { column_name: 'checksum', is_nullable: 'NO', data_type: 'text' },
];
const CONSTRAINT = {
  constraint_name: 'schema_migrations_identity_check',
  constraint_type: 'c',
  validated: true,
  is_local: true,
  inheritance_count: 0,
  no_inherit: false,
  local_columns: ['name', 'checksum'],
  definition: "CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200) AND (checksum ~ '^[0-9a-f]{64}$'::text)))",
};

test('migration identity boundary accepts only the complete migration 38 contract', () => {
  const issues = schemaMigrationIdentityBoundaryIssues(COLUMNS, [CONSTRAINT]);
  assert.equal(schemaMigrationIdentityBoundaryIssuesPresent(issues), false);
  assert.deepEqual(issues, {
    missing_identity_columns: [],
    nullable_identity_columns: [],
    wrong_type_identity_columns: [],
    canonical_identity_check_count: 1,
    unexpected_identity_checks: [],
  });
});

test('nullable migration identity columns fail readiness', () => {
  const issues = schemaMigrationIdentityBoundaryIssues(
    COLUMNS.map((column) => (
      column.column_name === 'checksum'
        ? { ...column, is_nullable: 'YES' }
        : column
    )),
    [CONSTRAINT],
  );
  assert.equal(schemaMigrationIdentityBoundaryIssuesPresent(issues), true);
  assert.deepEqual(issues.nullable_identity_columns, ['checksum']);
});

test('a dropped migration identity check fails readiness', () => {
  const issues = schemaMigrationIdentityBoundaryIssues(COLUMNS, []);
  assert.equal(schemaMigrationIdentityBoundaryIssuesPresent(issues), true);
  assert.equal(issues.canonical_identity_check_count, 0);
});

test('a weakened, unvalidated, renamed, or duplicate identity check fails readiness', () => {
  for (const changedConstraint of [
    { ...CONSTRAINT, definition: 'CHECK (char_length(name) >= 1)' },
    { ...CONSTRAINT, validated: false },
    { ...CONSTRAINT, constraint_name: 'almost_the_right_check' },
    { ...CONSTRAINT, local_columns: ['checksum', 'name'] },
  ]) {
    const issues = schemaMigrationIdentityBoundaryIssues(COLUMNS, [changedConstraint]);
    assert.equal(schemaMigrationIdentityBoundaryIssuesPresent(issues), true);
    assert.equal(issues.canonical_identity_check_count, 0);
    assert.deepEqual(issues.unexpected_identity_checks, [changedConstraint.constraint_name]);
  }

  const duplicate = schemaMigrationIdentityBoundaryIssues(COLUMNS, [
    CONSTRAINT,
    { ...CONSTRAINT, constraint_name: 'duplicate_identity_check' },
  ]);
  assert.equal(schemaMigrationIdentityBoundaryIssuesPresent(duplicate), true);
  assert.equal(duplicate.canonical_identity_check_count, 1);
  assert.deepEqual(duplicate.unexpected_identity_checks, ['duplicate_identity_check']);
});

test('a drifted identity boundary plans migration 38 repair and the run report names it', () => {
  const issues = schemaMigrationIdentityBoundaryIssues(COLUMNS, []);
  const repair = schemaMigrationIdentityRepair(issues);
  assert.deepEqual(repair, {
    contract: 'schema migration identity',
    migration_version: 38,
  });

  const migrations = Array.from({ length: 38 }, (_, index) => ({
    version: index + 1,
    name: `migration ${index + 1}`,
    sql: `SELECT ${index + 1};`,
  }));
  const history = migrations.map((migration) => ({
    version: migration.version,
    name: migration.name,
    checksum: migrationChecksum(migration),
  }));
  const report = migrationRunResult(
    planMigrationExecution(migrations, history),
    [],
    { completedContractRepairSteps: [repair] },
  );
  assert.match(
    formatMigrationRunResult(report),
    /contract repair steps completed: schema migration identity \(migration 38\)/,
  );
});
