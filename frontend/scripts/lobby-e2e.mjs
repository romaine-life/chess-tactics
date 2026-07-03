#!/usr/bin/env node
// Headless two-browser end-to-end test for multiplayer lobbies — the SCRIPTED version of
// the manual "two humans, two browsers" check that nobody ran before this shipped.
//
// It drives two isolated browser contexts (host + guest) against a REAL backend that serves
// the built frontend, with a tiny mock auth server standing in for auth.romaine.life
// (better-auth.session=abc -> player, =rival -> rival). It proves the exact reported bug is
// fixed end to end, through real EventSource streams and real DOM:
//   1. HOST SEES GUEST JOIN LIVE — after the guest joins, the host's screen fills the guest
//      seat WITHOUT a manual refresh (the original "friend joined but never appeared" bug).
//   2. GUEST IS EVICTED ON CLOSE — when the host leaves, the guest's lobby card disappears
//      (they don't sit forever on a dead lobby).
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
import { existsSync } from 'node:fs';
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
    await page.setCookie({ url: BASE, name: 'better-auth.session', value: session, path: '/' });
    await page.goto(`${BASE}/lobbies`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Signed-in state renders the "Host a lobby" toolbar; wait for it (not the sign-in gate).
    await page.waitForSelector('[data-testid=host-lobby]', { timeout: 10000 });
    return page;
  };

  const hostPage = await openSeat('abc');
  const guestPage = await openSeat('rival');

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
  console.log('PASS 1/2: host saw the guest join live (no refresh).');

  // Eviction: the host leaves; the guest's lobby card must disappear (not strand them).
  await hostPage.evaluate(() => {
    const btn = document.querySelector('.utility-lobby-card.is-current button.utility-button-danger');
    btn.click();
  });
  await guestPage.waitForFunction(
    () => !document.querySelector('.utility-lobby-card.is-current'),
    { timeout: 8000 },
  );
  console.log('PASS 2/2: guest was evicted when the host closed the lobby.');

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
