'use strict';

const crypto = require('node:crypto');

const SHA256 = /^[0-9a-f]{64}$/;

class MigrationIntegrityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MigrationIntegrityError';
    this.code = 'schema_migration_history_invalid';
    this.details = details;
  }
}

class MigrationExecutionError extends Error {
  constructor(message, details, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MigrationExecutionError';
    this.code = 'schema_migration_execution_failed';
    this.details = details;
    this.migrationRunResult = details.migration_run_result;
  }
}

function migrationDefinition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('migration must be an object');
  }
  if (!Number.isSafeInteger(value.version) || value.version <= 0) {
    throw new TypeError('migration version must be a positive integer');
  }
  if (typeof value.name !== 'string' || !value.name.trim()) {
    throw new TypeError(`migration ${value.version} name must be a non-empty string`);
  }
  if (typeof value.sql !== 'string' || !value.sql.trim()) {
    throw new TypeError(`migration ${value.version} SQL must be a non-empty string`);
  }
  return {
    version: value.version,
    name: value.name,
    // Repository checkouts may use LF or CRLF. That transport-level difference
    // must not make identical migration source look mutated.
    sql: value.sql.replace(/\r\n?/g, '\n'),
  };
}

function migrationChecksum(value) {
  const migration = migrationDefinition(value);
  return crypto.createHash('sha256').update(JSON.stringify(migration), 'utf8').digest('hex');
}

function migrationManifest(migrations) {
  if (!Array.isArray(migrations)) throw new TypeError('migrations must be an array');
  const manifest = [];
  for (const value of migrations) {
    const migration = migrationDefinition(value);
    const expectedVersion = manifest.length + 1;
    if (migration.version !== expectedVersion) {
      throw new MigrationIntegrityError(
        `migration registry must be contiguous from version 1; expected ${expectedVersion}, found ${migration.version}`,
        { expected_version: expectedVersion, actual_version: migration.version },
      );
    }
    manifest.push(Object.freeze({
      version: migration.version,
      name: migration.name,
      checksum: migrationChecksum(migration),
    }));
  }
  return Object.freeze(manifest);
}

function historyVersion(value) {
  const version = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new MigrationIntegrityError('applied migration history contains an invalid version', {
      version: value,
    });
  }
  return version;
}

function compareMigrationHistory(migrations, appliedRows) {
  if (!Array.isArray(appliedRows)) {
    throw new TypeError('applied migration history must be an array');
  }
  const manifest = migrationManifest(migrations);
  const expectedByVersion = new Map(manifest.map((entry) => [entry.version, entry]));
  const appliedByVersion = new Map();
  for (const row of appliedRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new MigrationIntegrityError('applied migration history contains an invalid row');
    }
    const version = historyVersion(row.version);
    if (appliedByVersion.has(version)) {
      throw new MigrationIntegrityError(`applied migration history contains duplicate version ${version}`, {
        duplicate_version: version,
      });
    }
    appliedByVersion.set(version, row);
  }

  const matching = [];
  const pending = [];
  const unsealed = [];
  const changed = [];
  const unexpected = [];
  const gaps = [];
  let encounteredMissingVersion = false;

  for (const expected of manifest) {
    const applied = appliedByVersion.get(expected.version);
    if (!applied) {
      pending.push(expected);
      encounteredMissingVersion = true;
      continue;
    }
    if (encounteredMissingVersion) {
      gaps.push(Object.freeze({ version: expected.version }));
    }
    const nameIsUnsealed = applied.name === null || applied.name === undefined;
    const checksumIsUnsealed = applied.checksum === null || applied.checksum === undefined;
    const hasRecordedName = !nameIsUnsealed && typeof applied.name === 'string';
    const hasRecordedChecksum = !checksumIsUnsealed && typeof applied.checksum === 'string';
    const recordedName = hasRecordedName ? applied.name : '';
    const recordedChecksum = hasRecordedChecksum
      ? applied.checksum.toLowerCase()
      : '';
    const changedFields = [];
    if (!nameIsUnsealed && (!hasRecordedName || recordedName !== expected.name)) {
      changedFields.push('name');
    }
    if (!checksumIsUnsealed && (!hasRecordedChecksum
      || !SHA256.test(recordedChecksum) || recordedChecksum !== expected.checksum)) {
      changedFields.push('checksum');
    }
    if (changedFields.length) {
      changed.push(Object.freeze({
        version: expected.version,
        fields: Object.freeze(changedFields),
        expected_name: expected.name,
        recorded_name: recordedName,
        expected_checksum: expected.checksum,
        recorded_checksum: recordedChecksum,
      }));
      continue;
    }
    if (nameIsUnsealed || checksumIsUnsealed) {
      unsealed.push(Object.freeze({
        version: expected.version,
        expected_name: expected.name,
        expected_checksum: expected.checksum,
        recorded_name: recordedName,
        recorded_checksum: recordedChecksum,
      }));
      continue;
    }
    matching.push(expected);
  }

  for (const [version, row] of appliedByVersion) {
    if (expectedByVersion.has(version)) continue;
    unexpected.push(Object.freeze({
      version,
      recorded_name: typeof row.name === 'string' ? row.name : '',
      recorded_checksum: typeof row.checksum === 'string' ? row.checksum.toLowerCase() : '',
    }));
  }

  return Object.freeze({
    matching: Object.freeze(matching),
    pending: Object.freeze(pending),
    unsealed: Object.freeze(unsealed),
    changed: Object.freeze(changed),
    unexpected: Object.freeze(unexpected),
    gaps: Object.freeze(gaps),
  });
}

