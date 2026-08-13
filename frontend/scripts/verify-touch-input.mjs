#!/usr/bin/env node
// Live gate for the board's TOUCH input, driven with real touch points on a device-emulated
// Chrome. Nothing else in the repo exercises these: verify-board-selection and
// verify-premove-cancel drive a mouse, and verify-mobile measures DOM geometry. A gesture is
// exactly the class of thing that reads correctly in the source and does nothing on glass, so
// it is asserted here against what the board actually paints and what the camera actually does.
//
// What it proves, on one battle:
//   1. a pinch OUT zooms the camera in, and a pinch IN zooms it back out
//   2. a one-finger drag pans the camera
//   3. a tap still selects a piece (the long-press below must not eat an ordinary tap)
//   4. a long press takes back a queued premove — the secondary press a touch device has no
//      button for (ADR-0128/ADR-0550)
//
// Order matters: the pinch runs first because a battle opens fitted to its board with the pan
// pinned, so a drag on a camera that cannot move proves nothing. The pinch is what earns the
// room the drag then uses — and if the pinch is broken the drag assertion says so honestly
// rather than passing on a no-op.
//
// Usage: npm run verify:touch -- '<battle-url>'
//   e.g. npm run verify:touch -- '<url>/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
if (!url) {
  console.error("usage: npm run verify:touch -- '<battle-url>'");
  process.exit(2);
}

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found. Checked:\n' + CHROMES.join('\n')); process.exit(1); }

// A cold dev server compiles the whole board module graph on the first battle load.
const TIMEOUT = 150_000;
// Must clear ViewPane's LONG_PRESS_MS (500) with room for scheduling jitter.
const LONG_PRESS_HOLD = 900;
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), 'ct-touch-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const failures = [];
const passes = [];
const check = (ok, label) => (ok ? passes : failures).push(label);

