const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = 31337;
const authPort = 31338;
const hotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-tactics-hot-'));
const hotBackendDir = path.join(hotRoot, 'backend');
const hotStaticDir = path.join(hotRoot, 'static');
const mockAuth = http.createServer((req, res) => {
  if (req.url === '/api/auth/get-session') {
    if (!req.headers.cookie || !req.headers.cookie.includes('better-auth.session')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('null');
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

const child = spawn(process.execPath, ['supervisor.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
    PORT: String(port),
    PUBLIC_ORIGIN: 'https://chess.romaine.life',
    HOT_BACKEND_DIR: hotBackendDir,
    STATIC_FRONTEND_DIR: hotStaticDir,
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

function request(method, path, headers = {}) {
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
    req.setTimeout(1000, () => {
      req.destroy(new Error(`Timed out requesting ${path}`));
    });
    req.end();
  });
}

function get(path, headers) {
  return request('GET', path, headers);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with ${child.exitCode}\n${output}`);
    }
    try {
      const response = await get('/health');
      if (response.statusCode === 200 && response.body === 'ok') return;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Hot backend did not become active\n${output}`);
}

async function main() {
  await new Promise((resolve) => mockAuth.listen(authPort, '127.0.0.1', resolve));
  await waitForServer();
  if (!fs.existsSync(path.join(hotBackendDir, 'server.js'))) {
    throw new Error('Supervisor did not initialize the hot backend entrypoint');
  }

  const root = await get('/');
  if (root.statusCode !== 200 || !root.body.includes('Chess Tactics')) {
    throw new Error(`Unexpected root response: ${root.statusCode}`);
  }
  if (!root.body.includes('Guest') || root.body.includes('Sign in to play')) {
    throw new Error('Root shell should offer optional sign-in without blocking guest play');
  }
  const fallback = await get('/squad/unknown');
  if (fallback.statusCode !== 200 || !fallback.body.includes('Chess Tactics')) {
    throw new Error(`Unexpected fallback response: ${fallback.statusCode}`);
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
  .finally(() => {
    child.kill();
    mockAuth.close();
    fs.rmSync(hotRoot, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
