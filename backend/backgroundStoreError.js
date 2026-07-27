'use strict';

const SCHEMA_CONSTRAINT_CODES = new Set(['23503', '23514']);
const BACKGROUND_SCHEMA_CONSTRAINT_PREFIXES = [
  'level_working_copy_revisions_',
  'predrawn_background_versions_',
  'predrawn_background_version_events_',
  'predrawn_background_geometry_bindings_',
  'predrawn_background_raw_contract_bindings_',
  'predrawn_generation_attempts_',
  'predrawn_generation_attempt_events_',
];

function backgroundStoreSchemaViolation(error) {
  if (!error || !SCHEMA_CONSTRAINT_CODES.has(error.code)) return null;
  if (
    typeof error.constraint !== 'string'
    || !BACKGROUND_SCHEMA_CONSTRAINT_PREFIXES.some((prefix) => error.constraint.startsWith(prefix))
  ) return null;
  return Object.freeze({
    database_code: error.code,
    constraint: error.constraint,
    ...(typeof error.table === 'string' && error.table
      ? { table: error.table }
      : {}),
  });
}

module.exports = { backgroundStoreSchemaViolation };
