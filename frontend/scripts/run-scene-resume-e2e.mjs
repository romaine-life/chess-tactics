#!/usr/bin/env node
// Regression for the Run deployment-thumbnail/live-board split. This uses the
// current active Run read-only and mutates only a disposable headless browser's
// automatic live-game cache; it never starts, advances, or writes the Run.
//
// 1. Load the active Battle and prove its authored Level has scenic coordinates.
// 2. Replace only this disposable profile's auto-reload cache with a clipped board
//    carrying the same Level id and no Run activity identity (the pre-fix shape).
// 3. Hard reload /run and prove the Run Level—not that cache—owns live boardCode,
//    enemy force, activity identity, and the rendered scenic terrain surface.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv[2];
if (!base) { console.error('usage: npm run e2e:run-scene-resume -- <base-url>'); process.exit(2); }

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });
const browserProfile = mkdtempSync(join(tmpdir(), 'ct-run-resume-'));

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: browserProfile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const fail = async (step, extra) => {
  console.error(`FAIL at ${step}${extra ? ` — ${extra}` : ''}`);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.setDefaultTimeout(30_000);
  await page.goto(`${base}/run`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('app-bootstrap-status'));
  await page.waitForFunction(() => {
    const lab = document.querySelector('.skirmish-board-lab');
    return lab && !lab.classList.contains('is-board-loading');
  });

  const poisoned = await page.evaluate(async () => {
    const gameStore = await import('/src/game/SkirmishStoreContext.tsx');
    const runStore = await import('/src/run/store.ts');
    const boardCode = await import('/src/ui/boardCode.ts');
    const run = runStore.useActiveRun.getState().run;
    const state = gameStore.activeSkirmishStoreForDiagnostics()?.getState();
    const level = run?.war.battles[run.battleIndex]?.level;
    if (!run || !state || run.phase !== 'battle' || !level?.boardCode) return null;
    const board = boardCode.decodeBoard(level.boardCode);
    const raw = window.localStorage.getItem('chess-tactics-active-match-v1');
    if (!board || !raw) return null;
    const scenicCount = board.decorativeFootprint.length;
    const cached = JSON.parse(raw);
    cached.game.boardCode = boardCode.encodeBoard({
      ...board,
      decorativeApron: undefined,
      decorativeCells: {},
      decorativeFootprint: [],
      decorativeFeatures: {},
      decorativeFences: {},
      decorativeFencePosts: {},
      decorativeWalls: {},
      floatingArtwork: [],
    });
    delete cached.activityId;
    window.localStorage.setItem('chess-tactics-active-match-v1', JSON.stringify(cached));
    return {
      levelId: level.id,
      boardCode: level.boardCode,
      enemies: level.layers.units.filter((unit) => unit.side === 'enemy').length,
      scenicCount,
      clippedBoardCode: cached.game.boardCode,
      originalActivityId: state.activityId,
    };
  });
  if (!poisoned) await fail('fixture', 'active Battle with authored boardCode or automatic cache unavailable');
  if (poisoned.scenicCount <= 0) await fail('fixture', 'active Battle has no sparse scenic footprint');
  if (poisoned.clippedBoardCode === poisoned.boardCode) await fail('fixture', 'clipped cache did not differ from Run Level');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('app-bootstrap-status'));
  await page.waitForFunction(() => {
    const lab = document.querySelector('.skirmish-board-lab');
    return lab && !lab.classList.contains('is-board-loading');
  });

  const restored = await page.evaluate(async () => {
    const gameStore = await import('/src/game/SkirmishStoreContext.tsx');
    const runStore = await import('/src/run/store.ts');
    const runModel = await import('/src/run/model.ts');
    const run = runStore.useActiveRun.getState().run;
    const state = gameStore.activeSkirmishStoreForDiagnostics()?.getState();
    const level = run?.war.battles[run.battleIndex]?.level;
    const terrainCanvas = document.querySelector('[data-testid="skirmish-board"] .tileset-terrain-layer');
    if (!run || !state || !level) return null;
    return {
      levelId: state.levelId,
      boardCode: state.game.boardCode ?? null,
      expectedBoardCode: level.boardCode ?? null,
      activityId: state.activityId,
      expectedActivityId: runModel.runBattleActivityId(run.id, run.battleIndex),
      enemies: state.game.pieces.filter((piece) => piece.alive && piece.side === 'enemy').length,
      expectedEnemies: level.layers.units.filter((unit) => unit.side === 'enemy').length,
      terrainWidth: terrainCanvas?.getAttribute('width') ?? null,
      terrainHeight: terrainCanvas?.getAttribute('height') ?? null,
    };
  });
  if (!restored) await fail('reload', 'Run Battle failed to restore');
  if (
    restored.levelId !== poisoned.levelId
    || restored.boardCode !== poisoned.boardCode
    || restored.boardCode !== restored.expectedBoardCode
    || restored.activityId !== restored.expectedActivityId
    || restored.enemies !== poisoned.enemies
    || restored.enemies !== restored.expectedEnemies
  ) {
    await fail('authority', JSON.stringify(restored));
  }

  const board = await page.$('.skirmish-war-room');
  if (!board) await fail('screenshot', 'Run board container unavailable');
  const shot = 'tmp-shots/run-scene-resume-e2e.png';
  await board.screenshot({ path: shot });
  console.log('Run Level boardCode survived poisoned automatic cache: OK');
  console.log(`scenic footprint: ${poisoned.scenicCount} cells; live terrain canvas: ${restored.terrainWidth}×${restored.terrainHeight}`);
  console.log(`enemy force: ${restored.enemies}; activity: ${restored.activityId}`);
  console.log(`screenshot: ${shot}`);
  console.log('PASS — hard reload keeps the thumbnail Level authoritative for the live Run board');
  await browser.close();
  rmSync(browserProfile, { recursive: true, force: true });
} catch (error) {
  console.error('FAIL (unexpected):', error);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
}
