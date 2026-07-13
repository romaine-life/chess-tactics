#!/usr/bin/env node
// Headless two-browser end-to-end test for multiplayer lobbies — the SCRIPTED version of
// the manual "two humans, two browsers" check required for multiplayer changes.
//
// It drives two isolated browser contexts (host + guest) against a REAL backend that serves
// the built frontend, with a tiny mock auth server standing in for auth.romaine.life
// (better-auth.session=abc -> player, =rival -> rival). It proves lobby and gameplay
// projection end to end through real EventSource streams and real DOM:
//   1. HOST SEES GUEST JOIN LIVE — after the guest joins, the host's screen fills the guest
//      seat WITHOUT a manual refresh (the original "friend joined but never appeared" bug).
//   2. BOTH SEATS PLAY ONE SERVER-SEQUENCED GAME with reciprocal player-interface copy.
//   3. EACH SEAT CAN PREMOVE during the other seat's turn; it auto-submits through the
//      normal authoritative move path rather than a lobby-only gameplay branch.
//   4. ONE TERMINAL FRAME renders Victory for one seat and Defeat for the other.
//
// Lobby state is in-memory, so NO database is needed. Requires a built frontend
// (frontend/dist — run `npm run build` first) and system Chrome/Edge (same discovery as
// scripts/shot.mjs). This is intentionally NOT wired into the blocking `npm test` chain:
// it needs a browser + a build, which we keep out of the fast unit/lint gate. Run it before
// cutting a release, or in a dedicated CI job.
//
// Usage (from frontend/):  npm run e2e:lobby

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const backendDir = resolve(repoRoot, 'backend');
const distDir = resolve(repoRoot, 'frontend', 'dist');

const PORT = 31500;
const AUTH_PORT = 31501;
const BASE = `http://127.0.0.1:${PORT}`;

// Canonical content supplied at the same official-workspace API boundary production uses.
// The E2E backend intentionally has no Postgres; intercepting these content reads keeps the
// test deterministic without adding a compiled-in runtime level or shadow gameplay path.
const LEVEL_ID = 'off-l-lobby-parity';
const CAMPAIGN_ID = 'off-c-lobby-parity';
const TEST_LEVEL = {
  formatVersion: 1,
  id: LEVEL_ID,
  name: 'Lobby Parity',
  notes: 'Two-seat premove relay check.',
  board: { cols: 8, rows: 8, heightLevels: 1 },
  objective: 'reach',
  difficulty: 'normal',
  economy: { startingFunds: 1000, incomePerTurn: 100 },
  theme: 'grassland',
  layers: {
    terrain: [],
    decals: [],
    zones: [{ id: 'premove-goal', name: 'Premove goal', type: 'objective', tiles: [[2, 2]] }],
    units: [
      { side: 'player', type: 'king', x: 0, y: 7 },
      { side: 'player', type: 'pawn', x: 2, y: 6 },
      { side: 'enemy', type: 'king', x: 7, y: 0 },
      { side: 'enemy', type: 'pawn', x: 5, y: 1 },
    ],
  },
};
const OFFICIAL_RESPONSE = {
  portfolio: {
    data: {
      campaigns: [{
        formatVersion: 1,
        id: CAMPAIGN_ID,
        name: 'Lobby Parity',
        difficulty: 'normal',
        chapters: 1,
        levels: [{ levelId: LEVEL_ID, ordinal: 0, objective: 'reach' }],
      }],
      levels: { [LEVEL_ID]: TEST_LEVEL },
    },
    revision: 1,
    updated_at: null,
  },
};
const EMPTY_USER_WORKSPACE = { campaigns: [], levels: {}, revision: 0, updated_at: null };
const UNIT_FAMILIES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
const UNIT_PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
const UNIT_DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const UNIT_SHA = 'a'.repeat(64);
const UNIT_SPRITE_URL = `/api/unit-sprites/${UNIT_SHA}.png`;
const UNIT_SPRITES = Object.fromEntries(UNIT_PALETTES.map((palette) => [
  palette,
  Object.fromEntries(UNIT_DIRECTIONS.map((direction) => [direction, {
    url: UNIT_SPRITE_URL,
    sha256: UNIT_SHA,
    width: 512,
    height: 512,
    byteLength: 1024,
  }])),
]));
const UNIT_CATALOG = {
  schemaVersion: 1,
  revision: 1,
  families: UNIT_FAMILIES.map((family) => ({
    family,
    acceptedAssetId: `e2e-${family}`,
    displayScalePercent: 100,
    rowRevision: 1,
  })),
  assets: UNIT_FAMILIES.map((family) => ({
    id: `e2e-${family}`,
    family,
    label: `${family} E2E art`,
    method: 'E2E API fixture',
    notes: '',
    status: 'candidate',
    accepted: true,
    nativeScalePercent: 100,
    footprint: {
      shape: family === 'rook' ? 'square' : 'circle',
      sourceCanvasWidth: 512,
      sourceCanvasHeight: 512,
      sourceFootprintPx: 150,
    },
    anchor: { x: 0.5, y: 0.8 },
    rowRevision: 1,
    sprites: UNIT_SPRITES,
    spriteCount: UNIT_PALETTES.length * UNIT_DIRECTIONS.length,
    complete: true,
    acceptanceBlockReason: null,
  })),
};
const UNIT_SPRITE_PATH = resolve(distDir, 'assets/units/rook/portrait/white.png');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const executablePath = CHROMES.find(existsSync);