try {
  const page = await browser.newPage();
  // A real phone: touch points, coarse pointer, mobile UA. Landscape, which is where a board
  // gets the most room.
  await page.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36');

  const target = new URL(url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.hostname.endsWith('.localhost')) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }).catch(() => {});
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(() => {
    const board = document.querySelector('[data-testid="skirmish-board"]');
    return board
      && board.getAttribute('data-interactive') === 'true'
      && !board.classList.contains('is-board-loading')
      && board.getAttribute('data-arriving') !== 'true'
      && document.querySelectorAll('.skirmish-board-cell-hit').length > 0;
  }, { timeout: TIMEOUT });
  await settle(1_500);

  // The camera as the board actually renders it — the same inline custom properties the pane
  // writes, so this reads the committed transform rather than any internal state.
  const readCamera = () => page.evaluate(() => {
    const layer = document.querySelector('[data-testid="skirmish-board"] .tileset-view-art-layer');
    return {
      zoom: layer?.style.getPropertyValue('--view-zoom') ?? '',
      panX: layer?.style.getPropertyValue('--view-pan-x') ?? '',
      panY: layer?.style.getPropertyValue('--view-pan-y') ?? '',
    };
  });
  const boardCentre = () => page.evaluate(() => {
    const rect = document.querySelector('[data-testid="skirmish-board"]').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const painted = (selector) => page.evaluate(
    (css) => [...document.querySelectorAll(css)].map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`),
    selector,
  );

  const centre = await boardCentre();

  /** A two-finger pinch: both fingers travel `spread` px along x, symmetrically about centre. */
  const pinch = async (fromGap, toGap, steps = 12) => {
    const y = centre.y;
    const left = await page.touchscreen.touchStart(centre.x - fromGap / 2, y);
    const right = await page.touchscreen.touchStart(centre.x + fromGap / 2, y);
    for (let step = 1; step <= steps; step += 1) {
      const gap = fromGap + ((toGap - fromGap) * step) / steps;
      await left.move(centre.x - gap / 2, y);
      await right.move(centre.x + gap / 2, y);
      await settle(16);
    }
    await left.end();
    await right.end();
    await settle(250);
  };

  // ── 1. Pinch ───────────────────────────────────────────────────────────────────────────
  const beforePinchOut = await readCamera();
  await pinch(80, 320);
  const afterPinchOut = await readCamera();
  const zoomedIn = Number(afterPinchOut.zoom) > Number(beforePinchOut.zoom);
  check(zoomedIn, `a pinch out zooms the camera in (${beforePinchOut.zoom} → ${afterPinchOut.zoom})`);

  await pinch(320, 80);
  const afterPinchIn = await readCamera();
  check(
    Number(afterPinchIn.zoom) < Number(afterPinchOut.zoom),
    `a pinch in zooms the camera back out (${afterPinchOut.zoom} → ${afterPinchIn.zoom})`,
  );

  // ── 2. Two-finger drag pans; one finger does NOT ───────────────────────────────────────
  // Two fingers own the camera because the board's cells legitimately own the primary press:
  // a one-finger pan would fight selecting and dragging a piece for the same gesture. So the
  // gate asserts BOTH halves — the camera moves for two fingers, and stays put for one.
  // Zoom in far enough that the art overflows the window and the pan is genuinely free; a
  // fitted board pins the camera and a drag there cannot be told from a no-op.
  for (let attempt = 0; attempt < 4; attempt += 1) await pinch(80, 320);

  /** Drag both fingers together, keeping their gap constant so it reads as a pan, not a pinch. */
  const twoFingerDrag = async (dx, dy) => {
    const gap = 120;
    const left = await page.touchscreen.touchStart(centre.x - gap / 2, centre.y);
    const right = await page.touchscreen.touchStart(centre.x + gap / 2, centre.y);
    for (let step = 1; step <= 10; step += 1) {
      const ox = (dx * step) / 10;
      const oy = (dy * step) / 10;
      await left.move(centre.x - gap / 2 + ox, centre.y + oy);
      await right.move(centre.x + gap / 2 + ox, centre.y + oy);
      await settle(16);
    }
    await left.end();
    await right.end();
    await settle(250);
  };

  let panned = false;
  let panReport = '';
  for (const [dx, dy] of [[140, 0], [0, 110], [-140, 0], [0, -110]]) {
    const before = await readCamera();
    await twoFingerDrag(dx, dy);
    const after = await readCamera();
    if (after.panX !== before.panX || after.panY !== before.panY) {
      panned = true;
      panReport = `${before.panX},${before.panY} → ${after.panX},${after.panY}`;
      break;
    }
  }
  check(panned, `a two-finger drag pans the camera (${panReport || 'camera never moved'})`);

  {
    const before = await readCamera();
    const finger = await page.touchscreen.touchStart(centre.x, centre.y);
    for (let step = 1; step <= 10; step += 1) {
      await finger.move(centre.x + (140 * step) / 10, centre.y);
      await settle(16);
    }
    await finger.end();
    await settle(250);
    const after = await readCamera();
    check(
      after.panX === before.panX && after.panY === before.panY,
      'a one-finger drag leaves the camera alone (the board owns that gesture)',
    );
  }

  // ── 3. A tap still selects ─────────────────────────────────────────────────────────────
  // The long press shares the same press as an ordinary tap, so a tap that no longer selects
  // is the regression this guards. Tap friendly units until one is actually reachable on
  // screen — the camera is zoomed in, so many cells are off the viewport.
  const cells = await page.evaluate(() => [...document.querySelectorAll('.skirmish-board-cell-hit')]
    .map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        key: `${cell.dataset.cx},${cell.dataset.cy}`,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        onScreen: rect.left >= 0 && rect.top >= 0
          && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      };
    }));
  const reachable = cells.filter((cell) => cell.onScreen);
  let selectedKey = null;
  for (const cell of reachable) {
    await page.touchscreen.tap(cell.x, cell.y);
    await settle(180);
    const rings = await painted('.skirmish-board-cell-hit.is-selected');
    if (rings.length) { selectedKey = rings[0]; break; }
  }
  check(Boolean(selectedKey), `a tap selects a piece (${selectedKey ?? 'nothing ever selected'})`);

  // ── 4. Long press takes back a queued premove ──────────────────────────────────────────
  const storeState = () => page.evaluate(() => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
    const state = m.activeSkirmishStoreForDiagnostics()?.getState();
    return state
      ? { turn: state.game.turn, queued: state.premoves.length, windowOpen: state.game.turn === 'enemy' || state.premoveInputOpen }
      : null;
  }));
  const tapCell = async (key) => {
    const spot = await page.evaluate((cellKey) => {
      const [cx, cy] = cellKey.split(',');
      const cell = document.querySelector(`.skirmish-board-cell-hit[data-cx="${cx}"][data-cy="${cy}"]`);
      if (!cell) return null;
      const rect = cell.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, key);
    if (!spot) return false;
    await page.touchscreen.tap(spot.x, spot.y);
    await settle(140);
    return true;
  };

  // Zoom back out so the whole board is reachable for the move sequence.
  for (let attempt = 0; attempt < 6; attempt += 1) await pinch(320, 80);

  const allCells = await page.evaluate(() => [...document.querySelectorAll('.skirmish-board-cell-hit')]
    .map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`));

  // Play a real move so the opponent takes the turn — that is the window a premove is queued in.
  let handedOver = false;
  for (const key of allCells) {
    if (!await tapCell(key)) continue;
    const moves = await painted('.skirmish-board-cell-hit.is-move');
    if (!moves.length) continue;
    await tapCell(moves[0]);
    try {
      await page.waitForFunction(
        () => import('/src/game/SkirmishStoreContext.tsx').then((m) => (
          m.activeSkirmishStoreForDiagnostics()?.getState().game.turn === 'enemy'
        )),
        { timeout: 12_000 },
      );
      handedOver = true;
      break;
    } catch { /* try the next piece */ }
  }
  check(handedOver, 'a tapped move is committed and hands the turn to the opponent');

  if (handedOver) {
    // Queue a premove inside the opponent's thinking window.
    let queued = 0;
    for (const key of allCells) {
      const open = await storeState();
      if (!open?.windowOpen) break;
      if (!await tapCell(key)) continue;
      const moves = await painted('.skirmish-board-cell-hit.is-move');
      if (!moves.length) continue;
      await tapCell(moves[0]);
      await settle(120);
      queued = (await storeState())?.queued ?? 0;
      if (queued > 0) break;
    }
    check(queued > 0, `a premove can be queued by tapping (${queued} queued)`);

    if (queued > 0) {
      // The gesture under test: a press held in place, with no travel, on the board.
      const finger = await page.touchscreen.touchStart(centre.x, centre.y);
      await settle(LONG_PRESS_HOLD);
      await finger.end();
      await settle(300);
      const after = await storeState();
      check(
        (after?.queued ?? -1) === 0,
        `a long press takes the premove chain back (${queued} → ${after?.queued ?? '?'})`,
      );
      const chainSquares = (await painted('.skirmish-board-cell-hit.is-premove')).length;
      check(chainSquares === 0, `the painted chain goes with it (${chainSquares} square(s))`);
    }
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

for (const line of passes) console.log(`  ok   ${line}`);
for (const line of failures) console.log(`  FAIL ${line}`);
console.log(`\ntouch input: ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
