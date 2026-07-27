'use strict';

const IDENTITY_COLUMNS = Object.freeze(['name', 'checksum']);
const CANONICAL_IDENTITY_CHECK = "checkchar_lengthname>=1andchar_lengthname<=200andchecksum~'^[0-9a-f]{64}$'";

function normalizedCheckDefinition(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/::(?:pg_catalog\.)?text\b/g, '')
    .replace(/[\s()]+/g, '');
}

function schemaMigrationIdentityBoundaryIssues(columns, constraints) {
  if (!Array.isArray(columns)) throw new TypeError('schema migration columns must be an array');
  if (!Array.isArray(constraints)) throw new TypeError('schema migration constraints must be an array');

  const columnByName = new Map(columns.map((column) => [column.column_name, column]));
  const missingColumns = IDENTITY_COLUMNS.filter((name) => !columnByName.has(name));
  const nullableColumns = IDENTITY_COLUMNS.filter(
    (name) => columnByName.has(name) && columnByName.get(name).is_nullable !== 'NO',
  );
  const wrongTypeColumns = IDENTITY_COLUMNS.filter(
    (name) => columnByName.has(name) && columnByName.get(name).data_type !== 'text',
  );
  const identityChecks = constraints.filter((constraint) => {
    const localColumns = Array.isArray(constraint.local_columns)
      ? constraint.local_columns
      : [];
    return constraint.constraint_type === 'c' && (
      localColumns.some((name) => IDENTITY_COLUMNS.includes(name))
      || /\b(?:name|checksum)\b/i.test(String(constraint.definition || ''))
    );
  });
  const canonicalChecks = identityChecks.filter((constraint) => (
    constraint.constraint_name === 'schema_migrations_identity_check'
    && constraint.validated === true
    && constraint.is_local === true
    && Number(constraint.inheritance_count) === 0
    && constraint.no_inherit === false
    && JSON.stringify(constraint.local_columns) === JSON.stringify(IDENTITY_COLUMNS)
    && normalizedCheckDefinition(constraint.definition) === CANONICAL_IDENTITY_CHECK
  ));
  const unexpectedChecks = identityChecks.filter(
    (constraint) => !canonicalChecks.includes(constraint),
  );

  return Object.freeze({
    missing_identity_columns: Object.freeze(missingColumns),
    nullable_identity_columns: Object.freeze(nullableColumns),
    wrong_type_identity_columns: Object.freeze(wrongTypeColumns),
    canonical_identity_check_count: canonicalChecks.length,
    unexpected_identity_checks: Object.freeze(
      unexpectedChecks.map((constraint) => String(constraint.constraint_name || 'unnamed')),
    ),
  });
}

function schemaMigrationIdentityBoundaryIssuesPresent(issues) {
  return (
    issues.missing_identity_columns.length > 0
    || issues.nullable_identity_columns.length > 0
    || issues.wrong_type_identity_columns.length > 0
    || issues.canonical_identity_check_count !== 1
    || issues.unexpected_identity_checks.length > 0
  );
}

function schemaMigrationIdentityRepair(issues) {
  if (!schemaMigrationIdentityBoundaryIssuesPresent(issues)) return null;
  return Object.freeze({
    contract: 'schema migration identity',
    migration_version: 38,
  });
}

module.exports = {
  normalizedCheckDefinition,
  schemaMigrationIdentityBoundaryIssues,
  schemaMigrationIdentityBoundaryIssuesPresent,
  schemaMigrationIdentityRepair,
};
