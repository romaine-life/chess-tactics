// Postgres-FREE end-to-end test for the lobby / netplay subsystem.
//
// Why this exists separately from smoke-test.js: the full smoke test provisions a
// throwaway Postgres because it exercises DB-backed persistence. Lobby runtime state is
// in-memory, while production Level/Start authority deliberately reads canonical official
// content from Postgres. This DB-free smoke supplies that content through the explicit
// NODE_ENV=test-only metadata seam, so the entire multiplayer protocol can still be
// verified anywhere without weakening the production path.
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

// Minimal Better-Auth stand-in with three distinct identities: host, guest, and a true
// observer who never takes a seat. No cookie is signed-out. Mirrors smoke-test.js's mock.
const HOST_USER = { email: 'player@example.com', name: 'Tactics Player', role: 'pending' };
const GUEST_USER = { email: 'rival@example.com', name: 'Lobby Rival', role: 'pending' };
const OBSERVER_USER = { email: 'observer@example.com', name: 'Lobby Observer', role: 'pending' };
const mockAuth = http.createServer((req, res) => {
  if (req.url !== '/api/auth/get-session') { res.writeHead(404); res.end('not found'); return; }
  const cookie = req.headers.cookie || '';
  res.writeHead(200, { 'content-type': 'application/json' });
  if (!cookie.includes('better-auth.session')) { res.end('null'); return; }
  const user = cookie.includes('better-auth.session=rival')
    ? GUEST_USER
    : (cookie.includes('better-auth.session=observer') ? OBSERVER_USER : HOST_USER);
  res.end(JSON.stringify({ user }));
});

// Boot the real server with NO database configured (DATABASE_URL / POSTGRES_* stripped
// from the inherited env) so buildPool() returns null and it starts DB-free.
const childEnv = { ...process.env };
delete childEnv.DATABASE_URL;
delete childEnv.POSTGRES_HOST;
delete childEnv.POSTGRES_DATABASE;
delete childEnv.POSTGRES_USER;
Object.assign(childEnv, {
  NODE_ENV: 'test',
  PORT: String(port),
  AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
  PUBLIC_ORIGIN: 'https://chess.romaine.life',
  STATIC_FRONTEND_DIR: staticDir,
  LOBBY_TEST_LEVEL_METADATA: JSON.stringify({
    'test-level-1': { level: { id: 'test-level-1', name: 'Protocol One', objective: 'capture-all', marker: 'pinned-one' } },
    'test-level-timed': { level: { id: 'test-level-timed', name: 'Timed', objective: 'survive', timeControl: { initialSeconds: 60, incrementSeconds: 0 } } },
    'test-level-2': { level: { id: 'test-level-2', name: 'Protocol Two', objective: 'capture-king' } },
    'test-level-3': { level: { id: 'test-level-3', name: 'Protocol Three', objective: 'rival-kings' } },
    'test-level-4': { level: { id: 'test-level-4', name: 'Protocol Four', objective: 'reach' } },
    'test-level-race-start': { delayMs: 300, level: { id: 'test-level-race-start', name: 'Slow Start', objective: 'capture-all' } },
    'test-level-race-level': { delayMs: 300, level: { id: 'test-level-race-level', name: 'Slow Level', objective: 'capture-king' } },
    'test-level-race-leave': { delayMs: 300, level: { id: 'test-level-race-leave', name: 'Slow Leave', objective: 'survive' } },
  }),
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

// Open a lobby SSE stream and expose a headers/data-ready barrier. The stream resolves
// only after the server ends it, which lets the host-leave test inspect every frame sent
// before lobby deletion without racing the subscription setup.
function eventStream(reqPath, headers = {}) {
  let openResolve;
  let openReject;
  const opened = new Promise((resolve, reject) => {
    openResolve = resolve;
    openReject = reject;
  });
  const completed = new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method: 'GET', path: reqPath, headers }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: buf }));
      openResolve();
    });
    req.on('error', (error) => {
      openReject(error);
      reject(error);
    });
    req.setTimeout(2000, () => req.destroy(new Error(`Timed out streaming ${reqPath}`)));
    req.end();
  });
  return { opened, completed };
}

