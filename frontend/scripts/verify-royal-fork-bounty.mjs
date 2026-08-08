#!/usr/bin/env node
// Live gate for the royal fork bounty (ADR-0527): plays a REAL fork with real hit-tested
// clicks on a real Run Battle and reads what the player would see — the gold measure moving,
// the Battle log line, and the marker seated over the forking square.
//
// Why a live gate and not only unit tests: the geometry is pinned in core/rules.test.ts and
// the payment in run/model.test.ts, but the two are joined inside the Run's committed-board
// transform. Nothing below the browser proves that a move a player makes reaches it. A
// transform that is never installed, or one that reads the board before the move commits,
// passes every unit test and pays nothing on the board.
//
// It finds the fork itself rather than replaying an authored move list: it asks the live
// rules for every legal player move, applies each to a scratch board, and takes the first one
// `royalForkVictim` calls a fork. So it keeps working when placement or seeds change, and it
// does not care WHICH piece forks — a Queen fork proves the rule as well as a Knight's.
//
// It does not play toward a fork. The position it is given must already offer one, and it
// says so plainly when it does not; a gate that manoeuvred for several plies would be at the
// mercy of the enemy's play, which is how a verification run turns into a timeout with no
// verdict.
//
// Usage: npm run verify:royal-fork -- <craft-url>
//   e.g. a /run/craft/<id> link crafted onto Battle 3 with an army of one Queen, where the
//   Queen's first move forks the enemy King and Queen.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!url) { console.error('usage: npm run verify:royal-fork -- <craft-url>'); process.exit(2); }
const shotPath = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'tmp-shots/royal-fork.png';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });
const browserProfile = mkdtempSync(join(tmpdir(), 'ct-royal-fork-'));

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: browserProfile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const done = async (code) => {
  try { await browser.close(); } catch { /* already gone */ }
  try { rmSync(browserProfile, { recursive: true, force: true }); } catch { /* the profile outlives us harmlessly */ }
  process.exit(code);
};
const fail = async (step, extra) => {
  console.error(`FAIL at ${step}${extra ? ' — ' + extra : ''}`);
  await done(1);
};

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.setDefaultTimeout(45_000);
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));

