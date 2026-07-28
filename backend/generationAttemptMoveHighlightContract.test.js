'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  generationAttemptMoveHighlightContractIssues,
  generationAttemptMoveHighlightContractIssuesPresent,
} = require('./generationAttemptMoveHighlightContract');

const COLUMNS = [
  {
    column_name: 'move_highlight_profile',
    is_nullable: 'YES',
    data_type: 'jsonb',
  },
  {
    column_name: 'move_highlight_profile_sha256',
    is_nullable: 'YES',
    data_type: 'text',
  },
  {
    column_name: 'move_highlight_profile_warped_version_id',
    is_nullable: 'YES',
    data_type: 'uuid',
  },
];
const BUNDLE_CHECK = {
  table_name: 'predrawn_generation_attempts',
  constraint_name: 'predrawn_generation_attempts_move_highlight_bundle_check',
  constraint_type: 'c',
  validated: true,
  local_columns: [
    'warped_version_id',
    'move_highlight_profile',
    'move_highlight_profile_sha256',
    'move_highlight_profile_warped_version_id',
  ],
  definition: `CHECK (
    (
      (
        (move_highlight_profile IS NULL)
        AND (move_highlight_profile_sha256 IS NULL)
        AND (move_highlight_profile_warped_version_id IS NULL)
      )
      OR
      (
        (move_highlight_profile IS NOT NULL)
        AND (move_highlight_profile_sha256 IS NOT NULL)
        AND (move_highlight_profile_warped_version_id IS NOT NULL)
        AND (jsonb_typeof(move_highlight_profile) = 'object'::text)
        AND (move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'::text)
        AND (move_highlight_profile_warped_version_id = warped_version_id)
      )
    )
  )`,
};
const WARP_FOREIGN_KEY = {
  table_name: 'predrawn_generation_attempts',
  constraint_name: 'predrawn_generation_attempts_move_highlight_profile_warp_fk',
  constraint_type: 'f',
  validated: true,
  local_columns: ['move_highlight_profile_warped_version_id', 'document_id'],
  referenced_schema: 'public',
  referenced_table: 'predrawn_background_versions',
  referenced_columns: ['id', 'document_id'],
  update_action: 'r',
  delete_action: 'r',
  definition: 'FOREIGN KEY (move_highlight_profile_warped_version_id, document_id) REFERENCES predrawn_background_versions(id, document_id) ON UPDATE RESTRICT ON DELETE RESTRICT',
};
const ACTION_CHECK = {
  table_name: 'predrawn_generation_attempt_events',
  constraint_name: 'predrawn_generation_attempt_events_action_check',
  constraint_type: 'c',
  validated: true,
  local_columns: ['action'],
  definition: "CHECK ((action = ANY (ARRAY['created'::text, 'stage-attached'::text, 'stage-discarded'::text, 'move-highlight-profile-updated'::text, 'archived'::text])))",
};

function issuesFor(
  columns = COLUMNS,
  constraints = [BUNDLE_CHECK, WARP_FOREIGN_KEY, ACTION_CHECK],
) {
  return generationAttemptMoveHighlightContractIssues(columns, constraints);
}

test('move-highlight readiness accepts the complete nullable bundle, warp FK, and action set', () => {
  const issues = issuesFor();
  assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), false);
  assert.deepEqual(issues, {
    missing_move_highlight_profile_columns: [],
    non_nullable_move_highlight_profile_columns: [],
    wrong_type_move_highlight_profile_columns: [],
    canonical_move_highlight_profile_bundle_check_count: 1,
    unexpected_move_highlight_profile_bundle_checks: [],
    canonical_move_highlight_profile_warp_foreign_key_count: 1,
    unexpected_move_highlight_profile_warp_foreign_keys: [],
    canonical_move_highlight_attempt_action_check_count: 1,
    unexpected_move_highlight_attempt_action_checks: [],
  });
});

test('every profile column must exist with its exact nullable type', () => {
  const variants = [
    COLUMNS.slice(1),
    COLUMNS.map((column) => (
      column.column_name === 'move_highlight_profile'
        ? { ...column, is_nullable: 'NO' }
        : column
    )),
    COLUMNS.map((column) => (
      column.column_name === 'move_highlight_profile_sha256'
        ? { ...column, data_type: 'character varying' }
        : column
    )),
  ];

  for (const columns of variants) {
    const issues = issuesFor(columns);
    assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), true);
  }
  assert.deepEqual(
    issuesFor(variants[0]).missing_move_highlight_profile_columns,
    ['move_highlight_profile'],
  );
  assert.deepEqual(
    issuesFor(variants[1]).non_nullable_move_highlight_profile_columns,
    ['move_highlight_profile'],
  );
  assert.deepEqual(
    issuesFor(variants[2]).wrong_type_move_highlight_profile_columns,
    ['move_highlight_profile_sha256'],
  );
});

