'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  generationAttemptRetryContractIssues,
  generationAttemptRetryContractIssuesPresent,
} = require('./generationAttemptRetryContract');

const COLUMN = {
  column_name: 'processing_revision',
  is_nullable: 'NO',
  data_type: 'bigint',
  column_default: '0',
};
const PROCESSING_CHECK = {
  table_name: 'predrawn_generation_attempts',
  constraint_name: 'predrawn_generation_attempts_processing_revision_check',
  validated: true,
  definition: 'CHECK ((processing_revision >= 0))',
};
const ACTION_CHECK = {
  table_name: 'predrawn_generation_attempt_events',
  constraint_name: 'predrawn_generation_attempt_events_action_check',
  validated: true,
  definition: "CHECK ((action = ANY (ARRAY['created'::text, 'stage-attached'::text, 'stage-discarded'::text, 'archived'::text])))",
};
const LATER_ACTION_CHECK = {
  ...ACTION_CHECK,
  definition: "CHECK ((action = ANY (ARRAY['created'::text, 'stage-attached'::text, 'stage-discarded'::text, 'move-highlight-profile-updated'::text, 'archived'::text])))",
};

test('same-slot warp retry readiness requires its stable processing revision and audit action', () => {
  const issues = generationAttemptRetryContractIssues(
    [COLUMN],
    [PROCESSING_CHECK, ACTION_CHECK],
  );
  assert.equal(generationAttemptRetryContractIssuesPresent(issues), false);
  assert.deepEqual(issues, {
    generation_attempt_processing_revision_column_valid: true,
    canonical_generation_attempt_processing_check_count: 1,
    unexpected_generation_attempt_processing_checks: [],
    canonical_generation_attempt_action_check_count: 1,
    unexpected_generation_attempt_action_checks: [],
  });
});

test('later generation-attempt actions do not invalidate the retry contract subset', () => {
  const issues = generationAttemptRetryContractIssues(
    [COLUMN],
    [PROCESSING_CHECK, LATER_ACTION_CHECK],
  );
  assert.equal(generationAttemptRetryContractIssuesPresent(issues), false);
  assert.equal(issues.canonical_generation_attempt_action_check_count, 1);
  assert.deepEqual(issues.unexpected_generation_attempt_action_checks, []);
});

test('missing, nullable, or non-bigint processing revision fails readiness', () => {
  for (const columns of [
    [],
    [{ ...COLUMN, is_nullable: 'YES' }],
    [{ ...COLUMN, data_type: 'integer' }],
    [{ ...COLUMN, column_default: null }],
  ]) {
    const issues = generationAttemptRetryContractIssues(
      columns,
      [PROCESSING_CHECK, ACTION_CHECK],
    );
    assert.equal(generationAttemptRetryContractIssuesPresent(issues), true);
    assert.equal(issues.generation_attempt_processing_revision_column_valid, false);
  }
});

test('a weakened, renamed, duplicate, or pre-discard action check fails readiness', () => {
  for (const changed of [
    { ...ACTION_CHECK, validated: false },
    { ...ACTION_CHECK, constraint_name: 'almost_the_action_check' },
    {
      ...ACTION_CHECK,
      definition: "CHECK ((action = ANY (ARRAY['created'::text, 'stage-attached'::text, 'archived'::text])))",
    },
  ]) {
    const issues = generationAttemptRetryContractIssues(
      [COLUMN],
      [PROCESSING_CHECK, changed],
    );
    assert.equal(generationAttemptRetryContractIssuesPresent(issues), true);
    assert.equal(issues.canonical_generation_attempt_action_check_count, 0);
    assert.deepEqual(
      issues.unexpected_generation_attempt_action_checks,
      [changed.constraint_name],
    );
  }

  const duplicate = generationAttemptRetryContractIssues(
    [COLUMN],
    [
      PROCESSING_CHECK,
      ACTION_CHECK,
      { ...ACTION_CHECK, constraint_name: 'duplicate_action_check' },
    ],
  );
  assert.equal(generationAttemptRetryContractIssuesPresent(duplicate), true);
  assert.equal(duplicate.canonical_generation_attempt_action_check_count, 1);
  assert.deepEqual(
    duplicate.unexpected_generation_attempt_action_checks,
    ['duplicate_action_check'],
  );
});
