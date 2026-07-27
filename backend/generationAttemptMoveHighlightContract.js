'use strict';

const MOVE_HIGHLIGHT_COLUMNS = Object.freeze([
  Object.freeze({ name: 'move_highlight_profile', dataType: 'jsonb' }),
  Object.freeze({ name: 'move_highlight_profile_sha256', dataType: 'text' }),
  Object.freeze({ name: 'move_highlight_profile_warped_version_id', dataType: 'uuid' }),
]);
const MOVE_HIGHLIGHT_COLUMN_NAMES = Object.freeze(
  MOVE_HIGHLIGHT_COLUMNS.map((column) => column.name),
);
const FINAL_ATTEMPT_ACTIONS = Object.freeze([
  'archived',
  'created',
  'move-highlight-profile-updated',
  'stage-attached',
  'stage-discarded',
]);
const MOVE_HIGHLIGHT_BUNDLE_CONSTRAINT =
  'predrawn_generation_attempts_move_highlight_bundle_check';

function normalizedCheckDefinition(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/::(?:pg_catalog\.)?text\b/g, '')
    .replace(/[\s()]+/g, '');
}

const CANONICAL_BUNDLE_CHECK = normalizedCheckDefinition(`
  CHECK (
    (
      move_highlight_profile IS NULL
      AND move_highlight_profile_sha256 IS NULL
      AND move_highlight_profile_warped_version_id IS NULL
    )
    OR
    (
      move_highlight_profile IS NOT NULL
      AND move_highlight_profile_sha256 IS NOT NULL
      AND move_highlight_profile_warped_version_id IS NOT NULL
      AND jsonb_typeof(move_highlight_profile) = 'object'
      AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
      AND move_highlight_profile_warped_version_id = warped_version_id
    )
  )
`);

function constraintMentionsAnyColumn(constraint, columnNames) {
  const localColumns = Array.isArray(constraint.local_columns)
    ? constraint.local_columns
    : [];
  if (localColumns.some((name) => columnNames.includes(name))) return true;
  const definition = String(constraint.definition || '');
  return columnNames.some((name) => new RegExp(`\\b${name}\\b`, 'i').test(definition));
}

function actionValues(definition) {
  return [
    ...String(definition || '').matchAll(/'([^']+)'/g),
  ].map((match) => match[1]).sort();
}