test('the bundle check must enforce the null and populated halves explicitly', () => {
  const partialNullPermissiveCheck = {
    ...BUNDLE_CHECK,
    definition: `CHECK (
      (
        move_highlight_profile IS NULL
        AND move_highlight_profile_sha256 IS NULL
        AND move_highlight_profile_warped_version_id IS NULL
      )
      OR
      (
        jsonb_typeof(move_highlight_profile) = 'object'
        AND move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'
        AND move_highlight_profile_warped_version_id = warped_version_id
      )
    )`,
  };
  const issues = issuesFor(COLUMNS, [
    partialNullPermissiveCheck,
    WARP_FOREIGN_KEY,
    ACTION_CHECK,
  ]);
  assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), true);
  assert.equal(issues.canonical_move_highlight_profile_bundle_check_count, 0);
  assert.deepEqual(
    issues.unexpected_move_highlight_profile_bundle_checks,
    [BUNDLE_CHECK.constraint_name],
  );
});

test('renamed, unvalidated, weakened, or duplicate profile checks fail readiness', () => {
  for (const changed of [
    { ...BUNDLE_CHECK, constraint_name: 'almost_the_profile_bundle_check' },
    { ...BUNDLE_CHECK, validated: false },
    {
      ...BUNDLE_CHECK,
      definition: BUNDLE_CHECK.definition.replace(
        "AND (move_highlight_profile_sha256 ~ '^[0-9a-f]{64}$'::text)",
        '',
      ),
    },
  ]) {
    const issues = issuesFor(COLUMNS, [changed, WARP_FOREIGN_KEY, ACTION_CHECK]);
    assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), true);
    assert.equal(issues.canonical_move_highlight_profile_bundle_check_count, 0);
    assert.deepEqual(
      issues.unexpected_move_highlight_profile_bundle_checks,
      [changed.constraint_name],
    );
  }

  const duplicate = issuesFor(COLUMNS, [
    BUNDLE_CHECK,
    { ...BUNDLE_CHECK, constraint_name: 'duplicate_profile_bundle_check' },
    WARP_FOREIGN_KEY,
    ACTION_CHECK,
  ]);
  assert.equal(generationAttemptMoveHighlightContractIssuesPresent(duplicate), true);
  assert.equal(duplicate.canonical_move_highlight_profile_bundle_check_count, 1);
  assert.deepEqual(
    duplicate.unexpected_move_highlight_profile_bundle_checks,
    ['duplicate_profile_bundle_check'],
  );
});

test('the profile warp FK must keep its exact composite restrictive topology', () => {
  for (const changed of [
    { ...WARP_FOREIGN_KEY, constraint_name: 'almost_the_profile_warp_fk' },
    { ...WARP_FOREIGN_KEY, validated: false },
    { ...WARP_FOREIGN_KEY, local_columns: ['move_highlight_profile_warped_version_id'] },
    { ...WARP_FOREIGN_KEY, referenced_columns: ['id'] },
    { ...WARP_FOREIGN_KEY, delete_action: 'c' },
  ]) {
    const issues = issuesFor(COLUMNS, [BUNDLE_CHECK, changed, ACTION_CHECK]);
    assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), true);
    assert.equal(issues.canonical_move_highlight_profile_warp_foreign_key_count, 0);
    assert.deepEqual(
      issues.unexpected_move_highlight_profile_warp_foreign_keys,
      [changed.constraint_name],
    );
  }
});

test('the final action check requires exactly the move-highlight action set', () => {
  for (const changed of [
    { ...ACTION_CHECK, constraint_name: 'almost_the_action_check' },
    { ...ACTION_CHECK, validated: false },
    {
      ...ACTION_CHECK,
      definition: ACTION_CHECK.definition.replace(
        ", 'move-highlight-profile-updated'::text",
        '',
      ),
    },
    {
      ...ACTION_CHECK,
      definition: ACTION_CHECK.definition.replace(
        "'archived'::text",
        "'archived'::text, 'unexpected-action'::text",
      ),
    },
  ]) {
    const issues = issuesFor(COLUMNS, [BUNDLE_CHECK, WARP_FOREIGN_KEY, changed]);
    assert.equal(generationAttemptMoveHighlightContractIssuesPresent(issues), true);
    assert.equal(issues.canonical_move_highlight_attempt_action_check_count, 0);
    assert.deepEqual(
      issues.unexpected_move_highlight_attempt_action_checks,
      [changed.constraint_name],
    );
  }
});
