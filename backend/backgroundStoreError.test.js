'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { backgroundStoreSchemaViolation } = require('./backgroundStoreError');

test('every Board Art persistence constraint failure is a schema violation', () => {
  assert.deepEqual(
    backgroundStoreSchemaViolation({
      code: '23514',
      constraint: 'level_working_copy_revisions_reason_check',
      table: 'level_working_copy_revisions',
    }),
    {
      database_code: '23514',
      constraint: 'level_working_copy_revisions_reason_check',
      table: 'level_working_copy_revisions',
    },
  );
  assert.deepEqual(
    backgroundStoreSchemaViolation({
      code: '23503',
      constraint: 'predrawn_generation_attempts_source_attempt_fk',
    }),
    {
      database_code: '23503',
      constraint: 'predrawn_generation_attempts_source_attempt_fk',
    },
  );
  for (const [code, constraint, table] of [
    ['23514', 'predrawn_background_versions_lineage_check', 'predrawn_background_versions'],
    ['23503', 'predrawn_background_version_events_version_id_fkey', 'predrawn_background_version_events'],
    ['23503', 'predrawn_background_geometry_bindings_version_id_fkey', 'predrawn_background_geometry_bindings'],
    ['23503', 'predrawn_background_raw_contract_bindings_version_id_fkey', 'predrawn_background_raw_contract_bindings'],
    ['23503', 'predrawn_generation_attempt_events_attempt_id_document_id_fkey', 'predrawn_generation_attempt_events'],
  ]) {
    assert.deepEqual(
      backgroundStoreSchemaViolation({ code, constraint, table }),
      {
        database_code: code,
        constraint,
        table,
      },
    );
  }
});

test('storage outages and unrelated constraint errors are not mislabeled', () => {
  assert.equal(backgroundStoreSchemaViolation({ code: 'ECONNRESET' }), null);
  assert.equal(backgroundStoreSchemaViolation({
    code: '23505',
    constraint: 'predrawn_background_versions_idempotency_idx',
  }), null);
  assert.equal(
    backgroundStoreSchemaViolation({
      code: '23514',
      constraint: 'unrelated_table_check',
    }),
    null,
  );
});
