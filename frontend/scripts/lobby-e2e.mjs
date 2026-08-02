#!/usr/bin/env node
// Headless two-browser end-to-end test for multiplayer lobbies — the SCRIPTED version of
// the manual "two humans, two browsers" check required for multiplayer changes.
//
// It drives two isolated browser contexts (host + guest) against a REAL backend that serves
// the built frontend, with a tiny mock OIDC server standing in for auth.romaine.life
// (access token abc -> player, rival -> rival). It proves lobby and gameplay
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
import { crc32, deflateSync } from 'node:zlib';
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
// Runtime art moved behind the live backend (#479) and the build guard now asserts dist/ carries
// no packaged media, so this suite can no longer read a sprite out of the build — it hard-failed
// on a file that cannot exist any more, which made it unrunnable. The bytes only need to be a
// valid PNG at the size UNIT_SPRITES declares; this fixture proves lobby and netplay relay, not
// art. Synthesize one so the suite stays self-contained and runnable anywhere, which is its point.
function solidPng(width, height, [red, green, blue, alpha]) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // colour type: RGBA
  const row = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.alloc(width * 4).fill(Buffer.from([red, green, blue, alpha])),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const UNIT_SPRITE_BYTES = solidPng(512, 512, [92, 112, 164, 255]);

// App startup is fail-closed on the two live art catalogs (main.tsx -> loadLiveMediaCatalog), and
// this backend runs without Postgres on purpose, so it answers both with database_not_configured
// and every seat stops at "Live assets unavailable".
//
// Serve the SAME fixtures the unit tests use rather than a second copy authored here. The app
// boots against a 31-kind art contract (ground cover, chrome families, nine-slices, fonts...); a
// parallel fixture in this file would drift out of that contract silently, which is the failure
// mode that left this suite dead for three weeks. They are TypeScript, so load them through
// vite's own module graph — the same resolver the app is built with, and no new dependency.
async function canonicalArtCatalogs() {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const drawable = await server.ssrLoadModule('/src/test/drawableCatalog.ts');
    const media = await server.ssrLoadModule('/src/test/liveMediaCatalog.ts');
    const seats = await server.ssrLoadModule('/src/test/livePropSeats.ts');
    return {
      drawableCatalog: drawable.testDrawableCatalog(),
      mediaCatalog: media.testGroundCoverCatalog([
        ...media.testStructureMediaSlots(),
        ...media.testInstalledChromeMediaSlots(),
        ...media.testWallDecorMediaSlots(),
      ]),
      propSeats: { portfolio: { data: seats.TEST_PROP_SEATS, revision: 1, updated_at: null } },
    };
  } finally {
    await server.close();
  }
}
const {
  drawableCatalog: DRAWABLE_CATALOG,
  mediaCatalog: MEDIA_CATALOG,
  propSeats: PROP_SEATS,
} = await canonicalArtCatalogs();

// Startup also fails closed on the interface font (main.tsx loadCriticalFonts asserts
// document.fonts.check), and that .otf lives in blob storage behind the live backend like the rest
// of the art. The family name comes from the app's own @font-face rule, not from anything inside
// the file, so ANY valid font registers under it — this suite proves lobby relay, not typography.
// Borrow a system font, discovered the same way Chrome is above.
const SYSTEM_FONTS = [
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
];
const systemFontPath = SYSTEM_FONTS.find(existsSync);

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
if (!executablePath) {
  console.error('No Chrome/Edge found. Checked:\n' + CHROMES.join('\n'));
  process.exit(1);
}
if (!systemFontPath) {
  console.error('No system font found to stand in for the interface font. Checked:\n' + SYSTEM_FONTS.join('\n'));
  process.exit(1);
}
const SYSTEM_FONT_BYTES = readFileSync(systemFontPath);

const mockAuthIssuer = `http://127.0.0.1:${AUTH_PORT}`;

