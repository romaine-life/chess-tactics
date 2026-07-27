'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertMigrationSourceAppendOnly,
  extractInlineMigrations,
} = require('./schemaMigrationSource');

function serverSource(migrations) {
  const entries = migrations.map((migration) => `  {
    version: ${migration.version},
    name: ${JSON.stringify(migration.name)},
    sql: ${JSON.stringify(migration.sql)},
  },`).join('\n');
  return `'use strict';
const unrelated = [99];
const MIGRATIONS = [
${entries}
];
const after = true;
`;
}

const BASE = [
  { version: 1, name: 'create records', sql: 'CREATE TABLE records (id integer);' },
  { version: 2, name: 'add label', sql: 'ALTER TABLE records ADD COLUMN label text;' },
];

test('migration source extraction is bounded to the inline registry', () => {
  assert.deepEqual(
    extractInlineMigrations(serverSource(BASE)),
    BASE,
  );
});

test('migration source must remain contiguous from version one', () => {
  assert.throws(
    () => extractInlineMigrations(serverSource([BASE[0], { ...BASE[1], version: 3 }])),
    (error) => (
      error.code === 'schema_migration_history_invalid'
      && error.details.expected_version === 2
      && error.details.actual_version === 3
    ),
  );
});

test('a sparse comparison base is accepted only when explicitly requested', () => {
  const sparseBase = [BASE[0], { version: 3, name: 'reserved addition', sql: 'SELECT 3;' }];
  assert.throws(
    () => extractInlineMigrations(serverSource(sparseBase)),
    (error) => (
      error.code === 'schema_migration_history_invalid'
      && error.details.expected_version === 2
      && error.details.actual_version === 3
    ),
  );
  assert.deepEqual(
    extractInlineMigrations(serverSource(sparseBase), { allowSparse: true }),
    sparseBase,
  );
  assert.throws(
    () => extractInlineMigrations(
      serverSource([sparseBase[1], sparseBase[0]]),
      { allowSparse: true },
    ),
    (error) => (
      error.code === 'schema_migration_history_invalid'
      && error.details.previous_version === 3
      && error.details.actual_version === 1
    ),
  );
});

test('base migrations cannot be edited, renamed, or removed', () => {
  assert.throws(
    () => assertMigrationSourceAppendOnly(
      [{ ...BASE[0], sql: 'SELECT 1;' }, BASE[1]],
      BASE,
    ),
    (error) => error.details.changed_versions.join(',') === '1',
  );
  assert.throws(
    () => assertMigrationSourceAppendOnly([BASE[0]], BASE),
    (error) => error.details.removed_versions.join(',') === '2',
  );
});

test('new migrations may only append after the immutable base history', () => {
  const result = assertMigrationSourceAppendOnly(
    [...BASE, { version: 3, name: 'add state', sql: 'ALTER TABLE records ADD COLUMN state text;' }],
    BASE,
  );
  assert.deepEqual(result, { existing_versions: 2, appended_versions: 1 });
});

test('reserved gaps in a sparse comparison base may be filled without weakening identity checks', () => {
  const current = [
    BASE[0],
    BASE[1],
    { version: 3, name: 'reserved addition', sql: 'SELECT 3;' },
  ];
  const sparseBase = [current[0], current[2]];
  assert.deepEqual(
    assertMigrationSourceAppendOnly(current, sparseBase, { allowSparseBase: true }),
    { existing_versions: 2, appended_versions: 1 },
  );
  assert.throws(
    () => assertMigrationSourceAppendOnly(
      current,
      [{ ...sparseBase[0] }, { ...sparseBase[1], sql: 'SELECT 33;' }],
      { allowSparseBase: true },
    ),
    (error) => (
      error.code === 'schema_migration_history_invalid'
      && error.details.changed_versions.join(',') === '3'
    ),
  );
  assert.throws(
    () => assertMigrationSourceAppendOnly(
      current.slice(0, 2),
      sparseBase,
      { allowSparseBase: true },
    ),
    (error) => (
      error.code === 'schema_migration_history_invalid'
      && error.details.removed_versions.join(',') === '3'
    ),
  );
});