function parseSseFrames(body) {
  return body
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const asHost = { cookie: 'better-auth.session=abc', ...JSON_HEADERS };
const asGuest = { cookie: 'better-auth.session=rival', ...JSON_HEADERS };
const asObserver = { cookie: 'better-auth.session=observer', ...JSON_HEADERS };
const post = (p, headers, body = '{}') => request('POST', p, headers, body);
const get = (p, headers) => request('GET', p, headers);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(cond, msg, res) {
  if (cond) return;
  throw new Error(`ASSERT FAILED: ${msg}${res ? ` (status ${res.statusCode}: ${res.body})` : ''}`);
}

async function main() {
  await new Promise((r) => mockAuth.listen(authPort, r));
  await startServer();

  // Auth gate: the lobby list requires sign-in.
  assert((await get('/api/lobbies')).statusCode === 401, 'anonymous lobby list must 401');

  // --- Canonical level authority + one-shot Start -------------------------------
  const hosted = await post('/api/lobbies', asHost);
  const lobby = JSON.parse(hosted.body).lobby;
  assert(hosted.statusCode === 201 && lobby.phase === 'waiting' && lobby.viewer_role === 'host', 'host creates a waiting lobby', hosted);
  assert(lobby.result === null && lobby.result_pending === false && lobby.result_disputed === false, 'fresh lobby has no result state', hosted);
  assert(lobby.level_timed === null, 'a fresh lobby has no timing metadata', hosted);
  const id = lobby.id;
  const waitingStart = await post(`/api/lobbies/${id}/start`, asHost);
  assert(waitingStart.statusCode === 409 && JSON.parse(waitingStart.body).error === 'lobby_not_ready', 'Start transition requires ready phase', waitingStart);

  const observed = JSON.parse((await get('/api/lobbies', asGuest)).body);
  assert(observed.lobbies.length === 1 && observed.lobbies[0].viewer_role === 'observer', 'guest sees the lobby as observer');
  const joined = await post(`/api/lobbies/${id}/join`, asGuest);
  assert(joined.statusCode === 200 && JSON.parse(joined.body).lobby.phase === 'ready', 'guest join → ready', joined);

  assert((await post(`/api/lobbies/${id}/start`, asGuest)).statusCode === 403, 'guest cannot start');
  const noLevelStart = await post(`/api/lobbies/${id}/start`, asHost);
  assert(noLevelStart.statusCode === 409 && JSON.parse(noLevelStart.body).error === 'no_level', 'ready lobby still requires canonical level', noLevelStart);
  const unknownLevel = await post(`/api/lobbies/${id}/level`, asHost, JSON.stringify({ levelId: 'unknown-level', timed: false }));
  assert(unknownLevel.statusCode === 404 && JSON.parse(unknownLevel.body).error === 'level_not_found', 'unknown level is rejected by canonical metadata lookup', unknownLevel);
  // The request lies about timing; the test-only canonical metadata seam says true.
  const timedLevel = await post(`/api/lobbies/${id}/level`, asHost, JSON.stringify({ levelId: 'test-level-timed', timed: false }));
  assert(timedLevel.statusCode === 200 && JSON.parse(timedLevel.body).lobby.level_timed === true, 'server derives timed metadata instead of trusting body', timedLevel);
  const timedStart = await post(`/api/lobbies/${id}/start`, asHost);
  assert(timedStart.statusCode === 409 && JSON.parse(timedStart.body).error === 'timed_level_unsupported', 'timed level cannot start without authoritative lobby clock', timedStart);
  // The inverse lie is ignored too: canonical metadata says this level is untimed.
  const leveled = await post(`/api/lobbies/${id}/level`, asHost, JSON.stringify({ levelId: 'test-level-1', timed: true }));
  const leveledLobby = JSON.parse(leveled.body).lobby;
  assert(leveled.statusCode === 200 && leveledLobby.level_id === 'test-level-1' && leveledLobby.level_timed === false, 'server derives untimed metadata', leveled);
  assert(leveledLobby.level_name === 'Protocol One' && leveledLobby.level_objective === 'capture-all', 'summary labels come from canonical level', leveled);

  const started = await post(`/api/lobbies/${id}/start`, asHost);
  const startedLobby = JSON.parse(started.body).lobby;
  assert(started.statusCode === 200 && startedLobby.phase === 'started' && startedLobby.seed > 0, 'start locks a seed', started);
  assert(startedLobby.move_count === 0 && startedLobby.result === null, 'started lobby begins with an empty log and no result', started);
  assert(startedLobby.level_snapshot?.marker === 'pinned-one' && String(startedLobby.level_fingerprint).startsWith('sha256:'), 'Start pins canonical level content + fingerprint', started);
  const startedList = JSON.parse((await get('/api/lobbies', asHost)).body);
  assert(!Object.hasOwn(startedList.current, 'level_snapshot'), 'global lobby summary omits pinned level payload');
  const duplicateStart = await post(`/api/lobbies/${id}/start`, asHost);
  assert(duplicateStart.statusCode === 409 && JSON.parse(duplicateStart.body).error === 'lobby_already_started', 'started lobby cannot be unilaterally reset', duplicateStart);
  const afterDuplicateStart = JSON.parse((await get(`/api/lobbies/${id}`, asHost)).body).lobby;
  assert(afterDuplicateStart.seed === startedLobby.seed && afterDuplicateStart.move_count === 0, 'rejected Start preserves match identity');

  // --- Observer rejection + stable intent identity ------------------------------
  const observerView = JSON.parse((await get(`/api/lobbies/${id}`, asObserver)).body).lobby;
  assert(observerView.viewer_role === 'observer' && observerView.your_side === null, 'third identity remains an observer');
  const observerMove = await post(`/api/lobbies/${id}/moves`, asObserver, JSON.stringify({ intentId: 'observer-0', expectedMoveCount: 0, pieceId: 'p-1', move: { x: 3, y: 4 } }));
  assert(observerMove.statusCode === 409 && JSON.parse(observerMove.body).error === 'not_in_lobby', 'observer move is rejected', observerMove);
  const observerResult = await post(`/api/lobbies/${id}/result`, asObserver, JSON.stringify({ expectedMoveCount: 0, winner: 'player', reason: 'victory-rule' }));
  assert(observerResult.statusCode === 403 && JSON.parse(observerResult.body).error === 'not_in_lobby', 'observer result is rejected', observerResult);
  const observerLeave = await post(`/api/lobbies/${id}/leave`, asObserver);
  assert(observerLeave.statusCode === 403 && JSON.parse(observerLeave.body).error === 'not_in_lobby', 'observer leave is rejected', observerLeave);

  const missingExpectedCount = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-missing-count', pieceId: 'p-1', move: { x: 3, y: 4 } }));
  assert(missingExpectedCount.statusCode === 400 && JSON.parse(missingExpectedCount.body).error === 'bad_expected_move_count', 'move requires an integer expectedMoveCount', missingExpectedCount);
  const missingIntent = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ expectedMoveCount: 0, pieceId: 'p-1', move: { x: 3, y: 4 } }));
  assert(missingIntent.statusCode === 400 && JSON.parse(missingIntent.body).error === 'bad_intent_id', 'move requires stable intentId', missingIntent);
  const m0Body = { intentId: 'intent-a-0', expectedMoveCount: 0, pieceId: 'p-1', move: { x: 3, y: 4 } };
  const m0 = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify(m0Body));
  assert(m0.statusCode === 200 && JSON.parse(m0.body).move.i === 0, 'host relays move 0', m0);
  const duplicateM0 = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify(m0Body));
  assert(duplicateM0.statusCode === 200 && JSON.parse(duplicateM0.body).move.i === 0, 'identical stale retry returns original event', duplicateM0);
  const conflictingIntent = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ ...m0Body, pieceId: 'p-2' }));
  assert(conflictingIntent.statusCode === 409 && JSON.parse(conflictingIntent.body).error === 'intent_id_conflict', 'intentId cannot be reused for different payload', conflictingIntent);
  const staleMove = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-stale', expectedMoveCount: 0, pieceId: 'p-2', move: { x: 1, y: 1 } }));
  const staleMoveBody = JSON.parse(staleMove.body);
  assert(staleMove.statusCode === 409 && staleMoveBody.error === 'stale_move' && staleMoveBody.move_count === 1, 'new stale intent is rejected with authoritative count', staleMove);

  const outOfTurn = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-out-of-turn', expectedMoveCount: 1, pieceId: 'p-2', move: { x: 1, y: 1 } }));
  assert(outOfTurn.statusCode === 409 && JSON.parse(outOfTurn.body).error === 'not_your_turn', 'host cannot move out of turn', outOfTurn);
  const m1Body = { intentId: 'intent-a-1', expectedMoveCount: 1, pieceId: 'e-1', move: { x: 3, y: 4 } };
  const m1 = await post(`/api/lobbies/${id}/moves`, asGuest, JSON.stringify(m1Body));
  assert(m1.statusCode === 200 && JSON.parse(m1.body).move.i === 1, 'guest relays move 1', m1);
  const afterM1 = JSON.parse((await get(`/api/lobbies/${id}`, asHost)).body).lobby;
  assert(afterM1.move_count === 2 && afterM1.result_pending === false, 'two ordered intents commit');

  // --- Two-seat result consensus ------------------------------------------------
  const invalidDraw = await post(`/api/lobbies/${id}/result`, asHost, JSON.stringify({ expectedMoveCount: 2, winner: 'player', reason: 'stalemate' }));
  assert(invalidDraw.statusCode === 400 && JSON.parse(invalidDraw.body).error === 'bad_result', 'draw reason requires draw winner', invalidDraw);

  const draw = await post(`/api/lobbies/${id}/result`, asHost, JSON.stringify({ expectedMoveCount: 2, winner: 'draw', reason: 'stalemate' }));
  const drawLobby = JSON.parse(draw.body).lobby;
  assert(draw.statusCode === 200 && drawLobby.result === null && drawLobby.result_pending === true, 'first draw report remains pending', draw);
  const repeatedDraw = await post(`/api/lobbies/${id}/result`, asHost, JSON.stringify({ expectedMoveCount: 2, winner: 'draw', reason: 'stalemate' }));
  const repeatedDrawLobby = JSON.parse(repeatedDraw.body).lobby;
  assert(repeatedDraw.statusCode === 200 && repeatedDrawLobby.updated_at === drawLobby.updated_at, 'same-seat retry is mutation-free', repeatedDraw);
  const pendingMove = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-pending', expectedMoveCount: 2, pieceId: 'p-2', move: { x: 3, y: 3 } }));
  assert(pendingMove.statusCode === 409 && JSON.parse(pendingMove.body).error === 'result_pending', 'first report freezes genuinely new intents', pendingMove);
  const hostReportConflict = await post(`/api/lobbies/${id}/result`, asHost, JSON.stringify({ expectedMoveCount: 2, winner: 'player', reason: 'victory-rule' }));
  assert(hostReportConflict.statusCode === 409 && JSON.parse(hostReportConflict.body).error === 'conflicting_result_report', 'same seat cannot replace its report', hostReportConflict);
  const matchingDraw = await post(`/api/lobbies/${id}/result`, asGuest, JSON.stringify({ expectedMoveCount: 2, winner: 'draw', reason: 'stalemate' }));
  const matchedLobby = JSON.parse(matchingDraw.body).lobby;
  assert(matchingDraw.statusCode === 200 && matchedLobby.result?.winner === 'draw' && matchedLobby.result_pending === false, 'matching reports publish draw', matchingDraw);
  const lateMove = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-late', expectedMoveCount: 2, pieceId: 'p-2', move: { x: 5, y: 5 } }));
  assert(lateMove.statusCode === 409 && JSON.parse(lateMove.body).error === 'match_over', 'new move after consensus is rejected', lateMove);
  const duplicateM1 = await post(`/api/lobbies/${id}/moves`, asGuest, JSON.stringify(m1Body));
  assert(duplicateM1.statusCode === 200 && JSON.parse(duplicateM1.body).move.i === 1, 'accepted retry survives terminal result', duplicateM1);

  // --- Closed tombstone retains seats/history until second acknowledgement -------
  const completion = { expectedMoveCount: 2, winner: 'draw', reason: 'stalemate' };
  const guestLeave = await post(`/api/lobbies/${id}/leave`, asGuest, JSON.stringify(completion));
  const guestLeaveLobby = JSON.parse(guestLeave.body).lobby;
  assert(guestLeave.statusCode === 200 && guestLeaveLobby.phase === 'closed', 'started guest Leave creates tombstone', guestLeave);
  assert(guestLeaveLobby.seats.filled === 2 && guestLeaveLobby.guest && guestLeaveLobby.result?.winner === 'draw', 'tombstone retains both seats and result', guestLeave);
  const activeAfterClose = JSON.parse((await get('/api/lobbies', asHost)).body);
  assert(activeAfterClose.current === null && !activeAfterClose.lobbies.some((entry) => entry.id === id), 'closed tombstone is excluded from active listings');
  assert(activeAfterClose.recoverable.some((entry) => entry.id === id && entry.result?.winner === 'draw'), 'remaining host discovers recoverable tombstone');
  const departedGuestList = JSON.parse((await get('/api/lobbies', asGuest)).body);
  assert(!departedGuestList.recoverable.some((entry) => entry.id === id), 'departed guest does not rediscover acknowledged tombstone');
  assert((await get(`/api/lobbies/${id}`, asObserver)).statusCode === 404, 'observer cannot inspect tombstone');
  const closedHostView = JSON.parse((await get(`/api/lobbies/${id}`, asHost)).body).lobby;
  assert(closedHostView.phase === 'closed' && closedHostView.seats.filled === 2 && closedHostView.level_snapshot?.marker === 'pinned-one', 'original host reconnects with pinned snapshot');
  const closedMoves = JSON.parse((await get(`/api/lobbies/${id}/moves?since=0`, asHost)).body).moves;
  assert(closedMoves.length === 2 && closedMoves[0].intentId === 'intent-a-0' && closedMoves[1].intentId === 'intent-a-1', 'closed backfill retains intent-tagged history');
  const closedRetry = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify(m0Body));
  assert(closedRetry.statusCode === 200 && JSON.parse(closedRetry.body).move.i === 0, 'closed tombstone answers accepted retry', closedRetry);
  const closedNewMove = await post(`/api/lobbies/${id}/moves`, asHost, JSON.stringify({ intentId: 'intent-a-closed-new', expectedMoveCount: 2, pieceId: 'p-2', move: { x: 2, y: 2 } }));
  assert(closedNewMove.statusCode === 409 && JSON.parse(closedNewMove.body).error === 'lobby_closed', 'closed tombstone rejects new intent', closedNewMove);
  const closedEvents = eventStream(`/api/lobbies/${id}/events`, asHost);
  await closedEvents.opened;
  const hostAck = await post(`/api/lobbies/${id}/leave`, asHost, JSON.stringify(completion));
  assert(hostAck.statusCode === 204, 'second acknowledgement deletes tombstone', hostAck);
  const closedEventResponse = await closedEvents.completed;
  assert(parseSseFrames(closedEventResponse.body).some((frame) => frame.type === 'lobby' && frame.lobby.phase === 'closed'), 'closed reconnect receives snapshot', closedEventResponse);
  assert((await get(`/api/lobbies/${id}`, asHost)).statusCode === 404, 'fully acknowledged tombstone is deleted');

  async function createStartedLobby(levelId) {
    const created = await post('/api/lobbies', asHost);
    const lobbyId = JSON.parse(created.body).lobby.id;
    assert(created.statusCode === 201, `host creates ${levelId}`, created);
    assert((await post(`/api/lobbies/${lobbyId}/join`, asGuest)).statusCode === 200, `guest joins ${levelId}`);
    assert((await post(`/api/lobbies/${lobbyId}/level`, asHost, JSON.stringify({ levelId }))).statusCode === 200, `host selects ${levelId}`);
    assert((await post(`/api/lobbies/${lobbyId}/start`, asHost)).statusCode === 200, `host starts ${levelId}`);
    return lobbyId;
  }

  // --- Explicit live Leave remains resignation; first departure is retained ------
  const secondId = await createStartedLobby('test-level-2');
  const guestEvents = eventStream(`/api/lobbies/${secondId}/events`, asGuest);
  const observerEvents = eventStream(`/api/lobbies/${secondId}/events`, asObserver);
  await guestEvents.opened;
  await observerEvents.opened;
  const liveHostLeave = await post(`/api/lobbies/${secondId}/leave`, asHost);
  assert(liveHostLeave.statusCode === 204, 'live host Leave acknowledges host without deleting', liveHostLeave);
  const observerEventResponse = await observerEvents.completed;
  const observerLobbyFrames = parseSseFrames(observerEventResponse.body).filter((frame) => frame.type === 'lobby');
  assert(observerLobbyFrames.some((frame) => frame.lobby.phase === 'started'), 'observer receives public started state', observerEventResponse);
  assert(!observerLobbyFrames.some((frame) => frame.lobby.phase === 'closed'), 'observer stream closes before seat-private tombstone frame', observerEventResponse);
  const guestClosedView = JSON.parse((await get(`/api/lobbies/${secondId}`, asGuest)).body).lobby;
  assert(guestClosedView.phase === 'closed' && guestClosedView.result?.winner === 'enemy' && guestClosedView.result?.reason === 'resign', 'host Leave publishes resignation in tombstone');
  const guestRecoverable = JSON.parse((await get('/api/lobbies', asGuest)).body).recoverable;
  assert(guestRecoverable.some((entry) => entry.id === secondId), 'remaining guest discovers resignation tombstone');
  const hostRecoverable = JSON.parse((await get('/api/lobbies', asHost)).body).recoverable;
  assert(!hostRecoverable.some((entry) => entry.id === secondId), 'departed host does not rediscover acknowledged tombstone');
  const closedStart = await post(`/api/lobbies/${secondId}/start`, asHost);
  assert(closedStart.statusCode === 409 && JSON.parse(closedStart.body).error === 'lobby_closed', 'closed tombstone cannot Start', closedStart);
  assert((await get(`/api/lobbies/${secondId}`, asObserver)).statusCode === 404, 'closed tombstone is seat-private');
  const guestAck = await post(`/api/lobbies/${secondId}/leave`, asGuest);
  assert(guestAck.statusCode === 204, 'remaining guest acknowledgement deletes tombstone', guestAck);
  const guestEventResponse = await guestEvents.completed;
  const resignationFrames = parseSseFrames(guestEventResponse.body).filter((frame) => frame.type === 'lobby');
  const resignIndex = resignationFrames.findIndex((frame) => frame.lobby.phase === 'started' && frame.lobby.result?.reason === 'resign');
  const closedIndex = resignationFrames.findIndex((frame) => frame.lobby.phase === 'closed');
  assert(resignIndex >= 0 && closedIndex > resignIndex, 'resignation publishes before tombstone close', guestEventResponse);
  assert((await get(`/api/lobbies/${secondId}`, asGuest)).statusCode === 404, 'resignation tombstone deletes after both acknowledgements');

  // --- Cross-seat mismatch is a durable frozen dispute --------------------------
  const thirdId = await createStartedLobby('test-level-3');
  const hostClaim = { expectedMoveCount: 0, winner: 'player', reason: 'checkmate' };
  const guestClaim = { expectedMoveCount: 0, winner: 'enemy', reason: 'checkmate' };
  assert((await post(`/api/lobbies/${thirdId}/result`, asHost, JSON.stringify(hostClaim))).statusCode === 200, 'host records first disputed claim');
  const conflict = await post(`/api/lobbies/${thirdId}/result`, asGuest, JSON.stringify(guestClaim));
  assert(conflict.statusCode === 409 && JSON.parse(conflict.body).result_disputed === true, 'independent mismatch enters dispute', conflict);
  const disputedLobby = JSON.parse((await get(`/api/lobbies/${thirdId}`, asHost)).body).lobby;
  assert(disputedLobby.result === null && disputedLobby.result_pending === false && disputedLobby.result_disputed === true, 'public lobby distinguishes durable dispute');
  const repeatConflict = await post(`/api/lobbies/${thirdId}/result`, asGuest, JSON.stringify(guestClaim));
  const repeatedConflictLobby = JSON.parse(repeatConflict.body).lobby;
  assert(repeatConflict.statusCode === 200 && repeatedConflictLobby.updated_at === disputedLobby.updated_at, 'identical disputed report retry is mutation-free', repeatConflict);
  const disputedMove = await post(`/api/lobbies/${thirdId}/moves`, asHost, JSON.stringify({ intentId: 'intent-disputed-new', expectedMoveCount: 0, pieceId: 'p-1', move: { x: 1, y: 1 } }));
  assert(disputedMove.statusCode === 409 && JSON.parse(disputedMove.body).error === 'result_disputed', 'dispute freezes new intents', disputedMove);
  const concedeDispute = await post(`/api/lobbies/${thirdId}/leave`, asGuest);
  const concededLobby = JSON.parse(concedeDispute.body).lobby;
  assert(concedeDispute.statusCode === 200 && concededLobby.phase === 'closed', 'explicit no-completion Leave closes dispute', concedeDispute);
  assert(concededLobby.result?.winner === 'player' && concededLobby.result?.reason === 'resign' && concededLobby.result_disputed === false, 'concession resolves dispute as resignation', concedeDispute);
  assert((await post(`/api/lobbies/${thirdId}/leave`, asHost)).statusCode === 204, 'remaining host acknowledges conceded dispute');

  // --- Leave completion is one report; remaining seat supplies consensus --------
  const fourthId = await createStartedLobby('test-level-4');
  const guestCompletion = { expectedMoveCount: 0, winner: 'player', reason: 'checkmate' };
  const completedLeave = await post(`/api/lobbies/${fourthId}/leave`, asGuest, JSON.stringify(guestCompletion));
  const pendingClosed = JSON.parse(completedLeave.body).lobby;
  assert(completedLeave.statusCode === 200 && pendingClosed.phase === 'closed', 'completion Leave closes and retains match', completedLeave);
  assert(pendingClosed.result === null && pendingClosed.result_pending === true && pendingClosed.result_disputed === false, 'one Leave completion cannot forge authority', completedLeave);
  const pendingRecovery = JSON.parse((await get('/api/lobbies', asHost)).body).recoverable;
  assert(pendingRecovery.some((entry) => entry.id === fourthId && entry.result_pending), 'remaining host discovers pending-consensus tombstone');
  const matchingClosedReport = await post(`/api/lobbies/${fourthId}/result`, asHost, JSON.stringify(guestCompletion));
  const completedClosed = JSON.parse(matchingClosedReport.body).lobby;
  assert(matchingClosedReport.statusCode === 200 && completedClosed.result?.winner === 'player' && completedClosed.result_pending === false, 'remaining seat publishes closed consensus', matchingClosedReport);
  const completedAck = await post(`/api/lobbies/${fourthId}/leave`, asHost, JSON.stringify(guestCompletion));
  assert(completedAck.statusCode === 204, 'matching host completion deletes tombstone', completedAck);
  assert((await get(`/api/lobbies/${fourthId}`, asHost)).statusCode === 404, 'consensus tombstone deletes after both departures');

  // --- Awaited canonical lookup is guarded by a lobby revision CAS ---------------
  async function createReadyLobby(levelId) {
    const created = await post('/api/lobbies', asHost);
    const lobbyId = JSON.parse(created.body).lobby.id;
    assert(created.statusCode === 201, `host creates race lobby ${levelId}`, created);
    assert((await post(`/api/lobbies/${lobbyId}/join`, asGuest)).statusCode === 200, `guest joins race lobby ${levelId}`);
    assert((await post(`/api/lobbies/${lobbyId}/level`, asHost, JSON.stringify({ levelId }))).statusCode === 200, `host selects race level ${levelId}`);
    return lobbyId;
  }

  // Start resolves L1 slowly. A concurrent L2 selection wins the revision, so stale
  // Start cannot pin L1 under L2's id. Then invert the race: slow Level cannot clear the
  // snapshot after fast Start has transitioned the ready lobby.
  const levelRaceId = await createReadyLobby('test-level-race-start');
  const staleStartPromise = post(`/api/lobbies/${levelRaceId}/start`, asHost);
  await pause(75);
  const winningLevel = await post(`/api/lobbies/${levelRaceId}/level`, asHost, JSON.stringify({ levelId: 'test-level-2' }));
  assert(winningLevel.statusCode === 200, 'concurrent canonical L2 selection wins', winningLevel);
  const staleStart = await staleStartPromise;
  assert(staleStart.statusCode === 409 && JSON.parse(staleStart.body).error === 'lobby_state_changed', 'stale Start CAS rejects L1/L2 mix', staleStart);
  const afterStaleStart = JSON.parse((await get(`/api/lobbies/${levelRaceId}`, asHost)).body).lobby;
  assert(afterStaleStart.phase === 'ready' && afterStaleStart.level_id === 'test-level-2' && afterStaleStart.seed === null && afterStaleStart.level_snapshot === null, 'stale Start leaves winning selection untouched');

  const staleLevelPromise = post(`/api/lobbies/${levelRaceId}/level`, asHost, JSON.stringify({ levelId: 'test-level-race-level' }));
  await pause(75);
  const winningStart = await post(`/api/lobbies/${levelRaceId}/start`, asHost);
  const winningStartedLobby = JSON.parse(winningStart.body).lobby;
  assert(winningStart.statusCode === 200 && winningStartedLobby.level_id === 'test-level-2' && winningStartedLobby.level_snapshot?.id === 'test-level-2', 'fast Start pins selected L2', winningStart);
  const staleLevel = await staleLevelPromise;
  assert(staleLevel.statusCode === 409 && JSON.parse(staleLevel.body).error === 'lobby_state_changed', 'stale Level CAS cannot clear started snapshot', staleLevel);
  const afterStaleLevel = JSON.parse((await get(`/api/lobbies/${levelRaceId}`, asHost)).body).lobby;
  assert(afterStaleLevel.phase === 'started' && afterStaleLevel.level_id === 'test-level-2' && afterStaleLevel.level_snapshot?.id === 'test-level-2', 'started snapshot survives late Level response');
  assert((await post(`/api/lobbies/${levelRaceId}/leave`, asHost)).statusCode === 204, 'host closes level-race match');
  assert((await post(`/api/lobbies/${levelRaceId}/leave`, asGuest)).statusCode === 204, 'guest acknowledges level-race tombstone');

  // Leave while Start awaits canonical content must win; late Start cannot resurrect a
  // closed lobby, restore its guest, allocate a seed, or pin a snapshot.
  const leaveRaceId = await createReadyLobby('test-level-race-leave');
  const leaveRaceStartPromise = post(`/api/lobbies/${leaveRaceId}/start`, asHost);
  await pause(75);
  const racingLeave = await post(`/api/lobbies/${leaveRaceId}/leave`, asHost);
  assert(racingLeave.statusCode === 204, 'host Leave closes ready lobby during Start lookup', racingLeave);
  const staleAfterLeave = await leaveRaceStartPromise;
  assert(staleAfterLeave.statusCode === 409 && JSON.parse(staleAfterLeave.body).error === 'lobby_state_changed', 'late Start rejects closed lobby revision', staleAfterLeave);
  const closedDuringStart = JSON.parse((await get(`/api/lobbies/${leaveRaceId}`, asGuest)).body).lobby;
  assert(closedDuringStart.phase === 'closed' && closedDuringStart.seed === null && closedDuringStart.level_snapshot === null && closedDuringStart.seats.filled === 2, 'Leave wins without Start resurrection');
  const pregameCompletion = { expectedMoveCount: 0, winner: 'player', reason: 'checkmate' };
  const pregameResult = await post(`/api/lobbies/${leaveRaceId}/result`, asGuest, JSON.stringify(pregameCompletion));
  assert(pregameResult.statusCode === 409 && JSON.parse(pregameResult.body).error === 'lobby_not_started', 'ready tombstone rejects deterministic result report', pregameResult);
  const pregameCompletionLeave = await post(`/api/lobbies/${leaveRaceId}/leave`, asGuest, JSON.stringify(pregameCompletion));
  assert(pregameCompletionLeave.statusCode === 409 && JSON.parse(pregameCompletionLeave.body).error === 'lobby_not_started', 'ready tombstone rejects completion-bearing Leave', pregameCompletionLeave);
  assert((await post(`/api/lobbies/${leaveRaceId}/leave`, asGuest)).statusCode === 204, 'guest acknowledges leave-race tombstone');

  console.log('netplay-smoke-test: OK — snapshots, idempotency, consensus, tombstones, and lookup CAS verified with NO database.');
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
