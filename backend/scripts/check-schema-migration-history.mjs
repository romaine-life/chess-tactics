import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  assertMigrationSourceAppendOnly,
  extractInlineMigrations,
} = require('../schemaMigrationSource');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(backendDir, '..');
const currentSource = fs.readFileSync(path.join(backendDir, 'server.js'), 'utf8');
const currentMigrations = extractInlineMigrations(currentSource);
// `server.js` owns the inline migration registry and is intentionally a large monolithic
// source file. Node's child-process default is only 1 MiB, so reading the base blob through
// Git must provision enough output capacity for the complete source before comparing it.
const gitSourceMaxBuffer = Math.max(16 * 1024 * 1024, Buffer.byteLength(currentSource, 'utf8') * 2);

function requestedBaseRef() {
  const explicitArgument = process.argv.find((value) => value.startsWith('--base-ref='));
  if (explicitArgument) return explicitArgument.slice('--base-ref='.length);
  if (process.env.MIGRATION_BASE_REF) return process.env.MIGRATION_BASE_REF;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  if (process.env.CI === 'true') return 'HEAD^';
  return 'origin/main';
}

const baseRef = requestedBaseRef();
let baseSource;
try {
  baseSource = execFileSync(
    'git',
    ['show', `${baseRef}:backend/server.js`],
    {
      cwd: repositoryDir,
      encoding: 'utf8',
      maxBuffer: gitSourceMaxBuffer,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
} catch (error) {
  const detail = String(error.stderr || error.message || '').trim();
  if (process.env.CI === 'true') {
    throw new Error(`cannot verify immutable migrations against ${baseRef}: ${detail}`);
  }
  console.warn(`schema migration base ${baseRef} is unavailable; current registry structure was validated only`);
  process.exit(0);
}

const result = assertMigrationSourceAppendOnly(
  currentMigrations,
  extractInlineMigrations(baseSource, { allowSparse: true }),
  { allowSparseBase: true },
);
console.log(
  `schema migration history is append-only against ${baseRef}: `
  + `${result.existing_versions} immutable, ${result.appended_versions} appended`,
);
