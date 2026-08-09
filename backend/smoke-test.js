const http = require('http');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const boardRender = require('@chess-tactics/board-render');
const {
  ATTEMPT_SOURCE_REQUEST_SCHEMA,
  ENVIRONMENT_GEOMETRY_SCHEMA,
  SOURCE_SEMANTIC_REQUEST_SCHEMA,
  generationAttemptSourceRequestIssue,
  sourceArtworkVersionContractIssue,
} = require('./backgroundVersionPolicy');
const { migrationChecksum } = require('./schemaMigrationIntegrity');
const { extractInlineMigrations } = require('./schemaMigrationSource');

const port = 31337;
const authPort = 31338;
const bgmPort = 31339;
const secondaryPort = 31340;
const hotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-tactics-hot-'));
const hotBackendDir = path.join(hotRoot, 'backend');
const hotStaticDir = path.join(hotRoot, 'static');
const liveMediaStorageDir = path.join(hotRoot, 'live-media');
const mockAuthIssuer = `http://127.0.0.1:${authPort}`;
const mockAuth = http.createServer((req, res) => {
  if (req.url === '/.well-known/openid-configuration') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      issuer: mockAuthIssuer,
      authorization_endpoint: `${mockAuthIssuer}/api/auth/oauth2/authorize`,
      token_endpoint: `${mockAuthIssuer}/api/auth/oauth2/token`,
      userinfo_endpoint: `${mockAuthIssuer}/api/auth/oauth2/userinfo`,
      jwks_uri: `${mockAuthIssuer}/api/auth/jwks`,
    }));
    return;
  }
  if (req.url === '/api/auth/oauth2/userinfo') {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }
    const user = token === 'rival'
      ? { sub: 'rival', email: 'rival@example.com', name: 'Lobby Rival', role: 'pending' }
      : token === 'second-admin'
        ? { sub: 'second-admin', email: 'second-admin@example.com', name: 'Second Tactics Admin', role: 'pending' }
        : { sub: 'player', email: 'player@example.com', name: 'Tactics Player', role: 'pending' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(user));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// Deterministic private-object stand-in for BGM playback. The backend receives
// catalog input and an injected signing seam through NODE_ENV=test-only values;
// this service validates the bounded capability and serves Range responses.
const bgmSigningSecret = 'smoke-only-bgm-signing-secret';
const bgmFixtureBytes = new Map([
  ['alpha.mp3', Buffer.from('alpha-audio-fixture')],
  ['bravo.mp3', Buffer.from('bravo-audio-fixture')],
]);
const mockBgm = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://127.0.0.1:${bgmPort}`);
  const blobName = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''));
  const bytes = bgmFixtureBytes.get(blobName);
  const starts = Number.parseInt(requestUrl.searchParams.get('st') || '', 10);
  const expires = Number.parseInt(requestUrl.searchParams.get('exp') || '', 10);
  const signature = requestUrl.searchParams.get('sig') || '';
  const expected = Number.isFinite(starts) && Number.isFinite(expires)
    ? crypto.createHmac('sha256', bgmSigningSecret)
      .update(`${blobName}\0${starts}\0${expires}`)
      .digest('hex')
    : '';
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !bytes
    || !signature
    || signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    || starts > nowSeconds
    || expires <= nowSeconds
    || expires - starts > 2 * 60 * 60 + 5 * 60
  ) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  const range = String(req.headers.range || '').match(/^bytes=(\d+)-(\d*)$/);
  let start = 0;
  let end = bytes.length - 1;
  let status = 200;
  if (range) {
    start = Number.parseInt(range[1], 10);
    end = range[2] ? Number.parseInt(range[2], 10) : end;
    if (start >= bytes.length || end < start) {
      res.writeHead(416, { 'content-range': `bytes */${bytes.length}` });
      res.end();
      return;
    }
    end = Math.min(end, bytes.length - 1);
    status = 206;
  }
  const body = bytes.subarray(start, end + 1);
  res.writeHead(status, {
    'accept-ranges': 'bytes',
    'content-type': 'audio/mpeg',
    'content-length': body.length,
    ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
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

let cachedInlineMigrations = null;

function seedSparseNumericMigrationHistoryThrough36() {
  const legacyVersions = [
    ...Array.from({ length: 27 }, (_, index) => index + 1),
    36,
  ];
  const seedPath = path.join(hotRoot, 'numeric-migrations-1-27-and-36.json');
  fs.writeFileSync(
    seedPath,
    JSON.stringify(legacyVersions.map((version) => ({
      version,
      sql: inlineMigrationSql(version),
    }))),
  );
  const script = `
    const fs = require('fs');
    const { Client } = require('pg');
    const migrations = JSON.parse(
      fs.readFileSync(process.env.SMOKE_MIGRATION_SEED_PATH, 'utf8')
    );
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    (async () => {
      await client.connect();
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query(` + "`" + `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version integer PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      ` + "`" + `);
      for (const migration of migrations) {
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [migration.version],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      // Preserve the existing relation-repair smoke case while the primary
      // server fills the sparse numeric-only history through version 36.
      await client.query('DROP TABLE level_thumbnail_derivatives');
      await client.end();
    })().catch(async (error) => {
      try { await client.end(); } catch {}
      console.error(error);
      process.exit(1);
    });
  `;
  const seeded = spawnSync(process.execPath, ['-e', script], {
    cwd: __dirname,
    env: {
      ...process.env,
      SMOKE_MIGRATION_SEED_PATH: seedPath,
    },
    encoding: 'utf8',
  });
  if (seeded.status !== 0) {
    throw new Error(`Could not seed sparse numeric migration history 1-27 and 36: ${seeded.stderr || seeded.stdout}`);
  }
}

// Reproduce the exact former registry before the application starts:
// migrations 1-27 and 36 are recorded under the numeric-only contract. Auto
// mode must fill 28-35, apply 37 onward, seal the completed historical
// identities, and repair actual schema state rather than trust version rows.
seedSparseNumericMigrationHistoryThrough36();

const sharedBackendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
  PUBLIC_ORIGIN: 'https://chess-tactics.com',
  BGM_TEST_CATALOG_JSON: JSON.stringify([
    { title: 'Alpha', blobName: 'alpha.mp3' },
    { title: 'Bravo', artist: 'Smoke Artist', blobName: 'bravo.mp3' },
  ]),
  BGM_TEST_CAPABILITY_BASE_URL: `http://127.0.0.1:${bgmPort}`,
  BGM_TEST_SIGNING_SECRET: bgmSigningSecret,
  STATIC_FRONTEND_DIR: hotStaticDir,
  LOBBY_TEST_LEVEL_METADATA: JSON.stringify({
    'off-l-smoke-timed': { level: { id: 'off-l-smoke-timed', name: 'Smoke Timed Level', objective: 'survive', timeControl: { initialSeconds: 60, incrementSeconds: 0 } } },
  }),
  // The mock auth returns player@example.com for any non-rival session; make that
  // the official-campaigns admin so the requireAdmin path is exercised (ADR-0038).
  ADMIN_EMAILS: 'player@example.com,second-admin@example.com',
  UNIT_ASSET_STORAGE_DIR: path.join(hotRoot, 'unit-assets'),
  LIVE_MEDIA_STORAGE_DIR: liveMediaStorageDir,
};

const child = spawn(process.execPath, ['supervisor.js'], {
  cwd: __dirname,
  env: {
    ...sharedBackendEnv,
    PORT: String(port),
    HOT_BACKEND_DIR: hotBackendDir,
    // Smoke-test databases are throwaway/reset by this file, so schema mutation is
    // intentional here even though local backend startup defaults to read-only check.
    SCHEMA_MIGRATIONS: 'auto',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let secondaryChild = null;
let secondaryOutput = '';
child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

function startSecondaryBackend() {
  if (secondaryChild) return secondaryChild;
  secondaryChild = spawn(process.execPath, ['supervisor.js'], {
    cwd: __dirname,
    env: {
      ...sharedBackendEnv,
      PORT: String(secondaryPort),
      HOT_BACKEND_DIR: path.join(hotRoot, 'secondary-backend'),
      SCHEMA_MIGRATIONS: 'check',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  secondaryChild.stdout.on('data', (chunk) => { secondaryOutput += chunk.toString(); });
  secondaryChild.stderr.on('data', (chunk) => { secondaryOutput += chunk.toString(); });
  return secondaryChild;
}

async function waitForSecondarySchemaCheck() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!secondaryChild || secondaryChild.exitCode !== null) {
      throw new Error(`Secondary backend exited before its schema check\n${secondaryOutput}`);
    }
    if (
      secondaryOutput
        .split(/\r?\n/)
        .some((line) => line.includes('postgres ready') && line.includes('schema=check'))
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Secondary backend did not finish its schema check\n${secondaryOutput}`);
}

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

function requestOnPort(targetPort, method, path, headers = {}, body = null, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const requestHeaders = { ...headers };
    if (
      body !== null
      && requestHeaders['content-length'] === undefined
      && requestHeaders['transfer-encoding'] === undefined
    ) {
      requestHeaders['content-length'] = Buffer.isBuffer(body)
        ? body.length
        : Buffer.byteLength(String(body));
    }
    const req = http.request({ hostname: '127.0.0.1', port: targetPort, method, path, headers: requestHeaders }, (res) => {
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

function request(method, path, headers = {}, body = null, timeoutMs = 1000) {
  return requestOnPort(port, method, path, headers, body, timeoutMs);
}

function get(path, headers, timeoutMs) {
  return request('GET', path, headers, null, timeoutMs);
}

const editorAuthorities = new Map();

function normalizedEditorCookie(cookie = '__Host-chess-tactics-access=abc') {
  return cookie || '';
}

function editorAuthorityKey(documentId, cookie) {
  return `${normalizedEditorCookie(cookie)}\0${documentId}`;
}

async function openEditorEditSession(documentId, {
  cookie = '__Host-chess-tactics-access=abc',
  sessionId = crypto.randomUUID(),
  sessionKey = crypto.randomBytes(32).toString('hex'),
  deviceId = `smoke-device-${crypto.randomUUID()}`,
  clientLabel = 'Smoke browser',
  intent,
  activate = true,
  remember = true,
  targetPort = port,
} = {}) {
  const response = await requestOnPort(
    targetPort,
    'POST',
    `/api/editor-documents/${documentId}/edit-sessions`,
    { cookie, 'content-type': 'application/json' },
    JSON.stringify({
      session_id: sessionId,
      session_key: sessionKey,
      device_id: deviceId,
      client_label: clientLabel,
      ...(intent ? { intent } : {}),
    }),
  );
  const body = response.body ? JSON.parse(response.body) : {};
  void activate;
  if (
    response.statusCode === 200
    && remember
    && intent !== 'observe'
    && body.session?.state !== 'observing'
    && body.session?.state !== 'closed'
  ) {
    editorAuthorities.set(editorAuthorityKey(documentId, cookie), {
      session_id: body.session.session_id,
      edit_session_key: sessionKey,
      edit_generation: body.session.edit_generation,
      device_id: deviceId,
      client_label: clientLabel,
    });
  }
  return { response, body, sessionId, sessionKey, deviceId, targetPort };
}

function editorMutationBody(documentId, cookie, body, authority = null) {
  const current = authority || editorAuthorities.get(editorAuthorityKey(documentId, cookie));
  return {
    ...body,
    ...(body.level && !body.base_level ? { base_level: body.level } : {}),
    ...(current ? {
      edit_session_id: current.session_id,
      edit_session_key: current.edit_session_key,
      edit_generation: current.edit_generation,
    } : {}),
  };
}

function closeEditorEditSessionRequest(documentId, sessionId, sessionKey, cookie = '__Host-chess-tactics-access=abc', targetPort = port) {
  const body = JSON.stringify({ session_key: sessionKey });
  return requestOnPort(
    targetPort,
    'DELETE',
    `/api/editor-documents/${documentId}/edit-sessions/${sessionId}`,
    {
      cookie,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
    body,
  );
}

function deleteEditorDocumentRequest(documentId, revision, cookie = null) {
  const body = JSON.stringify(editorMutationBody(documentId, cookie, { revision }));
  return request(
    'DELETE', `/api/editor-documents/${documentId}`,
    {
      ...(cookie ? { cookie } : {}),
      'content-type': 'application/json',
      // Node's HTTP client does not automatically frame a DELETE request body.
      // Without this header Express receives no JSON and rejects the request
      // before the owner-scoped lookup can return its intentional 404.
      'content-length': Buffer.byteLength(body),
    },
    body,
  );
}

function createBackgroundVersionRequest(documentId, body, {
  cookie = '__Host-chess-tactics-access=abc',
  idempotencyKey = body.idempotency_key,
  authority = null,
} = {}) {
  const payload = editorMutationBody(documentId, cookie, body, authority);
  return request(
    'POST',
    `/api/editor-documents/${documentId}/background-versions`,
    {
      cookie,
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    JSON.stringify(payload),
    5000,
  );
}

function createGenerationAttemptRequest(documentId, body, {
  cookie = '__Host-chess-tactics-access=abc',
  idempotencyKey = body.idempotency_key,
  authority = null,
} = {}) {
  const payload = editorMutationBody(documentId, cookie, body, authority);
  return request(
    'POST',
    `/api/editor-documents/${documentId}/generation-attempts`,
    {
      cookie,
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    JSON.stringify(payload),
    5000,
  );
}

async function archiveGenerationAttemptRequest(
  documentId,
  attemptId,
  revision,
  cookie = '__Host-chess-tactics-access=abc',
  authority = null,
  documentRevision = null,
) {
  let currentDocumentRevision = documentRevision;
  if (currentDocumentRevision === null) {
    const currentDocument = await queryDb(
      'SELECT revision FROM level_working_copies WHERE document_id = $1',
      [documentId],
    );
    currentDocumentRevision = Number(currentDocument.rows[0]?.revision);
  }
  const payload = editorMutationBody(
    documentId,
    cookie,
    {
      expected_revision: revision,
      document_revision: currentDocumentRevision,
    },
    authority,
  );
  return request(
    'POST',
    `/api/editor-documents/${documentId}/generation-attempts/${attemptId}/archive`,
    { cookie, 'content-type': 'application/json' },
    JSON.stringify(payload),
    5000,
  );
}

function discardGenerationAttemptWarpRequest(
  documentId,
  attemptId,
  warpedVersionId,
  revision,
  cookie = '__Host-chess-tactics-access=abc',
  authority = null,
) {
  const payload = editorMutationBody(
    documentId,
    cookie,
    {
      expected_revision: revision,
      expected_warped_version_id: warpedVersionId,
    },
    authority,
  );
  return request(
    'POST',
    `/api/editor-documents/${documentId}/generation-attempts/${attemptId}/discard-warp`,
    { cookie, 'content-type': 'application/json' },
    JSON.stringify(payload),
    5000,
  );
}

async function discardGenerationAttemptOcclusionRequest(
  documentId,
  attemptId,
  occlusionVersionId,
  revision,
  cookie = '__Host-chess-tactics-access=abc',
  authority = null,
  documentRevision = null,
) {
  let currentDocumentRevision = documentRevision;
  if (currentDocumentRevision === null) {
    const currentDocument = await queryDb(
      'SELECT revision FROM level_working_copies WHERE document_id = $1',
      [documentId],
    );
    currentDocumentRevision = Number(currentDocument.rows[0]?.revision);
  }
  const payload = editorMutationBody(
    documentId,
    cookie,
    {
      expected_revision: revision,
      expected_occlusion_version_id: occlusionVersionId,
      document_revision: currentDocumentRevision,
    },
    authority,
  );
  return request(
    'POST',
    `/api/editor-documents/${documentId}/generation-attempts/${attemptId}/discard-occlusion`,
    { cookie, 'content-type': 'application/json' },
    JSON.stringify(payload),
    5000,
  );
}

function uploadBackgroundVersionRequest(
  documentId,
  versionId,
  revision,
  bytes,
  cookie = '__Host-chess-tactics-access=abc',
  authority = null,
) {
  const current = authority || editorAuthorities.get(editorAuthorityKey(documentId, cookie));
  return request(
    'PUT',
    `/api/editor-documents/${documentId}/background-versions/${versionId}/content`,
    {
      cookie,
      'content-type': 'image/png',
      'content-length': bytes.length,
      'if-match': `"${revision}"`,
      ...(current ? {
        'x-editor-edit-session-id': current.session_id,
        'x-editor-edit-session-key': current.edit_session_key,
        'x-editor-edit-generation': String(current.edit_generation),
      } : {}),
    },
    bytes,
    5000,
  );
}

function beginHeldBackgroundVersionUpload(
  documentId,
  versionId,
  revision,
  bytes,
  cookie = '__Host-chess-tactics-access=abc',
) {
  const current = editorAuthorities.get(editorAuthorityKey(documentId, cookie));
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    method: 'PUT',
    path: `/api/editor-documents/${documentId}/background-versions/${versionId}/content`,
    headers: {
      cookie,
      'content-type': 'image/png',
      'content-length': bytes.length,
      'if-match': `"${revision}"`,
      ...(current ? {
        'x-editor-edit-session-id': current.session_id,
        'x-editor-edit-session-key': current.edit_session_key,
        'x-editor-edit-generation': String(current.edit_generation),
      } : {}),
    },
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => resolveResponse({
      statusCode: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  req.on('error', rejectResponse);
  req.setTimeout(10000, () => req.destroy(new Error('held background upload timed out')));
  const split = Math.min(8, bytes.length - 1);
  req.write(bytes.subarray(0, split));
  return {
    response,
    finish: () => req.end(bytes.subarray(split)),
  };
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
  await queryDb('TRUNCATE levels, campaign_workspaces, public_maps, editor_document_edit_events, editor_document_recoveries, editor_document_edit_sessions, predrawn_background_geometry_bindings, predrawn_background_version_events, predrawn_background_versions, level_working_copies, level_thumbnail_derivatives, design_portfolios, campaigns, official_campaigns, active_runs, lipsanon_stat_events, lab_runs, prop_seats, sfx_profiles, drawable_asset_events, drawable_asset_media, drawable_assets, drawable_catalog_state, media_asset_events, media_versions, media_blobs, media_slots, media_catalog_state, unit_asset_events, unit_sprites, unit_families, unit_assets, unit_catalog_state CASCADE');
  await queryDb("INSERT INTO media_catalog_state (singleton) VALUES (true); INSERT INTO drawable_catalog_state (singleton) VALUES (true); INSERT INTO unit_catalog_state (singleton) VALUES (true); INSERT INTO unit_families (family) VALUES ('pawn'), ('rook'), ('knight'), ('bishop'), ('queen'), ('king');");
}

// Explicit synthetic live content for this transient smoke database. Production
// seat data is never imported from a repository fixture.
const SYNTHETIC_PROP_SEATS = Object.freeze({
  oak: { anchorX: 96, anchorY: 255, scale: 1, w: 2, h: 2, default: true },
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

async function seedSyntheticDrawable({ id, kind, label, sortOrder = 0, behavior, metadata = {}, media }) {
  await queryDb(
    `INSERT INTO drawable_assets (id, kind, label, sort_order, lifecycle_state, behavior, metadata, row_revision, updated_by)
     VALUES ($1, $2, $3, $4, 'active', $5::jsonb, $6::jsonb, 1, 'smoke-fixture')`,
    [id, kind, label, sortOrder, JSON.stringify(behavior), JSON.stringify(metadata)],
  );
  const usedSlots = new Set();
  for (const [role, requestedSlot] of Object.entries(media)) {
    let slot = requestedSlot;
    if (usedSlots.has(slot)) {
      slot = `smoke/drawables/${id}/${role}.png`;
      await seedSyntheticReadinessMedia({ slot, domain: 'smoke-fixture', role, width: 32, height: 32 });
    }
    usedSlots.add(slot);
    await queryDb(
      'INSERT INTO drawable_asset_media (asset_id, role, slot) VALUES ($1, $2, $3)',
      [id, role, slot],
    );
  }
  await queryDb('UPDATE drawable_catalog_state SET revision = revision + 1, updated_at = now() WHERE singleton = true');
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

function syntheticWav({ durationMs = 100, sampleRate = 8000, channels = 1 } = {}) {
  const sampleCount = Math.round(sampleRate * durationMs / 1000);
  const bytesPerSample = 2;
  const dataLength = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
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

function inlineMigrationDefinition(version) {
  if (!cachedInlineMigrations) {
    cachedInlineMigrations = extractInlineMigrations(
      fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'),
    );
  }
  const migration = cachedInlineMigrations.find((candidate) => candidate.version === version);
  if (!migration) throw new Error(`Could not find inline migration ${version}`);
  return migration;
}

function inlineMigrationSql(version) {
  return inlineMigrationDefinition(version).sql;
}

async function validatePrimarySparseNumericMigrationUpgrade64() {
  const history = await queryDb(
    `SELECT version, name, checksum
       FROM schema_migrations
      ORDER BY version`,
  );
  const identityColumns = await queryDb(
    `SELECT column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name IN ('name', 'checksum')
      ORDER BY column_name`,
  );
  const versions = history.rows.map((row) => Number(row.version));
  const expectedVersions = Array.from({ length: 73 }, (_, index) => index + 1);
  const expectedMigrations = expectedVersions.map(inlineMigrationDefinition);
  const expectedByVersion = new Map(
    expectedMigrations.map((migration) => [migration.version, migration]),
  );
  const identityMismatch = history.rows.find((row) => {
    const migration = expectedByVersion.get(Number(row.version));
    return (
      !migration
      || row.name !== migration.name
      || row.checksum !== migrationChecksum(migration)
    );
  });
  const appliedMigrationVersions = [
    ...Array.from({ length: 8 }, (_, index) => index + 28),
    ...Array.from({ length: 37 }, (_, index) => index + 37),
  ];
  const skippedMigrationVersions = [
    ...Array.from({ length: 27 }, (_, index) => index + 1),
    36,
  ];
  const appliedSummary = appliedMigrationVersions
    .map((version) => {
      const migration = expectedByVersion.get(version);
      return `${version} (${migration.name})`;
    })
    .join(', ');
  const skippedSummary = skippedMigrationVersions
    .map((version) => {
      const migration = expectedByVersion.get(version);
      return `${version} (${migration.name})`;
    })
    .join(', ');
  const readyLine = output
    .split(/\r?\n/)
    .find((line) => line.includes('postgres ready') && line.includes('schema=auto'));
  const revisionReasonRows = await queryDb(
    `SELECT reason
       FROM level_working_copy_revision_reasons
      ORDER BY reason`,
  );
  const revisionReasonConstraints = await queryDb(
    `SELECT
       constraint_entry.conname AS constraint_name,
       constraint_entry.contype AS constraint_type,
       constraint_entry.convalidated AS validated,
       constraint_entry.confupdtype AS update_action,
       constraint_entry.confdeltype AS delete_action,
       referenced_namespace.nspname AS referenced_schema,
       referenced_table.relname AS referenced_table,
       pg_get_constraintdef(constraint_entry.oid) AS definition
     FROM pg_constraint constraint_entry
     JOIN pg_class local_table
       ON local_table.oid = constraint_entry.conrelid
     JOIN pg_namespace local_namespace
       ON local_namespace.oid = local_table.relnamespace
     LEFT JOIN pg_class referenced_table
       ON referenced_table.oid = constraint_entry.confrelid
     LEFT JOIN pg_namespace referenced_namespace
       ON referenced_namespace.oid = referenced_table.relnamespace
    WHERE local_namespace.nspname = 'public'
      AND local_table.relname = 'level_working_copy_revisions'
      AND (
        constraint_entry.conname = 'level_working_copy_revisions_reason_fk'
        OR (
          constraint_entry.contype = 'c'
          AND position('reason' in lower(pg_get_constraintdef(constraint_entry.oid))) > 0
        )
      )
    ORDER BY constraint_entry.conname`,
  );
  const expectedReasons = [
    'autosave',
    'canonical-refresh',
    'create',
    'discard',
    'generation-attempt-archive',
    'generation-attempt-occlusion-discard',
    'migration',
    'resolve',
    'restore',
    'save',
  ];
  const canonicalReasonForeignKey = revisionReasonConstraints.rows.find(
    (row) => row.constraint_name === 'level_working_copy_revisions_reason_fk',
  );
  const staleReasonChecks = revisionReasonConstraints.rows.filter(
    (row) => row.constraint_type === 'c',
  );
  await queryDb(
    `INSERT INTO lipsanon_stat_events (owner_email, event_id, lipsanon_id, event_kind)
     VALUES ('migration-45-smoke@example.com', 'migration-45-idempotency', 'conscription-notice', 'picked')
     ON CONFLICT (owner_email, event_id, lipsanon_id) DO NOTHING;
     INSERT INTO lipsanon_stat_events (owner_email, event_id, lipsanon_id, event_kind)
     VALUES ('migration-45-smoke@example.com', 'migration-45-idempotency', 'conscription-notice', 'picked')
     ON CONFLICT (owner_email, event_id, lipsanon_id) DO NOTHING;`,
  );
  const lipsanonEventRows = await queryDb(
    `SELECT owner_email, event_id, lipsanon_id, event_kind
       FROM lipsanon_stat_events
      WHERE owner_email = 'migration-45-smoke@example.com'
        AND event_id = 'migration-45-idempotency'`,
  );
  if (
    versions.join(',') !== expectedVersions.join(',')
    || identityColumns.rows.length !== 2
    || identityColumns.rows.some((row) => row.is_nullable !== 'NO')
    || identityMismatch
    || !readyLine
    || !readyLine.includes(`schema migrations applied: ${appliedSummary};`)
    || !readyLine.includes(`skipped (already applied): ${skippedSummary};`)
    || !readyLine.includes('pending: none')
    || revisionReasonRows.rows.map((row) => row.reason).join(',') !== expectedReasons.join(',')
    || staleReasonChecks.length !== 0
    || !canonicalReasonForeignKey
    || canonicalReasonForeignKey.constraint_type !== 'f'
    || canonicalReasonForeignKey.validated !== true
    || canonicalReasonForeignKey.update_action !== 'r'
    || canonicalReasonForeignKey.delete_action !== 'r'
    || canonicalReasonForeignKey.referenced_schema !== 'public'
    || canonicalReasonForeignKey.referenced_table !== 'level_working_copy_revision_reasons'
    || lipsanonEventRows.rows.length !== 1
    || lipsanonEventRows.rows[0].lipsanon_id !== 'conscription-notice'
    || lipsanonEventRows.rows[0].event_kind !== 'picked'
    || !/^FOREIGN KEY \(reason\) REFERENCES level_working_copy_revision_reasons\(reason\)/.test(
      canonicalReasonForeignKey.definition,
    )
  ) {
    throw new Error(
      `Primary server did not fill sparse numeric history 1-27 and 36 through migration 73: `
      + `${JSON.stringify({
        history: history.rows,
        identity_columns: identityColumns.rows,
        reasons: revisionReasonRows.rows,
        constraints: revisionReasonConstraints.rows,
        lipsanon_events: lipsanonEventRows.rows,
      })}\noutput:\n${output}`,
    );
  }
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

async function validateThumbnailRepairMigration22() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_thumbnail_migration_22');
    await client.query('SET LOCAL search_path TO smoke_thumbnail_migration_22');
    await client.query(`
      CREATE TABLE media_blobs (sha256 text PRIMARY KEY);
      CREATE TABLE schema_migrations (version integer PRIMARY KEY);
      INSERT INTO schema_migrations (version) VALUES (21);
    `);
    await client.query(inlineMigrationSql(22));
    const { rows } = await client.query(
      "SELECT to_regclass('level_thumbnail_derivatives') AS derivative_table",
    );
    if (!rows[0]?.derivative_table) {
      throw new Error('Migration 22 did not repair a database that recorded migration 21 without the thumbnail table');
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateEditorRevisionReasonMigration37() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_editor_revision_reason_migration_37');
    await client.query('SET LOCAL search_path TO smoke_editor_revision_reason_migration_37');
    await client.query(`
      CREATE TABLE schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO schema_migrations (version) VALUES (36);
      CREATE TABLE level_working_copies (
        document_id text PRIMARY KEY,
        body jsonb NOT NULL,
        revision bigint NOT NULL,
        saved_revision bigint NOT NULL,
        baseline_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO level_working_copies
        (document_id, body, revision, saved_revision, baseline_hash)
      VALUES ('document-1', '{"id":"level-1"}'::jsonb, 1, 1, 'baseline');
    `);
    await client.query(inlineMigrationSql(24));
    await client.query(inlineMigrationSql(37));
    await client.query(inlineMigrationSql(37));
    await client.query(`
      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason)
      VALUES (
        'document-1', 2, '{"id":"level-1","archived":true}'::jsonb,
        1, 'baseline', 'generation-attempt-archive'
      )
    `);

    const recorded = await client.query(
      `SELECT reason
         FROM level_working_copy_revisions
        WHERE document_id = 'document-1'
        ORDER BY revision`,
    );
    if (recorded.rows.map((row) => row.reason).join(',') !== 'migration,generation-attempt-archive') {
      throw new Error(`Migration 37 did not preserve old reasons and admit the archive reason: ${JSON.stringify(recorded.rows)}`);
    }

    await client.query('SAVEPOINT invalid_revision_reason');
    let invalidReasonCode = null;
    try {
      await client.query(`
        INSERT INTO level_working_copy_revisions
          (document_id, revision, body, saved_revision, baseline_hash, reason)
        VALUES ('document-1', 3, '{}'::jsonb, 1, 'baseline', 'unsupported-reason')
      `);
    } catch (error) {
      invalidReasonCode = error.code;
    }
    await client.query('ROLLBACK TO SAVEPOINT invalid_revision_reason');
    await client.query('RELEASE SAVEPOINT invalid_revision_reason');
    if (invalidReasonCode !== '23503') {
      throw new Error(`Migration 37 did not keep revision reasons fail-closed: ${invalidReasonCode ?? 'insert succeeded'}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateRunSaveVersionMigration54() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_run_save_version_migration_54');
    await client.query('SET LOCAL search_path TO smoke_run_save_version_migration_54');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY,
        body jsonb NOT NULL,
        revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('version16@example.com', '{"formatVersion":16,"id":"preserved"}'::jsonb, 7),
        ('version17@example.com', '{"runSaveVersion":17,"id":"current"}'::jsonb, 3),
        ('version15@example.com', '{"formatVersion":15,"id":"unsupported"}'::jsonb, 5);
    `);
    await client.query(inlineMigrationSql(54));
    await client.query(inlineMigrationSql(54));

    const { rows } = await client.query(
      `SELECT owner_email, body, revision
         FROM active_runs
        ORDER BY owner_email`,
    );
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migrated = byOwner.get('version16@example.com');
    const current = byOwner.get('version17@example.com');
    const unsupported = byOwner.get('version15@example.com');
    if (
      migrated?.body?.runSaveVersion !== 17
      || Object.hasOwn(migrated?.body ?? {}, 'formatVersion')
      || migrated?.body?.id !== 'preserved'
      || Number(migrated?.revision) !== 8
      || current?.body?.runSaveVersion !== 17
      || Number(current?.revision) !== 3
      || unsupported?.body?.formatVersion !== 15
      || Number(unsupported?.revision) !== 5
    ) {
      throw new Error(`Migration 54 did not preserve exactly the version-16 Run: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateSectioOperationsVocabularyMigration55() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_sectio_vocabulary_migration_55');
    await client.query('SET LOCAL search_path TO smoke_sectio_vocabulary_migration_55');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY,
        body jsonb NOT NULL,
        revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE run_craft_links (
        id text PRIMARY KEY,
        spec jsonb NOT NULL
      );
      CREATE TABLE media_slots (
        slot text PRIMARY KEY,
        active_version_id uuid,
        role text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE media_versions (
        id uuid PRIMARY KEY,
        slot text REFERENCES media_slots(slot) ON DELETE RESTRICT,
        role text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (id, slot)
      );
      CREATE TABLE media_asset_events (
        id bigserial PRIMARY KEY,
        slot text
      );
      CREATE TABLE drawable_asset_media (
        asset_id text NOT NULL,
        role text NOT NULL,
        slot text NOT NULL REFERENCES media_slots(slot) ON DELETE RESTRICT,
        PRIMARY KEY (asset_id, role)
      );
      CREATE TABLE media_catalog_state (
        singleton boolean PRIMARY KEY,
        revision bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO media_slots (slot, role, metadata) VALUES
        (
          'review/run-shop-wrap/market.png',
          'shop-wrap',
          '{"schema":"run-shop-wrap-candidate-v1"}'::jsonb
        ),
        (
          'ui/run/shop-wrap/market.png',
          'shop-wrap',
          '{"schema":"run-shop-wrap-runtime-v1","runtime":{"component":"run-shop-wrap","nativeRole":"run-shop-wrap"}}'::jsonb
        ),
        (
          'review/run-screen-art/sell/codex.png',
          'screen-art',
          '{}'::jsonb
        );
      INSERT INTO media_versions (id, slot, role, metadata) VALUES
        (
          '00000000-0000-4000-8000-000000000551',
          'review/run-shop-wrap/market.png',
          'shop-wrap',
          '{"schema":"run-shop-wrap-candidate-v1"}'::jsonb
        ),
        (
          '00000000-0000-4000-8000-000000000552',
          'ui/run/shop-wrap/market.png',
          'shop-wrap',
          '{"schema":"run-shop-wrap-runtime-v1","runtime":{"component":"run-shop-wrap","nativeRole":"run-shop-wrap"}}'::jsonb
        ),
        (
          '00000000-0000-4000-8000-000000000553',
          'review/run-screen-art/sell/codex.png',
          'screen-art',
          '{}'::jsonb
        );
      UPDATE media_slots
         SET active_version_id = CASE slot
           WHEN 'review/run-shop-wrap/market.png'
             THEN '00000000-0000-4000-8000-000000000551'::uuid
           WHEN 'ui/run/shop-wrap/market.png'
             THEN '00000000-0000-4000-8000-000000000552'::uuid
           ELSE '00000000-0000-4000-8000-000000000553'::uuid
         END;
      ALTER TABLE media_slots
        ADD CONSTRAINT media_slots_active_version_fk
        FOREIGN KEY (active_version_id, slot) REFERENCES media_versions(id, slot);
      INSERT INTO media_asset_events (slot) VALUES
        ('review/run-shop-wrap/market.png'),
        ('ui/run/shop-wrap/market.png'),
        ('review/run-screen-art/sell/codex.png');
      INSERT INTO drawable_asset_media (asset_id, role, slot) VALUES
        ('app-ui', 'sectio-wrap', 'ui/run/shop-wrap/market.png');
      INSERT INTO media_catalog_state (singleton) VALUES (true);
      INSERT INTO run_craft_links (id, spec) VALUES
        ('legacy-shop', '{"phase":"shop","battle":3}'::jsonb),
        ('current-battle', '{"phase":"battle","battle":3}'::jsonb);
    `);
    const legacyRun = {
      runSaveVersion: 17,
      id: 'legacy-shop-run',
      phase: 'shop',
      army: [
        { id: 'acquired', source: 'shop' },
        { id: 'starting', source: 'starting' },
      ],
      pestiferousLosses: [{ unit: { id: 'lost', source: 'shop' } }],
      shop: {
        cardOffers: [
          { offerId: 'shop-2-0-pp' },
          { offerId: 'opening-0-p' },
        ],
        purchasedCardOfferIds: ['shop-2-0-pp'],
        soldUnits: [{ unit: { id: 'sold', source: 'shop' }, proceedsTenths: 10 }],
        entrySnapshot: { army: [{ id: 'snapshot', source: 'shop' }] },
      },
      marker: 'preserved',
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
         ('version17@example.com', $1::jsonb, 7),
         ('version18@example.com', '{"runSaveVersion":18,"id":"current"}'::jsonb, 3)`,
      [JSON.stringify(legacyRun)],
    );

    await client.query(inlineMigrationSql(55));
    await client.query(inlineMigrationSql(55));

    const activeRuns = await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    );
    const migrated = activeRuns.rows.find((row) => row.owner_email === 'version17@example.com');
    const current = activeRuns.rows.find((row) => row.owner_email === 'version18@example.com');
    const craftLinks = await client.query('SELECT id, spec FROM run_craft_links ORDER BY id');
    const slots = await client.query('SELECT slot, role, metadata FROM media_slots ORDER BY slot');
    const versions = await client.query('SELECT slot, role, metadata FROM media_versions ORDER BY slot');
    const events = await client.query('SELECT slot FROM media_asset_events ORDER BY slot');
    const drawables = await client.query('SELECT slot FROM drawable_asset_media ORDER BY slot');
    const mediaForeignKeys = await client.query(`
      SELECT constraint_entry.conname,
             local_table.relname AS local_table,
             referenced_table.relname AS referenced_table
        FROM pg_constraint constraint_entry
        JOIN pg_class local_table ON local_table.oid = constraint_entry.conrelid
        JOIN pg_class referenced_table ON referenced_table.oid = constraint_entry.confrelid
       WHERE constraint_entry.conname IN (
         'drawable_asset_media_slot_fkey',
         'media_slots_active_version_fk',
         'media_versions_slot_fkey'
       )
         AND constraint_entry.conrelid IN (
           'drawable_asset_media'::regclass,
           'media_slots'::regclass,
           'media_versions'::regclass
         )
       ORDER BY constraint_entry.conname
    `);
    const allMediaRows = [...slots.rows, ...versions.rows];
    if (
      migrated?.body?.runSaveVersion !== 18
      || migrated?.body?.phase !== 'sectio'
      || Object.hasOwn(migrated?.body ?? {}, 'shop')
      || migrated?.body?.marker !== 'preserved'
      || migrated?.body?.army?.[0]?.source !== 'adlectio'
      || migrated?.body?.army?.[1]?.source !== 'starting'
      || migrated?.body?.pestiferousLosses?.[0]?.unit?.source !== 'adlectio'
      || migrated?.body?.sectio?.cardOffers?.[0]?.offerId !== 'sectio-2-0-pp'
      || migrated?.body?.sectio?.cardOffers?.[1]?.offerId !== 'opening-0-p'
      || migrated?.body?.sectio?.adlectedCardOfferIds?.[0] !== 'sectio-2-0-pp'
      || migrated?.body?.sectio?.alienatedUnits?.[0]?.unit?.source !== 'adlectio'
      || Object.hasOwn(migrated?.body?.sectio ?? {}, 'purchasedCardOfferIds')
      || Object.hasOwn(migrated?.body?.sectio ?? {}, 'soldUnits')
      || migrated?.body?.sectio?.entrySnapshot?.army?.[0]?.source !== 'adlectio'
      || Number(migrated?.revision) !== 8
      || current?.body?.runSaveVersion !== 18
      || Number(current?.revision) !== 3
      || craftLinks.rows.find((row) => row.id === 'legacy-shop')?.spec?.phase !== 'sectio'
      || craftLinks.rows.find((row) => row.id === 'current-battle')?.spec?.phase !== 'battle'
      || slots.rows.map((row) => row.slot).join(',')
        !== 'review/run-screen-art/alienatio/codex.png,review/run-sectio-wrap/market.png,ui/run/sectio-wrap/market.png'
      || versions.rows.map((row) => row.slot).join(',')
        !== 'review/run-screen-art/alienatio/codex.png,review/run-sectio-wrap/market.png,ui/run/sectio-wrap/market.png'
      || events.rows.map((row) => row.slot).join(',')
        !== 'review/run-screen-art/alienatio/codex.png,review/run-sectio-wrap/market.png,ui/run/sectio-wrap/market.png'
      || drawables.rows.map((row) => row.slot).join(',') !== 'ui/run/sectio-wrap/market.png'
      || allMediaRows.filter((row) => row.slot.includes('sectio-wrap')).some((row) => row.role !== 'sectio-wrap')
      || allMediaRows.filter((row) => row.slot.includes('screen-art')).some((row) => row.role !== 'screen-art')
      || allMediaRows.some((row) => row.metadata?.schema?.startsWith('run-shop-wrap-'))
      || allMediaRows.some((row) => row.metadata?.runtime?.component === 'run-shop-wrap')
      || allMediaRows.some((row) => row.metadata?.runtime?.nativeRole === 'run-shop-wrap')
      || mediaForeignKeys.rows.map((row) => (
        `${row.conname}:${row.local_table}->${row.referenced_table}`
      )).join(',') !== [
        'drawable_asset_media_slot_fkey:drawable_asset_media->media_slots',
        'media_slots_active_version_fk:media_slots->media_versions',
        'media_versions_slot_fkey:media_versions->media_slots',
      ].join(',')
    ) {
      throw new Error(`Migration 55 did not move the complete Sectio, Adlectio, and Alienatio vocabulary graph: ${JSON.stringify({
        active_runs: activeRuns.rows,
        craft_links: craftLinks.rows,
        slots: slots.rows,
        versions: versions.rows,
        events: events.rows,
        drawables: drawables.rows,
        media_foreign_keys: mediaForeignKeys.rows,
      })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateKlerosisAndDeploymentZoneMigration56() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_klerosis_migration_56');
    await client.query('SET LOCAL search_path TO smoke_klerosis_migration_56');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE levels (
        owner_email text, id text, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (owner_email, id)
      );
      CREATE TABLE campaign_workspaces (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE official_campaigns (
        id text PRIMARY KEY, data jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE public_maps (
        public_id text PRIMARY KEY, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE level_working_copies (
        document_id text PRIMARY KEY, body jsonb NOT NULL, revision bigint NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE level_working_copy_revisions (
        document_id text NOT NULL, revision bigint NOT NULL, body jsonb NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text, reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (document_id, revision)
      );
      CREATE TABLE editor_document_edit_sessions (session_id uuid PRIMARY KEY, draft_body jsonb NOT NULL);
      CREATE TABLE editor_document_recoveries (recovery_id uuid PRIMARY KEY, body jsonb NOT NULL);
      CREATE TABLE lab_runs (id text PRIMARY KEY, body jsonb NOT NULL);
      CREATE TABLE train_runs (
        id text PRIMARY KEY, spec jsonb NOT NULL, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE solve_runs (
        id text PRIMARY KEY, spec jsonb NOT NULL, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const boardWire = {
      c: 3,
      r: 2,
      zn: [
        ['general', 'player-spawn', ['0,0'], 'Player Deployment', 'blue', ['pawn', 'king']],
        ['pawns', 'player-pawn-spawn', ['1,0'], 'Pawn Deployment', 'green'],
      ],
      z: { '0,0': 'player-spawn', '1,0': 'player-pawn-spawn' },
    };
    const level = {
      formatVersion: 1,
      id: 'migration-level',
      boardCode: Buffer.from(JSON.stringify(boardWire), 'utf8').toString('base64url'),
      layers: {
        zones: [
          { id: 'general', type: 'player-spawn', tiles: [[0, 0]], excludedPieceTypes: ['pawn', 'king'] },
          { id: 'pawns', type: 'player-pawn-spawn', tiles: [[1, 0]] },
        ],
      },
    };
    const unaffectedLevel = {
      formatVersion: 1,
      id: 'unaffected-level',
      layers: {
        zones: [{ id: 'general', type: 'player-spawn', tiles: [[0, 0]], excludedPieceTypes: ['king'] }],
        units: [{ x: 0, y: 1, type: 'pawn', side: 'player' }],
      },
    };
    const run = {
      runSaveVersion: 18,
      id: 'run-migration-56',
      phase: 'battle',
      army: [
        { id: 'run-king', type: 'king', source: 'king', abilities: [] },
        { id: 'run-pawn-a', type: 'pawn', source: 'starting', abilities: [] },
        { id: 'run-pawn-b', type: 'pawn', source: 'starting', abilities: [] },
      ],
      cards: [{ id: 'run-card-1', coreId: 'p', unitIds: [] }],
      deployment: { seed: 11, manualPlacements: { 'run-king': '0,0' } },
      battleRuntime: { marker: true },
      aftermath: null,
      war: { battles: [{ level }] },
      sectio: {
        entrySnapshot: {
          army: [
            { id: 'run-king', type: 'king', source: 'king', abilities: [] },
            { id: 'run-pawn-a', type: 'pawn', source: 'starting', abilities: [] },
            { id: 'run-pawn-b', type: 'pawn', source: 'starting', abilities: [] },
          ],
          cards: [],
        },
      },
    };
    const nestedLevel = JSON.stringify({ levels: { [level.id]: level } });
    const runJson = JSON.stringify(run);
    const levelJson = JSON.stringify(level);
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision)
       VALUES ('run@example.com', $1::jsonb, 7)`,
      [runJson],
    );
    await client.query(
      `INSERT INTO levels (owner_email, id, body, revision)
       VALUES ('owner@example.com', 'migration-level', $1::jsonb, 4)`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO levels (owner_email, id, body, revision)
       VALUES ('owner@example.com', 'unaffected-level', $1::jsonb, 4)`,
      [JSON.stringify(unaffectedLevel)],
    );
    await client.query(
      `INSERT INTO campaign_workspaces (owner_email, body, revision)
       VALUES ('owner@example.com', $1::jsonb, 8)`,
      [nestedLevel],
    );
    await client.query(
      `INSERT INTO official_campaigns (id, data, revision)
       VALUES ('default', $1::jsonb, 9)`,
      [nestedLevel],
    );
    await client.query(
      `INSERT INTO public_maps (public_id, body) VALUES ('public', $1::jsonb)`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO level_working_copies (document_id, body, revision, saved_revision, baseline_hash)
       VALUES ('document', $1::jsonb, 2, 2, 'old')`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO level_working_copy_revisions
         (document_id, revision, body, saved_revision, baseline_hash, reason)
       VALUES ('document', 2, $1::jsonb, 2, 'old', 'autosave')`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO editor_document_edit_sessions (session_id, draft_body)
       VALUES ('00000000-0000-4000-8000-000000000056', $1::jsonb)`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO editor_document_recoveries (recovery_id, body)
       VALUES ('00000000-0000-4000-8000-000000000156', $1::jsonb)`,
      [levelJson],
    );
    await client.query(`INSERT INTO lab_runs (id, body) VALUES ('lab', $1::jsonb)`, [nestedLevel]);
    await client.query(
      `INSERT INTO train_runs (id, spec, body) VALUES ('train', $1::jsonb, $1::jsonb)`,
      [nestedLevel],
    );
    await client.query(
      `INSERT INTO solve_runs (id, spec, body) VALUES ('solve', $1::jsonb, $1::jsonb)`,
      [nestedLevel],
    );

    await client.query(inlineMigrationSql(56));
    await client.query(inlineMigrationSql(56));

    const migratedRun = (await client.query('SELECT body, revision FROM active_runs')).rows[0];
    const migratedLevel = (await client.query(
      `SELECT body, revision FROM levels WHERE id = 'migration-level'`,
    )).rows[0];
    const unaffectedRevision = (await client.query(
      `SELECT revision FROM levels WHERE id = 'unaffected-level'`,
    )).rows[0]?.revision;
    const workingCopy = (await client.query(
      'SELECT revision, saved_revision, baseline_hash FROM level_working_copies',
    )).rows[0];
    const workingHistory = await client.query(
      'SELECT revision, reason, body FROM level_working_copy_revisions ORDER BY revision',
    );
    const residuals = await client.query(`
      SELECT count(*)::integer AS count
        FROM (
          SELECT body AS value FROM levels
          UNION ALL SELECT body FROM campaign_workspaces
          UNION ALL SELECT data FROM official_campaigns
          UNION ALL SELECT body FROM public_maps
          UNION ALL SELECT body FROM level_working_copies
          UNION ALL SELECT body FROM level_working_copy_revisions
          UNION ALL SELECT draft_body FROM editor_document_edit_sessions
          UNION ALL SELECT body FROM editor_document_recoveries
          UNION ALL SELECT body FROM lab_runs
          UNION ALL SELECT spec FROM train_runs
          UNION ALL SELECT body FROM train_runs
          UNION ALL SELECT spec FROM solve_runs
          UNION ALL SELECT body FROM solve_runs
          UNION ALL SELECT body FROM active_runs
        ) AS documents
       WHERE pg_temp.migrate_nested_levels(value) IS DISTINCT FROM value
    `);
    const migratedWire = JSON.parse(Buffer.from(migratedLevel.body.boardCode, 'base64url').toString('utf8'));
    const layerGeneral = migratedLevel.body.layers.zones.find((zone) => zone.type === 'player-spawn');
    const wireGeneral = migratedWire.zn.find((zone) => zone[1] === 'player-spawn');
    if (
      migratedRun.body.runSaveVersion !== 19
      || migratedRun.body.phase !== 'deployment'
      || migratedRun.body.deployment !== null
      || migratedRun.body.battleRuntime !== null
      || Number(migratedRun.revision) !== 8
      || !migratedRun.body.army[0].abilities.includes('primogeniture')
      || migratedRun.body.cards.slice(0, 2).map((card) => card.coreId).join(',') !== 'his-grace,front-lines'
      || migratedRun.body.cards[0].unitIds[0] !== 'run-king'
      || migratedRun.body.cards[1].unitIds.join(',') !== 'run-pawn-a,run-pawn-b'
      || migratedRun.body.sectio.entrySnapshot.cards.length !== 2
      || Number(migratedLevel.revision) !== 5
      || Number(unaffectedRevision) !== 4
      || JSON.stringify(layerGeneral.tiles) !== JSON.stringify([[0, 0], [1, 0]])
      || JSON.stringify(layerGeneral.excludedPieceTypes) !== JSON.stringify(['king'])
      || JSON.stringify(wireGeneral[2]) !== JSON.stringify(['0,0', '1,0'])
      || JSON.stringify(wireGeneral[5]) !== JSON.stringify(['king'])
      || migratedWire.z['1,0'] !== 'player-spawn'
      || Number(workingCopy.revision) !== 3
      || Number(workingCopy.saved_revision) !== 3
      || workingCopy.baseline_hash !== null
      || workingHistory.rows.length !== 2
      || workingHistory.rows[1].reason !== 'migration'
      || residuals.rows[0].count !== 0
    ) {
      throw new Error(`Migration 56 did not establish Klerosis and remove Pawn-only deployment geometry: ${JSON.stringify({
        run: migratedRun,
        level: migratedLevel,
        unaffected_revision: unaffectedRevision,
        working_copy: workingCopy,
        working_history: workingHistory.rows,
        residuals: residuals.rows,
        wire: migratedWire,
      })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateExpunctioMigration57() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_expunctio_migration_57');
    await client.query('SET LOCAL search_path TO smoke_expunctio_migration_57');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const loss = {
      battleIndex: 0,
      cardId: 'run-card-1',
      unit: { id: 'run-unit-lost', type: 'pawn', source: 'adlectio' },
    };
    const sectioRun = {
      runSaveVersion: 19,
      id: 'run-migration-57-sectio',
      phase: 'sectio',
      pestiferousLosses: [loss],
      sectio: {
        alienatedUnits: [],
        entrySnapshot: { cards: [], army: [] },
      },
    };
    const battleRun = {
      runSaveVersion: 19,
      id: 'run-migration-57-battle',
      phase: 'battle',
      pestiferousLosses: [],
      sectio: null,
    };
    const currentRun = {
      runSaveVersion: 20,
      id: 'run-migration-57-current',
      phase: 'sectio',
      pestiferousLosses: [],
      sectio: { expunctedCard: null, entrySnapshot: { pestiferousLosses: [] } },
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
         ('sectio@example.com', $1::jsonb, 4),
         ('battle@example.com', $2::jsonb, 7),
         ('current@example.com', $3::jsonb, 9)`,
      [JSON.stringify(sectioRun), JSON.stringify(battleRun), JSON.stringify(currentRun)],
    );

    await client.query(inlineMigrationSql(57));
    await client.query(inlineMigrationSql(57));

    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const battle = rows.find((row) => row.owner_email === 'battle@example.com');
    const current = rows.find((row) => row.owner_email === 'current@example.com');
    const sectio = rows.find((row) => row.owner_email === 'sectio@example.com');
    const migratedLosses = sectio?.body?.sectio?.entrySnapshot?.pestiferousLosses;
    const migratedLoss = Array.isArray(migratedLosses) ? migratedLosses[0] : null;
    if (
      battle?.body?.runSaveVersion !== 20
      || battle?.body?.sectio !== null
      || Number(battle?.revision) !== 8
      || current?.body?.runSaveVersion !== 20
      || Number(current?.revision) !== 9
      || sectio?.body?.runSaveVersion !== 20
      || sectio?.body?.sectio?.expunctedCard !== null
      || migratedLosses?.length !== 1
      || migratedLoss?.battleIndex !== loss.battleIndex
      || migratedLoss?.cardId !== loss.cardId
      || migratedLoss?.unit?.id !== loss.unit.id
      || migratedLoss?.unit?.type !== loss.unit.type
      || migratedLoss?.unit?.source !== loss.unit.source
      || Number(sectio?.revision) !== 5
    ) {
      throw new Error(`Migration 57 did not establish Expunctio transaction state: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateCardOrderedDeploymentMigration58() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_card_order_migration_58');
    await client.query('SET LOCAL search_path TO smoke_card_order_migration_58');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const king = { id: 'king', type: 'king', abilities: ['primogeniture', 'agminate'] };
    const pawn = { id: 'pawn', type: 'pawn', abilities: ['eutactic'] };
    const rook = { id: 'rook', type: 'rook', abilities: [] };
    const cards = [
      { id: 'grace', coreId: 'his-grace', unitIds: ['king'] },
      { id: 'line', coreId: 'pr', unitIds: ['rook'] },
    ];
    const nestedLoss = { battleIndex: 0, cardId: 'line', unit: { ...pawn, abilities: ['primogeniture'] } };
    const sectio = {
      alienatedUnits: [{ unit: { ...rook, abilities: ['primogeniture'] }, valueTenths: 20 }],
      expunctedCard: { card: cards[1], units: [{ ...rook, abilities: ['primogeniture'] }], priceTenths: 40 },
      entrySnapshot: { army: [king, pawn, rook], cards, pestiferousLosses: [nestedLoss] },
    };
    const deploymentRun = {
      runSaveVersion: 20,
      id: 'run-migration-58-deployment',
      phase: 'deployment',
      army: [king, pawn, rook],
      cards,
      pestiferousLosses: [nestedLoss],
      sectio,
      deployment: { stage: 'farrago', queueUnitIds: ['king', 'rook', 'pawn'] },
      battleRuntime: null,
      aftermath: null,
    };
    const battleRun = {
      ...deploymentRun,
      id: 'run-migration-58-battle',
      phase: 'battle',
      battleRuntime: { battleIndex: 0, initiallyDeployedUnitIds: ['king', 'rook', 'pawn'] },
    };
    const sectioRun = {
      ...deploymentRun,
      id: 'run-migration-58-sectio',
      phase: 'sectio',
      deployment: null,
    };
    const currentRun = {
      runSaveVersion: 21,
      id: 'run-migration-58-current',
      phase: 'sectio',
      army: [{ id: 'king', type: 'king', abilities: [] }],
      cards: [{ id: 'grace', coreId: 'his-grace', unitSeats: ['king'] }],
      pestiferousLosses: [],
      sectio: null,
      deployment: null,
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
         ('deployment@example.com', $1::jsonb, 3),
         ('battle@example.com', $2::jsonb, 5),
         ('sectio@example.com', $3::jsonb, 7),
         ('current@example.com', $4::jsonb, 11)`,
      [deploymentRun, battleRun, sectioRun, currentRun].map(JSON.stringify),
    );

    await client.query(inlineMigrationSql(58));
    await client.query(inlineMigrationSql(58));

    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const deployment = rows.find((row) => row.owner_email === 'deployment@example.com');
    const battle = rows.find((row) => row.owner_email === 'battle@example.com');
    const sectioRow = rows.find((row) => row.owner_email === 'sectio@example.com');
    const current = rows.find((row) => row.owner_email === 'current@example.com');
    const migrated = [deployment, battle, sectioRow];
    const containsPrimogeniture = migrated.some((row) => JSON.stringify(row.body).includes('primogeniture'));
    const hasRetiredUnitIds = migrated.some((row) => /"unitIds"/.test(JSON.stringify(row.body)));
    if (
      migrated.some((row) => row?.body?.runSaveVersion !== 21)
      || containsPrimogeniture
      || hasRetiredUnitIds
      || JSON.stringify(deployment?.body?.cards?.map((card) => card.unitSeats)) !== JSON.stringify([['king'], [null, 'rook']])
      || deployment?.body?.phase !== 'deployment'
      || deployment?.body?.deployment !== null
      || deployment?.body?.battleRuntime !== null
      || battle?.body?.phase !== 'deployment'
      || battle?.body?.deployment !== null
      || battle?.body?.battleRuntime !== null
      || sectioRow?.body?.phase !== 'sectio'
      || JSON.stringify(sectioRow?.body?.sectio?.expunctedCard?.card?.unitSeats) !== JSON.stringify([null, 'rook'])
      || sectioRow?.body?.sectio?.entrySnapshot?.cards?.[0]?.unitSeats?.[0] !== 'king'
      || Number(deployment?.revision) !== 4
      || Number(battle?.revision) !== 6
      || Number(sectioRow?.revision) !== 8
      || current?.body?.runSaveVersion !== 21
      || Number(current?.revision) !== 11
    ) {
      throw new Error(`Migration 58 did not establish card-ordered deployment state: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateCompletePrimogenitureRetirementMigration59() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_primogeniture_retirement_migration_59');
    await client.query('SET LOCAL search_path TO smoke_primogeniture_retirement_migration_59');
    await client.query(`
      CREATE TABLE drawable_catalog_state (
        singleton boolean PRIMARY KEY, revision bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE media_catalog_state (
        singleton boolean PRIMARY KEY, revision bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE drawable_assets (
        id text PRIMARY KEY, behavior jsonb NOT NULL, lifecycle_state text NOT NULL,
        row_revision bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE media_slots (
        slot text PRIMARY KEY, lifecycle_state text NOT NULL, active_version_id uuid,
        retired_at timestamptz, retirement_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        row_revision bigint NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE media_versions (
        id uuid PRIMARY KEY, status text NOT NULL, row_revision bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE drawable_asset_media (
        asset_id text NOT NULL, role text NOT NULL, slot text NOT NULL,
        PRIMARY KEY (asset_id, role)
      );
      CREATE TABLE media_asset_events (
        id bigserial PRIMARY KEY, slot text, source_path text, version_id uuid,
        action text NOT NULL, actor_email text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO drawable_catalog_state (singleton, revision) VALUES (true, 10);
      INSERT INTO media_catalog_state (singleton, revision) VALUES (true, 20);
      INSERT INTO drawable_assets (id, behavior, lifecycle_state, row_revision)
      VALUES (
        'app-ui',
        '{"requiredRoles":["ui-kit-icons-game-primogeniture-png","ui-kit-icons-game-praecipuus-png"]}'::jsonb,
        'active',
        7
      );
      INSERT INTO media_slots (
        slot, lifecycle_state, active_version_id, row_revision
      ) VALUES (
        'ui/kit/icons/game/primogeniture.png',
        'active',
        'e8631a8c-7afa-425b-b487-898153278335'::uuid,
        4
      );
      INSERT INTO media_versions (id, status, row_revision)
      VALUES ('e8631a8c-7afa-425b-b487-898153278335'::uuid, 'accepted', 3);
      INSERT INTO drawable_asset_media (asset_id, role, slot) VALUES
        ('app-ui', 'ui-kit-icons-game-primogeniture-png', 'ui/kit/icons/game/primogeniture.png'),
        ('app-ui', 'ui-kit-icons-game-praecipuus-png', 'ui/kit/icons/game/praecipuus.png');
    `);

    await client.query(inlineMigrationSql(59));
    await client.query(inlineMigrationSql(59));

    const asset = (await client.query(
      `SELECT behavior, row_revision, updated_by FROM drawable_assets WHERE id = 'app-ui'`,
    )).rows[0];
    const bindings = (await client.query(
      `SELECT role, slot FROM drawable_asset_media WHERE asset_id = 'app-ui' ORDER BY role`,
    )).rows;
    const slot = (await client.query(
      `SELECT lifecycle_state, active_version_id, retirement_evidence, row_revision, updated_by
         FROM media_slots WHERE slot = 'ui/kit/icons/game/primogeniture.png'`,
    )).rows[0];
    const version = (await client.query(
      `SELECT status, row_revision, updated_by FROM media_versions
        WHERE id = 'e8631a8c-7afa-425b-b487-898153278335'::uuid`,
    )).rows[0];
    const drawableRevision = Number((await client.query(
      'SELECT revision FROM drawable_catalog_state WHERE singleton = true',
    )).rows[0].revision);
    const mediaRevision = Number((await client.query(
      'SELECT revision FROM media_catalog_state WHERE singleton = true',
    )).rows[0].revision);
    const events = (await client.query(
      `SELECT action, actor_email, details FROM media_asset_events
        WHERE slot = 'ui/kit/icons/game/primogeniture.png'`,
    )).rows;
    if (
      JSON.stringify(asset.behavior.requiredRoles) !== JSON.stringify(['ui-kit-icons-game-praecipuus-png'])
      || Number(asset.row_revision) !== 8
      || asset.updated_by !== 'migration-59'
      || bindings.length !== 1
      || bindings[0].role !== 'ui-kit-icons-game-praecipuus-png'
      || slot.lifecycle_state !== 'retired'
      || slot.active_version_id !== null
      || slot.retirement_evidence?.evidence?.decision !== 'ADR-0419'
      || Number(slot.row_revision) !== 5
      || slot.updated_by !== 'migration-59'
      || version.status !== 'archived'
      || Number(version.row_revision) !== 4
      || version.updated_by !== 'migration-59'
      || drawableRevision !== 11
      || mediaRevision !== 21
      || events.length !== 1
      || events[0].action !== 'slot-retired'
      || events[0].actor_email !== 'migration-59'
    ) {
      throw new Error(`Migration 59 did not complete Primogeniture retirement atomically: ${JSON.stringify({
        asset, bindings, slot, version, drawableRevision, mediaRevision, events,
      })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateDeploymentTransportMigration60() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_deployment_transport_migration_60');
    await client.query('SET LOCAL search_path TO smoke_deployment_transport_migration_60');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const baseDeployment = {
      battleIndex: 0,
      dealtCardIds: ['grace', 'line', 'rook'],
      revealedCardIds: [],
      placements: {},
      discardCursor: 0,
    };
    const waiting = {
      runSaveVersion: 21,
      phase: 'deployment',
      deployment: { ...baseDeployment, stage: 'dealing' },
    };
    const dealt = {
      runSaveVersion: 21,
      phase: 'deployment',
      deployment: { ...baseDeployment, stage: 'pace' },
    };
    const revealed = {
      runSaveVersion: 21,
      phase: 'deployment',
      deployment: {
        ...baseDeployment,
        stage: 'unit',
        mode: 'deploy-all',
        revealedCardIds: ['grace'],
        placements: { king: '3,7' },
      },
    };
    const current = { runSaveVersion: 22, phase: 'sectio', deployment: null };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
         ('waiting@example.com', $1::jsonb, 2),
         ('dealt@example.com', $2::jsonb, 4),
         ('revealed@example.com', $3::jsonb, 6),
         ('current@example.com', $4::jsonb, 8)`,
      [waiting, dealt, revealed, current].map(JSON.stringify),
    );

    await client.query(inlineMigrationSql(60));
    await client.query(inlineMigrationSql(60));

    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const waitingRow = byOwner.get('waiting@example.com');
    const dealtRow = byOwner.get('dealt@example.com');
    const revealedRow = byOwner.get('revealed@example.com');
    const currentRow = byOwner.get('current@example.com');
    if (
      waitingRow?.body?.runSaveVersion !== 22
      || waitingRow?.body?.deployment?.stage !== 'awaiting-deal'
      || waitingRow?.body?.deployment?.transport !== 'paused'
      || Number(waitingRow?.revision) !== 3
      || dealtRow?.body?.deployment?.stage !== 'card'
      || dealtRow?.body?.deployment?.transport !== 'paused'
      || Number(dealtRow?.revision) !== 5
      || revealedRow?.body?.deployment?.stage !== 'unit'
      || revealedRow?.body?.deployment?.transport !== 'paused'
      || Object.hasOwn(revealedRow?.body?.deployment ?? {}, 'mode')
      || revealedRow?.body?.deployment?.revealedCardIds?.[0] !== 'grace'
      || revealedRow?.body?.deployment?.placements?.king !== '3,7'
      || Number(revealedRow?.revision) !== 7
      || currentRow?.body?.runSaveVersion !== 22
      || Number(currentRow?.revision) !== 8
    ) {
      throw new Error(`Migration 60 did not establish Deployment deal and transport state: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateLevelFormatAndEditorBaselineMigration61() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_level_format_migration_61');
    await client.query('SET LOCAL search_path TO smoke_level_format_migration_61');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE levels (
        owner_email text, id text, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (owner_email, id)
      );
      CREATE TABLE campaign_workspaces (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE official_campaigns (
        id text PRIMARY KEY, data jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE public_maps (
        public_id text PRIMARY KEY, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE level_working_copies (
        document_id text PRIMARY KEY, body jsonb NOT NULL, revision bigint NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE level_working_copy_revisions (
        document_id text NOT NULL, revision bigint NOT NULL, body jsonb NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text, reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (document_id, revision)
      );
      CREATE TABLE editor_document_edit_sessions (session_id uuid PRIMARY KEY, draft_body jsonb NOT NULL);
      CREATE TABLE editor_document_recoveries (recovery_id uuid PRIMARY KEY, body jsonb NOT NULL);
      CREATE TABLE lab_runs (id text PRIMARY KEY, body jsonb NOT NULL);
      CREATE TABLE train_runs (
        id text PRIMARY KEY, spec jsonb NOT NULL, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE solve_runs (
        id text PRIMARY KEY, spec jsonb NOT NULL, body jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const boardWire = {
      c: 3,
      r: 2,
      zn: [
        ['general', 'player-spawn', ['0,0'], 'Player Deployment', 'blue', ['pawn', 'king']],
        ['pawns', 'player-pawn-spawn', ['1,0'], 'Piétons', 'green'],
      ],
      z: { '0,0': 'player-spawn', '1,0': 'player-pawn-spawn' },
    };
    const level = {
      formatVersion: 1,
      id: 'migration-level-v2',
      name: 'Saved position',
      boardCode: Buffer.from(JSON.stringify(boardWire), 'utf8').toString('base64url'),
      layers: {
        zones: [
          { id: 'general', type: 'player-spawn', tiles: [[0, 0]], excludedPieceTypes: ['pawn', 'king'] },
          { id: 'pawns', type: 'player-pawn-spawn', tiles: [[1, 0]] },
        ],
      },
    };
    const dirtyLevel = { ...level, name: 'Unsaved progress' };
    const nestedLevel = { levels: { [level.id]: level } };
    const run = {
      runSaveVersion: 22,
      id: 'run-migration-61',
      war: { battles: [{ level, loot: false }] },
    };
    const levelJson = JSON.stringify(level);
    const nestedJson = JSON.stringify(nestedLevel);
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES ('run@example.com', $1::jsonb, 7)`,
      [JSON.stringify(run)],
    );
    await client.query(
      `INSERT INTO levels (owner_email, id, body, revision)
       VALUES ('owner@example.com', 'migration-level-v2', $1::jsonb, 4)`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO campaign_workspaces (owner_email, body, revision)
       VALUES ('owner@example.com', $1::jsonb, 8)`,
      [nestedJson],
    );
    await client.query(
      `INSERT INTO official_campaigns (id, data, revision) VALUES ('default', $1::jsonb, 9)`,
      [nestedJson],
    );
    await client.query(`INSERT INTO public_maps (public_id, body) VALUES ('public', $1::jsonb)`, [levelJson]);
    await client.query(
      `INSERT INTO level_working_copies (document_id, body, revision, saved_revision, baseline_hash)
       VALUES
         ('clean', $1::jsonb, 11, 11, NULL),
         ('dirty', $2::jsonb, 12, 11, NULL),
         ('never-saved', $2::jsonb, 3, 0, NULL),
         ('healthy', $1::jsonb, 5, 5, md5(($1::jsonb)::text))`,
      [levelJson, JSON.stringify(dirtyLevel)],
    );
    await client.query(
      `INSERT INTO level_working_copy_revisions
         (document_id, revision, body, saved_revision, baseline_hash, reason)
       VALUES
         ('clean', 11, $1::jsonb, 11, NULL, 'save'),
         ('dirty', 11, $1::jsonb, 11, NULL, 'save'),
         ('never-saved', 3, $2::jsonb, 0, NULL, 'create'),
         ('healthy', 5, $1::jsonb, 5, md5(($1::jsonb)::text), 'save')`,
      [levelJson, JSON.stringify(dirtyLevel)],
    );
    await client.query(
      `INSERT INTO editor_document_edit_sessions (session_id, draft_body)
       VALUES ('00000000-0000-4000-8000-000000000061', $1::jsonb)`,
      [levelJson],
    );
    await client.query(
      `INSERT INTO editor_document_recoveries (recovery_id, body)
       VALUES ('00000000-0000-4000-8000-000000000161', $1::jsonb)`,
      [levelJson],
    );
    await client.query(`INSERT INTO lab_runs (id, body) VALUES ('lab', $1::jsonb)`, [nestedJson]);
    await client.query(
      `INSERT INTO train_runs (id, spec, body) VALUES ('train', $1::jsonb, $1::jsonb)`,
      [nestedJson],
    );
    await client.query(
      `INSERT INTO solve_runs (id, spec, body) VALUES ('solve', $1::jsonb, $1::jsonb)`,
      [nestedJson],
    );

    await client.query(inlineMigrationSql(61));
    await client.query(inlineMigrationSql(61));

    const migratedRun = (await client.query('SELECT body, revision FROM active_runs')).rows[0];
    const migratedLevel = (await client.query('SELECT body, revision FROM levels')).rows[0];
    const workingCopies = (await client.query(`
      SELECT document_id, body, revision, saved_revision, baseline_hash,
             md5(body::text) AS body_hash
        FROM level_working_copies
       ORDER BY document_id
    `)).rows;
    const workingById = new Map(workingCopies.map((row) => [row.document_id, row]));
    const clean = workingById.get('clean');
    const dirty = workingById.get('dirty');
    const neverSaved = workingById.get('never-saved');
    const healthy = workingById.get('healthy');
    const savedDirtyHash = (await client.query(
      `SELECT md5(body::text) AS hash
         FROM level_working_copy_revisions
        WHERE document_id = 'dirty' AND revision = 11`,
    )).rows[0]?.hash;
    const history = await client.query(
      'SELECT document_id, revision, reason, body FROM level_working_copy_revisions ORDER BY document_id, revision',
    );
    const residuals = await client.query(`
      SELECT count(*)::integer AS count
        FROM (
          SELECT body AS value FROM levels
          UNION ALL SELECT body FROM campaign_workspaces
          UNION ALL SELECT data FROM official_campaigns
          UNION ALL SELECT body FROM public_maps
          UNION ALL SELECT body FROM level_working_copies
          UNION ALL SELECT body FROM level_working_copy_revisions
          UNION ALL SELECT draft_body FROM editor_document_edit_sessions
          UNION ALL SELECT body FROM editor_document_recoveries
          UNION ALL SELECT body FROM lab_runs
          UNION ALL SELECT spec FROM train_runs
          UNION ALL SELECT body FROM train_runs
          UNION ALL SELECT spec FROM solve_runs
          UNION ALL SELECT body FROM solve_runs
          UNION ALL SELECT body FROM active_runs
        ) AS documents
       WHERE pg_temp.migrate_nested_levels_v2(value) IS DISTINCT FROM value
    `);
    const migratedWire = JSON.parse(Buffer.from(migratedLevel.body.boardCode, 'base64url').toString('utf8'));
    const layerGeneral = migratedLevel.body.layers.zones.find((zone) => zone.type === 'player-spawn');
    const wireGeneral = migratedWire.zn.find((zone) => zone[1] === 'player-spawn');
    if (
      migratedRun?.body?.runSaveVersion !== 23
      || migratedRun?.body?.war?.battles?.[0]?.level?.formatVersion !== 2
      || Number(migratedRun?.revision) !== 8
      || migratedLevel?.body?.formatVersion !== 2
      || Number(migratedLevel?.revision) !== 5
      || JSON.stringify(layerGeneral?.tiles) !== JSON.stringify([[0, 0], [1, 0]])
      || JSON.stringify(layerGeneral?.excludedPieceTypes) !== JSON.stringify(['king'])
      || JSON.stringify(wireGeneral?.[2]) !== JSON.stringify(['0,0', '1,0'])
      || JSON.stringify(wireGeneral?.[5]) !== JSON.stringify(['king'])
      || migratedWire.z?.['1,0'] !== 'player-spawn'
      || clean?.body?.formatVersion !== 2
      || Number(clean?.revision) !== 12
      || Number(clean?.saved_revision) !== 12
      || clean?.baseline_hash !== clean?.body_hash
      || dirty?.body?.formatVersion !== 2
      || Number(dirty?.revision) !== 13
      || Number(dirty?.saved_revision) !== 11
      || dirty?.baseline_hash !== savedDirtyHash
      || dirty?.baseline_hash === dirty?.body_hash
      || neverSaved?.body?.formatVersion !== 2
      || Number(neverSaved?.revision) !== 4
      || Number(neverSaved?.saved_revision) !== 0
      || neverSaved?.baseline_hash !== null
      || healthy?.body?.formatVersion !== 2
      || Number(healthy?.revision) !== 6
      || Number(healthy?.saved_revision) !== 6
      || healthy?.baseline_hash !== healthy?.body_hash
      || history.rows.filter((row) => row.reason === 'migration').length !== 4
      || residuals.rows[0]?.count !== 0
    ) {
      throw new Error(`Migration 61 did not establish Level format 2 and reconstruct saved baselines: ${JSON.stringify({
        run: migratedRun,
        level: migratedLevel,
        working_copies: workingCopies,
        history: history.rows,
        residuals: residuals.rows,
        wire: migratedWire,
      })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateRetainedEditorBaselineEvidenceMigration62() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_editor_baseline_migration_62');
    await client.query('SET LOCAL search_path TO smoke_editor_baseline_migration_62');
    await client.query(`
      CREATE TABLE level_working_copies (
        document_id text PRIMARY KEY, body jsonb NOT NULL, revision bigint NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE level_working_copy_revisions (
        document_id text NOT NULL, revision bigint NOT NULL, body jsonb NOT NULL,
        saved_revision bigint NOT NULL, baseline_hash text, reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (document_id, revision)
      );
    `);
    await client.query(`
      INSERT INTO level_working_copies
        (document_id, body, revision, saved_revision, baseline_hash)
      VALUES
        ('same-boundary-evidence', '{"formatVersion":2,"name":"Private draft"}'::jsonb, 30, 27, NULL),
        ('missing-evidence', '{"formatVersion":2,"name":"Unproved draft"}'::jsonb, 5, 2, NULL),
        ('healthy', '{"formatVersion":2,"name":"Healthy"}'::jsonb, 7, 7, 'healthy-baseline');

      INSERT INTO level_working_copy_revisions
        (document_id, revision, body, saved_revision, baseline_hash, reason)
      VALUES
        ('same-boundary-evidence', 28, '{"formatVersion":2,"name":"Private draft"}'::jsonb, 27, 'old-format-baseline', 'autosave'),
        ('same-boundary-evidence', 29, '{"formatVersion":2,"name":"Private draft"}'::jsonb, 26, 'wrong-save-boundary', 'autosave'),
        ('same-boundary-evidence', 30, '{"formatVersion":2,"name":"Private draft"}'::jsonb, 27, NULL, 'migration'),
        ('missing-evidence', 4, '{"formatVersion":2,"name":"Unproved draft"}'::jsonb, 1, 'unrelated-baseline', 'autosave'),
        ('missing-evidence', 5, '{"formatVersion":2,"name":"Unproved draft"}'::jsonb, 2, NULL, 'migration'),
        ('healthy', 7, '{"formatVersion":2,"name":"Healthy"}'::jsonb, 7, 'healthy-baseline', 'save');
    `);

    await client.query(inlineMigrationSql(62));
    await client.query(inlineMigrationSql(62));

    const documents = await client.query(`
      SELECT document_id, revision, saved_revision, baseline_hash
        FROM level_working_copies
       ORDER BY document_id
    `);
    const history = await client.query(`
      SELECT document_id, revision, saved_revision, baseline_hash, reason
        FROM level_working_copy_revisions
       WHERE reason = 'migration'
       ORDER BY document_id, revision
    `);
    const byId = new Map(documents.rows.map((row) => [row.document_id, row]));
    const repaired = byId.get('same-boundary-evidence');
    const missing = byId.get('missing-evidence');
    const healthy = byId.get('healthy');
    if (
      Number(repaired?.revision) !== 31
      || Number(repaired?.saved_revision) !== 27
      || repaired?.baseline_hash !== 'old-format-baseline'
      || Number(missing?.revision) !== 5
      || Number(missing?.saved_revision) !== 2
      || missing?.baseline_hash !== null
      || Number(healthy?.revision) !== 7
      || healthy?.baseline_hash !== 'healthy-baseline'
      || history.rows.filter((row) => (
        row.document_id === 'same-boundary-evidence'
        && Number(row.revision) === 31
        && Number(row.saved_revision) === 27
        && row.baseline_hash === 'old-format-baseline'
      )).length !== 1
    ) {
      throw new Error(`Migration 62 did not conservatively restore retained baseline evidence: ${JSON.stringify({
        documents: documents.rows,
        history: history.rows,
      })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateGeneratedFormationRunMigration63() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_generated_formation_run_migration_63');
    await client.query('SET LOCAL search_path TO smoke_generated_formation_run_migration_63');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const unit = (id, type, source, extra = {}) => ({
      id, type, source, name: id, number: 1, inspectionSeed: 17, ...extra,
    });
    const v23Army = [
      unit('run-king', 'king', 'king', { abilities: ['eutactic'] }),
      unit('run-pawn-a', 'pawn', 'starting', { modifiers: ['cacochymic'] }),
      unit('run-pawn-b', 'pawn', 'starting'),
      unit('run-knight-1', 'knight', 'adlectio', { abilities: ['adlected'] }),
      unit('run-bishop-1', 'bishop', 'adlectio'),
      unit('run-pawn-3', 'pawn', 'adlectio'),
    ];
    const oldCard = (id, coreId, unitSeats, extra = {}) => ({
      id, coreId, unitSeats, acquiredAfterBattleIndex: 0,
      cardType: null, effectSeed: 9, effectTargetUnitId: null,
      lostUnitIds: [], cacochymicUnitId: null, ...extra,
    });
    const v23Cards = [
      oldCard('run-card-his-grace', 'his-grace', ['run-king']),
      oldCard('run-card-front-lines', 'front-lines', ['run-pawn-a', 'run-pawn-b']),
      oldCard('run-card-knight', 'k', ['run-knight-1']),
      oldCard('run-card-old-pb', 'pb', ['run-bishop-1', 'run-pawn-3']),
    ];
    const v23 = {
      runSaveVersion: 23,
      id: 'run-v23', seed: 23, ataraxiaTier: 1, updatedAt: new Date().toISOString(),
      phase: 'sectio', battleIndex: 0, conflictIndex: 0, goldTenths: 80,
      war: { id: 'war', name: 'War', description: '', battles: [{ level: { formatVersion: 2 }, loot: false }] },
      army: v23Army, cards: v23Cards,
      lipsana: ['quartermasters-ledger', 'training-linens'],
      seenLipsana: ['quartermasters-ledger', 'training-linens'],
      conflictPaidLipsana: {
        0: { lipsanonId: 'fair-scales', bought: false },
        1: { lipsanonId: 'royal-decree', bought: false },
      },
      nextArmyUnitSequence: 7,
      nextArmyUnitNumberByType: { pawn: 4, knight: 2, bishop: 2, rook: 1, queen: 1, king: 2 },
      nextCardSequence: 5,
      deployment: null, battleRuntime: null, aftermath: null,
      vacantia: null, pestiferousLosses: [],
      sectio: {
        kind: 'opening', afterBattleIndex: 0, conflictIndex: 0, victoryGoldTenths: 0,
        cardOffers: [], adlectedCardOfferIds: ['old-offer'], paidLipsanonOffer: 'royal-decree',
        paidLipsanonBought: true, alienatedUnits: [], expunctedCard: null,
        entrySnapshot: {},
      },
    };
    const offer = (id, artId, pieces, formation, value) => ({
      id, artId, pieces, formation, value, offerId: `offer-${id}`, cost: value,
    });
    const v24Sectio = {
      runSaveVersion: 24, phase: 'sectio', deployment: null, battleRuntime: null, aftermath: null,
      sectio: {
        cardOffers: [
          offer('p', 'p', ['pawn'], [{ x: 0, y: 0 }], 1),
          offer('r', 'r', ['rook'], [{ x: 0, y: 0 }], 5),
          offer('bb-vertical', 'bb', ['bishop', 'bishop'], [{ x: 0, y: 0 }, { x: 0, y: 1 }], 6),
        ],
      },
    };
    const v24Battle = {
      runSaveVersion: 24, phase: 'battle', deployment: { placements: { king: '2,6' } },
      battleRuntime: { battleIndex: 0 }, aftermath: { stale: true }, sectio: null,
    };
    const v25 = { runSaveVersion: 25, phase: 'sectio', deployment: null, sectio: { cardOffers: [] } };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('v23@example.com', $1::jsonb, 1),
        ('v24-sectio@example.com', $2::jsonb, 3),
        ('v24-battle@example.com', $3::jsonb, 5),
        ('v25@example.com', $4::jsonb, 7)`,
      [v23, v24Sectio, v24Battle, v25].map(JSON.stringify),
    );

    await client.query(inlineMigrationSql(63));
    await client.query(inlineMigrationSql(63));

    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migrated23 = byOwner.get('v23@example.com');
    const migrated24Sectio = byOwner.get('v24-sectio@example.com');
    const migrated24Battle = byOwner.get('v24-battle@example.com');
    const current25 = byOwner.get('v25@example.com');
    const v23UnitSeats = migrated23?.body?.cards?.flatMap((card) => card.unitSeats.filter(Boolean)) ?? [];
    if (
      migrated23?.body?.runSaveVersion !== 25
      || migrated23?.body?.ataraxiaTier !== 0
      || Number(migrated23?.revision) !== 2
      || JSON.stringify(migrated23.body).match(/abilities|modifiers|cardType|pestiferousLosses/)
      || migrated23.body.cards?.[0]?.id !== 'run-card-his-grace'
      || JSON.stringify(migrated23.body.cards?.[0]?.unitSeats) !== JSON.stringify(['run-king', 'run-pawn-a', 'run-pawn-b'])
      || migrated23.body.cards?.find((card) => card.id === 'run-card-knight')?.coreId !== 'k'
      || new Set(v23UnitSeats).size !== v23Army.length
      || v23UnitSeats.length !== v23Army.length
      || JSON.stringify(migrated23.body.lipsana) !== JSON.stringify(['quartermasters-ledger'])
      || Object.keys(migrated23.body.conflictPaidLipsana).length !== 1
      || migrated23.body.sectio?.cardOffers?.length !== 4
      || migrated23.body.sectio?.cardOffers?.some((candidate) => !candidate.rarity)
      || migrated23.body.sectio?.paidLipsanonOffer !== null
      || migrated24Sectio?.body?.runSaveVersion !== 25
      || Number(migrated24Sectio?.revision) !== 4
      || JSON.stringify(migrated24Sectio.body.sectio.cardOffers.map((candidate) => candidate.rarity))
        !== JSON.stringify(['common', 'uncommon', 'rare'])
      || migrated24Battle?.body?.runSaveVersion !== 25
      || migrated24Battle?.body?.phase !== 'deployment'
      || migrated24Battle?.body?.deployment !== null
      || migrated24Battle?.body?.battleRuntime !== null
      || migrated24Battle?.body?.aftermath !== null
      || Number(migrated24Battle?.revision) !== 6
      || current25?.body?.runSaveVersion !== 25
      || Number(current25?.revision) !== 7
    ) {
      throw new Error(`Migration 63 did not produce canonical generated formation Runs: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateDerivedSectioPileRunMigration64() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_derived_sectio_pile_run_migration_64');
    await client.query('SET LOCAL search_path TO smoke_derived_sectio_pile_run_migration_64');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const opening = {
      runSaveVersion: 25, phase: 'sectio', battleIndex: 0, conflictIndex: 0,
      goldTenths: 65, army: [{ id: 'survivor' }], cards: [{ id: 'held' }],
      deployment: null, battleRuntime: null, aftermath: null, vacantia: null,
      sectio: { kind: 'opening', cardOffers: [{ id: 'visible-opening' }] },
    };
    const postBattle = {
      runSaveVersion: 25, phase: 'sectio', battleIndex: 2,
      deployment: null, battleRuntime: null, aftermath: null, vacantia: null,
      sectio: { kind: 'post-battle', cardOffers: [{ id: 'visible-post-battle' }] },
    };
    const current = { runSaveVersion: 26, phase: 'deployment', sectioCardCursor: 17, sectio: null };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('opening@example.com', $1::jsonb, 4),
        ('post-battle@example.com', $2::jsonb, 7),
        ('current@example.com', $3::jsonb, 9)`,
      [opening, postBattle, current].map(JSON.stringify),
    );

    await client.query(inlineMigrationSql(64));
    await client.query(inlineMigrationSql(64));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migratedOpening = byOwner.get('opening@example.com');
    const migratedPostBattle = byOwner.get('post-battle@example.com');
    const untouchedCurrent = byOwner.get('current@example.com');
    if (
      migratedOpening?.body?.runSaveVersion !== 26
      || migratedOpening.body.phase !== 'deployment'
      || migratedOpening.body.sectioCardCursor !== 0
      || migratedOpening.body.sectio !== null
      || migratedOpening.body.goldTenths !== 65
      || migratedOpening.body.army?.[0]?.id !== 'survivor'
      || migratedOpening.body.cards?.[0]?.id !== 'held'
      || Number(migratedOpening.revision) !== 5
      || migratedPostBattle?.body?.runSaveVersion !== 26
      || migratedPostBattle.body.phase !== 'sectio'
      || migratedPostBattle.body.sectioCardCursor !== 0
      || migratedPostBattle.body.sectio?.kind !== undefined
      || migratedPostBattle.body.sectio?.cardOffers?.[0]?.id !== 'visible-post-battle'
      || Number(migratedPostBattle.revision) !== 8
      || untouchedCurrent?.body?.sectioCardCursor !== 17
      || Number(untouchedCurrent?.revision) !== 9
    ) {
      throw new Error(`Migration 64 did not produce Battle-first derived-pile Runs: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateQueenPawnCatalogRunMigration65() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_queen_pawn_catalog_run_migration_65');
    await client.query('SET LOCAL search_path TO smoke_queen_pawn_catalog_run_migration_65');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const legacy = {
      runSaveVersion: 26,
      phase: 'sectio',
      sectioCardCursor: 117,
      army: [{ id: 'survivor' }],
      cards: [{ id: 'held' }],
      sectio: { cardOffers: [{ id: 'visible-offer' }] },
      deployment: null,
    };
    const current = { runSaveVersion: 27, phase: 'deployment', sectioCardCursor: 17, sectio: null };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('legacy@example.com', $1::jsonb, 4),
        ('current@example.com', $2::jsonb, 9)`,
      [legacy, current].map(JSON.stringify),
    );

    await client.query(inlineMigrationSql(65));
    await client.query(inlineMigrationSql(65));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migratedLegacy = byOwner.get('legacy@example.com');
    const untouchedCurrent = byOwner.get('current@example.com');
    if (
      migratedLegacy?.body?.runSaveVersion !== 27
      || migratedLegacy.body.sectioCardCursor !== 0
      || migratedLegacy.body.phase !== 'sectio'
      || migratedLegacy.body.army?.[0]?.id !== 'survivor'
      || migratedLegacy.body.cards?.[0]?.id !== 'held'
      || migratedLegacy.body.sectio?.cardOffers?.[0]?.id !== 'visible-offer'
      || Number(migratedLegacy.revision) !== 5
      || untouchedCurrent?.body?.sectioCardCursor !== 17
      || Number(untouchedCurrent?.revision) !== 9
    ) {
      throw new Error(`Migration 65 did not preserve visible Run state while restarting the hidden catalog: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateImmutableFormationAndLegacyDrawableRepairMigrations66And67() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_immutable_formation_run_migration_66');
    await client.query('SET LOCAL search_path TO smoke_immutable_formation_run_migration_66');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE drawable_assets (
        id text PRIMARY KEY, lifecycle_state text NOT NULL, row_revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE drawable_asset_media (
        asset_id text NOT NULL, role text NOT NULL DEFAULT 'icon', slot text NOT NULL
      );
      CREATE TABLE drawable_catalog_state (
        singleton boolean PRIMARY KEY, revision integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE media_versions (
        id text PRIMARY KEY, status text NOT NULL, row_revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE media_slots (
        slot text PRIMARY KEY, active_version_id text, lifecycle_state text NOT NULL,
        retired_at timestamptz, retirement_evidence jsonb, row_revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
      );
      CREATE TABLE media_asset_events (
        id bigserial PRIMARY KEY, slot text NOT NULL, source_path text, version_id text,
        action text NOT NULL, actor_email text, details jsonb
      );
      CREATE TABLE media_catalog_state (
        singleton boolean PRIMARY KEY, revision integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const snapshot = {
      goldTenths: 40,
      army: [{ id: 'pawn-a' }, { id: 'pawn-b' }],
      cards: [{ id: 'held', unitSeats: ['pawn-a', 'pawn-b'] }],
      lipsana: ['royal-tent', 'fair-scales'],
      seenLipsana: ['royal-tent', 'fair-scales', 'mercenary-boat'],
      conflictPaidLipsana: { 0: { lipsanonId: 'fair-scales', bought: false } },
      nextArmyUnitSequence: 3,
      nextArmyUnitNumberByType: { pawn: 3 },
      nextCardSequence: 2,
      paidLipsanonBought: false,
    };
    const legacy = {
      runSaveVersion: 27,
      phase: 'sectio',
      goldTenths: 45,
      army: [{ id: 'pawn-b' }],
      cards: [{ id: 'held', unitSeats: [null, 'pawn-b'] }],
      lipsana: ['royal-tent', 'fair-scales'],
      seenLipsana: ['royal-tent', 'fair-scales', 'mercenary-boat'],
      conflictPaidLipsana: { 0: { lipsanonId: 'fair-scales', bought: false } },
      nextArmyUnitSequence: 3,
      nextArmyUnitNumberByType: { pawn: 3 },
      nextCardSequence: 2,
      battleRuntime: { battleIndex: 0, cashedOutUnitIds: ['pawn-a'] },
      vacantia: null,
      sectio: {
        conflictIndex: 0,
        cardOffers: [{ offerId: 'visible-offer' }],
        adlectedCardOfferIds: ['visible-offer'],
        paidLipsanonOffer: 'fair-scales',
        paidLipsanonBought: false,
        alienatedUnits: [{ unit: { id: 'pawn-a' }, proceedsTenths: 5 }],
        expunctedCard: { card: { id: 'other' } },
        entrySnapshot: snapshot,
      },
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES ('legacy@example.com', $1::jsonb, 4)`,
      [JSON.stringify(legacy)],
    );
    await client.query(`
      INSERT INTO drawable_catalog_state (singleton, revision) VALUES (true, 1);
      INSERT INTO media_catalog_state (singleton, revision) VALUES (true, 1);
      INSERT INTO drawable_assets (id, lifecycle_state, row_revision) VALUES
        ('run-relic-mercenary-boat', 'active', 1),
        ('run-relic-fair-scales', 'active', 1),
        ('run-lipsanon-mercenary-boat', 'active', 1),
        ('run-lipsanon-fair-scales', 'active', 1),
        ('run-gold-transaction-gain', 'active', 1);
      INSERT INTO drawable_asset_media (asset_id, slot) VALUES
        ('run-relic-mercenary-boat', 'ui/run/lipsana/mercenary-boat.png'),
        ('run-relic-fair-scales', 'ui/run/lipsana/fair-scales.png'),
        ('run-lipsanon-mercenary-boat', 'ui/run/lipsana/mercenary-boat.png'),
        ('run-lipsanon-fair-scales', 'ui/run/lipsana/fair-scales.png'),
        ('run-gold-transaction-gain', 'ui/run/resources/gain-gold.png');
      INSERT INTO media_versions (id, status, row_revision) VALUES
        ('boat-version', 'accepted', 1),
        ('scales-version', 'accepted', 1),
        ('gain-version', 'accepted', 1);
      INSERT INTO media_slots (slot, active_version_id, lifecycle_state, row_revision) VALUES
        ('ui/run/lipsana/mercenary-boat.png', 'boat-version', 'active', 1),
        ('ui/run/lipsana/fair-scales.png', 'scales-version', 'active', 1),
        ('ui/run/resources/gain-gold.png', 'gain-version', 'active', 1);
    `);

    await client.query(inlineMigrationSql(66));
    await client.query(inlineMigrationSql(66));
    const brokenLegacyGraph = (await client.query(`
      SELECT
        (SELECT count(*)::integer
           FROM drawable_assets
          WHERE id IN ('run-relic-mercenary-boat', 'run-relic-fair-scales')
            AND lifecycle_state = 'active') AS active_legacy_assets,
        (SELECT count(*)::integer
           FROM drawable_asset_media
          WHERE asset_id IN ('run-relic-mercenary-boat', 'run-relic-fair-scales')) AS legacy_bindings,
        (SELECT count(*)::integer
           FROM media_slots
          WHERE slot IN ('ui/run/lipsana/mercenary-boat.png', 'ui/run/lipsana/fair-scales.png')
            AND lifecycle_state = 'retired') AS retired_legacy_slots
    `)).rows[0];
    if (
      Number(brokenLegacyGraph.active_legacy_assets) !== 2
      || Number(brokenLegacyGraph.legacy_bindings) !== 2
      || Number(brokenLegacyGraph.retired_legacy_slots) !== 2
    ) {
      throw new Error(`Migration 66 fixture did not reproduce the production legacy-identity gap: ${JSON.stringify(brokenLegacyGraph)}`);
    }
    await client.query(inlineMigrationSql(67));
    await client.query(inlineMigrationSql(67));

    const migrated = (await client.query(
      `SELECT body, revision FROM active_runs WHERE owner_email = 'legacy@example.com'`,
    )).rows[0];
    const installed = (await client.query(`
      SELECT
        (SELECT count(*)::integer FROM drawable_assets WHERE lifecycle_state <> 'retired') AS active_assets,
        (SELECT count(*)::integer FROM drawable_asset_media) AS bindings,
        (SELECT count(*)::integer FROM media_slots WHERE lifecycle_state <> 'retired' OR active_version_id IS NOT NULL) AS active_slots,
        (SELECT count(*)::integer FROM media_versions WHERE status <> 'archived') AS active_versions,
        (SELECT count(*)::integer FROM media_asset_events WHERE action = 'slot-retired') AS retirement_events,
        (SELECT revision FROM drawable_catalog_state WHERE singleton = true) AS drawable_revision,
        (SELECT revision FROM media_catalog_state WHERE singleton = true) AS media_revision
    `)).rows[0];
    if (
      migrated?.body?.runSaveVersion !== 28
      || migrated.body.goldTenths !== 40
      || migrated.body.army?.length !== 2
      || migrated.body.cards?.[0]?.unitSeats?.[0] !== 'pawn-a'
      || JSON.stringify(migrated.body.lipsana) !== JSON.stringify(['royal-tent'])
      || JSON.stringify(migrated.body.seenLipsana) !== JSON.stringify(['royal-tent'])
      || Object.keys(migrated.body.conflictPaidLipsana || {}).length !== 0
      || migrated.body.sectio?.paidLipsanonOffer !== null
      || migrated.body.sectio?.adlectedCardOfferIds?.length !== 0
      || migrated.body.sectio?.expunctedCard !== null
      || Object.hasOwn(migrated.body.sectio || {}, 'alienatedUnits')
      || Object.hasOwn(migrated.body.battleRuntime || {}, 'cashedOutUnitIds')
      || Number(migrated.revision) !== 5
      || Number(installed.active_assets) !== 0
      || Number(installed.bindings) !== 0
      || Number(installed.active_slots) !== 0
      || Number(installed.active_versions) !== 0
      || Number(installed.retirement_events) !== 3
      || Number(installed.drawable_revision) !== 3
      || Number(installed.media_revision) !== 2
    ) {
      throw new Error(`Migrations 66 and 67 did not repair individual disposal atomically: ${JSON.stringify({ migrated, installed })}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validatePlayerFormationMigrations68And69() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_player_formation_migrations_68_69');
    await client.query('SET LOCAL search_path TO smoke_player_formation_migrations_68_69');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const legacy = {
      runSaveVersion: 28,
      phase: 'deployment',
      goldTenths: 40,
      deployment: { stage: 'complete', placements: { king: '2,3' } },
    };
    const current = {
      ...legacy,
      runSaveVersion: 29,
      phase: 'battle',
      deploymentMode: 'arranged',
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('legacy@example.com', $1::jsonb, 4),
        ('current@example.com', $2::jsonb, 9)`,
      [JSON.stringify(legacy), JSON.stringify(current)],
    );

    await client.query(inlineMigrationSql(68));
    await client.query(inlineMigrationSql(68));
    await client.query(inlineMigrationSql(69));
    await client.query(inlineMigrationSql(69));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migrated = byOwner.get('legacy@example.com');
    const untouched = byOwner.get('current@example.com');
    if (
      migrated?.body?.runSaveVersion !== 30
      || migrated.body.deploymentMode !== 'arranged'
      || migrated.body.phase !== 'deployment'
      || migrated.body.deployment !== null
      || migrated.body.sectioCardCursor !== 0
      || Number(migrated.revision) !== 6
      || untouched?.body?.runSaveVersion !== 30
      || untouched?.body?.deploymentMode !== 'arranged'
      || untouched.body.deployment?.placements?.king !== '2,3'
      || Number(untouched?.revision) !== 10
    ) {
      throw new Error(`Migrations 68 and 69 did not install player arrangement safely: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * ADR-0516. The opening screen grants a formation card, so migration 70 has to advance a
 * version-30 document, hand an opening screen card offers in place of its lipsana, and leave
 * every later Conflict's lipsanon offer exactly where it is. Idempotent, like its neighbours.
 */
async function validateOpeningCardGrantMigration70() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_opening_card_grant_migration_70');
    await client.query('SET LOCAL search_path TO smoke_opening_card_grant_migration_70');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const opening = {
      runSaveVersion: 30,
      phase: 'bona-vacantia',
      vacantia: {
        kind: 'opening',
        conflictIndex: 0,
        afterBattleIndex: 0,
        victoryGoldTenths: 0,
        offers: ['royal-tent', 'occult-dagger', 'merchants-shopkey'],
      },
    };
    const later = {
      runSaveVersion: 30,
      phase: 'bona-vacantia',
      vacantia: {
        kind: 'post-battle',
        conflictIndex: 1,
        afterBattleIndex: 2,
        victoryGoldTenths: 60,
        offers: ['royal-tent', 'occult-dagger'],
      },
    };
    const elsewhere = { runSaveVersion: 30, phase: 'battle', vacantia: null };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('opening@example.com', $1::jsonb, 3),
        ('later@example.com', $2::jsonb, 7),
        ('elsewhere@example.com', $3::jsonb, 11)`,
      [JSON.stringify(opening), JSON.stringify(later), JSON.stringify(elsewhere)],
    );

    await client.query(inlineMigrationSql(70));
    await client.query(inlineMigrationSql(70));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const granted = byOwner.get('opening@example.com');
    const relic = byOwner.get('later@example.com');
    const untouched = byOwner.get('elsewhere@example.com');
    if (
      granted?.body?.runSaveVersion !== 31
      || granted.body.vacantia?.kind !== 'opening'
      || !Array.isArray(granted.body.vacantia?.cardOffers)
      || granted.body.vacantia.cardOffers.length !== 3
      || new Set(granted.body.vacantia.cardOffers).size !== 3
      || !Array.isArray(granted.body.vacantia?.offers)
      || granted.body.vacantia.offers.length !== 0
      || Number(granted.revision) !== 4
      || relic?.body?.runSaveVersion !== 31
      || relic.body.vacantia?.offers?.join(',') !== 'royal-tent,occult-dagger'
      || !Array.isArray(relic.body.vacantia?.cardOffers)
      || relic.body.vacantia.cardOffers.length !== 0
      || Number(relic.revision) !== 8
      || untouched?.body?.runSaveVersion !== 31
      || untouched.body.vacantia !== null
      || Number(untouched.revision) !== 12
    ) {
      throw new Error(`Migration 70 did not install the opening card grant safely: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * ADR-0523. Rarity becomes a material band, piles carry an exact quota, and the opening market
 * caps card cost, so the hidden card sequence changed outright and its cursor restarts. A Sectio
 * already open keeps the row it is showing -- those offers are a transaction the player is
 * part-way through, and each re-reads its rarity from the live catalog on load. Idempotent, like
 * its neighbours, and it must not touch a document that is not version 31.
 */
async function validateCardRarityBandMigration71() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_card_rarity_band_migration_71');
    await client.query('SET LOCAL search_path TO smoke_card_rarity_band_migration_71');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const openSectio = {
      runSaveVersion: 31,
      phase: 'sectio',
      sectioCardCursor: 24,
      sectio: { afterBattleIndex: 2, cardOffers: [{ id: 'q', offerId: 'battle-2-0-q' }] },
    };
    const midRun = { runSaveVersion: 31, phase: 'battle', sectioCardCursor: 9, sectio: null };
    const alreadyCurrent = { runSaveVersion: 32, phase: 'battle', sectioCardCursor: 17, sectio: null };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('sectio@example.com', $1::jsonb, 5),
        ('battle@example.com', $2::jsonb, 2),
        ('current@example.com', $3::jsonb, 9)`,
      [JSON.stringify(openSectio), JSON.stringify(midRun), JSON.stringify(alreadyCurrent)],
    );

    await client.query(inlineMigrationSql(71));
    await client.query(inlineMigrationSql(71));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migratedSectio = byOwner.get('sectio@example.com');
    const migratedBattle = byOwner.get('battle@example.com');
    const untouched = byOwner.get('current@example.com');
    if (
      migratedSectio?.body?.runSaveVersion !== 32
      || migratedSectio.body.sectioCardCursor !== 0
      // The visible row survives: it is a transaction the player is part-way through.
      || migratedSectio.body.sectio?.cardOffers?.length !== 1
      || migratedSectio.body.sectio.cardOffers[0].id !== 'q'
      || Number(migratedSectio.revision) !== 6
      || migratedBattle?.body?.runSaveVersion !== 32
      || migratedBattle.body.sectioCardCursor !== 0
      || Number(migratedBattle.revision) !== 3
      || untouched?.body?.runSaveVersion !== 32
      || untouched.body.sectioCardCursor !== 17
      || Number(untouched.revision) !== 9
    ) {
      throw new Error(`Migration 71 did not restart the card sequence safely: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateAuthoredDealMigration72() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA smoke_authored_deal_migration_72');
    await client.query('SET LOCAL search_path TO smoke_authored_deal_migration_72');
    await client.query(`
      CREATE TABLE active_runs (
        owner_email text PRIMARY KEY, body jsonb NOT NULL, revision integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const battle = (level) => ({ loot: false, level });
    // Three shapes a stored Battle level can be in: no Battle block at all, a Loot-only block,
    // and one that already authors a count.
    const plainRun = {
      runSaveVersion: 32,
      phase: 'battle',
      war: {
        id: 'w',
        battles: [
          battle({ id: 'a', name: 'A' }),
          battle({ id: 'b', name: 'B', battle: { loot: true } }),
          battle({ id: 'c', name: 'C', battle: { loot: false, cardsDealt: 7 } }),
        ],
      },
    };
    // A document with no readable War must still advance rather than be stranded at 32.
    const warlessRun = { runSaveVersion: 32, phase: 'battle', war: null };
    const alreadyCurrent = {
      runSaveVersion: 33,
      phase: 'battle',
      war: { id: 'w', battles: [battle({ id: 'a', name: 'A', battle: { loot: false, cardsDealt: 5 } })] },
    };
    await client.query(
      `INSERT INTO active_runs (owner_email, body, revision) VALUES
        ('plain@example.com', $1::jsonb, 4),
        ('warless@example.com', $2::jsonb, 2),
        ('current@example.com', $3::jsonb, 9)`,
      [JSON.stringify(plainRun), JSON.stringify(warlessRun), JSON.stringify(alreadyCurrent)],
    );

    await client.query(inlineMigrationSql(72));
    await client.query(inlineMigrationSql(72));
    const rows = (await client.query(
      'SELECT owner_email, body, revision FROM active_runs ORDER BY owner_email',
    )).rows;
    const byOwner = new Map(rows.map((row) => [row.owner_email, row]));
    const migrated = byOwner.get('plain@example.com');
    const warless = byOwner.get('warless@example.com');
    const untouched = byOwner.get('current@example.com');
    const dealt = (row, index) => row?.body?.war?.battles?.[index]?.level?.battle?.cardsDealt;
    if (
      migrated?.body?.runSaveVersion !== 33
      || dealt(migrated, 0) !== 3
      || dealt(migrated, 1) !== 3
      // A Battle that already authored its deal keeps it.
      || dealt(migrated, 2) !== 7
      // Loot is Battle content the migration has no business rewriting, in either direction.
      || migrated.body.war.battles[1].level.battle.loot !== true
      || migrated.body.war.battles[2].level.battle.loot !== false
      // Battle order is content, so the rebuilt array must not be reordered.
      || migrated.body.war.battles.map((entry) => entry.level.id).join(',') !== 'a,b,c'
      // Applied twice, it advances the revision exactly once.
      || Number(migrated.revision) !== 5
      || warless?.body?.runSaveVersion !== 33
      || Number(warless.revision) !== 3
      || untouched?.body?.runSaveVersion !== 33
      || dealt(untouched, 0) !== 5
      || Number(untouched.revision) !== 9
    ) {
      throw new Error(`Migration 72 did not author the Deployment deal safely: ${JSON.stringify(rows)}`);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve validation error */ }
    throw error;
  } finally {
    await client.end();
  }
}

async function validateRepairedEditorDocumentDiscardOperation62() {
  const documentId = '00000000-0000-4000-8000-000000000262';
  const levelId = 'migration-operation-level';
  const version1Level = {
    formatVersion: 1,
    id: levelId,
    name: 'Canonical saved position',
    notes: '',
    board: { cols: 2, rows: 2, heightLevels: 1 },
    objective: 'capture-all',
    difficulty: 'normal',
    economy: { startingFunds: 0, incomePerTurn: 0 },
    theme: 'grassland',
    layers: { terrain: [], decals: [], zones: [], units: [] },
  };
  const privateDraft = { ...version1Level, name: 'Private draft with pruned saved revision' };
  await queryDb(
    `INSERT INTO campaign_workspaces (owner_email, body, revision)
     VALUES ('player@example.com', $1::jsonb, 1)`,
    [JSON.stringify({ campaigns: [], wars: [], levels: { [levelId]: version1Level } })],
  );
  await queryDb(
    `INSERT INTO level_working_copies
       (document_id, owner_email, workspace_kind, workspace_id, level_id,
        body, revision, saved_revision, baseline_hash)
     VALUES ($1, 'player@example.com', 'user', 'campaign', $2, $3::jsonb, 6, 5, NULL)`,
    [documentId, levelId, JSON.stringify(privateDraft)],
  );
  await queryDb(
    `INSERT INTO level_working_copy_revisions
       (document_id, revision, body, saved_revision, baseline_hash, reason)
     VALUES ($1, 6, $2::jsonb, 5, md5(($3::jsonb)::text), 'autosave')`,
    [documentId, JSON.stringify(privateDraft), JSON.stringify(version1Level)],
  );
  const beforeRepair = await get(`/api/editor-documents/${documentId}`, {
    cookie: '__Host-chess-tactics-access=abc',
  });
  const beforeRepairBody = JSON.parse(beforeRepair.body);
  if (
    beforeRepair.statusCode !== 200
    || beforeRepairBody.document?.saved_revision !== 5
    || beforeRepairBody.document?.has_saved_baseline !== false
    || beforeRepairBody.document?.never_saved !== false
    || beforeRepairBody.document?.baseline_conflict !== true
  ) {
    throw new Error(`A missing baseline hash reclassified a saved document: ${beforeRepair.statusCode} ${beforeRepair.body}`);
  }
  await queryDb(inlineMigrationSql(61));
  await queryDb(inlineMigrationSql(62));

  const loaded = await get(`/api/editor-documents/${documentId}`, {
    cookie: '__Host-chess-tactics-access=abc',
  });
  const loadedBody = JSON.parse(loaded.body);
  if (
    loaded.statusCode !== 200
    || loadedBody.document?.level?.formatVersion !== 2
    || loadedBody.document?.has_saved_baseline !== true
    || loadedBody.document?.never_saved !== false
    || loadedBody.document?.dirty !== true
    || loadedBody.document?.baseline_conflict !== true
  ) {
    throw new Error(`Migration 62 repaired document did not preserve its conflict: ${loaded.statusCode} ${loaded.body}`);
  }
  const opened = await openEditorEditSession(documentId);
  if (
    opened.response.statusCode !== 200
    || !['active', 'waiting'].includes(opened.body.session?.state)
  ) {
    throw new Error(`Migration 62 repaired document could not open an edit session: ${opened.response.statusCode} ${opened.response.body}`);
  }
  const discarded = await request(
    'POST',
    `/api/editor-documents/${documentId}/discard`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(documentId, '__Host-chess-tactics-access=abc', {
      revision: loadedBody.document.revision,
    })),
  );
  const discardedBody = JSON.parse(discarded.body);
  if (
    discarded.statusCode !== 200
    || discardedBody.document?.level?.formatVersion !== 2
    || discardedBody.document?.level?.name !== version1Level.name
    || discardedBody.document?.dirty !== false
    || discardedBody.document?.has_saved_baseline !== true
    || discardedBody.document?.baseline_conflict !== false
  ) {
    throw new Error(`Repaired Level could not perform its fenced Discard operation: ${discarded.statusCode} ${discarded.body}`);
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
  await validatePrimarySparseNumericMigrationUpgrade64();
  const databaseRuntime = await queryDb('SELECT version() AS version');
  const isPgliteRuntime = /\bPGlite\b/i.test(String(databaseRuntime.rows[0]?.version || ''));
  if (!isPgliteRuntime) {
    startSecondaryBackend();
    await waitForSecondarySchemaCheck();
    const secondaryReadyLine = secondaryOutput
      .split(/\r?\n/)
      .find((line) => line.includes('postgres ready') && line.includes('schema=check'));
    if (
      !secondaryReadyLine
      || !secondaryReadyLine.includes('schema migrations applied: none')
      || !secondaryReadyLine.includes('pending: none')
    ) {
      throw new Error(
        `Check-mode backend did not verify the sealed upgraded migration history:\n${secondaryOutput}`,
      );
    }
    secondaryChild.kill();
    await waitForProcessExit(secondaryChild);
    secondaryChild = null;
  }
  if (!fs.existsSync(path.join(hotBackendDir, 'server.js'))) {
    throw new Error('Supervisor did not initialize the hot backend entrypoint');
  }
  await validateEditorMigration16Preservation();
  await validateThumbnailRepairMigration22();
  await validateEditorRevisionReasonMigration37();
  await validateRunSaveVersionMigration54();
  await validateSectioOperationsVocabularyMigration55();
  await validateKlerosisAndDeploymentZoneMigration56();
  await validateExpunctioMigration57();
  await validateCardOrderedDeploymentMigration58();
  await validateCompletePrimogenitureRetirementMigration59();
  await validateDeploymentTransportMigration60();
  await validateLevelFormatAndEditorBaselineMigration61();
  await validateRetainedEditorBaselineEvidenceMigration62();
  await validateGeneratedFormationRunMigration63();
  await validateDerivedSectioPileRunMigration64();
  await validateQueenPawnCatalogRunMigration65();
  await validateImmutableFormationAndLegacyDrawableRepairMigrations66And67();
  await validatePlayerFormationMigrations68And69();
  await validateOpeningCardGrantMigration70();
  await validateCardRarityBandMigration71();
  await validateAuthoredDealMigration72();
  await validateRepairedEditorDocumentDiscardOperation62();
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
       to_regclass('public.level_working_copy_revisions') AS working_copy_revisions,
       to_regclass('public.editor_maps') AS retired_editor_maps,
       to_regclass('public.editor_map_audit_events') AS retired_editor_map_events,
       to_regclass('public.editor_document_edit_sessions') AS edit_sessions,
       to_regclass('public.editor_document_recoveries') AS recoveries,
       to_regclass('public.editor_document_edit_events') AS edit_events,
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
            AND table_name = 'level_working_copies'
            AND column_name = 'edit_generation'
       ) AS has_edit_generation,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'editor_document_edit_sessions'
            AND column_name = 'device_hash'
       ) AS has_device_hash,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'editor_document_edit_sessions'
            AND column_name = 'session_key_hash'
       ) AS has_session_key_hash,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'editor_document_edit_sessions'
            AND column_name = 'device_id'
       ) AS has_raw_device_id,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'editor_document_edit_sessions'
            AND column_name = 'session_key'
       ) AS has_raw_session_key,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'editor_document_recoveries'
            AND column_name = 'resolved_at'
       ) AS has_recovery_resolved_at,
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
    !editorSchemaRow.working_copy_revisions ||
    editorSchemaRow.retired_editor_maps ||
    editorSchemaRow.retired_editor_map_events ||
    !editorSchemaRow.edit_sessions ||
    !editorSchemaRow.recoveries ||
    !editorSchemaRow.edit_events ||
    !editorSchemaRow.public_play_maps ||
    editorSchemaRow.has_baseline_hash !== true ||
    editorSchemaRow.has_edit_generation !== true ||
    editorSchemaRow.has_device_hash !== true ||
    editorSchemaRow.has_session_key_hash !== true ||
    editorSchemaRow.has_raw_device_id !== false ||
    editorSchemaRow.has_raw_session_key !== false ||
    editorSchemaRow.has_recovery_resolved_at !== true ||
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
    '/play/select',
    '/play/select/run',
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

  const signedIn = await get('/api/auth/me', { cookie: '__Host-chess-tactics-access=abc' });
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
  const adminJson = { 'content-type': 'application/json', cookie: '__Host-chess-tactics-access=abc' };

  // Shared live media: no packaged-file fallback, private candidates,
  // native/review-gated acceptance, immutable public bytes, stable slot
  // redirects, revisions, audit, and private archives. Imported legacy-bridge
  // rows remain readable, but no API can create another one after cutover.
  const emptyMediaCatalog = await get('/api/asset-catalog');
  const emptyMediaBody = JSON.parse(emptyMediaCatalog.body);
  if (emptyMediaCatalog.statusCode !== 200 || emptyMediaBody.schemaVersion !== 1 || emptyMediaBody.slots.length !== 0) {
    throw new Error(`Unexpected empty media catalog: ${emptyMediaCatalog.statusCode} ${emptyMediaCatalog.body}`);
  }
  const surfaceTopSlots = Array.from({ length: 8 }, (_, index) => `smoke/terrain/surface-${index}`);
  const candidateBytes = syntheticPng(96, 180, '#16324a', '#4f8fb2');
  const candidateSha = crypto.createHash('sha256').update(candidateBytes).digest('hex');
  const candidateCreateBody = {
    slot: surfaceTopSlots[0],
    sourcePath: 'smoke/private-surface-0.png',
    domain: 'terrain',
    role: 'top',
    label: 'Private smoke candidate',
    availabilityPolicy: 'critical',
    slotMetadata: {
      fixture: true,
      privatePrompt: 'must never leak publicly',
      acceptance: { mode: 'group', groupId: 'smoke/terrain/surface-v1', requiredSlots: surfaceTopSlots },
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
    || JSON.parse(stagedMediaCatalog.body).slots.some((slot) => slot.slot === surfaceTopSlots[0])
  ) throw new Error(`Unactivated critical staging slot leaked publicly: ${stagedMediaCatalog.statusCode} ${stagedMediaCatalog.body}`);
  const missingMediaRevision = await request(
    'PUT', `/api/admin/media-versions/${candidateVersion.id}/content`,
    { 'content-type': 'image/png', cookie: '__Host-chess-tactics-access=abc' }, candidateBytes, 5000,
  );
  if (missingMediaRevision.statusCode !== 428) throw new Error(`Media upload without revision should be 428: ${missingMediaRevision.statusCode} ${missingMediaRevision.body}`);
  const candidateUpload = await request(
    'PUT', `/api/admin/media-versions/${candidateVersion.id}/content`,
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, candidateBytes, 5000,
  );
  const candidateUploadBody = JSON.parse(candidateUpload.body);
  if (
    candidateUpload.statusCode !== 200 || candidateUploadBody.version.rowRevision !== 1
    || candidateUploadBody.catalogRevision !== 0
    || candidateUploadBody.version.media.sha256 !== candidateSha
    || candidateUploadBody.version.media.mediaType !== 'image/png'
  ) throw new Error(`Media candidate content upload failed: ${candidateUpload.statusCode} ${candidateUpload.body}`);
  const privateCandidateRead = await get(candidateUploadBody.version.media.url, { cookie: '__Host-chess-tactics-access=abc' }, 5000);
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
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const stagedSlot = stagedAdminCatalog.slots.find((slot) => slot.slot === surfaceTopSlots[0]);
  if (
    stagedSlot.activeVersionId !== null || stagedSlot.versionStatus !== null
    || stagedSlot.lifecycleState !== 'staging' || stagedSlot.metadata.privatePrompt !== 'must never leak publicly'
  ) throw new Error(`Admin staging projection is wrong: ${JSON.stringify(stagedSlot)}`);
  const stagedStableRoute = await get(`/assets/${surfaceTopSlots[0]}`);
  if (stagedStableRoute.statusCode !== 404) {
    throw new Error(`Staging stable route should fail closed, not fall back: ${stagedStableRoute.statusCode}`);
  }

  // Migration history legitimately contains legacy-bridge rows even though the
  // application no longer exposes an API that can create one. Seed one directly
  // in this throwaway database so future CI keeps read/availability/replacement
  // compatibility without reopening the retired mutation route. First patch the
  // staging contract through the API to invalidate the earlier empty-catalog cache.
  const stagingPatch = await request(
    'PATCH', `/api/admin/media-slots/${surfaceTopSlots[0]}`, adminJson,
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
    [candidateVersion.id, candidateSha, surfaceTopSlots[0]],
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
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const bridgedSlot = bridgedAdminCatalog.slots.find((slot) => slot.slot === surfaceTopSlots[0]);
  if (
    bridgedSlot.activeVersionId !== candidateVersion.id || bridgedSlot.versionStatus !== 'legacy-bridge'
    || bridgedSlot.productionEligible !== false || bridgedSlot.metadata.privatePrompt !== 'must never leak publicly'
  ) throw new Error(`Admin imported-bridge projection is wrong: ${JSON.stringify(bridgedSlot)}`);
  const partialStableBridge = await get(`/assets/${surfaceTopSlots[0]}`);
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
    slot: surfaceTopSlots[0],
    domain: 'terrain',
    role: 'top',
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
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, acceptedBytes, 5000,
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

  // Typed authored SFX promotion: an exact candidate audition proof binds the
  // decoded one-shot geometry and slot snapshot, stale acceptance rolls back,
  // and the reviewed WAV publishes through the same atomic pointer transaction.
  const sfxSlot = 'sfx/smoke-clink/v0.wav';
  const sfxBytes = syntheticWav();
  const sfxSha = crypto.createHash('sha256').update(sfxBytes).digest('hex');
  const sfxCreate = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
    slot: sfxSlot,
    domain: 'sfx',
    role: 'audio',
    label: 'Smoke exact-byte clink',
    availabilityPolicy: 'decorative',
    metadata: {
      runtime: {
        component: 'sfx-sample',
        variant: 'smoke-clink',
        state: 'one-shot',
        durationMs: 100,
        loop: false,
      },
    },
    provenance: { generator: 'synthetic-wav-smoke' },
  }), 5000);
  if (sfxCreate.statusCode !== 201) throw new Error(`SFX candidate create failed: ${sfxCreate.statusCode} ${sfxCreate.body}`);
  const sfxVersion = JSON.parse(sfxCreate.body).version;
  const sfxUpload = await request(
    'PUT', `/api/admin/media-versions/${sfxVersion.id}/content`,
    { 'content-type': 'audio/wav', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, sfxBytes, 5000,
  );
  const sfxUploaded = JSON.parse(sfxUpload.body).version;
  if (
    sfxUpload.statusCode !== 200 || sfxUploaded.rowRevision !== 1
    || sfxUploaded.media.sha256 !== sfxSha || sfxUploaded.media.mediaType !== 'audio/wav'
  ) throw new Error(`SFX candidate upload failed: ${sfxUpload.statusCode} ${sfxUpload.body}`);
  const sfxAdminBeforeReview = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const sfxSlotBeforeReview = sfxAdminBeforeReview.slots.find((slot) => slot.slot === sfxSlot);
  if (!sfxSlotBeforeReview || sfxSlotBeforeReview.activeVersionId !== null) {
    throw new Error(`SFX staging slot is invalid: ${JSON.stringify(sfxSlotBeforeReview)}`);
  }
  const sfxSurfaceUrl = `http://127.0.0.1:${port}/studio?mode=viewer&vk=sfx&sfxReview=${sfxVersion.id}`;
  const sfxProof = {
    schema: 'sfx-sample-exact-byte-proof-v1',
    renderer: 'SfxViewer/ExactCandidateAudition',
    surfaceUrl: sfxSurfaceUrl,
    exactByteAudition: true,
    playbackRate: 1,
    decodedAudio: { durationMs: 100, sampleRate: 8000, channels: 1 },
    selectedCandidates: [{
      slot: sfxSlot,
      versionId: sfxVersion.id,
      sha256: sfxSha,
      rowRevision: 1,
    }],
    slotSnapshots: [{
      slot: sfxSlot,
      rowRevision: sfxSlotBeforeReview.rowRevision,
      activeVersionId: sfxSlotBeforeReview.activeVersionId,
    }],
  };
  const rejectedSfxReview = await request(
    'POST', `/api/admin/media-versions/${sfxVersion.id}/review`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      approved: true,
      notes: 'Mismatched decoded duration must fail.',
      surfaceUrl: sfxSurfaceUrl,
      evidence: { ...sfxProof, decodedAudio: { ...sfxProof.decodedAudio, durationMs: 500 } },
    }), 5000,
  );
  if (
    rejectedSfxReview.statusCode !== 409
    || JSON.parse(rejectedSfxReview.body).error !== 'invalid_media_review_proof'
  ) throw new Error(`Mismatched SFX audition proof should fail: ${rejectedSfxReview.statusCode} ${rejectedSfxReview.body}`);
  const sfxReview = await request(
    'POST', `/api/admin/media-versions/${sfxVersion.id}/review`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      approved: true,
      notes: 'Exact candidate decoded and auditioned once at unity playback rate.',
      surfaceUrl: sfxSurfaceUrl,
      evidence: sfxProof,
    }), 5000,
  );
  if (sfxReview.statusCode !== 200 || JSON.parse(sfxReview.body).version.rowRevision !== 2) {
    throw new Error(`SFX exact-byte review failed: ${sfxReview.statusCode} ${sfxReview.body}`);
  }
  const rejectedSfxAccept = await request(
    'POST', `/api/admin/media-versions/${sfxVersion.id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 2,
      expectedSlotRevision: sfxSlotBeforeReview.rowRevision + 1,
      expectedActiveVersionId: null,
    }), 5000,
  );
  if (
    rejectedSfxAccept.statusCode !== 409
    || JSON.parse(rejectedSfxAccept.body).error !== 'media_slot_conflict'
  ) throw new Error(`Stale SFX acceptance should fail atomically: ${rejectedSfxAccept.statusCode} ${rejectedSfxAccept.body}`);
  const sfxAfterRollback = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const rolledBackSfxSlot = sfxAfterRollback.slots.find((slot) => slot.slot === sfxSlot);
  const rolledBackSfxVersion = sfxAfterRollback.versions.find((version) => version.id === sfxVersion.id);
  if (
    rolledBackSfxSlot.activeVersionId !== null
    || rolledBackSfxSlot.rowRevision !== sfxSlotBeforeReview.rowRevision
    || rolledBackSfxVersion.status !== 'candidate' || rolledBackSfxVersion.rowRevision !== 2
  ) throw new Error(`Failed SFX acceptance mutated catalog state: ${JSON.stringify({ rolledBackSfxSlot, rolledBackSfxVersion })}`);
  const sfxAccept = await request(
    'POST', `/api/admin/media-versions/${sfxVersion.id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 2,
      expectedSlotRevision: sfxSlotBeforeReview.rowRevision,
      expectedActiveVersionId: null,
    }), 5000,
  );
  if (sfxAccept.statusCode !== 200 || JSON.parse(sfxAccept.body).version.status !== 'accepted') {
    throw new Error(`SFX acceptance failed: ${sfxAccept.statusCode} ${sfxAccept.body}`);
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
    { 'content-type': 'text/plain', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, privateBytes, 5000,
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
  const privateAdminRead = await get(`/api/admin/media/${privateSha}`, { cookie: '__Host-chess-tactics-access=abc' }, 5000);
  if (
    privateAdminRead.statusCode !== 200 || privateAdminRead.body !== privateBytes.toString('utf8')
    || privateAdminRead.headers['cache-control'] !== 'private, no-store'
  ) {
    throw new Error(`Private archived media verification failed: ${privateAdminRead.statusCode} ${privateAdminRead.body}`);
  }

  const groupSlots = surfaceTopSlots;
  const groupBytes = surfaceTopSlots.map((_, index) => syntheticPng(
    96, 180, `#${(0x102030 + index * 0x010305).toString(16).padStart(6, '0')}`, '#7bdcf4',
  ));
  groupBytes[0] = acceptedBytes;
  const preparedGroupVersions = [{ id: nativeVersion.id, slot: groupSlots[0], sha256: acceptedSha, rowRevision: 1 }];
  for (let index = 1; index < groupSlots.length; index += 1) {
    const sha = crypto.createHash('sha256').update(groupBytes[index]).digest('hex');
    const create = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
      slot: groupSlots[index],
      sourcePath: `smoke/generated-surface-${index}.png`,
      domain: 'terrain',
      role: 'top',
      label: `Grouped smoke ${index + 1}`,
      availabilityPolicy: 'critical',
      slotMetadata: {
        acceptance: {
          mode: 'group',
          groupId: 'smoke/terrain/surface-v1',
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
      { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, groupBytes[index], 5000,
    );
    if (upload.statusCode !== 200 || JSON.parse(upload.body).version.media.sha256 !== sha) {
      throw new Error(`Grouped media upload failed: ${upload.statusCode} ${upload.body}`);
    }
    preparedGroupVersions.push({ id: version.id, slot: groupSlots[index], sha256: sha, rowRevision: 1 });
  }
  const beforeGroupReviewCatalog = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
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
    surfaceOnly: true,
    selectedCandidates: preparedGroupVersions.map((version) => ({
      slot: version.slot,
      versionId: version.id,
      sha256: version.sha256,
      rowRevision: version.rowRevision,
      role: 'top',
    })),
    slotSnapshots: groupSlotSnapshotsBeforeReview.map((slot) => ({
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
      lifecycleState: slot.lifecycleState,
    })),
    acceptanceGroups: [{ groupId: 'smoke/terrain/surface-v1', requiredSlots: groupSlots }],
  };
  const groupReview = await request(
    'POST', '/api/admin/media-versions/review-batch', adminJson,
    JSON.stringify({
      items: preparedGroupVersions.map((version) => ({ id: version.id, expectedRevision: version.rowRevision })),
      approved: true,
      notes: 'All eight synthetic surface tops reviewed together at canonical 1x',
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
  const groupedCatalogResponse = await get('/api/asset-catalog');
  if (groupedCatalogResponse.statusCode !== 200) {
    throw new Error(`Completed grouped runtime catalog failed: ${groupedCatalogResponse.statusCode} ${groupedCatalogResponse.body}`);
  }
  const groupedCatalog = JSON.parse(groupedCatalogResponse.body);
  if (groupSlots.some((slot) => groupedCatalog.slots.find((item) => item.slot === slot)?.versionStatus !== 'accepted')) {
    throw new Error(`Grouped slots did not publish atomically: ${JSON.stringify(groupedCatalog.slots)}`);
  }
  const publishedSfx = groupedCatalog.slots.find((slot) => slot.slot === sfxSlot);
  if (
    publishedSfx?.versionStatus !== 'accepted'
    || publishedSfx.media.sha256 !== sfxSha
    || publishedSfx.productionEligible !== true
  ) throw new Error(`Accepted SFX did not publish through the runtime catalog: ${JSON.stringify(publishedSfx)}`);
  const acceptedFirstSlot = groupedCatalog.slots.find((item) => item.slot === groupSlots[0]);
  if (
    acceptedFirstSlot.activeVersionId !== nativeVersion.id || acceptedFirstSlot.media.sha256 !== acceptedSha
    || acceptedFirstSlot.productionEligible !== true || acceptedFirstSlot.metadata.privatePrompt !== undefined
    || acceptedFirstSlot.metadata.acceptance.groupId !== 'smoke/terrain/surface-v1'
  ) throw new Error(`Accepted Water pointer mismatch: ${JSON.stringify(acceptedFirstSlot)}`);
  const stableAccepted = await get(`/assets/${surfaceTopSlots[0]}`);
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
  const groupedAdminCatalog = JSON.parse((await get('/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000)).body);
  const archivedBridge = groupedAdminCatalog.versions.find((version) => version.id === candidateVersion.id);
  if (
    archivedBridge.status !== 'archived'
    || !groupedAdminCatalog.events.some((event) => event.action === 'accepted-batch' && event.versionId === nativeVersion.id)
  ) throw new Error(`Media replacement/audit is incomplete: ${JSON.stringify(groupedAdminCatalog)}`);

  // Structure source artwork is the typed non-terrain exception to the
  // bridge-only media rule: all eight native views, the exact interactive
  // board-placement proof, and the slot pointers publish atomically.
  const sourceArtDirections = [
    'south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east',
  ];
  const sourceArtAssetId = 'smoke-tree';
  const sourceArtSlots = sourceArtDirections
    .map((direction) => `source-art/${sourceArtAssetId}/${direction}.png`)
    .sort();
  const sourceArtVersions = [];
  for (const [index, direction] of sourceArtDirections.entries()) {
    const bytes = syntheticPng(
      512, 512, `#${(0x304050 + index * 0x020406).toString(16).padStart(6, '0')}`, '#8fd18a',
    );
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const sourceArtMetadata = {
      schema: 'structure-source-art-turntable-v1',
      assetId: sourceArtAssetId,
      structureId: 'structure-smoke-tree',
      label: 'Smoke tree art',
      sortOrder: 900,
      existing: false,
      sourceOnly: true,
      structureKind: 'landmark',
      direction,
      placementScale: 0.4,
      license: 'CC0',
      referenceOnly: true,
    };
    const create = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
      slot: `source-art/${sourceArtAssetId}/${direction}.png`,
      sourcePath: `smoke/source-art/${sourceArtAssetId}/${direction}.png`,
      domain: 'prop',
      role: 'source-art',
      label: `Smoke tree art · ${direction}`,
      availabilityPolicy: 'decorative',
      metadata: { sourceArt: sourceArtMetadata },
      slotMetadata: {
        acceptance: {
          mode: 'group',
          groupId: `source-art-eight-way:${sourceArtAssetId}`,
          requiredSlots: sourceArtSlots,
        },
        sourceArt: {
          schema: 'structure-source-art-turntable-v1',
          assetId: sourceArtAssetId,
          direction,
        },
      },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: 512,
        sourceHeight: 512,
        sourceSha256: sha256,
      },
      provenance: { generator: 'synthetic-source-art-smoke', direction },
    }), 5000);
    if (create.statusCode !== 201) {
      throw new Error(`Source-art candidate create failed: ${create.statusCode} ${create.body}`);
    }
    const version = JSON.parse(create.body).version;
    const upload = await request(
      'PUT', `/api/admin/media-versions/${version.id}/content`,
      { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, bytes, 5000,
    );
    if (upload.statusCode !== 200 || JSON.parse(upload.body).version.media.sha256 !== sha256) {
      throw new Error(`Source-art candidate upload failed: ${upload.statusCode} ${upload.body}`);
    }
    sourceArtVersions.push({
      id: version.id,
      slot: `source-art/${sourceArtAssetId}/${direction}.png`,
      sha256,
      rowRevision: 1,
    });
  }
  const sourceArtAdminBeforeReview = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const sourceArtSlotSnapshots = sourceArtSlots.map((slot) => {
    const row = sourceArtAdminBeforeReview.slots.find((item) => item.slot === slot);
    if (!row) throw new Error(`Source-art slot missing before review: ${slot}`);
    return row;
  });
  const sourceArtSurfaceUrl = `http://127.0.0.1:${port}/studio?mode=viewer&cat=sourceart&sourceArt=${sourceArtAssetId}`;
  const sourceArtProof = {
    schema: 'live-media-owner-group-proof-v1',
    canonicalScale: 1,
    surfaceKind: 'Studio Source Art interactive board placement',
    renderer: 'BoardLabBoard/SourceArtCandidateOverlay',
    decodedNativeRaster: { width: 512, height: 512, scale: 1 },
    mountedDirections: sourceArtDirections,
    placement: {
      pixelX: 400,
      pixelY: 300,
      scale: 1,
      direction: 'south',
      installedSourceScale: 0.4,
    },
    selectedCandidates: sourceArtVersions.map((version) => ({
      slot: version.slot,
      versionId: version.id,
      sha256: version.sha256,
      rowRevision: version.rowRevision,
    })),
    slotSnapshots: sourceArtSlotSnapshots.map((slot) => ({
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
      lifecycleState: slot.lifecycleState,
    })),
    acceptanceGroup: {
      groupId: `source-art-eight-way:${sourceArtAssetId}`,
      requiredSlots: sourceArtSlots,
    },
  };
  const sourceArtReview = await request(
    'POST', '/api/admin/media-versions/review-batch', adminJson,
    JSON.stringify({
      items: sourceArtVersions.map((version) => ({ id: version.id, expectedRevision: version.rowRevision })),
      approved: true,
      notes: 'All eight source-art views mounted and rotated on the interactive Studio board',
      surfaceUrl: sourceArtSurfaceUrl,
      evidence: sourceArtProof,
    }), 5000,
  );
  if (
    sourceArtReview.statusCode !== 200
    || JSON.parse(sourceArtReview.body).versions.some((version) => version.rowRevision !== 2)
  ) throw new Error(`Source-art review failed atomically: ${sourceArtReview.statusCode} ${sourceArtReview.body}`);
  const sourceArtAccept = await request(
    'POST', '/api/admin/media-versions/accept-batch', adminJson,
    JSON.stringify({
      items: sourceArtVersions.map((version) => {
        const slot = sourceArtSlotSnapshots.find((item) => item.slot === version.slot);
        return {
          id: version.id,
          expectedRevision: 2,
          expectedSlotRevision: slot.rowRevision,
          expectedActiveVersionId: slot.activeVersionId,
        };
      }),
    }), 5000,
  );
  const sourceArtAcceptBody = JSON.parse(sourceArtAccept.body);
  if (
    sourceArtAccept.statusCode !== 200 || sourceArtAcceptBody.versions.length !== 8
    || sourceArtAcceptBody.versions.some((version) => version.status !== 'accepted')
  ) throw new Error(`Source-art acceptance failed atomically: ${sourceArtAccept.statusCode} ${sourceArtAccept.body}`);
  const sourceArtPublicCatalog = JSON.parse((await get('/api/asset-catalog')).body);
  if (sourceArtSlots.some((slot) => (
    sourceArtPublicCatalog.slots.find((item) => item.slot === slot)?.versionStatus !== 'accepted'
  ))) throw new Error('Source-art slots did not publish atomically');

  // One complete pre-drawn board plate: candidate-declared native dimensions,
  // exact owner v4 alignment proof, slot/version/hash snapshots, transactional
  // CAS rollback, and stable runtime publication all use the shared lifecycle.
  const allocatedPredrawnPayload = {
    allocateSlot: 'predrawn-board', domain: 'background', role: 'media', label: 'Allocated board plate',
    availabilityPolicy: 'critical', provenance: { levelId: 'off-l-allocated-board' },
  };
  const allocatedHeaders = { ...adminJson, 'idempotency-key': 'allocated-predrawn-board-smoke' };
  const allocatedFirst = await request('POST', '/api/admin/media-versions', allocatedHeaders, JSON.stringify(allocatedPredrawnPayload), 5000);
  const allocatedReplay = await request('POST', '/api/admin/media-versions', allocatedHeaders, JSON.stringify(allocatedPredrawnPayload), 5000);
  const allocatedFirstBody = JSON.parse(allocatedFirst.body);
  const allocatedReplayBody = JSON.parse(allocatedReplay.body);
  if (
    allocatedFirst.statusCode !== 201 || allocatedReplay.statusCode !== 200
    || !/^boards\/[0-9a-f-]{36}\/plate\.png$/.test(allocatedFirstBody.version.slot)
    || allocatedReplayBody.version.id !== allocatedFirstBody.version.id
    || allocatedReplayBody.version.slot !== allocatedFirstBody.version.slot
    || allocatedReplayBody.idempotentReplay !== true
  ) throw new Error(`Backend-assigned pre-drawn slot is not stable/idempotent: ${allocatedFirst.body} ${allocatedReplay.body}`);
  const predrawnSlot = 'boards/fortress-gate/plate.png';
  const predrawnBytes = syntheticPng(1672, 941, '#263648', '#d7b878');
  const predrawnSha = crypto.createHash('sha256').update(predrawnBytes).digest('hex');
  const predrawnCreate = await request('POST', '/api/admin/media-versions', adminJson, JSON.stringify({
    slot: predrawnSlot,
    domain: 'background',
    role: 'media',
    label: 'Fortress Gate pre-drawn plate smoke candidate',
    availabilityPolicy: 'critical',
    metadata: {
      runtime: {
        component: 'predrawn-board-plate',
        variant: 'fortress-gate',
        frameWidth: 1672,
        frameHeight: 941,
        frameCount: 1,
      },
    },
    provenance: { generator: 'synthetic-predrawn-board-smoke', levelId: 'off-l-fortress-gate' },
    nativeEvidence: {
      native1x: true,
      spatialResampling: false,
      sourceWidth: 1672,
      sourceHeight: 941,
      sourceSha256: predrawnSha,
    },
  }), 5000);
  if (predrawnCreate.statusCode !== 201) {
    throw new Error(`Pre-drawn board candidate create failed: ${predrawnCreate.statusCode} ${predrawnCreate.body}`);
  }
  const predrawnVersion = JSON.parse(predrawnCreate.body).version;
  const predrawnUpload = await request(
    'PUT', `/api/admin/media-versions/${predrawnVersion.id}/content`,
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, predrawnBytes, 5000,
  );
  const predrawnUploaded = JSON.parse(predrawnUpload.body).version;
  if (
    predrawnUpload.statusCode !== 200 || predrawnUploaded.rowRevision !== 1
    || predrawnUploaded.media.sha256 !== predrawnSha
    || predrawnUploaded.media.width !== 1672 || predrawnUploaded.media.height !== 941
  ) throw new Error(`Pre-drawn board upload did not preserve exact bytes/geometry: ${predrawnUpload.statusCode} ${predrawnUpload.body}`);
  const predrawnStagedCatalog = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const predrawnSlotBeforeReview = predrawnStagedCatalog.slots.find((slot) => slot.slot === predrawnSlot);
  if (!predrawnSlotBeforeReview || predrawnSlotBeforeReview.activeVersionId !== null) {
    throw new Error(`Pre-drawn board staging slot is invalid: ${JSON.stringify(predrawnSlotBeforeReview)}`);
  }
  const predrawnSurfaceUrl = `http://127.0.0.1:${port}/editor/level?levelId=off-l-fortress-gate&document=predrawn-smoke`;
  const predrawnAlignment = 'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133';
  const predrawnProof = {
    schema: 'predrawn-board-canonical-level-proof-v1',
    surfaceUrl: predrawnSurfaceUrl,
    renderer: 'LevelEditor/PredrawnBoardLayer',
    canonicalScale: 1,
    assetLocalScale: 1,
    alignmentApplied: true,
    alignment: predrawnAlignment,
    alignmentSha256: crypto.createHash('sha256').update(predrawnAlignment, 'utf8').digest('hex'),
    deterministicProof: true,
    boardSlug: 'fortress-gate',
    levelId: 'off-l-fortress-gate',
    frameWidth: 1672,
    frameHeight: 941,
    previewSha256: predrawnSha,
    selectedCandidates: [{
      slot: predrawnSlot,
      versionId: predrawnVersion.id,
      sha256: predrawnSha,
      rowRevision: 1,
    }],
    slotSnapshots: [{
      slot: predrawnSlot,
      rowRevision: predrawnSlotBeforeReview.rowRevision,
      activeVersionId: predrawnSlotBeforeReview.activeVersionId,
      lifecycleState: predrawnSlotBeforeReview.lifecycleState,
    }],
  };
  const predrawnReview = await request(
    'POST', `/api/admin/media-versions/${predrawnVersion.id}/review`, adminJson,
    JSON.stringify({
      expectedRevision: 1,
      approved: true,
      notes: 'Exact registered plate reviewed with its owner-saved v4 alignment.',
      surfaceUrl: predrawnSurfaceUrl,
      evidence: predrawnProof,
    }), 5000,
  );
  if (predrawnReview.statusCode !== 200 || JSON.parse(predrawnReview.body).version.rowRevision !== 2) {
    throw new Error(`Pre-drawn board owner review failed: ${predrawnReview.statusCode} ${predrawnReview.body}`);
  }
  const rejectedPredrawnAccept = await request(
    'POST', `/api/admin/media-versions/${predrawnVersion.id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 2,
      expectedSlotRevision: predrawnSlotBeforeReview.rowRevision + 1,
      expectedActiveVersionId: null,
    }), 5000,
  );
  if (
    rejectedPredrawnAccept.statusCode !== 409
    || JSON.parse(rejectedPredrawnAccept.body).error !== 'media_slot_conflict'
  ) throw new Error(`Pre-drawn board stale CAS should fail atomically: ${rejectedPredrawnAccept.statusCode} ${rejectedPredrawnAccept.body}`);
  const predrawnAfterRollback = JSON.parse((await get(
    '/api/admin/media-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body);
  const rolledBackPredrawnSlot = predrawnAfterRollback.slots.find((slot) => slot.slot === predrawnSlot);
  const rolledBackPredrawnVersion = predrawnAfterRollback.versions.find((version) => version.id === predrawnVersion.id);
  if (
    rolledBackPredrawnSlot.activeVersionId !== null
    || rolledBackPredrawnSlot.rowRevision !== predrawnSlotBeforeReview.rowRevision
    || rolledBackPredrawnVersion.status !== 'candidate' || rolledBackPredrawnVersion.rowRevision !== 2
  ) throw new Error(`Pre-drawn board failed acceptance mutated catalog state: ${JSON.stringify({ rolledBackPredrawnSlot, rolledBackPredrawnVersion })}`);
  const predrawnAccept = await request(
    'POST', `/api/admin/media-versions/${predrawnVersion.id}/accept`, adminJson,
    JSON.stringify({
      expectedRevision: 2,
      expectedSlotRevision: predrawnSlotBeforeReview.rowRevision,
      expectedActiveVersionId: null,
    }), 5000,
  );
  if (
    predrawnAccept.statusCode !== 200 || JSON.parse(predrawnAccept.body).version.status !== 'accepted'
  ) throw new Error(`Pre-drawn board acceptance failed: ${predrawnAccept.statusCode} ${predrawnAccept.body}`);
  const predrawnPublicCatalog = JSON.parse((await get('/api/asset-catalog')).body);
  const acceptedPredrawn = predrawnPublicCatalog.slots.find((slot) => slot.slot === predrawnSlot);
  if (
    acceptedPredrawn?.versionStatus !== 'accepted' || acceptedPredrawn.media.sha256 !== predrawnSha
    || acceptedPredrawn.media.width !== 1672 || acceptedPredrawn.media.height !== 941
    || acceptedPredrawn.versionMetadata.runtime.frameWidth !== 1672
    || acceptedPredrawn.versionMetadata.runtime.frameHeight !== 941
  ) throw new Error(`Accepted pre-drawn board projection is invalid: ${JSON.stringify(acceptedPredrawn)}`);
  const stablePredrawn = await get(`/assets/${predrawnSlot}`);
  if (stablePredrawn.statusCode !== 302 || stablePredrawn.headers.location !== `/api/media/${predrawnSha}`) {
    throw new Error(`Stable pre-drawn board slot did not resolve exact accepted bytes: ${stablePredrawn.statusCode}`);
  }

  const groupedSlotRows = groupSlots.map((slot) => groupedAdminCatalog.slots.find((item) => item.slot === slot));
  const slotContractUpdate = await request(
    'PATCH', `/api/admin/media-slots/${surfaceTopSlots[0]}`, adminJson,
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
  const retirementConsumerInput = {
    kind: 'smoke-fixture',
    label: 'Media retirement consumer',
    sortOrder: 0,
    lifecycleState: 'active',
    behavior: {},
    metadata: {},
    media: { preview: groupSlots[0] },
  };
  const retirementConsumer = await request(
    'PUT', '/api/admin/drawable-assets/smoke-retirement-consumer',
    { ...adminJson, 'if-match': '"0"' }, JSON.stringify(retirementConsumerInput), 5000,
  );
  if (
    retirementConsumer.statusCode !== 200
    || JSON.parse(retirementConsumer.body).asset.rowRevision !== 1
  ) throw new Error(`Disposable retirement consumer creation failed: ${retirementConsumer.statusCode} ${retirementConsumer.body}`);
  const blockedGroupRetirement = await request(
    'POST', '/api/admin/media-slots/retire-batch', adminJson,
    JSON.stringify({
      items: groupedSlotRows.map((slot) => ({ slot: slot.slot, expectedRevision: slot.rowRevision })),
      reason: 'Prove active drawable consumers block slot retirement',
      evidence: { ownerConfirmed: true, fixture: 'live-media-smoke', groupId: 'smoke/terrain/surface-v1' },
      confirmCriticalRetirement: true,
    }), 5000,
  );
  const blockedGroupRetirementBody = JSON.parse(blockedGroupRetirement.body);
  if (
    blockedGroupRetirement.statusCode !== 409
    || blockedGroupRetirementBody.error !== 'media_slot_in_use'
    || blockedGroupRetirementBody.details?.dependencies?.length !== 1
    || blockedGroupRetirementBody.details.dependencies[0].assetId !== 'smoke-retirement-consumer'
    || blockedGroupRetirementBody.details.dependencies[0].role !== 'preview'
    || blockedGroupRetirementBody.details.dependencies[0].slot !== groupSlots[0]
  ) throw new Error(`Active drawable dependency should block media retirement: ${blockedGroupRetirement.statusCode} ${blockedGroupRetirement.body}`);
  const retiredConsumer = await request(
    'PUT', '/api/admin/drawable-assets/smoke-retirement-consumer',
    { ...adminJson, 'if-match': '"1"' },
    JSON.stringify({ ...retirementConsumerInput, lifecycleState: 'retired' }), 5000,
  );
  if (
    retiredConsumer.statusCode !== 200
    || JSON.parse(retiredConsumer.body).asset.lifecycleState !== 'retired'
  ) throw new Error(`Disposable retirement consumer retirement failed: ${retiredConsumer.statusCode} ${retiredConsumer.body}`);
  const groupRetirement = await request(
    'POST', '/api/admin/media-slots/retire-batch', adminJson,
    JSON.stringify({
      items: groupedSlotRows.map((slot) => ({ slot: slot.slot, expectedRevision: slot.rowRevision })),
      reason: 'Retire the complete disposable smoke group',
      evidence: { ownerConfirmed: true, fixture: 'live-media-smoke', groupId: 'smoke/terrain/surface-v1' },
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
  if ((await get(`/api/admin/media/${retiredGroupSha}`, { cookie: '__Host-chess-tactics-access=abc' }, 5000)).statusCode !== 200) {
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
    // Deliberately opaque: neither the installed terrain identity nor variant id
    // can be inferred from this slot. Typed version metadata and the later
    // drawable media-role assignment are the only authorities.
    const slot = `opaque/ground-cover-smoke/${index}.sheet`;
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
      { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' }, bytes, 5000,
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
    schemaVersion: 2,
    soundSets: {
      grass: { label: 'Grass', character: 'Synthetic dry step', build: 'Synthetic smoke recording', gain: 0.5 },
      arrival: { label: 'Arrival', character: 'Synthetic deploy thump', build: 'Synthetic smoke recording', gain: 0.6 },
      click: { label: 'Click', character: 'Synthetic interface tap', build: 'Synthetic smoke recording', gain: 0.5 },
    },
    terrainAssignments: {
      grass: 'grass', water: null, sand: null, stone: null,
      road: null, bridge: null, dirt: null, pebble: null,
    },
    interfaceAssignments: { activate: 'click', card: null, gold: null },
    arrival: { sample: 'arrival', gain: 0.55, firing: 'per-unit' },
  };
  const anonymousSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', { 'content-type': 'application/json' },
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: null, clientSchemaVersion: 2 }), 5000,
  );
  if (anonymousSfxWrite.statusCode !== 401) throw new Error(`Anonymous SFX profile write should be 401: ${anonymousSfxWrite.statusCode}`);
  const invalidSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({
      data: { ...syntheticSfxProfile, terrainAssignments: { grass: 'missing' } },
      expectedRevision: null,
      clientSchemaVersion: 2,
    }), 5000,
  );
  if (invalidSfxWrite.statusCode !== 400 || JSON.parse(invalidSfxWrite.body).error !== 'invalid_sfx_profile') {
    throw new Error(`Incomplete SFX profile should be rejected: ${invalidSfxWrite.statusCode} ${invalidSfxWrite.body}`);
  }
  const createdSfxProfile = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: null, clientSchemaVersion: 2 }), 5000,
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
    // The cue mapping is what the running app reads to decide a sound, so it must survive
    // the write/read round trip like any other assignment — including an explicit silence.
    || JSON.parse(publicSfxProfile.body).profile.data.interfaceAssignments.activate !== 'click'
    || JSON.parse(publicSfxProfile.body).profile.data.interfaceAssignments.card !== null
  ) throw new Error(`Public SFX profile read failed: ${publicSfxProfile.statusCode} ${publicSfxProfile.body}`);
  const undeclaredCueWrite = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({
      data: { ...syntheticSfxProfile, interfaceAssignments: { activate: 'missing', card: null, gold: null } },
      expectedRevision: 0,
      clientSchemaVersion: 2,
    }), 5000,
  );
  if (undeclaredCueWrite.statusCode !== 400 || JSON.parse(undeclaredCueWrite.body).error !== 'invalid_sfx_profile') {
    throw new Error(`Undeclared cue sound set should be rejected: ${undeclaredCueWrite.statusCode} ${undeclaredCueWrite.body}`);
  }
  const staleSfxWrite = await request(
    'PUT', '/api/sfx-profiles/default', adminJson,
    JSON.stringify({ data: syntheticSfxProfile, expectedRevision: 9, clientSchemaVersion: 2 }), 5000,
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
      clientSchemaVersion: 2,
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
    { 'content-type': 'image/png', 'if-match': '"0"', cookie: '__Host-chess-tactics-access=abc' },
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
  const adminAfterArchive = await get('/api/admin/unit-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000);
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
  const readinessStructures = [
    ['oak', 'tree', ['grass', 'dirt'], 96, 255, 1, { w: 2, h: 2 }],
    ['cottage', 'house', ['grass', 'dirt', 'stone'], 91, 110, 0.62, { w: 2, h: 2 }],
    ['cabin', 'house', ['grass', 'dirt', 'stone'], 118, 107, 0.35, { w: 1, h: 1 }],
    ['lodge', 'house', ['grass', 'dirt', 'stone'], 103, 126, 1, { w: 2, h: 2 }],
    ['rock', 'rock', ['grass', 'dirt', 'stone', 'pebble', 'sand'], 20, 44, 1, { w: 1, h: 1 }],
    ['fieldstone', 'rock', ['grass', 'dirt', 'stone', 'pebble', 'sand'], 25, 46, 1, { w: 1, h: 1 }],
  ];
  for (const [index, [id, structureKind, terrains, anchorX, anchorY, scale, footprint]] of readinessStructures.entries()) {
    await seedSyntheticDrawable({
      id: `structure-${id}`, kind: 'structure', label: `Synthetic ${id}`, sortOrder: index,
      behavior: {
        value: id, structureKind, terrains, anchorX, anchorY, scale, footprint, blocking: true,
        splitMode: id === 'oak' ? 'authored' : 'flat-contact',
      },
      media: { back: `props/${id}/back.png`, front: `props/${id}/front.png` },
    });
  }
  for (const [index, terrain] of ['grass', 'water', 'sand'].entries()) {
    await seedSyntheticDrawable({
      id: `ground-cover-${terrain}`, kind: 'ground-cover', label: `Synthetic ${terrain}`, sortOrder: index,
      behavior: {
        terrain,
        variants: [{ role: 'v0', terrain, id: 0, frameWidth: 40, frameHeight: 37, frameCount: 6, baseX: 20, baseY: 28, contentWidth: 18 }],
        edgeOnly: terrain === 'water',
        count: { sparse: 2, filled: 3 },
      },
      media: { v0: groundCoverFixtures.find((fixture) => fixture.metadata.runtime.groundCover.terrain === terrain).slot },
    });
  }
  for (const [role, [width, height]] of Object.entries({ base: [72, 96], west: [26, 84], north: [26, 84] })) {
    await seedSyntheticReadinessMedia({
      slot: `wall-decor/test-banner-${role}.png`, domain: 'wall-decor', role, width, height,
    });
  }
  await seedSyntheticDrawable({
    id: 'test-banner-source', kind: 'wall-decor', label: 'Synthetic banner source',
    behavior: {
      decorKind: 'banner', mountX: 36, mountY: 10, default: true,
      faces: {
        west: { mountX: 13, mountY: 10, previewX: 42, previewY: 24 },
        north: { mountX: 13, mountY: 11, previewX: 84, previewY: 24 },
      },
    },
    media: {
      base: 'wall-decor/test-banner-base.png',
      west: 'wall-decor/test-banner-west.png',
      north: 'wall-decor/test-banner-north.png',
    },
  });
  await seedSyntheticDrawable({
    id: 'test-wall-art', kind: 'wall-art', label: 'Synthetic wall art',
    behavior: {
      span: 1, default: true,
      slots: [{ id: 'test-west', sourceId: 'test-banner-source', face: 'west', x: 42, y: 24, scale: 1 }],
    },
    media: {},
  });
  const sharedPresentationSlot = 'wall-decor/test-banner-base.png';
  const royalTentLipsanonSlot = 'ui/run/lipsana/royal-tent.png';
  await seedSyntheticReadinessMedia({
    slot: royalTentLipsanonSlot,
    domain: 'ui-kit',
    role: 'icon',
    width: 64,
    height: 64,
  });
  await seedSyntheticDrawable({
    id: 'run-lipsanon-royal-tent',
    kind: 'run-lipsanon',
    label: 'Royal Tent',
    behavior: { lipsanonId: 'royal-tent' },
    metadata: { artFamily: 'synthetic-run-lipsanon-icons' },
    media: { icon: royalTentLipsanonSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-subterrain-opaque', kind: 'subterrain', label: 'Synthetic Subterrain',
    behavior: { default: true }, media: { surface: sharedPresentationSlot },
  });
  for (const [sortOrder, [kind, id, value, roles]] of [
    ['road-material', 'test-road-material', 'test-road', [...Array.from({ length: 16 }, (_, index) => `frame-${index}`), 'thumb']],
    ['river-material', 'test-river-material', 'test-river', [...Array.from({ length: 16 }, (_, index) => `frame-${index}`), 'thumb']],
    ['fence-material', 'test-fence-material', 'test-fence', ['frame-2', 'frame-4', 'frame-6', 'thumb', 'post', 'post-thumb']],
    ['wall-material', 'test-wall-material', 'test-wall', ['frame-1', 'frame-8', 'frame-9', 'thumb']],
  ].entries()) {
    await seedSyntheticDrawable({
      id, kind, label: `Synthetic ${value}`, sortOrder,
      behavior: { value, default: true },
      media: Object.fromEntries(roles.map((role) => [role, sharedPresentationSlot])),
    });
  }
  await seedSyntheticDrawable({
    id: 'structure-test-doodad', kind: 'structure', label: 'Synthetic doodad', sortOrder: readinessStructures.length,
    behavior: {
      value: 'test-doodad', structureKind: 'doodad', propKind: 'rock', terrains: ['grass'],
      anchorX: 36, anchorY: 80, scale: 1, blocking: false, splitMode: 'authored', default: true,
    },
    media: { back: sharedPresentationSlot, front: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-ui-surface', kind: 'ui-surface', label: 'Synthetic UI surface',
    behavior: { value: 'test-surface', approach: 'synthetic', material: 'stone', tilePx: 96, default: true },
    media: { surface: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-ui-slider', kind: 'ui-slider', label: 'Synthetic UI slider',
    behavior: {
      value: 'test-slider', approach: 'css', material: 'stone', fill: '#aaa', channel: '#222',
      edge: '#444', handle: '#888', handleLight: '#ccc', handleDark: '#111', preferred: true,
    },
    metadata: { description: 'Synthetic smoke slider' }, media: {},
  });
  for (const [sortOrder, family] of ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'].entries()) {
    await seedSyntheticDrawable({
      id: `terrain-family-${family}`, kind: 'terrain-family', label: `Synthetic ${family}`, sortOrder,
      behavior: {
        value: family,
        gameplayTerrain: family,
        rendersGameplayTerrains: family === 'stone' ? ['stone', 'road', 'bridge', 'cliff', 'rock'] : [family],
        roles: ['level-editor-scatter',
          ...(['grass', 'dirt', 'stone'].includes(family) ? ['prop-seat-preview', 'wall-art-preview'] : []),
          ...(['grass', 'stone', 'water'].includes(family) ? ['unit-art-preview'] : []),
          ...(family === 'grass' ? ['prop-seat-preview-default', 'unit-art-preview-default'] : []),
          ...(family === 'stone' ? ['wall-art-preview-default'] : [])],
        ...(family === 'grass' ? { default: true, scatterDefaultShare: 60, defaultGroundCoverId: 'grass' } : {}),
        ...(family === 'stone' ? { scatterDefaultShare: 40 } : {}),
        ...(['sand', 'water'].includes(family) ? { defaultGroundCoverId: family } : {}),
      }, media: {},
    });
  }
  for (const [sortOrder, family] of ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'].entries()) {
    await seedSyntheticDrawable({
      id: `test-surface-${family}`, kind: 'terrain-surface', label: `Synthetic ${family} surface`, sortOrder,
      behavior: { family, role: 'base', probability: 1 }, metadata: { familyLabel: family },
      media: { top: sharedPresentationSlot, source: sharedPresentationSlot },
    });
  }
  await seedSyntheticDrawable({
    id: 'test-terrain-review', kind: 'terrain-review', label: 'Synthetic terrain review',
    behavior: { family: 'grass', role: 'variant' }, media: { preview: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-terrain-comparison', kind: 'terrain-comparison', label: 'Synthetic terrain comparison',
    behavior: { family: 'grass', variant: 0, default: true }, media: { raw: sharedPresentationSlot, processed: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-background-set', kind: 'background-set', label: 'Synthetic background set',
    behavior: { default: true },
    media: Object.fromEntries(['world', ...['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].map((piece) => `portrait-${piece}`)]
      .map((role) => [role, sharedPresentationSlot])),
  });
  await seedSyntheticDrawable({
    id: 'test-homepage-scene', kind: 'animated-scene', label: 'Synthetic homepage scene',
    behavior: { roles: ['homepage-scene'], width: 320, height: 180 }, media: { background: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-waterfall', kind: 'scene-animation', label: 'Synthetic waterfall',
    behavior: { default: true, sceneRole: 'homepage-scene', x: 10, y: 20, width: 40, height: 50, frames: 12, frameMs: 140 },
    media: { sheet: sharedPresentationSlot },
  });
  for (const [sortOrder, piece] of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].entries()) {
    await seedSyntheticDrawable({
      id: `test-portrait-${piece}`, kind: 'unit-portrait', label: `Synthetic ${piece} portraits`, sortOrder,
      behavior: { piece },
      media: Object.fromEntries(['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white']
        .map((palette) => [palette, sharedPresentationSlot])),
    });
    await seedSyntheticDrawable({
      id: `test-portrait-treatment-${piece}`, kind: 'portrait-treatment', label: `Synthetic ${piece} treatment`, sortOrder,
      behavior: { piece, method: 'test-treatment', defaultPalette: 'navy-blue', default: true },
      metadata: { methodLabel: 'Test treatment', methodDescription: 'Synthetic portrait treatment' },
      media: Object.fromEntries(['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white']
        .map((palette) => [palette, sharedPresentationSlot])),
    });
  }
  for (const [sortOrder, id] of ['test-neutral-stone-a', 'test-neutral-stone-b'].entries()) {
    await seedSyntheticDrawable({
      id, kind: 'neutral-unit-art', label: `Synthetic neutral stone ${sortOrder + 1}`, sortOrder,
      behavior: {},
      media: Object.fromEntries(['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']
        .map((direction) => [direction, sharedPresentationSlot])),
    });
  }
  const appUiRoles = [
    'og-default',
    'ui-main-menu-background-scene-v1-avif',
    'ui-kit-icons-brand-shield-png',
    'ui-surfaces-baseline-stone-blue-avif',
    'ui-surfaces-hybrid-wood-oak-png',
    'ui-kit-icons-gear-png',
    'ui-kit-icons-speaker-png',
    'ui-kit-icons-knight-png',
    'ui-kit-icons-wrench-png',
  ];
  await seedSyntheticDrawable({
    id: 'app-ui', kind: 'app-ui', label: 'Synthetic application UI',
    behavior: { roles: ['application-ui'], requiredRoles: appUiRoles },
    media: Object.fromEntries(appUiRoles.map((role) => [role, sharedPresentationSlot])),
  });
  await seedSyntheticDrawable({
    id: 'test-app-font', kind: 'app-font', label: 'Synthetic application font',
    behavior: { family: 'Synthetic UI', style: 'normal', weight: 400, display: 'swap', format: 'woff2' },
    media: { font: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'test-ui-scrollbar', kind: 'ui-scrollbar', label: 'Synthetic UI scrollbar',
    behavior: { previewKind: 'sprite', roles: ['installed-scrollbar'] }, media: { preview: sharedPresentationSlot },
  });
  for (const [sortOrder, value] of ['primary', 'neutral', 'danger', 'panel', 'row', 'field-input'].entries()) {
    await seedSyntheticDrawable({ id: `ui-kit-frame-${value}`, kind: 'ui-kit-frame', label: `Synthetic ${value}`, sortOrder,
      behavior: { value }, media: { frame: sharedPresentationSlot } });
  }
  for (const [sortOrder, [value, label, route, viewerStatus]] of [
    ['main-menu', 'Main Menu', '/', 'functional'], ['settings', 'Settings', '/settings', 'functional'], ['skirmish', 'Skirmish', '/play', 'stub'],
    ['campaign-editor', 'Editor', '/editor', 'functional'], ['level-editor', 'Level Editor', '/editor/level', 'stub'], ['lobbies', 'Lobbies', '/lobbies', 'stub'],
  ].entries()) {
    await seedSyntheticDrawable({ id: `studio-page-${value}`, kind: 'studio-page', label, sortOrder,
      behavior: { value, route, viewerStatus, default: value === 'main-menu', ...(value === 'level-editor' ? { roles: ['chrome-lab-page'], chromeLabRoute: '/editor/level?chromeLab=1' } : {}) },
      metadata: { blurb: `Synthetic ${label}`, ...(value === 'level-editor' ? { chromeLabBadge: 'outer + inner chrome' } : {}) }, media: { thumbnail: sharedPresentationSlot } });
  }
  for (const [sortOrder, [value, label, route]] of [
    ['play', 'Play', '/play/select'], ['campaign-editor', 'Editor', '/editor'], ['lobbies', 'Lobbies', '/lobbies'], ['settings', 'Settings', '/settings'],
  ].entries()) {
    await seedSyntheticDrawable({ id: `menu-mode-${value}`, kind: 'menu-mode', label, sortOrder,
      behavior: { value, route, ...(value === 'settings' ? { roles: ['settings'] } : {}) }, media: { icon: sharedPresentationSlot } });
  }
  const wallArtBatchRollback = await request(
    'PUT', '/api/admin/drawable-assets', adminJson,
    JSON.stringify({ assets: [
      {
        id: 'test-wall-art', kind: 'wall-art', label: 'Must roll back', sortOrder: 0,
        lifecycleState: 'active', behavior: {
          span: 1,
          slots: [{ id: 'test-west', sourceId: 'test-banner-source', face: 'west', x: 42, y: 24, scale: 1 }],
        }, metadata: {}, media: {}, expectedRevision: 1,
      },
      {
        id: 'test-missing-wall-art', kind: 'wall-art', label: 'Missing conflict row', sortOrder: 1,
        lifecycleState: 'active', behavior: { span: 1, slots: [] }, metadata: {}, media: {}, expectedRevision: 1,
      },
    ] }), 5000,
  );
  if (
    wallArtBatchRollback.statusCode !== 404
    || JSON.parse(wallArtBatchRollback.body).error !== 'drawable_asset_not_found'
  ) throw new Error(`Drawable batch conflict should fail atomically: ${wallArtBatchRollback.statusCode} ${wallArtBatchRollback.body}`);
  const drawableAfterRollback = JSON.parse((await get(
    '/api/admin/drawable-assets', { cookie: '__Host-chess-tactics-access=abc' }, 5000,
  )).body).assets.find((asset) => asset.id === 'test-wall-art');
  if (drawableAfterRollback?.label !== 'Synthetic wall art' || drawableAfterRollback?.rowRevision !== 1) {
    throw new Error(`Drawable batch conflict did not roll back: ${JSON.stringify(drawableAfterRollback)}`);
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
  await seedSyntheticDrawable({
    id: 'installed-chrome', kind: 'chrome-family', label: 'Synthetic installed Chrome',
    behavior: { roles: ['installed-chrome'],
      outer: { atomSourceId: 'ui/chrome/outer/atom.png', railSourceId: 'ui/chrome/outer/rail.png', atomTurns: 0, atomSize: 41, railThickness: 24, atomX: 0, atomY: 0, atomLeftX: 0, atomRightX: 0, atomTopY: 0, atomBottomY: 0, railUnderlap: 14, railFit: 'stretch', fillMode: 'surface', fillTintId: 'blue', fillSurfaceId: 'baseline-stone-blue', fillSurfaceScale: 768, fillBoxLeft: 0, fillBoxRight: 0, fillBoxTop: 0, fillBoxBottom: 0, contentPadding: 31, fillAlpha: 0 },
      inner: { atomSourceId: 'ui/chrome/inner/atom.png', railSourceId: 'ui/chrome/inner/rail.png', atomTurns: 1, atomSize: 11, railThickness: 7, atomX: 0, atomY: 0, atomLeftX: 0, atomRightX: 0, atomTopY: 0, atomBottomY: 0, railUnderlap: 8, railFit: 'tile', fillMode: 'tint', fillTintId: 'night', fillSurfaceId: 'hybrid-stone-blue', fillSurfaceScale: 384, fillBoxLeft: 0, fillBoxRight: 0, fillBoxTop: 0, fillBoxBottom: 0, contentPadding: 0, fillAlpha: 0.82 },
      dividers: {
        outer: { atomSourceId: 'ui/chrome/divider/joint.png', atomTurns: 0, atomSize: 32, bandHeight: 34, atomX: 0, atomY: 0, atomLeftX: 0, atomRightX: 0, atomLeftY: 0, atomRightY: 0 },
        inner: { atomSourceId: 'ui/chrome/divider/joint.png', atomTurns: 0, atomSize: 11, bandHeight: 7, atomX: 0, atomY: 0, atomLeftX: 0, atomRightX: 0, atomLeftY: 0, atomRightY: 0 },
      },
    },
    media: { 'outer-atom': 'ui/chrome/outer/atom.png', 'outer-rail': 'ui/chrome/outer/rail.png', 'inner-atom': 'ui/chrome/inner/atom.png', 'inner-rail': 'ui/chrome/inner/rail.png', 'divider-joint': 'ui/chrome/divider/joint.png' },
  });
  await seedSyntheticDrawable({
    id: 'test-artwork-reference', kind: 'artwork-reference', label: 'Synthetic artwork reference',
    behavior: { route: '/' }, media: { concept: sharedPresentationSlot },
  });
  const testNineSliceGeometry = { coolCorners: { tl: { dx: 0, dy: 0 }, tr: { dx: 0, dy: 0 }, bl: { dx: 0, dy: 0 }, br: { dx: 0, dy: 0 } }, pipes: { top: 0, bottom: 0, left: 0, right: 0 }, frameScale: 1, brackets: { tl: { dx: 0, dy: 0 }, tr: { dx: 0, dy: 0 }, bl: { dx: 0, dy: 0 }, br: { dx: 0, dy: 0 } }, bracketScale: 1, content: 8, fill: 4 };
  for (const [sortOrder, id] of ['panel', 'mode-button'].entries()) await seedSyntheticDrawable({
    id, kind: 'nine-slice', label: `Synthetic ${id}`, sortOrder,
    behavior: { kind: 'frame', roles: id === 'mode-button' ? ['frame-editor-default', 'settings-tab'] : ['settings-panel'], frame: { w: 96, h: 96 }, geometry: testNineSliceGeometry },
    media: { corner: sharedPresentationSlot, edge: sharedPresentationSlot, fill: sharedPresentationSlot, target: sharedPresentationSlot },
  });
  await seedSyntheticDrawable({
    id: 'panel-divider', kind: 'nine-slice', label: 'Synthetic divider', sortOrder: 2,
    behavior: { kind: 'bar', roles: ['divider-editor-default'], frame: { w: 96, h: 24 }, railSource: 'edge', railFit: 'tile', geometry: { frameWidth: 16, reach: 14, dividerH: 34, scale: 1, count: 3, backing: 'fill', jx: 0, jy: 0 } },
    media: { edge: sharedPresentationSlot, tee: sharedPresentationSlot, 'panel-line': sharedPresentationSlot, 'host-frame': sharedPresentationSlot, 'host-line': sharedPresentationSlot },
  });

  const completeReadiness = await get('/ready', {}, 5000);
  const completeReadinessBody = JSON.parse(completeReadiness.body);
  if (
    completeReadiness.statusCode !== 200 || completeReadinessBody.status !== 'ready'
    || !Number.isInteger(completeReadinessBody.catalogRevision)
    || !Number.isInteger(completeReadinessBody.drawableCatalogRevision)
    || completeReadinessBody.propSeatsRevision !== 1
    || !Number.isInteger(completeReadinessBody.unitCatalogRevision)
  ) throw new Error(
    `Complete renderer snapshot was not ready: ${completeReadiness.statusCode} ${completeReadiness.body}\n`
    + `Recent backend output:\n${output.slice(-4000)}`,
  );

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

  // BGM is publicly discoverable through the app contract, but the playlist
  // contains only opaque same-origin routes. A current route mints one bounded
  // capability and the private-object stand-in serves the requested byte range.
  const bgm = await get('/api/bgm');
  const bgmBody = JSON.parse(bgm.body);
  if (
    bgm.statusCode !== 200 ||
    !Array.isArray(bgmBody.tracks) ||
    bgmBody.tracks.length !== 2 ||
    bgmBody.tracks[0].title !== 'Alpha' ||
    !/^[a-f0-9]{64}$/.test(bgmBody.tracks[0].id) ||
    bgmBody.tracks[0].url !== `/api/bgm/tracks/${bgmBody.tracks[0].id}` ||
    /blob\.core\.windows\.net|\.mp3|[?&](sig|sp|se)=|smoke-only-bgm-signing-secret/i.test(bgm.body)
  ) {
    throw new Error(`Unexpected /api/bgm response: ${bgm.statusCode} ${bgm.body}`);
  }
  const bgmRedirect = await get(bgmBody.tracks[0].url, { range: 'bytes=2-6' });
  if (
    bgmRedirect.statusCode !== 302
    || !String(bgmRedirect.headers.location || '').startsWith(`http://127.0.0.1:${bgmPort}/alpha.mp3?`)
    || bgmRedirect.headers['cache-control'] !== 'no-store'
    || bgmRedirect.body.includes('sig=')
  ) {
    throw new Error(`Unexpected BGM capability response: ${bgmRedirect.statusCode} ${bgmRedirect.body}`);
  }
  const capabilityUrl = new URL(bgmRedirect.headers.location);
  const bgmRange = await requestOnPort(
    bgmPort,
    'GET',
    `${capabilityUrl.pathname}${capabilityUrl.search}`,
    { range: 'bytes=2-6' },
  );
  if (
    bgmRange.statusCode !== 206
    || bgmRange.body !== 'pha-a'
    || bgmRange.headers['content-range'] !== `bytes 2-6/${bgmFixtureBytes.get('alpha.mp3').length}`
  ) {
    throw new Error(`BGM range delivery failed: ${bgmRange.statusCode} ${bgmRange.body}`);
  }
  const bgmHead = await request('HEAD', bgmBody.tracks[0].url);
  if (bgmHead.statusCode !== 302 || bgmHead.body || bgmHead.headers['cache-control'] !== 'no-store') {
    throw new Error(`BGM HEAD capability failed: ${bgmHead.statusCode} ${bgmHead.body}`);
  }
  const malformedBgm = await get('/api/bgm/tracks/alpha.mp3');
  const unknownBgm = await get(`/api/bgm/tracks/${'f'.repeat(64)}`);
  if (
    malformedBgm.statusCode !== 404
    || unknownBgm.statusCode !== 404
    || malformedBgm.body !== unknownBgm.body
  ) {
    throw new Error(`Unknown BGM routes should be presence-free 404s: ${malformedBgm.statusCode}/${unknownBgm.statusCode}`);
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
        formatVersion: boardRender.LEVEL_FORMAT_VERSION, id: 'off-l-test', name: 'Test Level', notes: '',
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
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspace }),
  );
  if (nonAdminOfficialWrite.statusCode !== 403) {
    throw new Error(`Non-admin official write should be forbidden: ${nonAdminOfficialWrite.statusCode} ${nonAdminOfficialWrite.body}`);
  }

  const anonymousPlaytestAuthorization = await request(
    'POST', '/api/admin/playtest/authorize',
    { 'content-type': 'application/json' },
    JSON.stringify({ action: 'free-move' }),
  );
  if (anonymousPlaytestAuthorization.statusCode !== 401) {
    throw new Error(`Anonymous playtest authorization should require sign-in: ${anonymousPlaytestAuthorization.statusCode} ${anonymousPlaytestAuthorization.body}`);
  }
  const nonAdminPlaytestAuthorization = await request(
    'POST', '/api/admin/playtest/authorize',
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ action: 'kill-unit' }),
  );
  if (nonAdminPlaytestAuthorization.statusCode !== 403) {
    throw new Error(`Non-admin playtest authorization should be forbidden: ${nonAdminPlaytestAuthorization.statusCode} ${nonAdminPlaytestAuthorization.body}`);
  }
  const adminPlaytestAuthorization = await request(
    'POST', '/api/admin/playtest/authorize',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ action: 'gain-gold', amountTenths: 25 }),
  );
  const adminPlaytestAuthorizationBody = JSON.parse(adminPlaytestAuthorization.body);
  if (
    adminPlaytestAuthorization.statusCode !== 200
    || adminPlaytestAuthorizationBody.ok !== true
    || adminPlaytestAuthorizationBody.action !== 'gain-gold'
  ) {
    throw new Error(`Unexpected admin playtest authorization: ${adminPlaytestAuthorization.statusCode} ${adminPlaytestAuthorization.body}`);
  }

  const invalidOfficialId = await get('/api/official-campaigns/Bad%20ID');
  if (invalidOfficialId.statusCode !== 400) {
    throw new Error(`Invalid official campaign id should fail: ${invalidOfficialId.statusCode} ${invalidOfficialId.body}`);
  }

  const adminOfficialWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    officialPlay.body.includes('/api/media/')
  ) {
    throw new Error(`Official play page should advertise the level thumbnail: ${officialPlay.statusCode}`);
  }
  const lipsanonReference = await get('/enchiridion/lipsana/royal-tent');
  const lipsanonImageMatch = lipsanonReference.body.match(
    /<meta property="og:image" content="[^"]+(\/api\/media\/[0-9a-f]{64})">/,
  );
  if (
    lipsanonReference.statusCode !== 200
    || !lipsanonReference.body.includes('<title>Royal Tent</title>')
    || !lipsanonReference.body.includes('<meta property="og:title" content="Royal Tent">')
    || !lipsanonReference.body.includes('<meta property="og:description" content="Place up to three temporary rocks in front of the King.">')
    || !lipsanonReference.body.includes('<meta property="og:image:width" content="64">')
    || !lipsanonReference.body.includes('<meta property="og:image:height" content="64">')
    || !lipsanonReference.body.includes('<meta name="twitter:card" content="summary">')
    || !lipsanonImageMatch
  ) {
    throw new Error(`Lipsanon reference should advertise its icon and complete effect: ${lipsanonReference.statusCode}`);
  }
  const lipsanonImage = await get(lipsanonImageMatch[1], undefined, 5000);
  if (lipsanonImage.statusCode !== 200 || lipsanonImage.headers['content-type'] !== 'image/png') {
    throw new Error(`Lipsanon unfurl icon should be anonymously readable live media: ${lipsanonImage.statusCode}`);
  }
  const unknownLipsanonReference = await get('/enchiridion/lipsana/constructor');
  if (
    unknownLipsanonReference.statusCode !== 200
    || !unknownLipsanonReference.body.includes('<meta property="og:title" content="Chess Tactics">')
    || unknownLipsanonReference.body.includes('temporary rocks in front of the King')
  ) {
    throw new Error(`Unknown lipsanon ids should retain the generic unfurl: ${unknownLipsanonReference.statusCode}`);
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: { campaigns: [{ formatVersion: 1, id: 'c1', name: 'Bad', difficulty: 'normal', chapters: 1, levels: [] }], levels: {} }, revision: 1 }),
  );
  if (nonOffIdWrite.statusCode !== 400 || JSON.parse(nonOffIdWrite.body).error !== 'invalid_official_ids') {
    throw new Error(`Non-off-prefixed official ids should be rejected: ${nonOffIdWrite.statusCode} ${nonOffIdWrite.body}`);
  }

  // Digits inside an off- id are also rejected (must stay digit-free).
  const digitOffIdWrite = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc }),
  );
  if (blindPropSeatsWrite.statusCode !== 400 || JSON.parse(blindPropSeatsWrite.body).error !== 'invalid_prop_seats_write') {
    throw new Error(`Blind prop-seat write should be rejected: ${blindPropSeatsWrite.statusCode} ${blindPropSeatsWrite.body}`);
  }

  const stalePropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: 2 }),
  );
  if (sequentialPropSeatsWrite.statusCode !== 200 || JSON.parse(sequentialPropSeatsWrite.body).portfolio.revision !== 3) {
    throw new Error(`Sequential prop-seat write did not advance its revision: ${sequentialPropSeatsWrite.statusCode} ${sequentialPropSeatsWrite.body}`);
  }

  const createdPropSeats = await request(
    'PUT', '/api/prop-seats/cas-create',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: null }),
  );
  if (createdPropSeats.statusCode !== 201 || JSON.parse(createdPropSeats.body).portfolio.revision !== 1) {
    throw new Error(`Null-token prop-seat create failed: ${createdPropSeats.statusCode} ${createdPropSeats.body}`);
  }
  const duplicatePropSeatsCreate = await request(
    'PUT', '/api/prop-seats/cas-create',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      data: { ...propSeatsDoc, 'ghost-house': { base: 'missing', anchorX: 1, anchorY: 1, scale: 1 } },
      expectedRevision: 3,
    }),
  );
  if (orphanVariantWrite.statusCode !== 400 || JSON.parse(orphanVariantWrite.body).error !== 'invalid_prop_seats') {
    throw new Error(`Orphan prop-seat variant should be rejected: ${orphanVariantWrite.statusCode} ${orphanVariantWrite.body}`);
  }

  const reducedPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: { oak: propSeatsDoc.oak }, expectedRevision: 3 }),
  );
  if (reducedPropSeatsWrite.statusCode !== 200 || JSON.parse(reducedPropSeatsWrite.body).portfolio.revision !== 4) {
    throw new Error(`DB-defined reduced prop-seat roster should be accepted: ${reducedPropSeatsWrite.statusCode} ${reducedPropSeatsWrite.body}`);
  }
  // Restore the complete renderer document for the later thumbnail integration
  // checks. The reduced-roster assertion above remains independent and durable.
  const restoredPropSeatsWrite = await request(
    'PUT', '/api/prop-seats/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: propSeatsDoc, expectedRevision: 4 }),
  );
  if (restoredPropSeatsWrite.statusCode !== 200 || JSON.parse(restoredPropSeatsWrite.body).portfolio.revision !== 5) {
    throw new Error(`Complete prop-seat smoke fixture was not restored: ${restoredPropSeatsWrite.statusCode} ${restoredPropSeatsWrite.body}`);
  }

  // --- New-format level persistence (/api/levels): per-user, DB-backed -------
  const levelBody = { name: 'Smoke Level', board: { cols: 8, rows: 12 }, layers: { terrain: [], units: [] } };

  const anonymousLevels = await get('/api/levels');
  if (anonymousLevels.statusCode !== 401) {
    throw new Error(`Anonymous level list should require sign-in: ${anonymousLevels.statusCode}`);
  }

  const invalidLevelId = await get('/api/levels/Bad%20Id', { cookie: '__Host-chess-tactics-access=abc' });
  if (invalidLevelId.statusCode !== 400) {
    throw new Error(`Invalid level id should fail: ${invalidLevelId.statusCode} ${invalidLevelId.body}`);
  }

  const invalidLevelBody = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { nope: true } }),
  );
  if (invalidLevelBody.statusCode !== 400) {
    throw new Error(`Invalid level body should fail: ${invalidLevelBody.statusCode} ${invalidLevelBody.body}`);
  }

  const savedLevel = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: levelBody }),
  );
  const savedLevelBody = JSON.parse(savedLevel.body);
  if (savedLevel.statusCode !== 200 || savedLevelBody.revision !== 1 || savedLevelBody.id !== 'smoke-1') {
    throw new Error(`Unexpected level save: ${savedLevel.statusCode} ${savedLevel.body}`);
  }

  const playerLevels = await get('/api/levels', { cookie: '__Host-chess-tactics-access=abc' });
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

  const loadedLevel = await get('/api/levels/smoke-1', { cookie: '__Host-chess-tactics-access=abc' });
  const loadedLevelBody = JSON.parse(loadedLevel.body);
  if (loadedLevel.statusCode !== 200 || loadedLevelBody.level.name !== 'Smoke Level' || loadedLevelBody.level.id !== 'smoke-1' || loadedLevelBody.revision !== 1) {
    throw new Error(`Unexpected level load: ${loadedLevel.statusCode} ${loadedLevel.body}`);
  }

  const reSavedLevel = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...levelBody, name: 'Smoke Level v2' } }),
  );
  const reSavedLevelBody = JSON.parse(reSavedLevel.body);
  if (reSavedLevel.statusCode !== 200 || reSavedLevelBody.revision !== 2) {
    throw new Error(`Level re-save should bump revision: ${reSavedLevel.statusCode} ${reSavedLevel.body}`);
  }

  // Per-user scoping: the rival sees none of the player's levels.
  const rivalLevels = await get('/api/levels', { cookie: '__Host-chess-tactics-access=rival' });
  const rivalLevelsBody = JSON.parse(rivalLevels.body);
  if (rivalLevels.statusCode !== 200 || rivalLevelsBody.levels.length !== 0) {
    throw new Error(`Levels should be scoped to owner: ${rivalLevels.statusCode} ${rivalLevels.body}`);
  }
  const rivalLevelRead = await get('/api/levels/smoke-1', { cookie: '__Host-chess-tactics-access=rival' });
  if (rivalLevelRead.statusCode !== 404) {
    throw new Error(`Rival should not read the player's level: ${rivalLevelRead.statusCode} ${rivalLevelRead.body}`);
  }
  // The rival can reuse the same id in their own namespace without colliding.
  const rivalSave = await request(
    'PUT', '/api/levels/smoke-1',
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...levelBody, name: 'Rival Level' } }),
  );
  const rivalSaveBody = JSON.parse(rivalSave.body);
  if (rivalSave.statusCode !== 200 || rivalSaveBody.revision !== 1) {
    throw new Error(`Rival's same-id level should be independent (revision 1): ${rivalSave.statusCode} ${rivalSave.body}`);
  }
  const playerLevelStillV2 = await get('/api/levels/smoke-1', { cookie: '__Host-chess-tactics-access=abc' });
  const playerLevelStillV2Body = JSON.parse(playerLevelStillV2.body);
  if (playerLevelStillV2.statusCode !== 200 || playerLevelStillV2Body.revision !== 2 || playerLevelStillV2Body.level.name !== 'Smoke Level v2') {
    throw new Error(`Rival's write must not affect the player's level: ${playerLevelStillV2.statusCode} ${playerLevelStillV2.body}`);
  }

  // --- Campaign workspace (/api/campaign-workspace): per-user, DB-backed -----
  const anonymousWorkspace = await get('/api/campaign-workspace');
  if (anonymousWorkspace.statusCode !== 401) {
    throw new Error(`Anonymous workspace should require sign-in: ${anonymousWorkspace.statusCode}`);
  }

  const emptyWorkspace = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  const emptyWorkspaceBody = JSON.parse(emptyWorkspace.body);
  if (emptyWorkspace.statusCode !== 200 || emptyWorkspaceBody.revision !== 0 || emptyWorkspaceBody.campaigns.length !== 0 || Object.keys(emptyWorkspaceBody.levels).length !== 0) {
    throw new Error(`Empty workspace should be empty: ${emptyWorkspace.statusCode} ${emptyWorkspace.body}`);
  }

  const invalidWorkspace = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ campaigns: 'nope' }),
  );
  if (invalidWorkspace.statusCode !== 400) {
    throw new Error(`Invalid workspace should fail: ${invalidWorkspace.statusCode} ${invalidWorkspace.body}`);
  }

  const workspaceLevel = {
    formatVersion: boardRender.LEVEL_FORMAT_VERSION,
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
  const warBattleLevel = {
    ...workspaceLevel,
    id: 'war-smoke-battle',
    name: 'Smoke War Battle',
    objective: 'rival-kings',
    // Every War Battle authors how many cards its Deployment deals; a Run cannot be crafted on
    // one that does not.
    battle: { loot: true, cardsDealt: 3 },
    layers: {
      ...workspaceLevel.layers,
      zones: [{
        id: 'run-player-deploy',
        type: 'player-spawn',
        tiles: [[0, 10], [1, 10], [2, 10], [0, 11], [1, 11], [2, 11]],
      }],
      units: [{ x: 7, y: 0, type: 'king', side: 'enemy' }],
    },
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
    wars: [{
      formatVersion: 1,
      id: 'war-smoke',
      name: 'Smoke War',
      description: 'Backend War persistence proof.',
      eligibleForRun: true,
      battles: [{ levelId: 'war-smoke-battle', ordinal: 0 }],
    }],
    levels: {
      'smoke-1': workspaceLevel,
      'recoverable-legacy': recoverableLegacyCanonical,
      'war-smoke-battle': warBattleLevel,
    },
  };
  const missingWorkspaceRevision = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceDoc),
  );
  if (missingWorkspaceRevision.statusCode !== 400 || JSON.parse(missingWorkspaceRevision.body).error !== 'workspace_revision_required') {
    throw new Error(`Whole-workspace writes must carry an observed revision: ${missingWorkspaceRevision.statusCode} ${missingWorkspaceRevision.body}`);
  }
  const sharedCampaignWarLevel = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      ...workspaceDoc,
      wars: [{
        ...workspaceDoc.wars[0],
        battles: [{ levelId: 'smoke-1', ordinal: 0 }],
      }],
      revision: emptyWorkspaceBody.revision,
    }),
  );
  if (sharedCampaignWarLevel.statusCode !== 400 || !JSON.parse(sharedCampaignWarLevel.body).details.includes('belongs to both')) {
    throw new Error(`A Level must not belong to both a Campaign and War: ${sharedCampaignWarLevel.statusCode} ${sharedCampaignWarLevel.body}`);
  }
  const savedWorkspace = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ ...workspaceDoc, revision: emptyWorkspaceBody.revision }),
  );
  const savedWorkspaceBody = JSON.parse(savedWorkspace.body);
  if (savedWorkspace.statusCode !== 200 || savedWorkspaceBody.ok !== true || savedWorkspaceBody.campaigns !== 1 || savedWorkspaceBody.revision !== 1) {
    throw new Error(`Unexpected workspace save: ${savedWorkspace.statusCode} ${savedWorkspace.body}`);
  }

  const loadedWorkspace = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  const loadedWorkspaceBody = JSON.parse(loadedWorkspace.body);
  if (
    loadedWorkspace.statusCode !== 200 ||
    loadedWorkspaceBody.campaigns.length !== 1 ||
    loadedWorkspaceBody.campaigns[0].name !== 'Smoke Campaign' ||
    loadedWorkspaceBody.wars.length !== 1 ||
    loadedWorkspaceBody.wars[0].battles[0].levelId !== 'war-smoke-battle' ||
    loadedWorkspaceBody.revision !== 1 ||
    !loadedWorkspaceBody.levels['smoke-1']
  ) {
    throw new Error(`Workspace did not persist: ${loadedWorkspace.statusCode} ${loadedWorkspace.body}`);
  }
  const namedPrivateThumbnailUrl = loadedWorkspaceBody.thumbnail_urls?.['smoke-1'] || '';
  const anonymousNamedPrivateThumbnail = namedPrivateThumbnailUrl
    ? await get(namedPrivateThumbnailUrl)
    : { statusCode: 0 };
  const ownerNamedPrivateThumbnail = namedPrivateThumbnailUrl
    ? await get(namedPrivateThumbnailUrl, { cookie: '__Host-chess-tactics-access=abc' })
    : { statusCode: 0, headers: {} };
  if (
    !/^\/api\/campaign-workspace\/level-thumbnails\/smoke-1\/[0-9a-f]{64}\.png$/.test(namedPrivateThumbnailUrl)
    || anonymousNamedPrivateThumbnail.statusCode !== 401
    || ownerNamedPrivateThumbnail.statusCode !== 200
    || ownerNamedPrivateThumbnail.headers['content-type'] !== 'image/png'
  ) {
    throw new Error(`Named private Level thumbnail was not owner-readable: ${namedPrivateThumbnailUrl} / ${anonymousNamedPrivateThumbnail.statusCode}/${ownerNamedPrivateThumbnail.statusCode}`);
  }

  // Per-user scoping: the rival has their own (empty) workspace.
  const rivalWorkspace = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=rival' });
  const rivalWorkspaceBody = JSON.parse(rivalWorkspace.body);
  if (rivalWorkspace.statusCode !== 200 || rivalWorkspaceBody.campaigns.length !== 0) {
    throw new Error(`Workspace should be scoped to owner: ${rivalWorkspace.statusCode} ${rivalWorkspace.body}`);
  }

  // --- Run progression: owner-scoped and monotonic across completed Runs ----
  const anonymousRunProgression = await get('/api/run-progression');
  if (anonymousRunProgression.statusCode !== 401) {
    throw new Error(`Anonymous Run progression should require sign-in: ${anonymousRunProgression.statusCode}`);
  }
  const emptyRunProgression = await get('/api/run-progression', { cookie: '__Host-chess-tactics-access=abc' });
  if (
    emptyRunProgression.statusCode !== 200
    || JSON.parse(emptyRunProgression.body).progression.highestCompletedAtaraxiaTier !== -1
  ) {
    throw new Error(`Run progression should begin before the baseline: ${emptyRunProgression.statusCode} ${emptyRunProgression.body}`);
  }
  const completedBaseline = await request(
    'PUT', '/api/run-progression',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ progression: { formatVersion: 1, highestCompletedAtaraxiaTier: 0 } }),
  );
  const attemptedRegression = await request(
    'PUT', '/api/run-progression',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ progression: { formatVersion: 1, highestCompletedAtaraxiaTier: -1 } }),
  );
  if (
    completedBaseline.statusCode !== 200
    || JSON.parse(completedBaseline.body).progression.highestCompletedAtaraxiaTier !== 0
    || attemptedRegression.statusCode !== 200
    || JSON.parse(attemptedRegression.body).progression.highestCompletedAtaraxiaTier !== 0
  ) {
    throw new Error(`Run progression must merge monotonically: ${completedBaseline.body} / ${attemptedRegression.body}`);
  }
  const rivalRunProgression = await get('/api/run-progression', { cookie: '__Host-chess-tactics-access=rival' });
  if (JSON.parse(rivalRunProgression.body).progression.highestCompletedAtaraxiaTier !== -1) {
    throw new Error(`Run progression should be owner-scoped: ${rivalRunProgression.statusCode} ${rivalRunProgression.body}`);
  }

  // --- Active Run (/api/active-run): one owner-scoped CAS document ----------
  const anonymousRun = await get('/api/active-run');
  if (anonymousRun.statusCode !== 401) {
    throw new Error(`Anonymous active Run should require sign-in: ${anonymousRun.statusCode}`);
  }
  const emptyRun = await get('/api/active-run', { cookie: '__Host-chess-tactics-access=abc' });
  const emptyRunBody = JSON.parse(emptyRun.body);
  if (emptyRun.statusCode !== 200 || emptyRunBody.run !== null || emptyRunBody.revision !== 0) {
    throw new Error(`Active Run should begin empty: ${emptyRun.statusCode} ${emptyRun.body}`);
  }
  const activeRunDocument = {
    ...boardRender.craftRunDocument(
      boardRender.runCraftSpecFromJson({ phase: 'sectio', battle: 2, seed: 17 }),
      {
        id: 'war-smoke',
        name: 'Smoke War',
        description: 'Pinned War snapshot.',
        battles: [
          { level: warBattleLevel, loot: false },
          { level: structuredClone(warBattleLevel), loot: false },
        ],
      },
    ),
    id: 'run-smoke',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const [activeRunKing, activeRunPawnA, activeRunPawnB] = activeRunDocument.army;
  const activeRunOffers = activeRunDocument.sectio.cardOffers;
  const invalidPlaguedTarget = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        cards: [{
          id: 'run-card-invalid',
          coreId: 'p',
          cardType: 'pestiferous',
          effectSeed: 1703,
          effectTargetUnitId: null,
          unitSeats: ['run-pawn-a'],
          lostUnitIds: [],
          cacochymicUnitId: null,
          acquiredAfterBattleIndex: 0,
        }],
      },
      revision: 0,
    }),
  );
  if (
    invalidPlaguedTarget.statusCode !== 400
    || JSON.parse(invalidPlaguedTarget.body).error !== 'invalid_active_run'
  ) {
    throw new Error(`Active Run should reject a missing Cacochymic target: ${invalidPlaguedTarget.statusCode} ${invalidPlaguedTarget.body}`);
  }
  const missingRunRevision = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: activeRunDocument }),
  );
  if (missingRunRevision.statusCode !== 400 || JSON.parse(missingRunRevision.body).error !== 'active_run_revision_required') {
    throw new Error(`Active Run writes must carry a revision: ${missingRunRevision.statusCode} ${missingRunRevision.body}`);
  }
  const retiredRunVersionField = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: { ...activeRunDocument, formatVersion: 16 }, revision: 0 }),
  );
  if (retiredRunVersionField.statusCode !== 400 || JSON.parse(retiredRunVersionField.body).error !== 'invalid_active_run') {
    throw new Error(`Active Runs must reject the retired formatVersion field: ${retiredRunVersionField.statusCode} ${retiredRunVersionField.body}`);
  }
  const retiredShopState = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: { ...activeRunDocument, shop: null }, revision: 0 }),
  );
  if (retiredShopState.statusCode !== 400 || JSON.parse(retiredShopState.body).error !== 'invalid_active_run') {
    throw new Error(`Active Runs must reject the retired Shop property: ${retiredShopState.statusCode} ${retiredShopState.body}`);
  }
  const invalidOfferCountRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        sectio: { ...activeRunDocument.sectio, cardOffers: activeRunDocument.sectio.cardOffers.slice(0, 2) },
      },
      revision: 0,
    }),
  );
  if (invalidOfferCountRun.statusCode !== 400 || JSON.parse(invalidOfferCountRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Run saves must persist their complete Sectio deal: ${invalidOfferCountRun.statusCode} ${invalidOfferCountRun.body}`);
  }
  const quartermasterOffer = boardRender.sectioCardOffersAtCursor(
    activeRunDocument.seed,
    activeRunDocument.battleIndex,
    0,
    4,
  )[3];
  const quartermasterOpeningRun = {
    ...activeRunDocument,
    id: 'run-quartermaster-smoke',
    lipsana: ['quartermasters-ledger'],
    seenLipsana: ['quartermasters-ledger'],
    sectioCardCursor: 4,
    sectio: {
      ...activeRunDocument.sectio,
      cardOffers: [...activeRunOffers, quartermasterOffer],
      entrySnapshot: {
        ...activeRunDocument.sectio.entrySnapshot,
        lipsana: ['quartermasters-ledger'],
        seenLipsana: ['quartermasters-ledger'],
      },
    },
  };
  const savedQuartermasterOpening = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=second-admin', 'content-type': 'application/json' },
    JSON.stringify({ run: quartermasterOpeningRun, revision: 0 }),
  );
  if (
    savedQuartermasterOpening.statusCode !== 200
    || JSON.parse(savedQuartermasterOpening.body).run.sectio.cardOffers.length !== 4
  ) {
    throw new Error(`Quartermaster's Ledger must permit four Sectio cards: ${savedQuartermasterOpening.statusCode} ${savedQuartermasterOpening.body}`);
  }
  const retiredAffectedOfferRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        sectio: {
          ...activeRunDocument.sectio,
          cardOffers: [
            activeRunOffers[0],
            activeRunOffers[1],
            { ...activeRunOffers[2], cardType: 'legatine', cost: 5, effectTargetIndex: null },
          ],
        },
      },
      revision: 0,
    }),
  );
  if (retiredAffectedOfferRun.statusCode !== 400 || JSON.parse(retiredAffectedOfferRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Sectio offers must reject retired affected-card state: ${retiredAffectedOfferRun.statusCode} ${retiredAffectedOfferRun.body}`);
  }
  const expensiveDefinitions = Object.values(boardRender.RUN_CARD_BY_ID)
    .filter((card) => card.value === 9)
    .slice(0, 3);
  const expensiveSectioRun = {
    ...activeRunDocument,
    id: 'run-expensive-sectio-smoke',
    sectio: {
      ...activeRunDocument.sectio,
      cardOffers: expensiveDefinitions.map((card, index) => ({
        ...card,
        offerId: `sectio-expensive-${index}-${card.id}`,
        cost: card.value,
      })),
    },
  };
  const savedExpensiveSectioRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ run: expensiveSectioRun, revision: 0 }),
  );
  if (savedExpensiveSectioRun.statusCode !== 200) {
    throw new Error(`A Sectio may validly deal three cards above the player's current gold: ${savedExpensiveSectioRun.statusCode} ${savedExpensiveSectioRun.body}`);
  }
  const retiredSectioFieldRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        sectio: { ...activeRunDocument.sectio, purchasedCardOfferIds: [] },
      },
      revision: 0,
    }),
  );
  if (retiredSectioFieldRun.statusCode !== 400 || JSON.parse(retiredSectioFieldRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Run saves must reject retired Sectio operation fields: ${retiredSectioFieldRun.statusCode} ${retiredSectioFieldRun.body}`);
  }
  const duplicateAdlectedCardRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        sectio: {
          ...activeRunDocument.sectio,
          adlectedCardOfferIds: [activeRunOffers[0].offerId, activeRunOffers[0].offerId],
        },
      },
      revision: 0,
    }),
  );
  if (duplicateAdlectedCardRun.statusCode !== 400 || JSON.parse(duplicateAdlectedCardRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Run saves must reject a duplicate Adlectio: ${duplicateAdlectedCardRun.statusCode} ${duplicateAdlectedCardRun.body}`);
  }
  const invalidUnseatedArmy = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...activeRunDocument,
        army: [
          ...activeRunDocument.army,
          { id: 'run-unit-1', name: 'Unexpected Pawn', type: 'pawn', number: 3, inspectionSeed: 1707, source: 'adlectio' },
        ],
      },
      revision: 0,
    }),
  );
  if (invalidUnseatedArmy.statusCode !== 400 || JSON.parse(invalidUnseatedArmy.body).error !== 'invalid_active_run') {
    throw new Error(`A persisted Run must reject an army unit outside the Chartulary: ${invalidUnseatedArmy.statusCode} ${invalidUnseatedArmy.body}`);
  }
  const retiredDraftRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: { ...activeRunDocument, draftOffers: [] }, revision: 0 }),
  );
  if (retiredDraftRun.statusCode !== 400 || JSON.parse(retiredDraftRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Run saves must reject retired draft state: ${retiredDraftRun.statusCode} ${retiredDraftRun.body}`);
  }
  const retiredDraftSourceRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: { ...activeRunDocument, army: [{ ...activeRunKing, source: 'draft' }, activeRunPawnA, activeRunPawnB] },
      revision: 0,
    }),
  );
  if (retiredDraftSourceRun.statusCode !== 400 || JSON.parse(retiredDraftSourceRun.body).error !== 'invalid_active_run') {
    throw new Error(`Current Run saves must reject retired draft unit sources: ${retiredDraftSourceRun.statusCode} ${retiredDraftSourceRun.body}`);
  }
  const fundedSectioRun = {
    ...activeRunDocument,
    goldTenths: 1000,
    sectio: {
      ...activeRunDocument.sectio,
      entrySnapshot: { ...activeRunDocument.sectio.entrySnapshot, goldTenths: 1000 },
    },
  };
  const multiAdlectioRun = boardRender.performAdlectio(
    boardRender.performAdlectio(fundedSectioRun, activeRunOffers[0].offerId),
    activeRunOffers[1].offerId,
  );
  const firstAdlectedCard = multiAdlectioRun.cards.find((card) => card.coreId !== 'his-grace');
  const firstAdlectedUnitIds = firstAdlectedCard.unitSeats.filter(Boolean);
  const firstAdlectedUnits = firstAdlectedUnitIds.map(
    (unitId) => multiAdlectioRun.army.find((unit) => unit.id === unitId),
  );
  const expunctioPriceTenths = boardRender.cardExpunctioPriceTenths(firstAdlectedCard, firstAdlectedUnits);
  const savedRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: multiAdlectioRun, revision: 0 }),
  );
  const savedRunBody = JSON.parse(savedRun.body);
  if (
    savedRun.statusCode !== 200
    || savedRunBody.revision !== 1
    || savedRunBody.run.id !== 'run-smoke'
    || savedRunBody.run.sectio.adlectedCardOfferIds.length !== 2
  ) {
    throw new Error(`Active Run did not save: ${savedRun.statusCode} ${savedRun.body}`);
  }
  const expunctioRun = boardRender.performExpunctio(savedRunBody.run, firstAdlectedCard.id);
  const savedExpunctioRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: expunctioRun, revision: 1 }),
  );
  const savedExpunctioRunBody = JSON.parse(savedExpunctioRun.body);
  if (
    savedExpunctioRun.statusCode !== 200
    || savedExpunctioRunBody.revision !== 2
    || savedExpunctioRunBody.run.goldTenths !== multiAdlectioRun.goldTenths - expunctioPriceTenths
    || savedExpunctioRunBody.run.cards.some((card) => card.id === firstAdlectedCard.id)
    || savedExpunctioRunBody.run.army.some((unit) => firstAdlectedUnitIds.includes(unit.id))
    || savedExpunctioRunBody.run.sectio.expunctedCard?.card?.id !== firstAdlectedCard.id
    || savedExpunctioRunBody.run.sectio.expunctedCard?.priceTenths !== expunctioPriceTenths
  ) {
    throw new Error(`Expunctio did not persist through the authenticated Run endpoint: ${savedExpunctioRun.statusCode} ${savedExpunctioRun.body}`);
  }
  const plainSectioRun = {
    ...activeRunDocument,
    updatedAt: '2026-01-01T01:00:00.000Z',
  };
  const savedPlainSectioRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: plainSectioRun, revision: 2 }),
  );
  const savedPlainSectioRunBody = JSON.parse(savedPlainSectioRun.body);
  if (
    savedPlainSectioRun.statusCode !== 200
    || savedPlainSectioRunBody.revision !== 3
    || savedPlainSectioRunBody.run.sectio.cardOffers.some((offer) => offer.cost !== offer.value)
  ) {
    throw new Error(`Plain formation Sectio Run did not save: ${savedPlainSectioRun.statusCode} ${savedPlainSectioRun.body}`);
  }
  const mispricedFormationRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...plainSectioRun,
        sectio: {
          ...plainSectioRun.sectio,
          cardOffers: plainSectioRun.sectio.cardOffers.map((offer, index) => (
            index === 0 ? { ...offer, cost: offer.cost + 1 } : offer
          )),
        },
      },
      revision: 3,
    }),
  );
  if (mispricedFormationRun.statusCode !== 400 || JSON.parse(mispricedFormationRun.body).error !== 'invalid_active_run') {
    throw new Error(`Formation offers must carry their printed price: ${mispricedFormationRun.statusCode} ${mispricedFormationRun.body}`);
  }
  const deploymentRun = {
    ...activeRunDocument,
    phase: 'deployment',
    sectio: null,
    deployment: {
      battleIndex: 0,
      seed: 1709,
      dealtCardIds: ['run-card-his-grace'],
      deployingUnitIds: ['run-king', 'run-pawn-a', 'run-pawn-b'],
      unavailableUnitIds: [],
      capacityResolved: false,
      placements: {},
      formationPlans: {},
      activeCardIndex: 0,
      unitCursor: 0,
      discardCursor: 0,
      revealedCardIds: [],
      settlingUnitIds: [],
      transport: 'paused',
      stage: 'awaiting-deal',
      blockedUnitIds: [],
    },
  };
  const savedDeploymentRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: deploymentRun, revision: 3 }),
  );
  const savedDeploymentRunBody = JSON.parse(savedDeploymentRun.body);
  if (
    savedDeploymentRun.statusCode !== 200
    || savedDeploymentRunBody.revision !== 4
    || savedDeploymentRunBody.run.deployment?.stage !== 'awaiting-deal'
    || savedDeploymentRunBody.run.deployment?.transport !== 'paused'
  ) {
    throw new Error(`Deployment transport state did not save: ${savedDeploymentRun.statusCode} ${savedDeploymentRun.body}`);
  }
  const retiredDeploymentMode = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      run: {
        ...savedDeploymentRunBody.run,
        deployment: { ...savedDeploymentRunBody.run.deployment, mode: 'deploy-all' },
      },
      revision: 4,
    }),
  );
  if (
    retiredDeploymentMode.statusCode !== 400
    || JSON.parse(retiredDeploymentMode.body).error !== 'invalid_active_run'
  ) {
    throw new Error(`Active Runs must reject retired Deployment pace state: ${retiredDeploymentMode.statusCode} ${retiredDeploymentMode.body}`);
  }
  const rivalRun = await get('/api/active-run', { cookie: '__Host-chess-tactics-access=rival' });
  const rivalRunBody = JSON.parse(rivalRun.body);
  if (
    rivalRun.statusCode !== 200
    || rivalRunBody.run?.id !== 'run-expensive-sectio-smoke'
    || rivalRunBody.run.id === savedDeploymentRunBody.run.id
  ) {
    throw new Error(`Active Run should be owner-scoped: ${rivalRun.statusCode} ${rivalRun.body}`);
  }
  const staleRun = await request(
    'PUT', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ run: { ...activeRunDocument, updatedAt: '2026-01-02T00:00:00.000Z' }, revision: 0 }),
  );
  if (staleRun.statusCode !== 409 || JSON.parse(staleRun.body).revision !== 4) {
    throw new Error(`Stale active Run write should conflict: ${staleRun.statusCode} ${staleRun.body}`);
  }
  const deletedRun = await request(
    'DELETE', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: 4 }),
  );
  if (deletedRun.statusCode !== 200 || JSON.parse(deletedRun.body).ok !== true) {
    throw new Error(`Active Run did not delete: ${deletedRun.statusCode} ${deletedRun.body}`);
  }

  // --- Crafted active Runs (ADR-0338): admin-only, and refused before any write ---
  // The composition itself is covered by the shared crafter's own tests; what has to hold here is
  // that only an administrator can reach it and that a spec it cannot honour is reported rather
  // than half-applied.
  const anonymousCraft = await request(
    'POST', '/api/active-run/craft',
    { 'content-type': 'application/json' },
    JSON.stringify({ phase: 'sectio' }),
  );
  if (anonymousCraft.statusCode !== 401) {
    throw new Error(`Crafting a Run must require sign-in: ${anonymousCraft.statusCode} ${anonymousCraft.body}`);
  }
  const rivalCraft = await request(
    'POST', '/api/active-run/craft',
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ phase: 'sectio' }),
  );
  if (rivalCraft.statusCode !== 403 || JSON.parse(rivalCraft.body).error !== 'admin_required') {
    throw new Error(`Crafting a Run must require an administrator: ${rivalCraft.statusCode} ${rivalCraft.body}`);
  }
  const unknownFieldCraft = await request(
    'POST', '/api/active-run/craft',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ phase: 'sectio', goldd: 40 }),
  );
  if (
    unknownFieldCraft.statusCode !== 400
    || JSON.parse(unknownFieldCraft.body).error !== 'invalid_run_craft_spec'
    || !JSON.parse(unknownFieldCraft.body).details.includes('goldd')
  ) {
    throw new Error(`A craft spec typo must be named, not ignored: ${unknownFieldCraft.statusCode} ${unknownFieldCraft.body}`);
  }
  const unknownPhaseCraft = await request(
    'POST', '/api/active-run/craft',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ phase: 'inventory' }),
  );
  if (unknownPhaseCraft.statusCode !== 400 || JSON.parse(unknownPhaseCraft.body).error !== 'invalid_run_craft_spec') {
    throw new Error(`A craft spec must name a real Run phase: ${unknownPhaseCraft.statusCode} ${unknownPhaseCraft.body}`);
  }
  // A crafted state is handed over as a minted id (ADR-0354). Minting is admin-only, is
  // content-addressed so the same state always answers with the same link, and an id this
  // server never minted must be reported rather than crafting something else.
  const anonymousMint = await request(
    'POST', '/api/run-craft-links',
    { 'content-type': 'application/json' },
    JSON.stringify({ phase: 'sectio' }),
  );
  if (anonymousMint.statusCode !== 401 && anonymousMint.statusCode !== 403) {
    throw new Error(`Minting a craft link must require an administrator: ${anonymousMint.statusCode} ${anonymousMint.body}`);
  }
  const mintOnce = await request(
    'POST', '/api/run-craft-links',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ phase: 'sectio', battle: 3, gold: 25, army: 'knight,rook' }),
  );
  if (mintOnce.statusCode !== 200) {
    throw new Error(`Minting a craft link failed: ${mintOnce.statusCode} ${mintOnce.body}`);
  }
  const minted = JSON.parse(mintOnce.body);
  if (typeof minted.id !== 'string' || minted.url !== `/run/craft/${minted.id}`) {
    throw new Error(`A minted craft link must be its id: ${mintOnce.body}`);
  }
  // The same state written the other way round must land on the same address.
  const mintAgain = await request(
    'POST', '/api/run-craft-links',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ address: '?craft=sectio&battle=3&army=knight,rook&gold=25' }),
  );
  if (mintAgain.statusCode !== 200 || JSON.parse(mintAgain.body).id !== minted.id) {
    throw new Error(`The same crafted state must mint the same link: ${mintOnce.body} vs ${mintAgain.body}`);
  }
  const emptyAddressMint = await request(
    'POST', '/api/run-craft-links',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ address: '?view=army' }),
  );
  if (
    emptyAddressMint.statusCode !== 400
    || JSON.parse(emptyAddressMint.body).error !== 'invalid_run_craft_spec'
  ) {
    throw new Error(`An address with no craft request must be refused: ${emptyAddressMint.statusCode} ${emptyAddressMint.body}`);
  }
  const unknownLinkCraft = await request(
    'POST', '/api/active-run/craft/0123456789abcdef',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    '{}',
  );
  if (
    unknownLinkCraft.statusCode !== 400
    || JSON.parse(unknownLinkCraft.body).error !== 'invalid_run_craft_spec'
  ) {
    throw new Error(`A craft link this server never minted must be reported: ${unknownLinkCraft.statusCode} ${unknownLinkCraft.body}`);
  }
  const malformedLinkCraft = await request(
    'POST', '/api/active-run/craft/not-an-id',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    '{}',
  );
  if (malformedLinkCraft.statusCode !== 400) {
    throw new Error(`A malformed craft id must be refused: ${malformedLinkCraft.statusCode} ${malformedLinkCraft.body}`);
  }
  const craftedRunAfterRefusals = await get('/api/active-run', { cookie: '__Host-chess-tactics-access=abc' });
  if (craftedRunAfterRefusals.statusCode !== 200 || JSON.parse(craftedRunAfterRefusals.body).run !== null) {
    throw new Error(`A refused craft must write nothing: ${craftedRunAfterRefusals.statusCode} ${craftedRunAfterRefusals.body}`);
  }

  // Every crafted phase must survive the same save validator a player's own Run is held to
  // (ADR-0338). Composition is the crafter's business and has its own tests; what has to hold
  // HERE is that the document a craft produces is one this server will store — the two are
  // otherwise free to drift, and a validator rule written without a phase in mind stays
  // invisible until someone reaches that phase. That is not hypothetical: requiring
  // `battleRuntime` to be null outside a Battle silently rejected every won Battle's aftermath,
  // which carries the runtime of the Battle it is reporting on.
  const craftedPhaseWar = () => ({
    id: 'war-smoke',
    name: 'Smoke War',
    description: 'Pinned War snapshot.',
    battles: [
      { level: structuredClone(warBattleLevel), loot: false },
      { level: structuredClone(warBattleLevel), loot: false },
    ],
  });
  // `battle-victory` is the settled board's own Victory surface, so its document is still a
  // Battle; every other spec lands on the phase it names.
  const craftedPhases = [
    { spec: { phase: 'sectio', battle: 2 }, phase: 'sectio' },
    { spec: { phase: 'deployment', battle: 1 }, phase: 'deployment' },
    { spec: { phase: 'battle', battle: 1 }, phase: 'battle' },
    { spec: { phase: 'battle-victory', battle: 1 }, phase: 'battle' },
    { spec: { phase: 'aftermath', battle: 1, turns: 12, seconds: 240, fallen: 1 }, phase: 'aftermath' },
    { spec: { phase: 'victory', battle: 2 }, phase: 'victory' },
  ];
  let craftedPhaseRevision = JSON.parse(craftedRunAfterRefusals.body).revision;
  for (const craftedPhase of craftedPhases) {
    const craftedPhaseRun = {
      ...boardRender.craftRunDocument(
        boardRender.runCraftSpecFromJson({ ...craftedPhase.spec, seed: 17 }),
        craftedPhaseWar(),
      ),
      id: `run-crafted-${craftedPhase.spec.phase}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const savedCraftedPhase = await request(
      'PUT', '/api/active-run',
      { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
      JSON.stringify({ run: craftedPhaseRun, revision: craftedPhaseRevision }),
    );
    const savedCraftedPhaseBody = JSON.parse(savedCraftedPhase.body);
    if (
      savedCraftedPhase.statusCode !== 200
      || savedCraftedPhaseBody.run.phase !== craftedPhase.phase
      || savedCraftedPhaseBody.revision !== craftedPhaseRevision + 1
    ) {
      throw new Error(`A crafted ${craftedPhase.spec.phase} Run must be one this server stores: ${savedCraftedPhase.statusCode} ${savedCraftedPhase.body}`);
    }
    craftedPhaseRevision = savedCraftedPhaseBody.revision;
  }
  const deletedCraftedPhaseRun = await request(
    'DELETE', '/api/active-run',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ revision: craftedPhaseRevision }),
  );
  if (deletedCraftedPhaseRun.statusCode !== 200) {
    throw new Error(`Crafted-phase sweep did not clean up: ${deletedCraftedPhaseRun.statusCode} ${deletedCraftedPhaseRun.body}`);
  }

  // --- Run lipsanon statistics: owner-scoped, append-only, retry-idempotent ----
  const anonymousLipsanonStatistics = await get('/api/run-lipsanon-statistics');
  if (anonymousLipsanonStatistics.statusCode !== 401) {
    throw new Error(`Anonymous lipsanon statistics should require sign-in: ${anonymousLipsanonStatistics.statusCode}`);
  }
  const emptyLipsanonStatistics = await get(
    '/api/run-lipsanon-statistics',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  if (
    emptyLipsanonStatistics.statusCode !== 200
    || Object.keys(JSON.parse(emptyLipsanonStatistics.body).statistics || {}).length !== 0
  ) {
    throw new Error(`Lipsanon statistics should begin empty: ${emptyLipsanonStatistics.statusCode} ${emptyLipsanonStatistics.body}`);
  }
  const lipsanonEventsBody = JSON.stringify({
    events: [
      { eventId: 'pick:run-smoke:royal-tent', lipsanonId: 'royal-tent', kind: 'picked' },
      { eventId: 'battle-win:run-smoke:0', lipsanonId: 'royal-tent', kind: 'battle-win' },
      { eventId: 'battle-win:run-smoke:0', lipsanonId: 'quartermasters-ledger', kind: 'battle-win' },
    ],
  });
  const savedLipsanonEvents = await request(
    'POST',
    '/api/run-lipsanon-stat-events',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    lipsanonEventsBody,
  );
  const retriedLipsanonEvents = await request(
    'POST',
    '/api/run-lipsanon-stat-events',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    lipsanonEventsBody,
  );
  const savedLipsanonEventsBody = JSON.parse(savedLipsanonEvents.body);
  const retriedLipsanonEventsBody = JSON.parse(retriedLipsanonEvents.body);
  if (
    savedLipsanonEvents.statusCode !== 200
    || savedLipsanonEventsBody.inserted !== 3
    || retriedLipsanonEvents.statusCode !== 200
    || retriedLipsanonEventsBody.inserted !== 0
  ) {
    throw new Error(`Lipsanon event retries were not idempotent: ${savedLipsanonEvents.statusCode} ${savedLipsanonEvents.body} / ${retriedLipsanonEvents.statusCode} ${retriedLipsanonEvents.body}`);
  }
  const loadedLipsanonStatistics = await get(
    '/api/run-lipsanon-statistics',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const loadedLipsanonStatisticsBody = JSON.parse(loadedLipsanonStatistics.body);
  if (
    loadedLipsanonStatistics.statusCode !== 200
    || loadedLipsanonStatisticsBody.statistics['royal-tent']?.timesPicked !== 1
    || loadedLipsanonStatisticsBody.statistics['royal-tent']?.battlesWonWhileHeld !== 1
    || loadedLipsanonStatisticsBody.statistics['quartermasters-ledger']?.timesPicked !== 0
    || loadedLipsanonStatisticsBody.statistics['quartermasters-ledger']?.battlesWonWhileHeld !== 1
  ) {
    throw new Error(`Lipsanon statistics did not aggregate exact facts: ${loadedLipsanonStatistics.statusCode} ${loadedLipsanonStatistics.body}`);
  }
  const rivalLipsanonStatistics = await get(
    '/api/run-lipsanon-statistics',
    { cookie: '__Host-chess-tactics-access=rival' },
  );
  if (
    rivalLipsanonStatistics.statusCode !== 200
    || Object.keys(JSON.parse(rivalLipsanonStatistics.body).statistics || {}).length !== 0
  ) {
    throw new Error(`Lipsanon statistics should be owner-scoped: ${rivalLipsanonStatistics.statusCode} ${rivalLipsanonStatistics.body}`);
  }
  const invalidLipsanonEvents = await request(
    'POST',
    '/api/run-lipsanon-stat-events',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      events: [{ eventId: 'pick:run-smoke:not-a-lipsanon', lipsanonId: 'not-a-lipsanon', kind: 'picked' }],
    }),
  );
  if (
    invalidLipsanonEvents.statusCode !== 400
    || JSON.parse(invalidLipsanonEvents.body).error !== 'invalid_lipsanon_stat_events'
  ) {
    throw new Error(`Unknown lipsanon statistics must fail closed: ${invalidLipsanonEvents.statusCode} ${invalidLipsanonEvents.body}`);
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
  const ownerReadsLegacyDocument = await get('/api/editor-documents/legacy-abcdefgh', { cookie: '__Host-chess-tactics-access=abc' });
  const ownerReadsLegacyBody = JSON.parse(ownerReadsLegacyDocument.body);
  if (
    ownerReadsLegacyDocument.statusCode !== 200 ||
    ownerReadsLegacyBody.document.document_id !== 'legacy-abcdefgh' ||
    ownerReadsLegacyBody.document.level_id !== 'legacy-abcdefgh' ||
    ownerReadsLegacyBody.document.level.name !== 'Recovered Legacy Draft'
  ) {
    throw new Error(`Legacy editor URL did not recover the owner's private document: ${ownerReadsLegacyDocument.statusCode} ${ownerReadsLegacyDocument.body}`);
  }
  const rivalReadsLegacyDocument = await get('/api/editor-documents/legacy-abcdefgh', { cookie: '__Host-chess-tactics-access=rival' });
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
    { cookie: '__Host-chess-tactics-access=rival' },
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
  const adminLoadsRivalOfficialDocument = await get(
    '/api/editor-documents/legacy-jkmnpqrs',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const adminLoadsRivalOfficialBody = JSON.parse(adminLoadsRivalOfficialDocument.body);
  if (
    adminLoadsRivalOfficialDocument.statusCode !== 200 ||
    adminLoadsRivalOfficialBody.document.document_id !== 'legacy-jkmnpqrs' ||
    adminLoadsRivalOfficialBody.document.workspace_kind !== 'official' ||
    adminLoadsRivalOfficialBody.document.level.name !== 'Must Not Reconcile Before Auth' ||
    adminLoadsRivalOfficialBody.document.revision !== 1 ||
    adminLoadsRivalOfficialBody.document.saved_revision !== 1 ||
    adminLoadsRivalOfficialBody.document.baseline_conflict !== true
  ) {
    throw new Error(`Admin could not open an existing official editor document by opaque id: ${adminLoadsRivalOfficialDocument.statusCode} ${adminLoadsRivalOfficialDocument.body}`);
  }
  const untouchedAfterAdminOfficialRead = await queryDb(
    `SELECT body, revision, saved_revision, baseline_hash
       FROM level_working_copies
      WHERE document_id = 'legacy-jkmnpqrs'`,
  );
  if (
    Number(untouchedAfterAdminOfficialRead.rows[0].revision) !== 1 ||
    Number(untouchedAfterAdminOfficialRead.rows[0].saved_revision) !== 1 ||
    untouchedAfterAdminOfficialRead.rows[0].baseline_hash !== 'stale-baseline' ||
    untouchedAfterAdminOfficialRead.rows[0].body.name !== 'Must Not Reconcile Before Auth'
  ) {
    throw new Error(`Admin exact-read mutated an official working copy: ${JSON.stringify(untouchedAfterAdminOfficialRead.rows[0])}`);
  }
  const anonymousEditorDocumentList = await get('/api/editor-documents');
  if (anonymousEditorDocumentList.statusCode !== 401) {
    throw new Error(`Editor document discovery must require sign-in: ${anonymousEditorDocumentList.statusCode} ${anonymousEditorDocumentList.body}`);
  }
  const ownerEditorDocumentList = await get('/api/editor-documents', { cookie: '__Host-chess-tactics-access=abc' });
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
  const firstEditorDocumentPage = await get('/api/editor-documents?limit=1', { cookie: '__Host-chess-tactics-access=abc' });
  const firstEditorDocumentPageBody = JSON.parse(firstEditorDocumentPage.body);
  const secondEditorDocumentPage = await get(
    `/api/editor-documents?limit=1&offset=${firstEditorDocumentPageBody.next_offset}`,
    { cookie: '__Host-chess-tactics-access=abc' },
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
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const neverSavedEditorDocumentsBody = JSON.parse(neverSavedEditorDocuments.body);
  if (
    neverSavedEditorDocuments.statusCode !== 200 ||
    neverSavedEditorDocumentsBody.documents.length !== 1 ||
    neverSavedEditorDocumentsBody.documents[0].document_id !== 'legacy-abcdefgh'
  ) {
    throw new Error(`Never-saved document filter was not baseline-aware: ${neverSavedEditorDocuments.statusCode} ${neverSavedEditorDocuments.body}`);
  }
  const rivalEditorDocumentList = await get('/api/editor-documents', { cookie: '__Host-chess-tactics-access=rival' });
  if (rivalEditorDocumentList.statusCode !== 200 || JSON.parse(rivalEditorDocumentList.body).documents.length !== 0) {
    throw new Error(`Editor document discovery leaked another owner's work: ${rivalEditorDocumentList.statusCode} ${rivalEditorDocumentList.body}`);
  }
  const loadedCanonicalBackedLegacy = await get('/api/editor-documents/legacy-kmnpqrst', { cookie: '__Host-chess-tactics-access=abc' });
  const loadedCanonicalBackedLegacyBody = JSON.parse(loadedCanonicalBackedLegacy.body);
  if (
    loadedCanonicalBackedLegacy.statusCode !== 200 ||
    loadedCanonicalBackedLegacyBody.document.level.name !== 'Recovered Dirty Draft' ||
    loadedCanonicalBackedLegacyBody.document.has_saved_baseline !== true ||
    loadedCanonicalBackedLegacyBody.document.never_saved !== false
  ) {
    throw new Error(`Canonical-backed migrated draft lost its Discard target: ${loadedCanonicalBackedLegacy.statusCode} ${loadedCanonicalBackedLegacy.body}`);
  }
  const legacyEditSession = await openEditorEditSession('legacy-kmnpqrst');
  if (legacyEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(legacyEditSession.body.session.state)) {
    throw new Error(`Could not acquire migrated draft edit authority: ${legacyEditSession.response.statusCode} ${legacyEditSession.response.body}`);
  }
  const discardCanonicalBackedLegacy = await request(
    'POST', '/api/editor-documents/legacy-kmnpqrst/discard',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody('legacy-kmnpqrst', '__Host-chess-tactics-access=abc', { revision: 3 })),
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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

  // Every owner page targets the same editable working copy. Page sessions
  // authenticate and attribute writes; lease state is not mutation authority.
  const primaryOpen = await openEditorEditSession(smokeDocumentId, {
    deviceId: 'smoke-primary-device',
    clientLabel: 'Chrome on primary smoke device',
  });
  const primaryAuthority = {
    session_id: primaryOpen.body.session?.session_id,
    edit_session_key: primaryOpen.sessionKey,
    edit_generation: primaryOpen.body.session?.edit_generation,
  };
  const secondOpen = await openEditorEditSession(smokeDocumentId, {
    deviceId: 'smoke-second-device',
    clientLabel: 'Second browser tab',
    activate: false,
    remember: false,
  });
  const secondAuthority = {
    session_id: secondOpen.body.session?.session_id,
    edit_session_key: secondOpen.sessionKey,
    edit_generation: secondOpen.body.session?.edit_generation,
  };
  if (
    primaryOpen.response.statusCode !== 200
    || !['active', 'waiting'].includes(primaryOpen.body.session?.state)
    || secondOpen.response.statusCode !== 200
    || secondOpen.body.session?.state !== 'waiting'
    || JSON.stringify(primaryOpen.body).includes(primaryOpen.sessionKey)
    || JSON.stringify(secondOpen.body).includes(secondOpen.sessionKey)
  ) {
    throw new Error(`Owner pages did not join the shared working copy: ${primaryOpen.response.statusCode} ${primaryOpen.response.body} / ${secondOpen.response.statusCode} ${secondOpen.response.body}`);
  }

  const originalSharedLevel = resolvedEditorBody.document.level;
  const observer = await openEditorEditSession(smokeDocumentId, {
    deviceId: 'smoke-observer-device',
    clientLabel: 'Automated visual verification',
    intent: 'observe',
    remember: false,
  });
  const observerWrite = await request(
    'PUT', `/api/editor-documents/${smokeDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      revision: 1,
      base_level: originalSharedLevel,
      level: { ...originalSharedLevel, name: 'Observer must not write' },
      edit_session_id: observer.sessionId,
      edit_session_key: observer.sessionKey,
      edit_generation: resolvedEditorBody.document.edit_generation,
    }),
  );
  if (
    observer.response.statusCode !== 200
    || observer.body.session?.state !== 'observing'
    || observerWrite.statusCode !== 409
    || JSON.parse(observerWrite.body).error !== 'editor_document_session_observe_only'
  ) {
    throw new Error(`Observation-only verification gained edit access: ${observer.response.statusCode} ${observer.response.body} / ${observerWrite.statusCode} ${observerWrite.body}`);
  }

  const autosaveFrom = (authority, revision, baseLevel, level) => request(
    'PUT', `/api/editor-documents/${smokeDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(
      smokeDocumentId,
      '__Host-chess-tactics-access=abc',
      { revision, base_level: baseLevel, level },
      authority,
    )),
  );
  const firstTabAutosave = await autosaveFrom(
    primaryAuthority,
    1,
    originalSharedLevel,
    { ...originalSharedLevel, name: 'Shared title from tab A' },
  );
  const firstTabAutosaveBody = JSON.parse(firstTabAutosave.body);
  if (firstTabAutosave.statusCode !== 200 || firstTabAutosaveBody.document.revision !== 2) {
    throw new Error(`First shared-tab autosave failed: ${firstTabAutosave.statusCode} ${firstTabAutosave.body}`);
  }

  // Tab B began from revision 1. Its independent edit merges into Tab A's
  // newer title instead of creating a branch or asking for a takeover.
  const secondTabAutosave = await autosaveFrom(
    secondAuthority,
    1,
    originalSharedLevel,
    { ...originalSharedLevel, notes: 'Shared notes from tab B' },
  );
  const secondTabAutosaveBody = JSON.parse(secondTabAutosave.body);
  if (
    secondTabAutosave.statusCode !== 200
    || secondTabAutosaveBody.document.revision !== 3
    || secondTabAutosaveBody.document.level.name !== 'Shared title from tab A'
    || secondTabAutosaveBody.document.level.notes !== 'Shared notes from tab B'
  ) {
    throw new Error(`Stale shared-tab autosave did not merge: ${secondTabAutosave.statusCode} ${secondTabAutosave.body}`);
  }

  // Same-field edits use server arrival order while retaining unrelated work.
  const lastArrivalAutosave = await autosaveFrom(
    primaryAuthority,
    1,
    originalSharedLevel,
    { ...originalSharedLevel, name: 'Last shared arrival' },
  );
  const lastArrivalBody = JSON.parse(lastArrivalAutosave.body);
  if (
    lastArrivalAutosave.statusCode !== 200
    || lastArrivalBody.document.revision !== 4
    || lastArrivalBody.document.level.name !== 'Last shared arrival'
    || lastArrivalBody.document.level.notes !== 'Shared notes from tab B'
  ) {
    throw new Error(`Shared arrival policy lost work: ${lastArrivalAutosave.statusCode} ${lastArrivalAutosave.body}`);
  }

  // Stale lease metadata neither blocks editing nor manufactures recovery.
  await queryDb(
    `UPDATE editor_document_edit_sessions
        SET lease_expires_at = clock_timestamp() - interval '1 second'
      WHERE session_id = $1`,
    [secondAuthority.session_id],
  );
  const finalAutosave = await autosaveFrom(
    secondAuthority,
    4,
    lastArrivalBody.document.level,
    { ...lastArrivalBody.document.level, notes: 'Still shared after stale presence metadata' },
  );
  const finalAutosaveBody = JSON.parse(finalAutosave.body);
  if (finalAutosave.statusCode !== 200 || finalAutosaveBody.document.revision !== 5) {
    throw new Error(`Stale presence metadata blocked shared editing: ${finalAutosave.statusCode} ${finalAutosave.body}`);
  }

  const closedPrimary = await closeEditorEditSessionRequest(smokeDocumentId, primaryOpen.sessionId, primaryOpen.sessionKey);
  const closedSecond = await closeEditorEditSessionRequest(smokeDocumentId, secondOpen.sessionId, secondOpen.sessionKey);
  const closedObserver = await closeEditorEditSessionRequest(smokeDocumentId, observer.sessionId, observer.sessionKey);
  const recoveriesAfterClose = await queryDb(
    'SELECT count(*)::integer AS count FROM editor_document_recoveries WHERE document_id = $1',
    [smokeDocumentId],
  );
  if (
    closedPrimary.statusCode !== 200
    || closedSecond.statusCode !== 200
    || closedObserver.statusCode !== 200
    || recoveriesAfterClose.rows[0]?.count !== 0
  ) {
    throw new Error(`Closing shared pages created recovery cleanup: ${JSON.stringify(recoveriesAfterClose.rows[0])}`);
  }

  const saveSession = await openEditorEditSession(smokeDocumentId, {
    deviceId: 'smoke-save-device',
    clientLabel: 'Save browser tab',
  });
  const savedEditor = await request(
    'POST', `/api/editor-documents/${smokeDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(smokeDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: finalAutosaveBody.document.level,
      campaign_id: null,
    })),
  );
  const savedEditorBody = JSON.parse(savedEditor.body);
  if (
    saveSession.response.statusCode !== 200
    || savedEditor.statusCode !== 200
    || savedEditorBody.document.revision !== 6
    || savedEditorBody.document.saved_revision !== 6
    || savedEditorBody.document.dirty !== false
  ) {
    throw new Error(`Shared working-copy Save failed: ${savedEditor.statusCode} ${savedEditor.body}`);
  }

  const canonicalAfterSave = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  const canonicalAfterSaveBody = JSON.parse(canonicalAfterSave.body);
  if (
    canonicalAfterSave.statusCode !== 200
    || canonicalAfterSaveBody.levels['smoke-1'].name !== 'Last shared arrival'
    || canonicalAfterSaveBody.levels['smoke-1'].notes !== 'Still shared after stale presence metadata'
    || canonicalAfterSaveBody.revision !== 2
  ) {
    throw new Error(`Shared copy did not promote exactly on Save: ${canonicalAfterSave.statusCode} ${canonicalAfterSave.body}`);
  }

  const rivalEditorRead = await get(
    `/api/editor-documents/${smokeDocumentId}`,
    { cookie: '__Host-chess-tactics-access=rival' },
  );
  if (rivalEditorRead.statusCode !== 404) {
    throw new Error(`Shared working copy leaked to another owner: ${rivalEditorRead.statusCode} ${rivalEditorRead.body}`);
  }

  const firstHistoryPage = await get(
    `/api/editor-documents/${smokeDocumentId}/revisions?limit=2`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const firstHistoryPageBody = JSON.parse(firstHistoryPage.body);
  if (
    firstHistoryPage.statusCode !== 200
    || firstHistoryPageBody.revisions.map((entry) => entry.revision).join(',') !== '6,5'
    || firstHistoryPageBody.revisions[0].reason !== 'save'
    || Object.hasOwn(firstHistoryPageBody.revisions[0], 'level')
  ) {
    throw new Error(`Working-copy history summaries regressed: ${firstHistoryPage.statusCode} ${firstHistoryPage.body}`);
  }

  const restoredAutosave = await request(
    'POST', `/api/editor-documents/${smokeDocumentId}/revisions/restore`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(smokeDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 6,
      target_revision: 2,
    })),
  );
  const restoredAutosaveBody = JSON.parse(restoredAutosave.body);
  if (
    restoredAutosave.statusCode !== 200
    || restoredAutosaveBody.document.revision !== 7
    || restoredAutosaveBody.document.level.name !== 'Shared title from tab A'
  ) {
    throw new Error(`History restore failed: ${restoredAutosave.statusCode} ${restoredAutosave.body}`);
  }
  const restoredSavedRevision = await request(
    'POST', `/api/editor-documents/${smokeDocumentId}/revisions/restore`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(smokeDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 7,
      target_revision: 6,
    })),
  );
  const restoredSavedBody = JSON.parse(restoredSavedRevision.body);
  if (
    restoredSavedRevision.statusCode !== 200
    || restoredSavedBody.document.revision !== 8
    || restoredSavedBody.document.saved_revision !== 8
    || restoredSavedBody.document.dirty !== false
  ) {
    throw new Error(`Saved history restore failed: ${restoredSavedRevision.statusCode} ${restoredSavedRevision.body}`);
  }

  const editorEvents = await queryDb(
    'SELECT action, actor_email, actor_name FROM editor_document_edit_events WHERE document_id = $1',
    [smokeDocumentId],
  );
  if (
    !editorEvents.rows.some((event) => (
      event.action === 'document_autosaved'
      && event.actor_email === 'player@example.com'
      && event.actor_name === 'Tactics Player'
    ))
    || editorEvents.rows.some((event) => (
      event.action === 'session_takeover'
      || event.action === 'recovery_restored'
      || event.action === 'recovery_deleted'
    ))
  ) {
    throw new Error(`Shared-document events contain retired branch actions: ${JSON.stringify(editorEvents.rows)}`);
  }
  // Canonical workspaces still have other legitimate writers. Existing editor
  // documents are read-only on load/resolve and report divergence; only an
  // explicit fenced Discard adopts the newer canonical Level.
  const baselineLevelId = 'baseline-check';
  const baselineCanonicalV1 = { ...workspaceLevel, id: baselineLevelId, name: 'Baseline Canonical V1' };
  const workspaceForBaseline = canonicalAfterSaveBody;
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV1;
  const createBaselineCanonical = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (createBaselineCanonical.statusCode !== 200) {
    throw new Error(`Could not seed baseline-conflict Level: ${createBaselineCanonical.statusCode} ${createBaselineCanonical.body}`);
  }
  workspaceForBaseline.revision = JSON.parse(createBaselineCanonical.body).revision;
  const baselineResolved = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
  const baselineEditSession = await openEditorEditSession(baselineDocumentId, {
    deviceId: 'smoke-baseline-device',
    clientLabel: 'Baseline smoke editor',
  });
  if (baselineEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(baselineEditSession.body.session.state)) {
    throw new Error(`Could not acquire baseline document edit authority: ${baselineEditSession.response.statusCode} ${baselineEditSession.response.body}`);
  }

  const baselineCanonicalV2 = { ...baselineCanonicalV1, name: 'Baseline Canonical V2' };
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV2;
  const externalCleanChange = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (externalCleanChange.statusCode !== 200) {
    throw new Error(`Could not apply external clean canonical change: ${externalCleanChange.statusCode} ${externalCleanChange.body}`);
  }
  workspaceForBaseline.revision = JSON.parse(externalCleanChange.body).revision;
  const refreshedCleanDocument = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: baselineLevelId }),
  );
  const refreshedCleanBody = JSON.parse(refreshedCleanDocument.body);
  if (
    refreshedCleanDocument.statusCode !== 200 ||
    refreshedCleanBody.document.revision !== 1 ||
    refreshedCleanBody.document.saved_revision !== 1 ||
    refreshedCleanBody.document.dirty !== false ||
    refreshedCleanBody.document.baseline_conflict !== true ||
    refreshedCleanBody.document.level.name !== 'Baseline Canonical V1'
  ) {
    throw new Error(`Resolve mutated a clean editor document instead of reporting canonical divergence: ${refreshedCleanDocument.statusCode} ${refreshedCleanDocument.body}`);
  }
  const loadedCleanDivergence = await get(`/api/editor-documents/${baselineDocumentId}`, { cookie: '__Host-chess-tactics-access=abc' });
  const loadedCleanDivergenceBody = JSON.parse(loadedCleanDivergence.body);
  if (
    loadedCleanDivergence.statusCode !== 200 ||
    loadedCleanDivergenceBody.document.revision !== 1 ||
    loadedCleanDivergenceBody.document.saved_revision !== 1 ||
    loadedCleanDivergenceBody.document.baseline_conflict !== true ||
    loadedCleanDivergenceBody.document.level.name !== 'Baseline Canonical V1'
  ) {
    throw new Error(`GET mutated a clean editor document instead of remaining review-only: ${loadedCleanDivergence.statusCode} ${loadedCleanDivergence.body}`);
  }
  const autosavedOldBaseline = await request(
    'PUT', `/api/editor-documents/${baselineDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(baselineDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 1,
      level: baselineCanonicalV1,
    })),
  );
  const autosavedOldBaselineBody = JSON.parse(autosavedOldBaseline.body);
  if (
    autosavedOldBaseline.statusCode !== 200 ||
    autosavedOldBaselineBody.document.revision !== 2 ||
    autosavedOldBaselineBody.document.saved_revision !== 1 ||
    autosavedOldBaselineBody.document.dirty !== true ||
    autosavedOldBaselineBody.document.baseline_conflict !== true ||
    autosavedOldBaselineBody.document.level.name !== 'Baseline Canonical V1'
  ) {
    throw new Error(`Autosaving an obsolete baseline falsely marked it canonical-clean: ${autosavedOldBaseline.statusCode} ${autosavedOldBaseline.body}`);
  }
  const adoptedCleanCanonical = await request(
    'POST', `/api/editor-documents/${baselineDocumentId}/discard`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(baselineDocumentId, '__Host-chess-tactics-access=abc', { revision: 2 })),
  );
  const adoptedCleanCanonicalBody = JSON.parse(adoptedCleanCanonical.body);
  if (
    adoptedCleanCanonical.statusCode !== 200 ||
    adoptedCleanCanonicalBody.document.revision !== 3 ||
    adoptedCleanCanonicalBody.document.saved_revision !== 3 ||
    adoptedCleanCanonicalBody.document.dirty !== false ||
    adoptedCleanCanonicalBody.document.baseline_conflict !== false ||
    adoptedCleanCanonicalBody.document.level.name !== 'Baseline Canonical V2'
  ) {
    throw new Error(`Fenced Discard did not adopt the changed clean canonical Level: ${adoptedCleanCanonical.statusCode} ${adoptedCleanCanonical.body}`);
  }

  const baselineDraft = { ...baselineCanonicalV2, name: 'Preserve This Dirty Draft' };
  const dirtyBaselineDocument = await request(
    'PUT', `/api/editor-documents/${baselineDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(baselineDocumentId, '__Host-chess-tactics-access=abc', { revision: 3, level: baselineDraft })),
  );
  if (dirtyBaselineDocument.statusCode !== 200 || JSON.parse(dirtyBaselineDocument.body).document.revision !== 4) {
    throw new Error(`Could not autosave dirty baseline document: ${dirtyBaselineDocument.statusCode} ${dirtyBaselineDocument.body}`);
  }
  const baselineCanonicalV3 = { ...baselineCanonicalV2, name: 'Baseline Canonical V3 External' };
  workspaceForBaseline.levels[baselineLevelId] = baselineCanonicalV3;
  const externalDirtyChange = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(workspaceForBaseline),
  );
  if (externalDirtyChange.statusCode !== 200) {
    throw new Error(`Could not apply external dirty canonical change: ${externalDirtyChange.statusCode} ${externalDirtyChange.body}`);
  }
  const loadedConflictedDocument = await get(`/api/editor-documents/${baselineDocumentId}`, { cookie: '__Host-chess-tactics-access=abc' });
  const loadedConflictedBody = JSON.parse(loadedConflictedDocument.body);
  if (
    loadedConflictedDocument.statusCode !== 200 ||
    loadedConflictedBody.document.revision !== 4 ||
    loadedConflictedBody.document.level.name !== 'Preserve This Dirty Draft' ||
    loadedConflictedBody.document.baseline_conflict !== true
  ) {
    throw new Error(`Dirty editor document did not preserve/report canonical divergence: ${loadedConflictedDocument.statusCode} ${loadedConflictedDocument.body}`);
  }
  const rejectedBaselineSave = await request(
    'POST', `/api/editor-documents/${baselineDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(baselineDocumentId, '__Host-chess-tactics-access=abc', { revision: 4, level: baselineDraft })),
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
  const canonicalAfterRejectedBaselineSave = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  if (JSON.parse(canonicalAfterRejectedBaselineSave.body).levels[baselineLevelId].name !== 'Baseline Canonical V3 External') {
    throw new Error(`Rejected baseline Save overwrote canonical content: ${canonicalAfterRejectedBaselineSave.body}`);
  }
  const discardedBaselineConflict = await request(
    'POST', `/api/editor-documents/${baselineDocumentId}/discard`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(baselineDocumentId, '__Host-chess-tactics-access=abc', { revision: 4 })),
  );
  const discardedBaselineConflictBody = JSON.parse(discardedBaselineConflict.body);
  if (
    discardedBaselineConflict.statusCode !== 200 ||
    discardedBaselineConflictBody.document.revision !== 5 ||
    discardedBaselineConflictBody.document.saved_revision !== 5 ||
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
  const newDocumentEditSession = await openEditorEditSession(newDocumentId, {
    deviceId: 'smoke-new-document-device',
    clientLabel: 'New document smoke editor',
  });
  if (newDocumentEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(newDocumentEditSession.body.session.state)) {
    throw new Error(`Could not acquire new document edit authority: ${newDocumentEditSession.response.statusCode} ${newDocumentEditSession.response.body}`);
  }
  const recentAfterNewDocument = await get('/api/editor-documents', { cookie: '__Host-chess-tactics-access=abc' });
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

  // Deletion is a CAS-protected cleanup operation for never-saved private work
  // only. It stays owner-scoped, never grants public access, and never reaches a
  // canonical workspace Level.
  const deleteCandidate = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...workspaceLevel, id: 'delete-placeholder', name: 'Delete Candidate' } }),
  );
  const deleteCandidateBody = JSON.parse(deleteCandidate.body);
  const deleteCandidateId = deleteCandidateBody.document && deleteCandidateBody.document.document_id;
  if (
    deleteCandidate.statusCode !== 201 ||
    typeof deleteCandidateId !== 'string' || !deleteCandidateId ||
    deleteCandidateBody.document.saved_revision !== 0 ||
    deleteCandidateBody.document.never_saved !== true
  ) {
    throw new Error(`Could not create never-saved delete candidate: ${deleteCandidate.statusCode} ${deleteCandidate.body}`);
  }
  const deleteCandidateEditSession = await openEditorEditSession(deleteCandidateId, {
    deviceId: 'smoke-delete-candidate-device',
    clientLabel: 'Delete candidate smoke editor',
  });
  if (deleteCandidateEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(deleteCandidateEditSession.body.session.state)) {
    throw new Error(`Could not acquire delete candidate edit authority: ${deleteCandidateEditSession.response.statusCode} ${deleteCandidateEditSession.response.body}`);
  }
  const advancedDeleteCandidate = await request(
    'PUT', `/api/editor-documents/${deleteCandidateId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(deleteCandidateId, '__Host-chess-tactics-access=abc', {
      revision: 1,
      level: { ...deleteCandidateBody.document.level, name: 'Delete Candidate Autosaved' },
    })),
  );
  if (advancedDeleteCandidate.statusCode !== 200 || JSON.parse(advancedDeleteCandidate.body).document.revision !== 2) {
    throw new Error(`Could not advance never-saved delete candidate: ${advancedDeleteCandidate.statusCode} ${advancedDeleteCandidate.body}`);
  }
  const anonymousDeleteCandidate = await deleteEditorDocumentRequest(deleteCandidateId, 2);
  if (anonymousDeleteCandidate.statusCode !== 401) {
    throw new Error(`Never-saved document deletion must require sign-in: ${anonymousDeleteCandidate.statusCode} ${anonymousDeleteCandidate.body}`);
  }
  const rivalDeleteCandidate = await deleteEditorDocumentRequest(deleteCandidateId, 2, '__Host-chess-tactics-access=rival');
  if (rivalDeleteCandidate.statusCode !== 404 || JSON.parse(rivalDeleteCandidate.body).error !== 'editor_document_not_found') {
    throw new Error(`Never-saved document deletion leaked another owner's work: ${rivalDeleteCandidate.statusCode} ${rivalDeleteCandidate.body}`);
  }
  const staleDeleteCandidate = await deleteEditorDocumentRequest(deleteCandidateId, 1, '__Host-chess-tactics-access=abc');
  const staleDeleteCandidateBody = JSON.parse(staleDeleteCandidate.body);
  if (
    staleDeleteCandidate.statusCode !== 409 ||
    staleDeleteCandidateBody.error !== 'editor_document_revision_conflict' ||
    staleDeleteCandidateBody.document.revision !== 2 ||
    staleDeleteCandidateBody.document.level.name !== 'Delete Candidate Autosaved'
  ) {
    throw new Error(`Stale never-saved document deletion lost CAS protection: ${staleDeleteCandidate.statusCode} ${staleDeleteCandidate.body}`);
  }
  const deletedCandidate = await deleteEditorDocumentRequest(deleteCandidateId, 2, '__Host-chess-tactics-access=abc');
  const deletedCandidateBody = JSON.parse(deletedCandidate.body);
  if (
    deletedCandidate.statusCode !== 200 ||
    deletedCandidateBody.document.document_id !== deleteCandidateId ||
    deletedCandidateBody.document.revision !== 2 ||
    deletedCandidateBody.document.never_saved !== true ||
    deletedCandidateBody.document.level.name !== 'Delete Candidate Autosaved'
  ) {
    throw new Error(`Never-saved document deletion returned the wrong document: ${deletedCandidate.statusCode} ${deletedCandidate.body}`);
  }
  const deletedCandidateRead = await get(`/api/editor-documents/${deleteCandidateId}`, { cookie: '__Host-chess-tactics-access=abc' });
  if (deletedCandidateRead.statusCode !== 404 || JSON.parse(deletedCandidateRead.body).error !== 'editor_document_not_found') {
    throw new Error(`Deleted never-saved document remained readable: ${deletedCandidateRead.statusCode} ${deletedCandidateRead.body}`);
  }

  const workspaceBeforeReservedCollision = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  const workspaceBeforeReservedCollisionBody = JSON.parse(workspaceBeforeReservedCollision.body);
  const reservedCollisionAttempt = await request(
    'PUT', '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { revision: 1 })),
  );
  if (discardNeverSaved.statusCode !== 409 || JSON.parse(discardNeverSaved.body).error !== 'no_saved_level') {
    throw new Error(`Never-saved document should have no discard target: ${discardNeverSaved.statusCode} ${discardNeverSaved.body}`);
  }
  const sourceCaptureBoard = {
    cols: 8,
    rows: 12,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    fences: {},
    fencePosts: {},
    walls: {},
    wallArt: {},
    featureCuts: {},
    featureExits: {},
  };
  const sourceCaptureFrame = boardRender.initialPredrawnGenerationFrame(sourceCaptureBoard);
  const sourceCaptureBoardCode = boardRender.encodeBoard({
    ...sourceCaptureBoard,
    backgroundMode: 'legacy',
    predrawnGenerationFrame: sourceCaptureFrame,
  });
  const newEditorAutosaveLevel = {
    ...workspaceLevel,
    id: 'l2',
    name: 'New Working Level Autosaved',
    boardCode: sourceCaptureBoardCode,
  };
  const newEditorAutosave = await request(
    'PUT', `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { revision: 1, level: newEditorAutosaveLevel })),
  );
  if (newEditorAutosave.statusCode !== 200 || JSON.parse(newEditorAutosave.body).document.revision !== 2) {
    throw new Error(`New document autosave failed: ${newEditorAutosave.statusCode} ${newEditorAutosave.body}`);
  }
  // Generation References freeze the acknowledged working copy. This document has never crossed
  // Save, so successful creation here proves artwork handoff is independent from publication.
  const sourcePng = syntheticPng(
    sourceCaptureFrame.width,
    sourceCaptureFrame.height,
    '#102030',
    '#6090a0',
  );
  const sourcePngSha256 = crypto.createHash('sha256').update(sourcePng).digest('hex');
  const sourceArtworkPayload = {
    kind: 'source',
    label: 'Working-copy generation source',
    operation: {
      kind: 'generation-source-v2',
      capture: 'working-copy-generation-frame',
    },
    provenance: {
      pipeline: 'smoke-source-capture',
      sourceSha256: sourcePngSha256,
    },
    idempotency_key: `background-source:${newDocumentId}`,
  };
  const sourceArtworkCreate = await createBackgroundVersionRequest(
    newDocumentId,
    sourceArtworkPayload,
  );
  const sourceArtworkCreateBody = JSON.parse(sourceArtworkCreate.body);
  const sourceArtworkDraft = sourceArtworkCreateBody.version;
  const prematureAttempt = await createGenerationAttemptRequest(newDocumentId, {
    label: 'Source must be uploaded first',
    source_version_id: sourceArtworkDraft?.id,
    idempotency_key: `generation-attempt-premature:${newDocumentId}`,
  });
  const sourceArtworkUpload = await uploadBackgroundVersionRequest(
    newDocumentId,
    sourceArtworkDraft.id,
    sourceArtworkDraft.row_revision,
    sourcePng,
  );
  const sourceArtworkReady = JSON.parse(sourceArtworkUpload.body).version;
  const firstNewEditorSave = await request(
    'POST', `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { revision: 2 })),
  );
  const firstNewEditorSaveBody = JSON.parse(firstNewEditorSave.body);
  if (
    firstNewEditorSave.statusCode !== 200 ||
    firstNewEditorSaveBody.document.revision !== 3 ||
    firstNewEditorSaveBody.document.saved_revision !== 3 ||
    firstNewEditorSaveBody.workspace_revision !== 6 ||
    firstNewEditorSaveBody.thumbnail_ready !== true ||
    firstNewEditorSaveBody.document.dirty !== false
  ) {
    throw new Error(`First Save should promote a new document: ${firstNewEditorSave.statusCode} ${firstNewEditorSave.body}\nbackend output:\n${output}`);
  }
  const workspaceWithNewLevel = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  const workspaceWithNewLevelBody = JSON.parse(workspaceWithNewLevel.body);
  if (
    workspaceWithNewLevelBody.levels.l2.name !== 'New Working Level Autosaved' ||
    !/^\/api\/campaign-workspace\/level-thumbnails\/l2\/[0-9a-f]{64}\.png$/.test(
      workspaceWithNewLevelBody.thumbnail_urls.l2 || '',
    )
  ) {
    throw new Error(`First Save did not create the canonical Level: ${workspaceWithNewLevel.body}\nbackend output:\n${output}`);
  }
  const anonymousStoredListThumbnail = await get(workspaceWithNewLevelBody.thumbnail_urls.l2);
  const storedListThumbnail = await get(
    workspaceWithNewLevelBody.thumbnail_urls.l2,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const privateThumbnailBlob = await queryDb(
    `SELECT derivative.blob_sha256, blob.published_at
       FROM level_thumbnail_derivatives derivative
       JOIN media_blobs blob ON blob.sha256 = derivative.blob_sha256
      WHERE derivative.authority_key = $1`,
    ['user:player@example.com:l2'],
  );
  const anonymousPrivateThumbnailBlob = privateThumbnailBlob.rows[0]
    ? await get(`/api/media/${privateThumbnailBlob.rows[0].blob_sha256}`)
    : { statusCode: 0 };
  if (
    anonymousStoredListThumbnail.statusCode !== 401
    || storedListThumbnail.statusCode !== 200
    || storedListThumbnail.headers['content-type'] !== 'image/png'
    || privateThumbnailBlob.rows.length !== 1
    || privateThumbnailBlob.rows[0].published_at !== null
    || anonymousPrivateThumbnailBlob.statusCode !== 404
  ) {
    throw new Error(`Private canonical thumbnail escaped owner delivery: ${anonymousStoredListThumbnail.statusCode} / ${storedListThumbnail.statusCode} / ${JSON.stringify(privateThumbnailBlob.rows)} / ${anonymousPrivateThumbnailBlob.statusCode}`);
  }
  const deleteSavedBaseline = await deleteEditorDocumentRequest(newDocumentId, 3, '__Host-chess-tactics-access=abc');
  const deleteSavedBaselineBody = JSON.parse(deleteSavedBaseline.body);
  if (
    deleteSavedBaseline.statusCode !== 409 ||
    deleteSavedBaselineBody.error !== 'editor_document_delete_requires_never_saved' ||
    deleteSavedBaselineBody.document.document_id !== newDocumentId ||
    deleteSavedBaselineBody.document.has_saved_baseline !== true
  ) {
    throw new Error(`Saved-baseline editor document was deletable: ${deleteSavedBaseline.statusCode} ${deleteSavedBaseline.body}`);
  }
  const workspaceAfterRejectedDocumentDelete = await get('/api/campaign-workspace', { cookie: '__Host-chess-tactics-access=abc' });
  if (JSON.parse(workspaceAfterRejectedDocumentDelete.body).levels.l2.name !== 'New Working Level Autosaved') {
    throw new Error(`Rejected editor-document deletion changed canonical content: ${workspaceAfterRejectedDocumentDelete.body}`);
  }
  const postSaveDraft = await request(
    'PUT', `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { revision: 3, level: { ...newEditorAutosaveLevel, name: 'Throw This Away' } })),
  );
  if (postSaveDraft.statusCode !== 200 || JSON.parse(postSaveDraft.body).document.revision !== 4) {
    throw new Error(`Post-save draft failed: ${postSaveDraft.statusCode} ${postSaveDraft.body}`);
  }
  const discardNewEditorDraft = await request(
    'POST', `/api/editor-documents/${newDocumentId}/discard`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { revision: 4 })),
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

  // Immutable pre-drawn background lineage is document-owned while in review.
  // Private Save pins exact selected ids without making bytes public. A later
  // explicit public-map publication crosses that boundary atomically.
  const backgroundWorldBounds = {
    minX: sourceCaptureFrame.x,
    minY: sourceCaptureFrame.y,
    width: sourceCaptureFrame.width,
    height: sourceCaptureFrame.height,
  };
  const versionedBoardCode = (backgroundId, occlusionId, {
    rows = 12,
  } = {}) => Buffer.from(JSON.stringify({
    c: 8,
    r: rows,
    pd: [
      2,
      backgroundId,
      occlusionId,
      64,
      64,
      backgroundWorldBounds.minX,
      backgroundWorldBounds.minY,
      backgroundWorldBounds.width,
      backgroundWorldBounds.height,
    ],
  }), 'utf8').toString('base64url');
  const environmentGeometrySha256 = (boardCode) => crypto.createHash('sha256').update(
    boardRender.predrawnEnvironmentGeometryFingerprintInput(boardRender.decodeBoard(boardCode)),
    'utf8',
  ).digest('hex');
  const legacyEnvironmentGeometrySha256 = (boardCode) => crypto.createHash('sha256').update(
    boardRender.predrawnEnvironmentGeometryFingerprintInputV1(boardRender.decodeBoard(boardCode)),
    'utf8',
  ).digest('hex');
  const boardCodeWith = (boardCode, changes) => boardRender.encodeBoard({
    ...boardRender.decodeBoard(boardCode),
    ...changes,
  });
  const privateEnvironmentGeometrySha256 = environmentGeometrySha256(
    versionedBoardCode(crypto.randomUUID(), null),
  );
  const sourceArtworkReplay = await createBackgroundVersionRequest(
    newDocumentId,
    sourceArtworkPayload,
  );
  const sourceArtworkList = await get(
    `/api/editor-documents/${newDocumentId}/background-versions?kind=source&status=ready`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const generationAttemptPayload = {
    label: 'Primary AI artwork attempt',
    source_version_id: sourceArtworkReady.id,
    idempotency_key: `generation-attempt:${newDocumentId}:primary`,
  };
  const generationAttemptCreate = await createGenerationAttemptRequest(
    newDocumentId,
    generationAttemptPayload,
  );
  const generationAttempt = JSON.parse(generationAttemptCreate.body).attempt;
  const generationAttemptReplay = await createGenerationAttemptRequest(
    newDocumentId,
    generationAttemptPayload,
  );
  const generationAttemptList = await get(
    `/api/editor-documents/${newDocumentId}/generation-attempts?status=active`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  if (
    sourceArtworkCreate.statusCode !== 201
    || sourceArtworkDraft?.kind !== 'source'
    || sourceArtworkDraft?.status !== 'draft'
    || sourceArtworkDraft?.operation?.kind !== 'generation-source-v2'
    || sourceArtworkDraft?.operation?.workingCopyDocumentRevision !== 2
    || !/^[0-9a-f]{64}$/.test(sourceArtworkDraft?.operation?.workingCopyLevelSha256 || '')
    || sourceArtworkDraft?.operation?.semanticRequest?.schema
      !== 'predrawn-generation-semantic-request-v2'
    || sourceArtworkDraft?.operation?.backgroundMode !== 'legacy'
    || sourceArtworkDraft?.operation?.coordinateBasis !== 'board-world-pixels-v1'
    || sourceArtworkDraft?.operation?.environmentGeometrySha256
      !== privateEnvironmentGeometrySha256
    || sourceArtworkDraft?.provenance?.environmentGeometrySha256
      !== privateEnvironmentGeometrySha256
    || sourceArtworkDraft?.operation?.generationFrame?.width !== sourceCaptureFrame.width
    || sourceArtworkDraft?.operation?.generationFrame?.height !== sourceCaptureFrame.height
    || sourceArtworkDraft?.operation?.viewingPane?.minX !== backgroundWorldBounds.minX
    || sourceArtworkDraft?.operation?.viewingPane?.minY !== backgroundWorldBounds.minY
    || prematureAttempt.statusCode !== 409
    || JSON.parse(prematureAttempt.body).error !== 'generation_attempt_source_not_ready'
    || sourceArtworkUpload.statusCode !== 200
    || sourceArtworkReady?.content_sha256 !== sourcePngSha256
    || sourceArtworkReady?.frame_width !== sourceCaptureFrame.width
    || sourceArtworkReady?.frame_height !== sourceCaptureFrame.height
    || sourceArtworkReplay.statusCode !== 200
    || JSON.parse(sourceArtworkReplay.body).idempotent_replay !== true
    || sourceArtworkList.statusCode !== 200
    || JSON.parse(sourceArtworkList.body).versions?.length !== 1
    || JSON.parse(sourceArtworkList.body).versions[0]?.id !== sourceArtworkReady.id
    || generationAttemptCreate.statusCode !== 201
    || generationAttempt?.origin !== 'source'
    || generationAttempt?.source_version_id !== sourceArtworkReady.id
    || generationAttempt?.generated_version_id !== null
    || generationAttemptReplay.statusCode !== 200
    || JSON.parse(generationAttemptReplay.body).attempt?.id !== generationAttempt.id
    || JSON.parse(generationAttemptReplay.body).idempotent_replay !== true
    || generationAttemptList.statusCode !== 200
    || !JSON.parse(generationAttemptList.body).attempts?.some(
      (attempt) => attempt.id === generationAttempt.id,
    )
  ) {
    throw new Error(`Source artwork / generation-attempt lifecycle failed: ${sourceArtworkCreate.statusCode} ${sourceArtworkCreate.body} / ${prematureAttempt.statusCode} ${prematureAttempt.body} / ${sourceArtworkUpload.statusCode} ${sourceArtworkUpload.body} / ${sourceArtworkReplay.statusCode} ${sourceArtworkReplay.body} / ${sourceArtworkList.statusCode} ${sourceArtworkList.body} / ${generationAttemptCreate.statusCode} ${generationAttemptCreate.body} / ${generationAttemptReplay.statusCode} ${generationAttemptReplay.body} / ${generationAttemptList.statusCode} ${generationAttemptList.body}`);
  }
  const canonicalFixtureJson = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonicalFixtureJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${canonicalFixtureJson(value[key])}`
      )).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const sha256FixtureJson = (value) => crypto.createHash('sha256')
    .update(canonicalFixtureJson(value), 'utf8')
    .digest('hex');
  // These rows deliberately bypass the Source Artwork endpoint so later smoke
  // cases can seed legacy and cross-admin histories. Keep the direct fixture as
  // strict as the endpoint: rebuild the complete semantic packet and immutable
  // attempt request whenever its document or board snapshot changes.
  const seedGenerationAttemptFixture = async (
    documentId,
    expectedEnvironmentGeometrySha256,
    fixtureBoardCode,
    label,
  ) => {
    const sourceVersionId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const documentResult = await queryDb(
      `SELECT level_id, revision, body
         FROM level_working_copies
        WHERE document_id = $1`,
      [documentId],
    );
    const document = documentResult.rows[0];
    const documentRevision = Number(document?.revision);
    if (!document || !Number.isSafeInteger(documentRevision) || documentRevision < 1) {
      throw new Error(`Generation-attempt fixture requires a valid document: ${documentId}`);
    }
    const fixtureBoard = boardRender.decodeBoard(fixtureBoardCode);
    const canonicalBoardCode = boardRender.encodeBoard({
      ...fixtureBoard,
      backgroundMode: 'legacy',
      predrawnGenerationFrame: sourceCaptureFrame,
    });
    const actualGeometrySha256 = environmentGeometrySha256(canonicalBoardCode);
    if (actualGeometrySha256 !== expectedEnvironmentGeometrySha256) {
      throw new Error(
        `Generation-attempt fixture geometry mismatch: ${actualGeometrySha256} !== ${expectedEnvironmentGeometrySha256}`,
      );
    }
    const fixtureLevel = {
      ...document.body,
      id: document.level_id,
      boardCode: canonicalBoardCode,
    };
    const semanticBoardCode = boardRender.encodeBoard({
      ...boardRender.decodeBoard(canonicalBoardCode),
      units: {},
      cover: {},
      coverTypes: {},
    });
    const semanticBoardSha256 = crypto.createHash('sha256')
      .update(semanticBoardCode, 'utf8')
      .digest('hex');
    const workingCopyLevelSha256 = sha256FixtureJson(fixtureLevel);
    const generationFrame = {
      version: sourceCaptureFrame.version,
      x: sourceCaptureFrame.x,
      y: sourceCaptureFrame.y,
      width: sourceCaptureFrame.width,
      height: sourceCaptureFrame.height,
    };
    const semanticRequest = {
      schema: SOURCE_SEMANTIC_REQUEST_SCHEMA,
      levelId: document.level_id,
      workingCopyDocumentRevision: documentRevision,
      workingCopyLevelSha256,
      boardCode: semanticBoardCode,
      boardSha256: semanticBoardSha256,
      generationFrame,
      worldBounds: backgroundWorldBounds,
      backgroundMode: 'legacy',
      sourceBackgroundVersionId: null,
      sourceOcclusionVersionId: null,
      environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environmentGeometrySha256: expectedEnvironmentGeometrySha256,
    };
    const semanticRequestSha256 = sha256FixtureJson(semanticRequest);
    const sourceOperation = {
      kind: 'generation-source-v2',
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: backgroundWorldBounds,
      generationFrame,
      backgroundMode: 'legacy',
      sourceBackgroundVersionId: null,
      sourceOcclusionVersionId: null,
      workingCopyDocumentRevision: documentRevision,
      workingCopyLevelSha256,
      environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environmentGeometrySha256: expectedEnvironmentGeometrySha256,
      semanticBoardSha256,
      semanticRequest,
      semanticRequestSha256,
    };
    const sourceProvenance = {
      pipeline: 'smoke-seeded-source',
      sourceSha256: sourcePngSha256,
      workingCopyDocumentRevision: documentRevision,
      workingCopyLevelSha256,
      backgroundMode: 'legacy',
      sourceBackgroundVersionId: null,
      sourceOcclusionVersionId: null,
      generationFrame,
      environmentGeometrySha256: expectedEnvironmentGeometrySha256,
      semanticBoardSha256,
      semanticRequestSha256,
    };
    const sourceRequestCore = {
      schema: ATTEMPT_SOURCE_REQUEST_SCHEMA,
      sourceArtworkVersionId: sourceVersionId,
      sourceArtworkSha256: sourcePngSha256,
      semanticRequestSha256,
      semanticRequest,
    };
    const sourceRequest = {
      ...sourceRequestCore,
      requestSha256: sha256FixtureJson(sourceRequestCore),
    };
    const sourceFixture = {
      id: sourceVersionId,
      document_id: documentId,
      level_id: document.level_id,
      kind: 'source',
      blob_sha256: sourcePngSha256,
      world_bounds: backgroundWorldBounds,
      operation: sourceOperation,
      provenance: sourceProvenance,
      status: 'ready',
    };
    const sourceIssue = sourceArtworkVersionContractIssue(sourceFixture);
    const sourceRequestIssue = generationAttemptSourceRequestIssue(
      { source_request: sourceRequest },
      sourceFixture,
    );
    if (sourceIssue || sourceRequestIssue) {
      throw new Error(
        `Invalid generation-attempt fixture: ${sourceIssue || sourceRequestIssue}`,
      );
    }
    await queryDb(
      `WITH source AS (
         INSERT INTO predrawn_background_versions (
           id, document_id, owner_email, level_id, kind, label,
           parent_version_id, source_background_version_id,
           blob_sha256, width, height, world_bounds, operation, provenance,
           status, row_revision, created_by_email, created_by_name,
           created_at, updated_at, updated_by
         )
         SELECT
           $1, document.document_id, document.owner_email, document.level_id,
           'source', $4, NULL, NULL,
           template.blob_sha256, template.width, template.height, template.world_bounds,
           $5::jsonb, $6::jsonb,
           'ready', 1, document.owner_email, 'Smoke fixture',
           now(), now(), document.owner_email
         FROM predrawn_background_versions template
         JOIN level_working_copies document ON document.document_id = $3
         WHERE template.id = $2
         RETURNING *
       ), attempt AS (
         INSERT INTO predrawn_generation_attempts (
           id, document_id, owner_email, level_id, label, origin,
           source_version_id, source_request,
           created_by_email, created_by_name, updated_by
         )
         SELECT
           $7, source.document_id, source.owner_email, source.level_id,
           $4, 'source', source.id, $8::jsonb,
           source.created_by_email, source.created_by_name, source.updated_by
         FROM source
         RETURNING *
       )
       INSERT INTO predrawn_generation_attempt_events (
         document_id, attempt_id, action, actor_email, actor_name, details
       )
       SELECT
         attempt.document_id, attempt.id, 'created',
         attempt.created_by_email, attempt.created_by_name,
         '{"fixture":"smoke-seeded-source"}'::jsonb
       FROM attempt`,
      [
        sourceVersionId,
        sourceArtworkReady.id,
        documentId,
        label,
        JSON.stringify(sourceOperation),
        JSON.stringify(sourceProvenance),
        attemptId,
        JSON.stringify(sourceRequest),
      ],
    );
    return { sourceVersionId, attemptId };
  };
  const rawPng = syntheticPng(64, 64, '#102030', '#60a080');
  const rawPngSha256 = crypto.createHash('sha256').update(rawPng).digest('hex');
  const rawBackgroundPayload = {
    kind: 'raw',
    attempt_id: generationAttempt.id,
    label: 'Untouched smoke generation',
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: backgroundWorldBounds,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
    },
    provenance: {
      pipeline: 'smoke-imagegen',
      run: 'raw-1',
      sourceSha256: rawPngSha256,
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
    },
    idempotency_key: `background-raw:${newDocumentId}`,
  };
  const rawContractCreateCases = [
    {
      suffix: 'coordinate-basis',
      operation: { ...rawBackgroundPayload.operation, coordinateBasis: 'frame-pixels' },
      detail: 'coordinateBasis',
    },
    {
      suffix: 'untouched',
      operation: { ...rawBackgroundPayload.operation, untouched: false },
      detail: 'untouched',
    },
    {
      suffix: 'viewing-pane',
      operation: {
        ...rawBackgroundPayload.operation,
        viewingPane: { ...backgroundWorldBounds, minX: backgroundWorldBounds.minX + 1 },
      },
      detail: 'viewingPane',
    },
  ];
  for (const invalid of rawContractCreateCases) {
    const idempotencyKey = `background-invalid-raw-${invalid.suffix}:${newDocumentId}`;
    const response = await createBackgroundVersionRequest(newDocumentId, {
      ...rawBackgroundPayload,
      operation: invalid.operation,
      idempotency_key: idempotencyKey,
    });
    const body = JSON.parse(response.body);
    if (
      response.statusCode !== 400
      || body.error !== 'invalid_background_version'
      || !String(body.details || '').includes(invalid.detail)
    ) {
      throw new Error(`Invalid raw ${invalid.suffix} contract was accepted: ${response.statusCode} ${response.body}`);
    }
  }
  const unfencedBackgroundCreate = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions`,
    {
      cookie: '__Host-chess-tactics-access=abc',
      'content-type': 'application/json',
      'idempotency-key': `background-unfenced:${newDocumentId}`,
    },
    JSON.stringify({
      ...rawBackgroundPayload,
      idempotency_key: `background-unfenced:${newDocumentId}`,
    }),
    5000,
  );
  const currentBackgroundAuthority = editorAuthorities.get(
    editorAuthorityKey(newDocumentId, '__Host-chess-tactics-access=abc'),
  );
  const invalidFenceBackgroundCreate = await createBackgroundVersionRequest(
    newDocumentId,
    {
      ...rawBackgroundPayload,
      idempotency_key: `background-invalid-fence:${newDocumentId}`,
    },
    {
      authority: { ...currentBackgroundAuthority, edit_session_key: 'b'.repeat(64) },
    },
  );
  if (
    unfencedBackgroundCreate.statusCode !== 400
    || JSON.parse(unfencedBackgroundCreate.body).error !== 'editor_document_edit_session_required'
    || invalidFenceBackgroundCreate.statusCode !== 403
    || JSON.parse(invalidFenceBackgroundCreate.body).error !== 'editor_document_edit_session_key_invalid'
  ) {
    throw new Error(`Background version writer fence was bypassed: ${unfencedBackgroundCreate.statusCode} ${unfencedBackgroundCreate.body} / ${invalidFenceBackgroundCreate.statusCode} ${invalidFenceBackgroundCreate.body}`);
  }
  const rawBackgroundCreate = await createBackgroundVersionRequest(newDocumentId, rawBackgroundPayload);
  const rawBackgroundCreateBody = JSON.parse(rawBackgroundCreate.body);
  const rawBackground = rawBackgroundCreateBody.version;
  const rawBackgroundReplay = await createBackgroundVersionRequest(newDocumentId, rawBackgroundPayload);
  const conflictingRawReplay = await createBackgroundVersionRequest(newDocumentId, {
    ...rawBackgroundPayload,
    label: 'Conflicting retry',
  });
  const readyBeforeRawUpload = await get(
    `/api/editor-documents/${newDocumentId}/background-versions?status=ready`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const draftsBeforeRawUpload = await get(
    `/api/editor-documents/${newDocumentId}/background-versions?status=draft`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  if (
    rawBackgroundCreate.statusCode !== 201 || !rawBackground?.id || rawBackground.status !== 'draft'
    || rawBackground.content_sha256 !== null || rawBackground.row_revision !== 0
    || rawBackground.operation?.sourceArtworkVersionId !== sourceArtworkReady.id
    || rawBackground.operation?.sourceArtworkSha256 !== sourcePngSha256
    || rawBackgroundCreateBody.attempt?.generated_version_id !== rawBackground.id
    || rawBackgroundReplay.statusCode !== 200
    || JSON.parse(rawBackgroundReplay.body).version.id !== rawBackground.id
    || JSON.parse(rawBackgroundReplay.body).idempotent_replay !== true
    || conflictingRawReplay.statusCode !== 409
    || JSON.parse(conflictingRawReplay.body).error !== 'background_version_idempotency_conflict'
    || readyBeforeRawUpload.statusCode !== 200
    || draftsBeforeRawUpload.statusCode !== 200
    || JSON.parse(readyBeforeRawUpload.body).versions.some((version) => version.id === rawBackground.id)
    || !JSON.parse(draftsBeforeRawUpload.body).versions.some((version) => (
      version.id === rawBackground.id && version.status === 'draft'
    ))
  ) {
    throw new Error(`Background metadata create/idempotency failed: ${rawBackgroundCreate.statusCode} ${rawBackgroundCreate.body} / ${rawBackgroundReplay.body} / ${conflictingRawReplay.body}`);
  }
  const rawHashMismatchUpload = await uploadBackgroundVersionRequest(
    newDocumentId,
    rawBackground.id,
    0,
    syntheticPng(64, 64, '#303030', '#909090'),
  );
  const heldRawUpload = beginHeldBackgroundVersionUpload(
    newDocumentId,
    rawBackground.id,
    0,
    rawPng,
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const concurrentRawUpload = await uploadBackgroundVersionRequest(
    newDocumentId,
    rawBackground.id,
    0,
    rawPng,
  );
  heldRawUpload.finish();
  const rawUpload = await heldRawUpload.response;
  const rawUploadBody = JSON.parse(rawUpload.body);
  const rawReplacement = await uploadBackgroundVersionRequest(
    newDocumentId,
    rawBackground.id,
    0,
    syntheticPng(64, 64, '#301020', '#a06080'),
  );
  if (
    rawHashMismatchUpload.statusCode !== 409
    || JSON.parse(rawHashMismatchUpload.body).error !== 'background_version_content_hash_mismatch'
    || concurrentRawUpload.statusCode !== 409
    || JSON.parse(concurrentRawUpload.body).error !== 'background_version_upload_busy'
    || rawUpload.statusCode !== 200 || !rawUploadBody.version.content_sha256
    || rawUploadBody.version.frame_width !== 64 || rawUploadBody.version.frame_height !== 64
    || rawUploadBody.version.row_revision !== 1 || !rawUploadBody.version.content_url
    || rawReplacement.statusCode !== 409
    || JSON.parse(rawReplacement.body).error !== 'background_version_content_immutable'
  ) {
    throw new Error(`Background immutable upload failed: ${rawHashMismatchUpload.statusCode} ${rawHashMismatchUpload.body} / ${concurrentRawUpload.statusCode} ${concurrentRawUpload.body} / ${rawUpload.statusCode} ${rawUpload.body} / ${rawReplacement.body}`);
  }

  // Reproduce an immutable raw written during the short-lived contract gap:
  // the pixels, bounds, and v1 environment digest are exact, but the otherwise
  // implicit board-world basis and viewing pane were not persisted. Reuse must
  // preserve that metadata and add only an externally proven sidecar binding.
  const pipelineReuseLegacyGeometrySha256 = legacyEnvironmentGeometrySha256(sourceCaptureBoardCode);
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = jsonb_set(
              jsonb_set(
                operation - 'coordinateBasis' - 'viewingPane',
                '{environmentGeometrySchema}',
                '"predrawn-environment-geometry-v1"'::jsonb
              ),
              '{environmentGeometrySha256}',
              to_jsonb($2::text)
            ),
            provenance = jsonb_set(
              provenance,
              '{environmentGeometrySha256}',
              to_jsonb($2::text)
            )
      WHERE document_id = $1 AND id = $3`,
    [newDocumentId, pipelineReuseLegacyGeometrySha256, rawBackground.id],
  );
  const legacyPipelineSourceList = await get(
    `/api/editor-documents/${newDocumentId}/background-versions?status=ready&kind=raw`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const listedLegacyPipelineSource = JSON.parse(legacyPipelineSourceList.body).versions
    .find((version) => version.id === rawBackground.id);
  const rawBindingsBeforePipelineReuse = await queryDb(
    'SELECT version_id FROM predrawn_background_raw_contract_bindings WHERE version_id = $1',
    [rawBackground.id],
  );
  if (
    legacyPipelineSourceList.statusCode !== 200
    || listedLegacyPipelineSource?.pipeline_source_eligible !== true
    || listedLegacyPipelineSource?.pipeline_source_issue !== null
    || Object.hasOwn(listedLegacyPipelineSource?.operation || {}, 'coordinateBasis')
    || Object.hasOwn(listedLegacyPipelineSource?.operation || {}, 'viewingPane')
    || rawBindingsBeforePipelineReuse.rows.length !== 0
  ) {
    throw new Error(`Legacy Raw Pipeline Source eligibility was not exposed honestly: ${legacyPipelineSourceList.statusCode} ${legacyPipelineSourceList.body}`);
  }

  const historicalSourceAttemptId = crypto.randomUUID();
  await queryDb(
    `INSERT INTO predrawn_generation_attempts (
       id, document_id, owner_email, level_id, label, origin,
       source_version_id, generated_version_id,
       created_by_email, created_by_name, updated_by
     )
     SELECT
       $3, document_id, owner_email, level_id, 'Historical source slot', 'migrated-history',
       NULL, $2, created_by_email, created_by_name, updated_by
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $4`,
    [newDocumentId, rawBackground.id, historicalSourceAttemptId, generationAttempt.id],
  );
  // Make the retained raw historical-only for this reuse case. The ordinary
  // source-bound attempt is restored after the new processing child is archived
  // so the later full-lineage smoke remains unchanged.
  await queryDb(
    `UPDATE predrawn_generation_attempts
        SET generated_version_id = NULL
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, generationAttempt.id],
  );
  const versionCountBeforePipelineReuse = await queryDb(
    'SELECT count(*)::integer AS count FROM predrawn_background_versions WHERE document_id = $1',
    [newDocumentId],
  );
  const pipelineReuseKey = `generation-attempt:${newDocumentId}:historical-create`;
  const pipelineReuseCreate = await createGenerationAttemptRequest(newDocumentId, {
    label: 'Historical source slot',
    pipeline_source_version_id: rawBackground.id,
    idempotency_key: pipelineReuseKey,
  });
  const pipelineReuseBody = JSON.parse(pipelineReuseCreate.body);
  const pipelineReuseAttempt = pipelineReuseBody.attempt;
  const pipelineReuseReplay = await createGenerationAttemptRequest(newDocumentId, {
    label: 'Historical source slot',
    pipeline_source_version_id: rawBackground.id,
    idempotency_key: pipelineReuseKey,
  });
  const versionCountAfterPipelineReuse = await queryDb(
    'SELECT count(*)::integer AS count FROM predrawn_background_versions WHERE document_id = $1',
    [newDocumentId],
  );
  const sourceAttemptAfterReuse = await queryDb(
    `SELECT status, row_revision, generated_version_id, warped_version_id, occlusion_version_id
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, historicalSourceAttemptId],
  );
  const rawBindingAfterPipelineReuse = await queryDb(
    `SELECT binding.legacy_operation_kind, binding.legacy_operation_sha256,
            binding.coordinate_basis, binding.viewing_pane,
            version.operation
       FROM predrawn_background_raw_contract_bindings binding
       JOIN predrawn_background_versions version ON version.id = binding.version_id
      WHERE binding.version_id = $1 AND binding.document_id = $2`,
    [rawBackground.id, newDocumentId],
  );
  const persistedRawBinding = rawBindingAfterPipelineReuse.rows[0];
  if (
    pipelineReuseCreate.statusCode !== 201
    || pipelineReuseAttempt?.origin !== 'pipeline-source'
    || pipelineReuseAttempt?.label !== 'Historical source slot'
    || pipelineReuseAttempt?.source_version_id !== rawBackground.id
    || pipelineReuseAttempt?.source_attempt_id !== historicalSourceAttemptId
    || pipelineReuseAttempt?.generated_version_id !== rawBackground.id
    || pipelineReuseAttempt?.source_request?.schema !== 'predrawn-processing-attempt-input-v1'
    || pipelineReuseAttempt?.source_request?.inputRole !== 'raw-pipeline-source'
    || pipelineReuseAttempt?.source_request?.inputVersionId !== rawBackground.id
    || pipelineReuseAttempt?.source_request?.inputSha256 !== rawPngSha256
    || pipelineReuseAttempt?.source_request?.sourceAttemptId !== historicalSourceAttemptId
    || pipelineReuseReplay.statusCode !== 200
    || JSON.parse(pipelineReuseReplay.body).attempt?.id !== pipelineReuseAttempt.id
    || JSON.parse(pipelineReuseReplay.body).idempotent_replay !== true
    || Number(versionCountBeforePipelineReuse.rows[0]?.count)
      !== Number(versionCountAfterPipelineReuse.rows[0]?.count)
    || sourceAttemptAfterReuse.rows[0]?.status !== 'active'
    || String(sourceAttemptAfterReuse.rows[0]?.generated_version_id) !== rawBackground.id
    || sourceAttemptAfterReuse.rows[0]?.warped_version_id !== null
    || sourceAttemptAfterReuse.rows[0]?.occlusion_version_id !== null
    || rawBindingAfterPipelineReuse.rows.length !== 1
    || persistedRawBinding?.legacy_operation_kind !== 'raw-generated-v2'
    || persistedRawBinding?.coordinate_basis !== 'board-world-pixels-v1'
    || persistedRawBinding?.viewing_pane?.minX !== backgroundWorldBounds.minX
    || persistedRawBinding?.viewing_pane?.minY !== backgroundWorldBounds.minY
    || persistedRawBinding?.viewing_pane?.width !== backgroundWorldBounds.width
    || persistedRawBinding?.viewing_pane?.height !== backgroundWorldBounds.height
    || Object.hasOwn(persistedRawBinding?.operation || {}, 'coordinateBasis')
    || Object.hasOwn(persistedRawBinding?.operation || {}, 'viewingPane')
  ) {
    throw new Error(`Historical Raw Pipeline Source create failed: ${pipelineReuseCreate.statusCode} ${pipelineReuseCreate.body} / ${pipelineReuseReplay.statusCode} ${pipelineReuseReplay.body}`);
  }
  const archivedPipelineReuse = await archiveGenerationAttemptRequest(
    newDocumentId,
    pipelineReuseAttempt.id,
    pipelineReuseAttempt.row_revision,
  );
  if (
    archivedPipelineReuse.statusCode !== 200
    || JSON.parse(archivedPipelineReuse.body).attempt?.status !== 'archived'
  ) {
    throw new Error(`Pipeline-source child attempt archive failed: ${archivedPipelineReuse.statusCode} ${archivedPipelineReuse.body}`);
  }
  const archiveRawWhileHistoricalSourceActive = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions/${rawBackground.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { expected_revision: 1 })),
  );
  if (
    archiveRawWhileHistoricalSourceActive.statusCode !== 409
    || JSON.parse(archiveRawWhileHistoricalSourceActive.body).error
      !== 'background_version_attempt_in_use'
  ) {
    throw new Error(`Historical source attempt did not retain its raw-artwork guard: ${archiveRawWhileHistoricalSourceActive.statusCode} ${archiveRawWhileHistoricalSourceActive.body}`);
  }
  const archivedHistoricalSource = await archiveGenerationAttemptRequest(
    newDocumentId,
    historicalSourceAttemptId,
    Number(sourceAttemptAfterReuse.rows[0]?.row_revision),
  );
  if (
    archivedHistoricalSource.statusCode !== 200
    || JSON.parse(archivedHistoricalSource.body).attempt?.status !== 'archived'
  ) {
    throw new Error(`Historical source attempt archive failed: ${archivedHistoricalSource.statusCode} ${archivedHistoricalSource.body}`);
  }
  await queryDb(
    `UPDATE predrawn_generation_attempts
        SET generated_version_id = $3
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, generationAttempt.id, rawBackground.id],
  );

  const anonymousDraftBackground = await get(`/api/background-versions/${rawBackground.id}/content`);
  const rivalDraftBackground = await get(
    `/api/background-versions/${rawBackground.id}/content`,
    { cookie: '__Host-chess-tactics-access=rival' },
  );
  const ownerDraftBackground = await get(
    `/api/background-versions/${rawBackground.id}/content`,
    { cookie: '__Host-chess-tactics-access=abc' },
    5000,
  );
  const rivalBackgroundList = await get(
    `/api/editor-documents/${newDocumentId}/background-versions`,
    { cookie: '__Host-chess-tactics-access=rival' },
  );
  if (
    anonymousDraftBackground.statusCode !== 401 || rivalDraftBackground.statusCode !== 404
    || ownerDraftBackground.statusCode !== 200 || ownerDraftBackground.headers['content-type'] !== 'image/png'
    || rivalBackgroundList.statusCode !== 404
  ) {
    throw new Error(`Draft background access escaped its editor document: ${anonymousDraftBackground.statusCode} / ${rivalDraftBackground.statusCode} / ${ownerDraftBackground.statusCode} / ${rivalBackgroundList.statusCode}`);
  }

  const warpedPng = syntheticPng(64, 64, '#123420', '#7fc070');
  const warpedPngSha256 = crypto.createHash('sha256').update(warpedPng).digest('hex');
  const warpedPayload = {
    kind: 'warped',
    attempt_id: generationAttempt.id,
    label: 'Deterministic grid warp',
    parent_version_id: rawBackground.id,
    source_background_version_id: rawBackground.id,
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'grid-warp-v2',
      registration: 'v5;64,64,32,0,64,32,32,64,0,32;2,2;0,0.5,1;0,0.5,1;;1,1,33,32',
      sourceWidth: 64,
      sourceHeight: 64,
      rasterScale: 1,
      encoder: 'png-rgba8-filter0-stored-deflate-v1',
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
      outputSha256: warpedPngSha256,
      attemptProcessingRevision: 0,
    },
    provenance: {
      processor: 'shared-predrawn-rasterizer-v2',
      parentVersionId: rawBackground.id,
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
      outputSha256: warpedPngSha256,
      attemptProcessingRevision: 0,
    },
    idempotency_key: `background-warp:${newDocumentId}`,
  };
  const warpedCreate = await createBackgroundVersionRequest(newDocumentId, warpedPayload);
  const warpedCreateBody = JSON.parse(warpedCreate.body);
  const warpedVersion = warpedCreateBody.version;
  const pendingWarpReplay = await createBackgroundVersionRequest(newDocumentId, warpedPayload);
  const warpedHashMismatchUpload = await uploadBackgroundVersionRequest(
    newDocumentId,
    warpedVersion.id,
    warpedVersion.row_revision,
    syntheticPng(64, 64, '#202020', '#808080'),
  );
  const warpedUpload = await uploadBackgroundVersionRequest(
    newDocumentId,
    warpedVersion.id,
    warpedVersion.row_revision,
    warpedPng,
  );
  let warpedReady = JSON.parse(warpedUpload.body).version;
  if (
    warpedCreate.statusCode !== 201 || warpedUpload.statusCode !== 200
    || pendingWarpReplay.statusCode !== 200
    || JSON.parse(pendingWarpReplay.body).version?.id !== warpedVersion.id
    || JSON.parse(pendingWarpReplay.body).idempotent_replay !== true
    || warpedCreateBody.attempt?.processing_revision !== 0
    || warpedVersion.operation?.attemptProcessingRevision !== 0
    || warpedVersion.provenance?.attemptProcessingRevision !== 0
    || warpedHashMismatchUpload.statusCode !== 409
    || JSON.parse(warpedHashMismatchUpload.body).error !== 'background_version_content_hash_mismatch'
    || warpedReady.parent_version_id !== rawBackground.id
    || warpedReady.source_background_version_id !== rawBackground.id
  ) {
    throw new Error(`Warped background lineage/upload failed: ${warpedCreate.body} / ${pendingWarpReplay.body} / ${warpedHashMismatchUpload.body} / ${warpedUpload.body}`);
  }

  const discardedWarp = await discardGenerationAttemptWarpRequest(
    newDocumentId,
    generationAttempt.id,
    warpedReady.id,
    warpedCreateBody.attempt.row_revision,
  );
  const discardedWarpBody = JSON.parse(discardedWarp.body);
  const discardedWarpReplay = await discardGenerationAttemptWarpRequest(
    newDocumentId,
    generationAttempt.id,
    warpedReady.id,
    warpedCreateBody.attempt.row_revision,
  );
  const discardedWarpRow = await queryDb(
    `SELECT status, blob_sha256
       FROM predrawn_background_versions
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, warpedReady.id],
  );
  const retryWarpPayload = {
    ...warpedPayload,
    operation: {
      ...warpedPayload.operation,
      attemptProcessingRevision: 1,
    },
    provenance: {
      ...warpedPayload.provenance,
      attemptProcessingRevision: 1,
    },
    idempotency_key: `background-warp:${newDocumentId}:processing-1`,
  };
  const retriedWarpCreate = await createBackgroundVersionRequest(
    newDocumentId,
    retryWarpPayload,
  );
  const retriedWarpCreateBody = JSON.parse(retriedWarpCreate.body);
  const retriedWarpUpload = retriedWarpCreateBody.version
    ? await uploadBackgroundVersionRequest(
      newDocumentId,
      retriedWarpCreateBody.version.id,
      retriedWarpCreateBody.version.row_revision,
      warpedPng,
    )
    : null;
  if (retriedWarpUpload) warpedReady = JSON.parse(retriedWarpUpload.body).version;
  if (
    discardedWarp.statusCode !== 200
    || discardedWarpBody.attempt?.id !== generationAttempt.id
    || discardedWarpBody.attempt?.generated_version_id !== rawBackground.id
    || discardedWarpBody.attempt?.warped_version_id !== null
    || discardedWarpBody.attempt?.processing_revision !== 1
    || discardedWarpBody.discarded_version?.id !== warpedVersion.id
    || discardedWarpBody.discarded_version?.status !== 'archived'
    || discardedWarpBody.idempotent_replay !== false
    || discardedWarpReplay.statusCode !== 200
    || JSON.parse(discardedWarpReplay.body).idempotent_replay !== true
    || JSON.parse(discardedWarpReplay.body).attempt?.processing_revision !== 1
    || discardedWarpRow.rows[0]?.status !== 'archived'
    || discardedWarpRow.rows[0]?.blob_sha256 !== warpedPngSha256
    || retriedWarpCreate.statusCode !== 201
    || retriedWarpCreateBody.version?.id === warpedVersion.id
    || retriedWarpCreateBody.version?.operation?.attemptProcessingRevision !== 1
    || retriedWarpCreateBody.version?.provenance?.attemptProcessingRevision !== 1
    || retriedWarpCreateBody.attempt?.processing_revision !== 1
    || retriedWarpUpload?.statusCode !== 200
    || warpedReady.content_sha256 !== warpedPngSha256
  ) {
    throw new Error(`Same-slot warped retry failed: ${discardedWarp.statusCode} ${discardedWarp.body} / ${discardedWarpReplay.statusCode} ${discardedWarpReplay.body} / ${retriedWarpCreate.statusCode} ${retriedWarpCreate.body} / ${retriedWarpUpload?.statusCode} ${retriedWarpUpload?.body}`);
  }

  const fittedMoveHighlights = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}/generation-attempts/${generationAttempt.id}/move-highlight-profile`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      expected_revision: retriedWarpCreateBody.attempt.row_revision,
      expected_warped_version_id: warpedReady.id,
      cells: {},
    })),
    5000,
  );
  if (
    fittedMoveHighlights.statusCode !== 200
    || JSON.parse(fittedMoveHighlights.body).attempt?.move_highlight_profile_warped_version_id
      !== warpedReady.id
  ) {
    throw new Error(`Warped board cyan move-highlight fit failed: ${fittedMoveHighlights.statusCode} ${fittedMoveHighlights.body}`);
  }

  // Required-schema repair runs against retained current data, not an empty
  // approximation. A missing event relation must be rebuilt while an exact
  // pipeline-source attempt already exists; transitional migration 34 would
  // reject that valid row.
  await queryDb('DROP TABLE predrawn_generation_attempt_events');
  await queryDb(inlineMigrationSql(43));
  const repairedPipelineSourceAttempt = await queryDb(
    `SELECT origin, source_version_id, source_attempt_id, generated_version_id
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, pipelineReuseAttempt.id],
  );
  const repairedAttemptEventRelation = await queryDb(
    "SELECT to_regclass('public.predrawn_generation_attempt_events')::text AS relation",
  );
  if (
    repairedPipelineSourceAttempt.rows[0]?.origin !== 'pipeline-source'
    || String(repairedPipelineSourceAttempt.rows[0]?.source_version_id) !== rawBackground.id
    || String(repairedPipelineSourceAttempt.rows[0]?.source_attempt_id) !== historicalSourceAttemptId
    || String(repairedPipelineSourceAttempt.rows[0]?.generated_version_id) !== rawBackground.id
    || repairedAttemptEventRelation.rows[0]?.relation !== 'predrawn_generation_attempt_events'
  ) {
    throw new Error('Migration 43 did not repair a missing attempt-event relation around retained pipeline-source data');
  }

  // A retry-contract repair must also accept audit rows admitted by the later
  // cyan-profile feature. Replaying migration 39 would try to install its old
  // narrower action check and fail before the repair could converge.
  await queryDb(
    `INSERT INTO predrawn_generation_attempt_events
       (document_id, attempt_id, action, actor_email, actor_name, details)
     VALUES ($1, $2, 'move-highlight-profile-updated', $3, $4, '{}'::jsonb)`,
    [newDocumentId, generationAttempt.id, 'player@example.com', 'Tactics Player'],
  );
  await queryDb(
    `ALTER TABLE predrawn_generation_attempts
       DROP CONSTRAINT predrawn_generation_attempts_processing_revision_check,
       ADD CONSTRAINT predrawn_generation_attempts_processing_revision_check
         CHECK (processing_revision >= -1)`,
  );
  await queryDb(inlineMigrationSql(43));
  const repairedRetryContract = await queryDb(
    `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
      WHERE conrelid = 'predrawn_generation_attempts'::regclass
        AND conname = 'predrawn_generation_attempts_processing_revision_check'`,
  );
  const retainedMoveHighlightEvent = await queryDb(
    `SELECT count(*)::integer AS count
       FROM predrawn_generation_attempt_events
      WHERE document_id = $1
        AND attempt_id = $2
        AND action = 'move-highlight-profile-updated'`,
    [newDocumentId, generationAttempt.id],
  );
  if (
    repairedRetryContract.rows.length !== 1
    || !/\bprocessing_revision\b\s*>=\s*0\b/i.test(
      String(repairedRetryContract.rows[0]?.definition || ''),
    )
    || Number(retainedMoveHighlightEvent.rows[0]?.count) !== 1
  ) {
    throw new Error('Migration 43 did not repair retry topology while retaining move-highlight audit data');
  }

  const createMask = async (
    sourceId,
    suffix,
    geometrySha256 = privateEnvironmentGeometrySha256,
    parentVersionId = null,
    attemptId = generationAttempt.id,
  ) => {
    const png = syntheticPng(64, 64, '#000000', suffix === 'raw' ? '#440000' : '#004400');
    const outputSha256 = crypto.createHash('sha256').update(png).digest('hex');
    const response = await createBackgroundVersionRequest(newDocumentId, {
      kind: 'occlusion',
      attempt_id: attemptId,
      label: `Depth mask ${suffix}`,
      ...(parentVersionId ? { parent_version_id: parentVersionId } : {}),
      source_background_version_id: sourceId,
      world_bounds: backgroundWorldBounds,
      operation: {
        kind: 'occlusion-depth-v1',
        encoding: 'rgb24-signed-half-depth-alpha',
        sourceBackgroundVersionId: sourceId,
        maskCount: 0,
        encoder: 'png-rgba8-filter0-stored-deflate-v1',
        coordinateBasis: 'board-world-pixels-v1',
        environmentGeometrySchema: 'predrawn-environment-geometry-v2',
        environmentGeometrySha256: geometrySha256,
        outputSha256,
      },
      provenance: {
        processor: 'canonical-depth-mask-v1',
        sourceBackgroundVersionId: sourceId,
        environmentGeometrySha256: geometrySha256,
        outputSha256,
      },
      idempotency_key: `background-mask:${newDocumentId}:${suffix}`,
    });
    const responseBody = JSON.parse(response.body);
    const version = responseBody.version || null;
    if (!version) return { create: response, upload: null, version: null, png };
    if (version.content_ready) {
      return {
        create: response,
        upload: null,
        version,
        attempt: responseBody.attempt,
        png,
      };
    }
    const upload = await uploadBackgroundVersionRequest(
      newDocumentId,
      version.id,
      version.row_revision,
      png,
    );
    return {
      create: response,
      upload,
      version: JSON.parse(upload.body).version,
      attempt: responseBody.attempt,
      png,
    };
  };
  const staleEnvironmentGeometrySha256 = environmentGeometrySha256(
    versionedBoardCode(crypto.randomUUID(), null, { rows: 13, worldHeight: 12 }),
  );
  const rejectedMismatchedMask = await createMask(rawBackground.id, 'raw');
  const rejectedStaleGeometryMask = await createMask(
    warpedReady.id,
    'stale-geometry',
    staleEnvironmentGeometrySha256,
  );
  const selectedMask = await createMask(warpedReady.id, 'warped');
  const rejectedRefinementMask = await createMask(
    warpedReady.id,
    'refinement',
    privateEnvironmentGeometrySha256,
    selectedMask.version.id,
  );
  if (
    rejectedMismatchedMask.create.statusCode !== 409
    || JSON.parse(rejectedMismatchedMask.create.body).error !== 'invalid_background_version_lineage'
    || rejectedStaleGeometryMask.create.statusCode !== 409
    || JSON.parse(rejectedStaleGeometryMask.create.body).error !== 'invalid_background_version_lineage'
    || selectedMask.create.statusCode !== 201
    || selectedMask.upload.statusCode !== 200
    || selectedMask.attempt?.occlusion_version_id !== selectedMask.version.id
    || rejectedRefinementMask.create.statusCode !== 409
    || JSON.parse(rejectedRefinementMask.create.body).error !== 'invalid_generation_attempt_stage'
  ) {
    throw new Error(`Generation attempt did not enforce one valid occlusion stage: ${rejectedMismatchedMask.create.statusCode} ${rejectedMismatchedMask.create.body} / ${rejectedStaleGeometryMask.create.statusCode} ${rejectedStaleGeometryMask.create.body} / ${selectedMask.create.statusCode} ${selectedMask.create.body} / ${selectedMask.upload.statusCode} ${selectedMask.upload.body} / ${rejectedRefinementMask.create.statusCode} ${rejectedRefinementMask.create.body}`);
  }

  // The attempt API blocks invalid stages before they can become candidates.
  // These direct rows model immutable historical mistakes so the canonical Save
  // boundary continues proving that it rejects bad selections independently.
  const mismatchedMaskId = crypto.randomUUID();
  const staleGeometryMaskId = crypto.randomUUID();
  await queryDb(
    `INSERT INTO predrawn_background_versions (
       id, document_id, owner_email, level_id, kind, label,
       parent_version_id, source_background_version_id,
       blob_sha256, width, height, world_bounds, operation, provenance,
       status, row_revision, created_by_email, created_by_name,
       created_at, updated_at, updated_by
     )
     SELECT
       fixture.id, selected.document_id, selected.owner_email, selected.level_id,
       'occlusion', fixture.label, NULL, fixture.source_id,
       selected.blob_sha256, selected.width, selected.height, selected.world_bounds,
       jsonb_set(
         jsonb_set(
           selected.operation,
           '{sourceBackgroundVersionId}',
           to_jsonb(fixture.source_id::text)
         ),
         '{environmentGeometrySha256}',
         to_jsonb(fixture.geometry_sha256)
       ),
       jsonb_set(
         jsonb_set(
           selected.provenance,
           '{sourceBackgroundVersionId}',
           to_jsonb(fixture.source_id::text)
         ),
         '{environmentGeometrySha256}',
         to_jsonb(fixture.geometry_sha256)
       ),
       'ready', 1, selected.created_by_email, selected.created_by_name,
       now(), now(), selected.updated_by
     FROM predrawn_background_versions selected
     CROSS JOIN (
       VALUES
         ($2::uuid, $3::uuid, $4::text, 'Historical mismatched mask'::text),
         ($5::uuid, $1::uuid, $6::text, 'Historical stale-geometry mask'::text)
     ) AS fixture(id, source_id, geometry_sha256, label)
     WHERE selected.id = $1`,
    [
      selectedMask.version.id,
      mismatchedMaskId,
      rawBackground.id,
      privateEnvironmentGeometrySha256,
      staleGeometryMaskId,
      staleEnvironmentGeometrySha256,
    ],
  );
  const mismatchedMask = { version: { id: mismatchedMaskId } };
  const staleGeometryMask = { version: { id: staleGeometryMaskId } };

  const archiveSourceWhileActive = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions/${sourceArtworkReady.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { expected_revision: 1 })),
  );
  const archiveRawWhileActive = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions/${rawBackground.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { expected_revision: 1 })),
  );
  const archiveAttemptWithoutDocumentRevision = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/generation-attempts/${generationAttempt.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(
      newDocumentId,
      '__Host-chess-tactics-access=abc',
      { expected_revision: selectedMask.attempt.row_revision },
    )),
  );
  const staleDocumentArchiveAttempt = await archiveGenerationAttemptRequest(
    newDocumentId,
    generationAttempt.id,
    selectedMask.attempt.row_revision,
    '__Host-chess-tactics-access=abc',
    null,
    4,
  );
  const attemptAfterStaleDocumentArchive = await queryDb(
    `SELECT status, row_revision
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, generationAttempt.id],
  );
  const archivedAttempt = await archiveGenerationAttemptRequest(
    newDocumentId,
    generationAttempt.id,
    selectedMask.attempt.row_revision,
  );
  const archivedAttemptReplay = await archiveGenerationAttemptRequest(
    newDocumentId,
    generationAttempt.id,
    selectedMask.attempt.row_revision,
  );
  const activeAttemptsAfterArchive = await get(
    `/api/editor-documents/${newDocumentId}/generation-attempts?status=active`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const archivedAttemptsAfterArchive = await get(
    `/api/editor-documents/${newDocumentId}/generation-attempts?status=archived`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const generationAttemptEvents = await queryDb(
    `SELECT action, actor_email, actor_name
       FROM predrawn_generation_attempt_events
      WHERE attempt_id = $1
      ORDER BY id`,
    [generationAttempt.id],
  );
  const archiveRaw = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions/${rawBackground.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { expected_revision: 1 })),
  );
  if (
    archiveSourceWhileActive.statusCode !== 409
    || JSON.parse(archiveSourceWhileActive.body).error !== 'background_source_attempt_in_use'
    || archiveRawWhileActive.statusCode !== 409
    || JSON.parse(archiveRawWhileActive.body).error !== 'background_version_attempt_in_use'
    || archiveAttemptWithoutDocumentRevision.statusCode !== 428
    || JSON.parse(archiveAttemptWithoutDocumentRevision.body).error
      !== 'editor_document_revision_required'
    || staleDocumentArchiveAttempt.statusCode !== 409
    || JSON.parse(staleDocumentArchiveAttempt.body).error
      !== 'editor_document_revision_conflict'
    || attemptAfterStaleDocumentArchive.rows[0]?.status !== 'active'
    || Number(attemptAfterStaleDocumentArchive.rows[0]?.row_revision)
      !== selectedMask.attempt.row_revision
    || archivedAttempt.statusCode !== 200
    || JSON.parse(archivedAttempt.body).attempt?.status !== 'archived'
    || JSON.parse(archivedAttempt.body).document?.revision !== 5
    || JSON.parse(archivedAttempt.body).forgotten_selection?.working_copy !== false
    || JSON.parse(archivedAttempt.body).forgotten_selection?.canonical !== false
    || JSON.parse(archivedAttempt.body).canonical_level?.id !== 'l2'
    || JSON.parse(archivedAttempt.body).attempt?.row_revision
      !== selectedMask.attempt.row_revision + 1
    || archivedAttemptReplay.statusCode !== 200
    || JSON.parse(archivedAttemptReplay.body).idempotent_replay !== true
    || JSON.parse(activeAttemptsAfterArchive.body).attempts?.length !== 0
    || !JSON.parse(archivedAttemptsAfterArchive.body).attempts?.some(
      (attempt) => attempt.id === generationAttempt.id,
    )
    || generationAttemptEvents.rows.map((event) => event.action).join(',')
      !== 'move-highlight-profile-updated,stage-attached,archived'
    || generationAttemptEvents.rows.some((event) => (
      event.actor_email !== 'player@example.com' || event.actor_name !== 'Tactics Player'
    ))
    || archiveRaw.statusCode !== 200 || JSON.parse(archiveRaw.body).version.status !== 'archived'
    || JSON.parse(archiveRaw.body).version.row_revision !== 2
  ) {
    throw new Error(`Generation attempt archive guards failed: ${archiveSourceWhileActive.statusCode} ${archiveSourceWhileActive.body} / ${archiveRawWhileActive.statusCode} ${archiveRawWhileActive.body} / ${archiveAttemptWithoutDocumentRevision.statusCode} ${archiveAttemptWithoutDocumentRevision.body} / ${staleDocumentArchiveAttempt.statusCode} ${staleDocumentArchiveAttempt.body} / ${JSON.stringify(attemptAfterStaleDocumentArchive.rows)} / ${archivedAttempt.statusCode} ${archivedAttempt.body} / ${archivedAttemptReplay.statusCode} ${archivedAttemptReplay.body} / ${activeAttemptsAfterArchive.statusCode} ${activeAttemptsAfterArchive.body} / ${archivedAttemptsAfterArchive.statusCode} ${archivedAttemptsAfterArchive.body} / ${JSON.stringify(generationAttemptEvents.rows)} / ${archiveRaw.statusCode} ${archiveRaw.body}`);
  }

  const mismatchedSelectionLevel = {
    ...newEditorAutosaveLevel,
    boardCode: versionedBoardCode(warpedReady.id, mismatchedMask.version.id),
  };
  const staleBackgroundGeometrySave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: {
        ...newEditorAutosaveLevel,
        boardCode: versionedBoardCode(warpedReady.id, selectedMask.version.id, {
          rows: 13,
          worldHeight: 12,
        }),
      },
    })),
    5000,
  );
  const staleMaskGeometrySave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: {
        ...newEditorAutosaveLevel,
        boardCode: versionedBoardCode(warpedReady.id, staleGeometryMask.version.id),
      },
    })),
    5000,
  );
  const mismatchedSelectionSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: mismatchedSelectionLevel,
    })),
    5000,
  );
  const statusesAfterRejectedSave = await queryDb(
    `SELECT id, status FROM predrawn_background_versions WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [[warpedReady.id, mismatchedMask.version.id]],
  );
  if (
    staleBackgroundGeometrySave.statusCode !== 409
    || JSON.parse(staleBackgroundGeometrySave.body).error !== 'predrawn_background_geometry_mismatch'
    || staleMaskGeometrySave.statusCode !== 409
    || JSON.parse(staleMaskGeometrySave.body).error !== 'predrawn_occlusion_contract_mismatch'
    || mismatchedSelectionSave.statusCode !== 409
    || JSON.parse(mismatchedSelectionSave.body).error !== 'predrawn_occlusion_contract_mismatch'
    || statusesAfterRejectedSave.rows.some((row) => row.status !== 'ready')
  ) {
    throw new Error(`Stale or mismatched pre-drawn Save was not rejected atomically: ${staleBackgroundGeometrySave.statusCode} ${staleBackgroundGeometrySave.body} / ${staleMaskGeometrySave.statusCode} ${staleMaskGeometrySave.body} / ${mismatchedSelectionSave.statusCode} ${mismatchedSelectionSave.body} / ${JSON.stringify(statusesAfterRejectedSave.rows)}`);
  }

  const selectedLevel = {
    ...newEditorAutosaveLevel,
    boardCode: versionedBoardCode(warpedReady.id, selectedMask.version.id),
  };
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation - 'untouched'
      WHERE id = $1`,
    [rawBackground.id],
  );
  const invalidWarpedParentSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: selectedLevel,
    })),
    5000,
  );
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation || '{"untouched":true}'::jsonb
      WHERE id = $1`,
    [rawBackground.id],
  );
  if (
    invalidWarpedParentSave.statusCode !== 409
    || JSON.parse(invalidWarpedParentSave.body).error !== 'predrawn_background_contract_mismatch'
  ) {
    throw new Error(`Canonical Save trusted an invalid raw ancestor for a warped selection: ${invalidWarpedParentSave.statusCode} ${invalidWarpedParentSave.body}`);
  }
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation - 'encoding'
      WHERE id = $1`,
    [selectedMask.version.id],
  );
  const invalidOcclusionContractSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: selectedLevel,
    })),
    5000,
  );
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation || '{"encoding":"rgb24-signed-half-depth-alpha"}'::jsonb
      WHERE id = $1`,
    [selectedMask.version.id],
  );
  if (
    invalidOcclusionContractSave.statusCode !== 409
    || JSON.parse(invalidOcclusionContractSave.body).error !== 'predrawn_occlusion_contract_mismatch'
  ) {
    throw new Error(`Canonical Save trusted invalid grandparent occlusion metadata: ${invalidOcclusionContractSave.statusCode} ${invalidOcclusionContractSave.body}`);
  }
  const versionedSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 5,
      level: selectedLevel,
    })),
    5000,
  );
  const publishedVersionRows = await queryDb(
    `SELECT v.id, v.status, v.published_by, b.published_at AS blob_published_at
       FROM predrawn_background_versions v
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id = ANY($1::uuid[]) ORDER BY v.id`,
    [[warpedReady.id, selectedMask.version.id]],
  );
  const backgroundVersionEvents = await queryDb(
    `SELECT version_id, action, actor_email, actor_name
       FROM predrawn_background_version_events
      WHERE version_id = ANY($1::uuid[])
      ORDER BY version_id, id`,
    [[rawBackground.id, warpedReady.id, selectedMask.version.id]],
  );
  const actionsByVersion = new Map();
  for (const event of backgroundVersionEvents.rows) {
    const key = String(event.version_id);
    actionsByVersion.set(key, [...(actionsByVersion.get(key) || []), event.action]);
  }
  const anonymousSavedBackground = await get(`/api/background-versions/${warpedReady.id}/content`, {}, 5000);
  const ownerSavedBackground = await get(
    `/api/background-versions/${warpedReady.id}/content`,
    { cookie: '__Host-chess-tactics-access=abc' },
    5000,
  );
  const workspaceWithPrivateScene = await get(
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const workspaceWithPrivateSceneBody = JSON.parse(workspaceWithPrivateScene.body);
  const privateSceneThumbnailUrl = workspaceWithPrivateSceneBody.thumbnail_urls?.l2 || '';
  const privateSceneThumbnailSha = /\/([0-9a-f]{64})\.png$/.exec(privateSceneThumbnailUrl)?.[1] || '';
  const anonymousPrivateSceneThumbnail = privateSceneThumbnailUrl
    ? await get(privateSceneThumbnailUrl)
    : { statusCode: 0 };
  const ownerPrivateSceneThumbnail = privateSceneThumbnailUrl
    ? await get(privateSceneThumbnailUrl, { cookie: '__Host-chess-tactics-access=abc' })
    : { statusCode: 0 };
  const anonymousPrivateSceneBlob = privateSceneThumbnailSha
    ? await get(`/api/media/${privateSceneThumbnailSha}`)
    : { statusCode: 0 };
  const privateSceneThumbnailRecord = await queryDb(
    `SELECT blob.published_at
       FROM level_thumbnail_derivatives derivative
       JOIN media_blobs blob ON blob.sha256 = derivative.blob_sha256
      WHERE derivative.authority_key = $1 AND derivative.blob_sha256 = $2`,
    ['user:player@example.com:l2', privateSceneThumbnailSha || null],
  );
  if (
    versionedSave.statusCode !== 200
    || JSON.parse(versionedSave.body).document.revision !== 6
    || publishedVersionRows.rows.length !== 2
    || publishedVersionRows.rows.some((row) => (
      row.status !== 'ready' || row.published_by !== null || row.blob_published_at !== null
    ))
    || actionsByVersion.get(String(rawBackground.id))?.join(',') !== 'created,content-uploaded,archived'
    || actionsByVersion.get(String(warpedReady.id))?.join(',') !== 'created,content-uploaded'
    || actionsByVersion.get(String(selectedMask.version.id))?.join(',') !== 'created,content-uploaded'
    || backgroundVersionEvents.rows.some((event) => (
      event.actor_email !== 'player@example.com' || event.actor_name !== 'Tactics Player'
    ))
    || anonymousSavedBackground.statusCode !== 401 || ownerSavedBackground.statusCode !== 200
    || ownerSavedBackground.headers['cache-control'] !== 'private, max-age=31536000, immutable'
    || !/^\/api\/campaign-workspace\/level-thumbnails\/l2\/[0-9a-f]{64}\.png$/.test(privateSceneThumbnailUrl)
    || anonymousPrivateSceneThumbnail.statusCode !== 401
    || ownerPrivateSceneThumbnail.statusCode !== 200
    || ownerPrivateSceneThumbnail.headers['content-type'] !== 'image/png'
    || anonymousPrivateSceneBlob.statusCode !== 404
    || privateSceneThumbnailRecord.rows.length !== 1
    || privateSceneThumbnailRecord.rows[0].published_at !== null
  ) {
    throw new Error(`Private canonical Save did not keep selected background bytes and its thumbnail private: ${versionedSave.statusCode} ${versionedSave.body} / ${JSON.stringify(publishedVersionRows.rows)} / ${JSON.stringify(backgroundVersionEvents.rows)} / ${anonymousSavedBackground.statusCode} / ${ownerSavedBackground.statusCode} / ${privateSceneThumbnailUrl} / ${anonymousPrivateSceneThumbnail.statusCode}/${ownerPrivateSceneThumbnail.statusCode}/${anonymousPrivateSceneBlob.statusCode} / ${JSON.stringify(privateSceneThumbnailRecord.rows)}`);
  }
  const userWorkspaceAtVersionBoundary = await get(
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const userWorkspaceAtVersionBoundaryBody = JSON.parse(userWorkspaceAtVersionBoundary.body);
  const missingUserBackgroundPut = await request(
    'PUT',
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      campaigns: userWorkspaceAtVersionBoundaryBody.campaigns,
      levels: {
        ...userWorkspaceAtVersionBoundaryBody.levels,
        l2: {
          ...userWorkspaceAtVersionBoundaryBody.levels.l2,
          boardCode: versionedBoardCode(crypto.randomUUID(), null),
        },
      },
      revision: userWorkspaceAtVersionBoundaryBody.revision,
    }),
    5000,
  );
  const userWorkspaceAfterRejectedVersionPut = await get(
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const legacyRememberedMissingPut = await request(
    'PUT',
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      campaigns: userWorkspaceAtVersionBoundaryBody.campaigns,
      levels: {
        ...userWorkspaceAtVersionBoundaryBody.levels,
        l2: {
          ...userWorkspaceAtVersionBoundaryBody.levels.l2,
          boardCode: boardCodeWith(
            versionedBoardCode(crypto.randomUUID(), null),
            { backgroundMode: 'legacy' },
          ),
        },
      },
      revision: userWorkspaceAtVersionBoundaryBody.revision,
    }),
    5000,
  );
  const legacyRememberedMissingPutBody = JSON.parse(legacyRememberedMissingPut.body);
  const exactReadyUserPut = await request(
    'PUT',
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      campaigns: userWorkspaceAtVersionBoundaryBody.campaigns,
      levels: userWorkspaceAtVersionBoundaryBody.levels,
      revision: legacyRememberedMissingPutBody.revision,
    }),
    5000,
  );
  const exactReadyUserPutBody = JSON.parse(exactReadyUserPut.body);
  const readyAfterWholeUserPut = await queryDb(
    `SELECT v.status, b.published_at AS blob_published_at
       FROM predrawn_background_versions v
       JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id = ANY($1::uuid[])
      ORDER BY v.id`,
    [[warpedReady.id, selectedMask.version.id]],
  );
  const anonymousAfterWholeUserPut = await get(
    `/api/background-versions/${warpedReady.id}/content`,
  );
  if (
    userWorkspaceAtVersionBoundary.statusCode !== 200
    || missingUserBackgroundPut.statusCode !== 409
    || JSON.parse(missingUserBackgroundPut.body).error !== 'predrawn_background_version_not_found'
    || JSON.parse(userWorkspaceAfterRejectedVersionPut.body).revision !== userWorkspaceAtVersionBoundaryBody.revision
    || legacyRememberedMissingPut.statusCode !== 200
    || legacyRememberedMissingPutBody.revision !== userWorkspaceAtVersionBoundaryBody.revision + 1
    || exactReadyUserPut.statusCode !== 200
    || exactReadyUserPutBody.revision !== userWorkspaceAtVersionBoundaryBody.revision + 2
    || readyAfterWholeUserPut.rows.length !== 2
    || readyAfterWholeUserPut.rows.some((row) => row.status !== 'ready' || row.blob_published_at !== null)
    || anonymousAfterWholeUserPut.statusCode !== 401
  ) {
    throw new Error(`Whole user workspace write bypassed active-AI background validation: ${userWorkspaceAtVersionBoundary.statusCode} ${userWorkspaceAtVersionBoundary.body} / ${missingUserBackgroundPut.statusCode} ${missingUserBackgroundPut.body} / ${userWorkspaceAfterRejectedVersionPut.body} / ${legacyRememberedMissingPut.statusCode} ${legacyRememberedMissingPut.body} / ${exactReadyUserPut.statusCode} ${exactReadyUserPut.body} / ${JSON.stringify(readyAfterWholeUserPut.rows)} / ${anonymousAfterWholeUserPut.statusCode}`);
  }
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation - 'untouched'
      WHERE id = $1`,
    [rawBackground.id],
  );
  const invalidWarpedParentPublish = await request(
    'POST',
    '/api/maps/publish',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ levelId: 'l2' }),
    5000,
  );
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation || '{"untouched":true}'::jsonb
      WHERE id = $1`,
    [rawBackground.id],
  );
  if (
    invalidWarpedParentPublish.statusCode !== 409
    || JSON.parse(invalidWarpedParentPublish.body).error !== 'predrawn_background_contract_mismatch'
  ) {
    throw new Error(`Public-map Publish trusted an invalid raw ancestor for a warped selection: ${invalidWarpedParentPublish.statusCode} ${invalidWarpedParentPublish.body}`);
  }
  const publishedUserMap = await request(
    'POST',
    '/api/maps/publish',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ levelId: 'l2' }),
    5000,
  );
  const publishedUserMapBody = JSON.parse(publishedUserMap.body);
  const publicUserMap = publishedUserMapBody.public_id
    ? await get(`/api/maps/${publishedUserMapBody.public_id}`)
    : { statusCode: 0, body: '' };
  const userMapPublishedVersions = await queryDb(
    `SELECT v.id, v.status, v.row_revision, v.published_by, b.published_at AS blob_published_at
       FROM predrawn_background_versions v
       LEFT JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id = ANY($1::uuid[]) ORDER BY v.id`,
    [[
      rawBackground.id,
      warpedReady.id,
      mismatchedMask.version.id,
      selectedMask.version.id,
    ]],
  );
  const publicSelectedBackground = await get(
    `/api/background-versions/${warpedReady.id}/content`,
    {},
    5000,
  );
  const publicSelectedMask = await get(
    `/api/background-versions/${selectedMask.version.id}/content`,
    {},
    5000,
  );
  const privateUnselectedMask = await get(
    `/api/background-versions/${mismatchedMask.version.id}/content`,
  );
  const privateArchivedRaw = await get(`/api/background-versions/${rawBackground.id}/content`);
  const selectedPublishedEvents = await queryDb(
    `SELECT version_id, action FROM predrawn_background_version_events
      WHERE version_id = ANY($1::uuid[]) ORDER BY version_id, id`,
    [[warpedReady.id, selectedMask.version.id]],
  );
  const publishedStatusById = new Map(
    userMapPublishedVersions.rows.map((row) => [String(row.id), row]),
  );
  if (
    publishedUserMap.statusCode !== 200 || !publishedUserMapBody.public_id
    || publicUserMap.statusCode !== 200
    || JSON.parse(publicUserMap.body).level.boardCode !== selectedLevel.boardCode
    || publishedStatusById.get(String(warpedReady.id))?.status !== 'published'
    || publishedStatusById.get(String(selectedMask.version.id))?.status !== 'published'
    || Number(publishedStatusById.get(String(warpedReady.id))?.row_revision) !== 2
    || Number(publishedStatusById.get(String(selectedMask.version.id))?.row_revision) !== 2
    || publishedStatusById.get(String(rawBackground.id))?.status !== 'archived'
    || publishedStatusById.get(String(mismatchedMask.version.id))?.status !== 'ready'
    || userMapPublishedVersions.rows.filter((row) => ['published'].includes(row.status)).some((row) => (
      row.published_by !== 'player@example.com' || row.blob_published_at === null
    ))
    || publicSelectedBackground.statusCode !== 200 || publicSelectedMask.statusCode !== 200
    || publicSelectedBackground.headers['cache-control'] !== 'public, max-age=31536000, immutable'
    || publicSelectedMask.headers['cache-control'] !== 'public, max-age=31536000, immutable'
    || privateUnselectedMask.statusCode !== 401 || privateArchivedRaw.statusCode !== 401
    || selectedPublishedEvents.rows.filter((row) => row.action === 'published').length !== 2
  ) {
    throw new Error(`Public-map publish did not atomically expose only selected background versions: ${publishedUserMap.statusCode} ${publishedUserMap.body} / ${publicUserMap.statusCode} ${publicUserMap.body} / ${JSON.stringify(userMapPublishedVersions.rows)} / ${JSON.stringify(selectedPublishedEvents.rows)} / ${publicSelectedBackground.statusCode}/${publicSelectedMask.statusCode}/${privateUnselectedMask.statusCode}/${privateArchivedRaw.statusCode}`);
  }
  const archiveSelectedPrivate = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/background-versions/${warpedReady.id}/archive`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', { expected_revision: 1 })),
  );
  if (
    archiveSelectedPrivate.statusCode !== 409
    || JSON.parse(archiveSelectedPrivate.body).error !== 'background_version_in_use'
  ) {
    throw new Error(`Private canonical background selection was archivable: ${archiveSelectedPrivate.statusCode} ${archiveSelectedPrivate.body}`);
  }

  const dormantArchiveWarpId = crypto.randomUUID();
  const dormantArchiveAttemptId = crypto.randomUUID();
  await queryDb(
    `WITH cloned_warp AS (
       INSERT INTO predrawn_background_versions (
         id, document_id, owner_email, level_id, kind, label,
         parent_version_id, source_background_version_id,
         blob_sha256, width, height, world_bounds, operation, provenance,
         status, row_revision, created_by_email, created_by_name,
         created_at, updated_at, updated_by
       )
       SELECT
         $1, document_id, owner_email, level_id, kind, 'Dormant archive warp',
         parent_version_id, source_background_version_id,
         blob_sha256, width, height, world_bounds, operation, provenance,
         'ready', 1, created_by_email, created_by_name,
         now(), now(), updated_by
       FROM predrawn_background_versions
       WHERE document_id = $2 AND id = $3
       RETURNING *
     )
     INSERT INTO predrawn_generation_attempts (
       id, document_id, owner_email, level_id, label, origin,
       source_version_id, source_attempt_id, source_request,
       generated_version_id, warped_version_id,
       created_by_email, created_by_name, updated_by
     )
     SELECT
       $4, source_attempt.document_id, source_attempt.owner_email, source_attempt.level_id,
       'Dormant Legacy archive slot', source_attempt.origin,
       source_attempt.source_version_id, source_attempt.source_attempt_id,
       source_attempt.source_request, source_attempt.generated_version_id, cloned_warp.id,
       source_attempt.created_by_email, source_attempt.created_by_name, source_attempt.updated_by
     FROM predrawn_generation_attempts source_attempt
     CROSS JOIN cloned_warp
     WHERE source_attempt.document_id = $2 AND source_attempt.id = $5`,
    [
      dormantArchiveWarpId,
      newDocumentId,
      warpedReady.id,
      dormantArchiveAttemptId,
      pipelineReuseAttempt.id,
    ],
  );
  const activeArchiveLevel = {
    ...selectedLevel,
    boardCode: versionedBoardCode(dormantArchiveWarpId, null),
  };
  const activeArchiveAutosave = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 6,
      level: activeArchiveLevel,
    })),
  );
  const activeAttemptArchive = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
  );
  const stateAfterActiveAttemptArchive = await queryDb(
    `SELECT document.revision, document.body, attempt.status, attempt.row_revision
       FROM level_working_copies document
       JOIN predrawn_generation_attempts attempt
         ON attempt.document_id = document.document_id
      WHERE document.document_id = $1 AND attempt.id = $2`,
    [newDocumentId, dormantArchiveAttemptId],
  );
  const boardAfterActiveAttemptArchive = boardRender.decodeBoard(
    stateAfterActiveAttemptArchive.rows[0]?.body?.boardCode || '',
  );
  if (
    activeArchiveAutosave.statusCode !== 200
    || JSON.parse(activeArchiveAutosave.body).document?.revision !== 7
    || activeAttemptArchive.statusCode !== 409
    || JSON.parse(activeAttemptArchive.body).error !== 'generation_attempt_in_use'
    || Number(stateAfterActiveAttemptArchive.rows[0]?.revision) !== 7
    || stateAfterActiveAttemptArchive.rows[0]?.status !== 'active'
    || Number(stateAfterActiveAttemptArchive.rows[0]?.row_revision) !== 0
    || boardAfterActiveAttemptArchive?.backgroundMode !== 'ai'
    || boardAfterActiveAttemptArchive?.surface?.backgroundVersionId
      !== dormantArchiveWarpId
  ) {
    throw new Error(`Active AI slot archive was not rejected atomically: ${activeArchiveAutosave.statusCode} ${activeArchiveAutosave.body} / ${activeAttemptArchive.statusCode} ${activeAttemptArchive.body} / ${JSON.stringify(stateAfterActiveAttemptArchive.rows)}`);
  }
  const dormantArchiveLevel = {
    ...selectedLevel,
    boardCode: boardCodeWith(
      versionedBoardCode(dormantArchiveWarpId, null),
      { backgroundMode: 'legacy' },
    ),
  };
  const dormantArchiveAutosave = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 7,
      level: dormantArchiveLevel,
    })),
  );
  const dormantArchiveSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 8,
    })),
    5000,
  );
  const archivedDormantAttempt = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
  );
  const archivedDormantAttemptBody = JSON.parse(archivedDormantAttempt.body);
  const archivedDormantAttemptReplay = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    9,
  );
  const archivedDormantAttemptReplayBody = JSON.parse(archivedDormantAttemptReplay.body);
  const archivedDormantWorkingBoard = boardRender.decodeBoard(
    archivedDormantAttemptBody.document?.level?.boardCode || '',
  );
  const archivedDormantCanonicalBoard = boardRender.decodeBoard(
    archivedDormantAttemptBody.canonical_level?.boardCode || '',
  );
  const archivedDormantRows = await queryDb(
    `SELECT attempt.status, attempt.row_revision, version.status AS version_status
       FROM predrawn_generation_attempts attempt
       JOIN predrawn_background_versions version ON version.id = attempt.warped_version_id
      WHERE attempt.document_id = $1 AND attempt.id = $2`,
    [newDocumentId, dormantArchiveAttemptId],
  );
  const archivedDormantRevision = await queryDb(
    `SELECT reason, saved_revision
       FROM level_working_copy_revisions
      WHERE document_id = $1 AND revision = $2`,
    [newDocumentId, 10],
  );
  if (
    dormantArchiveAutosave.statusCode !== 200
    || JSON.parse(dormantArchiveAutosave.body).document?.revision !== 8
    || dormantArchiveSave.statusCode !== 200
    || JSON.parse(dormantArchiveSave.body).document?.revision !== 9
    || archivedDormantAttempt.statusCode !== 200
    || archivedDormantAttemptBody.attempt?.status !== 'archived'
    || archivedDormantAttemptBody.document?.revision !== 10
    || archivedDormantAttemptBody.document?.saved_revision !== 10
    || archivedDormantAttemptBody.document?.dirty !== false
    || archivedDormantAttemptBody.thumbnail_ready !== true
    || archivedDormantAttemptReplay.statusCode !== 200
    || archivedDormantAttemptReplayBody.idempotent_replay !== true
    || archivedDormantAttemptReplayBody.document?.revision !== 10
    || archivedDormantAttemptReplayBody.workspace_revision
      !== archivedDormantAttemptBody.workspace_revision
    || archivedDormantAttemptReplayBody.canonical_level?.boardCode
      !== archivedDormantAttemptBody.canonical_level?.boardCode
    || archivedDormantAttemptBody.forgotten_selection?.working_copy !== true
    || archivedDormantAttemptBody.forgotten_selection?.canonical !== true
    || archivedDormantAttemptBody.forgotten_selection?.version_ids?.join(',')
      !== dormantArchiveWarpId
    || !Number.isSafeInteger(archivedDormantAttemptBody.workspace_revision)
    || archivedDormantWorkingBoard?.backgroundMode !== 'legacy'
    || archivedDormantWorkingBoard?.surface !== undefined
    || archivedDormantCanonicalBoard?.backgroundMode !== 'legacy'
    || archivedDormantCanonicalBoard?.surface !== undefined
    || archivedDormantRows.rows[0]?.status !== 'archived'
    || Number(archivedDormantRows.rows[0]?.row_revision) !== 1
    || archivedDormantRows.rows[0]?.version_status !== 'ready'
    || archivedDormantRevision.rows[0]?.reason !== 'generation-attempt-archive'
    || Number(archivedDormantRevision.rows[0]?.saved_revision) !== 10
  ) {
    throw new Error(`Dormant Legacy slot archive did not atomically forget both selections: ${dormantArchiveAutosave.statusCode} ${dormantArchiveAutosave.body} / ${dormantArchiveSave.statusCode} ${dormantArchiveSave.body} / ${archivedDormantAttempt.statusCode} ${archivedDormantAttempt.body} / ${archivedDormantAttemptReplay.statusCode} ${archivedDormantAttemptReplay.body} / ${JSON.stringify(archivedDormantRows.rows)} / ${JSON.stringify(archivedDormantRevision.rows)}`);
  }

  // Reproduce the historical partial-archive state: the attempt is already
  // archived, but a restored Legacy Level remembers one of its versions. A
  // replay of the same explicit archive action must heal both persisted Levels
  // without revising the attempt a second time.
  const partialArchiveLevel = {
    ...archivedDormantAttemptBody.document.level,
    boardCode: boardCodeWith(
      versionedBoardCode(dormantArchiveWarpId, null),
      { backgroundMode: 'legacy' },
    ),
  };
  const partialArchiveAutosave = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 10,
      level: partialArchiveLevel,
    })),
  );
  const partialArchiveSave = await request(
    'POST',
    `/api/editor-documents/${newDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 11,
    })),
    5000,
  );
  const stalePartialArchiveRepair = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    11,
  );
  const stateAfterStalePartialArchiveRepair = await queryDb(
    `SELECT document.revision, document.body, attempt.status, attempt.row_revision
       FROM level_working_copies document
       JOIN predrawn_generation_attempts attempt
         ON attempt.document_id = document.document_id
      WHERE document.document_id = $1 AND attempt.id = $2`,
    [newDocumentId, dormantArchiveAttemptId],
  );
  const boardAfterStalePartialArchiveRepair = boardRender.decodeBoard(
    stateAfterStalePartialArchiveRepair.rows[0]?.body?.boardCode || '',
  );
  const repairedArchivedAttempt = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
  );
  const repairedArchivedAttemptBody = JSON.parse(repairedArchivedAttempt.body);
  const repairedArchivedWorkingBoard = boardRender.decodeBoard(
    repairedArchivedAttemptBody.document?.level?.boardCode || '',
  );
  const repairedArchivedCanonicalBoard = boardRender.decodeBoard(
    repairedArchivedAttemptBody.canonical_level?.boardCode || '',
  );
  const repairedArchivedRows = await queryDb(
    `SELECT status, row_revision
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, dormantArchiveAttemptId],
  );
  const repairedArchivedRevision = await queryDb(
    `SELECT reason, saved_revision
       FROM level_working_copy_revisions
      WHERE document_id = $1 AND revision = $2`,
    [newDocumentId, 13],
  );
  const repairedArchivedEvent = await queryDb(
    `SELECT details
       FROM predrawn_generation_attempt_events
      WHERE document_id = $1 AND attempt_id = $2 AND action = 'archived'
      ORDER BY id DESC
      LIMIT 1`,
    [newDocumentId, dormantArchiveAttemptId],
  );
  if (
    partialArchiveAutosave.statusCode !== 200
    || JSON.parse(partialArchiveAutosave.body).document?.revision !== 11
    || partialArchiveSave.statusCode !== 200
    || JSON.parse(partialArchiveSave.body).document?.revision !== 12
    || stalePartialArchiveRepair.statusCode !== 409
    || JSON.parse(stalePartialArchiveRepair.body).error !== 'editor_document_revision_conflict'
    || Number(stateAfterStalePartialArchiveRepair.rows[0]?.revision) !== 12
    || stateAfterStalePartialArchiveRepair.rows[0]?.status !== 'archived'
    || Number(stateAfterStalePartialArchiveRepair.rows[0]?.row_revision) !== 1
    || boardAfterStalePartialArchiveRepair?.backgroundMode !== 'legacy'
    || boardAfterStalePartialArchiveRepair?.surface?.backgroundVersionId
      !== dormantArchiveWarpId
    || repairedArchivedAttempt.statusCode !== 200
    || repairedArchivedAttemptBody.idempotent_replay !== true
    || repairedArchivedAttemptBody.document?.revision !== 13
    || repairedArchivedAttemptBody.document?.saved_revision !== 13
    || repairedArchivedAttemptBody.forgotten_selection?.working_copy !== true
    || repairedArchivedAttemptBody.forgotten_selection?.canonical !== true
    || repairedArchivedAttemptBody.forgotten_selection?.version_ids?.join(',')
      !== dormantArchiveWarpId
    || repairedArchivedWorkingBoard?.backgroundMode !== 'legacy'
    || repairedArchivedWorkingBoard?.surface !== undefined
    || repairedArchivedCanonicalBoard?.backgroundMode !== 'legacy'
    || repairedArchivedCanonicalBoard?.surface !== undefined
    || repairedArchivedRows.rows[0]?.status !== 'archived'
    || Number(repairedArchivedRows.rows[0]?.row_revision) !== 1
    || repairedArchivedRevision.rows[0]?.reason !== 'generation-attempt-archive'
    || Number(repairedArchivedRevision.rows[0]?.saved_revision) !== 13
    || repairedArchivedEvent.rows[0]?.details?.repaired_incomplete_selection_detach !== true
  ) {
    throw new Error(`Archived-slot replay did not heal a dormant selection without a second slot revision: ${partialArchiveAutosave.statusCode} ${partialArchiveAutosave.body} / ${partialArchiveSave.statusCode} ${partialArchiveSave.body} / stale ${stalePartialArchiveRepair.statusCode} ${stalePartialArchiveRepair.body} ${JSON.stringify(stateAfterStalePartialArchiveRepair.rows)} / ${repairedArchivedAttempt.statusCode} ${repairedArchivedAttempt.body} / ${JSON.stringify(repairedArchivedRows.rows)} / ${JSON.stringify(repairedArchivedRevision.rows)} / ${JSON.stringify(repairedArchivedEvent.rows)}`);
  }

  const workingOnlyArchiveLevel = {
    ...repairedArchivedAttemptBody.document.level,
    boardCode: boardCodeWith(
      versionedBoardCode(dormantArchiveWarpId, null),
      { backgroundMode: 'legacy' },
    ),
  };
  const workingOnlyArchiveAutosave = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 13,
      level: workingOnlyArchiveLevel,
    })),
  );
  const workingOnlyArchivedRepair = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
  );
  const workingOnlyArchivedRepairBody = JSON.parse(workingOnlyArchivedRepair.body);
  const workingOnlyArchivedReplay = await archiveGenerationAttemptRequest(
    newDocumentId,
    dormantArchiveAttemptId,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    15,
  );
  const workingOnlyArchivedReplayBody = JSON.parse(workingOnlyArchivedReplay.body);
  if (
    workingOnlyArchiveAutosave.statusCode !== 200
    || JSON.parse(workingOnlyArchiveAutosave.body).document?.revision !== 14
    || workingOnlyArchivedRepair.statusCode !== 200
    || workingOnlyArchivedRepairBody.document?.revision !== 15
    || workingOnlyArchivedRepairBody.document?.saved_revision !== 15
    || workingOnlyArchivedRepairBody.forgotten_selection?.working_copy !== true
    || workingOnlyArchivedRepairBody.forgotten_selection?.canonical !== false
    || workingOnlyArchivedRepairBody.workspace_revision
      !== repairedArchivedAttemptBody.workspace_revision
    || workingOnlyArchivedRepairBody.canonical_level?.boardCode
      !== repairedArchivedAttemptBody.canonical_level?.boardCode
    || workingOnlyArchivedReplay.statusCode !== 200
    || workingOnlyArchivedReplayBody.idempotent_replay !== true
    || workingOnlyArchivedReplayBody.workspace_revision
      !== workingOnlyArchivedRepairBody.workspace_revision
    || workingOnlyArchivedReplayBody.canonical_level?.boardCode
      !== workingOnlyArchivedRepairBody.canonical_level?.boardCode
    || workingOnlyArchivedReplayBody.thumbnail_ready !== true
  ) {
    throw new Error(`Working-only archived-slot repair did not return the current canonical workspace authority: ${workingOnlyArchiveAutosave.statusCode} ${workingOnlyArchiveAutosave.body} / ${workingOnlyArchivedRepair.statusCode} ${workingOnlyArchivedRepair.body} / ${workingOnlyArchivedReplay.statusCode} ${workingOnlyArchivedReplay.body}`);
  }

  const publishedArchiveAttemptId = crypto.randomUUID();
  await queryDb(
    `INSERT INTO predrawn_generation_attempts (
       id, document_id, owner_email, level_id, label, origin,
       source_version_id, source_attempt_id, source_request,
       generated_version_id, warped_version_id, occlusion_version_id,
       move_highlight_profile, move_highlight_profile_sha256,
       move_highlight_profile_warped_version_id, processing_revision,
       created_by_email, created_by_name, updated_by
     )
     SELECT
       $1, document_id, owner_email, level_id, 'Published mask discard retry', origin,
       source_version_id, source_attempt_id, source_request,
       generated_version_id, warped_version_id, $2,
       move_highlight_profile, move_highlight_profile_sha256,
       move_highlight_profile_warped_version_id, processing_revision,
       created_by_email, created_by_name, updated_by
     FROM predrawn_generation_attempts
     WHERE document_id = $3 AND id = $4`,
    [publishedArchiveAttemptId, selectedMask.version.id, newDocumentId, generationAttempt.id],
  );
  const canonicalBeforePublishedMaskDiscard = await get(
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const publishedMaskSelectionAutosave = await request(
    'PUT',
    `/api/editor-documents/${newDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(newDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 15,
      level: selectedLevel,
    })),
  );
  const invalidDiscardAuthority = {
    ...editorAuthorities.get(editorAuthorityKey(newDocumentId, '__Host-chess-tactics-access=abc')),
    edit_session_key: 'b'.repeat(64),
  };
  const staleOcclusionAttemptDiscard = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    selectedMask.version.id,
    99,
    '__Host-chess-tactics-access=abc',
    null,
    16,
  );
  const staleOcclusionDocumentDiscard = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    selectedMask.version.id,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    15,
  );
  const invalidFenceOcclusionDiscard = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    selectedMask.version.id,
    0,
    '__Host-chess-tactics-access=abc',
    invalidDiscardAuthority,
    16,
  );
  const publishedMaskDiscard = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    selectedMask.version.id,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    16,
  );
  const publishedMaskDiscardBody = JSON.parse(publishedMaskDiscard.body);
  const publishedMaskDiscardReplay = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    selectedMask.version.id,
    0,
    '__Host-chess-tactics-access=abc',
    null,
    16,
  );
  const publishedMaskDiscardReplayBody = JSON.parse(publishedMaskDiscardReplay.body);
  const canonicalAfterPublishedMaskDiscard = await get(
    '/api/campaign-workspace',
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const publishedMaskDiscardRevision = await queryDb(
    `SELECT reason
       FROM level_working_copy_revisions
      WHERE document_id = $1 AND revision = 17`,
    [newDocumentId],
  );
  const publishedMaskDetachEvent = await queryDb(
    `SELECT action, details
       FROM predrawn_background_version_events
      WHERE document_id = $1 AND version_id = $2
      ORDER BY id DESC
      LIMIT 1`,
    [newDocumentId, selectedMask.version.id],
  );
  const publishedMaskAfterDiscard = await queryDb(
    `SELECT status, row_revision
       FROM predrawn_background_versions
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, selectedMask.version.id],
  );
  const workingAfterPublishedMaskDiscard = boardRender.decodeBoard(
    publishedMaskDiscardBody.document?.level?.boardCode || '',
  );
  // The primary slot was archived earlier in this smoke, which archived its raw
  // input. Reopen only that fixture status while proving a same-slot terminal
  // retry, then restore the retained-history status below.
  await queryDb(
    `UPDATE predrawn_background_versions
        SET status = 'ready', archived_at = NULL, archived_by = NULL
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, rawBackground.id],
  );
  const retriedPublishedMask = await createMask(
    warpedReady.id,
    'published-discard-retry-processing-2',
    privateEnvironmentGeometrySha256,
    null,
    publishedArchiveAttemptId,
  );
  const retriedPublishedMaskReplay = await createMask(
    warpedReady.id,
    'published-discard-retry-processing-2',
    privateEnvironmentGeometrySha256,
    null,
    publishedArchiveAttemptId,
  );
  if (
    publishedMaskSelectionAutosave.statusCode !== 200
    || JSON.parse(publishedMaskSelectionAutosave.body).document?.revision !== 16
    || staleOcclusionAttemptDiscard.statusCode !== 409
    || JSON.parse(staleOcclusionAttemptDiscard.body).error !== 'generation_attempt_conflict'
    || staleOcclusionDocumentDiscard.statusCode !== 409
    || JSON.parse(staleOcclusionDocumentDiscard.body).error !== 'editor_document_revision_conflict'
    || invalidFenceOcclusionDiscard.statusCode !== 403
    || JSON.parse(invalidFenceOcclusionDiscard.body).error
      !== 'editor_document_edit_session_key_invalid'
    || publishedMaskDiscard.statusCode !== 200
    || publishedMaskDiscardBody.attempt?.id !== publishedArchiveAttemptId
    || publishedMaskDiscardBody.attempt?.warped_version_id !== warpedReady.id
    || publishedMaskDiscardBody.attempt?.occlusion_version_id !== null
    || publishedMaskDiscardBody.attempt?.processing_revision !== 2
    || publishedMaskDiscardBody.attempt?.move_highlight_profile_warped_version_id
      !== warpedReady.id
    || publishedMaskDiscardBody.document?.revision !== 17
    || publishedMaskDiscardBody.forgotten_selection?.working_copy !== true
    || publishedMaskDiscardBody.forgotten_selection?.canonical !== false
    || publishedMaskDiscardBody.forgotten_selection?.version_ids?.join(',')
      !== selectedMask.version.id
    || publishedMaskDiscardBody.selection?.working_copy_fell_back !== true
    || publishedMaskDiscardBody.selection?.canonical_reference_retained !== false
    || publishedMaskDiscardBody.detached_version_archived !== false
    || publishedMaskDiscardBody.retained_reason !== 'published-history'
    || publishedMaskDiscardBody.idempotent_replay !== false
    || workingAfterPublishedMaskDiscard?.backgroundMode !== 'ai'
    || workingAfterPublishedMaskDiscard?.surface?.backgroundVersionId !== warpedReady.id
    || workingAfterPublishedMaskDiscard?.surface?.occlusionVersionId !== undefined
    || publishedMaskDiscardReplay.statusCode !== 200
    || publishedMaskDiscardReplayBody.idempotent_replay !== true
    || publishedMaskDiscardReplayBody.document?.revision !== 17
    || JSON.parse(canonicalAfterPublishedMaskDiscard.body).revision
      !== JSON.parse(canonicalBeforePublishedMaskDiscard.body).revision
    || JSON.parse(canonicalAfterPublishedMaskDiscard.body).levels.l2.boardCode
      !== JSON.parse(canonicalBeforePublishedMaskDiscard.body).levels.l2.boardCode
    || publishedMaskDiscardRevision.rows[0]?.reason
      !== 'generation-attempt-occlusion-discard'
    || publishedMaskDetachEvent.rows[0]?.action !== 'attempt-detached'
    || publishedMaskDetachEvent.rows[0]?.details?.attempt_id !== publishedArchiveAttemptId
    || publishedMaskAfterDiscard.rows[0]?.status !== 'published'
    || retriedPublishedMask.create.statusCode !== 201
    || retriedPublishedMask.upload?.statusCode !== 200
    || retriedPublishedMask.version?.id === selectedMask.version.id
    || retriedPublishedMask.attempt?.occlusion_version_id !== retriedPublishedMask.version?.id
    || retriedPublishedMask.attempt?.processing_revision !== 2
    || retriedPublishedMaskReplay.create.statusCode !== 200
    || retriedPublishedMaskReplay.version?.id !== retriedPublishedMask.version?.id
  ) {
    throw new Error(`Published occlusion discard/retry failed: ${publishedMaskSelectionAutosave.statusCode} ${publishedMaskSelectionAutosave.body} / stale-attempt ${staleOcclusionAttemptDiscard.statusCode} ${staleOcclusionAttemptDiscard.body} / stale-document ${staleOcclusionDocumentDiscard.statusCode} ${staleOcclusionDocumentDiscard.body} / stale-fence ${invalidFenceOcclusionDiscard.statusCode} ${invalidFenceOcclusionDiscard.body} / discard ${publishedMaskDiscard.statusCode} ${publishedMaskDiscard.body} / replay ${publishedMaskDiscardReplay.statusCode} ${publishedMaskDiscardReplay.body} / retry ${retriedPublishedMask.create.statusCode} ${retriedPublishedMask.create.body} ${retriedPublishedMask.upload?.statusCode} ${retriedPublishedMask.upload?.body} / retry-replay ${retriedPublishedMaskReplay.create.statusCode} ${retriedPublishedMaskReplay.create.body}`);
  }
  const discardedReplacementMask = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    retriedPublishedMask.version.id,
    retriedPublishedMask.attempt.row_revision,
    '__Host-chess-tactics-access=abc',
    null,
    17,
  );
  const discardedReplacementMaskBody = JSON.parse(discardedReplacementMask.body);
  const discardedReplacementMaskReplay = await discardGenerationAttemptOcclusionRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    retriedPublishedMask.version.id,
    retriedPublishedMask.attempt.row_revision,
    '__Host-chess-tactics-access=abc',
    null,
    17,
  );
  const replacementMaskEvent = await queryDb(
    `SELECT action, details
       FROM predrawn_background_version_events
      WHERE document_id = $1 AND version_id = $2
      ORDER BY id DESC
      LIMIT 1`,
    [newDocumentId, retriedPublishedMask.version.id],
  );
  if (
    discardedReplacementMask.statusCode !== 200
    || discardedReplacementMaskBody.attempt?.occlusion_version_id !== null
    || discardedReplacementMaskBody.attempt?.processing_revision !== 3
    || discardedReplacementMaskBody.attempt?.move_highlight_profile_warped_version_id
      !== warpedReady.id
    || discardedReplacementMaskBody.document?.revision !== 17
    || discardedReplacementMaskBody.forgotten_selection?.working_copy !== false
    || discardedReplacementMaskBody.detached_version?.status !== 'archived'
    || discardedReplacementMaskBody.detached_version_archived !== true
    || discardedReplacementMaskBody.retained_reason !== null
    || discardedReplacementMaskReplay.statusCode !== 200
    || JSON.parse(discardedReplacementMaskReplay.body).idempotent_replay !== true
    || replacementMaskEvent.rows[0]?.action !== 'archived'
    || replacementMaskEvent.rows[0]?.details?.attempt_id !== publishedArchiveAttemptId
  ) {
    throw new Error(`Unpublished replacement mask was not archived on discard: ${discardedReplacementMask.statusCode} ${discardedReplacementMask.body} / replay ${discardedReplacementMaskReplay.statusCode} ${discardedReplacementMaskReplay.body} / ${JSON.stringify(replacementMaskEvent.rows)}`);
  }
  await queryDb(
    `UPDATE predrawn_background_versions
        SET status = 'archived', archived_at = now(), archived_by = owner_email
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, rawBackground.id],
  );
  const publishedAttemptArchive = await archiveGenerationAttemptRequest(
    newDocumentId,
    publishedArchiveAttemptId,
    discardedReplacementMaskBody.attempt.row_revision,
  );
  const publishedAttemptAfterArchive = await queryDb(
    `SELECT status, row_revision
       FROM predrawn_generation_attempts
      WHERE document_id = $1 AND id = $2`,
    [newDocumentId, publishedArchiveAttemptId],
  );
  if (
    publishedAttemptArchive.statusCode !== 409
    || JSON.parse(publishedAttemptArchive.body).error !== 'generation_attempt_published'
    || publishedAttemptAfterArchive.rows[0]?.status !== 'active'
    || Number(publishedAttemptAfterArchive.rows[0]?.row_revision)
      !== discardedReplacementMaskBody.attempt.row_revision
  ) {
    throw new Error(`Published pipeline history became archivable: ${publishedAttemptArchive.statusCode} ${publishedAttemptArchive.body} / ${JSON.stringify(publishedAttemptAfterArchive.rows)}`);
  }

  // A v1 immutable artifact included live cover in its geometry digest. The
  // first fenced mutation must bind it from the server-held pre-mutation body,
  // before a cover-only change makes that legacy digest unreproducible.
  const legacyEditor = await request(
    'POST',
    '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level: { ...workspaceLevel, id: 'legacy-geometry-placeholder', name: 'Legacy geometry migration' } }),
  );
  const legacyEditorBody = JSON.parse(legacyEditor.body);
  const legacyDocumentId = legacyEditorBody.document?.document_id;
  const legacyLevelId = legacyEditorBody.document?.level_id;
  if (legacyEditor.statusCode !== 201 || !legacyDocumentId || !legacyLevelId) {
    throw new Error(`Could not create legacy-geometry migration fixture: ${legacyEditor.statusCode} ${legacyEditor.body}`);
  }
  const legacyGeometryEditSession = await openEditorEditSession(legacyDocumentId, {
    deviceId: 'smoke-legacy-geometry-device',
    clientLabel: 'Legacy geometry migration smoke editor',
  });
  if (legacyGeometryEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(legacyGeometryEditSession.body.session.state)) {
    throw new Error(`Could not acquire legacy-geometry edit authority: ${legacyGeometryEditSession.response.statusCode} ${legacyGeometryEditSession.response.body}`);
  }
  const initialLegacyCover = { '0,0': 'filled' };
  const initialLegacyCoverTypes = { '0,0': 'grass' };
  const legacyGeometryTemplateCode = boardCodeWith(
    versionedBoardCode(crypto.randomUUID(), null),
    { cover: initialLegacyCover, coverTypes: initialLegacyCoverTypes },
  );
  const legacyGeometryV2 = environmentGeometrySha256(legacyGeometryTemplateCode);
  const legacyRawAttemptFixture = await seedGenerationAttemptFixture(
    legacyDocumentId,
    legacyGeometryV2,
    legacyGeometryTemplateCode,
    'Legacy raw migration attempt',
  );
  const legacyRawCreate = await createBackgroundVersionRequest(legacyDocumentId, {
    kind: 'raw',
    attempt_id: legacyRawAttemptFixture.attemptId,
    label: 'Legacy v1 generated scene',
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: backgroundWorldBounds,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: legacyGeometryV2,
    },
    provenance: {
      pipeline: 'smoke-legacy-v1-migration',
      run: 'legacy-v1-root',
      sourceSha256: rawPngSha256,
      environmentGeometrySha256: legacyGeometryV2,
    },
    idempotency_key: `background-legacy-v1:${legacyDocumentId}`,
  });
  const legacyRawDraft = JSON.parse(legacyRawCreate.body).version;
  const legacyRawUpload = await uploadBackgroundVersionRequest(
    legacyDocumentId,
    legacyRawDraft.id,
    legacyRawDraft.row_revision,
    rawPng,
  );
  const legacyRawReady = JSON.parse(legacyRawUpload.body).version;
  if (legacyRawCreate.statusCode !== 201 || legacyRawUpload.statusCode !== 200 || !legacyRawReady?.id) {
    throw new Error(`Could not stage legacy v1 background fixture: ${legacyRawCreate.statusCode} ${legacyRawCreate.body} / ${legacyRawUpload.statusCode} ${legacyRawUpload.body}`);
  }
  const legacySelectedBoardCode = boardCodeWith(
    versionedBoardCode(legacyRawReady.id, null),
    { cover: initialLegacyCover, coverTypes: initialLegacyCoverTypes },
  );
  const legacyGeometryV1 = legacyEnvironmentGeometrySha256(legacySelectedBoardCode);
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = jsonb_set(
              jsonb_set(operation, '{environmentGeometrySchema}', '"predrawn-environment-geometry-v1"'::jsonb),
              '{environmentGeometrySha256}', to_jsonb($2::text)
            ),
            provenance = jsonb_set(provenance, '{environmentGeometrySha256}', to_jsonb($2::text))
      WHERE id = $1`,
    [legacyRawReady.id, legacyGeometryV1],
  );
  const legacySelectedLevel = {
    ...legacyEditorBody.document.level,
    id: legacyLevelId,
    boardCode: legacySelectedBoardCode,
  };
  const selectLegacyAutosave = await request(
    'PUT',
    `/api/editor-documents/${legacyDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 1,
      level: legacySelectedLevel,
    })),
  );
  const bindingsBeforeCoverEdit = await queryDb(
    'SELECT version_id FROM predrawn_background_geometry_bindings WHERE version_id = $1',
    [legacyRawReady.id],
  );
  const directLegacyAttemptFixture = await seedGenerationAttemptFixture(
    legacyDocumentId,
    legacyGeometryV2,
    legacyGeometryTemplateCode,
    'Direct legacy chain attempt',
  );
  const directLegacyRawCreate = await createBackgroundVersionRequest(legacyDocumentId, {
    kind: 'raw',
    attempt_id: directLegacyAttemptFixture.attemptId,
    label: 'Legacy v1 direct-operation source',
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: backgroundWorldBounds,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: legacyGeometryV2,
    },
    provenance: {
      pipeline: 'smoke-legacy-v1-migration',
      run: 'legacy-v1-direct-source',
      sourceSha256: rawPngSha256,
      environmentGeometrySha256: legacyGeometryV2,
    },
    idempotency_key: `background-legacy-v1-direct:${legacyDocumentId}`,
  });
  const directLegacyRawDraft = JSON.parse(directLegacyRawCreate.body).version;
  const directLegacyRawUpload = await uploadBackgroundVersionRequest(
    legacyDocumentId,
    directLegacyRawDraft.id,
    directLegacyRawDraft.row_revision,
    rawPng,
  );
  const directLegacyRawReady = JSON.parse(directLegacyRawUpload.body).version;
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = jsonb_set(
              jsonb_set(operation, '{environmentGeometrySchema}', '"predrawn-environment-geometry-v1"'::jsonb),
              '{environmentGeometrySha256}', to_jsonb($2::text)
            ),
            provenance = jsonb_set(provenance, '{environmentGeometrySha256}', to_jsonb($2::text))
      WHERE id = $1`,
    [directLegacyRawReady.id, legacyGeometryV1],
  );
  const directBindingBeforeCreate = await queryDb(
    'SELECT version_id FROM predrawn_background_geometry_bindings WHERE version_id = $1',
    [directLegacyRawReady.id],
  );
  const directV2WarpCreate = await createBackgroundVersionRequest(legacyDocumentId, {
    kind: 'warped',
    attempt_id: directLegacyAttemptFixture.attemptId,
    label: 'Direct v2 child from legacy source',
    parent_version_id: directLegacyRawReady.id,
    source_background_version_id: directLegacyRawReady.id,
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'grid-warp-v1',
      registration: '64,64,32,0,64,32,32,64,0,32',
      sourceWidth: 64,
      sourceHeight: 64,
      rasterScale: 1,
      encoder: 'png-rgba8-filter0-stored-deflate-v1',
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: legacyGeometryV2,
      outputSha256: warpedPngSha256,
    },
    provenance: {
      processor: 'shared-predrawn-rasterizer-v1',
      parentVersionId: directLegacyRawReady.id,
      environmentGeometrySha256: legacyGeometryV2,
      outputSha256: warpedPngSha256,
    },
    idempotency_key: `background-legacy-v1-direct-warp:${legacyDocumentId}`,
  });
  const directV2WarpCreateBody = JSON.parse(directV2WarpCreate.body);
  const directV2WarpDraft = directV2WarpCreateBody.version;
  const directV2WarpUpload = await uploadBackgroundVersionRequest(
    legacyDocumentId,
    directV2WarpDraft.id,
    directV2WarpDraft.row_revision,
    warpedPng,
  );
  const directLegacyWarpReady = JSON.parse(directV2WarpUpload.body).version;
  const directMoveHighlightFit = await request(
    'PUT',
    `/api/editor-documents/${legacyDocumentId}/generation-attempts/${directLegacyAttemptFixture.attemptId}/move-highlight-profile`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', {
      expected_revision: directV2WarpCreateBody.attempt.row_revision,
      expected_warped_version_id: directLegacyWarpReady.id,
      cells: {},
    })),
    5000,
  );
  const directBindingAfterCreate = await queryDb(
    `SELECT legacy_environment_geometry_sha256, environment_geometry_sha256
       FROM predrawn_background_geometry_bindings
      WHERE version_id = $1`,
    [directLegacyRawReady.id],
  );
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = jsonb_set(
              jsonb_set(operation, '{environmentGeometrySchema}', '"predrawn-environment-geometry-v1"'::jsonb),
              '{environmentGeometrySha256}', to_jsonb($2::text)
            ),
            provenance = jsonb_set(provenance, '{environmentGeometrySha256}', to_jsonb($2::text))
      WHERE id = $1`,
    [directLegacyWarpReady.id, legacyGeometryV1],
  );
  const directWarpBindingBeforeOcclusion = await queryDb(
    'SELECT version_id FROM predrawn_background_geometry_bindings WHERE version_id = $1',
    [directLegacyWarpReady.id],
  );
  const directOcclusionPng = syntheticPng(64, 64, '#000000', '#202020');
  const directOcclusionSha256 = crypto.createHash('sha256').update(directOcclusionPng).digest('hex');
  const directV2OcclusionCreate = await createBackgroundVersionRequest(legacyDocumentId, {
    kind: 'occlusion',
    attempt_id: directLegacyAttemptFixture.attemptId,
    label: 'Direct v2 occlusion from legacy source',
    source_background_version_id: directLegacyWarpReady.id,
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'occlusion-depth-v1',
      encoding: 'rgb24-signed-half-depth-alpha',
      sourceBackgroundVersionId: directLegacyWarpReady.id,
      maskCount: 0,
      encoder: 'png-rgba8-filter0-stored-deflate-v1',
      coordinateBasis: 'board-world-pixels-v1',
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: legacyGeometryV2,
      outputSha256: directOcclusionSha256,
    },
    provenance: {
      processor: 'canonical-depth-mask-v1',
      sourceBackgroundVersionId: directLegacyWarpReady.id,
      environmentGeometrySha256: legacyGeometryV2,
      outputSha256: directOcclusionSha256,
    },
    idempotency_key: `background-legacy-v1-direct-occlusion:${legacyDocumentId}`,
  });
  const directWarpBindingAfterOcclusion = await queryDb(
    `SELECT legacy_environment_geometry_sha256, environment_geometry_sha256
       FROM predrawn_background_geometry_bindings
      WHERE version_id = $1`,
    [directLegacyWarpReady.id],
  );
  if (
    directLegacyRawCreate.statusCode !== 201
    || directLegacyRawUpload.statusCode !== 200
    || directBindingBeforeCreate.rows.length !== 0
    || directV2WarpCreate.statusCode !== 201
    || directV2WarpUpload.statusCode !== 200
    || directBindingAfterCreate.rows[0]?.legacy_environment_geometry_sha256 !== legacyGeometryV1
    || directBindingAfterCreate.rows[0]?.environment_geometry_sha256 !== legacyGeometryV2
    || directMoveHighlightFit.statusCode !== 200
    || JSON.parse(directMoveHighlightFit.body).attempt?.move_highlight_profile_warped_version_id
      !== directLegacyWarpReady.id
    || directWarpBindingBeforeOcclusion.rows.length !== 0
    || directV2OcclusionCreate.statusCode !== 201
    || directWarpBindingAfterOcclusion.rows[0]?.legacy_environment_geometry_sha256 !== legacyGeometryV1
    || directWarpBindingAfterOcclusion.rows[0]?.environment_geometry_sha256 !== legacyGeometryV2
  ) {
    throw new Error(`Direct v2 operation could not bind its immutable v1 source: ${directLegacyRawCreate.statusCode} ${directLegacyRawCreate.body} / ${directLegacyRawUpload.statusCode} ${directLegacyRawUpload.body} / ${JSON.stringify(directBindingBeforeCreate.rows)} / ${directV2WarpCreate.statusCode} ${directV2WarpCreate.body} / ${directV2WarpUpload.statusCode} ${directV2WarpUpload.body} / ${directMoveHighlightFit.statusCode} ${directMoveHighlightFit.body} / ${JSON.stringify(directBindingAfterCreate.rows)} / ${JSON.stringify(directWarpBindingBeforeOcclusion.rows)} / ${directV2OcclusionCreate.statusCode} ${directV2OcclusionCreate.body} / ${JSON.stringify(directWarpBindingAfterOcclusion.rows)}`);
  }
  const coverChangedBoardCode = boardCodeWith(legacySelectedBoardCode, {
    cover: { ...initialLegacyCover, '1,1': 'sparse' },
    coverTypes: { ...initialLegacyCoverTypes, '1,1': 'water' },
  });
  const coverChangedLevel = { ...legacySelectedLevel, boardCode: coverChangedBoardCode };
  const coverFirstAutosave = await request(
    'PUT',
    `/api/editor-documents/${legacyDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 2,
      level: coverChangedLevel,
    })),
  );
  const durableLegacyBinding = await queryDb(
    `SELECT legacy_environment_geometry_schema, legacy_environment_geometry_sha256,
            environment_geometry_schema, environment_geometry_sha256
       FROM predrawn_background_geometry_bindings
      WHERE version_id = $1`,
    [legacyRawReady.id],
  );
  const listedLegacyVersions = await get(
    `/api/editor-documents/${legacyDocumentId}/background-versions`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const listedLegacyVersion = JSON.parse(listedLegacyVersions.body).versions?.find(
    (version) => version.id === legacyRawReady.id,
  );
  const coverChangedSave = await request(
    'POST',
    `/api/editor-documents/${legacyDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', { revision: 3 })),
    5000,
  );
  const coverChangedBoard = boardRender.decodeBoard(coverChangedBoardCode);
  const staleBakedBoardCode = boardRender.encodeBoard({
    ...coverChangedBoard,
    cells: { ...coverChangedBoard.cells, '0,0': 'stone' },
  });
  const staleBakedAutosave = await request(
    'PUT',
    `/api/editor-documents/${legacyDocumentId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 4,
      level: { ...coverChangedLevel, boardCode: staleBakedBoardCode },
    })),
  );
  const staleBakedSave = await request(
    'POST',
    `/api/editor-documents/${legacyDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(legacyDocumentId, '__Host-chess-tactics-access=abc', { revision: 5 })),
    5000,
  );
  const binding = durableLegacyBinding.rows[0];
  if (
    selectLegacyAutosave.statusCode !== 200
    || JSON.parse(selectLegacyAutosave.body).document.revision !== 2
    || bindingsBeforeCoverEdit.rows.length !== 0
    || coverFirstAutosave.statusCode !== 200
    || JSON.parse(coverFirstAutosave.body).document.revision !== 3
    || binding?.legacy_environment_geometry_schema !== 'predrawn-environment-geometry-v1'
    || binding?.legacy_environment_geometry_sha256 !== legacyGeometryV1
    || binding?.environment_geometry_schema !== 'predrawn-environment-geometry-v2'
    || binding?.environment_geometry_sha256 !== legacyGeometryV2
    || listedLegacyVersions.statusCode !== 200
    || listedLegacyVersion?.environment_geometry_sha256_v2 !== legacyGeometryV2
    || coverChangedSave.statusCode !== 200
    || JSON.parse(coverChangedSave.body).document.revision !== 4
    || staleBakedAutosave.statusCode !== 200
    || JSON.parse(staleBakedAutosave.body).document.revision !== 5
    || staleBakedSave.statusCode !== 409
    || JSON.parse(staleBakedSave.body).error !== 'predrawn_background_geometry_mismatch'
  ) {
    throw new Error(`Legacy geometry binding failed its first-cover-edit migration boundary: ${selectLegacyAutosave.statusCode} ${selectLegacyAutosave.body} / ${JSON.stringify(bindingsBeforeCoverEdit.rows)} / ${coverFirstAutosave.statusCode} ${coverFirstAutosave.body} / ${JSON.stringify(binding)} / ${listedLegacyVersions.statusCode} ${listedLegacyVersions.body} / ${coverChangedSave.statusCode} ${coverChangedSave.body} / ${staleBakedAutosave.statusCode} ${staleBakedAutosave.body} / ${staleBakedSave.statusCode} ${staleBakedSave.body}`);
  }

  // Operational bounds are part of the permanent version-store contract. Fill
  // this one disposable document through direct fixture rows so the smoke can
  // exercise the exact HTTP boundaries without uploading a real GiB.
  const distinctQuotaPng = syntheticPng(64, 64, '#241830', '#9070a0');
  const distinctQuotaSha256 = crypto.createHash('sha256').update(distinctQuotaPng).digest('hex');
  const quotaAttemptIds = [];
  for (const suffix of ['distinct', 'reuse', 'over-limit']) {
    const response = await createGenerationAttemptRequest(newDocumentId, {
      label: `Quota ${suffix} attempt`,
      source_version_id: sourceArtworkReady.id,
      idempotency_key: `generation-attempt:${newDocumentId}:quota:${suffix}`,
    });
    const body = JSON.parse(response.body);
    if (response.statusCode !== 201 || !body.attempt?.id) {
      throw new Error(`Could not create quota attempt ${suffix}: ${response.statusCode} ${response.body}`);
    }
    quotaAttemptIds.push(body.attempt.id);
  }
  const quotaPayload = (label, key, sourceSha256, attemptId) => ({
    kind: 'raw',
    attempt_id: attemptId,
    label,
    world_bounds: backgroundWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: backgroundWorldBounds,
      outputSha256: sourceSha256,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
    },
    provenance: {
      sourceSha256,
      outputSha256: sourceSha256,
      pipeline: 'smoke-quota-fixture',
      environmentGeometrySha256: privateEnvironmentGeometrySha256,
    },
    idempotency_key: key,
  });
  const distinctQuotaCreate = await createBackgroundVersionRequest(
    newDocumentId,
    quotaPayload(
      'Distinct owner-quota upload',
      `background-quota-distinct:${newDocumentId}`,
      distinctQuotaSha256,
      quotaAttemptIds[0],
    ),
  );
  const reuseQuotaCreate = await createBackgroundVersionRequest(
    newDocumentId,
    quotaPayload(
      'Existing-byte owner-quota upload',
      `background-quota-reuse:${newDocumentId}`,
      rawPngSha256,
      quotaAttemptIds[1],
    ),
  );
  const distinctQuotaVersion = JSON.parse(distinctQuotaCreate.body).version;
  const reuseQuotaVersion = JSON.parse(reuseQuotaCreate.body).version;
  if (
    distinctQuotaCreate.statusCode !== 201 || !distinctQuotaVersion?.id
    || reuseQuotaCreate.statusCode !== 201 || !reuseQuotaVersion?.id
  ) {
    throw new Error(`Could not create background quota fixtures: ${distinctQuotaCreate.statusCode} ${distinctQuotaCreate.body} / ${reuseQuotaCreate.statusCode} ${reuseQuotaCreate.body}`);
  }
  await queryDb(
    `WITH existing AS (
       SELECT count(*)::integer AS count
         FROM predrawn_background_versions
        WHERE document_id = $1
     )
     INSERT INTO predrawn_background_versions (
       id, document_id, owner_email, level_id, kind, label, world_bounds,
       operation, provenance, created_by_email, created_by_name, updated_by
     )
     SELECT md5($1 || ':quota-row:' || series.value::text)::uuid,
            $1, 'player@example.com', 'l2', 'raw',
            'Quota seed ' || series.value::text,
            '{"minX":0,"minY":0,"width":8,"height":12}'::jsonb,
            '{"fixture":"row-quota"}'::jsonb,
            '{"fixture":"row-quota"}'::jsonb,
            'player@example.com', 'Tactics Player', 'player@example.com'
       FROM existing
       CROSS JOIN LATERAL generate_series(1, GREATEST(0, 256 - existing.count)) AS series(value)`,
    [newDocumentId],
  );
  const filledVersionCount = await queryDb(
    'SELECT count(*)::integer AS count FROM predrawn_background_versions WHERE document_id = $1',
    [newDocumentId],
  );
  await queryDb(
    `WITH candidate_rows AS (
       SELECT id, row_number() OVER (ORDER BY id) AS ordinal
         FROM predrawn_background_versions
        WHERE document_id = $1 AND label LIKE 'Quota seed %'
        ORDER BY id
        LIMIT 32
     ), fixture_blobs AS (
       SELECT ordinal,
              md5($1 || ':quota-blob:' || ordinal::text)
                || md5($1 || ':quota-blob:' || ordinal::text) AS sha256
         FROM candidate_rows
     )
     INSERT INTO media_blobs (sha256, blob_key, media_type, byte_length, width, height)
     SELECT sha256, 'objects/' || left(sha256, 2) || '/' || sha256,
            'image/png', 33554432, 1, 1
       FROM fixture_blobs
     ON CONFLICT (sha256) DO NOTHING`,
    [newDocumentId],
  );
  await queryDb(
    `WITH candidate_rows AS (
       SELECT id, row_number() OVER (ORDER BY id) AS ordinal
         FROM predrawn_background_versions
        WHERE document_id = $1 AND label LIKE 'Quota seed %'
        ORDER BY id
        LIMIT 32
     ), fixture_blobs AS (
       SELECT ordinal,
              md5($1 || ':quota-blob:' || ordinal::text)
                || md5($1 || ':quota-blob:' || ordinal::text) AS sha256
         FROM candidate_rows
     )
     UPDATE predrawn_background_versions version
        SET blob_sha256 = fixture_blobs.sha256, width = 1, height = 1
       FROM candidate_rows
       JOIN fixture_blobs ON fixture_blobs.ordinal = candidate_rows.ordinal
      WHERE version.id = candidate_rows.id`,
    [newDocumentId],
  );
  const overDocumentQuota = await createBackgroundVersionRequest(
    newDocumentId,
    quotaPayload(
      'Over document quota',
      `background-quota-row-over:${newDocumentId}`,
      distinctQuotaSha256,
      quotaAttemptIds[2],
    ),
  );
  const replayAtDocumentQuota = await createBackgroundVersionRequest(newDocumentId, rawBackgroundPayload);
  const reusedBlobAtOwnerQuota = await uploadBackgroundVersionRequest(
    newDocumentId,
    reuseQuotaVersion.id,
    reuseQuotaVersion.row_revision,
    rawPng,
  );
  const distinctBlobOverOwnerQuota = await uploadBackgroundVersionRequest(
    newDocumentId,
    distinctQuotaVersion.id,
    distinctQuotaVersion.row_revision,
    distinctQuotaPng,
  );
  if (
    Number(filledVersionCount.rows[0]?.count) !== 256
    || overDocumentQuota.statusCode !== 409
    || JSON.parse(overDocumentQuota.body).error !== 'background_version_document_quota_exceeded'
    || replayAtDocumentQuota.statusCode !== 200
    || JSON.parse(replayAtDocumentQuota.body).idempotent_replay !== true
    || reusedBlobAtOwnerQuota.statusCode !== 200
    || JSON.parse(reusedBlobAtOwnerQuota.body).version.content_sha256 !== rawPngSha256
    || distinctBlobOverOwnerQuota.statusCode !== 413
    || JSON.parse(distinctBlobOverOwnerQuota.body).error !== 'background_version_owner_blob_quota_exceeded'
  ) {
    throw new Error(`Background operational quotas failed: ${JSON.stringify(filledVersionCount.rows)} / ${overDocumentQuota.statusCode} ${overDocumentQuota.body} / ${replayAtDocumentQuota.statusCode} ${replayAtDocumentQuota.body} / ${reusedBlobAtOwnerQuota.statusCode} ${reusedBlobAtOwnerQuota.body} / ${distinctBlobOverOwnerQuota.statusCode} ${distinctBlobOverOwnerQuota.body}`);
  }
  const deletedQuotaSeedVersions = await queryDb(
    `DELETE FROM predrawn_background_versions
      WHERE document_id = $1 AND label LIKE 'Quota seed %'
      RETURNING blob_sha256`,
    [newDocumentId],
  );
  const quotaSeedBlobSha256s = deletedQuotaSeedVersions.rows
    .map((row) => row.blob_sha256)
    .filter(Boolean);
  if (quotaSeedBlobSha256s.length !== 32) {
    throw new Error(`Quota fixture cleanup did not recover its 32 synthetic Blob references: ${JSON.stringify(deletedQuotaSeedVersions.rows)}`);
  }
  await queryDb(
    `DELETE FROM media_blobs blob
      WHERE blob.sha256 = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1
            FROM predrawn_background_versions retained
           WHERE retained.blob_sha256 = blob.sha256
        )`,
    [quotaSeedBlobSha256s],
  );

  // Official working copies use the same CAS contract, but only admins may
  // resolve or mutate them; the promoted workspace remains globally readable.
  const nonAdminOfficialEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'off-l-test', workspace_kind: 'official', workspace_id: 'default' }),
  );
  if (nonAdminOfficialEditor.statusCode !== 403) {
    throw new Error(`Official editor document should require admin: ${nonAdminOfficialEditor.statusCode} ${nonAdminOfficialEditor.body}`);
  }
  const officialEditor = await request(
    'POST', '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'off-l-test', workspace_kind: 'official', workspace_id: 'default' }),
  );
  const officialEditorBody = JSON.parse(officialEditor.body);
  const officialDocumentId = officialEditorBody.document && officialEditorBody.document.document_id;
  if (officialEditor.statusCode !== 201 || typeof officialDocumentId !== 'string' || !officialDocumentId || officialEditorBody.document.level.name !== 'Test Level') {
    throw new Error(`Official editor resolve failed: ${officialEditor.statusCode} ${officialEditor.body}`);
  }
  const officialEditSession = await openEditorEditSession(officialDocumentId, {
    deviceId: 'smoke-official-device',
    clientLabel: 'Official smoke editor',
  });
  if (officialEditSession.response.statusCode !== 200 || !['active', 'waiting'].includes(officialEditSession.body.session.state)) {
    throw new Error(`Could not acquire official edit authority: ${officialEditSession.response.statusCode} ${officialEditSession.response.body}`);
  }
  const officialWorldBounds = backgroundWorldBounds;
  const officialGeometryBoardCode = versionedBoardCode(
    crypto.randomUUID(),
    null,
    { rows: 8 },
  );
  const officialEnvironmentGeometrySha256 = environmentGeometrySha256(
    officialGeometryBoardCode,
  );
  const officialAttemptFixture = await seedGenerationAttemptFixture(
    officialDocumentId,
    officialEnvironmentGeometrySha256,
    officialGeometryBoardCode,
    'Official generated scene attempt',
  );
  const officialRawPng = syntheticPng(64, 64, '#182040', '#8090c0');
  const officialRawPngSha256 = crypto.createHash('sha256').update(officialRawPng).digest('hex');
  const officialRawCreate = await createBackgroundVersionRequest(officialDocumentId, {
    kind: 'raw',
    attempt_id: officialAttemptFixture.attemptId,
    label: 'Official generated scene',
    world_bounds: officialWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: officialWorldBounds,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: officialEnvironmentGeometrySha256,
    },
    provenance: {
      pipeline: 'smoke-imagegen',
      run: 'official-raw-1',
      sourceSha256: officialRawPngSha256,
      environmentGeometrySha256: officialEnvironmentGeometrySha256,
    },
    idempotency_key: `background-official-raw:${officialDocumentId}`,
  });
  const officialRawDraft = JSON.parse(officialRawCreate.body).version;
  const officialRawUpload = await uploadBackgroundVersionRequest(
    officialDocumentId,
    officialRawDraft.id,
    officialRawDraft.row_revision,
    officialRawPng,
  );
  const officialRawReady = JSON.parse(officialRawUpload.body).version;
  if (
    officialRawCreate.statusCode !== 201 || officialRawUpload.statusCode !== 200
    || officialRawReady.status !== 'ready' || officialRawReady.row_revision !== 1
  ) {
    throw new Error(`Official background staging failed: ${officialRawCreate.statusCode} ${officialRawCreate.body} / ${officialRawUpload.statusCode} ${officialRawUpload.body}`);
  }
  const officialExactSaveLevel = {
    ...officialWorkspace.levels['off-l-test'],
    name: 'Official Exact Save',
    layers: {
      ...officialWorkspace.levels['off-l-test'].layers,
      terrain: [{ x: 0, y: 0, terrain: 'grass', elevation: 0 }],
    },
    boardCode: versionedBoardCode(officialRawReady.id, null, { rows: 8 }),
  };
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation - 'coordinateBasis'
      WHERE id = $1`,
    [officialRawReady.id],
  );
  const invalidRawContractOfficialSave = await request(
    'POST', `/api/editor-documents/${officialDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(officialDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 1,
      level: officialExactSaveLevel,
    })),
  );
  await queryDb(
    `UPDATE predrawn_background_versions
        SET operation = operation || '{"coordinateBasis":"board-world-pixels-v1"}'::jsonb
      WHERE id = $1`,
    [officialRawReady.id],
  );
  if (
    invalidRawContractOfficialSave.statusCode !== 409
    || JSON.parse(invalidRawContractOfficialSave.body).error !== 'predrawn_background_contract_mismatch'
  ) {
    throw new Error(`Canonical Save accepted legacy raw operation metadata: ${invalidRawContractOfficialSave.statusCode} ${invalidRawContractOfficialSave.body}`);
  }
  const officialEditorSave = await request(
    'POST', `/api/editor-documents/${officialDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(officialDocumentId, '__Host-chess-tactics-access=abc', {
      revision: 1,
      level: officialExactSaveLevel,
    })),
  );
  const officialEditorSaveBody = JSON.parse(officialEditorSave.body);
  if (
    officialEditorSave.statusCode !== 200 ||
    officialEditorSaveBody.document.saved_revision !== 2 ||
    officialEditorSaveBody.thumbnail_ready !== true ||
    officialEditorSaveBody.workspace_revision !== 2
  ) {
    throw new Error(`Official editor Save failed: ${officialEditorSave.statusCode} ${officialEditorSave.body}`);
  }
  const officialPublishedVersion = await queryDb(
    `SELECT v.status, v.row_revision, v.published_by, b.published_at AS blob_published_at
       FROM predrawn_background_versions v
       JOIN media_blobs b ON b.sha256 = v.blob_sha256
      WHERE v.id = $1`,
    [officialRawReady.id],
  );
  const officialPublishedEvents = await queryDb(
    `SELECT action, actor_email, actor_name
       FROM predrawn_background_version_events
      WHERE version_id = $1 ORDER BY id`,
    [officialRawReady.id],
  );
  const anonymousOfficialBackground = await get(
    `/api/background-versions/${officialRawReady.id}/content`,
    {},
    5000,
  );
  if (
    officialPublishedVersion.rowCount !== 1
    || officialPublishedVersion.rows[0].status !== 'published'
    || Number(officialPublishedVersion.rows[0].row_revision) !== 2
    || officialPublishedVersion.rows[0].published_by !== 'player@example.com'
    || officialPublishedVersion.rows[0].blob_published_at === null
    || officialPublishedEvents.rows.map((row) => row.action).join(',') !== 'created,content-uploaded,published'
    || officialPublishedEvents.rows.some((row) => (
      row.actor_email !== 'player@example.com' || row.actor_name !== 'Tactics Player'
    ))
    || anonymousOfficialBackground.statusCode !== 200
    || anonymousOfficialBackground.headers['cache-control'] !== 'public, max-age=31536000, immutable'
  ) {
    throw new Error(`Official Save did not atomically publish its exact background: ${JSON.stringify(officialPublishedVersion.rows)} / ${JSON.stringify(officialPublishedEvents.rows)} / ${anonymousOfficialBackground.statusCode}`);
  }
  const officialAfterEditorSave = await get('/api/official-campaigns/default');
  const officialAfterEditorSaveBody = JSON.parse(officialAfterEditorSave.body);
  if (
    officialAfterEditorSaveBody.portfolio.data.levels['off-l-test'].name !== 'Official Exact Save' ||
    !/^\/api\/media\/[0-9a-f]{64}$/.test(officialAfterEditorSaveBody.thumbnail_urls['off-l-test'] || '') ||
    officialAfterEditorSaveBody.portfolio.revision !== 2
  ) {
    throw new Error(`Official editor Save did not promote globally: ${officialAfterEditorSave.body}`);
  }
  const staleOfficialWorkspaceSave = await request(
    'PUT', '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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

  // Official publication is collaborative across admins, but private staged
  // artifacts are not. A second admin must be able to retain an already-
  // published exact selection without seeing the first admin's new ready work.
  const firstAdminPrivateOfficialPng = syntheticPng(64, 64, '#401820', '#c08090');
  const firstAdminPrivateOfficialPngSha256 = crypto.createHash('sha256')
    .update(firstAdminPrivateOfficialPng)
    .digest('hex');
  const firstAdminPrivateOfficialAttemptFixture = await seedGenerationAttemptFixture(
    officialDocumentId,
    officialEnvironmentGeometrySha256,
    officialGeometryBoardCode,
    'First admin private follow-up attempt',
  );
  const firstAdminPrivateOfficialCreate = await createBackgroundVersionRequest(officialDocumentId, {
    kind: 'raw',
    attempt_id: firstAdminPrivateOfficialAttemptFixture.attemptId,
    label: 'First admin private follow-up',
    world_bounds: officialWorldBounds,
    operation: {
      kind: 'raw-generated-v2',
      untouched: true,
      coordinateBasis: 'board-world-pixels-v1',
      viewingPane: officialWorldBounds,
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: officialEnvironmentGeometrySha256,
    },
    provenance: {
      pipeline: 'smoke-imagegen',
      run: 'official-private-follow-up',
      sourceSha256: firstAdminPrivateOfficialPngSha256,
      environmentGeometrySha256: officialEnvironmentGeometrySha256,
    },
    idempotency_key: `background-official-private:${officialDocumentId}`,
  });
  const firstAdminPrivateOfficialDraft = JSON.parse(firstAdminPrivateOfficialCreate.body).version;
  const firstAdminPrivateOfficialUpload = await uploadBackgroundVersionRequest(
    officialDocumentId,
    firstAdminPrivateOfficialDraft.id,
    firstAdminPrivateOfficialDraft.row_revision,
    firstAdminPrivateOfficialPng,
  );
  const firstAdminPrivateOfficialReady = JSON.parse(firstAdminPrivateOfficialUpload.body).version;
  if (
    firstAdminPrivateOfficialCreate.statusCode !== 201
    || firstAdminPrivateOfficialUpload.statusCode !== 200
    || firstAdminPrivateOfficialReady.status !== 'ready'
  ) {
    throw new Error(`Could not stage cross-admin privacy fixture: ${firstAdminPrivateOfficialCreate.statusCode} ${firstAdminPrivateOfficialCreate.body} / ${firstAdminPrivateOfficialUpload.statusCode} ${firstAdminPrivateOfficialUpload.body}`);
  }
  const secondAdminOfficialEditor = await request(
    'POST',
    '/api/editor-documents/resolve',
    { cookie: '__Host-chess-tactics-access=second-admin', 'content-type': 'application/json' },
    JSON.stringify({ level_id: 'off-l-test', workspace_kind: 'official', workspace_id: 'default' }),
  );
  const secondAdminOfficialBody = JSON.parse(secondAdminOfficialEditor.body);
  const secondAdminDocumentId = secondAdminOfficialBody.document?.document_id;
  if (
    secondAdminOfficialEditor.statusCode !== 201 || !secondAdminDocumentId
    || secondAdminDocumentId === officialDocumentId
    || secondAdminOfficialBody.document.level.boardCode !== versionedBoardCode(officialRawReady.id, null, { rows: 8 })
  ) {
    throw new Error(`Second admin could not resolve the published official selection: ${secondAdminOfficialEditor.statusCode} ${secondAdminOfficialEditor.body}`);
  }
  const secondAdminSession = await openEditorEditSession(secondAdminDocumentId, {
    cookie: '__Host-chess-tactics-access=second-admin',
    deviceId: 'smoke-second-admin-device',
    clientLabel: 'Second official admin',
  });
  if (secondAdminSession.response.statusCode !== 200 || !['active', 'waiting'].includes(secondAdminSession.body.session.state)) {
    throw new Error(`Second admin could not acquire official edit authority: ${secondAdminSession.response.statusCode} ${secondAdminSession.response.body}`);
  }
  const secondAdminVersions = await get(
    `/api/editor-documents/${secondAdminDocumentId}/background-versions`,
    { cookie: '__Host-chess-tactics-access=second-admin' },
  );
  const secondAdminVersionsBody = JSON.parse(secondAdminVersions.body);
  if (
    secondAdminVersions.statusCode !== 200
    || !secondAdminVersionsBody.versions.some((version) => (
      version.id === officialRawReady.id && version.status === 'published'
    ))
    || secondAdminVersionsBody.versions.some((version) => version.id === firstAdminPrivateOfficialReady.id)
  ) {
    throw new Error(`Official version list crossed the wrong admin boundary: ${secondAdminVersions.statusCode} ${secondAdminVersions.body}`);
  }
  const secondAdminUnchangedSave = await request(
    'POST',
    `/api/editor-documents/${secondAdminDocumentId}/save`,
    { cookie: '__Host-chess-tactics-access=second-admin', 'content-type': 'application/json' },
    JSON.stringify(editorMutationBody(secondAdminDocumentId, '__Host-chess-tactics-access=second-admin', {
      revision: 1,
      level: officialAfterEditorSaveBody.portfolio.data.levels['off-l-test'],
    })),
    5000,
  );
  const secondAdminUnchangedSaveBody = JSON.parse(secondAdminUnchangedSave.body);
  const officialPublishEventCount = await queryDb(
    `SELECT count(*)::integer AS count
       FROM predrawn_background_version_events
      WHERE version_id = $1 AND action = 'published'`,
    [officialRawReady.id],
  );
  if (
    secondAdminUnchangedSave.statusCode !== 200
    || secondAdminUnchangedSaveBody.document.saved_revision !== 2
    || secondAdminUnchangedSaveBody.workspace_revision !== 3
    || Number(officialPublishEventCount.rows[0].count) !== 1
  ) {
    throw new Error(`Second admin could not retain the published official background: ${secondAdminUnchangedSave.statusCode} ${secondAdminUnchangedSave.body} / ${JSON.stringify(officialPublishEventCount.rows)}`);
  }
  const officialWorkspaceAtVersionBoundary = {
    campaigns: officialAfterEditorSaveBody.portfolio.data.campaigns,
    levels: {
      ...officialAfterEditorSaveBody.portfolio.data.levels,
      'off-l-test': {
        ...officialAfterEditorSaveBody.portfolio.data.levels['off-l-test'],
        boardCode: versionedBoardCode(crypto.randomUUID(), null, { rows: 8 }),
      },
    },
  };
  const missingOfficialBackgroundPut = await request(
    'PUT',
    '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: officialWorkspaceAtVersionBoundary, revision: 3 }),
    5000,
  );
  const privateCrossWorkspaceOfficialPut = await request(
    'PUT',
    '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({
      data: {
        ...officialWorkspaceAtVersionBoundary,
        levels: {
          ...officialWorkspaceAtVersionBoundary.levels,
          'off-l-test': {
            ...officialWorkspaceAtVersionBoundary.levels['off-l-test'],
            boardCode: versionedBoardCode(mismatchedMask.version.id, null, { rows: 8 }),
          },
        },
      },
      revision: 3,
    }),
    5000,
  );
  const foreignReadyOfficialPut = await request(
    'PUT',
    '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=second-admin', 'content-type': 'application/json' },
    JSON.stringify({
      data: {
        ...officialWorkspaceAtVersionBoundary,
        levels: {
          ...officialWorkspaceAtVersionBoundary.levels,
          'off-l-test': {
            ...officialWorkspaceAtVersionBoundary.levels['off-l-test'],
            boardCode: versionedBoardCode(firstAdminPrivateOfficialReady.id, null, { rows: 8 }),
          },
        },
      },
      revision: 3,
    }),
    5000,
  );
  const foreignReadyOfficialPutBody = JSON.parse(foreignReadyOfficialPut.body);
  const officialAfterRejectedVersionPuts = await get('/api/official-campaigns/default');
  const exactReadyOfficialWorkspace = {
    ...officialWorkspaceAtVersionBoundary,
    levels: {
      ...officialWorkspaceAtVersionBoundary.levels,
      'off-l-test': {
        ...officialWorkspaceAtVersionBoundary.levels['off-l-test'],
        boardCode: versionedBoardCode(firstAdminPrivateOfficialReady.id, null, { rows: 8 }),
      },
    },
  };
  const exactReadyOfficialPut = await request(
    'PUT',
    '/api/official-campaigns/default',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ data: exactReadyOfficialWorkspace, revision: 3 }),
    5000,
  );
  const exactReadyOfficialPutBody = JSON.parse(exactReadyOfficialPut.body);
  const readyPublishedByWholePut = await queryDb(
    `SELECT v.status, v.published_by, b.published_at AS blob_published_at,
            count(e.id) FILTER (WHERE e.action = 'published')::integer AS publish_events
       FROM predrawn_background_versions v
       JOIN media_blobs b ON b.sha256 = v.blob_sha256
       LEFT JOIN predrawn_background_version_events e ON e.version_id = v.id
      WHERE v.id = $1
      GROUP BY v.id, v.status, v.published_by, b.published_at`,
    [firstAdminPrivateOfficialReady.id],
  );
  const anonymousWholePutBackground = await get(
    `/api/background-versions/${firstAdminPrivateOfficialReady.id}/content`,
    {},
    5000,
  );
  if (
    missingOfficialBackgroundPut.statusCode !== 409
    || JSON.parse(missingOfficialBackgroundPut.body).error !== 'predrawn_background_version_not_found'
    || privateCrossWorkspaceOfficialPut.statusCode !== 409
    || JSON.parse(privateCrossWorkspaceOfficialPut.body).error !== 'predrawn_background_version_not_found'
    || foreignReadyOfficialPut.statusCode !== 409
    || foreignReadyOfficialPutBody.error !== 'predrawn_background_version_not_found'
    || Object.hasOwn(foreignReadyOfficialPutBody, 'document')
    || JSON.parse(officialAfterRejectedVersionPuts.body).portfolio.revision !== 3
    || exactReadyOfficialPut.statusCode !== 200
    || exactReadyOfficialPutBody.portfolio.revision !== 4
    || readyPublishedByWholePut.rows[0]?.status !== 'published'
    || readyPublishedByWholePut.rows[0]?.published_by !== 'player@example.com'
    || readyPublishedByWholePut.rows[0]?.blob_published_at === null
    || Number(readyPublishedByWholePut.rows[0]?.publish_events) !== 1
    || anonymousWholePutBackground.statusCode !== 200
  ) {
    throw new Error(`Whole official publication bypassed exact background validation: ${missingOfficialBackgroundPut.statusCode} ${missingOfficialBackgroundPut.body} / ${privateCrossWorkspaceOfficialPut.statusCode} ${privateCrossWorkspaceOfficialPut.body} / ${foreignReadyOfficialPut.statusCode} ${foreignReadyOfficialPut.body} / ${officialAfterRejectedVersionPuts.body} / ${exactReadyOfficialPut.statusCode} ${exactReadyOfficialPut.body} / ${JSON.stringify(readyPublishedByWholePut.rows)} / ${anonymousWholePutBackground.statusCode}`);
  }

  // --- Game Lab runs (/api/lab-runs): per-user, DB-backed --------------------
  const anonymousLabRuns = await get('/api/lab-runs');
  if (anonymousLabRuns.statusCode !== 401) {
    throw new Error(`Anonymous lab runs should require sign-in: ${anonymousLabRuns.statusCode}`);
  }

  const emptyLabRuns = await get('/api/lab-runs', { cookie: '__Host-chess-tactics-access=abc' });
  const emptyLabRunsBody = JSON.parse(emptyLabRuns.body);
  if (emptyLabRuns.statusCode !== 200 || emptyLabRunsBody.runs.length !== 0) {
    throw new Error(`Empty lab run list should be empty: ${emptyLabRuns.statusCode} ${emptyLabRuns.body}`);
  }

  const invalidLabRun = await request(
    'POST', '/api/lab-runs',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ meta: 'nope', body: { games: [] } }),
  );
  const invalidLabRunBody = JSON.parse(invalidLabRun.body);
  if (invalidLabRun.statusCode !== 400 || invalidLabRunBody.error !== 'invalid_lab_run') {
    throw new Error(`Invalid lab run should fail: ${invalidLabRun.statusCode} ${invalidLabRun.body}`);
  }

  const savedLabRun = await request(
    'POST', '/api/lab-runs',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ meta: { name: 't' }, body: { games: [1, 2] } }),
  );
  const savedLabRunBody = JSON.parse(savedLabRun.body);
  if (savedLabRun.statusCode !== 200 || savedLabRunBody.ok !== true || !savedLabRunBody.id || !savedLabRunBody.created_at) {
    throw new Error(`Unexpected lab run save: ${savedLabRun.statusCode} ${savedLabRun.body}`);
  }
  const labRunId = savedLabRunBody.id;

  const listedLabRuns = await get('/api/lab-runs', { cookie: '__Host-chess-tactics-access=abc' });
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

  const loadedLabRun = await get(`/api/lab-runs/${labRunId}`, { cookie: '__Host-chess-tactics-access=abc' });
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
  const rivalLabRunRead = await get(`/api/lab-runs/${labRunId}`, { cookie: '__Host-chess-tactics-access=rival' });
  if (rivalLabRunRead.statusCode !== 404) {
    throw new Error(`Rival should not read the player's lab run: ${rivalLabRunRead.statusCode} ${rivalLabRunRead.body}`);
  }
  const rivalLabRunDelete = await request('DELETE', `/api/lab-runs/${labRunId}`, { cookie: '__Host-chess-tactics-access=rival' });
  const rivalLabRunDeleteBody = JSON.parse(rivalLabRunDelete.body);
  if (rivalLabRunDelete.statusCode !== 200 || rivalLabRunDeleteBody.ok !== true) {
    throw new Error(`Rival lab run delete should be an idempotent 200: ${rivalLabRunDelete.statusCode} ${rivalLabRunDelete.body}`);
  }
  const labRunSurvived = await get(`/api/lab-runs/${labRunId}`, { cookie: '__Host-chess-tactics-access=abc' });
  if (labRunSurvived.statusCode !== 200) {
    throw new Error(`Rival's delete must not remove the player's lab run: ${labRunSurvived.statusCode} ${labRunSurvived.body}`);
  }

  const deletedLabRun = await request('DELETE', `/api/lab-runs/${labRunId}`, { cookie: '__Host-chess-tactics-access=abc' });
  const deletedLabRunBody = JSON.parse(deletedLabRun.body);
  if (deletedLabRun.statusCode !== 200 || deletedLabRunBody.ok !== true) {
    throw new Error(`Unexpected lab run delete: ${deletedLabRun.statusCode} ${deletedLabRun.body}`);
  }
  const labRunsAfterDelete = await get('/api/lab-runs', { cookie: '__Host-chess-tactics-access=abc' });
  const labRunsAfterDeleteBody = JSON.parse(labRunsAfterDelete.body);
  if (labRunsAfterDelete.statusCode !== 200 || labRunsAfterDeleteBody.runs.length !== 0) {
    throw new Error(`Lab run list should be empty after delete: ${labRunsAfterDelete.statusCode} ${labRunsAfterDelete.body}`);
  }

  const createdCampaign = await request(
    'POST',
    '/api/campaigns',
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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

  const rivalCampaigns = await get('/api/campaigns', { cookie: '__Host-chess-tactics-access=rival' });
  const rivalCampaignsBody = JSON.parse(rivalCampaigns.body);
  if (rivalCampaigns.statusCode !== 200 || rivalCampaignsBody.campaigns.length !== 0) {
    throw new Error(`Campaigns should be scoped to owner: ${rivalCampaigns.statusCode} ${rivalCampaigns.body}`);
  }

  const forbiddenCampaign = await get(`/api/campaigns/${campaignId}`, { cookie: '__Host-chess-tactics-access=rival' });
  if (forbiddenCampaign.statusCode !== 404) {
    throw new Error(`Rival should not read player campaign: ${forbiddenCampaign.statusCode} ${forbiddenCampaign.body}`);
  }

  const renamedCampaign = await request(
    'PATCH',
    `/api/campaigns/${campaignId}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
    JSON.stringify({ name: 'Bishop Net', difficulty: 'hard', enemy_budget: 8 }),
  );
  const addedLevelBody = JSON.parse(addedLevel.body);
  if (addedLevel.statusCode !== 201 || addedLevelBody.campaign.level_count !== 2 || addedLevelBody.level.name !== 'Bishop Net') {
    throw new Error(`Unexpected add level response: ${addedLevel.statusCode} ${addedLevel.body}`);
  }

  const rejectedSmallSpawn = await request(
    'PATCH',
    `/api/campaigns/${campaignId}/levels/${addedLevelBody.level.id}`,
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' },
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
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  const deletedLevelBody = JSON.parse(deletedLevel.body);
  if (deletedLevel.statusCode !== 200 || deletedLevelBody.campaign.level_count !== 1) {
    throw new Error(`Unexpected level delete response: ${deletedLevel.statusCode} ${deletedLevel.body}`);
  }

  const lastLevelId = deletedLevelBody.campaign.levels[0].id;
  const rejectedLastLevelDelete = await request(
    'DELETE',
    `/api/campaigns/${campaignId}/levels/${lastLevelId}`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  if (rejectedLastLevelDelete.statusCode !== 409) {
    throw new Error(`Deleting the last level should fail: ${rejectedLastLevelDelete.statusCode} ${rejectedLastLevelDelete.body}`);
  }

  const deletedCampaign = await request(
    'DELETE',
    `/api/campaigns/${campaignId}`,
    { cookie: '__Host-chess-tactics-access=abc' },
  );
  if (deletedCampaign.statusCode !== 204) {
    throw new Error(`Unexpected campaign delete response: ${deletedCampaign.statusCode} ${deletedCampaign.body}`);
  }
  const deletedCampaignRead = await get(`/api/campaigns/${campaignId}`, { cookie: '__Host-chess-tactics-access=abc' });
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
    const sseHost = await request('POST', '/api/lobbies', { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
    if (sseHost.statusCode !== 201) {
      throw new Error(`SSE test: could not host lobby: ${sseHost.statusCode} ${sseHost.body}`);
    }
    const sseLobbyId = JSON.parse(sseHost.body).lobby.id;

    const stream = await openSse('/api/lobbies/events', { cookie: '__Host-chess-tactics-access=abc' });
    try {
      // 1) Connect-time snapshot: the stream must push a frame immediately on open, so a
      //    freshly (re)connected host resyncs without waiting for a future mutation.
      await stream.waitUntil((f) => f.some((d) => d.includes('lobbies-changed')), 2000, 'connect-time snapshot frame');
      const beforeJoin = stream.frames.length;

      // 2) A guest join must reach the connected host as a NEW live frame — the actual
      //    "friend joined" event that was silently dropped in production.
      const sseJoin = await request('POST', `/api/lobbies/${sseLobbyId}/join`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, '{}');
      if (sseJoin.statusCode !== 200) {
        throw new Error(`SSE test: guest join failed: ${sseJoin.statusCode} ${sseJoin.body}`);
      }
      await stream.waitUntil((f) => f.length > beforeJoin, 2000, 'live lobbies-changed frame after guest join');

      // 3) And the host's authoritative view now shows the guest (the visible symptom).
      const afterJoin = JSON.parse((await get('/api/lobbies', { cookie: '__Host-chess-tactics-access=abc' })).body);
      if (!afterJoin.current || afterJoin.current.seats.filled !== 2 || !afterJoin.current.guest) {
        throw new Error(`SSE test: host list should show the joined guest: ${JSON.stringify(afterJoin.current)}`);
      }
    } finally {
      stream.close();
    }

    // Clean up so the lobby-lifecycle test below starts from an empty state (host leave
    // closes + deletes the lobby, freeing both abc and rival).
    const sseCleanup = await request('POST', `/api/lobbies/${sseLobbyId}/leave`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
    if (sseCleanup.statusCode !== 204) {
      throw new Error(`SSE test: host leave/cleanup failed: ${sseCleanup.statusCode} ${sseCleanup.body}`);
    }
  }

  const hosted = await request('POST', '/api/lobbies', { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  const hostedBody = JSON.parse(hosted.body);
  if (hosted.statusCode !== 201 || hostedBody.lobby.phase !== 'waiting' || hostedBody.lobby.viewer_role !== 'host') {
    throw new Error(`Unexpected host lobby response: ${hosted.statusCode} ${hosted.body}`);
  }
  if (!hostedBody.lobby.host.avatar_url.includes(`/avatar/${playerHash}`)) {
    throw new Error(`Lobby host is missing Gravatar URL: ${hosted.body}`);
  }

  const listed = await get('/api/lobbies', { cookie: '__Host-chess-tactics-access=rival' });
  const listedBody = JSON.parse(listed.body);
  if (listed.statusCode !== 200 || listedBody.lobbies.length !== 1 || listedBody.lobbies[0].viewer_role !== 'observer') {
    throw new Error(`Unexpected lobby list response: ${listed.statusCode} ${listed.body}`);
  }

  const lobbyId = hostedBody.lobby.id;
  const joined = await request('POST', `/api/lobbies/${lobbyId}/join`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, '{}');
  const joinedBody = JSON.parse(joined.body);
  if (joined.statusCode !== 200 || joinedBody.lobby.phase !== 'ready' || joinedBody.lobby.viewer_role !== 'guest') {
    throw new Error(`Unexpected join lobby response: ${joined.statusCode} ${joined.body}`);
  }

  const rivalStart = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, '{}');
  if (rivalStart.statusCode !== 403) {
    throw new Error(`Guest should not be able to start lobby: ${rivalStart.statusCode} ${rivalStart.body}`);
  }

  // Start now requires a level (netplay: both clients build the same board from
  // the shared (level, seed)). Starting without one is a 409 no_level.
  const startNoLevel = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  if (startNoLevel.statusCode !== 409 || JSON.parse(startNoLevel.body).error !== 'no_level') {
    throw new Error(`Start without a level should 409 no_level: ${startNoLevel.statusCode} ${startNoLevel.body}`);
  }

  // Only the host may pick a canonical official level; timing comes from its content.
  const rivalSetLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-test' }));
  if (rivalSetLevel.statusCode !== 403) {
    throw new Error(`Guest should not be able to set the lobby level: ${rivalSetLevel.statusCode} ${rivalSetLevel.body}`);
  }
  const missingLevelId = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  if (missingLevelId.statusCode !== 400 || JSON.parse(missingLevelId.body).error !== 'missing_level_id') {
    throw new Error(`Setting a level without an id should 400 missing_level_id: ${missingLevelId.statusCode} ${missingLevelId.body}`);
  }
  const unknownCanonicalLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-missing-smoke' }));
  if (unknownCanonicalLevel.statusCode !== 404 || JSON.parse(unknownCanonicalLevel.body).error !== 'level_not_found') {
    throw new Error(`Unknown canonical level should 404 level_not_found: ${unknownCanonicalLevel.statusCode} ${unknownCanonicalLevel.body}`);
  }
  const setTimedLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-smoke-timed', timed: false }));
  if (setTimedLevel.statusCode !== 200 || JSON.parse(setTimedLevel.body).lobby.level_timed !== true) {
    throw new Error(`Unexpected timed-level response: ${setTimedLevel.statusCode} ${setTimedLevel.body}`);
  }
  const startTimedLevel = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  if (startTimedLevel.statusCode !== 409 || JSON.parse(startTimedLevel.body).error !== 'timed_level_unsupported') {
    throw new Error(`Timed level should 409 timed_level_unsupported: ${startTimedLevel.statusCode} ${startTimedLevel.body}`);
  }
  // This id is intentionally absent from LOBBY_TEST_LEVEL_METADATA: Level and Start
  // must resolve the exact DB-backed official document written earlier in this smoke.
  const setLevel = await request('POST', `/api/lobbies/${lobbyId}/level`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ levelId: 'off-l-test', timed: true }));
  const setLevelBody = JSON.parse(setLevel.body);
  if (setLevel.statusCode !== 200 || setLevelBody.lobby.level_id !== 'off-l-test' || setLevelBody.lobby.level_timed !== false
    || setLevelBody.lobby.level_name !== 'Official Exact Save' || setLevelBody.lobby.level_objective !== 'capture-all'
    || setLevelBody.lobby.your_side !== 'player') {
    throw new Error(`Unexpected set-level response: ${setLevel.statusCode} ${setLevel.body}`);
  }

  const started = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  const startedBody = JSON.parse(started.body);
  if (started.statusCode !== 200 || startedBody.lobby.phase !== 'started' || !Number.isInteger(startedBody.lobby.seed) || startedBody.lobby.seed <= 0) {
    throw new Error(`Unexpected start lobby response: ${started.statusCode} ${started.body}`);
  }

  // Relay moves. Host ('player') moves first (index 0), then guest ('enemy') at index 1 —
  // strict one-move-per-turn alternation is enforced server-side (host=even, guest=odd).
  const hostMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-host-0', expectedMoveCount: 0, pieceId: 'p-1', move: { x: 3, y: 4 } }));
  const hostMoveBody = JSON.parse(hostMove.body);
  if (hostMove.statusCode !== 200 || hostMoveBody.move.i !== 0 || hostMoveBody.move.side !== 'player' || hostMoveBody.move.pieceId !== 'p-1') {
    throw new Error(`Unexpected host move response: ${hostMove.statusCode} ${hostMove.body}`);
  }
  // Turn integrity: the host cannot move again out of turn (index 1 belongs to the guest).
  const outOfTurn = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-host-out-of-turn', expectedMoveCount: 1, pieceId: 'p-2', move: { x: 1, y: 1 } }));
  if (outOfTurn.statusCode !== 409 || JSON.parse(outOfTurn.body).error !== 'not_your_turn') {
    throw new Error(`Out-of-turn move should 409 not_your_turn: ${outOfTurn.statusCode} ${outOfTurn.body}`);
  }
  const guestMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-guest-1', expectedMoveCount: 1, pieceId: 'e-1', move: { x: 3, y: 4 } }));
  const guestMoveBody = JSON.parse(guestMove.body);
  if (guestMove.statusCode !== 200 || guestMoveBody.move.i !== 1 || guestMoveBody.move.side !== 'enemy' || guestMoveBody.move.pieceId !== 'e-1') {
    throw new Error(`Unexpected guest move response: ${guestMove.statusCode} ${guestMove.body}`);
  }
  // Payload validation runs before the turn check, so a malformed move is 400 bad_move.
  const badMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-bad-move', expectedMoveCount: 2, pieceId: 'p-1', move: { x: 'nope' } }));
  if (badMove.statusCode !== 400 || JSON.parse(badMove.body).error !== 'bad_move') {
    throw new Error(`Malformed move should 400 bad_move: ${badMove.statusCode} ${badMove.body}`);
  }
  const outsiderMove = await request('POST', `/api/lobbies/${lobbyId}/moves`, { 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-outsider', expectedMoveCount: 2, pieceId: 'x-1', move: { x: 1, y: 1 } }));
  if (outsiderMove.statusCode !== 401) {
    throw new Error(`Anonymous move should require sign-in: ${outsiderMove.statusCode} ${outsiderMove.body}`);
  }
  const backfill = await get(`/api/lobbies/${lobbyId}/moves?since=0`, { cookie: '__Host-chess-tactics-access=abc' });
  const backfillBody = JSON.parse(backfill.body);
  if (backfill.statusCode !== 200 || backfillBody.moves.length !== 2 || backfillBody.moves[0].pieceId !== 'p-1' || backfillBody.moves[1].pieceId !== 'e-1') {
    throw new Error(`Unexpected moves backfill: ${backfill.statusCode} ${backfill.body}`);
  }
  const startedList = await get('/api/lobbies', { cookie: '__Host-chess-tactics-access=abc' });
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
  const guestResign = await request('POST', `/api/lobbies/${lobbyId}/resign`, { cookie: '__Host-chess-tactics-access=rival', 'content-type': 'application/json' }, '{}');
  const guestResignBody = JSON.parse(guestResign.body);
  if (guestResign.statusCode !== 200 || !guestResignBody.lobby.result || guestResignBody.lobby.result.winner !== 'player' || guestResignBody.lobby.result.reason !== 'resign') {
    throw new Error(`Unexpected resign response: ${guestResign.statusCode} ${guestResign.body}`);
  }
  // The result is visible to the other seat too (how the host learns the match ended).
  const resignedView = await get(`/api/lobbies/${lobbyId}`, { cookie: '__Host-chess-tactics-access=abc' });
  const resignedViewBody = JSON.parse(resignedView.body);
  if (resignedView.statusCode !== 200 || !resignedViewBody.lobby.result || resignedViewBody.lobby.result.winner !== 'player') {
    throw new Error(`Resigned lobby should expose the result to the host: ${resignedView.statusCode} ${resignedView.body}`);
  }
  // The match is over — further moves are rejected rather than re-opening a decided game.
  const moveAfterResign = await request('POST', `/api/lobbies/${lobbyId}/moves`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, JSON.stringify({ intentId: 'smoke-after-resign', expectedMoveCount: 2, pieceId: 'p-2', move: { x: 5, y: 5 } }));
  if (moveAfterResign.statusCode !== 409 || JSON.parse(moveAfterResign.body).error !== 'match_over') {
    throw new Error(`Move after resign should 409 match_over: ${moveAfterResign.statusCode} ${moveAfterResign.body}`);
  }
  // Idempotent: the host resigning now keeps the first result rather than flipping the winner.
  const hostResign = await request('POST', `/api/lobbies/${lobbyId}/resign`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  const hostResignBody = JSON.parse(hostResign.body);
  if (hostResign.statusCode !== 200 || hostResignBody.lobby.result.winner !== 'player') {
    throw new Error(`Resign should be idempotent (first result kept): ${hostResign.statusCode} ${hostResign.body}`);
  }
  // Start is a one-shot ready→started transition; it cannot reset a live/finished match.
  const restart = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: '__Host-chess-tactics-access=abc', 'content-type': 'application/json' }, '{}');
  const restartBody = JSON.parse(restart.body);
  if (restart.statusCode !== 409 || restartBody.error !== 'lobby_already_started') {
    throw new Error(`Re-start should 409 lobby_already_started: ${restart.statusCode} ${restart.body}`);
  }
  const restartBackfill = await get(`/api/lobbies/${lobbyId}/moves?since=0`, { cookie: '__Host-chess-tactics-access=abc' });
  if (restartBackfill.statusCode !== 200 || JSON.parse(restartBackfill.body).moves.length !== 2) {
    throw new Error(`Rejected Re-start must preserve move log: ${restartBackfill.statusCode} ${restartBackfill.body}`);
  }

  const redirect = await get('/api/auth/sign-in?returnTo=%2Fplay');
  if (redirect.statusCode !== 302 || !String(redirect.headers.location).startsWith(`${mockAuthIssuer}/api/auth/oauth2/authorize?`)) {
    throw new Error(`Unexpected sign-in redirect: ${redirect.statusCode} ${redirect.headers.location}`);
  }

  const signOut = await request('POST', '/api/auth/sign-out', { cookie: '__Host-chess-tactics-access=abc' });
  if (signOut.statusCode !== 204 || !signOut.headers['set-cookie']) {
    throw new Error(`Unexpected sign-out response: ${signOut.statusCode}`);
  }

  fs.mkdirSync(hotStaticDir, { recursive: true });
  fs.writeFileSync(path.join(hotStaticDir, 'hot.txt'), 'hot-static-ok');
  const hotStatic = await get('/hot.txt');
  if (hotStatic.statusCode !== 200 || hotStatic.body !== 'hot-static-ok') {
    throw new Error(`Unexpected hot static response: ${hotStatic.statusCode} ${hotStatic.body}`);
  }

  if (!isPgliteRuntime) {
    // A SIGHUP replacement briefly overlaps old/new pools. PGlite's listener
    // cannot serve multiple pools, while real PostgreSQL is the runtime this
    // hot-backend lifecycle assertion is designed to verify.
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
}

main()
  .finally(async () => {
    if (secondaryChild) {
      secondaryChild.kill();
      await waitForProcessExit(secondaryChild);
    }
    child.kill();
    await waitForProcessExit(child);
    await Promise.all([closeHttpServer(mockAuth), closeHttpServer(mockBgm)]);
    fs.rmSync(hotRoot, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