if (!existsSync(resolve(distDir, 'index.html'))) {
  console.error(`No built frontend at ${distDir}. Build it first:  npm run build`);
  process.exit(1);
}
if (!existsSync(UNIT_SPRITE_PATH)) {
  console.error(`Built frontend is missing the E2E unit sprite at ${UNIT_SPRITE_PATH}. Rebuild it first:  npm run build`);
  process.exit(1);
}
const UNIT_SPRITE_BYTES = readFileSync(UNIT_SPRITE_PATH);
if (!executablePath) {
  console.error('No Chrome/Edge found. Checked:\n' + CHROMES.join('\n'));
  process.exit(1);
}

// Mock auth (mirrors backend/smoke-test.js): resolve the session cookie to a user.
const mockAuth = createServer((req, res) => {
  if (req.url === '/api/auth/get-session') {
    const cookie = req.headers.cookie || '';
    if (!cookie.includes('better-auth.session')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('null'); return; }
    const user = cookie.includes('better-auth.session=rival')
      ? { email: 'rival@example.com', name: 'Lobby Rival', role: 'pending' }
      : { email: 'player@example.com', name: 'Tactics Player', role: 'pending' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installContentFixture(page) {
  const control = {
    holdNextMove: false,
    heldMove: null,
    observedMoveIntentIds: [],
  };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === BASE && /^\/api\/lobbies\/[^/]+\/moves$/.test(url.pathname) && request.method() === 'POST') {
      let intentId = null;
      try { intentId = JSON.parse(request.postData() || '{}').intentId || null; } catch { /* assertion below catches absence */ }
      if (intentId) control.observedMoveIntentIds.push(intentId);
      if (control.holdNextMove) {
        control.holdNextMove = false;
        control.heldMove = request;
        return;
      }
    }
    if (url.origin === BASE && url.pathname === '/api/unit-catalog') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(UNIT_CATALOG) });
      return;
    }
    if (url.origin === BASE && url.pathname === UNIT_SPRITE_URL) {
      void request.respond({ status: 200, contentType: 'image/png', body: UNIT_SPRITE_BYTES });
      return;
    }
    if (url.origin === BASE && url.pathname === '/api/official-campaigns/default') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(OFFICIAL_RESPONSE) });
      return;
    }
    if (url.origin === BASE && url.pathname === '/api/campaign-workspace') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_USER_WORKSPACE) });
      return;
    }
    void request.continue();
  });
  return control;
}

async function waitForText(page, selector, expected, timeout = 10000) {
  await page.waitForFunction(
    (sel, text) => document.querySelector(sel)?.textContent?.trim() === text,
    { timeout },
    selector,
    expected,
  );
}

