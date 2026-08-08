#!/usr/bin/env node
// Live gate for the battle board's click-to-select/click-again-to-deselect gesture.
//
// Why this needs REAL pointer events rather than a unit test: the cell's pointerdown handler
// selects the piece under the press so the ring shows during a drag pickup. The click that
// follows therefore always observes a selected piece — so a deselect implemented against the
// live store selection deselects on the FIRST tap and the board becomes completely
// unselectable by click. Nothing but a real press→click sequence reproduces that; the gate
// asserts a fresh first click still selects (B) alongside the second-click cancel (A).
//
// It reads the classes the board actually paints — the selection ring and the move
// highlights — so it fails on the pixels the player sees, not on internal state.
//
// Every probe click happens on a cell that is NOT a legal destination of the current
// selection, so the gate can never commit a move on the level it is driving.
//
// Usage: npm run verify:board-selection -- '<battle-url>'
//   e.g. npm run verify:board-selection -- '<url>/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
if (!url) {
  console.error("usage: npm run verify:board-selection -- '<battle-url>'");
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

const TIMEOUT = 60_000;
const profile = mkdtempSync(join(tmpdir(), 'ct-boardsel-'));
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
  // Let the arrival settle so the first probe click lands on a board that accepts input.
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  /** What the board paints: which cell wears the ring, and how many destinations glow. */
  const readBoard = () => page.evaluate(() => ({
    selected: [...document.querySelectorAll('.skirmish-board-cell-hit.is-selected')]
      .map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`),
    moves: document.querySelectorAll('.skirmish-board-cell-hit.is-move').length,
  }));
  const cells = await page.evaluate(() => [...document.querySelectorAll('.skirmish-board-cell-hit')]
    .map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`));
  const clickCell = async (key) => {
    const [cx, cy] = key.split(',');
    await page.click(`.skirmish-board-cell-hit[data-cx="${cx}"][data-cy="${cy}"]`);
    await new Promise((resolve) => setTimeout(resolve, 160));
  };
  // 'r' is the HUD's Deselect all shortcut — clearing by key never risks a board move.
  const deselectAll = async () => {
    await page.keyboard.press('r');
    await new Promise((resolve) => setTimeout(resolve, 160));
  };

  // Find a unit this seat commands. With nothing selected a click can only select, focus an
  // opponent, or clear, so the search itself cannot move a piece.
  await deselectAll();
  let unit = null;
  for (const key of cells) {
    await clickCell(key);
    const { selected } = await readBoard();
    if (selected.length) { unit = selected[0]; break; }
  }
  if (!unit) throw new Error('found no friendly unit to click on this board');

  let board = await readBoard();
  check(board.selected.includes(unit), `first click selects ${unit}`);
  const armedMoves = board.moves;
  check(armedMoves > 0, `selecting ${unit} lights its destinations (${armedMoves})`);

  // A. The gesture under test: click the selected unit again to put it down.
  await clickCell(unit);
  board = await readBoard();
  check(board.selected.length === 0, `second click on ${unit} drops the selection ring (saw ${JSON.stringify(board.selected)})`);
  check(board.moves === 0, `second click clears the move highlights (saw ${board.moves})`);

  // B. Regression: a press selects before its click resolves, so a fresh first click must
  //    still SELECT. If this fails the board cannot be selected by clicking at all.
  await clickCell(unit);
  board = await readBoard();
  check(board.selected.includes(unit), `a fresh click picks ${unit} back up (saw ${JSON.stringify(board.selected)})`);
  check(board.moves === armedMoves, `its destinations come back (${board.moves} of ${armedMoves})`);

  // C. It toggles every time, not once.
  await clickCell(unit);
  check((await readBoard()).selected.length === 0, 'the toggle repeats: down');
  await clickCell(unit);
  check((await readBoard()).selected.includes(unit), 'the toggle repeats: up');

  // D. A different friendly unit is still a hand-off, never a cancel.
  const destinations = await page.evaluate(() => [...document.querySelectorAll('.skirmish-board-cell-hit.is-move')]
    .map((cell) => `${cell.dataset.cx},${cell.dataset.cy}`));
  let handedTo = null;
  for (const key of cells) {
    if (key === unit || destinations.includes(key)) continue;
    await clickCell(key);
    const after = await readBoard();
    if (after.selected.length && !after.selected.includes(unit)) { handedTo = after.selected[0]; break; }
    if (after.selected.length === 0) await clickCell(unit); // an empty tile cleared it — pick it back up
  }
  check(Boolean(handedTo), `clicking a different friendly unit hands the selection over (${handedTo})`);

  for (const label of passes) console.log(`  ok   ${label}`);
  for (const label of failures) console.log(`  FAIL ${label}`);
  console.log(`\nboard selection: ${passes.length} passed, ${failures.length} failed`);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

process.exit(failures.length ? 1 : 0);