function formatVersions(entries) {
  return entries.length ? entries.map((entry) => entry.version).join(', ') : 'none';
}

function assertMigrationHistoryImmutable(comparison, options = {}) {
  if (!comparison || typeof comparison !== 'object') {
    throw new TypeError('migration history comparison is required');
  }
  const allowUnsealed = options.allowUnsealed === true;
  const allowedLegacySparseVersions = new Set(
    (options.allowLegacySparseVersions || []).map(historyVersion),
  );
  const numericOnlyUnsealedVersions = new Set(
    comparison.unsealed
      .filter((entry) => !entry.recorded_name && !entry.recorded_checksum)
      .map((entry) => entry.version),
  );
  const rejectedGaps = comparison.gaps.filter(
    (entry) => !allowedLegacySparseVersions.has(entry.version)
      || !numericOnlyUnsealedVersions.has(entry.version),
  );
  const violations = [];
  if (comparison.changed.length) {
    violations.push(`changed: ${formatVersions(comparison.changed)}`);
  }
  if (comparison.unexpected.length) {
    violations.push(`missing from source: ${formatVersions(comparison.unexpected)}`);
  }
  if (rejectedGaps.length) {
    violations.push(`recorded after a missing earlier migration: ${formatVersions(rejectedGaps)}`);
  }
  if (!allowUnsealed && comparison.unsealed.length) {
    violations.push(`without checksums: ${formatVersions(comparison.unsealed)}`);
  }
  if (violations.length) {
    throw new MigrationIntegrityError(
      `applied migration history is not immutable (${violations.join('; ')})`,
      {
        changed_versions: comparison.changed.map((entry) => entry.version),
        unexpected_versions: comparison.unexpected.map((entry) => entry.version),
        unsealed_versions: comparison.unsealed.map((entry) => entry.version),
        out_of_order_versions: rejectedGaps.map((entry) => entry.version),
      },
    );
  }
  return comparison;
}

function planMigrationExecution(migrations, appliedRows, options = {}) {
  const comparison = compareMigrationHistory(migrations, appliedRows);
  assertMigrationHistoryImmutable(comparison, options);
  const skipped = [...comparison.matching];
  if (options.allowUnsealed === true) {
    const manifestByVersion = new Map(
      migrationManifest(migrations).map((entry) => [entry.version, entry]),
    );
    for (const entry of comparison.unsealed) {
      skipped.push(manifestByVersion.get(entry.version));
    }
    skipped.sort((left, right) => left.version - right.version);
  }
  return Object.freeze({
    pending: comparison.pending,
    skipped: Object.freeze(skipped),
  });
}

function migrationRunResult(plan, appliedVersions, activity = {}) {
  if (!plan || !Array.isArray(plan.pending) || !Array.isArray(plan.skipped)) {
    throw new TypeError('migration execution plan is required');
  }
  if (!Array.isArray(appliedVersions)) {
    throw new TypeError('applied migration versions must be an array');
  }
  const pendingByVersion = new Map(plan.pending.map((entry) => [entry.version, entry]));
  const applied = [];
  const seen = new Set();
  for (const value of appliedVersions) {
    const version = historyVersion(value);
    if (seen.has(version)) {
      throw new MigrationIntegrityError(`migration run reported version ${version} more than once`, {
        duplicate_applied_version: version,
      });
    }
    const entry = pendingByVersion.get(version);
    if (!entry) {
      throw new MigrationIntegrityError(
        `migration run reported version ${version} as applied although it was not pending`,
        { unplanned_applied_version: version },
      );
    }
    seen.add(version);
    applied.push(entry);
  }
  applied.sort((left, right) => left.version - right.version);
  const stillPending = plan.pending.filter((entry) => !seen.has(entry.version));
  const completedRelationRepairSteps = Array.isArray(activity.completedRelationRepairSteps)
    ? activity.completedRelationRepairSteps.map((entry) => Object.freeze({
      relation: String(entry.relation),
      migration_version: historyVersion(entry.migration_version),
    }))
    : [];
  const completedContractRepairSteps = Array.isArray(activity.completedContractRepairSteps)
    ? activity.completedContractRepairSteps.map((entry) => Object.freeze({
      contract: String(entry.contract),
      migration_version: historyVersion(entry.migration_version),
    }))
    : [];
  const sealedLegacyVersions = Array.isArray(activity.sealedLegacyVersions)
    ? [...new Set(activity.sealedLegacyVersions.map(historyVersion))].sort((left, right) => left - right)
    : [];
  return Object.freeze({
    applied: Object.freeze(applied),
    skipped: plan.skipped,
    pending: Object.freeze(stillPending),
    completed_relation_repair_steps: Object.freeze(completedRelationRepairSteps),
    completed_contract_repair_steps: Object.freeze(completedContractRepairSteps),
    sealed_legacy_versions: Object.freeze(sealedLegacyVersions),
  });
}