const cellSelector = (x, y) => `[data-testid="skirmish-board"] [data-cx="${x}"][data-cy="${y}"]`;

async function clickCell(page, x, y) {
  const selector = cellSelector(x, y);
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.click(selector);
}

async function waitForCellClass(page, x, y, className, present = true) {
  await page.waitForFunction(
    (selector, cls, wanted) => document.querySelector(selector)?.classList.contains(cls) === wanted,
    { timeout: 10000 },
    cellSelector(x, y),
    className,
    present,
  );
}

async function queueMove(page, from, to) {
  await clickCell(page, from.x, from.y);
  await waitForCellClass(page, from.x, from.y, 'is-selected');
  await clickCell(page, to.x, to.y);
  await waitForCellClass(page, to.x, to.y, 'is-premove');
}

async function playMove(page, from, to) {
  await clickCell(page, from.x, from.y);
  await waitForCellClass(page, from.x, from.y, 'is-selected');
  await clickCell(page, to.x, to.y);
  await waitForCellClass(page, to.x, to.y, 'is-selected');
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok && (await r.text()) === 'ok') return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('backend did not become healthy');
}

let backend = null;
let browser = null;
let backendLog = '';

async function cleanup() {
  if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  if (backend && backend.exitCode === null) backend.kill();
  await new Promise((r) => mockAuth.close(r));
}

