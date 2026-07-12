const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function unusedLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.once('error', reject);
  });
}

async function waitForLiveness(child, port, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early\n${output()}`);
    try {
      const response = await request(port, '/health');
      if (response.statusCode === 200 && response.body === 'ok') return;
    } catch { /* wait for the listener */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server never became live\n${output()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  let timeout;
  await Promise.race([
    exited,
    new Promise((resolve) => { timeout = setTimeout(resolve, 2_000); }),
  ]);
  clearTimeout(timeout);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

test('liveness stays up while readiness fails closed on an unavailable database', async (t) => {
  const port = await unusedLoopbackPort();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-readiness-'));
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: 'postgres://readiness:readiness@127.0.0.1:1/readiness',
    LIVE_MEDIA_STORAGE_DIR: path.join(tempRoot, 'live-media'),
    SCHEMA_MIGRATIONS: 'auto',
    BAKED_BACKEND_DIR: __dirname,
    FRONTEND_DIR: path.join(tempRoot, 'frontend'),
  };
  for (const name of [
    'POSTGRES_HOST', 'POSTGRES_DATABASE', 'POSTGRES_DB', 'POSTGRES_USER',
    'LIVE_MEDIA_CONTAINER_URL', 'LIVE_MEDIA_SEED_CATALOG_URL', 'LIVE_MEDIA_SEED_MEDIA_BASE_URL',
  ]) delete env[name];

  let output = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  t.after(async () => {
    await stopChild(child);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await waitForLiveness(child, port, () => output);
  const liveness = await request(port, '/health');
  assert.equal(liveness.statusCode, 200);
  assert.equal(liveness.body, 'ok');

  const readiness = await request(port, '/ready');
  assert.equal(readiness.statusCode, 503);
  assert.match(readiness.headers['cache-control'] || '', /no-store/);
  assert.deepEqual(JSON.parse(readiness.body), { error: 'application_not_ready' });
});
