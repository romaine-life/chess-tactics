#!/usr/bin/env node
// Live-input E2E for the Run battle loop: proves an anonymous player can actually
// PLAY with real hit-tested mouse clicks (the unit tests exercise stores and rules,
// not the pointer path — an invisible overlay shielding the board passes every unit
// test while making the game unplayable; see the strategikon-slot regression, #552).
//
// Drives a FRESH anonymous profile end-to-end: start run → take draft → begin battle
// → click a unit's tile → click a legal destination → assert the move commits, the
// enemy replies, and the open Strategikon still takes the pointer. Fails loudly at
// the exact step where a click is swallowed.
//
// Usage: npm run e2e:run-battle -- <base-url>   (needs a live dev server; anonymous
// runs live in the browser profile, so every invocation starts clean)

import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.argv[2];
if (!base) { console.error('usage: npm run e2e:run-battle -- <base-url>'); process.exit(2); }

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars'],
});

const fail = async (step, extra) => {
  console.error(`FAIL at ${step}${extra ? ' — ' + extra : ''}`);
  try { await browser.close(); } catch { /* already gone */ }
  process.exit(1);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.setDefaultTimeout(30_000);

  await page.goto(`${base}/play/select/run`, { waitUntil: 'domcontentloaded' });

  // App booted: the pre-React bootstrap face is gone and the picker is interactive.
  await page.waitForFunction(() => !document.getElementById('app-bootstrap-status'));

  const runPhase = () => page.evaluate(
    () => import('/src/run/store.ts').then((m) => m.useActiveRun.getState().run?.phase ?? null),
  );

  // Click a button by exact visible label via REAL mouse coordinates (hit-tested).
  // Waits until the button exists, has geometry, and is not inside an inert subtree
  // (scene transitions mark preparing regions inert — clicks there are void by design).
  const clickButton = async (label) => {
    try {
      await page.waitForFunction((text) => {
        const btn = [...document.querySelectorAll('button')]
          .find((b) => (b.textContent || '').trim() === text && b.getBoundingClientRect().width > 0);
        return !!btn && !btn.closest('[inert]');
      }, { timeout: 15_000 }, label);
    } catch {
      return false;
    }
    const point = await page.evaluate((text) => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').trim() === text && b.getBoundingClientRect().width > 0 && !b.closest('[inert]'));
      if (!btn) return null;
      btn.scrollIntoView({ block: 'nearest' });
      // Aim like a user: pick a sample point inside the button that ACTUALLY hit-tests
      // to it (an unrelated element may overlap its geometric center).
      const r = btn.getBoundingClientRect();
      const samples = [[0.5, 0.5], [0.5, 0.25], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5], [0.15, 0.15], [0.85, 0.85]];
      for (const [fx, fy] of samples) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && (top === btn || btn.contains(top))) return { x, y };
      }
      return null;
    }, label);
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    return true;
  };

  const waitPhase = async (phase, step) => {
    try {
      await page.waitForFunction(
        (want) => import('/src/run/store.ts').then((m) => (m.useActiveRun.getState().run?.phase ?? null) === want),
        { timeout: 15_000 },
        phase,
      );
    } catch {
      await fail(step, `run phase never became "${phase}" (now "${await runPhase()}")`);
    }
  };

  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Start Run'));
  if (!await clickButton('Start Run')) await fail('start-run', 'button not found');
  await waitPhase('draft', 'start-run');

  if (!await clickButton('Take')) await fail('draft-take', 'button not found');
  await waitPhase('deployment', 'draft-take');

  if (!await clickButton('Begin Battle')) await fail('begin-battle', 'button not found');
  await waitPhase('battle', 'begin-battle');

  // Board revealed and composed (no is-board-loading), tile hit buttons live.
  await page.waitForFunction(() => {
    const lab = document.querySelector('.skirmish-board-lab');
    return lab && !lab.classList.contains('is-board-loading')
      && document.querySelectorAll('button.skirmish-board-cell-hit').length > 0;
  });

  // Pick a real legal move from the live store.
  const plan = await page.evaluate(async () => {
    const g = await import('/src/game/store.ts');
    const r = await import('/src/core/rules.ts');
    const s = g.useSkirmish.getState();
    for (const p of s.game.pieces.filter((q) => q.side === 'player' && q.alive)) {
      const moves = r.legalMoves(p, s.game.pieces, s.game.size, s.env);
      if (moves.length) return { pieceId: p.id, type: p.type, from: { x: p.x, y: p.y }, to: { x: moves[0].x, y: moves[0].y } };
    }
    return null;
  });
  if (!plan) await fail('plan', 'no player piece has a legal move');
  console.log('planned move:', JSON.stringify(plan));

  const tileCenter = (cell) => page.evaluate(({ x, y }) => {
    const btn = document.querySelector(`button.skirmish-board-cell-hit[data-cx="${x}"][data-cy="${y}"]`);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, cell);

  // Select the piece by clicking its tile — the click must REACH the tile.
  const fromPoint = await tileCenter(plan.from);
  if (!fromPoint) await fail('select', 'source tile button missing');
  await page.mouse.click(fromPoint.x, fromPoint.y);
  try {
    await page.waitForFunction(
      (id) => import('/src/game/store.ts').then((m) => m.useSkirmish.getState().selectedId === id),
      { timeout: 5_000 },
      plan.pieceId,
    );
  } catch {
    await fail('select', `clicking the unit tile did not select it — board clicks are still shielded`);
  }
  console.log('selection by real click: OK');

  // Commit the move by clicking the destination tile.
  const toPoint = await tileCenter(plan.to);
  if (!toPoint) await fail('move', 'destination tile button missing');
  await page.mouse.click(toPoint.x, toPoint.y);
  try {
    await page.waitForFunction(
      ({ pieceId, to }) => import('/src/game/store.ts').then((m) => {
        const s = m.useSkirmish.getState();
        const p = s.game.pieces.find((q) => q.id === pieceId);
        return p && p.x === to.x && p.y === to.y;
      }),
      { timeout: 5_000 },
      plan,
    );
  } catch {
    await fail('move', 'clicking a legal destination did not commit the move');
  }
  console.log('move committed by real click: OK');

  // The enemy answers and the turn returns — the full loop is alive.
  try {
    await page.waitForFunction(
      () => import('/src/game/store.ts').then((m) => {
        const s = m.useSkirmish.getState();
        return s.game.turn === 'player' && !s.game.winner;
      }),
      { timeout: 15_000 },
    );
  } catch {
    await fail('enemy-reply', 'turn never returned to the player');
  }
  console.log('enemy replied, turn returned: OK');

  const shot = 'tmp-shots/run-battle-e2e.png';
  const board = await page.$('.skirmish-war-room');
  if (board) await board.screenshot({ path: shot });
  console.log('screenshot:', shot);

  // The open Strategikon must still take the pointer (its slot re-enables it).
  const toggle = await page.$('[data-testid="strategikon-toggle"]');
  if (!toggle) await fail('strategikon-open', 'toggle not present in Controls');
  const toggleBox = await toggle.boundingBox();
  await page.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
  try {
    await page.waitForSelector('[data-testid="strategikon"]', { timeout: 10_000 });
  } catch {
    await fail('strategikon-open', 'workspace did not mount after a real toggle click');
  }
  const railHit = await page.evaluate(() => {
    const btn = document.querySelector('.strategikon-rail button');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { reachable: btn === top || btn.contains(top) || (top !== null && btn.closest('.strategikon-workspace') === top.closest('.strategikon-workspace') && top.closest('.strategikon-workspace') !== null) };
  });
  if (!railHit?.reachable) await fail('strategikon-open', 'open workspace does not receive the pointer');
  console.log('open Strategikon takes the pointer: OK');

  console.log('PASS — anonymous Run battle is fully playable with real clicks');
  await browser.close();
} catch (error) {
  console.error('FAIL (unexpected):', error);
  try { await browser.close(); } catch { /* already gone */ }
  process.exit(1);
}
