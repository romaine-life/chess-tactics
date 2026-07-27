'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatSchemaMigrationTarget,
  schemaMigrationTarget,
} = require('./schemaMigrationTarget');

test('connection-string migration target is human-readable and never prints credentials', () => {
  const target = schemaMigrationTarget({
    DATABASE_URL: 'postgres://nelson%40example.com:super-secret@db.example.com:5432/chess_tactics?sslmode=require',
  });
  assert.deepEqual(target, {
    mode: 'connection-string',
    host: 'db.example.com',
    database: 'chess_tactics',
    user: 'nelson@example.com',
  });
  const output = formatSchemaMigrationTarget(target);
  assert.equal(
    output,
    'mode=connection-string; host=db.example.com; database=chess_tactics; user=nelson@example.com',
  );
  assert.doesNotMatch(output, /super-secret|5432|sslmode/);
});

test('workload-identity migration target names the exact configured database principal', () => {
  assert.equal(
    formatSchemaMigrationTarget(schemaMigrationTarget({
      POSTGRES_HOST: 'database.internal',
      POSTGRES_DATABASE: 'chess',
      POSTGRES_USER: 'service@example.com',
    })),
    'mode=workload-identity; host=database.internal; database=chess; user=service@example.com',
  );
});
