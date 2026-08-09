#!/usr/bin/env node
// Live gate for the right click that takes a premove chain back (ADR-0549).
//
// Why this needs REAL pointer events rather than a unit test: the board is wall-to-wall hit
// targets, so the secondary button also pans it (ADR-0128). The ONLY thing separating a
// take-back from a camera move is how far the press travelled before it was released, and that
// distinction lives entirely in a live pointerdown/move/up sequence against `ViewPane`'s
// threshold. Nothing in vitest reproduces it: a jsdom board has no layout to pan, and a source
// guard can only prove the handler is bound, never that a right DRAG leaves the chain alone.
//
// It reads the chain the board actually paints — the queued squares and the chain arrows — so it
// fails on the pixels the player sees rather than on internal state.
//
// Each gesture gets its own premove window, entered by playing a real move and letting the
// opponent think. That window is a couple of seconds wide, so the gate never tries to fit both
// gestures into one, and it re-enters a fresh window rather than reporting a timing miss as a
// verdict.
//
// Usage: npm run verify:premove-cancel -- '<battle-url>'
//   e.g. npm run verify:premove-cancel -- '<url>/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
if (!url) {
  console.error("usage: npm run verify:premove-cancel -- '<battle-url>'");
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

// A freshly started dev server compiles the whole module graph on the first battle load.
const TIMEOUT = 150_000;
const PAN_PX = 120; // well past ViewPane's 4px threshold
const profile = mkdtempSync(join(tmpdir(), 'ct-premove-'));
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
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
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

  /** The chain as the board PAINTS it, beside the turn state that says the window is still open. */
  const readChain = () => page.evaluate(() => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
    const state = m.activeSkirmishStoreForDiagnostics()?.getState();
    const layer = document.querySelector('[data-testid="skirmish-board"] .tileset-view-art-layer');
    return {
      squares: document.querySelectorAll('.skirmish-board-cell-hit.is-premove').length,
      arrows: document.querySelectorAll('.premove-arrow').length,
      queued: state?.premoves.length ?? 0,
      windowOpen: Boolean(state && (state.game.turn === 'enemy' || state.premoveInputOpen)),
      panX: layer?.style.getPropertyValue('--view-pan-x') ?? '',
      panY: layer?.style.getPropertyValue('--view-pan-y') ?? '',
    };
  }));
  const readTurn = () => page.evaluate(() => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
    const state = m.activeSkirmishStoreForDiagnostics()?.getState();
    return state ? { turn: state.game.turn, winner: state.game.winner, queued: state.premoves.length } : null;
  }));
  const cells = await page.evaluate(() => [...document.querySelectorAll('.skirmish-board-cell-hit')]
    .map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`));
  const clickCell = async (key) => {
    const [cx, cy] = key.split(',');
    await page.click(`.skirmish-board-cell-hit[data-cx="${cx}"][data-cy="${cy}"]`);
    await settle(90);
  };
  const painted = (selector) => page.evaluate(
    (css) => [...document.querySelectorAll(css)].map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`),
    selector,
  );
  const boardCentre = async () => {
    const box = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="skirmish-board"]');
      const rect = board.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    return box;
  };

  /** Play a real move so the opponent takes the turn — that is the window a premove is queued in. */
  const handTheTurnOver = async () => {
    for (const key of cells) {
      await clickCell(key);
      const moves = await painted('.skirmish-board-cell-hit.is-move');
      if (!moves.length) continue;
      await clickCell(moves[0]);
      try {
        await page.waitForFunction(
          () => import('/src/game/SkirmishStoreContext.tsx').then((m) => (
            m.activeSkirmishStoreForDiagnostics()?.getState().game.turn === 'enemy'
          )),
          { timeout: 10_000 },
        );
        return true;
      } catch { return false; }
    }
    return false;
  };

  /** Queue one premove by real clicks, and report the chain the board paints for it. */
  const queueOnePremove = async () => {
    for (const key of cells) {
      await clickCell(key);
      const targets = await painted('.skirmish-board-cell-hit.is-premove-target');
      if (!targets.length) continue;
      await clickCell(targets[0]);
      const chain = await readChain();
      if (chain.queued > 0) return chain;
    }
    return null;
  };

  /**
   * One attempt at a gesture inside a fresh premove window. Returns null when the window closed
   * mid-gesture — a timing miss is not a verdict, so the caller re-enters rather than reporting.
   */
  const inAPremoveWindow = async (gesture) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const turn = await readTurn();
      if (turn?.winner) throw new Error('the game ended before the gesture could be driven');
      if (turn?.turn !== 'enemy' && !(await handTheTurnOver())) continue;
      const armed = await queueOnePremove();
      if (!armed || !armed.windowOpen) continue;
      const result = await gesture(armed);
      if (result) return result;
      console.log(`  (the premove window closed mid-gesture; re-entering — attempt ${attempt})`);
    }
    throw new Error('could not hold a premove window open long enough to drive the gesture');
  };

  const centreOfBoard = await boardCentre();
  const rightDrag = async ([dx, dy]) => {
    await page.mouse.move(centreOfBoard.x, centreOfBoard.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(centreOfBoard.x + dx, centreOfBoard.y + dy, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(140);
  };
  const rightClick = async () => {
    await page.mouse.move(centreOfBoard.x, centreOfBoard.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await settle(160);
  };

  // Pre-flight, with nothing queued: give the camera somewhere to go. A battle opens fitted to
  // its board, where the art does not cover the window and the pan is pinned — a drag there is
  // indistinguishable from a no-op, so the whole point of test A would be lost. Zoom in until a
  // right drag genuinely moves the camera, and remember which way had room.
  let panDirection = null;
  {
    const zoomIn = async () => {
      await page.mouse.move(centreOfBoard.x, centreOfBoard.y);
      await page.mouse.wheel({ deltaY: -240 });
      await settle(150);
    };
    for (let step = 0; step < 10 && !panDirection; step += 1) {
      await zoomIn();
      for (const direction of [[PAN_PX, 0], [0, PAN_PX], [-PAN_PX, 0], [0, -PAN_PX]]) {
        const before = await readChain();
        await rightDrag(direction);
        const after = await readChain();
        if (after.panX !== before.panX || after.panY !== before.panY) { panDirection = direction; break; }
      }
    }
    check(Boolean(panDirection), `zooming in gives the camera room to pan (${JSON.stringify(panDirection)})`);
    if (!panDirection) throw new Error('the camera never became pannable, so a right drag cannot be told from a no-op');
  }

  // A. A right DRAG is navigation. The chain must survive it, and the camera must really move.
  //    Start with the direction opposite the one that just worked, which is guaranteed room.
  const reverse = [-panDirection[0], -panDirection[1]];
  await inAPremoveWindow(async (armed) => {
    check(armed.squares > 0 && armed.arrows > 0,
      `a queued premove paints its chain (${armed.squares} square(s), ${armed.arrows} arrow(s))`);
    let after = armed;
    for (const direction of [reverse, panDirection]) {
      await rightDrag(direction);
      after = await readChain();
      if (after.panX !== armed.panX || after.panY !== armed.panY) break;
    }
    if (!after.windowOpen && !after.queued) return null; // the window closed, not a verdict
    check(after.panX !== armed.panX || after.panY !== armed.panY,
      `a right drag pans the camera (${armed.panX},${armed.panY} → ${after.panX},${after.panY})`);
    check(after.queued === armed.queued && after.squares === armed.squares && after.arrows > 0,
      `the chain survives the pan (${after.queued} queued, ${after.squares} square(s), ${after.arrows} arrow(s))`);
    return after;
  });

  // Put the board back down before the next window, so a chain queued for the drag test never
  // fires and plays a move the gate did not intend.
  await page.keyboard.press('Escape');
  await settle(160);

  // B. The gesture under test: a right press that releases where it started takes the chain back.
  await inAPremoveWindow(async (armed) => {
    await rightClick();
    const after = await readChain();
    if (!after.windowOpen && after.queued === armed.queued) return null; // window closed first
    check(after.queued === 0, `a right click takes the chain back (${armed.queued} queued → ${after.queued})`);
    check(after.squares === 0 && after.arrows === 0,
      `the painted chain goes with it (${after.squares} square(s), ${after.arrows} arrow(s))`);
    check(after.panX === armed.panX && after.panY === armed.panY,
      `it does not move the camera (${after.panX},${after.panY})`);
    return after;
  });

  // C. It is not an event on a board with nothing queued: no chain to take back, and no move.
  const quiet = await readChain();
  const beforeQuiet = await readTurn();
  await rightClick();
  const afterQuiet = await readTurn();
  check(afterQuiet?.turn === beforeQuiet?.turn && !afterQuiet?.winner && (await readChain()).panX === quiet.panX,
    `a right click with nothing queued changes nothing (turn ${beforeQuiet?.turn} → ${afterQuiet?.turn})`);

  for (const label of passes) console.log(`  ok   ${label}`);
  for (const label of failures) console.log(`  FAIL ${label}`);
  console.log(`\npremove cancel: ${passes.length} passed, ${failures.length} failed`);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

process.exit(failures.length ? 1 : 0);
