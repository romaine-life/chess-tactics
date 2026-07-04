// Postgres-FREE end-to-end test for the lobby / netplay subsystem.
//
// Why this exists separately from smoke-test.js: the full smoke test provisions a
// throwaway Postgres because it exercises the DB-backed persistence endpoints. But the
// entire lobby/netplay surface (host/join/level/start/moves/resign/leave) lives in an
// in-memory Map — none of those routes touch the database — and the server boots and
// serves them even with NO database configured (server.js logs a warning and returns 503
// only on the persistence endpoints; see its startServer() else-branch). So multiplayer
// features can be verified ANYWHERE, no Postgres required, by booting the server without
// a DATABASE_URL and hitting only the lobby routes. That is exactly what this does.
//
// Run: `node netplay-smoke-test.js` (needs backend deps installed: `npm ci` in backend).

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = 31347;
const authPort = 31348;
const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-netplay-'));

// Minimal Better-Auth stand-in: `better-auth.session=rival` is the guest, any other
// session cookie is the host, no cookie is signed-out. Mirrors smoke-test.js's mock.
const HOST_USER = { email: 'player@example.com', name: 'Tactics Player', role: 'pending' };
const GUEST_USER = { email: 'rival@example.com', name: 'Lobby Rival', role: 'pending' };
const mockAuth = http.createServer((req, res) => {
  if (req.url !== '/api/auth/get-session') { res.writeHead(404); res.end('not found'); return; }
  const cookie = req.headers.cookie || '';
  res.writeHead(200, { 'content-type': 'application/json' });
  if (!cookie.includes('better-auth.session')) { res.end('null'); return; }
  res.end(JSON.stringify({ user: cookie.includes('better-auth.session=rival') ? GUEST_USER : HOST_USER }));
});

// Boot the real server with NO database configured (DATABASE_URL / POSTGRES_* stripped
// from the inherited env) so buildPool() returns null and it starts DB-free.
const childEnv = { ...process.env };
delete childEnv.DATABASE_URL;
delete childEnv.POSTGRES_HOST;
delete childEnv.POSTGRES_DATABASE;
delete childEnv.POSTGRES_USER;
Object.assign(childEnv, {
  PORT: String(port),
  AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
  PUBLIC_ORIGIN: 'https://chess.romaine.life',
  STATIC_FRONTEND_DIR: staticDir,
});

let child = null;
let serverOutput = '';

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (chunk) => {
      serverOutput += chunk.toString();
      if (serverOutput.includes(`listening on :${port}`)) resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`server exited early (code ${code})\n${serverOutput}`)));
    setTimeout(() => reject(new Error(`server did not report ready within 10s\n${serverOutput}`)), 10000);
  });
}

function request(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: reqPath, headers }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error(`Timed out requesting ${reqPath}`)));
    req.end(body);
  });
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const asHost = { cookie: 'better-auth.session=abc', ...JSON_HEADERS };
const asGuest = { cookie: 'better-auth.session=rival', ...JSON_HEADERS };
const post = (p, headers, body = '{}') => request('POST', p, headers, body);
const get = (p, headers) => request('GET', p, headers);

function assert(cond, msg, res) {
  if (cond) return;
  throw new Error(`ASSERT FAILED: ${msg}${res ? ` (status ${res.statusCode}: ${res.body})` : ''}`);
}