function generationAttemptMoveHighlightContractIssues(columns, constraints) {
  if (!Array.isArray(columns)) {
    throw new TypeError('generation-attempt move-highlight columns must be an array');
  }
  if (!Array.isArray(constraints)) {
    throw new TypeError('generation-attempt move-highlight constraints must be an array');
  }

  const columnByName = new Map(columns.map((column) => [column.column_name, column]));
  const missingColumns = MOVE_HIGHLIGHT_COLUMN_NAMES.filter(
    (name) => !columnByName.has(name),
  );
  const nonNullableColumns = MOVE_HIGHLIGHT_COLUMN_NAMES.filter(
    (name) => columnByName.has(name) && columnByName.get(name).is_nullable !== 'YES',
  );
  const wrongTypeColumns = MOVE_HIGHLIGHT_COLUMNS
    .filter(({ name, dataType }) => (
      columnByName.has(name)
      && columnByName.get(name).data_type !== dataType
    ))
    .map(({ name }) => name);

  const profileChecks = constraints.filter((constraint) => (
    constraint.table_name === 'predrawn_generation_attempts'
    && constraint.constraint_type === 'c'
    && (
      constraint.constraint_name === 'predrawn_generation_attempts_move_highlight_profile_bundle_check'
      || constraint.constraint_name === MOVE_HIGHLIGHT_BUNDLE_CONSTRAINT
      || constraintMentionsAnyColumn(constraint, MOVE_HIGHLIGHT_COLUMN_NAMES)
    )
  ));
  const canonicalProfileChecks = profileChecks.filter((constraint) => (
    constraint.constraint_name === MOVE_HIGHLIGHT_BUNDLE_CONSTRAINT
    && constraint.validated === true
    && normalizedCheckDefinition(constraint.definition) === CANONICAL_BUNDLE_CHECK
  ));

  const profileForeignKeys = constraints.filter((constraint) => (
    constraint.table_name === 'predrawn_generation_attempts'
    && constraint.constraint_type === 'f'
    && (
      constraint.constraint_name === 'predrawn_generation_attempts_move_highlight_profile_warp_fk'
      || constraintMentionsAnyColumn(
        constraint,
        ['move_highlight_profile_warped_version_id'],
      )
    )
  ));
  const canonicalProfileForeignKeys = profileForeignKeys.filter((constraint) => (
    constraint.constraint_name === 'predrawn_generation_attempts_move_highlight_profile_warp_fk'
    && constraint.validated === true
    && constraint.referenced_schema === 'public'
    && constraint.referenced_table === 'predrawn_background_versions'
    && JSON.stringify(constraint.local_columns)
      === '["move_highlight_profile_warped_version_id","document_id"]'
    && JSON.stringify(constraint.referenced_columns) === '["id","document_id"]'
    && constraint.update_action === 'r'
    && constraint.delete_action === 'r'
  ));

  const attemptActionChecks = constraints.filter((constraint) => (
    constraint.table_name === 'predrawn_generation_attempt_events'
    && constraint.constraint_type === 'c'
    && (
      constraint.constraint_name === 'predrawn_generation_attempt_events_action_check'
      || /\baction\b/i.test(String(constraint.definition || ''))
    )
  ));
  const canonicalAttemptActionChecks = attemptActionChecks.filter((constraint) => (
    constraint.constraint_name === 'predrawn_generation_attempt_events_action_check'
    && constraint.validated === true
    && JSON.stringify(actionValues(constraint.definition))
      === JSON.stringify(FINAL_ATTEMPT_ACTIONS)
  ));

  return Object.freeze({
    missing_move_highlight_profile_columns: Object.freeze(missingColumns),
    non_nullable_move_highlight_profile_columns: Object.freeze(nonNullableColumns),
    wrong_type_move_highlight_profile_columns: Object.freeze(wrongTypeColumns),
    canonical_move_highlight_profile_bundle_check_count: canonicalProfileChecks.length,
    unexpected_move_highlight_profile_bundle_checks: Object.freeze(
      profileChecks
        .filter((constraint) => !canonicalProfileChecks.includes(constraint))
        .map((constraint) => String(constraint.constraint_name || 'unnamed')),
    ),
    canonical_move_highlight_profile_warp_foreign_key_count:
      canonicalProfileForeignKeys.length,
    unexpected_move_highlight_profile_warp_foreign_keys: Object.freeze(
      profileForeignKeys
        .filter((constraint) => !canonicalProfileForeignKeys.includes(constraint))
        .map((constraint) => String(constraint.constraint_name || 'unnamed')),
    ),
    canonical_move_highlight_attempt_action_check_count:
      canonicalAttemptActionChecks.length,
    unexpected_move_highlight_attempt_action_checks: Object.freeze(
      attemptActionChecks
        .filter((constraint) => !canonicalAttemptActionChecks.includes(constraint))
        .map((constraint) => String(constraint.constraint_name || 'unnamed')),
    ),
  });
}

function generationAttemptMoveHighlightContractIssuesPresent(issues) {
  return (
    issues.missing_move_highlight_profile_columns.length > 0
    || issues.non_nullable_move_highlight_profile_columns.length > 0
    || issues.wrong_type_move_highlight_profile_columns.length > 0
    || issues.canonical_move_highlight_profile_bundle_check_count !== 1
    || issues.unexpected_move_highlight_profile_bundle_checks.length > 0
    || issues.canonical_move_highlight_profile_warp_foreign_key_count !== 1
    || issues.unexpected_move_highlight_profile_warp_foreign_keys.length > 0
    || issues.canonical_move_highlight_attempt_action_check_count !== 1
    || issues.unexpected_move_highlight_attempt_action_checks.length > 0
  );
}

module.exports = {
  generationAttemptMoveHighlightContractIssues,
  generationAttemptMoveHighlightContractIssuesPresent,
};
