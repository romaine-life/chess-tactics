'use strict';

function decodedUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function schemaMigrationTarget(env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    return Object.freeze({
      mode: 'connection-string',
      host: parsed.hostname,
      database: decodedUrlPart(parsed.pathname.replace(/^\/+/, '')),
      user: decodedUrlPart(parsed.username),
    });
  }
  return Object.freeze({
    mode: 'workload-identity',
    host: String(env.POSTGRES_HOST || ''),
    database: String(env.POSTGRES_DATABASE || env.POSTGRES_DB || ''),
    user: String(env.POSTGRES_USER || ''),
  });
}

function formatSchemaMigrationTarget(target) {
  return [
    `mode=${target.mode || 'unknown'}`,
    `host=${target.host || '(missing)'}`,
    `database=${target.database || '(missing)'}`,
    `user=${target.user || '(missing)'}`,
  ].join('; ');
}

module.exports = {
  formatSchemaMigrationTarget,
  schemaMigrationTarget,
};
