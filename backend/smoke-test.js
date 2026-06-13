const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
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

const child = spawn(process.execPath, ['supervisor.js'], {
  cwd: __dirname,
  env: {
    ...process.env,
    AUTH_BASE_URL: `http://127.0.0.1:${authPort}`,
    PORT: String(port),
    PUBLIC_ORIGIN: 'https://chess.romaine.life',
    HOT_BACKEND_DIR: hotBackendDir,
    STATIC_FRONTEND_DIR: hotStaticDir,
    DESIGN_PORTFOLIO_STORE_PATH: path.join(hotRoot, 'design-portfolios.json'),
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

function request(method, path, headers = {}, body = null) {
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
    req.end(body);
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

  const reviewUrls = [
    '/?screen=main',
    '/?screen=main-concept',
    '/?screen=main-skeleton',
    '/?screen=main-assets',
    '/?screen=campaigns',
    '/?screen=campaigns-skeleton',
    '/?screen=campaigns-concept',
    '/?screen=level-editor',
    '/?screen=level-editor-skeleton',
    '/?screen=level-editor-concept',
    '/?screen=skirmish',
    '/?screen=skirmish-skeleton',
    '/?screen=skirmish-concept',
    '/?screen=main-concept&hotspots=1',
    '/?screen=campaigns-concept&hotspots=1',
    '/?screen=level-editor-concept&hotspots=1',
    '/?screen=skirmish-concept&hotspots=1',
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
    '/assets/ui/main-menu-profile-chrome-v1.png',
    '/assets/ui/main-menu-news-chrome-v1.png',
    '/assets/ui/main-menu-dock-chrome-v1.png',
  ];
  for (const assetPath of artAssets) {
    const response = await get(assetPath);
    if (response.statusCode !== 200 || !String(response.headers['content-type'] || '').includes('image/png')) {
      throw new Error(`Unexpected art asset response for ${assetPath}: ${response.statusCode} ${response.headers['content-type'] || ''}`);
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

  const anonymousLobbies = await get('/api/lobbies');
  if (anonymousLobbies.statusCode !== 401) {
    throw new Error(`Anonymous lobby list should require sign-in: ${anonymousLobbies.statusCode}`);
  }

  const anonymousCampaigns = await get('/api/campaigns');
  if (anonymousCampaigns.statusCode !== 401) {
    throw new Error(`Anonymous campaign list should require sign-in: ${anonymousCampaigns.statusCode}`);
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

  const started = await request('POST', `/api/lobbies/${lobbyId}/start`, { cookie: 'better-auth.session=abc', 'content-type': 'application/json' }, '{}');
  const startedBody = JSON.parse(started.body);
  if (started.statusCode !== 200 || startedBody.lobby.phase !== 'started') {
    throw new Error(`Unexpected start lobby response: ${started.statusCode} ${started.body}`);
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