async function main() {
  await new Promise((r) => mockAuth.listen(AUTH_PORT, '127.0.0.1', r));

  backend = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_BASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
      PUBLIC_ORIGIN: BASE,
      FRONTEND_DIR: distDir,
      // Production resolves this from the official workspace DB. This DB-free protocol
      // exercise uses the backend's explicitly test-only canonical metadata seam.
      NODE_ENV: 'test',
      LOBBY_TEST_LEVEL_METADATA: JSON.stringify({ [LEVEL_ID]: { level: TEST_LEVEL } }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', (c) => { backendLog += c; });
  backend.stderr.on('data', (c) => { backendLog += c; });
  await waitForHealth();

  browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run', '--no-default-browser-check'],
  });

  // Two isolated contexts so host and guest carry different session cookies.
  const openSeat = async (session) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const fixture = await installContentFixture(page);
    await page.setCookie({ url: BASE, name: 'better-auth.session', value: session, path: '/' });
    await page.goto(`${BASE}/lobbies`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Signed-in state renders the "Host a lobby" toolbar; wait for it (not the sign-in gate).
    await page.waitForSelector('[data-testid=host-lobby]', { timeout: 10000 });
    return { page, fixture };
  };

  const hostSeat = await openSeat('abc');
  const guestSeat = await openSeat('rival');
  const hostPage = hostSeat.page;
  const guestPage = guestSeat.page;

  // Host creates a lobby and waits for its own current-lobby card (guest seat still empty).
  await hostPage.click('[data-testid=host-lobby]');
  await hostPage.waitForFunction(() => {
    const seats = document.querySelectorAll('.utility-lobby-card.is-current .utility-lobby-seats .utility-seat');
    return seats.length === 2 && seats[1].classList.contains('is-empty');
  }, { timeout: 10000 });

  // Guest sees the open lobby in the list and joins it.
  await guestPage.waitForFunction(
    () => [...document.querySelectorAll('.utility-lobby-row button')].some((b) => /join/i.test(b.textContent || '')),
    { timeout: 10000 },
  );
  await guestPage.evaluate(() => {
    const btn = [...document.querySelectorAll('.utility-lobby-row button')].find((b) => /join/i.test(b.textContent || ''));
    btn.click();
  });

  // THE ASSERTION: the host's screen fills the guest seat WITHOUT any manual refresh —
  // purely from the live SSE update. This is the bug that was reported.
  await hostPage.waitForFunction(() => {
    const seats = document.querySelectorAll('.utility-lobby-card.is-current .utility-lobby-seats .utility-seat');
    const guestSeat = seats[1];
    return guestSeat && !guestSeat.classList.contains('is-empty') && /rival/i.test(guestSeat.textContent || '');
  }, { timeout: 8000 });
  console.log('PASS 1/6: host saw the guest join live (no refresh).');

  // Select the one canonical fixture level and start. Host navigates directly; guest
  // auto-launches from the live lobby mutation.
  await hostPage.waitForSelector('.utility-level-card', { visible: true, timeout: 10000 });
  await hostPage.click('.utility-level-card');
  await hostPage.waitForFunction(
    () => document.querySelector('.utility-level-card')?.getAttribute('aria-pressed') === 'true',
    { timeout: 10000 },
  );
  await hostPage.waitForFunction(
    () => !document.querySelector('.utility-actions button.utility-button-primary')?.disabled,
    { timeout: 10000 },
  );
  await hostPage.click('.utility-actions button.utility-button-primary');
  await Promise.all([
    hostPage.waitForSelector('[data-testid="skirmish-board"]:not(.is-board-loading)', { timeout: 15000 }),
    guestPage.waitForSelector('[data-testid="skirmish-board"]:not(.is-board-loading)', { timeout: 15000 }),
  ]);
  await waitForText(hostPage, '[data-testid="turn-label"]', 'Your turn');
  await waitForText(guestPage, '[data-testid="turn-label"]', 'Opponent turn');
  const hostObjective = await hostPage.$eval('.skirmish-objective small', (node) => node.textContent?.trim());
  const guestObjective = await guestPage.$eval('.skirmish-objective small', (node) => node.textContent?.trim());
  assert(hostObjective === 'Reach the objective with a pawn; protect your force', `unexpected host objective: ${hostObjective}`);
  assert(guestObjective === 'Eliminate the opposing force; stop the opposing pawn reaching the objective', `unexpected guest objective: ${guestObjective}`);
  // A second same-seat tab can observe the game but cannot acquire the interactive seat
  // lease and manufacture a competing first intent.
  const mirrorPage = await hostPage.browserContext().newPage();
  await installContentFixture(mirrorPage);
  await mirrorPage.goto(hostPage.url(), { waitUntil: 'domcontentloaded' });
  await mirrorPage.waitForSelector('[data-testid="skirmish-board"]:not(.is-board-loading)', { timeout: 15000 });
  await mirrorPage.waitForFunction(
    () => document.body.textContent?.includes('This seat is active in another tab'),
    { timeout: 10000 },
  );
  assert(
    await mirrorPage.$eval('[data-testid="skirmish-board"]', (node) => node.getAttribute('data-interactive')) === 'false',
    'secondary same-seat board was not explicitly read-only',
  );
  await clickCell(mirrorPage, 2, 6);
  await sleep(100);
  assert(
    !(await mirrorPage.$eval(cellSelector(2, 6), (node) => node.classList.contains('is-selected'))),
    'secondary same-seat click created a movement selection',
  );
  await mirrorPage.close();
  console.log('PASS 2/6: reciprocal interfaces share one simulation and secondary seat tabs are read-only.');

  // Guest queues on the opening host turn. The arrow disappears only after the host
  // relay returns control and the queued enemy move itself echoes authoritatively.
  await queueMove(guestPage, { x: 5, y: 1 }, { x: 5, y: 2 });
  // Hold the first POST before it reaches the server, then reload. The durable journal
  // must restore and resend the exact same intent id; a new identity here would recreate
  // the request-arrival race this suite guards against.
  hostSeat.fixture.holdNextMove = true;
  await clickCell(hostPage, 2, 6);
  await waitForCellClass(hostPage, 2, 6, 'is-selected');
  await clickCell(hostPage, 2, 5);
  for (let i = 0; i < 50 && !hostSeat.fixture.heldMove; i += 1) await sleep(20);
  assert(hostSeat.fixture.heldMove, 'host move POST was not held for reload recovery');
  const heldIntentId = hostSeat.fixture.observedMoveIntentIds.at(-1);
  await hostSeat.fixture.heldMove.abort('aborted');
  hostSeat.fixture.heldMove = null;
  await hostPage.reload({ waitUntil: 'domcontentloaded' });
  await hostPage.waitForSelector('[data-testid="skirmish-board"]:not(.is-board-loading)', { timeout: 15000 });
  // Request interception state lives outside the page; assert the restored wire identity
  // directly even though the document itself was replaced.
  for (let i = 0; i < 100 && hostSeat.fixture.observedMoveIntentIds.filter((id) => id === heldIntentId).length < 2; i += 1) await sleep(25);
  assert(
    hostSeat.fixture.observedMoveIntentIds.filter((id) => id === heldIntentId).length >= 2,
    'reload did not retry the original stable move intent id',
  );
  await waitForCellClass(guestPage, 5, 2, 'is-premove', false);
  await waitForText(hostPage, '[data-testid="turn-label"]', 'Your turn');
  await waitForText(guestPage, '[data-testid="turn-label"]', 'Opponent turn');
  console.log('PASS 3/6: reload retried one stable intent and the guest-seat premove auto-fired.');

  // Host makes a normal move, queues during the guest turn, and drains the same
  // client-side feature through the same pending/echo path.
  await playMove(hostPage, { x: 2, y: 5 }, { x: 2, y: 4 });
  await waitForText(guestPage, '[data-testid="turn-label"]', 'Your turn');
  await queueMove(hostPage, { x: 2, y: 4 }, { x: 2, y: 3 });
  await playMove(guestPage, { x: 5, y: 2 }, { x: 5, y: 3 });
  await waitForCellClass(hostPage, 2, 3, 'is-premove', false);
  await waitForText(hostPage, '[data-testid="turn-label"]', 'Opponent turn');
  await waitForText(guestPage, '[data-testid="turn-label"]', 'Your turn');
  console.log('PASS 4/6: the host-seat premove auto-fired through the relay.');

  // Cross-inspect the committed pieces from opposite clients. This proves the local
  // ghosts resolved to the same real board, not merely that each screen advanced a turn.
  // Let the intentional 620ms post-relay landing beat close first: during that beat the
  // returning seat still owns premove input even though its status already reads Your turn.
  await sleep(700);
  await clickCell(guestPage, 2, 3);
  await waitForCellClass(guestPage, 2, 3, 'is-focused-piece');
  await playMove(guestPage, { x: 5, y: 3 }, { x: 5, y: 4 });
  await waitForText(hostPage, '[data-testid="turn-label"]', 'Your turn');
  await sleep(700);
  await clickCell(hostPage, 5, 4);
  await waitForCellClass(hostPage, 5, 4, 'is-focused-piece');
  console.log('PASS 5/6: both clients inspect the same committed board positions.');

  // Finish through normal gameplay. Both clients independently settle the same objective
  // arrival at the same relay count; the server publishes only after their reports agree.
  await clickCell(hostPage, 2, 3);
  await waitForCellClass(hostPage, 2, 3, 'is-selected');
  await clickCell(hostPage, 2, 2);
  await Promise.all([
    hostPage.waitForSelector('[data-testid="netplay-result"]', { visible: true, timeout: 10000 }),
    guestPage.waitForSelector('[data-testid="netplay-result"]', { visible: true, timeout: 10000 }),
  ]);
  await waitForText(hostPage, '[data-testid="netplay-result"] h2', 'Victory');
  await waitForText(guestPage, '[data-testid="netplay-result"] h2', 'Defeat');
  console.log('PASS 6/6: two-seat result consensus rendered one seat-relative terminal outcome.');

  // The first Return closes a durable tombstone; the second acknowledges and collects it.
  await guestPage.click('[data-testid="netplay-return"]');
  await hostPage.click('[data-testid="netplay-return"]');

  console.log('\nlobby-e2e: OK');
}

main()
  .then(async () => { await cleanup(); process.exit(0); })
  .catch(async (err) => {
    console.error('\nlobby-e2e FAILED:', err.message);
    if (backendLog) console.error('--- backend log ---\n' + backendLog.slice(-2000));
    await cleanup();
    process.exit(1);
  });