function formatMigrationEntries(entries) {
  return entries.length
    ? entries.map((entry) => `${entry.version} (${entry.name})`).join(', ')
    : 'none';
}

function formatMigrationRunResult(result) {
  if (!result || !Array.isArray(result.applied)
    || !Array.isArray(result.skipped) || !Array.isArray(result.pending)) {
    throw new TypeError('migration run result is required');
  }
  const completedRelationRepairSteps = Array.isArray(result.completed_relation_repair_steps)
    ? result.completed_relation_repair_steps
    : [];
  const completedContractRepairSteps = Array.isArray(result.completed_contract_repair_steps)
    ? result.completed_contract_repair_steps
    : [];
  const sealedLegacyVersions = Array.isArray(result.sealed_legacy_versions)
    ? result.sealed_legacy_versions
    : [];
  return [
    `schema migrations applied: ${formatMigrationEntries(result.applied)}`,
    `skipped (already applied): ${formatMigrationEntries(result.skipped)}`,
    `pending: ${formatMigrationEntries(result.pending)}`,
    `relation repair steps completed: ${completedRelationRepairSteps.length
      ? completedRelationRepairSteps.map((entry) => `${entry.relation} (migration ${entry.migration_version})`).join(', ')
      : 'none'}`,
    `contract repair steps completed: ${completedContractRepairSteps.length
      ? completedContractRepairSteps.map((entry) => `${entry.contract} (migration ${entry.migration_version})`).join(', ')
      : 'none'}`,
    `sealed legacy migration identities: ${sealedLegacyVersions.length
      ? sealedLegacyVersions.join(', ')
      : 'none'}`,
  ].join('; ');
}

function migrationExecutionFailure(plan, appliedVersions, failedMigration, phase, cause, activity = {}) {
  const result = migrationRunResult(plan, appliedVersions, activity);
  const failurePhase = typeof phase === 'string' && phase.trim()
    ? phase.trim()
    : 'apply';
  let failedEntry = null;
  if (failedMigration !== null && failedMigration !== undefined) {
    if (typeof failedMigration !== 'object') throw new TypeError('failed migration must be an object');
    const failedDefinition = migrationDefinition(failedMigration);
    const plannedVersions = new Set([
      ...result.pending,
      ...result.applied,
      ...result.skipped,
    ].map((entry) => entry.version));
    if (!plannedVersions.has(failedDefinition.version)) {
      throw new MigrationIntegrityError(
        `migration run reported version ${failedDefinition.version} as failed although it was not part of this run`,
        { unplanned_failed_version: failedDefinition.version },
      );
    }
    failedEntry = Object.freeze({
      version: failedDefinition.version,
      name: failedDefinition.name,
      phase: failurePhase,
    });
  }
  const causeMessage = cause instanceof Error
    ? cause.message
    : String(cause || 'unknown failure');
  const summary = [
    formatMigrationRunResult(result),
    failedEntry
      ? `failed: ${failedEntry.version} (${failedEntry.name}) during ${failedEntry.phase}`
      : `failed: ${failurePhase}`,
    `cause: ${causeMessage}`,
  ].join('; ');
  return new MigrationExecutionError(
    summary,
    Object.freeze({
      migration_run_result: result,
      failed_migration: failedEntry,
      failed_phase: failurePhase,
      cause_message: causeMessage,
    }),
    cause instanceof Error ? cause : undefined,
  );
}

function formatMigrationRunFailure(error) {
  if (!(error instanceof MigrationExecutionError)) {
    throw new TypeError('migration execution error is required');
  }
  return error.message;
}

module.exports = {
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
};