// Mock auth (mirrors backend/smoke-test.js): resolve the bearer access token.
const mockAuth = createServer((req, res) => {
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
      : { sub: 'player', email: 'player@example.com', name: 'Tactics Player', role: 'pending' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(user));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// CDP request interception is genuinely REQUIRED here, unlike the fetch-only stubs elsewhere in
// scripts/ that were moved into the page (see shot-editor-session.installObservationSessionPatch).
// Two of these fixtures are out of reach of a `window.fetch` patch:
//   - the unit sprite is fetched by the renderer's `new Image()` loader (render/imageResources.ts),
//     a transport a fetch patch cannot see at all;
//   - the reload-recovery proof HOLDS a move POST in flight and then aborts it, which needs the
//     request paused at the network layer while the page keeps running.
// The hang this pattern caused in run-battle-e2e (commit af37db63) was a Vite DEV-SERVER pathology:
// interception routed on-demand module transforms through the test process and left the AI worker's
// module graph paused forever. That mechanism cannot arise here — this suite has no Vite in it. It
// spawns backend/server.js with FRONTEND_DIR pointed at the built dist, so every module is a
// finished static file with no per-request transform to stall on.
//
// Measured across repeated full runs: the interception here reaches PASS 4/6 every time, which
// includes the hold-then-abort reload proof that exercises the paused-request path directly. It
// has never stalled. The suite still stops at checkpoint 5/6 on a gameplay-coordinate assertion
// (see the comment at that step) — a drifted expectation, not a hang.
async function installContentFixture(page) {
  const control = {
    holdNextMove: false,
    heldMove: null,
    observedMoveIntentIds: [],
    consoleErrors: [],
    failedResponses: [],
  };
  // A startup that fails closed says only "Live assets unavailable" on screen; the reason it
  // rejected is in the browser console. Capture it so a fixture that has drifted out of a catalog
  // contract names itself instead of presenting as a mystery selector timeout.
  page.on('console', (message) => {
    if (message.type() === 'error') control.consoleErrors.push(message.text().slice(0, 400));
  });
  page.on('pageerror', (error) => control.consoleErrors.push(`pageerror: ${String(error).slice(0, 400)}`));
  // "Failed to load resource: 503" never says WHICH resource, and a fixture gap looks exactly like
  // a broken app from the page text alone. Name the failing reads.
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const failed = `${response.status()} ${new URL(response.url()).pathname}`;
    if (!control.failedResponses.includes(failed)) control.failedResponses.push(failed);
  });
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
    if (url.origin === BASE && url.pathname === '/api/asset-catalog') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(MEDIA_CATALOG) });
      return;
    }
    if (url.origin === BASE && url.pathname === '/api/drawable-catalog') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(DRAWABLE_CATALOG) });
      return;
    }
    if (url.origin === BASE && url.pathname === '/api/prop-seats/default') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(PROP_SEATS) });
      return;
    }
    // Every catalog above addresses its art by content hash under /api/media/<sha>. The bytes are
    // never inspected here — this suite proves relay, not art — so answer them all with the same
    // valid PNG instead of teaching the fixture about each individual asset.
    if (url.origin === BASE && url.pathname.startsWith('/assets/fonts/')) {
      void request.respond({ status: 200, contentType: 'font/ttf', body: SYSTEM_FONT_BYTES });
      return;
    }
    if (url.origin === BASE && (url.pathname === UNIT_SPRITE_URL || url.pathname.startsWith('/api/media/'))) {
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
// Every seat's fixture, so a failure anywhere in the run can report the browser-side reasons —
// not just the two waits inside openSeat that happen to have a local handler.
const seatFixtures = [];

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

  // Two isolated contexts so host and guest carry different access cookies.
  const openSeat = async (session) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    // Pin a viewport the shell actually fits in. Puppeteer's default is 800x600, and the lobby
    // layout has since outgrown it: "Host a lobby" lands at x=-102, off the left edge, so
    // page.click aimed outside the viewport and silently never issued the request. Every other
    // browser script in scripts/ pins 1280x800; this one was relying on a default it outgrew.
    await page.setViewport({ width: 1280, height: 800 });
    const fixture = await installContentFixture(page);
    seatFixtures.push(fixture);
    await page.setCookie({
      url: BASE,
      name: '__Host-chess-tactics-access',
      value: session,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
    const installedCookies = await page.cookies(BASE);
    assert(
      installedCookies.some((cookie) => (
        cookie.name === '__Host-chess-tactics-access' && cookie.value === session
      )),
      'Chromium rejected the host-only OIDC access cookie on the E2E origin',
    );
    await page.goto(`${BASE}/lobbies`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const currentUser = await page.evaluate(async () => {
      const response = await fetch('/api/auth/me');
      return response.json();
    });
    assert(
      currentUser?.email,
      `OIDC access cookie did not establish an E2E session: ${JSON.stringify(currentUser)}`,
    );
    // Signed-in state renders the "Host a lobby" toolbar; wait for it (not the sign-in gate).
    try {
      await page.waitForSelector('[data-testid=host-lobby]', { timeout: 10000 });
      // Present is not the same as clickable. The scene director holds the incoming region inert
      // behind `.scene-boundary` until the transition settles, so a click issued while the phase
      // is still `entering` is swallowed with no request and no error — the lobby simply never
      // appears. Wait for the settled phase, as every other browser script here does.
      await page.waitForFunction(
        () => document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'
          && !document.querySelector('[data-testid=host-lobby]')?.closest('[inert]'),
        { timeout: 15000 },
      );
    } catch (error) {
      const bodyText = await page.$eval('body', (body) => body.innerText.slice(0, 1200));
      throw new Error([
        error.message,
        '--- page text ---', bodyText,
        '--- browser console ---', fixture.consoleErrors.slice(0, 10).join('\n') || '(none)',
        '--- failed reads ---', fixture.failedResponses.slice(0, 20).join('\n') || '(none)',
      ].join('\n'));
    }
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
  // The title-bar chips are gated on `playableSurfaceReady` (board AND hud surfaces), which
  // settles strictly after the board stops reporting is-board-loading. Reading them straight off
  // the board wait above races that second gate and fails on a chip that is about to be correct.
  await Promise.all([
    hostPage.waitForSelector('.skirmish-objective small', { timeout: 20000 }),
    guestPage.waitForSelector('.skirmish-objective small', { timeout: 20000 }),
  ]);
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
  // KNOWN FAILURE — this suite currently stops here, reaching PASS 4/6. Everything above is
  // restored and green; the coordinates below no longer describe the board this fixture level
  // actually reaches, so selecting (5,3) never lands on a piece. The board is canvas-drawn and the
  // production bundle exposes no store import, so the true post-relay position cannot be read out
  // of the DOM — deciding what these two moves SHOULD assert is a gameplay judgement, not a
  // mechanical repair. Do not wire this suite into a blocking CI job until it is settled.
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
    // Print the stack, not just the message: a bare "Waiting failed: 10000ms exceeded" from any of
    // the dozen waits in this suite names neither the step nor the seat it stalled on.
    console.error('\nlobby-e2e FAILED:', err.stack || err.message);
    for (const [index, fixture] of seatFixtures.entries()) {
      const console_ = fixture.consoleErrors.slice(0, 8).join('\n') || '(none)';
      const reads = fixture.failedResponses.slice(0, 15).join('\n') || '(none)';
      console.error(`--- seat ${index} console ---\n${console_}\n--- seat ${index} failed reads ---\n${reads}`);
    }
    if (backendLog) console.error('--- backend log ---\n' + backendLog.slice(-2000));
    await cleanup();
    process.exit(1);
  });