async function main() {
  await new Promise((r) => mockAuth.listen(authPort, r));
  await startServer();

  // Auth gate: the lobby list requires sign-in.
  assert((await get('/api/lobbies')).statusCode === 401, 'anonymous lobby list must 401');

  // Host creates a lobby.
  const hosted = await post('/api/lobbies', asHost);
  const lobby = JSON.parse(hosted.body).lobby;
  assert(hosted.statusCode === 201 && lobby.phase === 'waiting' && lobby.viewer_role === 'host', 'host creates a waiting lobby', hosted);
  assert(lobby.result === null, 'a fresh lobby has a null result', hosted);
  const id = lobby.id;

  // A second player sees it as an observer, then joins → ready.
  const observed = JSON.parse((await get('/api/lobbies', asGuest)).body);
  assert(observed.lobbies.length === 1 && observed.lobbies[0].viewer_role === 'observer', 'guest sees the lobby as observer');
  const joined = await post(`/api/lobbies/${id}/join`, asGuest);
  assert(joined.statusCode === 200 && JSON.parse(joined.body).lobby.phase === 'ready', 'guest join → ready', joined);

  // Host-only + preconditions on start.
  assert((await post(`/api/lobbies/${id}/start`, asGuest)).statusCode === 403, 'guest cannot start');
  assert((await post(`/api/lobbies/${id}/start`, asHost)).statusCode === 409, 'start with no level → 409');
  const leveled = await post(`/api/lobbies/${id}/level`, asHost, JSON.stringify({ levelId: 'test-level-1' }));
  assert(leveled.statusCode === 200 && JSON.parse(leveled.body).lobby.level_id === 'test-level-1', 'host sets the level', leveled);

  const started = await post(`/api/lobbies/${id}/start`, asHost);
  const startedLobby = JSON.parse(started.body).lobby;
  assert(started.statusCode === 200 && startedLobby.phase === 'started' && startedLobby.seed > 0, 'start locks a seed', started);
  assert(startedLobby.move_count === 0 && startedLobby.result === null, 'started lobby begins with an empty log and no result', started);

  // Relay one move per side; strict alternation (host even, guest odd) is server-enforced.
  const m0 = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ pieceId: 'p-1', move: { x: 3, y: 4 } }));
  assert(m0.statusCode === 200 && JSON.parse(m0.body).move.i === 0, 'host relays move 0', m0);
  const outOfTurn = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ pieceId: 'p-2', move: { x: 1, y: 1 } }));
  assert(outOfTurn.statusCode === 409 && JSON.parse(outOfTurn.body).error === 'not_your_turn', 'host cannot move out of turn', outOfTurn);
  const m1 = await post(`/api/lobbies/${id}/moves`, asGuest, JSON.stringify({ pieceId: 'e-1', move: { x: 3, y: 4 } }));
  assert(m1.statusCode === 200 && JSON.parse(m1.body).move.i === 1, 'guest relays move 1', m1);

  // --- Resignation ---------------------------------------------------------------
  // Guest ('enemy') resigns → the host ('player') wins; both seats read it off the lobby.
  const resign = await post(`/api/lobbies/${id}/resign`, asGuest);
  const resignResult = JSON.parse(resign.body).lobby.result;
  assert(resign.statusCode === 200 && resignResult && resignResult.winner === 'player' && resignResult.reason === 'resign', 'guest resign → player wins', resign);
  const hostView = JSON.parse((await get(`/api/lobbies/${id}`, asHost)).body).lobby;
  assert(hostView.result && hostView.result.winner === 'player', 'host sees the resignation result');
  // Moves are rejected once decided; resigning again keeps the first result.
  const lateMove = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ pieceId: 'p-2', move: { x: 5, y: 5 } }));
  assert(lateMove.statusCode === 409 && JSON.parse(lateMove.body).error === 'match_over', 'move after resign → match_over', lateMove);
  const reResign = await post(`/api/lobbies/${id}/resign`, asHost);
  assert(reResign.statusCode === 200 && JSON.parse(reResign.body).lobby.result.winner === 'player', 'resign is idempotent', reResign);

  // Re-start begins a fresh match: prior moves AND result are cleared.
  const restart = await post(`/api/lobbies/${id}/start`, asHost);
  const restarted = JSON.parse(restart.body).lobby;
  assert(restart.statusCode === 200 && restarted.move_count === 0 && restarted.result === null, 're-start clears moves + result', restart);
  assert(JSON.parse((await get(`/api/lobbies/${id}/moves?since=0`, asHost)).body).moves.length === 0, 're-started lobby has an empty move log');

  // --- Return to lobbies (leave) -------------------------------------------------
  // Guest leaving frees the seat and reopens the lobby to waiting.
  const guestLeave = await post(`/api/lobbies/${id}/leave`, asGuest);
  assert(guestLeave.statusCode === 200 && JSON.parse(guestLeave.body).lobby.phase === 'waiting', 'guest leave → waiting', guestLeave);
  // Host leaving closes and deletes the lobby (the guest is returned via the closed frame).
  const hostLeave = await post(`/api/lobbies/${id}/leave`, asHost);
  assert(hostLeave.statusCode === 204, 'host leave → 204 (lobby closed)', hostLeave);
  assert((await get(`/api/lobbies/${id}`, asHost)).statusCode === 404, 'closed lobby is gone (404)');

  console.log('netplay-smoke-test: OK — lobby lifecycle, resign, and leave verified with NO database.');
}

main()
  .then(() => { if (child) child.kill(); mockAuth.close(); fs.rmSync(staticDir, { recursive: true, force: true }); })
  .catch((error) => {
    console.error(error);
    if (child) child.kill();
    mockAuth.close();
    fs.rmSync(staticDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
