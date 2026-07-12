const http = require('http');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const port = 31337;
const authPort = 31338;
const bgmPort = 31339;
const hotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-tactics-hot-'));
const hotBackendDir = path.join(hotRoot, 'backend');
const hotStaticDir = path.join(hotRoot, 'static');
const liveMediaStorageDir = path.join(hotRoot, 'live-media');
const mockAuth = http.createServer((req, res) => {
  if (req.url === '/api/auth/get-session') {
    if (!req.headers.cookie || !req.headers.cookie.includes('better-auth.session')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('null');
      return;
    }
    if (req.headers.cookie.includes('better-auth.session=rival')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        user: {
          email: 'rival@example.com',
          name: 'Lobby Rival',
          role: 'pending',
        },
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      user: {
        email: 'player@example.com',
        name: 'Tactics Player',
        role: 'pending',
      },
    }));
    return;
  }
  if (req.url === '/api/auth/sign-out' && req.method === 'POST') {
    if (req.headers.origin !== 'https://chess.romaine.life') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'MISSING_OR_NULL_ORIGIN' }));
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'better-auth.session=; Max-Age=0; Domain=romaine.life; Path=/',
    });
    res.end('{}');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// Stand in for the public BGM blob container: serves the index.json the backend
// reads for GET /api/bgm.
const mockBgm = http.createServer((req, res) => {
  if (req.url === '/index.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      schemaVersion: 1,
      tracks: [
        { title: 'Alpha', file: 'alpha.mp3' },
        { title: 'Bravo', file: 'bravo.mp3' },
      ],
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// The persistence endpoints are Postgres-backed, so the smoke-test needs a
// database. Prefer an externally supplied DATABASE_URL; otherwise self-provision
// a throwaway local Postgres from system binaries (present on GitHub-hosted CI
// runners). Hosts without Postgres binaries (e.g. the musl session pod) can't
// run this test directly — set DATABASE_URL, or rely on the Glimmung test slot,
// which exercises the same endpoints end to end against a real Postgres.
let embeddedPg = null;

function findPgBinary(name) {
  const onPath = spawnSync('sh', ['-c', `command -v ${name} 2>/dev/null`], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim();
  const located = spawnSync('sh', ['-c',
    `ls -d /usr/lib/postgresql/*/bin/${name} /usr/local/opt/postgresql*/bin/${name} /opt/homebrew/opt/postgresql*/bin/${name} 2>/dev/null | sort -V | tail -1`,
  ], { encoding: 'utf8' });
  return located.status === 0 && located.stdout.trim() ? located.stdout.trim() : null;
}

function startEmbeddedPostgres() {
  const initdb = findPgBinary('initdb');
  const pgCtl = findPgBinary('pg_ctl');
  const createdb = findPgBinary('createdb');
  if (!initdb || !pgCtl || !createdb) {
    throw new Error('smoke-test needs Postgres: set DATABASE_URL, or install Postgres so it can self-provision (initdb/pg_ctl/createdb not found).');
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pg-'));
  const pgPort = 55432;
  const init = spawnSync(initdb, ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const logFile = path.join(dataDir, 'pg.log');
  const start = spawnSync(pgCtl, ['-D', dataDir, '-w', '-l', logFile, '-o', `-p ${pgPort} -h 127.0.0.1 -k ${dataDir}`, 'start'], { encoding: 'utf8' });
  if (start.status !== 0) {
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    throw new Error(`pg_ctl start failed: ${start.stderr || start.stdout}\n${log}`);
  }
  embeddedPg = { dataDir, pgCtl };
  const created = spawnSync(createdb, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', 'chess_tactics'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(`createdb failed: ${created.stderr || created.stdout}`);
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${pgPort}/chess_tactics`;
}

function stopEmbeddedPostgres() {
  if (!embeddedPg) return;
  const { dataDir, pgCtl } = embeddedPg;
  embeddedPg = null;
  spawnSync(pgCtl, ['-D', dataDir, '-m', 'immediate', 'stop'], { encoding: 'utf8' });
  fs.rmSync(dataDir, { recursive: true, force: true });
}

process.on('exit', stopEmbeddedPostgres);

// SAFETY GUARD. resetDb() below TRUNCATEs every document table on startup — a known-empty
// state is fine for a throwaway test DB, but catastrophic against production. This is a
// hard, structural stop: no matter how DATABASE_URL got set (env, shell, a wrapper, an
// agent running `npm test`), refuse to run if it points at the PROD Postgres server.
// It is not a rule anyone has to remember — the script simply will not touch prod.
// CI's self-provisioned localhost DB and disposable test databases are unaffected.
function assertSafeSmokeTarget() {
  let host = '';
  try { host = new URL(process.env.DATABASE_URL || '').hostname; } catch { host = ''; }
  if (/(^|\.)chess-tactics-pg(\.|$)/i.test(host) || /chess-tactics-pg\.postgres\.database\.azure\.com/i.test(host)) {
    console.error(
      `\nREFUSING TO RUN: DATABASE_URL points at the PRODUCTION Postgres (${host}).\n` +
      `smoke-test.js TRUNCATEs levels/campaigns/portfolios on startup and would wipe prod data.\n` +
      `Run it with DATABASE_URL unset (self-provisions a throwaway local DB) or a disposable test database.\n`,
    );
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL) {
  startEmbeddedPostgres();
}
assertSafeSmokeTarget();

const child = spawn(process.execPath, ['supervisor.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
    PORT: String(port),
    PUBLIC_ORIGIN: 'https://chess.romaine.life',
    BGM_BASE_URL: `http://127.0.0.1:${bgmPort}`,
    // Non-Azure base: exercise the static-index path (the mock serves index.json).
    // Prod sets no BGM_READ_URL and lists the Azure container live instead.
    BGM_READ_URL: `http://127.0.0.1:${bgmPort}`,
    HOT_BACKEND_DIR: hotBackendDir,
    STATIC_FRONTEND_DIR: hotStaticDir,
    LOBBY_TEST_LEVEL_METADATA: JSON.stringify({
      'off-l-smoke-timed': { level: { id: 'off-l-smoke-timed', name: 'Smoke Timed Level', objective: 'survive', timeControl: { initialSeconds: 60, incrementSeconds: 0 } } },
    }),
    // The mock auth returns player@example.com for any non-rival session; make that
    // the official-campaigns admin so the requireAdmin path is exercised (ADR-0038).
    ADMIN_EMAILS: 'player@example.com',
    UNIT_ASSET_STORAGE_DIR: path.join(hotRoot, 'unit-assets'),
    LIVE_MEDIA_STORAGE_DIR: liveMediaStorageDir,
    // Smoke-test databases are throwaway/reset by this file, so schema mutation is
    // intentional here even though local backend startup defaults to read-only check.
    SCHEMA_MIGRATIONS: 'auto',
    // DATABASE_URL is set above (external or self-provisioned) and inherited
    // here via ...process.env.
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

function waitForProcessExit(proc, timeoutMs = 5000) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function closeHttpServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function request(method, path, headers = {}, body = null, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out requesting ${path}`));
    });
    req.end(body);
  });
}

function get(path, headers, timeoutMs) {
  return request('GET', path, headers, null, timeoutMs);
}

// Open a long-lived SSE stream and expose its parsed `data:` frames. Unlike request()
// (which reads to end with a 1s socket timeout), this keeps the connection open and lets
// a test await stream conditions. Heartbeat comments (`:keepalive`) carry no `data:` line
// and are skipped, so they never count as frames.
function openSse(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method: 'GET', path, headers: { accept: 'text/event-stream', ...headers } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`SSE ${path} returned ${res.statusCode}`));
          return;
        }
        res.setEncoding('utf8');
        let buffer = '';
        const frames = [];
        const waiters = [];
        const check = () => {
          for (let i = waiters.length - 1; i >= 0; i -= 1) {
            if (waiters[i].fn(frames)) {
              clearTimeout(waiters[i].timer);
              waiters[i].resolve(frames.length);
              waiters.splice(i, 1);
            }
          }
        };
        res.on('data', (chunk) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const evt = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const data = evt.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
            if (data) { frames.push(data); check(); }
          }
        });
        resolve({
          frames,
          waitUntil(fn, timeoutMs = 2000, label = 'condition') {
            if (fn(frames)) return Promise.resolve(frames.length);
            return new Promise((res2, rej2) => {
              const w = { fn, resolve: res2 };
              w.timer = setTimeout(() => {
                const i = waiters.indexOf(w);
                if (i !== -1) waiters.splice(i, 1);
                rej2(new Error(`SSE ${path}: ${label} not met within ${timeoutMs}ms; frames=${JSON.stringify(frames)}`));
              }, timeoutMs);
              waiters.push(w);
            });
          },
          close() { req.destroy(); },
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// Reset the Postgres-backed document tables so re-runs (and a freshly migrated
// CI database) start from a known-empty state. Tables exist by now because the
// server attempts migrations before it begins listening. `/health` proves only
// process liveness; `/ready` is asserted after this reset establishes a known
// complete catalog state.
async function resetDb() {
  await queryDb('TRUNCATE levels, campaign_workspaces, level_working_copies, design_portfolios, campaigns, official_campaigns, lab_runs, prop_seats, sfx_profiles, media_asset_events, media_versions, media_blobs, media_slots, media_catalog_state, unit_asset_events, unit_sprites, unit_families, unit_assets, unit_catalog_state CASCADE');
  await queryDb("INSERT INTO media_catalog_state (singleton) VALUES (true); INSERT INTO unit_catalog_state (singleton) VALUES (true); INSERT INTO unit_families (family) VALUES ('pawn'), ('rook'), ('knight'), ('bishop'), ('queen'), ('king');");
}

// Explicit synthetic live content for this transient smoke database. Production
// seat data is never imported from a repository fixture.
const SYNTHETIC_PROP_SEATS = Object.freeze({
  oak: { anchorX: 96, anchorY: 255, scale: 1, w: 2, h: 2 },
  cottage: { anchorX: 91, anchorY: 110, scale: 0.62, w: 2, h: 2 },
  cabin: { anchorX: 118, anchorY: 107, scale: 0.35, w: 1, h: 1 },
  lodge: { anchorX: 103, anchorY: 126, scale: 1, w: 2, h: 2 },
  rock: { anchorX: 20, anchorY: 44, scale: 1, w: 1, h: 1 },
  fieldstone: { anchorX: 25, anchorY: 46, scale: 1, w: 1, h: 1 },
  'oak-test-small': { base: 'oak', label: 'Synthetic small oak', anchorX: 96, anchorY: 238, scale: 0.25, w: 1, h: 1 },
});

async function seedSyntheticPropSeats() {
  await queryDb(
    `INSERT INTO prop_seats (id, data, client_schema_version, revision, updated_by)
     VALUES ('default', $1::jsonb, 1, 1, 'smoke-fixture')`,
    [JSON.stringify(SYNTHETIC_PROP_SEATS)],
  );
}

function syntheticPng(width = 512, height = 512, background = '#16324a', foreground = '#7dd7ff') {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = foreground;
  ctx.fillRect(Math.floor(width / 4), Math.floor(height / 4), Math.ceil(width / 2), Math.ceil(height / 2));
  return canvas.toBuffer('image/png');
}

// Direct importer-shaped bridge fixture for readiness-only semantic slots.
// The production bridge mutation route is deliberately absent; this disposable
// database and local object store model already-imported live content.
async function seedSyntheticReadinessMedia({ slot, domain, role, width, height }) {
  const bytes = syntheticPng(width, height);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const blobKey = `objects/${sha256.slice(0, 2)}/${sha256}`;
  const target = path.join(liveMediaStorageDir, ...blobKey.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
  const versionId = crypto.randomUUID();
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO media_slots (slot, domain, role, availability_policy, metadata, updated_by)
       VALUES ($1, $2, $3, 'critical', '{}'::jsonb, 'smoke-importer')`,
      [slot, domain, role],
    );
    await client.query(
      `INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height, published_at)
       VALUES ($1, $2, 'image/png', $3, $4, $5, now())
       ON CONFLICT (sha256) DO NOTHING`,
      [sha256, blobKey, bytes.length, width, height],
    );
    await client.query(
      `INSERT INTO media_versions (
         id, slot, domain, role, label, status, blob_sha256, metadata,
         provenance, native_evidence, row_revision, updated_by
       ) VALUES (
         $1, $2, $3, $4, $2, 'legacy-bridge', $5, '{}'::jsonb,
         '{"fixture":"readiness-smoke"}'::jsonb, '{}'::jsonb, 1, 'smoke-importer'
       )`,
      [versionId, slot, domain, role, sha256],
    );
    await client.query(
      `UPDATE media_slots SET active_version_id = $2, lifecycle_state = 'active',
         activated_at = now(), row_revision = 1, updated_at = now()
        WHERE slot = $1`,
      [slot, versionId],
    );
    await client.query(
      'UPDATE media_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function queryDb(sql, params = []) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

function inlineMigrationSql(version) {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const marker = `version: ${version},`;
  const markerOffset = source.indexOf(marker);
  if (markerOffset === -1) throw new Error(`Could not find inline migration ${version}`);
  const sqlMarker = 'sql: `';
  const sqlOffset = source.indexOf(sqlMarker, markerOffset);
  if (sqlOffset === -1) throw new Error(`Could not find SQL for inline migration ${version}`);
  const sqlStart = sqlOffset + sqlMarker.length;
  const sqlEnd = source.indexOf('`,', sqlStart);
  if (sqlEnd === -1) throw new Error(`Could not find end of inline migration ${version}`);
  return source.slice(sqlStart, sqlEnd);
}

async function validateEditorMigration16Preservation() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_editor_migration_16');
    await client.query('SET LOCAL search_path TO smoke_editor_migration_16');
    await client.query(`
      CREATE TABLE campaign_workspaces (
        owner_email text PRIMARY KEY,
        body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE official_campaigns (
        id text PRIMARY KEY,
        data jsonb NOT NULL
      );
      CREATE TABLE public_maps (
        public_id text PRIMARY KEY,
        body jsonb NOT NULL
      );
      CREATE TABLE editor_maps (
        public_id text PRIMARY KEY,
        owner_email text,
        body jsonb NOT NULL,
        revision integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE editor_map_audit_events (
        id bigserial PRIMARY KEY,
        public_id text NOT NULL REFERENCES editor_maps(public_id) ON DELETE CASCADE
      );
    `);
    await client.query(
      'INSERT INTO campaign_workspaces (owner_email, body) VALUES ($1, $2::jsonb)',
      [
        'player@example.com',
        JSON.stringify({ campaigns: [], levels: { l7: { id: 'l7', name: 'Canonical L7' } } }),
      ],
    );
    await client.query(
      "INSERT INTO official_campaigns (id, data) VALUES ('default', $1::jsonb)",
      [JSON.stringify({ campaigns: [], levels: { 'off-l-one': { id: 'off-l-one', name: 'Canonical Official' } } })],
    );
    await client.query(`INSERT INTO public_maps (public_id, body) VALUES ('abcdefgh', '{"kept":true}'::jsonb)`);
    const legacyRows = [
      ['abcdefgh', 'player@example.com', { id: 'draft', name: 'Standalone A' }, 3, '2026-01-01T00:00:00Z'],
      ['jkmnpqrs', 'player@example.com', { id: 'draft', name: 'Standalone B' }, 4, '2026-01-02T00:00:00Z'],
      ['tuvwxyz2', 'player@example.com', { id: 'off-l-one', name: 'Official Working Copy' }, 5, '2026-01-03T00:00:00Z'],
      ['23456789', 'player@example.com', { id: 'l7', name: 'Older L7 Working Copy' }, 2, '2026-01-01T00:00:00Z'],
      ['bcdefghj', 'player@example.com', { id: 'l7', name: 'Newest L7 Working Copy' }, 6, '2026-01-04T00:00:00Z'],
      ['kmnpqrst', null, { id: 'draft', name: 'Anonymous Must Not Become Account Data' }, 7, '2026-01-05T00:00:00Z'],
    ];
    for (const [publicId, ownerEmail, body, revision, updatedAt] of legacyRows) {
      await client.query(
        `INSERT INTO editor_maps (public_id, owner_email, body, revision, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $5::timestamptz)`,
        [publicId, ownerEmail, JSON.stringify(body), revision, updatedAt],
      );
    }

    await client.query(inlineMigrationSql(16));
    const migrated = await client.query(
      `SELECT document_id, owner_email, workspace_kind, workspace_id, level_id, body,
              revision, saved_revision, baseline_hash
         FROM level_working_copies
        ORDER BY document_id`,
    );
    const byDocument = new Map(migrated.rows.map((row) => [row.document_id, row]));
    const standaloneA = byDocument.get('legacy-abcdefgh');
    const standaloneB = byDocument.get('legacy-jkmnpqrs');
    const official = byDocument.get('legacy-tuvwxyz2');
    const newestReal = byDocument.get('legacy-bcdefghj');
    if (
      migrated.rows.length !== 4 ||
      !standaloneA || standaloneA.level_id !== 'legacy-abcdefgh' || standaloneA.body.id !== 'legacy-abcdefgh' || Number(standaloneA.saved_revision) !== 0 ||
      !standaloneB || standaloneB.level_id !== 'legacy-jkmnpqrs' || standaloneB.body.id !== 'legacy-jkmnpqrs' || Number(standaloneB.saved_revision) !== 0 ||
      !official || official.workspace_kind !== 'official' || official.workspace_id !== 'default' || official.level_id !== 'off-l-one' || !official.baseline_hash || Number(official.saved_revision) !== 1 ||
      !newestReal || newestReal.level_id !== 'l7' || newestReal.body.name !== 'Newest L7 Working Copy' || !newestReal.baseline_hash || Number(newestReal.saved_revision) !== 1 ||
      byDocument.has('legacy-23456789') || byDocument.has('legacy-kmnpqrst')
    ) {
      throw new Error(`Migration 16 did not preserve signed-in legacy editor rows safely: ${JSON.stringify(migrated.rows)}`);
    }
    const retired = await client.query(
      `SELECT to_regclass('editor_maps') AS maps,
              to_regclass('editor_map_audit_events') AS events,
              (SELECT body->>'kept' FROM public_maps WHERE public_id = 'abcdefgh') AS published_kept,
              (SELECT revision FROM campaign_workspaces WHERE owner_email = 'player@example.com') AS workspace_revision`,
    );
    if (
      retired.rows[0].maps ||
      retired.rows[0].events ||
      retired.rows[0].published_kept !== 'true' ||
      Number(retired.rows[0].workspace_revision) !== 0
    ) {
      throw new Error(`Migration 16 retired the wrong schema objects: ${JSON.stringify(retired.rows[0])}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with ${child.exitCode}\n${output}`);
    }
    try {
      const response = await get('/health');
      if (response.statusCode === 200 && response.body === 'ok') return;
    } catch (_error) { /* keep polling while the server starts */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy\n${output}`);
}

async function waitForHotBackend() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with ${child.exitCode}\n${output}`);
    }
    try {
      const response = await get('/__hot_backend');
      if (response.statusCode === 200 && response.body === 'hot-backend-ok') return;
    } catch (_error) { /* keep polling while the supervisor restarts */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Hot backend did not become active\n${output}`);
}

async function main() {
  await new Promise((resolve) => mockAuth.listen(authPort, '127.0.0.1', resolve));
  await new Promise((resolve) => mockBgm.listen(bgmPort, '127.0.0.1', resolve));
  await waitForServer();
  if (!fs.existsSync(path.join(hotBackendDir, 'server.js'))) {
    throw new Error('Supervisor did not initialize the hot backend entrypoint');
  }
  await validateEditorMigration16Preservation();
  await resetDb();

  const missingPropSeats = await get('/api/prop-seats/default');
  if (missingPropSeats.statusCode !== 503 || JSON.parse(missingPropSeats.body).error !== 'prop_seats_store_unavailable') {
    throw new Error(`Missing authoritative prop seats did not fail closed: ${missingPropSeats.statusCode} ${missingPropSeats.body}`);
  }
  await seedSyntheticPropSeats();

  const initialReadiness = await get('/ready', {}, 5000);
  if (
    initialReadiness.statusCode !== 503
    || JSON.parse(initialReadiness.body).error !== 'application_not_ready'
    || !String(initialReadiness.headers['cache-control'] || '').includes('no-store')
  ) throw new Error(`Empty catalogs falsely reported ready: ${initialReadiness.statusCode} ${initialReadiness.body}`);
  const editorSchema = await queryDb(
     `SELECT
       to_regclass('public.level_working_copies') AS working_copies,
       to_regclass('public.editor_maps') AS retired_editor_maps,
       to_regclass('public.editor_map_audit_events') AS retired_editor_map_events,
       to_regclass('public.public_maps') AS public_play_maps,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'level_working_copies'
            AND column_name = 'baseline_hash'
       ) AS has_baseline_hash,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'campaign_workspaces'
            AND column_name = 'revision'
       ) AS has_workspace_revision`,
  );
  const editorSchemaRow = editorSchema.rows[0];
  if (
    !editorSchemaRow.working_copies ||
    editorSchemaRow.retired_editor_maps ||
    editorSchemaRow.retired_editor_map_events ||
    !editorSchemaRow.public_play_maps ||
    editorSchemaRow.has_baseline_hash !== true ||
    editorSchemaRow.has_workspace_revision !== true
  ) {
    throw new Error(`Unexpected editor persistence schema: ${JSON.stringify(editorSchemaRow)}`);
  }

  const root = await get('/');
  if (root.statusCode !== 200 || !root.body.includes('Chess Tactics')) {
    throw new Error(`Unexpected root response: ${root.statusCode}`);
  }
  // The shell is the React SPA mount (#root). Account state + optional sign-in render
  // client-side in the app-shell title bar (HeaderAccountCluster) — there is no static
  // account chrome (the old static topbar was retired). The invariant is unchanged: the
  // shell serves the app to anonymous users and never gates guest play behind a sign-in.
  if (!root.body.includes('id="root"') || root.body.includes('Sign in to play')) {
    throw new Error('Root shell should load the app for guests without a blocking sign-in gate');
  }
  const fallback = await get('/squad/unknown');
  if (fallback.statusCode !== 200 || !fallback.body.includes('Chess Tactics')) {
    throw new Error(`Unexpected fallback response: ${fallback.statusCode}`);
  }

  const missingAsset = await get('/assets/missing.png');
  if (missingAsset.statusCode !== 404) {
    throw new Error(`Missing asset-like routes should return 404: ${missingAsset.statusCode}`);
  }
  for (const migratedAssetPath of ['/app.js', '/style.css']) {
    const response = await get(migratedAssetPath);
    if (response.statusCode !== 404) {
      throw new Error(`Migrated raw asset path should be gone for ${migratedAssetPath}: ${response.statusCode}`);
    }
  }
  for (const migratedScreenPath of ['/?screen=main-assets', '/?screen=main-concept&hotspots=1']) {
    const response = await get(migratedScreenPath);
    if (response.statusCode !== 404) {
      throw new Error(`Migrated query-screen route should be gone for ${migratedScreenPath}: ${response.statusCode}`);
    }
  }

  const reviewUrls = [
    '/main-menu',
    '/main-menu/skeleton',
    '/design/main-menu',
    '/design/main-menu/render',
    '/design/main-menu/render/hotspots',
    '/campaigns',
    '/campaigns/skeleton',
    '/design/campaigns/render',
    '/design/campaigns/render/hotspots',
    '/level-editor',
    '/level-editor/skeleton',
    '/design/level-editor/render',
    '/design/level-editor/render/hotspots',
    '/play/select/skirmish',
    '/play/select/levels',
    '/play/select/campaign/off-c-crown-valoria',
    '/design/skirmish/render',
    '/design/skirmish/render/hotspots',
  ];
  for (const reviewUrl of reviewUrls) {
    const response = await get(reviewUrl);
    if (response.statusCode !== 200 || !response.body.includes('Chess Tactics')) {
      throw new Error(`Unexpected review URL response for ${reviewUrl}: ${response.statusCode}`);
    }
  }

  const artAssets = [
    '/assets/ui/main-menu-aspirational.png',
    '/assets/ui/campaign-editor-concept.png',
    '/assets/ui/level-editor-concept.png',
    '/assets/ui/skirmish-concept.png',
    '/assets/ui/main-menu-button-art-five-mode.png',
    '/assets/ui/main-menu-button-art-three-state.png',
    '/assets/ui/main-menu-brand-title-only-v1.png',
    '/assets/ui/main-menu-brand-chrome-v1.png',
  ];
  for (const assetPath of artAssets) {
    const response = await get(assetPath);
    if (response.statusCode !== 404) {
      throw new Error(`Unregistered asset must not fall through to packaged media for ${assetPath}: ${response.statusCode}`);
    }
  }

  // Migration guard: the profile/news/dock chrome bitmaps were retired in favor
  // of live DOM components and must no longer be served.
  const retiredChrome = [
    '/assets/ui/main-menu-profile-chrome-v1.png',
    '/assets/ui/main-menu-news-chrome-v1.png',
    '/assets/ui/main-menu-dock-chrome-v1.png',
  ];
  for (const assetPath of retiredChrome) {
    const response = await get(assetPath);
    if (response.statusCode !== 404) {
      throw new Error(`Retired chrome bitmap still served (expected 404) for ${assetPath}: ${response.statusCode}`);
    }
  }

  const anonymous = await get('/api/auth/me');
  if (anonymous.statusCode !== 200 || JSON.parse(anonymous.body).signed_in !== false) {
    throw new Error(`Unexpected anonymous auth response: ${anonymous.statusCode} ${anonymous.body}`);
  }

  const signedIn = await get('/api/auth/me', { cookie: 'better-auth.session=abc' });
  const signedInBody = JSON.parse(signedIn.body);
  if (signedIn.statusCode !== 200 || signedInBody.email !== 'player@example.com' || signedInBody.role !== 'pending') {
    throw new Error(`Unexpected signed-in auth response: ${signedIn.statusCode} ${signedIn.body}`);
  }
  const playerHash = crypto.createHash('md5').update('player@example.com').digest('hex');
  if (!String(signedInBody.gravatar_url).includes(`/avatar/${playerHash}`) || signedInBody.avatar_url !== signedInBody.gravatar_url) {
    throw new Error(`Signed-in user did not include Gravatar avatar data: ${signedIn.body}`);
  }

  // Live unit catalog: stable six-family metadata, raw PNG upload, immutable
  // sprite reads, optimistic scale edits, completeness-gated acceptance, and
  // archive visibility all run against the disposable DB + local blob directory.
  const emptyUnitCatalog = await get('/api/unit-catalog');
  const emptyUnitBody = JSON.parse(emptyUnitCatalog.body);
  if (emptyUnitCatalog.statusCode !== 200 || emptyUnitBody.families.length !== 6 || emptyUnitBody.assets.length !== 0) {
    throw new Error(`Unexpected empty unit catalog: ${emptyUnitCatalog.statusCode} ${emptyUnitCatalog.body}`);
  }
  const unitMetadata = {
    family: 'pawn',
    label: 'Smoke pawn candidate',
    method: 'Smoke test',
    notes: 'Disposable candidate',
    footprintShape: 'circle',
    sourceCanvasWidth: 512,
    sourceCanvasHeight: 512,
    sourceFootprintPx: 150,
    anchorX: 0.5,
    anchorY: 0.78,
  };
  const anonymousUnitCreate = await request(
    'POST', '/api/admin/unit-assets', { 'content-type': 'application/json' }, JSON.stringify(unitMetadata), 5000,
  );
  if (anonymousUnitCreate.statusCode !== 401) throw new Error(`Anonymous unit create should be 401: ${anonymousUnitCreate.statusCode}`);
  const adminJson = { 'content-type': 'application/json', cookie: 'better-auth.session=abc' };

  // Shared live media: no packaged-file fallback, private candidates,
  // native/review-gated acceptance, immutable public bytes, stable slot
  // redirects, revisions, audit, and private archives. Imported legacy-bridge
  // rows remain readable, but no API can create another one after cutover.
  const emptyMediaCatalog = await get('/api/asset-catalog');
  const emptyMediaBody = JSON.parse(emptyMediaCatalog.body);
  if (emptyMediaCatalog.statusCode !== 200 || emptyMediaBody.schemaVersion !== 1 || emptyMediaBody.slots.length !== 0) {
    throw new Error(`Unexpected empty media catalog: ${emptyMediaCatalog.statusCode} ${emptyMediaCatalog.body}`);
  }
  const waterSideSlots = Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`);
  const candidateBytes = syntheticPng(96, 180, '#16324a', '#4f8fb2');
  const candidateSha = crypto.createHash('sha256').update(candidateBytes).digest('hex');
  const candidateCreateBody = {
    slot: waterSideSlots[0],
    sourcePath: 'smoke/private-water-0-side.png',
    domain: 'terrain',
    role: 'side',
    label: 'Private smoke candidate',
    availabilityPolicy: 'critical',
    slotMetadata: {
      fixture: true,
      privatePrompt: 'must never leak publicly',
      acceptance: { mode: 'group', groupId: 'terrain/water/side-v1', requiredSlots: waterSideSlots },
    },
    metadata: { generation: 0 },
    provenance: { generator: 'synthetic-private-smoke' },
  };
  const anonymousMediaCreate = await request(
    'POST', '/api/admin/media-versions', { 'content-type': 'application/json' }, JSON.stringify(candidateCreateBody), 5000,
  );
  if (anonymousMediaCreate.statusCode !== 401) throw new Error(`Anonymous media create should be 401: ${anonymousMediaCreate.statusCode}`);
  const candidateCreate = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify(candidateCreateBody), 5000);
  if (candidateCreate.statusCode !== 201) throw new Error(`Media candidate create failed: ${candidateCreate.statusCode} ${candidateCreate.body}`);
  const candidateVersion = JSON.parse(candidateCreate.body).version;
  const stagedMediaCatalog = await get('/api/asset-catalog');
  if (
    stagedMediaCatalog.statusCode !== 200
    || JSON.parse(stagedMediaCatalog.body).slots.some((slot) => slot.slot === waterSideSlots[0])
  ) throw new Error(`Unactivated critical staging slot leaked publicly: ${stagedMediaCatalog.statusCode} ${stagedMediaCatalog.body}`);
  const missingMediaRevision = await request(
    'PUT', `/api/admin/media-versions/${candidateVersion.id}/content`,
    { 'content-type': 'image/png', cookie: 'better-auth.session=abc' }, candidateBytes, 5000,
  );
  if (missingMediaRevision.statusCode !== 428) throw new Error(`Media upload without revision should be 428: ${missingMediaRevision.statusCode} ${missingMediaRevision.body}`);
  const candidateUpload = await request(
    'PUT', `/api/admin/media-versions/${candidateVersion.id}/content`,
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: 'better-auth.session=abc' }, candidateBytes, 5000,
  );
  const candidateUploadBody = JSON.parse(candidateUpload.body);
  if (
    candidateUpload.statusCode !== 200 || candidateUploadBody.version.rowRevision !== 1
    || candidateUploadBody.catalogRevision !== 0
    || candidateUploadBody.version.media.sha256 !== candidateSha
    || candidateUploadBody.version.media.mediaType !== 'image/png'
  ) throw new Error(`Media candidate content upload failed: ${candidateUpload.statusCode} ${candidateUpload.body}`);
  const privateCandidateRead = await get(candidateUploadBody.version.media.url, { cookie: 'better-auth.session=abc' }, 5000);
  if (privateCandidateRead.statusCode !== 200 || privateCandidateRead.headers['cache-control'] !== 'private, no-store') {
    throw new Error(`Admin candidate immutable read failed: ${privateCandidateRead.statusCode} ${privateCandidateRead.body}`);
  }
  const publicCandidateRead = await get(`/api/media/${candidateSha}`, {}, 5000);
  if (publicCandidateRead.statusCode !== 404 || publicCandidateRead.headers['cache-control'] !== 'no-store') {
    throw new Error(`Unaccepted media blob leaked or was negatively cacheable: ${publicCandidateRead.statusCode}`);
  }
  const removedBridgeRoute = await request(
    'POST', `/api/admin/media-versions/${candidateVersion.id}/bridge`, adminJson,
    JSON.stringify({ expectedRevision: 1 }), 5000,
  );
  if (removedBridgeRoute.statusCode !== 404) {
    throw new Error(`Retired bridge creation route must remain absent: ${removedBridgeRoute.statusCode} ${removedBridgeRoute.body}`);
  }
  const stagedAdminCatalog = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: 'better-auth.session=abc' }, 5000,
  )).body);
  const stagedSlot = stagedAdminCatalog.slots.find((slot) => slot.slot === waterSideSlots[0]);
  if (
    stagedSlot.activeVersionId !== null || stagedSlot.versionStatus !== null
    || stagedSlot.lifecycleState !== 'staging' || stagedSlot.metadata.privatePrompt !== 'must never leak publicly'
  ) throw new Error(`Admin staging projection is wrong: ${JSON.stringify(stagedSlot)}`);
  const stagedStableRoute = await get(`/assets/${waterSideSlots[0]}`);
  if (stagedStableRoute.statusCode !== 404) {
    throw new Error(`Staging stable route should fail closed, not fall back: ${stagedStableRoute.statusCode}`);
  }

  // Migration history legitimately contains legacy-bridge rows even though the
  // application no longer exposes an API that can create one. Seed one directly
  // in this throwaway database so future CI keeps read/availability/replacement
  // compatibility without reopening the retired mutation route. First patch the
  // staging contract through the API to invalidate the earlier empty-catalog cache.
  const stagingPatch = await request(
    'PATCH', `/api/admin/media-slots/${waterSideSlots[0]}`, adminJson,
    JSON.stringify({ expectedRevision: stagedSlot.rowRevision, metadata: stagedSlot.metadata }), 5000,
  );
  const stagingPatchBody = JSON.parse(stagingPatch.body);
  if (stagingPatch.statusCode !== 200 || stagingPatchBody.slot.rowRevision !== stagedSlot.rowRevision + 1) {
    throw new Error(`Staging media contract patch failed: ${stagingPatch.statusCode} ${stagingPatch.body}`);
  }
  const importedBridge = await queryDb(
    `WITH version_update AS (
       UPDATE media_versions
          SET status = 'legacy-bridge', row_revision = row_revision + 1,
              updated_at = now(), updated_by = 'smoke-importer'
        WHERE id = $1 AND slot = $3 AND status = 'candidate' AND blob_sha256 = $2
        RETURNING id, slot, source_path
     ), blob_update AS (
       UPDATE media_blobs SET published_at = COALESCE(published_at, now())
        WHERE sha256 = $2 AND EXISTS (SELECT 1 FROM version_update)
     ), slot_update AS (
       UPDATE media_slots
          SET active_version_id = $1, lifecycle_state = 'active', activated_at = now(),
              row_revision = row_revision + 1, updated_at = now(), updated_by = 'smoke-importer'
        WHERE slot = $3 AND lifecycle_state = 'staging' AND active_version_id IS NULL
          AND EXISTS (SELECT 1 FROM version_update)
        RETURNING slot
     ), event_insert AS (
       INSERT INTO media_asset_events (slot, source_path, version_id, action, actor_email, details)
       SELECT slot, source_path, id, 'legacy-bridge-activated', 'smoke-importer',
              '{"fixture":"direct-imported-legacy-bridge"}'::jsonb
         FROM version_update WHERE EXISTS (SELECT 1 FROM slot_update)
     )
     UPDATE media_catalog_state SET revision = revision + 1, updated_at = now()
      WHERE singleton = true AND EXISTS (SELECT 1 FROM slot_update)
      RETURNING revision`,
    [candidateVersion.id, candidateSha, waterSideSlots[0]],
  );
  if (Number(importedBridge.rows[0]?.revision) !== 1) {
    throw new Error(`Direct imported-bridge fixture failed: ${JSON.stringify(importedBridge.rows)}`);
  }
  const bridgedCatalogResponse = await get('/api/asset-catalog');
  if (
    bridgedCatalogResponse.statusCode !== 503
    || JSON.parse(bridgedCatalogResponse.body).error !== 'media_catalog_incomplete'
  ) throw new Error(`Partial critical Water group should fail closed: ${bridgedCatalogResponse.statusCode} ${bridgedCatalogResponse.body}`);
  const bridgedAdminCatalog = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: 'better-auth.session=abc' }, 5000,
  )).body);
  const bridgedSlot = bridgedAdminCatalog.slots.find((slot) => slot.slot === waterSideSlots[0]);
  if (
    bridgedSlot.activeVersionId !== candidateVersion.id || bridgedSlot.versionStatus !== 'legacy-bridge'
    || bridgedSlot.productionEligible !== false || bridgedSlot.metadata.privatePrompt !== 'must never leak publicly'
  ) throw new Error(`Admin imported-bridge projection is wrong: ${JSON.stringify(bridgedSlot)}`);
  const partialStableBridge = await get(`/assets/${waterSideSlots[0]}`);
  if (partialStableBridge.statusCode !== 503) {
    throw new Error(`Incomplete group stable route should fail, not fall back: ${partialStableBridge.statusCode}`);
  }
  const publicBridge = await get(`/api/media/${candidateSha}`, {}, 5000);
  if (
    publicBridge.statusCode !== 200 || publicBridge.headers.etag !== `"${candidateSha}"`
    || !String(publicBridge.headers['cache-control']).includes('immutable')
  ) throw new Error(`Public imported-bridge read failed: ${publicBridge.statusCode} ${publicBridge.body}`);
  const rangedBridge = await get(`/api/media/${candidateSha}`, { range: 'bytes=0-3' }, 5000);
  if (rangedBridge.statusCode !== 206 || rangedBridge.headers['content-length'] !== '4') {
    throw new Error(`Imported bridge range read failed: ${rangedBridge.statusCode} ${rangedBridge.body}`);
  }

  const acceptedBytes = syntheticPng(96, 180, '#102838', '#7bdcf4');
  const acceptedSha = crypto.createHash('sha256').update(acceptedBytes).digest('hex');
  const nativeCreate = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
    slot: waterSideSlots[0],
    domain: 'terrain',
    role: 'side',
    label: 'Native reviewed smoke asset',
    availabilityPolicy: 'critical',
    nativeEvidence: {
      native1x: true,
      spatialResampling: false,
      sourceWidth: 96,
      sourceHeight: 180,
      sourceSha256: acceptedSha,
    },
    provenance: { generator: 'synthetic-smoke' },
  }), 5000);
  if (nativeCreate.statusCode !== 201) throw new Error(`Native media candidate create failed: ${nativeCreate.statusCode} ${nativeCreate.body}`);
  const nativeVersion = JSON.parse(nativeCreate.body).version;
  const nativeUpload = await request(
    'PUT', `/api/admin/media-versions/${nativeVersion.id}/content`,
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: 'better-auth.session=abc' }, acceptedBytes, 5000,
  );
  const nativeUploadBody = JSON.parse(nativeUpload.body);
  if (nativeUpload.statusCode !== 200 || nativeUploadBody.version.rowRevision !== 1) {
    throw new Error(`Native media upload failed: ${nativeUpload.statusCode} ${nativeUpload.body}`);
  }
  const unreviewedAccept = await request(
    'POST', `/api/admin/media-versions/${nativeVersion.id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      expectedSlotRevision: bridgedSlot.rowRevision,
      expectedActiveVersionId: candidateVersion.id,
    }), 5000,
  );
  if (unreviewedAccept.statusCode !== 409 || JSON.parse(unreviewedAccept.body).error !== 'media_owner_review_required') {
    throw new Error(`Unreviewed media acceptance should fail: ${unreviewedAccept.statusCode} ${unreviewedAccept.body}`);
  }
  const invalidReviewSurface = await request(
    'POST', `/api/admin/media-versions/${nativeVersion.id}/review`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      approved: true,
      notes: 'Owner-approved smoke proof',
      surfaceUrl: 'https://example.invalid/studio?smoke=1',
      evidence: { schema: 'terrain-surface-canonical-board-proof-v1' },
    }), 5000,
  );
  if (invalidReviewSurface.statusCode !== 400 || JSON.parse(invalidReviewSurface.body).error !== 'invalid_media_review') {
    throw new Error(`External review surface should fail closed: ${invalidReviewSurface.statusCode} ${invalidReviewSurface.body}`);
  }

  const privateBytes = Buffer.from('private source proof\n', 'utf8');
  const privateSha = crypto.createHash('sha256').update(privateBytes).digest('hex');
  const privateCreate = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
    slot: null,
    sourcePath: 'docs/art/smoke/private-source.txt',
    domain: 'source',
    role: 'source',
    label: 'Private source archive',
    provenance: { migration: { kind: 'git-media-cutover', byteExact: true, repositoryCommit: 'smoke-commit', originalRepositoryPath: 'docs/art/smoke/private-source.txt', sha256: privateSha } },
  }), 5000);
  if (privateCreate.statusCode !== 201) throw new Error(`Private media create failed: ${privateCreate.statusCode} ${privateCreate.body}`);
  const privateVersion = JSON.parse(privateCreate.body).version;
  const privateUpload = await request(
    'PUT', `/api/admin/media-versions/${privateVersion.id}/content`,
    { 'content-type': 'text/plain', 'if-match': '"0"', cookie: 'better-auth.session=abc' }, privateBytes, 5000,
  );
  if (privateUpload.statusCode !== 200) throw new Error(`Private media upload failed: ${privateUpload.statusCode} ${privateUpload.body}`);
  const privateArchive = await request(
    'POST', `/api/admin/media-versions/${privateVersion.id}/archive`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      reason: 'Smoke-test private source archive',
      evidence: { schema: 'smoke-private-archive-v1', sha256: privateSha },
    }), 5000,
  );
  const privateArchiveBody = JSON.parse(privateArchive.body);
  if (
    privateArchive.statusCode !== 200 || privateArchiveBody.version.status !== 'archived'
    || privateArchiveBody.version.sourcePath !== 'docs/art/smoke/private-source.txt'
  ) throw new Error(`Private media archive failed: ${privateArchive.statusCode} ${privateArchive.body}`);
  if ((await get(`/api/media/${privateSha}`)).statusCode !== 404) throw new Error('Private archived blob leaked through public immutable route');
  const privateAdminRead = await get(`/api/admin/media/${privateSha}`, { cookie: 'better-auth.session=abc' }, 5000);
  if (
    privateAdminRead.statusCode !== 200 || privateAdminRead.body !== privateBytes.toString('utf8')
    || privateAdminRead.headers['cache-control'] !== 'private, no-store'
  ) {
    throw new Error(`Private archived media verification failed: ${privateAdminRead.statusCode} ${privateAdminRead.body}`);
  }

  const groupSlots = waterSideSlots;
  const groupBytes = waterSideSlots.map((_, index) => syntheticPng(
    96, 180, `#${(0x102030 + index * 0x010305).toString(16).padStart(6, '0')}`, '#7bdcf4',
  ));
  groupBytes[0] = acceptedBytes;
  const preparedGroupVersions = [{ id: nativeVersion.id, slot: groupSlots[0], sha256: acceptedSha, rowRevision: 1 }];
  for (let index = 1; index < groupSlots.length; index += 1) {
    const sha = crypto.createHash('sha256').update(groupBytes[index]).digest('hex');
    const create = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
      slot: groupSlots[index],
      sourcePath: `smoke/generated-water-${index}-side.png`,
      domain: 'terrain',
      role: 'side',
      label: `Grouped smoke ${index + 1}`,
      availabilityPolicy: 'critical',
      slotMetadata: {
        acceptance: {
          mode: 'group',
          groupId: 'terrain/water/side-v1',
          requiredSlots: index === 1 ? [...groupSlots].reverse() : groupSlots,
        },
      },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: 96,
        sourceHeight: 180,
        sourceSha256: sha,
      },
      provenance: { generator: 'synthetic-group-smoke' },
    }), 5000);
    if (create.statusCode !== 201) throw new Error(`Grouped media create failed: ${create.statusCode} ${create.body}`);
    const version = JSON.parse(create.body).version;
    const upload = await request(
      'PUT', `/api/admin/media-versions/${version.id}/content`,
      { 'content-type': 'image/png', 'if-match': '"0"', cookie: 'better-auth.session=abc' }, groupBytes[index], 5000,
    );
    if (upload.statusCode !== 200 || JSON.parse(upload.body).version.media.sha256 !== sha) {
      throw new Error(`Grouped media upload failed: ${upload.statusCode} ${upload.body}`);
    }
    preparedGroupVersions.push({ id: version.id, slot: groupSlots[index], sha256: sha, rowRevision: 1 });
  }
  const beforeGroupReviewCatalog = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: 'better-auth.session=abc' }, 5000,
  )).body);
  const groupSlotSnapshotsBeforeReview = groupSlots.map((slot) => {
    const row = beforeGroupReviewCatalog.slots.find((item) => item.slot === slot);
    if (!row) throw new Error(`Grouped slot missing before review: ${slot}`);
    return row;
  });
  const groupSurfaceUrl = `http://127.0.0.1:${port}/studio?smoke-group=1`;
  const groupProof = {
    schema: 'terrain-surface-canonical-board-proof-v1',
    family: 'water',
    surfaceUrl: groupSurfaceUrl,
    renderer: 'BoardLabBoard/BoardTerrainLayer',
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    deterministicProof: true,
    abruptExposedEdge: true,
    exposedFaces: ['south', 'east'],
    selectedCandidates: preparedGroupVersions.map((version) => ({
      slot: version.slot,
      versionId: version.id,
      sha256: version.sha256,
      rowRevision: version.rowRevision,
      faces: ['south', 'east'],
    })),
    slotSnapshots: groupSlotSnapshotsBeforeReview.map((slot) => ({
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
      lifecycleState: slot.lifecycleState,
    })),
    acceptanceGroups: [{ groupId: 'terrain/water/side-v1', requiredSlots: groupSlots }],
  };
  const groupReview = await request(
    'POST', '/api/admin/media-versions/review-batch', adminJson,
    JSON.stringify({
      items: preparedGroupVersions.map((version) => ({ id: version.id, expectedRevision: version.rowRevision })),
      approved: true,
      notes: 'All eight Water side faces reviewed together at canonical 1x',
      surfaceUrl: groupSurfaceUrl,
      evidence: groupProof,
    }), 5000,
  );
  const groupReviewBody = JSON.parse(groupReview.body);
  if (
    groupReview.statusCode !== 200 || groupReviewBody.versions.length !== 8
    || groupReviewBody.versions.some((version) => version.rowRevision !== 2)
  ) throw new Error(`Grouped media review failed atomically: ${groupReview.statusCode} ${groupReview.body}`);
  const partialGroupAccept = await request(
    'POST', `/api/admin/media-versions/${preparedGroupVersions[0].id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 2,
      expectedSlotRevision: groupSlotSnapshotsBeforeReview[0].rowRevision,
      expectedActiveVersionId: groupSlotSnapshotsBeforeReview[0].activeVersionId,
    }), 5000,
  );
  if (
    partialGroupAccept.statusCode !== 409
    || !['media_group_incomplete', 'media_group_accept_required'].includes(JSON.parse(partialGroupAccept.body).error)
  ) throw new Error(`Partial grouped acceptance should fail atomically: ${partialGroupAccept.statusCode} ${partialGroupAccept.body}`);
  const groupAccept = await request(
    'POST', '/api/admin/media-versions/accept-batch', adminJson,
    JSON.stringify({
      items: preparedGroupVersions.map((version) => {
        const slot = groupSlotSnapshotsBeforeReview.find((item) => item.slot === version.slot);
        return {
          id: version.id,
          expectedRevision: 2,
          expectedSlotRevision: slot.rowRevision,
          expectedActiveVersionId: slot.activeVersionId,
        };
      }),
    }), 5000,
  );
  const groupAcceptBody = JSON.parse(groupAccept.body);
  if (
    groupAccept.statusCode !== 200 || groupAcceptBody.versions.length !== 8
    || groupAcceptBody.versions.some((version) => version.status !== 'accepted') || !groupAcceptBody.batchId
  ) throw new Error(`Grouped media batch acceptance failed: ${groupAccept.statusCode} ${groupAccept.body}`);
  const groupedCatalog = JSON.parse((await get('/api/asset-catalog')).body);
  if (groupSlots.some((slot) => groupedCatalog.slots.find((item) => item.slot === slot)?.versionStatus !== 'accepted')) {
    throw new Error(`Grouped slots did not publish atomically: ${JSON.stringify(groupedCatalog.slots)}`);
  }
  const acceptedFirstSlot = groupedCatalog.slots.find((item) => item.slot === groupSlots[0]);
  if (
    acceptedFirstSlot.activeVersionId !== nativeVersion.id || acceptedFirstSlot.media.sha256 !== acceptedSha
    || acceptedFirstSlot.productionEligible !== true || acceptedFirstSlot.metadata.privatePrompt !== undefined
    || acceptedFirstSlot.metadata.acceptance.groupId !== 'terrain/water/side-v1'
  ) throw new Error(`Accepted Water pointer mismatch: ${JSON.stringify(acceptedFirstSlot)}`);
  const stableAccepted = await get(`/assets/${waterSideSlots[0]}`);
  if (stableAccepted.statusCode !== 302 || stableAccepted.headers.location !== `/api/media/${acceptedSha}`) {
    throw new Error(`Stable accepted Water slot did not resolve through backend: ${stableAccepted.statusCode}`);
  }
  const rangedAccepted = await get(`/api/media/${acceptedSha}`, { range: 'bytes=0-3' }, 5000);
  if (rangedAccepted.statusCode !== 206 || rangedAccepted.headers['content-length'] !== '4') {
    throw new Error(`Immutable media range read failed: ${rangedAccepted.statusCode} ${rangedAccepted.body}`);
  }
  const historicalBridgeRead = await get(`/api/media/${candidateSha}`, {}, 5000);
  if (historicalBridgeRead.statusCode !== 200) {
    throw new Error(`Previously published immutable bridge hash disappeared after replacement: ${historicalBridgeRead.statusCode}`);
  }
  const groupedAdminCatalog = JSON.parse((await get('/api/admin/media-assets', { cookie: 'better-auth.session=abc' }, 5000)).body);
  const archivedBridge = groupedAdminCatalog.versions.find((version) => version.id === candidateVersion.id);
  if (
    archivedBridge.status !== 'archived'
    || !groupedAdminCatalog.events.some((event) => event.action === 'accepted-batch' && event.versionId === nativeVersion.id)
  ) throw new Error(`Media replacement/audit is incomplete: ${JSON.stringify(groupedAdminCatalog)}`);
  const groupedSlotRows = groupSlots.map((slot) => groupedAdminCatalog.slots.find((item) => item.slot === slot));
  const slotContractUpdate = await request(
    'PATCH', `/api/admin/media-slots/${waterSideSlots[0]}`, adminJson,
    JSON.stringify({
      expectedRevision: groupedSlotRows[0].rowRevision,
      metadata: { fixture: true, acceptance: { mode: 'standalone' } },
      availabilityPolicy: 'decorative',
    }), 5000,
  );
  if (
    slotContractUpdate.statusCode !== 409
    || JSON.parse(slotContractUpdate.body).error !== 'active_media_slot_contract_immutable'
  ) throw new Error(`Active media slot contract/policy should be immutable: ${slotContractUpdate.statusCode} ${slotContractUpdate.body}`);
  const partialGroupRetirement = await request(
    'POST', `/api/admin/media-slots/${groupSlots[0]}/retire`, adminJson,
    JSON.stringify({
      expectedRevision: groupedSlotRows[0].rowRevision,
      reason: 'Exercise grouped retirement guard',
      evidence: { ownerConfirmed: true, fixture: 'live-media-smoke' },
      confirmCriticalRetirement: true,
    }), 5000,
  );
  if (
    partialGroupRetirement.statusCode !== 409
    || JSON.parse(partialGroupRetirement.body).error !== 'media_group_retirement_incomplete'
  ) throw new Error(`Partial grouped retirement should fail: ${partialGroupRetirement.statusCode} ${partialGroupRetirement.body}`);
  const groupRetirement = await request(
    'POST', '/api/admin/media-slots/retire-batch', adminJson,
    JSON.stringify({
      items: groupedSlotRows.map((slot) => ({ slot: slot.slot, expectedRevision: slot.rowRevision })),
      reason: 'Retire the complete disposable smoke group',
      evidence: { ownerConfirmed: true, fixture: 'live-media-smoke', groupId: 'terrain/water/side-v1' },
      confirmCriticalRetirement: true,
    }), 5000,
  );
  const groupRetirementBody = JSON.parse(groupRetirement.body);
  if (
    groupRetirement.statusCode !== 200 || groupRetirementBody.slots.length !== 8
    || groupRetirementBody.slots.some((slot) => slot.lifecycleState !== 'retired' || slot.activeVersionId !== null)
  ) throw new Error(`Grouped media retirement failed: ${groupRetirement.statusCode} ${groupRetirement.body}`);
  const catalogAfterRetirement = JSON.parse((await get('/api/asset-catalog')).body);
  if (groupSlots.some((slot) => catalogAfterRetirement.slots.some((item) => item.slot === slot))) {
    throw new Error(`Retired media slot leaked into public catalog: ${JSON.stringify(catalogAfterRetirement.slots)}`);
  }
  const retiredGroupSha = crypto.createHash('sha256').update(groupBytes[0]).digest('hex');
  if ((await get(`/api/media/${retiredGroupSha}`)).statusCode !== 200) {
    throw new Error('Historically published immutable media disappeared after retirement');
  }
  if ((await get(`/api/admin/media/${retiredGroupSha}`, { cookie: 'better-auth.session=abc' }, 5000)).statusCode !== 200) {
    throw new Error('Retired grouped media bytes were not retained for admin audit');
  }

  // Ground-cover sprite geometry is version metadata in the same public live
  // catalog consumed by both the browser and server thumbnail renderer. Import
  // three tiny synthetic bridges directly (the bridge API is intentionally
  // retired) so the critical renderer projection stays fully exercised without
  // committing production sheets or a generated TypeScript catalog.
  const groundCoverTerrains = ['grass', 'water', 'sand'];
  const groundCoverFixtures = [];
  for (let index = 0; index < groundCoverTerrains.length; index += 1) {
    const terrain = groundCoverTerrains[index];
    const slot = `groundcover/${terrain}/v0.png`;
    const bytes = syntheticPng(240, 37, `#${(0x31512f + index * 0x191109).toString(16).padStart(6, '0')}`, '#b9d982');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const metadata = {
      runtime: {
        groundCover: {
          terrain, id: 0, frameWidth: 40, frameHeight: 37,
          frameCount: 6, baseX: 20, baseY: 28, contentWidth: 18,
        },
      },
    };
    const created = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
      slot,
      sourcePath: `smoke/generated-${terrain}-cover-v0.png`,
      domain: 'terrain',
      role: 'media',
      label: `Synthetic ${terrain} ground cover`,
      availabilityPolicy: 'critical',
      metadata,
      provenance: { generator: 'synthetic-ground-cover-smoke' },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: 240,
        sourceHeight: 37,
        sourceSha256: sha256,
      },
    }), 5000);
    if (created.statusCode !== 201) {
      throw new Error(`Ground-cover media create failed: ${created.statusCode} ${created.body}`);
    }
    const version = JSON.parse(created.body).version;
    const uploaded = await request(
      'PUT', `/api/admin/media-versions/${version.id}/content`,
      { 'content-type': 'image/png', 'if-match': '"0"', cookie: 'better-auth.session=abc' }, bytes, 5000,
    );
    if (uploaded.statusCode !== 200 || JSON.parse(uploaded.body).version.media.sha256 !== sha256) {
      throw new Error(`Ground-cover media upload failed: ${uploaded.statusCode} ${uploaded.body}`);
    }
    const stagingGroundCoverPatch = await request(
      'PATCH', `/api/admin/media-slots/${slot}`, adminJson,
      JSON.stringify({ expectedRevision: 0, metadata: {} }), 5000,
    );
    if (stagingGroundCoverPatch.statusCode !== 200) {
      throw new Error(`Ground-cover staging slot patch failed: ${stagingGroundCoverPatch.statusCode} ${stagingGroundCoverPatch.body}`);
    }
    const imported = await queryDb(
      `WITH version_update AS (
         UPDATE media_versions
            SET status = 'legacy-bridge', row_revision = row_revision + 1,
                updated_at = now(), updated_by = 'smoke-importer'
          WHERE id = $1 AND slot = $3 AND status = 'candidate' AND blob_sha256 = $2
          RETURNING id, slot, source_path
       ), blob_update AS (
         UPDATE media_blobs SET published_at = COALESCE(published_at, now())
          WHERE sha256 = $2 AND EXISTS (SELECT 1 FROM version_update)
       ), slot_update AS (
         UPDATE media_slots
            SET active_version_id = $1, lifecycle_state = 'active', activated_at = now(),
                row_revision = row_revision + 1, updated_at = now(), updated_by = 'smoke-importer'
          WHERE slot = $3 AND lifecycle_state = 'staging' AND active_version_id IS NULL
            AND EXISTS (SELECT 1 FROM version_update)
          RETURNING slot
       ), event_insert AS (
         INSERT INTO media_asset_events (slot, source_path, version_id, action, actor_email, details)
         SELECT slot, source_path, id, 'legacy-bridge-activated', 'smoke-importer',
                '{"fixture":"synthetic-ground-cover-bridge"}'::jsonb
           FROM version_update WHERE EXISTS (SELECT 1 FROM slot_update)
       )
       UPDATE media_catalog_state SET revision = revision + 1, updated_at = now()
        WHERE singleton = true AND EXISTS (SELECT 1 FROM slot_update)
        RETURNING revision`,
      [version.id, sha256, slot],
    );
    if (!imported.rows[0]) throw new Error(`Ground-cover bridge activation failed for ${slot}`);
    groundCoverFixtures.push({ slot, sha256, metadata });
  }
  const groundCoverCatalog = JSON.parse((await get('/api/asset-catalog')).body);
  for (const fixture of groundCoverFixtures) {
    const projected = groundCoverCatalog.slots.find((slot) => slot.slot === fixture.slot);
    if (
      !projected || projected.versionStatus !== 'legacy-bridge' || projected.productionEligible !== false
      || projected.media.immutableUrl !== `/api/media/${fixture.sha256}`
      || JSON.stringify(projected.versionMetadata) !== JSON.stringify(fixture.metadata)
    ) throw new Error(`Ground-cover public metadata projection mismatch: ${JSON.stringify(projected)}`);
  }

  // Global SFX metadata/assignment authority. The migration does not seed a
  // profile: missing means honest decorative silence. Admin writes must carry a
  // complete typed document and compare-and-swap the current revision.
  const missingSfxProfile = await get('/api/sfx-profiles/default');
  if (missingSfxProfile.statusCode !== 404 || JSON.parse(missingSfxProfile.body).error !== 'sfx_profile_not_found') {
    throw new Error(`Missing SFX profile should be explicit: ${missingSfxProfile.statusCode} ${missingSfxProfile.body}`);
  }
  const syntheticSfxProfile = {
    schemaVersion: 1,
    soundSets: {
      grass: { label: 'Grass', character: 'Synthetic dry step', build: 'Synthetic smoke recording', gain: 0.5 },
      arrival: { label: 'Arrival', character: 'Synthetic deploy thump', build: 'Synthetic smoke recording', gain: 0.6 },
      click: { label: 'Click', character: 'Synthetic interface tap', build: 'Synthetic smoke recording', gain: 0.5 },
    },
    terrainAssignments: {
      grass: 'grass', water: null, sand: null, stone: null,
      road: null, bridge: null, dirt: null, pebble: null,
    },
    arrival: { sample: 'arrival', gain: 0.55, firing: 'per-unit' },
  };
  const anonymousSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', { 'content-type': 'application/json' },
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: null, clientSchemaVersion: 1 }), 5000,
  );
  if (anonymousSfxWrite.statusCode !== 401) throw new Error(`Anonymous SFX profile write should be 401: ${anonymousSfxWrite.statusCode}`);
  const invalidSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({
      data: { ...syntheticSfxProfile, terrainAssignments: { grass: 'missing' } },
      expectedRevision: null,
      clientSchemaVersion: 1,
    }), 5000,
  );
  if (invalidSfxWrite.statusCode !== 400 || JSON.parse(invalidSfxWrite.body).error !== 'invalid_sfx_profile') {
    throw new Error(`Incomplete SFX profile should be rejected: ${invalidSfxWrite.statusCode} ${invalidSfxWrite.body}`);
  }
  const createdSfxProfile = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: null, clientSchemaVersion: 1 }), 5000,
  );
  const createdSfxBody = JSON.parse(createdSfxProfile.body);
  if (
    createdSfxProfile.statusCode !== 201 || createdSfxBody.profile.revision !== 0
    || createdSfxBody.profile.data.arrival.firing !== 'per-unit'
  ) throw new Error(`SFX profile create failed: ${createdSfxProfile.statusCode} ${createdSfxProfile.body}`);
  const publicSfxProfile = await get('/api/sfx-profiles/default');
  if (
    publicSfxProfile.statusCode !== 200 || publicSfxProfile.headers.etag !== '"sfx-profile-0"'
    || JSON.parse(publicSfxProfile.body).profile.data.terrainAssignments.grass !== 'grass'
  ) throw new Error(`Public SFX profile read failed: ${publicSfxProfile.statusCode} ${publicSfxProfile.body}`);
  const staleSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: 9, clientSchemaVersion: 1 }), 5000,
  );
  if (
    staleSfxWrite.statusCode !== 409 || JSON.parse(staleSfxWrite.body).error !== 'sfx_profile_conflict'
    || JSON.parse(staleSfxWrite.body).currentRevision !== 0
  ) throw new Error(`Stale SFX profile write should conflict: ${staleSfxWrite.statusCode} ${staleSfxWrite.body}`);
  const updatedSfxProfile = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({
      data: {
        ...syntheticSfxProfile,
        soundSets: {
          ...syntheticSfxProfile.soundSets,
          grass: { ...syntheticSfxProfile.soundSets.grass, gain: 0.45 },
        },
        arrival: { ...syntheticSfxProfile.arrival, firing: 'once' },
      },
      expectedRevision: 0,
      clientSchemaVersion: 1,
    }), 5000,
  );
  const updatedSfxBody = JSON.parse(updatedSfxProfile.body);
  if (
    updatedSfxProfile.statusCode !== 200 || updatedSfxBody.profile.revision !== 1
    || updatedSfxBody.profile.data.soundSets.grass.gain !== 0.45
    || updatedSfxBody.profile.data.arrival.firing !== 'once'
  ) throw new Error(`Optimistic SFX profile update failed: ${updatedSfxProfile.statusCode} ${updatedSfxProfile.body}`);

  const idempotentPayload = {
    slot: 'backgrounds/smoke-idempotent.png',
    domain: 'background',
    role: 'media',
    label: 'Idempotent create smoke',
    availabilityPolicy: 'decorative',
    provenance: { fixture: 'idempotent-create' },
  };
  const idempotentHeaders = {
    ...adminJson,
    'idempotency-key': 'smoke-same-key-new-slot',
  };
  const idempotentCreates = await Promise.all([
    request('POST', '/api/admin/media-versions', idempotentHeaders, JSON.stringify(idempotentPayload), 5000),
    request('POST', '/api/admin/media-versions', idempotentHeaders, JSON.stringify(idempotentPayload), 5000),
  ]);
  const idempotentBodies = idempotentCreates.map((response) => JSON.parse(response.body));
  if (
    idempotentCreates.map((response) => response.statusCode).sort().join(',') !== '200,201'
    || idempotentBodies[0].version.id !== idempotentBodies[1].version.id
    || idempotentBodies.filter((body) => body.idempotentReplay === true).length !== 1
  ) throw new Error(`Parallel idempotent create did not replay exactly: ${JSON.stringify(idempotentCreates)}`);
  const conflictingReplay = await request(
    'POST', '/api/admin/media-versions', idempotentHeaders,
    JSON.stringify({ ...idempotentPayload, label: 'Conflicting reuse' }), 5000,
  );
  if (conflictingReplay.statusCode !== 409 || JSON.parse(conflictingReplay.body).error !== 'media_idempotency_conflict') {
    throw new Error(`Conflicting idempotency key reuse should be 409: ${conflictingReplay.statusCode} ${conflictingReplay.body}`);
  }
  const sharedSlotPayload = {
    ...idempotentPayload,
    slot: 'backgrounds/smoke-shared-slot.png',
    label: 'Shared slot candidate smoke',
  };
  const sharedSlotCreates = await Promise.all(['a', 'b'].map((suffix) => request(
    'POST', '/api/admin/media-versions',
    { ...adminJson, 'idempotency-key': `smoke-shared-slot-${suffix}` },
    JSON.stringify(sharedSlotPayload), 5000,
  )));
  const sharedSlotBodies = sharedSlotCreates.map((response) => JSON.parse(response.body));
  if (
    sharedSlotCreates.some((response) => response.statusCode !== 201)
    || new Set(sharedSlotBodies.map((body) => body.version.id)).size !== 2
  ) throw new Error(`Concurrent distinct candidates could not share a new slot: ${JSON.stringify(sharedSlotCreates)}`);
  const abandoned = await request(
    'POST', `/api/admin/media-versions/${sharedSlotBodies[0].version.id}/archive`, adminJson,
    JSON.stringify({
      expectedRevision: 0,
      reason: 'Abandon empty smoke candidate',
      evidence: { schema: 'smoke-abandon-v1', canceled: true },
    }), 5000,
  );
  if (abandoned.statusCode !== 200 || JSON.parse(abandoned.body).version.status !== 'archived') {
    throw new Error(`Empty candidate abandonment failed: ${abandoned.statusCode} ${abandoned.body}`);
  }
  const missingSharedSlot = await get('/assets/backgrounds/smoke-shared-slot.png', {}, 5000);
  if (missingSharedSlot.statusCode !== 404 || missingSharedSlot.headers['cache-control'] !== 'no-store') {
    throw new Error(`Staging slot 404 should be no-store: ${missingSharedSlot.statusCode} ${missingSharedSlot.body}`);
  }

  const createdUnit = await request('POST', '/api/admin/unit-assets', adminJson, JSON.stringify(unitMetadata), 5000);
  if (createdUnit.statusCode !== 201) throw new Error(`Unit candidate create failed: ${createdUnit.statusCode} ${createdUnit.body}`);
  const firstUnitId = JSON.parse(createdUnit.body).assetId;
  const pawnPng = syntheticPng();
  const uploadedUnit = await request(
    'PUT',
    `/api/admin/unit-assets/${firstUnitId}/sprites/navy-blue/south`,
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: 'better-auth.session=abc' },
    pawnPng,
    5000,
  );
  if (uploadedUnit.statusCode !== 200 || JSON.parse(uploadedUnit.body).rowRevision !== 1) {
    throw new Error(`Unit sprite upload failed: ${uploadedUnit.statusCode} ${uploadedUnit.body}`);
  }
  const uploadedSprite = JSON.parse(uploadedUnit.body).sprite;
  const servedSprite = await get(uploadedSprite.url, {}, 5000);
  if (servedSprite.statusCode !== 200 || servedSprite.headers.etag !== `"${uploadedSprite.sha256}"` || !String(servedSprite.headers['cache-control']).includes('immutable')) {
    throw new Error(`Unit sprite immutable read failed: ${servedSprite.statusCode} ${JSON.stringify(servedSprite.headers)}`);
  }
  const cachedSprite = await get(uploadedSprite.url, { 'if-none-match': servedSprite.headers.etag }, 5000);
  if (cachedSprite.statusCode !== 304) throw new Error(`Unit sprite conditional read should be 304: ${cachedSprite.statusCode}`);
  const incompleteAccept = await request(
    'POST', `/api/admin/unit-assets/${firstUnitId}/accept`, { ...adminJson, 'if-match': '"1"' }, '{}', 5000,
  );
  if (incompleteAccept.statusCode !== 409 || JSON.parse(incompleteAccept.body).error !== 'unit_asset_incomplete') {
    throw new Error(`Incomplete unit acceptance should be rejected: ${incompleteAccept.statusCode} ${incompleteAccept.body}`);
  }
  const publishedScale = await request(
    'PATCH', '/api/admin/unit-families/pawn', { ...adminJson, 'if-match': '"0"' }, JSON.stringify({ displayScalePercent: 112 }), 5000,
  );
  if (publishedScale.statusCode !== 200) throw new Error(`Unit scale publish failed: ${publishedScale.statusCode} ${publishedScale.body}`);
  const archivedUnit = await request(
    'POST', `/api/admin/unit-assets/${firstUnitId}/archive`, { ...adminJson, 'if-match': '"1"' }, '{}', 5000,
  );
  if (archivedUnit.statusCode !== 200) throw new Error(`Unit archive failed: ${archivedUnit.statusCode} ${archivedUnit.body}`);
  const publicAfterArchive = JSON.parse((await get('/api/unit-catalog')).body);
  if (publicAfterArchive.assets.some((asset) => asset.id === firstUnitId)) throw new Error('Archived unit leaked into public catalog');
  const adminAfterArchive = await get('/api/admin/unit-assets', { cookie: 'better-auth.session=abc' }, 5000);
  if (!JSON.parse(adminAfterArchive.body).assets.some((asset) => asset.id === firstUnitId && asset.status === 'archived')) {
    throw new Error(`Archived unit missing from admin catalog: ${adminAfterArchive.body}`);
  }

  const secondUnit = await request(
    'POST', '/api/admin/unit-assets', adminJson, JSON.stringify({ ...unitMetadata, label: 'Complete pawn candidate' }), 5000,
  );
  if (secondUnit.statusCode !== 201) throw new Error(`Second unit candidate create failed: ${secondUnit.statusCode} ${secondUnit.body}`);
  const secondUnitId = JSON.parse(secondUnit.body).assetId;
  const storedSprite = (await queryDb(
    'SELECT sha256, blob_key, width, height, byte_length FROM unit_sprites WHERE asset_id = $1 LIMIT 1',
    [firstUnitId],
  )).rows[0];
  const palettes = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
  const directions = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const seedCompleteUnitSprites = async (assetId) => {
    const spriteParams = [];
    const spriteValues = [];
    for (const palette of palettes) for (const direction of directions) {
      const base = spriteParams.length;
      spriteParams.push(assetId, palette, direction, storedSprite.sha256, storedSprite.blob_key, storedSprite.width, storedSprite.height, storedSprite.byte_length);
      spriteValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
    }
    await queryDb(
      `INSERT INTO unit_sprites (asset_id, palette, direction, sha256, blob_key, width, height, byte_length) VALUES ${spriteValues.join(',')}`,
      spriteParams,
    );
  };

  const resampledUnit = await request('POST', '/api/admin/unit-assets', adminJson, JSON.stringify({
    ...unitMetadata,
    label: 'Calibration-only recapture',
    method: 'Accepted sprite smooth recapture',
    notes: JSON.stringify({ pipeline: 'accepted-sprite-recapture', spatialResampling: true }),
  }), 5000);
  if (resampledUnit.statusCode !== 201) throw new Error(`Resampled unit candidate create failed: ${resampledUnit.statusCode} ${resampledUnit.body}`);
  const resampledUnitId = JSON.parse(resampledUnit.body).assetId;
  await seedCompleteUnitSprites(resampledUnitId);
  const blockedResampledAccept = await request(
    'POST', `/api/admin/unit-assets/${resampledUnitId}/accept`, { ...adminJson, 'if-match': '"0"' }, '{}', 5000,
  );
  const blockedResampledBody = JSON.parse(blockedResampledAccept.body);
  if (
    blockedResampledAccept.statusCode !== 409
    || blockedResampledBody.error !== 'unit_asset_calibration_only'
    || blockedResampledBody.details?.reason !== 'spatial-resampling'
  ) {
    throw new Error(`Resampled unit acceptance should be blocked by ADR-0076: ${blockedResampledAccept.statusCode} ${blockedResampledAccept.body}`);
  }
  const scrubbedResampled = await request(
    'PATCH', `/api/admin/unit-assets/${resampledUnitId}`, { ...adminJson, 'if-match': '"0"' },
    JSON.stringify({ method: 'Blender', notes: 'metadata markers removed after recapture' }), 5000,
  );
  if (scrubbedResampled.statusCode !== 200) throw new Error(`Resampled metadata update failed: ${scrubbedResampled.statusCode} ${scrubbedResampled.body}`);
  const scrubbedAsset = JSON.parse(scrubbedResampled.body).catalog.assets.find((asset) => asset.id === resampledUnitId);
  if (scrubbedAsset?.acceptanceBlockReason !== 'spatial-resampling') {
    throw new Error(`Resampled acceptance block was not monotonic: ${scrubbedResampled.body}`);
  }
  const stillBlockedResampledAccept = await request(
    'POST', `/api/admin/unit-assets/${resampledUnitId}/accept`, { ...adminJson, 'if-match': '"1"' }, '{}', 5000,
  );
  if (stillBlockedResampledAccept.statusCode !== 409 || JSON.parse(stillBlockedResampledAccept.body).error !== 'unit_asset_calibration_only') {
    throw new Error(`Edited resampled unit should remain blocked: ${stillBlockedResampledAccept.statusCode} ${stillBlockedResampledAccept.body}`);
  }
  const pawnBeforeNativeAccept = (await queryDb('SELECT accepted_asset_id FROM unit_families WHERE family = $1', ['pawn'])).rows[0];
  if (pawnBeforeNativeAccept?.accepted_asset_id) throw new Error('Blocked recapture changed the accepted pawn pointer');

  await seedCompleteUnitSprites(secondUnitId);
  const acceptedUnit = await request(
    'POST', `/api/admin/unit-assets/${secondUnitId}/accept`, { ...adminJson, 'if-match': '"0"' }, '{}', 5000,
  );
  if (acceptedUnit.statusCode !== 200) throw new Error(`Complete unit acceptance failed: ${acceptedUnit.statusCode} ${acceptedUnit.body}`);
  // A renderer catalog is an all-six contract. Seed the other five accepted
  // families directly in this disposable database using the same immutable PNG.
  for (const family of ['rook', 'knight', 'bishop', 'queen', 'king']) {
    const assetId = crypto.randomUUID();
    await queryDb(
      `INSERT INTO unit_assets (
         id, family, label, method, notes, status, footprint_shape,
         source_canvas_width, source_canvas_height, source_footprint_px,
         anchor_x, anchor_y, row_revision, updated_by
       ) SELECT $1, $2, initcap($2), 'Smoke seed', '', 'candidate', footprint_shape,
                source_canvas_width, source_canvas_height, source_footprint_px,
                anchor_x, anchor_y, 1, 'smoke-test'
           FROM unit_assets WHERE id = $3`,
      [assetId, family, secondUnitId],
    );
    await queryDb(
      `INSERT INTO unit_sprites (asset_id, palette, direction, sha256, blob_key, width, height, byte_length)
       SELECT $1, palette, direction, sha256, blob_key, width, height, byte_length
         FROM unit_sprites WHERE asset_id = $2`,
      [assetId, secondUnitId],
    );
    await queryDb(
      `UPDATE unit_families SET accepted_asset_id = $2, row_revision = row_revision + 1,
         updated_at = now(), updated_by = 'smoke-test' WHERE family = $1`,
      [family, assetId],
    );
  }
  await queryDb('UPDATE unit_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true');
  const acceptedCatalog = JSON.parse((await get('/api/unit-catalog')).body);
  const acceptedPawn = acceptedCatalog.families.find((family) => family.family === 'pawn');
  if (
    acceptedPawn.acceptedAssetId !== secondUnitId ||
    acceptedPawn.displayScalePercent !== 100 ||
    acceptedCatalog.families.some((family) => !family.acceptedAssetId) ||
    acceptedCatalog.assets.filter((asset) => asset.accepted && asset.complete).length !== 6
  ) {
    throw new Error(`Accepted pawn pointer/native-scale mismatch: ${JSON.stringify(acceptedPawn)}`);
  }

  // Complete the remaining browser-startup projection with synthetic live
  // structure halves and the five canonical installed Chrome roles. Readiness
  // must now run the same board-render snapshot validators as browser boot and
  // expose all three fresh DB revisions.
  const readinessStructureRasters = {
    'props/oak': [192, 300],
    'props/cottage': [177, 184],
    'props/cabin': [220, 176],
    'props/lodge': [210, 177],
    'props/rock': [40, 45],
    'props/fieldstone': [51, 47],
  };
  for (const [prefix, [width, height]] of Object.entries(readinessStructureRasters)) {
    for (const half of ['back', 'front']) {
      await seedSyntheticReadinessMedia({
        slot: `${prefix}/${half}.png`, domain: 'prop', role: half, width, height,
      });
    }
  }
  for (const [index, slot] of [
    'ui/chrome/outer/atom.png',
    'ui/chrome/outer/rail.png',
    'ui/chrome/inner/atom.png',
    'ui/chrome/inner/rail.png',
    'ui/chrome/divider/joint.png',
  ].entries()) {
    await seedSyntheticReadinessMedia({
      slot, domain: 'ui-kit', role: 'media', width: 32 + index, height: 32 + index,
    });
  }

  const completeReadiness = await get('/ready', {}, 5000);
  const completeReadinessBody = JSON.parse(completeReadiness.body);
  if (
    completeReadiness.statusCode !== 200 || completeReadinessBody.status !== 'ready'
    || !Number.isInteger(completeReadinessBody.catalogRevision)
    || completeReadinessBody.propSeatsRevision !== 1
    || !Number.isInteger(completeReadinessBody.unitCatalogRevision)
  ) throw new Error(`Complete renderer snapshot was not ready: ${completeReadiness.statusCode} ${completeReadiness.body}`);

  // The live prop document remains independently availability-critical. Its
  // restoration uses the same explicit synthetic DB fixture, never a Git seed.
  await queryDb("DELETE FROM prop_seats WHERE id = 'default'");
  const missingSeatsReadiness = await get('/ready', {}, 5000);
  if (missingSeatsReadiness.statusCode !== 503 || JSON.parse(missingSeatsReadiness.body).error !== 'application_not_ready') {
    throw new Error(`Missing prop seats did not fail readiness: ${missingSeatsReadiness.statusCode} ${missingSeatsReadiness.body}`);
  }
  await seedSyntheticPropSeats();

  // A configured path string is not storage readiness. Break the local object
  // root while preserving process liveness, then prove fresh probes recover.
  const displacedLiveMediaStorage = `${liveMediaStorageDir}-readiness-test`;
  fs.renameSync(liveMediaStorageDir, displacedLiveMediaStorage);
  fs.writeFileSync(liveMediaStorageDir, 'not-a-directory');
  try {
    const unavailableStore = await get('/ready', {}, 5000);
    const stillLive = await get('/health');
    if (unavailableStore.statusCode !== 503 || JSON.parse(unavailableStore.body).error !== 'application_not_ready') {
      throw new Error(`Unavailable live media store did not fail readiness: ${unavailableStore.statusCode} ${unavailableStore.body}`);
    }
    if (stillLive.statusCode !== 200 || stillLive.body !== 'ok') {
      throw new Error(`Storage readiness failure took down liveness: ${stillLive.statusCode} ${stillLive.body}`);
    }
  } finally {
    fs.rmSync(liveMediaStorageDir, { force: true });
    fs.renameSync(displacedLiveMediaStorage, liveMediaStorageDir);
  }
  const storeRecovered = await get('/ready', {}, 5000);
  if (storeRecovered.statusCode !== 200) {
    throw new Error(`Live media store readiness did not recover: ${storeRecovered.statusCode} ${storeRecovered.body}`);
  }

  await queryDb('ALTER TABLE media_catalog_state RENAME TO media_catalog_state_readiness_test');
  try {
    const unavailableCatalog = await get('/ready', {}, 5000);
    const stillLive = await get('/health');
    if (unavailableCatalog.statusCode !== 503 || JSON.parse(unavailableCatalog.body).error !== 'application_not_ready') {
      throw new Error(`Unavailable live media catalog did not fail readiness: ${unavailableCatalog.statusCode} ${unavailableCatalog.body}`);
    }
    if (stillLive.statusCode !== 200 || stillLive.body !== 'ok') {
      throw new Error(`Catalog readiness failure took down liveness: ${stillLive.statusCode} ${stillLive.body}`);
    }
  } finally {
    await queryDb('ALTER TABLE media_catalog_state_readiness_test RENAME TO media_catalog_state');
  }
  const catalogRecovered = await get('/ready', {}, 5000);
  if (catalogRecovered.statusCode !== 200) {
    throw new Error(`Live media catalog readiness did not recover: ${catalogRecovered.statusCode} ${catalogRecovered.body}`);
  }

  const rejectAcceptedArchive = await request(
    'POST', `/api/admin/unit-assets/${secondUnitId}/archive`, { ...adminJson, 'if-match': '"1"' }, '{}', 5000,
  );
  if (rejectAcceptedArchive.statusCode !== 409 || JSON.parse(rejectAcceptedArchive.body).error !== 'accepted_unit_asset_cannot_archive') {
    throw new Error(`Accepted unit archive should be rejected: ${rejectAcceptedArchive.statusCode} ${rejectAcceptedArchive.body}`);
  }

  // BGM playlist: the backend reads the (mocked) blob index.json and resolves
  // each track to an absolute URL under BGM_BASE_URL.
  const bgm = await get('/api/bgm');
  const bgmBody = JSON.parse(bgm.body);
  if (
    bgm.statusCode !== 200 ||
    !Array.isArray(bgmBody.tracks) ||
    bgmBody.tracks.length !== 2 ||
    bgmBody.tracks[0].title !== 'Alpha' ||
    bgmBody.tracks[0].url !== `http://127.0.0.1:${bgmPort}/alpha.mp3`
  ) {
    throw new Error(`Unexpected /api/bgm response: ${bgm.statusCode} ${bgm.body}`);
  }

  const anonymousLobbies = await get('/api/lobbies');
  if (anonymousLobbies.statusCode !== 401) {
    throw new Error(`Anonymous lobby list should require sign-in: ${anonymousLobbies.statusCode}`);
  }

  const anonymousCampaigns = await get('/api/campaigns');
  if (anonymousCampaigns.statusCode !== 401) {
    throw new Error(`Anonymous campaign list should require sign-in: ${anonymousCampaigns.statusCode}`);
  }

  const retiredDesignAssetApi = await get('/api/design-assets');
  if (retiredDesignAssetApi.statusCode !== 404) {
    throw new Error(`Retired design asset API should 404: ${retiredDesignAssetApi.statusCode} ${retiredDesignAssetApi.body}`);
  }
  const retiredDesignAssetImageApi = await get('/api/design-assets/button-icon.main-menu.sword/image');
  if (retiredDesignAssetImageApi.statusCode !== 404) {
    throw new Error(`Retired design asset image API should 404: ${retiredDesignAssetImageApi.statusCode} ${retiredDesignAssetImageApi.body}`);
  }

  const emptyPortfolio = await get('/api/design-portfolios/main-menu-acceptance');
  const emptyPortfolioBody = JSON.parse(emptyPortfolio.body);
  if (emptyPortfolio.statusCode !== 200 || emptyPortfolioBody.portfolio.revision !== 0 || Object.keys(emptyPortfolioBody.portfolio.data).length !== 0) {
    throw new Error(`Unexpected empty design portfolio response: ${emptyPortfolio.statusCode} ${emptyPortfolio.body}`);
  }

  const anonymousPortfolioWrite = await request(
    'PUT',
    '/api/design-portfolios/main-menu-acceptance',
    { 'content-type': 'application/json' },
    JSON.stringify({ data: { review_statuses: { 'profile-chrome': 'accepted' } } }),
  );
  if (anonymousPortfolioWrite.statusCode !== 401) {
    throw new Error(`Production-style anonymous design portfolio write should require sign-in: ${anonymousPortfolioWrite.statusCode} ${anonymousPortfolioWrite.body}`);
  }

  const invalidPortfolioId = await get('/api/design-portfolios/Bad%20ID');
  if (invalidPortfolioId.statusCode !== 400) {
    throw new Error(`Invalid design portfolio id should fail: ${invalidPortfolioId.statusCode} ${invalidPortfolioId.body}`);
  }

  const signedPortfolioWrite = await request(
    'PUT',
    '/api/design-portfolios/main-menu-acceptance',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      client_schema_version: 7,
      metadata: { source: 'smoke-test', future_unknown_field: { ok: true } },
      data: {
        kind: 'main-menu-acceptance-ledger',
        future_document_shape: { nested: ['allowed'] },
        review_statuses: {
          'profile-chrome': 'accepted',
          'dock-chrome': 'rejected',
        },
      },
    }),
  );
  const signedPortfolioWriteBody = JSON.parse(signedPortfolioWrite.body);
  if (
    signedPortfolioWrite.statusCode !== 200 ||
    signedPortfolioWriteBody.portfolio.revision !== 1 ||
    signedPortfolioWriteBody.portfolio.data.future_document_shape.nested[0] !== 'allowed' ||
    signedPortfolioWriteBody.portfolio.updated_by !== 'player@example.com'
  ) {
    throw new Error(`Unexpected signed design portfolio write: ${signedPortfolioWrite.statusCode} ${signedPortfolioWrite.body}`);
  }

  const savedPortfolio = await get('/api/design-portfolios/main-menu-acceptance');
  const savedPortfolioBody = JSON.parse(savedPortfolio.body);
  if (
    savedPortfolio.statusCode !== 200 ||
    savedPortfolioBody.portfolio.revision !== 1 ||
    savedPortfolioBody.portfolio.data.review_statuses['profile-chrome'] !== 'accepted'
  ) {
    throw new Error(`Design portfolio did not persist: ${savedPortfolio.statusCode} ${savedPortfolio.body}`);
  }

  const testSlotPortfolioWrite = await request(
    'PUT',
    '/api/design-portfolios/main-menu-acceptance',
    { host: 'chess-tactics-1.tank.dev.romaine.life', 'content-type': 'application/json' },
    JSON.stringify({ data: { review_statuses: { 'news-chrome': 'accepted' } } }),
  );
  const testSlotPortfolioWriteBody = JSON.parse(testSlotPortfolioWrite.body);
  if (
    testSlotPortfolioWrite.statusCode !== 200 ||
    testSlotPortfolioWriteBody.portfolio.revision !== 2 ||
    testSlotPortfolioWriteBody.portfolio.updated_by !== 'test-slot@chess-tactics.local'
  ) {
    throw new Error(`Test-slot design portfolio write should not require sign-in: ${testSlotPortfolioWrite.statusCode} ${testSlotPortfolioWrite.body}`);
  }

  // --- Official (global) campaign tier (/api/official-campaigns): public GET,
  //     admin-gated PUT, off-prefixed digit-free ids (ADR-0038) ----------------
  const officialWorkspace = {
    campaigns: [{
      formatVersion: 1, id: 'off-c-test', name: 'Test Official', difficulty: 'normal', chapters: 1,
      levels: [{ levelId: 'off-l-test', ordinal: 0, objective: 'capture-all' }],
    }],
    levels: {
      'off-l-test': {
        formatVersion: 1, id: 'off-l-test', name: 'Test Level', notes: '',
        board: { cols: 8, rows: 8, heightLevels: 1 }, objective: 'capture-all', difficulty: 'normal',
        economy: { startingFunds: 1000, incomePerTurn: 100 }, theme: 'grassland',
        events: [{
          id: 'player-pawn-promotion',
          name: 'Player pawn promotion',
          trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: 'promotion-zone' },
          do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
        }],
        layers: {
          terrain: [],
          decals: [],
          zones: [
            { id: 'promotion-zone', name: 'Promotion zone', color: 'amber', type: 'region', tiles: [[0, 0]] },
            { id: 'legacy-promotion-zone', type: 'pawn-promotion', tiles: [[1, 0]] },
          ],
          units: [],
        },
      },
    },
  };

  const emptyOfficial = await get('/api/official-campaigns/default');
  const emptyOfficialBody = JSON.parse(emptyOfficial.body);
  if (emptyOfficial.statusCode !== 200 || emptyOfficialBody.portfolio.revision !== 0 || Object.keys(emptyOfficialBody.portfolio.data).length !== 0) {
    throw new Error(`Unexpected empty official campaigns response: ${emptyOfficial.statusCode} ${emptyOfficial.body}`);
  }

  const anonymousOfficialWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace }),
  );
  if (anonymousOfficialWrite.statusCode !== 401) {
    throw new Error(`Anonymous official write should require sign-in: ${anonymousOfficialWrite.statusCode} ${anonymousOfficialWrite.body}`);
  }

  const nonAdminOfficialWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace }),
  );
  if (nonAdminOfficialWrite.statusCode !== 403) {
    throw new Error(`Non-admin official write should be forbidden: ${nonAdminOfficialWrite.statusCode} ${nonAdminOfficialWrite.body}`);
  }

  const invalidOfficialId = await get('/api/official-campaigns/Bad%20ID');
  if (invalidOfficialId.statusCode !== 400) {
    throw new Error(`Invalid official campaign id should fail: ${invalidOfficialId.statusCode} ${invalidOfficialId.body}`);
  }

  const adminOfficialWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace, revision: emptyOfficialBody.portfolio.revision }),
  );
  const adminOfficialWriteBody = JSON.parse(adminOfficialWrite.body);
  if (
    adminOfficialWrite.statusCode !== 200 ||
    adminOfficialWriteBody.portfolio.revision !== 1 ||
    adminOfficialWriteBody.portfolio.updated_by !== 'player@example.com' ||
    adminOfficialWriteBody.portfolio.data.campaigns[0].id !== 'off-c-test' ||
    adminOfficialWriteBody.portfolio.data.levels['off-l-test'].events[0].trigger.zoneId !== 'promotion-zone'
  ) {
    throw new Error(`Unexpected admin official write: ${adminOfficialWrite.statusCode} ${adminOfficialWrite.body}`);
  }
  const missingOfficialRevision = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace }),
  );
  if (missingOfficialRevision.statusCode !== 400 || JSON.parse(missingOfficialRevision.body).error !== 'official_campaign_revision_required') {
    throw new Error(`Official whole-workspace writes must carry an observed revision: ${missingOfficialRevision.statusCode} ${missingOfficialRevision.body}`);
  }

  // Public GET now returns the published officials — visible WITHOUT a session.
  const publishedOfficial = await get('/api/official-campaigns/default');
  const publishedOfficialBody = JSON.parse(publishedOfficial.body);
  if (
    publishedOfficial.statusCode !== 200 ||
    publishedOfficialBody.portfolio.revision !== 1 ||
    publishedOfficialBody.portfolio.data.campaigns[0].id !== 'off-c-test'
  ) {
    throw new Error(`Official campaigns did not persist for public read: ${publishedOfficial.statusCode} ${publishedOfficial.body}`);
  }

  const officialPlay = await get('/play?campaignId=off-c-test&levelId=off-l-test');
  if (
    officialPlay.statusCode !== 200 ||
    !officialPlay.body.includes('Test Level') ||
    !officialPlay.body.includes('/assets/level-thumb/off-l-test.png') ||
    officialPlay.body.includes('/assets/og/default.png')
  ) {
    throw new Error(`Official play page should advertise the level thumbnail: ${officialPlay.statusCode}`);
  }
  const officialThumb = await get('/assets/level-thumb/off-l-test.png', undefined, 5000);
  if (
    officialThumb.statusCode !== 503
    || JSON.parse(officialThumb.body).error !== 'thumbnail_render_unavailable'
  ) {
    throw new Error(`Missing live thumbnail media should fail explicitly without fallback: ${officialThumb.statusCode} ${officialThumb.body}`);
  }

  // Non-off-prefixed ids are rejected (would collide the per-user id counter).
  const nonOffIdWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: { campaigns: [{ formatVersion: 1, id: 'c1', name: 'Bad', difficulty: 'normal', chapters: 1, levels: [] }], levels: {} }, revision: 1 }),
  );
  if (nonOffIdWrite.statusCode !== 400 || JSON.parse(nonOffIdWrite.body).error !== 'invalid_official_ids') {
    throw new Error(`Non-off-prefixed official ids should be rejected: ${nonOffIdWrite.statusCode} ${nonOffIdWrite.body}`);
  }

  // Digits inside an off- id are also rejected (must stay digit-free).
  const digitOffIdWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: { campaigns: [{ formatVersion: 1, id: 'off-c-test1', name: 'Bad', difficulty: 'normal', chapters: 1, levels: [] }], levels: {} }, revision: 1 }),
  );
  if (digitOffIdWrite.statusCode !== 400 || JSON.parse(digitOffIdWrite.body).error !== 'invalid_official_ids') {
    throw new Error(`Official ids with digits should be rejected: ${digitOffIdWrite.statusCode} ${digitOffIdWrite.body}`);
  }

  // --- Prop-seat tuning: complete DB authority, public GET / admin PUT ----------
  const propSeatsDoc = structuredClone(SYNTHETIC_PROP_SEATS);

  const initialPropSeats = await get('/api/prop-seats/default');
  const initialPropSeatsBody = JSON.parse(initialPropSeats.body);
  if (initialPropSeats.statusCode !== 200 || initialPropSeatsBody.portfolio.revision !== 1 || initialPropSeatsBody.portfolio.data.cottage.scale !== 0.62) {
    throw new Error(`Unexpected synthetic prop seats response: ${initialPropSeats.statusCode} ${initialPropSeats.body}`);
  }

  const anonymousPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc }),
  );
  if (anonymousPropSeatsWrite.statusCode !== 401) {
    throw new Error(`Anonymous prop-seats write should require sign-in: ${anonymousPropSeatsWrite.statusCode} ${anonymousPropSeatsWrite.body}`);
  }

  const nonAdminPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc }),
  );
  if (nonAdminPropSeatsWrite.statusCode !== 403) {
    throw new Error(`Non-admin prop-seats write should be forbidden: ${nonAdminPropSeatsWrite.statusCode} ${nonAdminPropSeatsWrite.body}`);
  }

  const invalidPropSeatsId = await get('/api/prop-seats/Bad%20ID');
  if (invalidPropSeatsId.statusCode !== 400) {
    throw new Error(`Invalid prop-seats id should fail: ${invalidPropSeatsId.statusCode} ${invalidPropSeatsId.body}`);
  }

  const adminPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: 1 }),
  );
  const adminPropSeatsWriteBody = JSON.parse(adminPropSeatsWrite.body);
  if (
    adminPropSeatsWrite.statusCode !== 200 ||
    adminPropSeatsWriteBody.portfolio.revision !== 2 ||
    adminPropSeatsWriteBody.portfolio.updated_by !== 'player@example.com' ||
    adminPropSeatsWriteBody.portfolio.data.oak.scale !== 1
  ) {
    throw new Error(`Unexpected admin prop-seats write: ${adminPropSeatsWrite.statusCode} ${adminPropSeatsWrite.body}`);
  }

  // Public GET returns the published seats — visible WITHOUT a session.
  const publishedPropSeats = await get('/api/prop-seats/default');
  const publishedPropSeatsBody = JSON.parse(publishedPropSeats.body);
  if (
    publishedPropSeats.statusCode !== 200 ||
    publishedPropSeatsBody.portfolio.revision !== 2 ||
    publishedPropSeatsBody.portfolio.data['oak-test-small'].base !== 'oak'
  ) {
    throw new Error(`Prop seats did not persist for public read: ${publishedPropSeats.statusCode} ${publishedPropSeats.body}`);
  }

  const blindPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc }),
  );
  if (blindPropSeatsWrite.statusCode !== 400 || JSON.parse(blindPropSeatsWrite.body).error !== 'invalid_prop_seats_write') {
    throw new Error(`Blind prop-seat write should be rejected: ${blindPropSeatsWrite.statusCode} ${blindPropSeatsWrite.body}`);
  }

  const stalePropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: 1 }),
  );
  const stalePropSeatsWriteBody = JSON.parse(stalePropSeatsWrite.body);
  if (
    stalePropSeatsWrite.statusCode !== 409
    || stalePropSeatsWriteBody.error !== 'prop_seats_revision_conflict'
    || stalePropSeatsWriteBody.currentRevision !== 2
  ) {
    throw new Error(`Stale prop-seat write should conflict: ${stalePropSeatsWrite.statusCode} ${stalePropSeatsWrite.body}`);
  }

  const sequentialPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: 2 }),
  );
  if (sequentialPropSeatsWrite.statusCode !== 200 || JSON.parse(sequentialPropSeatsWrite.body).portfolio.revision !== 3) {
    throw new Error(`Sequential prop-seat write did not advance its revision: ${sequentialPropSeatsWrite.statusCode} ${sequentialPropSeatsWrite.body}`);
  }

  const createdPropSeats = await request(
    'PUT', '/api/prop-seats/cas-create',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: null }),
  );
  if (createdPropSeats.statusCode !== 201 || JSON.parse(createdPropSeats.body).portfolio.revision !== 1) {
    throw new Error(`Null-token prop-seat create failed: ${createdPropSeats.statusCode} ${createdPropSeats.body}`);
  }
  const duplicatePropSeatsCreate = await request(
    'PUT', '/api/prop-seats/cas-create',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: null }),
  );
  if (
    duplicatePropSeatsCreate.statusCode !== 409
    || JSON.parse(duplicatePropSeatsCreate.body).currentRevision !== 1
  ) {
    throw new Error(`Null token should not overwrite an existing prop-seat row: ${duplicatePropSeatsCreate.statusCode} ${duplicatePropSeatsCreate.body}`);
  }

  // A size-variant whose `base` doesn't resolve in-document is rejected (no orphan variant).
  const orphanVariantWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      data: { ...propSeatsDoc, 'ghost-house': { base: 'missing', anchorX: 1, anchorY: 1, scale: 1 } },
      expectedRevision: 3,
    }),
  );
  if (orphanVariantWrite.statusCode !== 400 || JSON.parse(orphanVariantWrite.body).error !== 'invalid_prop_seats') {
    throw new Error(`Orphan prop-seat variant should be rejected: ${orphanVariantWrite.statusCode} ${orphanVariantWrite.body}`);
  }

  const incompletePropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: { oak: propSeatsDoc.oak }, expectedRevision: 3 }),
  );
  if (incompletePropSeatsWrite.statusCode !== 400 || JSON.parse(incompletePropSeatsWrite.body).error !== 'invalid_prop_seats') {
    throw new Error(`Incomplete prop-seat document should be rejected: ${incompletePropSeatsWrite.statusCode} ${incompletePropSeatsWrite.body}`);
  }

  // --- New-format level persistence (/api/levels): per-user, DB-backed -------
  const levelBody = { name: 'Smoke Level', board: { cols: 8, rows: 12 }, layers: { terrain: [], units: [] } };

  const anonymousLevels = await get('/api/levels');
  if (anonymousLevels.statusCode !== 401) {
    throw new Error(`Anonymous level list should require sign-in: ${anonymousLevels.statusCode}`);
  }

  const invalidLevelId = await get('/api/levels/Bad%20Id', { cookie: 'better-auth.session=abc' });
  if (invalidLevelId.statusCode !== 400) {
    throw new Error(`Invalid level id should fail: ${invalidLevelId.statusCode} ${invalidLevelId.body}`);
  }

  const invalidLevelBody = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { nope: true } }),
  );
  if (invalidLevelBody.statusCode !== 400) {
    throw new Error(`Invalid level body should fail: ${invalidLevelBody.statusCode} ${invalidLevelBody.body}`);
  }

  const savedLevel = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: levelBody }),
  );
  const savedLevelBody = JSON.parse(savedLevel.body);
  if (savedLevel.statusCode !== 200 || savedLevelBody.revision !== 1 || savedLevelBody.id !== 'smoke-1') {
    throw new Error(`Unexpected level save: ${savedLevel.statusCode} ${savedLevel.body}`);
  }

  const playerLevels = await get('/api/levels', { cookie: 'better-auth.session=abc' });
  const playerLevelsBody = JSON.parse(playerLevels.body);
  if (
    playerLevels.statusCode !== 200 ||
    playerLevelsBody.levels.length !== 1 ||
    playerLevelsBody.levels[0].id !== 'smoke-1' ||
    playerLevelsBody.levels[0].name !== 'Smoke Level' ||
    playerLevelsBody.levels[0].cols !== 8 ||
    playerLevelsBody.levels[0].rows !== 12
  ) {
    throw new Error(`Unexpected player level list: ${playerLevels.statusCode} ${playerLevels.body}`);
  }

  const loadedLevel = await get('/api/levels/smoke-1', { cookie: 'better-auth.session=abc' });
  const loadedLevelBody = JSON.parse(loadedLevel.body);
  if (loadedLevel.statusCode !== 200 || loadedLevelBody.level.name !== 'Smoke Level' || loadedLevelBody.level.id !== 'smoke-1' || loadedLevelBody.revision !== 1) {
    throw new Error(`Unexpected level load: ${loadedLevel.statusCode} ${loadedLevel.body}`);
  }

  const reSavedLevel = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...levelBody, name: 'Smoke Level v2' } }),
  );
  const reSavedLevelBody = JSON.parse(reSavedLevel.body);
  if (reSavedLevel.statusCode !== 200 || reSavedLevelBody.revision !== 2) {
    throw new Error(`Level re-save should bump revision: ${reSavedLevel.statusCode} ${reSavedLevel.body}`);
  }

  // Per-user scoping: the rival sees none of the player's levels.
  const rivalLevels = await get('/api/levels', { cookie: 'better-auth.session=rival' });
  const rivalLevelsBody = JSON.parse(rivalLevels.body);
  if (rivalLevels.statusCode !== 200 || rivalLevelsBody.levels.length !== 0) {
    throw new Error(`Levels should be scoped to owner: ${rivalLevels.statusCode} ${rivalLevels.body}`);
  }
  const rivalLevelRead = await get('/api/levels/smoke-1', { cookie: 'better-auth.session=rival' });
  if (rivalLevelRead.statusCode !== 404) {
    throw new Error(`Rival should not read the player's level: ${rivalLevelRead.statusCode} ${rivalLevelRead.body}`);
  }
  // The rival can reuse the same id in their own namespace without colliding.
  const rivalSave = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...levelBody, name: 'Rival Level' } }),
  );
  const rivalSaveBody = JSON.parse(rivalSave.body);
  if (rivalSave.statusCode !== 200 || rivalSaveBody.revision !== 1) {
    throw new Error(`Rival's same-id level should be independent (revision 1): ${rivalSave.statusCode} ${rivalSave.body}`);
  }
  const playerLevelStillV2 = await get('/api/levels/smoke-1', { cookie: 'better-auth.session=abc' });
  const playerLevelStillV2Body = JSON.parse(playerLevelStillV2.body);
  if (playerLevelStillV2.statusCode !== 200 || playerLevelStillV2Body.revision !== 2 || playerLevelStillV2Body.level.name !== 'Smoke Level v2') {
    throw new Error(`Rival's write must not affect the player's level: ${playerLevelStillV2.statusCode} ${playerLevelStillV2.body}`);
  }

  // --- Campaign workspace (/api/campaign-workspace): per-user, DB-backed -----
  const anonymousWorkspace = await get('/api/campaign-workspace');
  if (anonymousWorkspace.statusCode !== 401) {
    throw new Error(`Anonymous workspace should require sign-in: ${anonymousWorkspace.statusCode}`);
  }

  const emptyWorkspace = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  const emptyWorkspaceBody = JSON.parse(emptyWorkspace.body);
  if (emptyWorkspace.statusCode !== 200 || emptyWorkspaceBody.revision !== 0 || emptyWorkspaceBody.campaigns.length !== 0 || Object.keys(emptyWorkspaceBody.levels).length !== 0) {
    throw new Error(`Empty workspace should be empty: ${emptyWorkspace.statusCode} ${emptyWorkspace.body}`);
  }

  const invalidWorkspace = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ campaigns: 'nope' }),
  );
  if (invalidWorkspace.statusCode !== 400) {
    throw new Error(`Invalid workspace should fail: ${invalidWorkspace.statusCode} ${invalidWorkspace.body}`);
  }

  const workspaceLevel = {
    formatVersion: 1,
    id: 'smoke-1',
    name: 'Smoke Level',
    notes: '',
    board: { cols: 8, rows: 12, heightLevels: 1 },
    objective: 'capture-all',
    difficulty: 'normal',
    economy: { startingFunds: 1200, incomePerTurn: 150 },
    theme: 'grassland',
    layers: {
      terrain: [{ x: 0, y: 0, terrain: 'grass', elevation: 0 }],
      decals: [],
      zones: [],
      units: [{ x: 0, y: 0, type: 'king', side: 'player' }],
    },
  };
  const recoverableLegacyCanonical = {
    ...workspaceLevel,
    id: 'recoverable-legacy',
    name: 'Recovered Saved Position',
  };
  const workspaceDoc = {
    campaigns: [{
      formatVersion: 1,
      id: 'c1',
      name: 'Smoke Campaign',
      difficulty: 'normal',
      chapters: 1,
      levels: [{ levelId: 'smoke-1', ordinal: 0, objective: 'capture-all', stars: 0 }],
    }],
    levels: {
      'smoke-1': workspaceLevel,
      'recoverable-legacy': recoverableLegacyCanonical,
    },
  };
  const missingWorkspaceRevision = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceDoc),
  );
  if (missingWorkspaceRevision.statusCode !== 400 || JSON.parse(missingWorkspaceRevision.body).error !== 'workspace_revision_required') {
    throw new Error(`Whole-workspace writes must carry an observed revision: ${missingWorkspaceRevision.statusCode} ${missingWorkspaceRevision.body}`);
  }
  const savedWorkspace = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ ...workspaceDoc, revision: emptyWorkspaceBody.revision }),
  );
  const savedWorkspaceBody = JSON.parse(savedWorkspace.body);
  if (savedWorkspace.statusCode !== 200 || savedWorkspaceBody.ok !== true || savedWorkspaceBody.campaigns !== 1 || savedWorkspaceBody.revision !== 1) {
    throw new Error(`Unexpected workspace save: ${savedWorkspace.statusCode} ${savedWorkspace.body}`);
  }

  const loadedWorkspace = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  const loadedWorkspaceBody = JSON.parse(loadedWorkspace.body);
  if (
    loadedWorkspace.statusCode !== 200 ||
    loadedWorkspaceBody.campaigns.length !== 1 ||
    loadedWorkspaceBody.campaigns[0].name !== 'Smoke Campaign' ||
    loadedWorkspaceBody.revision !== 1 ||
    !loadedWorkspaceBody.levels['smoke-1']
  ) {
    throw new Error(`Workspace did not persist: ${loadedWorkspace.statusCode} ${loadedWorkspace.body}`);
  }

  // Per-user scoping: the rival has their own (empty) workspace.
  const rivalWorkspace = await get('/api/campaign-workspace', { cookie: 'better-auth.session=rival' });
  const rivalWorkspaceBody = JSON.parse(rivalWorkspace.body);
  if (rivalWorkspace.statusCode !== 200 || rivalWorkspaceBody.campaigns.length !== 0) {
    throw new Error(`Workspace should be scoped to owner: ${rivalWorkspace.statusCode} ${rivalWorkspace.body}`);
  }

  // A migrated v13 URL is translated client-side from ?map=<id> to the normal
  // owner-scoped document id legacy-<id>. There is intentionally no public or
  // edit-key compatibility endpoint: only the signed-in owner can recover it.
  const legacyRecoveredLevel = {
    ...workspaceLevel,
    id: 'legacy-abcdefgh',
    name: 'Recovered Legacy Draft',
  };
  await queryDb(
    `INSERT INTO level_working_copies
       (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash)
     VALUES ('legacy-abcdefgh', 'player@example.com', 'user', 'campaign', 'legacy-abcdefgh', $1::jsonb, 3, 0, NULL)`,
    [JSON.stringify(legacyRecoveredLevel)],
  );
  const canonicalBackedLegacyDraft = {
    ...recoverableLegacyCanonical,
    name: 'Recovered Dirty Draft',
  };
  await queryDb(
    `INSERT INTO level_working_copies
       (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash)
     SELECT 'legacy-kmnpqrst', owner_email, 'user', 'campaign', 'recoverable-legacy', $2::jsonb, 3, 1,
            md5(((body->'levels')->'recoverable-legacy')::text)
       FROM campaign_workspaces
      WHERE owner_email = $1`,
    ['player@example.com', JSON.stringify(canonicalBackedLegacyDraft)],
  );
  const ownerReadsLegacyDocument = await get('/api/editor-documents/legacy-abcdefgh', { cookie: 'better-auth.session=abc' });
  const ownerReadsLegacyBody = JSON.parse(ownerReadsLegacyDocument.body);
  if (
    ownerReadsLegacyDocument.statusCode !== 200 ||
    ownerReadsLegacyBody.document.document_id !== 'legacy-abcdefgh' ||
    ownerReadsLegacyBody.document.level_id !== 'legacy-abcdefgh' ||
    ownerReadsLegacyBody.document.level.name !== 'Recovered Legacy Draft'
  ) {
    throw new Error(`Legacy editor URL did not recover the owner's private document: ${ownerReadsLegacyDocument.statusCode} ${ownerReadsLegacyDocument.body}`);
  }
  const rivalReadsLegacyDocument = await get('/api/editor-documents/legacy-abcdefgh', { cookie: 'better-auth.session=rival' });
  if (rivalReadsLegacyDocument.statusCode !== 404) {
    throw new Error(`Legacy editor document must remain private to its owner: ${rivalReadsLegacyDocument.statusCode} ${rivalReadsLegacyDocument.body}`);
  }
  const anonymousReadsLegacyDocument = await get('/api/editor-documents/legacy-abcdefgh');
  if (anonymousReadsLegacyDocument.statusCode !== 401) {
    throw new Error(`Legacy editor document must require sign-in: ${anonymousReadsLegacyDocument.statusCode} ${anonymousReadsLegacyDocument.body}`);
  }
  const unauthorizedOfficialLevel = { ...officialWorkspace.levels['off-l-test'], name: 'Must Not Reconcile Before Auth' };
  await queryDb(
    `INSERT INTO level_working_copies
       (document_id, owner_email, workspace_kind, workspace_id, level_id, body, revision, saved_revision, baseline_hash)
     VALUES ('legacy-jkmnpqrs', 'rival@example.com', 'official', 'default', 'off-l-test', $1::jsonb, 1, 1, 'stale-baseline')`,
    [JSON.stringify(unauthorizedOfficialLevel)],
  );
  const nonAdminLoadsOwnedOfficialDocument = await get(
    '/api/editor-documents/legacy-jkmnpqrs',
    { cookie: 'better-auth.session=rival' },
  );
  if (nonAdminLoadsOwnedOfficialDocument.statusCode !== 403) {
    throw new Error(`Stored official workspace must be authorized before reconcile: ${nonAdminLoadsOwnedOfficialDocument.statusCode} ${nonAdminLoadsOwnedOfficialDocument.body}`);
  }
  const untouchedUnauthorizedOfficial = await queryDb(
    `SELECT body, revision, saved_revision, baseline_hash
       FROM level_working_copies
      WHERE document_id = 'legacy-jkmnpqrs'`,
  );
  if (
    Number(untouchedUnauthorizedOfficial.rows[0].revision) !== 1 ||
    Number(untouchedUnauthorizedOfficial.rows[0].saved_revision) !== 1 ||
    untouchedUnauthorizedOfficial.rows[0].baseline_hash !== 'stale-baseline' ||
    untouchedUnauthorizedOfficial.rows[0].body.name !== 'Must Not Reconcile Before Auth'
  ) {
    throw new Error(`Unauthorized GET mutated an official working copy: ${JSON.stringify(untouchedUnauthorizedOfficial.rows[0])}`);
  }
  const anonymousEditorDocumentList = await get('/api/editor-documents');
  if (anonymousEditorDocumentList.statusCode !== 401) {
    throw new Error(`Editor document discovery must require sign-in: ${anonymousEditorDocumentList.statusCode} ${anonymousEditorDocumentList.body}`);
  }
  const ownerEditorDocumentList = await get('/api/editor-documents', { cookie: 'better-auth.session=abc' });
  const ownerEditorDocumentListBody = JSON.parse(ownerEditorDocumentList.body);
  const standaloneLegacySummary = ownerEditorDocumentListBody.documents.find((entry) => entry.document_id === 'legacy-abcdefgh');
  const canonicalBackedLegacySummary = ownerEditorDocumentListBody.documents.find((entry) => entry.document_id === 'legacy-kmnpqrst');
  if (
    ownerEditorDocumentList.statusCode !== 200 ||
    ownerEditorDocumentListBody.documents.length !== 2 ||
    !standaloneLegacySummary || standaloneLegacySummary.never_saved !== true || standaloneLegacySummary.has_saved_baseline !== false ||
    !canonicalBackedLegacySummary || canonicalBackedLegacySummary.dirty !== true || canonicalBackedLegacySummary.never_saved !== false || canonicalBackedLegacySummary.has_saved_baseline !== true
  ) {
    throw new Error(`Owner could not discover private legacy editor work: ${ownerEditorDocumentList.statusCode} ${ownerEditorDocumentList.body}`);
  }
  const firstEditorDocumentPage = await get('/api/editor-documents?limit=1', { cookie: 'better-auth.session=abc' });
  const firstEditorDocumentPageBody = JSON.parse(firstEditorDocumentPage.body);
  const secondEditorDocumentPage = await get(
    `/api/editor-documents?limit=1&offset=${firstEditorDocumentPageBody.next_offset}`,
    { cookie: 'better-auth.session=abc' },
  );
  const secondEditorDocumentPageBody = JSON.parse(secondEditorDocumentPage.body);
  if (
    firstEditorDocumentPage.statusCode !== 200 ||
    firstEditorDocumentPageBody.documents.length !== 1 ||
    firstEditorDocumentPageBody.next_offset !== 1 ||
    secondEditorDocumentPage.statusCode !== 200 ||
    secondEditorDocumentPageBody.documents.length !== 1 ||
    secondEditorDocumentPageBody.documents[0].document_id === firstEditorDocumentPageBody.documents[0].document_id
  ) {
    throw new Error(`Editor document discovery pagination lost a draft: ${firstEditorDocumentPage.body} / ${secondEditorDocumentPage.body}`);
  }
  const neverSavedEditorDocuments = await get(
    '/api/editor-documents?status=never-saved',
    { cookie: 'better-auth.session=abc' },
  );
  const neverSavedEditorDocumentsBody = JSON.parse(neverSavedEditorDocuments.body);
  if (
    neverSavedEditorDocuments.statusCode !== 200 ||
    neverSavedEditorDocumentsBody.documents.length !== 1 ||
    neverSavedEditorDocumentsBody.documents[0].document_id !== 'legacy-abcdefgh'
  ) {
    throw new Error(`Never-saved document filter was not baseline-aware: ${neverSavedEditorDocuments.statusCode} ${neverSavedEditorDocuments.body}`);
  }
  const rivalEditorDocumentList = await get('/api/editor-documents', { cookie: 'better-auth.session=rival' });
  if (rivalEditorDocumentList.statusCode !== 200 || JSON.parse(rivalEditorDocumentList.body).documents.length !== 0) {
    throw new Error(`Editor document discovery leaked another owner's work: ${rivalEditorDocumentList.statusCode} ${rivalEditorDocumentList.body}`);
  }
  const loadedCanonicalBackedLegacy = await get('/api/editor-documents/legacy-kmnpqrst', { cookie: 'better-auth.session=abc' });
  const loadedCanonicalBackedLegacyBody = JSON.parse(loadedCanonicalBackedLegacy.body);
  if (
    loadedCanonicalBackedLegacy.statusCode !== 200 ||
    loadedCanonicalBackedLegacyBody.document.level.name !== 'Recovered Dirty Draft' ||
    loadedCanonicalBackedLegacyBody.document.has_saved_baseline !== true ||
    loadedCanonicalBackedLegacyBody.document.never_saved !== false
  ) {
    throw new Error(`Canonical-backed migrated draft lost its Discard target: ${loadedCanonicalBackedLegacy.statusCode} ${loadedCanonicalBackedLegacy.body}`);
  }
  const discardCanonicalBackedLegacy = await request(
    'POST', '/api/editor-documents/legacy-kmnpqrst/discard',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 3 }),
  );
  const discardCanonicalBackedLegacyBody = JSON.parse(discardCanonicalBackedLegacy.body);
  if (
    discardCanonicalBackedLegacy.statusCode !== 200 ||
    discardCanonicalBackedLegacyBody.document.level.name !== 'Recovered Saved Position' ||
    discardCanonicalBackedLegacyBody.document.revision !== 4 ||
    discardCanonicalBackedLegacyBody.document.saved_revision !== 4 ||
    discardCanonicalBackedLegacyBody.document.has_saved_baseline !== true
  ) {
    throw new Error(`Discard could not restore a migrated draft's canonical position: ${discardCanonicalBackedLegacy.statusCode} ${discardCanonicalBackedLegacy.body}`);
  }

  // --- Durable editor documents: private working copy, CAS autosave, explicit
  //     save/discard, canonical workspace separation (ADR-0068) ---------------
  const anonymousEditorResolve = await request(
    'POST', '/api/editor-documents/resolve', { 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'smoke-1' }),
  );
  if (anonymousEditorResolve.statusCode !== 401) {
    throw new Error(`Anonymous editor resolve should require sign-in: ${anonymousEditorResolve.statusCode} ${anonymousEditorResolve.body}`);
  }

  const resolvedEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'smoke-1' }),
  );
  const resolvedEditorBody = JSON.parse(resolvedEditor.body);
  const smokeDocumentId = resolvedEditorBody.document && resolvedEditorBody.document.document_id;
  if (
    resolvedEditor.statusCode !== 201 ||
    typeof smokeDocumentId !== 'string' || !smokeDocumentId ||
    resolvedEditorBody.document.level_id !== 'smoke-1' ||
    resolvedEditorBody.document.workspace_kind !== 'user' ||
    resolvedEditorBody.document.revision !== 1 ||
    resolvedEditorBody.document.saved_revision !== 1 ||
    resolvedEditorBody.document.dirty !== false
  ) {
    throw new Error(`Unexpected editor resolve: ${resolvedEditor.statusCode} ${resolvedEditor.body}`);
  }

  const draftLevel = { ...workspaceLevel, name: 'Autosaved Draft' };
  const autosavedEditor = await request(
    'PUT', `/api/editor-documents/${smokeDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 1, level: draftLevel }),
  );
  const autosavedEditorBody = JSON.parse(autosavedEditor.body);
  if (
    autosavedEditor.statusCode !== 200 ||
    autosavedEditorBody.document.revision !== 2 ||
    autosavedEditorBody.document.saved_revision !== 1 ||
    autosavedEditorBody.document.dirty !== true ||
    autosavedEditorBody.document.level.name !== 'Autosaved Draft'
  ) {
    throw new Error(`Unexpected editor autosave: ${autosavedEditor.statusCode} ${autosavedEditor.body}`);
  }

  // Autosave changes only the private working copy. Canonical workspace reads
  // (and therefore thumbnails/gameplay) still see the last explicit Save.
  const canonicalBeforeSave = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  if (JSON.parse(canonicalBeforeSave.body).levels['smoke-1'].name !== 'Smoke Level') {
    throw new Error(`Editor autosave must not mutate the canonical workspace: ${canonicalBeforeSave.body}`);
  }

  const staleAutosave = await request(
    'PUT', `/api/editor-documents/${smokeDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 1, level: { ...workspaceLevel, name: 'Stale Tab' } }),
  );
  const staleAutosaveBody = JSON.parse(staleAutosave.body);
  if (
    staleAutosave.statusCode !== 409 ||
    staleAutosaveBody.error !== 'editor_document_revision_conflict' ||
    staleAutosaveBody.document.revision !== 2 ||
    staleAutosaveBody.document.level.name !== 'Autosaved Draft'
  ) {
    throw new Error(`Stale editor autosave should return the current document: ${staleAutosave.statusCode} ${staleAutosave.body}`);
  }

  const rivalEditorRead = await get(`/api/editor-documents/${smokeDocumentId}`, { cookie: 'better-auth.session=rival' });
  if (rivalEditorRead.statusCode !== 404) {
    throw new Error(`Editor documents must be account-scoped: ${rivalEditorRead.statusCode} ${rivalEditorRead.body}`);
  }
  // Per-owner level ids can collide. Give the rival their own `smoke-1` and
  // prove the globally opaque document address still cannot cross accounts.
  const rivalCollisionWorkspace = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ campaigns: [], levels: { 'smoke-1': workspaceLevel }, revision: rivalWorkspaceBody.revision }),
  );
  if (rivalCollisionWorkspace.statusCode !== 200) {
    throw new Error(`Could not create rival collision workspace: ${rivalCollisionWorkspace.statusCode} ${rivalCollisionWorkspace.body}`);
  }
  const rivalResolvedEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'smoke-1' }),
  );
  const rivalResolvedEditorBody = JSON.parse(rivalResolvedEditor.body);
  const rivalDocumentId = rivalResolvedEditorBody.document && rivalResolvedEditorBody.document.document_id;
  if (
    rivalResolvedEditor.statusCode !== 201 ||
    rivalResolvedEditorBody.document.level_id !== 'smoke-1' ||
    typeof rivalDocumentId !== 'string' || !rivalDocumentId || rivalDocumentId === smokeDocumentId
  ) {
    throw new Error(`Colliding owner level ids must receive distinct document ids: ${rivalResolvedEditor.statusCode} ${rivalResolvedEditor.body}`);
  }
  const playerReadsRivalDocument = await get(`/api/editor-documents/${rivalDocumentId}`, { cookie: 'better-auth.session=abc' });
  if (playerReadsRivalDocument.statusCode !== 404) {
    throw new Error(`Player must not resolve rival's opaque editor document: ${playerReadsRivalDocument.statusCode} ${playerReadsRivalDocument.body}`);
  }

  const discardedEditor = await request(
    'POST', `/api/editor-documents/${smokeDocumentId}/discard`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 2 }),
  );
  const discardedEditorBody = JSON.parse(discardedEditor.body);
  if (
    discardedEditor.statusCode !== 200 ||
    discardedEditorBody.document.revision !== 3 ||
    discardedEditorBody.document.saved_revision !== 3 ||
    discardedEditorBody.document.dirty !== false ||
    discardedEditorBody.document.level.name !== 'Smoke Level'
  ) {
    throw new Error(`Discard should restore the canonical saved Level: ${discardedEditor.statusCode} ${discardedEditor.body}`);
  }

  const autosavedAgain = await request(
    'PUT', `/api/editor-documents/${smokeDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 3, level: { ...workspaceLevel, name: 'Debounced Version' } }),
  );
  if (autosavedAgain.statusCode !== 200 || JSON.parse(autosavedAgain.body).document.revision !== 4) {
    throw new Error(`Second autosave failed: ${autosavedAgain.statusCode} ${autosavedAgain.body}`);
  }

  // Save may carry the exact current in-memory Level. The server promotes it in
  // the same transaction as the working-copy CAS, so a pending debounce cannot win.
  const exactSaveLevel = { ...workspaceLevel, name: 'Exact Save Click' };
  const savedEditor = await request(
    'POST', `/api/editor-documents/${smokeDocumentId}/save`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 4, level: exactSaveLevel, campaign_id: null }),
  );
  const savedEditorBody = JSON.parse(savedEditor.body);
  if (
    savedEditor.statusCode !== 200 ||
    savedEditorBody.document.revision !== 5 ||
    savedEditorBody.document.saved_revision !== 5 ||
    savedEditorBody.workspace_revision !== 2 ||
    savedEditorBody.document.level.name !== 'Exact Save Click'
  ) {
    throw new Error(`Editor Save should promote the exact supplied Level: ${savedEditor.statusCode} ${savedEditor.body}`);
  }
  const canonicalAfterSave = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  const canonicalAfterSaveBody = JSON.parse(canonicalAfterSave.body);
  if (
    canonicalAfterSaveBody.levels['smoke-1'].name !== 'Exact Save Click' ||
    canonicalAfterSaveBody.revision !== 2 ||
    canonicalAfterSaveBody.campaigns[0].levels.some((ref) => ref.levelId === 'smoke-1')
  ) {
    throw new Error(`Editor Save did not promote to canonical workspace: ${canonicalAfterSave.body}`);
  }
  const staleWholeWorkspaceSave = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ ...workspaceDoc, revision: loadedWorkspaceBody.revision }),
  );
  const staleWholeWorkspaceSaveBody = JSON.parse(staleWholeWorkspaceSave.body);
  if (
    staleWholeWorkspaceSave.statusCode !== 409 ||
    staleWholeWorkspaceSaveBody.error !== 'workspace_revision_conflict' ||
    staleWholeWorkspaceSaveBody.workspace.revision !== 2 ||
    staleWholeWorkspaceSaveBody.workspace.levels['smoke-1'].name !== 'Exact Save Click'
  ) {
    throw new Error(`Stale whole-workspace Save could revert the canonical Level: ${staleWholeWorkspaceSave.statusCode} ${staleWholeWorkspaceSave.body}`);
  }

  // Canonical workspaces still have other legitimate writers. A clean editor
  // document follows an externally changed canonical Level on its next load;
  // a dirty one preserves its work but may not blindly overwrite that change.
  const baselineLevelId = 'baseline-check';
  const baselineCanonicalV1 = { ...workspaceLevel, id: baselineLevelId, name: 'Baseline Canonical V1' };
  const workspaceForBaseline = canonicalAfterSaveBody;
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV1;
  const createBaselineCanonical = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (createBaselineCanonical.statusCode !== 200) {
    throw new Error(`Could not seed baseline-conflict Level: ${createBaselineCanonical.statusCode} ${createBaselineCanonical.body}`);
  }
  workspaceForBaseline.revision = JSON.parse(createBaselineCanonical.body).revision;
  const baselineResolved = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: baselineLevelId }),
  );
  const baselineResolvedBody = JSON.parse(baselineResolved.body);
  const baselineDocumentId = baselineResolvedBody.document && baselineResolvedBody.document.document_id;
  if (
    baselineResolved.statusCode !== 201 ||
    typeof baselineDocumentId !== 'string' || !baselineDocumentId ||
    baselineResolvedBody.document.baseline_conflict !== false
  ) {
    throw new Error(`Could not resolve baseline-conflict document: ${baselineResolved.statusCode} ${baselineResolved.body}`);
  }

  const baselineCanonicalV2 = { ...baselineCanonicalV1, name: 'Baseline Canonical V2' };
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV2;
  const externalCleanChange = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (externalCleanChange.statusCode !== 200) {
    throw new Error(`Could not apply external clean canonical change: ${externalCleanChange.statusCode} ${externalCleanChange.body}`);
  }
  workspaceForBaseline.revision = JSON.parse(externalCleanChange.body).revision;
  const refreshedCleanDocument = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: baselineLevelId }),
  );
  const refreshedCleanBody = JSON.parse(refreshedCleanDocument.body);
  if (
    refreshedCleanDocument.statusCode !== 200 ||
    refreshedCleanBody.document.revision !== 2 ||
    refreshedCleanBody.document.saved_revision !== 2 ||
    refreshedCleanBody.document.dirty !== false ||
    refreshedCleanBody.document.baseline_conflict !== false ||
    refreshedCleanBody.document.level.name !== 'Baseline Canonical V2'
  ) {
    throw new Error(`Clean editor document did not refresh from canonical: ${refreshedCleanDocument.statusCode} ${refreshedCleanDocument.body}`);
  }

  const baselineDraft = { ...baselineCanonicalV2, name: 'Preserve This Dirty Draft' };
  const dirtyBaselineDocument = await request(
    'PUT', `/api/editor-documents/${baselineDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 2, level: baselineDraft }),
  );
  if (dirtyBaselineDocument.statusCode !== 200 || JSON.parse(dirtyBaselineDocument.body).document.revision !== 3) {
    throw new Error(`Could not autosave dirty baseline document: ${dirtyBaselineDocument.statusCode} ${dirtyBaselineDocument.body}`);
  }
  const baselineCanonicalV3 = { ...baselineCanonicalV2, name: 'Baseline Canonical V3 External' };
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV3;
  const externalDirtyChange = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (externalDirtyChange.statusCode !== 200) {
    throw new Error(`Could not apply external dirty canonical change: ${externalDirtyChange.statusCode} ${externalDirtyChange.body}`);
  }
  const loadedConflictedDocument = await get(`/api/editor-documents/${baselineDocumentId}`, { cookie: 'better-auth.session=abc' });
  const loadedConflictedBody = JSON.parse(loadedConflictedDocument.body);
  if (
    loadedConflictedDocument.statusCode !== 200 ||
    loadedConflictedBody.document.revision !== 3 ||
    loadedConflictedBody.document.level.name !== 'Preserve This Dirty Draft' ||
    loadedConflictedBody.document.baseline_conflict !== true
  ) {
    throw new Error(`Dirty editor document did not preserve/report canonical divergence: ${loadedConflictedDocument.statusCode} ${loadedConflictedDocument.body}`);
  }
  const rejectedBaselineSave = await request(
    'POST', `/api/editor-documents/${baselineDocumentId}/save`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 3, level: baselineDraft }),
  );
  const rejectedBaselineSaveBody = JSON.parse(rejectedBaselineSave.body);
  if (
    rejectedBaselineSave.statusCode !== 409 ||
    rejectedBaselineSaveBody.error !== 'editor_document_baseline_conflict' ||
    rejectedBaselineSaveBody.document.level.name !== 'Preserve This Dirty Draft' ||
    rejectedBaselineSaveBody.document.baseline_conflict !== true
  ) {
    throw new Error(`Stale baseline Save should preserve work and refuse promotion: ${rejectedBaselineSave.statusCode} ${rejectedBaselineSave.body}`);
  }
  const canonicalAfterRejectedBaselineSave = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  if (JSON.parse(canonicalAfterRejectedBaselineSave.body).levels[baselineLevelId].name !== 'Baseline Canonical V3 External') {
    throw new Error(`Rejected baseline Save overwrote canonical content: ${canonicalAfterRejectedBaselineSave.body}`);
  }
  const discardedBaselineConflict = await request(
    'POST', `/api/editor-documents/${baselineDocumentId}/discard`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 3 }),
  );
  const discardedBaselineConflictBody = JSON.parse(discardedBaselineConflict.body);
  if (
    discardedBaselineConflict.statusCode !== 200 ||
    discardedBaselineConflictBody.document.revision !== 4 ||
    discardedBaselineConflictBody.document.saved_revision !== 4 ||
    discardedBaselineConflictBody.document.baseline_conflict !== false ||
    discardedBaselineConflictBody.document.level.name !== 'Baseline Canonical V3 External'
  ) {
    throw new Error(`Discard did not adopt current canonical baseline: ${discardedBaselineConflict.statusCode} ${discardedBaselineConflict.body}`);
  }

  // Allocation must not round an imported numeric id through Number or emit an
  // 81-character id when a 79-digit suffix rolls over. A bounded BigInt fallback
  // chooses the first free suffix (c1 already exists, so this remains l2).
  const maximumWidthNumericId = `l${'9'.repeat(79)}`;
  await queryDb(
    `UPDATE campaign_workspaces
        SET body = jsonb_set(body, ARRAY['levels', $2]::text[], $3::jsonb, true)
      WHERE owner_email = $1`,
    [
      'player@example.com',
      maximumWidthNumericId,
      JSON.stringify({ ...workspaceLevel, id: maximumWidthNumericId, name: 'Imported Maximum Numeric Id' }),
    ],
  );

  // A new editor document receives its stable user level id from the server.
  // It is durable immediately, but remains dirty until its first explicit Save.
  const newEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...workspaceLevel, id: 'client-placeholder', name: 'New Working Level' } }),
  );
  const newEditorBody = JSON.parse(newEditor.body);
  const newDocumentId = newEditorBody.document && newEditorBody.document.document_id;
  if (
    newEditor.statusCode !== 201 ||
    typeof newDocumentId !== 'string' || !newDocumentId || newDocumentId === smokeDocumentId ||
    newEditorBody.document.level_id !== 'l2' ||
    newEditorBody.document.level.id !== 'l2' ||
    newEditorBody.document.revision !== 1 ||
    newEditorBody.document.saved_revision !== 0 ||
    newEditorBody.document.dirty !== true
  ) {
    throw new Error(`New editor document should get a server level id and start dirty: ${newEditor.statusCode} ${newEditor.body}`);
  }
  const recentAfterNewDocument = await get('/api/editor-documents', { cookie: 'better-auth.session=abc' });
  const recentAfterNewDocumentBody = JSON.parse(recentAfterNewDocument.body);
  const discoveredNewDocument = recentAfterNewDocumentBody.documents.find((entry) => entry.document_id === newDocumentId);
  if (
    recentAfterNewDocument.statusCode !== 200 ||
    !discoveredNewDocument ||
    discoveredNewDocument.level_id !== 'l2' ||
    discoveredNewDocument.name !== 'New Working Level' ||
    discoveredNewDocument.never_saved !== true
  ) {
    throw new Error(`Never-saved cloud document was not discoverable without its URL: ${recentAfterNewDocument.statusCode} ${recentAfterNewDocument.body}`);
  }
  const workspaceBeforeReservedCollision = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  const workspaceBeforeReservedCollisionBody = JSON.parse(workspaceBeforeReservedCollision.body);
  const reservedCollisionAttempt = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      ...workspaceBeforeReservedCollisionBody,
      levels: {
        ...workspaceBeforeReservedCollisionBody.levels,
        l2: { ...newEditorBody.document.level, name: 'Unrelated Canonical Claim' },
      },
    }),
  );
  const reservedCollisionAttemptBody = JSON.parse(reservedCollisionAttempt.body);
  if (
    reservedCollisionAttempt.statusCode !== 409 ||
    reservedCollisionAttemptBody.error !== 'workspace_level_reserved' ||
    !Array.isArray(reservedCollisionAttemptBody.level_ids) ||
    reservedCollisionAttemptBody.level_ids[0] !== 'l2' ||
    reservedCollisionAttemptBody.workspace.levels.l2
  ) {
    throw new Error(`Whole-workspace writer claimed a never-saved document id: ${reservedCollisionAttempt.statusCode} ${reservedCollisionAttempt.body}`);
  }
  const discardNeverSaved = await request(
    'POST', `/api/editor-documents/${newDocumentId}/discard`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 1 }),
  );
  if (discardNeverSaved.statusCode !== 409 || JSON.parse(discardNeverSaved.body).error !== 'no_saved_level') {
    throw new Error(`Never-saved document should have no discard target: ${discardNeverSaved.statusCode} ${discardNeverSaved.body}`);
  }
  const newEditorAutosaveLevel = { ...workspaceLevel, id: 'l2', name: 'New Working Level Autosaved' };
  const newEditorAutosave = await request(
    'PUT', `/api/editor-documents/${newDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 1, level: newEditorAutosaveLevel }),
  );
  if (newEditorAutosave.statusCode !== 200 || JSON.parse(newEditorAutosave.body).document.revision !== 2) {
    throw new Error(`New document autosave failed: ${newEditorAutosave.statusCode} ${newEditorAutosave.body}`);
  }
  const firstNewEditorSave = await request(
    'POST', `/api/editor-documents/${newDocumentId}/save`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 2 }),
  );
  const firstNewEditorSaveBody = JSON.parse(firstNewEditorSave.body);
  if (
    firstNewEditorSave.statusCode !== 200 ||
    firstNewEditorSaveBody.document.revision !== 3 ||
    firstNewEditorSaveBody.document.saved_revision !== 3 ||
    firstNewEditorSaveBody.workspace_revision !== 6 ||
    firstNewEditorSaveBody.document.dirty !== false
  ) {
    throw new Error(`First Save should promote a new document: ${firstNewEditorSave.statusCode} ${firstNewEditorSave.body}`);
  }
  const workspaceWithNewLevel = await get('/api/campaign-workspace', { cookie: 'better-auth.session=abc' });
  if (JSON.parse(workspaceWithNewLevel.body).levels.l2.name !== 'New Working Level Autosaved') {
    throw new Error(`First Save did not create the canonical Level: ${workspaceWithNewLevel.body}`);
  }
  const postSaveDraft = await request(
    'PUT', `/api/editor-documents/${newDocumentId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 3, level: { ...newEditorAutosaveLevel, name: 'Throw This Away' } }),
  );
  if (postSaveDraft.statusCode !== 200 || JSON.parse(postSaveDraft.body).document.revision !== 4) {
    throw new Error(`Post-save draft failed: ${postSaveDraft.statusCode} ${postSaveDraft.body}`);
  }
  const discardNewEditorDraft = await request(
    'POST', `/api/editor-documents/${newDocumentId}/discard`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 4 }),
  );
  const discardNewEditorDraftBody = JSON.parse(discardNewEditorDraft.body);
  if (
    discardNewEditorDraft.statusCode !== 200 ||
    discardNewEditorDraftBody.document.revision !== 5 ||
    discardNewEditorDraftBody.document.saved_revision !== 5 ||
    discardNewEditorDraftBody.document.level.name !== 'New Working Level Autosaved'
  ) {
    throw new Error(`Discard should restore the newly saved canonical Level: ${discardNewEditorDraft.statusCode} ${discardNewEditorDraft.body}`);
  }

  // Official working copies use the same CAS contract, but only admins may
  // resolve or mutate them; the promoted workspace remains globally readable.
  const nonAdminOfficialEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=rival', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'off-l-test', workspace_kind: 'official', workspace_id: 'default' }),
  );
  if (nonAdminOfficialEditor.statusCode !== 403) {
    throw new Error(`Official editor document should require admin: ${nonAdminOfficialEditor.statusCode} ${nonAdminOfficialEditor.body}`);
  }
  const officialEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'off-l-test', workspace_kind: 'official', workspace_id: 'default' }),
  );
  const officialEditorBody = JSON.parse(officialEditor.body);
  const officialDocumentId = officialEditorBody.document && officialEditorBody.document.document_id;
  if (officialEditor.statusCode !== 201 || typeof officialDocumentId !== 'string' || !officialDocumentId || officialEditorBody.document.level.name !== 'Test Level') {
    throw new Error(`Official editor resolve failed: ${officialEditor.statusCode} ${officialEditor.body}`);
  }
  const officialEditorSave = await request(
    'POST', `/api/editor-documents/${officialDocumentId}/save`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      revision: 1,
      level: { ...officialWorkspace.levels['off-l-test'], name: 'Official Exact Save' },
    }),
  );
  const officialEditorSaveBody = JSON.parse(officialEditorSave.body);
  if (
    officialEditorSave.statusCode !== 200 ||
    officialEditorSaveBody.document.saved_revision !== 2 ||
    officialEditorSaveBody.workspace_revision !== 2
  ) {
    throw new Error(`Official editor Save failed: ${officialEditorSave.statusCode} ${officialEditorSave.body}`);
  }
  const officialAfterEditorSave = await get('/api/official-campaigns/default');
  const officialAfterEditorSaveBody = JSON.parse(officialAfterEditorSave.body);
  if (
    officialAfterEditorSaveBody.portfolio.data.levels['off-l-test'].name !== 'Official Exact Save' ||
    officialAfterEditorSaveBody.portfolio.revision !== 2
  ) {
    throw new Error(`Official editor Save did not promote globally: ${officialAfterEditorSave.body}`);
  }
  const staleOfficialWorkspaceSave = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace, revision: publishedOfficialBody.portfolio.revision }),
  );
  const staleOfficialWorkspaceSaveBody = JSON.parse(staleOfficialWorkspaceSave.body);
  if (
    staleOfficialWorkspaceSave.statusCode !== 409 ||
    staleOfficialWorkspaceSaveBody.error !== 'official_campaign_revision_conflict' ||
    staleOfficialWorkspaceSaveBody.portfolio.revision !== 2 ||
    staleOfficialWorkspaceSaveBody.portfolio.data.levels['off-l-test'].name !== 'Official Exact Save'
  ) {
    throw new Error(`Stale official workspace Save could revert the canonical Level: ${staleOfficialWorkspaceSave.statusCode} ${staleOfficialWorkspaceSave.body}`);
  }

  // --- Game Lab runs (/api/lab-runs): per-user, DB-backed --------------------
  const anonymousLabRuns = await get('/api/lab-runs');
  if (anonymousLabRuns.statusCode !== 401) {
    throw new Error(`Anonymous lab runs should require sign-in: ${anonymousLabRuns.statusCode}`);
  }

  const emptyLabRuns = await get('/api/lab-runs', { cookie: 'better-auth.session=abc' });
  const emptyLabRunsBody = JSON.parse(emptyLabRuns.body);
  if (emptyLabRuns.statusCode !== 200 || emptyLabRunsBody.runs.length !== 0) {
    throw new Error(`Empty lab run list should be empty: ${emptyLabRuns.statusCode} ${emptyLabRuns.body}`);
  }

  const invalidLabRun = await request(
    'POST', '/api/lab-runs',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ meta: 'nope', body: { games: [] } }),
  );
  const invalidLabRunBody = JSON.parse(invalidLabRun.body);
  if (invalidLabRun.statusCode !== 400 || invalidLabRunBody.error !== 'invalid_lab_run') {
    throw new Error(`Invalid lab run should fail: ${invalidLabRun.statusCode} ${invalidLabRun.body}`);
  }

  const savedLabRun = await request(
    'POST', '/api/lab-runs',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ meta: { name: 't' }, body: { games: [1, 2] } }),
  );
  const savedLabRunBody = JSON.parse(savedLabRun.body);
  if (savedLabRun.statusCode !== 200 || savedLabRunBody.ok !== true || !savedLabRunBody.id || !savedLabRunBody.created_at) {
    throw new Error(`Unexpected lab run save: ${savedLabRun.statusCode} ${savedLabRun.body}`);
  }
  const labRunId = savedLabRunBody.id;

  const listedLabRuns = await get('/api/lab-runs', { cookie: 'better-auth.session=abc' });
  const listedLabRunsBody = JSON.parse(listedLabRuns.body);
  if (
    listedLabRuns.statusCode !== 200 ||
    listedLabRunsBody.runs.length !== 1 ||
    listedLabRunsBody.runs[0].id !== labRunId ||
    listedLabRunsBody.runs[0].meta.name !== 't' ||
    'body' in listedLabRunsBody.runs[0]
  ) {
    throw new Error(`Lab run list should carry meta but never body: ${listedLabRuns.statusCode} ${listedLabRuns.body}`);
  }

  const loadedLabRun = await get(`/api/lab-runs/${labRunId}`, { cookie: 'better-auth.session=abc' });
  const loadedLabRunBody = JSON.parse(loadedLabRun.body);
  if (
    loadedLabRun.statusCode !== 200 ||
    loadedLabRunBody.id !== labRunId ||
    loadedLabRunBody.meta.name !== 't' ||
    JSON.stringify(loadedLabRunBody.body) !== JSON.stringify({ games: [1, 2] })
  ) {
    throw new Error(`Lab run body did not round-trip: ${loadedLabRun.statusCode} ${loadedLabRun.body}`);
  }

  // Per-user scoping: the rival can neither read the player's run nor delete
  // it (their DELETE is a 200 no-op).
  const rivalLabRunRead = await get(`/api/lab-runs/${labRunId}`, { cookie: 'better-auth.session=rival' });
  if (rivalLabRunRead.statusCode !== 404) {
    throw new Error(`Rival should not read the player's lab run: ${rivalLabRunRead.statusCode} ${rivalLabRunRead.body}`);
  }
  const rivalLabRunDelete = await request('DELETE', `/api/lab-runs/${labRunId}`, { cookie: 'better-auth.session=rival' });
  const rivalLabRunDeleteBody = JSON.parse(rivalLabRunDelete.body);
  if (rivalLabRunDelete.statusCode !== 200 || rivalLabRunDeleteBody.ok !== true) {
    throw new Error(`Rival lab run delete should be an idempotent 200: ${rivalLabRunDelete.statusCode} ${rivalLabRunDelete.body}`);
  }
  const labRunSurvived = await get(`/api/lab-runs/${labRunId}`, { cookie: 'better-auth.session=abc' });
  if (labRunSurvived.statusCode !== 200) {
    throw new Error(`Rival's delete must not remove the player's lab run: ${labRunSurvived.statusCode} ${labRunSurvived.body}`);
  }

  const deletedLabRun = await request('DELETE', `/api/lab-runs/${labRunId}`, { cookie: 'better-auth.session=abc' });
  const deletedLabRunBody = JSON.parse(deletedLabRun.body);
  if (deletedLabRun.statusCode !== 200 || deletedLabRunBody.ok !== true) {
    throw new Error(`Unexpected lab run delete: ${deletedLabRun.statusCode} ${deletedLabRun.body}`);
  }
  const labRunsAfterDelete = await get('/api/lab-runs', { cookie: 'better-auth.session=abc' });
  const labRunsAfterDeleteBody = JSON.parse(labRunsAfterDelete.body);
  if (labRunsAfterDelete.statusCode !== 200 || labRunsAfterDeleteBody.runs.length !== 0) {
    throw new Error(`Lab run list should be empty after delete: ${labRunsAfterDelete.statusCode} ${labRunsAfterDelete.body}`);
  }

  const createdCampaign = await request(
    'POST',
    '/api/campaigns',
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      title: 'Forked Opening',
      description: 'First draft campaign',
      level: {
        name: 'Rook Alley',
        objective: 'Hold the back rank',
        width: 10,
        height: 14,
        enemy_budget: 5,
        notes: 'Start with a forced rook lane.',
      },
    }),
  );
  const createdCampaignBody = JSON.parse(createdCampaign.body);
  if (createdCampaign.statusCode !== 201 || createdCampaignBody.campaign.level_count !== 1 || createdCampaignBody.campaign.levels[0].width !== 10 || createdCampaignBody.campaign.levels[0].layout.length < 2) {
    throw new Error(`Unexpected campaign create response: ${createdCampaign.statusCode} ${createdCampaign.body}`);
  }
  const createdLevel = createdCampaignBody.campaign.levels[0];
  if (
    !createdLevel.zones.some((zone) => zone.id === 'player-1-spawn' && zone.selections.some((selection) => selection.type === 'rect' && selection.y1 === 13 && selection.y2 === 13)) ||
    !createdLevel.zones.some((zone) => zone.id === 'player-2-spawn' && zone.selections.some((selection) => selection.type === 'rect' && selection.y1 === 0 && selection.y2 === 0)) ||
    createdLevel.zone_assignments.player_1_spawn_zone_id !== 'player-1-spawn' ||
    createdLevel.zone_assignments.player_2_spawn_zone_id !== 'player-2-spawn'
  ) {
    throw new Error(`Created level did not include default player spawn zones: ${createdCampaign.body}`);
  }

  const campaignId = createdCampaignBody.campaign.id;
  const storedCampaign = await queryDb(
    'SELECT owner_email, body FROM campaigns WHERE owner_email = $1 AND id = $2',
    ['player@example.com', campaignId],
  );
  if (
    storedCampaign.rowCount !== 1 ||
    storedCampaign.rows[0].owner_email !== 'player@example.com' ||
    storedCampaign.rows[0].body.title !== 'Forked Opening' ||
    storedCampaign.rows[0].body.levels[0].width !== 10
  ) {
    throw new Error(`Created campaign should persist to Postgres: ${JSON.stringify(storedCampaign.rows)}`);
  }

  const rivalCampaigns = await get('/api/campaigns', { cookie: 'better-auth.session=rival' });
  const rivalCampaignsBody = JSON.parse(rivalCampaigns.body);
  if (rivalCampaigns.statusCode !== 200 || rivalCampaignsBody.campaigns.length !== 0) {
    throw new Error(`Campaigns should be scoped to owner: ${rivalCampaigns.statusCode} ${rivalCampaigns.body}`);
  }

  const forbiddenCampaign = await get(`/api/campaigns/${campaignId}`, { cookie: 'better-auth.session=rival' });
  if (forbiddenCampaign.statusCode !== 404) {
    throw new Error(`Rival should not read player campaign: ${forbiddenCampaign.statusCode} ${forbiddenCampaign.body}`);
  }

  const renamedCampaign = await request(
    'PATCH',
    `/api/campaigns/${campaignId}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ title: 'Knight Forks', description: 'Renamed draft' }),
  );
  const renamedCampaignBody = JSON.parse(renamedCampaign.body);
  if (renamedCampaign.statusCode !== 200 || renamedCampaignBody.campaign.title !== 'Knight Forks') {
    throw new Error(`Unexpected campaign update response: ${renamedCampaign.statusCode} ${renamedCampaign.body}`);
  }
  const renamedCampaignRows = await queryDb(
    'SELECT body FROM campaigns WHERE owner_email = $1 AND id = $2',
    ['player@example.com', campaignId],
  );
  if (renamedCampaignRows.rows[0].body.title !== 'Knight Forks') {
    throw new Error(`Renamed campaign should persist to Postgres: ${JSON.stringify(renamedCampaignRows.rows)}`);
  }

  const addedLevel = await request(
    'POST',
    `/api/campaigns/${campaignId}/levels`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({ name: 'Bishop Net', difficulty: 'hard', enemy_budget: 8 }),
  );
  const addedLevelBody = JSON.parse(addedLevel.body);
  if (addedLevel.statusCode !== 201 || addedLevelBody.campaign.level_count !== 2 || addedLevelBody.level.name !== 'Bishop Net') {
    throw new Error(`Unexpected add level response: ${addedLevel.statusCode} ${addedLevel.body}`);
  }

  const rejectedSmallSpawn = await request(
    'PATCH',
    `/api/campaigns/${campaignId}/levels/${addedLevelBody.level.id}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      zones: [
        { id: 'player-1-spawn', name: 'Player 1 Spawn', selections: [{ id: 'selection-1', type: 'cell', x: 0, y: 7 }] },
        { id: 'player-2-spawn', name: 'Player 2 Spawn', selections: [{ id: 'selection-1', type: 'rect', x1: 0, y1: 0, x2: 7, y2: 0 }] },
      ],
      zone_assignments: {
        misc_zones: [],
      },
    }),
  );
  if (rejectedSmallSpawn.statusCode !== 400 || !rejectedSmallSpawn.body.includes('player_1_spawn_zone_id_needs_3_cells')) {
    throw new Error(`Small mandatory spawn zone should be rejected: ${rejectedSmallSpawn.statusCode} ${rejectedSmallSpawn.body}`);
  }

  const patchedLevel = await request(
    'PATCH',
    `/api/campaigns/${campaignId}/levels/${addedLevelBody.level.id}`,
    { cookie: 'better-auth.session=abc', 'content-type': 'application/json' },
    JSON.stringify({
      height: 18,
      notes: 'Late pressure test.',
      layout: [
        { x: 1, y: 2, role: 'enemy', type: 'knight' },
        { x: 2, y: 2, role: 'terrain', type: 'rock' },
        { x: 99, y: 2, role: 'enemy', type: 'rook' },
        { x: 3, y: 3, role: 'enemy', type: 'dragon' },
      ],
      zones: [
        {
          id: 'player-1-spawn',
          name: 'Player 1 Spawn',
          selections: [
            { id: 'selection-1', type: 'cell', x: 0, y: 0 },
            { id: 'selection-2', type: 'rect', x1: 1, y1: 1, x2: 3, y2: 3 },
            { id: 'bad-selection', type: 'cell', x: 99, y: 0 },
          ],
        },
        {
          id: 'player-2-spawn',
          name: 'Player 2 Spawn',
          selections: [
            { id: 'selection-1', type: 'rect', x1: 0, y1: 17, x2: 3, y2: 17 },
          ],
        },
        {
          id: 'falling-rock-a',
          name: 'Falling Rock A',
          selections: [
            { id: 'selection-1', type: 'rect', x1: 4, y1: 4, x2: 5, y2: 5 },
          ],
        },
        {
          id: 'falling-rock-b',
          name: 'Falling Rock B',
          selections: [
            { id: 'selection-1', type: 'cell', x: 6, y: 6 },
          ],
        },
      ],
      zone_assignments: {
        misc_zones: [
          { id: 'misc-zone-1', type: 'falling-rock', zone_id: 'falling-rock-a' },
          { id: 'misc-zone-2', type: 'falling-rock', zone_id: 'falling-rock-b' },
          { id: 'bad-misc-zone', type: 'lava', zone_id: 'falling-rock-a' },
        ],
      },
    }),
  );
  const patchedLevelBody = JSON.parse(patchedLevel.body);
  if (patchedLevel.statusCode !== 200 || patchedLevelBody.level.height !== 18 || patchedLevelBody.level.notes !== 'Late pressure test.' || patchedLevelBody.level.layout.length !== 2) {
    throw new Error(`Unexpected level update response: ${patchedLevel.statusCode} ${patchedLevel.body}`);
  }
  if (!patchedLevelBody.level.layout.some((cell) => cell.x === 1 && cell.y === 2 && cell.role === 'enemy' && cell.type === 'knight')) {
    throw new Error(`Patched level layout did not persist enemy knight: ${patchedLevel.body}`);
  }
  if (
    patchedLevelBody.level.zones.length !== 4 ||
    patchedLevelBody.level.zones[0].selections.length !== 2 ||
    patchedLevelBody.level.zone_assignments.player_1_spawn_zone_id !== 'player-1-spawn' ||
    patchedLevelBody.level.zone_assignments.player_2_spawn_zone_id !== 'player-2-spawn' ||
    patchedLevelBody.level.zone_assignments.misc_zones.length !== 2 ||
    patchedLevelBody.level.zone_assignments.misc_zones[0].type !== 'falling-rock'
  ) {
    throw new Error(`Patched level zones did not normalize as expected: ${patchedLevel.body}`);
  }

  const deletedLevel = await request(
    'DELETE',
    `/api/campaigns/${campaignId}/levels/${addedLevelBody.level.id}`,
    { cookie: 'better-auth.session=abc' },
  );
  const deletedLevelBody = JSON.parse(deletedLevel.body);
  if (deletedLevel.statusCode !== 200 || deletedLevelBody.campaign.level_count !== 1) {
    throw new Error(`Unexpected level delete response: ${deletedLevel.statusCode} ${deletedLevel.body}`);
  }

  const lastLevelId = deletedLevelBody.campaign.levels[0].id;
  const rejectedLastLevelDelete = await request(
    'DELETE',
    `/api/campaigns/${campaignId}/levels/${lastLevelId}`,
    { cookie: 'better-auth.session=abc' },
  );
  if (rejectedLastLevelDelete.statusCode !== 409) {
    throw new Error(`Deleting the last level should fail: ${rejectedLastLevelDelete.statusCode} ${rejectedLastLevelDelete.body}`);
  }

  const deletedCampaign = await request(
    'DELETE',
    `/api/campaigns/${campaignId}`,
    { cookie: 'better-auth.session=abc' },
  );
  if (deletedCampaign.statusCode !== 204) {
    throw new Error(`Unexpected campaign delete response: ${deletedCampaign.statusCode} ${deletedCampaign.body}`);
  }
  const deletedCampaignRead = await get(`/api/campaigns/${campaignId}`, { cookie: 'better-auth.session=abc' });
  if (deletedCampaignRead.statusCode !== 404) {
    throw new Error(`Deleted campaign should not be readable: ${deletedCampaignRead.statusCode} ${deletedCampaignRead.body}`);
  }
  const deletedCampaignRows = await queryDb(
    'SELECT id FROM campaigns WHERE owner_email = $1 AND id = $2',
    ['player@example.com', campaignId],
  );
  if (deletedCampaignRows.rowCount !== 0) {
    throw new Error(`Deleted campaign should be removed from Postgres: ${JSON.stringify(deletedCampaignRows.rows)}`);
  }

  // --- Live lobby sync (SSE) ---------------------------------------------------
  // Regression guard for the reported bug: "host created a lobby, a friend joined, and the
  // guest never appeared on the host's screen." The host's waiting screen learns about a
  // join ONLY through the global lobby-list SSE channel (GET /api/lobbies/events). The rest
  // of this suite is plain request/response and never opened that stream — which is exactly
  // why the live-sync break shipped green. This exercises the channel end to end at the
  // server layer. (The browser-side reconnect resync + guest eviction are covered by the
  // two-browser E2E, frontend/scripts/lobby-e2e.mjs; the gateway timeout that severs the
  // stream is guarded by backend/check-sse-route.js.)
  {
    const sseHost = await request('POST', '/api/lobbies', { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
    if (sseHost.statusCode !== 201) {
      throw new Error(`SSE test: could not host lobby: ${sseHost.statusCode} ${sseHost.body}`);
    }
    const sseLobbyId = JSON.parse(sseHost.body).lobby.id;

    const stream = await openSse('/api/lobbies/events', { cookie: 'better-auth.session=abc' });
    try {
      // 1) Connect-time snapshot: the stream must push a frame immediately on open, so a
      //    freshly (re)connected host resyncs without waiting for a future mutation.
      await stream.waitUntil((f) => f.some((d) => d.includes('lobbies-changed')), 2000, 'connect-time snapshot frame');
      const beforeJoin = stream.frames.length;

      // 2) A guest join must reach the connected host as a NEW live frame — the actual
      //    "friend joined" event that was silently dropped in production.
      const sseJoin = await request('POST', `/api/lobbies/${sseLobbyId}/join`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, '{}');
      if (sseJoin.statusCode !== 200) {
        throw new Error(`SSE test: guest join failed: ${sseJoin.statusCode} ${sseJoin.body}`);
      }
      await stream.waitUntil((f) => f.length > beforeJoin, 2000, 'live lobbies-changed frame after guest join');

      // 3) And the host's authoritative view now shows the guest (the visible symptom).
      const afterJoin = JSON.parse((await get('/api/lobbies', { cookie: 'better-auth.session=abc' })).body);
      if (!afterJoin.current || afterJoin.current.seats.filled !== 2 || !afterJoin.current.guest) {
        throw new Error(`SSE test: host list should show the joined guest: ${JSON.stringify(afterJoin.current)}`);
      }
    } finally {
      stream.close();
    }

    // Clean up so the lobby-lifecycle test below starts from an empty state (host leave
    // closes + deletes the lobby, freeing both abc and rival).
    const sseCleanup = await request('POST', `/api/lobbies/${sseLobbyId}/leave`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
    if (sseCleanup.statusCode !== 204) {
      throw new Error(`SSE test: host leave/cleanup failed: ${sseCleanup.statusCode} ${sseCleanup.body}`);
    }
  }

  const hosted = await request('POST', '/api/lobbies', { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  const hostedBody = JSON.parse(hosted.body);
  if (hosted.statusCode !== 201 || hostedBody.lobby.phase !== 'waiting' || hostedBody.lobby.viewer_role !== 'host') {
    throw new Error(`Unexpected host lobby response: ${hosted.statusCode} ${hosted.body}`);
  }
  if (!hostedBody.lobby.host.avatar_url.includes(`/avatar/${playerHash}`)) {
    throw new Error(`Lobby host is missing Gravatar URL: ${hosted.body}`);
  }

  const listed = await get('/api/lobbies', { cookie: 'better-auth.session=rival' });
  const listedBody = JSON.parse(listed.body);
  if (listed.statusCode !== 200 || listedBody.lobbies.length !== 1 || listedBody.lobbies[0].viewer_role !== 'observer') {
    throw new Error(`Unexpected lobby list response: ${listed.statusCode} ${listed.body}`);
  }

  const lobbyId = hostedBody.lobby.id;
  const joined = await request('POST', `/api/lobbies/${lobbyId}/join`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, '{}');
  const joinedBody = JSON.parse(joined.body);
  if (joined.statusCode !== 200 || joinedBody.lobby.phase !== 'ready' || joinedBody.lobby.viewer_role !== 'guest') {
    throw new Error(`Unexpected join lobby response: ${joined.statusCode} ${joined.body}`);
  }

  const rivalStart = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, '{}');
  if (rivalStart.statusCode !== 403) {
    throw new Error(`Guest should not be able to start lobby: ${rivalStart.statusCode} ${rivalStart.body}`);
  }

  // Start now requires a level (netplay: both clients build the same board from
  // the shared (level, seed)). Starting without one is a 409 no_level.
  const startNoLevel = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  if (startNoLevel.statusCode !== 409 || JSON.parse(startNoLevel.body).error !== 'no_level') {
    throw new Error(`Start without a level should 409 no_level: ${startNoLevel.statusCode} ${startNoLevel.body}`);
  }

  // Only the host may pick a canonical official level; timing comes from its content.
  const rivalSetLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-test' }));
  if (rivalSetLevel.statusCode !== 403) {
    throw new Error(`Guest should not be able to set the lobby level: ${rivalSetLevel.statusCode} ${rivalSetLevel.body}`);
  }
  const missingLevelId = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  if (missingLevelId.statusCode !== 400 || JSON.parse(missingLevelId.body).error !== 'missing_level_id') {
    throw new Error(`Setting a level without an id should 400 missing_level_id: ${missingLevelId.statusCode} ${missingLevelId.body}`);
  }
  const unknownCanonicalLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-missing-smoke' }));
  if (unknownCanonicalLevel.statusCode !== 404 || JSON.parse(unknownCanonicalLevel.body).error !== 'level_not_found') {
    throw new Error(`Unknown canonical level should 404 level_not_found: ${unknownCanonicalLevel.statusCode} ${unknownCanonicalLevel.body}`);
  }
  const setTimedLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-smoke-timed', timed: false }));
  if (setTimedLevel.statusCode !== 200 || JSON.parse(setTimedLevel.body).lobby.level_timed !== true) {
    throw new Error(`Unexpected timed-level response: ${setTimedLevel.statusCode} ${setTimedLevel.body}`);
  }
  const startTimedLevel = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  if (startTimedLevel.statusCode !== 409 || JSON.parse(startTimedLevel.body).error !== 'timed_level_unsupported') {
    throw new Error(`Timed level should 409 timed_level_unsupported: ${startTimedLevel.statusCode} ${startTimedLevel.body}`);
  }
  // This id is intentionally absent from LOBBY_TEST_LEVEL_METADATA: Level and Start
  // must resolve the exact DB-backed official document written earlier in this smoke.
  const setLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-test', timed: true }));
  const setLevelBody = JSON.parse(setLevel.body);
  if (setLevel.statusCode !== 200 || setLevelBody.lobby.level_id !== 'off-l-test' || setLevelBody.lobby.level_timed !== false
    || setLevelBody.lobby.level_name !== 'Official Exact Save' || setLevelBody.lobby.level_objective !== 'capture-all'
    || setLevelBody.lobby.your_side !== 'player') {
    throw new Error(`Unexpected set-level response: ${setLevel.statusCode} ${setLevel.body}`);
  }

  const started = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  const startedBody = JSON.parse(started.body);
  if (started.statusCode !== 200 || startedBody.lobby.phase !== 'started' || !Number.isInteger(startedBody.lobby.seed) || startedBody.lobby.seed <= 0) {
    throw new Error(`Unexpected start lobby response: ${started.statusCode} ${started.body}`);
  }

  // Relay moves. Host ('player') moves first (index 0), then guest ('enemy') at index 1 —
  // strict one-move-per-turn alternation is enforced server-side (host=even, guest=odd).
  const hostMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-host-0', expectedMoveCount: 0, pieceId: 'p-1', move: { x: 3, y: 4 } }));
  const hostMoveBody = JSON.parse(hostMove.body);
  if (hostMove.statusCode !== 200 || hostMoveBody.move.i !== 0 || hostMoveBody.move.side !== 'player' || hostMoveBody.move.pieceId !== 'p-1') {
    throw new Error(`Unexpected host move response: ${hostMove.statusCode} ${hostMove.body}`);
  }
  // Turn integrity: the host cannot move again out of turn (index 1 belongs to the guest).
  const outOfTurn = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-host-out-of-turn', expectedMoveCount: 1, pieceId: 'p-2', move: { x: 1, y: 1 } }));
  if (outOfTurn.statusCode !== 409 || JSON.parse(outOfTurn.body).error !== 'not_your_turn') {
    throw new Error(`Out-of-turn move should 409 not_your_turn: ${outOfTurn.statusCode} ${outOfTurn.body}`);
  }
  const guestMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-guest-1', expectedMoveCount: 1, pieceId: 'e-1', move: { x: 3, y: 4 } }));
  const guestMoveBody = JSON.parse(guestMove.body);
  if (guestMove.statusCode !== 200 || guestMoveBody.move.i !== 1 || guestMoveBody.move.side !== 'enemy' || guestMoveBody.move.pieceId !== 'e-1') {
    throw new Error(`Unexpected guest move response: ${guestMove.statusCode} ${guestMove.body}`);
  }
  // Payload validation runs before the turn check, so a malformed move is 400 bad_move.
  const badMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-bad-move', expectedMoveCount: 2, pieceId: 'p-1', move: { x: 'nope' } }));
  if (badMove.statusCode !== 400 || JSON.parse(badMove.body).error !== 'bad_move') {
    throw new Error(`Malformed move should 400 bad_move: ${badMove.statusCode} ${badMove.body}`);
  }
  const outsiderMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-outsider', expectedMoveCount: 2, pieceId: 'x-1', move: { x: 1, y: 1 } }));
  if (outsiderMove.statusCode !== 401) {
    throw new Error(`Anonymous move should require sign-in: ${outsiderMove.statusCode} ${outsiderMove.body}`);
  }
  const backfill = await get(`/api/lobbies/${lobbyId}/moves?since=0`, { cookie: 'better-auth.session=abc' });
  const backfillBody = JSON.parse(backfill.body);
  if (backfill.statusCode !== 200 || backfillBody.moves.length !== 2 || backfillBody.moves[0].pieceId !== 'p-1' || backfillBody.moves[1].pieceId !== 'e-1') {
    throw new Error(`Unexpected moves backfill: ${backfill.statusCode} ${backfill.body}`);
  }
  const startedList = await get('/api/lobbies', { cookie: 'better-auth.session=abc' });
  const startedListBody = JSON.parse(startedList.body);
  if (startedList.statusCode !== 200 || startedListBody.current.move_count !== 2 || startedListBody.current.level_id !== 'off-l-test') {
    throw new Error(`Started lobby should expose move_count/level_id: ${startedList.statusCode} ${startedList.body}`);
  }

  // --- Resignation --------------------------------------------------------------
  // Resigning is a non-move terminal event: it records a result on the lobby (the OTHER
  // side wins) that both clients read off the lobby frame. Anonymous callers can't resign.
  const anonResign = await request('POST', `/api/lobbies/${lobbyId}/resign`, { 'content-type': 'application/json' }, '{}');
  if (anonResign.statusCode !== 401) {
    throw new Error(`Anonymous resign should require sign-in: ${anonResign.statusCode} ${anonResign.body}`);
  }
  // Guest ('enemy') resigns → 'player' (the host) wins.
  const guestResign = await request('POST', `/api/lobbies/${lobbyId}/resign`, { cookie: 'better-auth.session=rival', 'content-type': 'application/json' }, '{}');
  const guestResignBody = JSON.parse(guestResign.body);
  if (guestResign.statusCode !== 200 || !guestResignBody.lobby.result || guestResignBody.lobby.result.winner !== 'player' || guestResignBody.lobby.result.reason !== 'resign') {
    throw new Error(`Unexpected resign response: ${guestResign.statusCode} ${guestResign.body}`);
  }
  // The result is visible to the other seat too (how the host learns the match ended).
  const resignedView = await get(`/api/lobbies/${lobbyId}`, { cookie: 'better-auth.session=abc' });
  const resignedViewBody = JSON.parse(resignedView.body);
  if (resignedView.statusCode !== 200 || !resignedViewBody.lobby.result || resignedViewBody.lobby.result.winner !== 'player') {
    throw new Error(`Resigned lobby should expose the result to the host: ${resignedView.statusCode} ${resignedView.body}`);
  }
  // The match is over — further moves are rejected rather than re-opening a decided game.
  const moveAfterResign = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-after-resign', expectedMoveCount: 2, pieceId: 'p-2', move: { x: 5, y: 5 } }));
  if (moveAfterResign.statusCode !== 409 || JSON.parse(moveAfterResign.body).error !== 'match_over') {
    throw new Error(`Move after resign should 409 match_over: ${moveAfterResign.statusCode} ${moveAfterResign.body}`);
  }
  // Idempotent: the host resigning now keeps the first result rather than flipping the winner.
  const hostResign = await request('POST', `/api/lobbies/${lobbyId}/resign`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  const hostResignBody = JSON.parse(hostResign.body);
  if (hostResign.statusCode !== 200 || hostResignBody.lobby.result.winner !== 'player') {
    throw new Error(`Resign should be idempotent (first result kept): ${hostResign.statusCode} ${hostResign.body}`);
  }
  // Start is a one-shot ready→started transition; it cannot reset a live/finished match.
  const restart = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  const restartBody = JSON.parse(restart.body);
  if (restart.statusCode !== 409 || restartBody.error !== 'lobby_already_started') {
    throw new Error(`Re-start should 409 lobby_already_started: ${restart.statusCode} ${restart.body}`);
  }
  const restartBackfill = await get(`/api/lobbies/${lobbyId}/moves?since=0`, { cookie: 'better-auth.session=abc' });
  if (restartBackfill.statusCode !== 200 || JSON.parse(restartBackfill.body).moves.length !== 2) {
    throw new Error(`Rejected Re-start must preserve move log: ${restartBackfill.statusCode} ${restartBackfill.body}`);
  }

  const redirect = await get('/api/auth/sign-in?returnTo=%2Fplay');
  if (redirect.statusCode !== 302 || !String(redirect.headers.location).startsWith(`http://127.0.0.1:${authPort}/sign-in/microsoft?`)) {
    throw new Error(`Unexpected sign-in redirect: ${redirect.statusCode} ${redirect.headers.location}`);
  }

  const signOut = await request('POST', '/api/auth/sign-out', { cookie: 'better-auth.session=abc' });
  if (signOut.statusCode !== 204 || !signOut.headers['set-cookie']) {
    throw new Error(`Unexpected sign-out response: ${signOut.statusCode}`);
  }

  fs.mkdirSync(hotStaticDir, { recursive: true });
  fs.writeFileSync(path.join(hotStaticDir, 'hot.txt'), 'hot-static-ok');
  const hotStatic = await get('/hot.txt');
  if (hotStatic.statusCode !== 200 || hotStatic.body !== 'hot-static-ok') {
    throw new Error(`Unexpected hot static response: ${hotStatic.statusCode} ${hotStatic.body}`);
  }

  const hotServerFile = path.join(hotBackendDir, 'server.js');
  const hotServerSource = fs.readFileSync(hotServerFile, 'utf8');
  fs.writeFileSync(
    hotServerFile,
    hotServerSource.replace(
      "app.get('/health', (_req, res) => {",
      "app.get('/__hot_backend', (_req, res) => res.status(200).send('hot-backend-ok'));\n\napp.get('/health', (_req, res) => {",
    ),
  );
  child.kill('SIGHUP');
  await waitForHotBackend();
  const hotBackend = await get('/__hot_backend');
  if (hotBackend.statusCode !== 200 || hotBackend.body !== 'hot-backend-ok') {
    throw new Error(`Unexpected hot backend response: ${hotBackend.statusCode} ${hotBackend.body}`);
  }
}

main()
  .finally(async () => {
    child.kill();
    await waitForProcessExit(child);
    await Promise.all([closeHttpServer(mockAuth), closeHttpServer(mockBgm)]);
    fs.rmSync(hotRoot, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
