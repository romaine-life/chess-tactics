'use strict';

const vm = require('node:vm');
const {
  MigrationIntegrityError,
  migrationChecksum,
  migrationManifest,
} = require('./schemaMigrationIntegrity');

const MIGRATION_REGISTRY_MARKER = 'const MIGRATIONS = [';

function migrationArraySource(serverSource) {
  if (typeof serverSource !== 'string') throw new TypeError('server source must be a string');
  const markerStart = serverSource.indexOf(MIGRATION_REGISTRY_MARKER);
  if (markerStart < 0) {
    throw new MigrationIntegrityError('server source does not contain the migration registry');
  }
  const arrayStart = serverSource.indexOf('[', markerStart);
  let depth = 0;
  let mode = 'code';
  let escaped = false;
  for (let index = arrayStart; index < serverSource.length; index += 1) {
    const character = serverSource[index];
    const next = serverSource[index + 1];
    if (mode === 'line-comment') {
      if (character === '\n') mode = 'code';
      continue;
    }
    if (mode === 'block-comment') {
      if (character === '*' && next === '/') {
        mode = 'code';
        index += 1;
      }
      continue;
    }
    if (mode !== 'code') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (
        (mode === 'single-quote' && character === "'")
        || (mode === 'double-quote' && character === '"')
        || (mode === 'template' && character === '`')
      ) {
        mode = 'code';
      }
      continue;
    }
    if (character === '/' && next === '/') {
      mode = 'line-comment';
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      mode = 'block-comment';
      index += 1;
      continue;
    }
    if (character === "'") {
      mode = 'single-quote';
      continue;
    }
    if (character === '"') {
      mode = 'double-quote';
      continue;
    }
    if (character === '`') {
      mode = 'template';
      continue;
    }
    if (character === '[') depth += 1;
    if (character !== ']') continue;
    depth -= 1;
    if (depth === 0) return serverSource.slice(arrayStart, index + 1);
  }
  throw new MigrationIntegrityError('server migration registry is not a closed array');
}

function sparseMigrationManifest(migrations) {
  if (!Array.isArray(migrations)) throw new TypeError('migrations must be an array');
  const manifest = [];
  let previousVersion = 0;
  for (const migration of migrations) {
    // migrationChecksum performs the complete definition validation and
    // transport-independent SQL normalization used by the runtime manifest.
    const checksum = migrationChecksum(migration);
    if (migration.version <= previousVersion) {
      throw new MigrationIntegrityError(
        `sparse migration registry must be strictly increasing; found ${migration.version} after ${previousVersion}`,
        {
          previous_version: previousVersion,
          actual_version: migration.version,
        },
      );
    }
    manifest.push(Object.freeze({
      version: migration.version,
      name: migration.name,
      checksum,
    }));
    previousVersion = migration.version;
  }
  return Object.freeze(manifest);
}

function extractInlineMigrations(serverSource, options = {}) {
  const arraySource = migrationArraySource(serverSource);
  if (arraySource.includes('${')) {
    throw new MigrationIntegrityError('migration definitions cannot contain template interpolation');
  }
  let migrations;
  try {
    migrations = vm.runInNewContext(`(${arraySource})`, Object.create(null), { timeout: 1000 });
  } catch (error) {
    throw new MigrationIntegrityError(`migration registry cannot be evaluated: ${error.message}`);
  }
  if (options.allowSparse === true) {
    sparseMigrationManifest(migrations);
  } else {
    migrationManifest(migrations);
  }
  return Array.from(migrations, (migration) => ({
    version: migration.version,
    name: migration.name,
    sql: migration.sql,
  }));
}

function assertMigrationSourceAppendOnly(currentMigrations, baseMigrations, options = {}) {
  const currentManifest = migrationManifest(currentMigrations);
  const baseManifest = options.allowSparseBase === true
    ? sparseMigrationManifest(baseMigrations)
    : migrationManifest(baseMigrations);
  const currentByVersion = new Map(currentManifest.map((entry) => [entry.version, entry]));
  const changed = [];
  const removed = [];
  for (const baseEntry of baseManifest) {
    const currentEntry = currentByVersion.get(baseEntry.version);
    if (!currentEntry) {
      removed.push(baseEntry.version);
    } else if (
      currentEntry.name !== baseEntry.name
      || currentEntry.checksum !== baseEntry.checksum
    ) {
      changed.push(baseEntry.version);
    }
  }
  if (changed.length || removed.length) {
    throw new MigrationIntegrityError(
      `migration source is not append-only (changed: ${changed.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'})`,
      { changed_versions: changed, removed_versions: removed },
    );
  }
  return Object.freeze({
    existing_versions: baseManifest.length,
    appended_versions: currentManifest.length - baseManifest.length,
  });
}

module.exports = {
  assertMigrationSourceAppendOnly,
  extractInlineMigrations,
  migrationArraySource,
};