// Everything the gate asks is answered inside the app, so the rules, the board and the Run
// document are the live ones rather than a copy free to drift from them.
const HELPERS = `
  const rules = await import('/src/core/rules.ts');
  const model = await import('/src/run/model.ts');
  const boards = await import('/src/game/SkirmishStoreContext.tsx');
  const runs = await import('/src/run/store.ts');
  const live = boards.activeSkirmishStoreForDiagnostics()?.getState() ?? null;
  const run = runs.useActiveRun.getState().run;
  const bar = model.RUN_ROYAL_FORK_MIN_VICTIM_VALUE;
`;
const ask = (body) => page.evaluate(new Function(`return (async () => { ${HELPERS} ${body} })()`));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Wait on the DOM alone first. Reaching for an app module before the boot has hydrated the
  // drawable catalog evaluates its graph too early, the catalog reader throws, and the module
  // record stays rejected for the life of the page — so every later import fails with a
  // hydration error that has nothing to do with what is being verified.
  try {
    await page.waitForSelector('button.skirmish-board-cell-hit', { timeout: 90_000 });
    await page.waitForFunction(
      () => document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current',
      { timeout: 60_000 },
    );
  } catch { await fail('boot', 'the craft link never rendered a Battle board'); }
  try {
    await page.waitForFunction(async () => {
      const boards = await import('/src/game/SkirmishStoreContext.tsx');
      const s = boards.activeSkirmishStoreForDiagnostics()?.getState();
      return !!s && s.started && !s.game.winner && s.game.turn === 'player';
    }, { timeout: 90_000 });
  } catch {
    const why = await ask(`
      return JSON.stringify({
        address: location.pathname + location.search,
        run: run ? { phase: run.phase, battle: run.battleIndex + 1 } : null,
        board: live ? { started: live.started, turn: live.game.turn, winner: live.game.winner } : 'no live board store',
      });
    `).catch((error) => `diagnostics unavailable: ${error.message}`);
    await fail('battle', `the craft link never reached a live Battle with the player to move — ${why}`);
  }

  const plan = await ask(`
    const size = live.game.size;
    for (const piece of live.game.pieces.filter((p) => p.side === 'player' && p.alive)) {
      for (const move of rules.legalMoves(piece, live.game.pieces, size, live.env)) {
        const after = rules.applyMove(live.game, piece.id, move);
        const mover = after.state.pieces.find((p) => p.id === piece.id);
        if (!mover || !mover.alive) continue;
        const victim = rules.royalForkVictim(mover, after.state.pieces, size, rules.gameEnv(after.state), bar);
        if (!victim) continue;
        return {
          pieceId: piece.id, type: piece.type,
          from: { x: piece.x, y: piece.y }, to: { x: mover.x, y: mover.y },
          victim: victim.type + '@' + victim.x + ',' + victim.y,
          gold: run.goldTenths,
        };
      }
    }
    return { none: live.game.pieces.filter((p) => p.alive).map((p) => p.side[0] + ':' + p.type + '@' + p.x + ',' + p.y) };
  `);
  if (plan.none) await fail('position', `no royal fork is available here — craft one that offers a fork in one (board: ${plan.none.join(' ')})`);
  console.log(`${plan.type} ${plan.from.x},${plan.from.y} → ${plan.to.x},${plan.to.y} forks the King and ${plan.victim}`);

  const tileCenter = (cell) => page.evaluate(({ x, y }) => {
    const button = document.querySelector(`button.skirmish-board-cell-hit[data-cx="${x}"][data-cy="${y}"]`);
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, cell);

  // Real hit-tested clicks: select the unit, then commit onto the forking square.
  const from = await tileCenter(plan.from);
  const to = await tileCenter(plan.to);
  if (!from || !to) await fail('tiles', `board cells ${JSON.stringify(plan.from)}→${JSON.stringify(plan.to)} are not on screen`);
  await page.mouse.click(from.x, from.y);
  try {
    await page.waitForFunction((id) => import('/src/game/SkirmishStoreContext.tsx')
      .then((m) => m.activeSkirmishStoreForDiagnostics()?.getState().selectedId === id), { timeout: 10_000 }, plan.pieceId);
  } catch { await fail('select', 'clicking the unit tile did not select it — board clicks are being swallowed'); }
  await page.mouse.click(to.x, to.y);
  try {
    await page.waitForFunction(({ pieceId, cell }) => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
      const piece = m.activeSkirmishStoreForDiagnostics()?.getState().game.pieces.find((p) => p.id === pieceId);
      return !!piece && piece.x === cell.x && piece.y === cell.y;
    }), { timeout: 15_000 }, { pieceId: plan.pieceId, cell: plan.to });
  } catch { await fail('move', `the click on ${JSON.stringify(plan.to)} did not commit the ${plan.type}'s move`); }

  // The three things the player is owed for it, all read off the live app. The marker is
  // read first — it retires once its rise has played out, and the gate must not race it.
  const paid = await ask(`
    return {
      gold: run.goldTenths,
      bounty: model.RUN_ROYAL_FORK_BOUNTY_TENTHS,
      notices: live.goldNotices.map((n) => ({ at: n.at, goldTenths: n.goldTenths })),
      log: live.log.map((entry) => entry.text ?? entry.note ?? JSON.stringify(entry)).filter((line) => /fork/i.test(line)),
      // The move in the game's own notation, so a passing run names the move that earned it.
      tail: live.log.slice(-4).map((entry) => entry.text ?? entry.note ?? JSON.stringify(entry)),
    };
  `);
  const delta = paid.gold - plan.gold;
  if (delta !== paid.bounty) {
    await fail('gold', `the fork moved gold by ${delta / 10} instead of ${paid.bounty / 10} (${plan.gold / 10} → ${paid.gold / 10})`);
  }
  if (!paid.log.length) await fail('log', 'the Battle log never said a fork had been paid for');
  const seated = paid.notices.find((notice) => notice.goldTenths === paid.bounty);
  if (!seated) await fail('marker', `no gold marker was seated for it (notices: ${JSON.stringify(paid.notices)})`);
  if (seated.at.x !== plan.to.x || seated.at.y !== plan.to.y) {
    await fail('marker', `the marker sits at ${JSON.stringify(seated.at)}, not on the forking unit's square ${JSON.stringify(plan.to)}`);
  }

  const board = await page.$('.skirmish-board-viewport') ?? await page.$('.skirmish-board');
  await (board ?? page).screenshot({ path: shotPath });

  console.log(`gold ${plan.gold / 10} → ${paid.gold / 10} (+${paid.bounty / 10})`);
  console.log(`log: ${paid.tail.join(' | ')}`);
  console.log(`marker seated at ${seated.at.x},${seated.at.y}`);
  console.log(`PASS — royal fork bounty paid on the live board (${shotPath})`);
  await done(0);
} catch (error) {
  console.error(`FAIL — ${error.message}`);
  await done(1);
}
