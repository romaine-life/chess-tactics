'use strict';

function generationAttemptRetryContractIssues(columns, constraints) {
  const processingColumn = columns.find(
    (column) => column.column_name === 'processing_revision',
  );
  const processingChecks = constraints.filter(
    (constraint) => (
      constraint.table_name === 'predrawn_generation_attempts'
      && /\bprocessing_revision\b/i.test(String(constraint.definition || ''))
    ),
  );
  const canonicalProcessingChecks = processingChecks.filter(
    (constraint) => (
      constraint.constraint_name === 'predrawn_generation_attempts_processing_revision_check'
      && constraint.validated === true
      && /\bprocessing_revision\b\s*>=\s*0\b/i.test(String(constraint.definition || ''))
    ),
  );
  const actionChecks = constraints.filter(
    (constraint) => (
      constraint.table_name === 'predrawn_generation_attempt_events'
      && /\baction\b/i.test(String(constraint.definition || ''))
    ),
  );
  const requiredActions = ['archived', 'created', 'stage-attached', 'stage-discarded'];
  const canonicalActionChecks = actionChecks.filter((constraint) => {
    const actionValues = new Set([
      ...String(constraint.definition || '').matchAll(/'([^']+)'/g),
    ].map((match) => match[1]));
    return (
      constraint.constraint_name === 'predrawn_generation_attempt_events_action_check'
      && constraint.validated === true
      && requiredActions.every((action) => actionValues.has(action))
    );
  });
  return Object.freeze({
    generation_attempt_processing_revision_column_valid: Boolean(
      processingColumn
      && processingColumn.is_nullable === 'NO'
      && processingColumn.data_type === 'bigint'
      && /\b0\b/.test(String(processingColumn.column_default || '')),
    ),
    canonical_generation_attempt_processing_check_count: canonicalProcessingChecks.length,
    unexpected_generation_attempt_processing_checks: Object.freeze(
      processingChecks
        .filter((constraint) => !canonicalProcessingChecks.includes(constraint))
        .map((constraint) => constraint.constraint_name),
    ),
    canonical_generation_attempt_action_check_count: canonicalActionChecks.length,
    unexpected_generation_attempt_action_checks: Object.freeze(
      actionChecks
        .filter((constraint) => !canonicalActionChecks.includes(constraint))
        .map((constraint) => constraint.constraint_name),
    ),
  });
}

function generationAttemptRetryContractIssuesPresent(issues) {
  return (
    !issues.generation_attempt_processing_revision_column_valid
    || issues.canonical_generation_attempt_processing_check_count !== 1
    || issues.unexpected_generation_attempt_processing_checks.length > 0
    || issues.canonical_generation_attempt_action_check_count !== 1
    || issues.unexpected_generation_attempt_action_checks.length > 0
  );
}

module.exports = {
  generationAttemptRetryContractIssues,
  generationAttemptRetryContractIssuesPresent,
};
