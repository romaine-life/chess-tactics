#!/usr/bin/env node
// Live gate for Manubiae (ADR-0540): plays a REAL earning move with real hit-tested clicks on
// a real Run Battle and reads what the player would see — the gold measure moving by exactly
// the catalog price, the Battle log naming the deed, and a marker seated on the square.
//
// Why a live gate and not only unit tests: the geometry is pinned in core/rules.test.ts, the
// prices in run/model.test.ts, and what a board earns in run/manubiae.test.ts — but the three
// are joined inside the Run's committed-board transform. Nothing below the browser proves that
// a move a player makes reaches it. A transform that is never installed, or one that reads the
// board before the move commits, passes every unit test and pays nothing on the board.
//
// It plans with the SAME `manubiaeEarnedBy` the Battle screen pays from, so the gate cannot be
// satisfied by a reader the screen does not use — it asks the live module for every legal
// player move, applies each to a scratch board, and takes the first that earns anything. So it
// keeps working when placement or seeds change, and it does not care WHICH Manubium the
// position offers: an advantageous capture proves the path as well as a smothered mate.
//
// It does not play toward a deed. The position it is given must already offer one in a single
// move, and it says so plainly when it does not; a gate that manoeuvred for several plies would
// be at the mercy of the enemy's reply, which is how a verification run turns into a timeout
// with no verdict.
//
// Usage: npm run verify:manubiae -- <craft-url> [--want <manubium-id>]
//   e.g. a /run/craft/<id> link crafted onto a Battle whose opening position offers a capture
//   worth more than the unit that takes it.
//
// `--want` narrows the search to one entry — `advantageous-capture`, `knight-fork`, `royal-fork`,
// `humble-mate`, `discovered-check`, `double-check`, `en-passant`, `smothered-mate`,
// `promotion-mate` — for
// proving a single bounty against a position known to offer it. Without it the gate takes
// whatever the position offers first, which is what you want when the question is "does the
// path work at all".
//
// `underpromotion-mate` is the one entry this gate cannot ask for. It enumerates legal moves and
// applies each with the board's DEFAULT promotion, which is the Queen, so a Pawn arriving on the
// promotion rank is only ever planned as a Queen here. Choosing otherwise is a decision the
// player makes in the promotion picker, after the move is authored, and driving that picker is a
// different gate than this one. The path it proves is shared: an underpromotion mate is paid
// through the same transform, from the same reader, on the same committed board.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!url) { console.error('usage: npm run verify:manubiae -- <craft-url>'); process.exit(2); }
const shotPath = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'tmp-shots/manubiae-paid.png';
const want = process.argv.includes('--want') ? process.argv[process.argv.indexOf('--want') + 1] : null;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });
const browserProfile = mkdtempSync(join(tmpdir(), 'ct-manubiae-'));

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

// Everything the gate asks is answered inside the app, so the rules, the board, the catalog and
// the Run document are the live ones rather than copies free to drift from them.
const HELPERS = `
  const rules = await import('/src/core/rules.ts');
  const model = await import('/src/run/model.ts');
  const manubiae = await import('/src/run/manubiae.ts');
  const boards = await import('/src/game/SkirmishStoreContext.tsx');
  const runs = await import('/src/run/store.ts');
  const live = boards.activeSkirmishStoreForDiagnostics()?.getState() ?? null;
  const run = runs.useActiveRun.getState().run;
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
    // A settled scene is not a composed board: activation is what RELEASES the unit entrance,
    // so the army is still in the air here. Wait for it to land, or the clicks aim at pieces
    // the player cannot see yet.
    await page.waitForFunction(() => {
      const board = document.querySelector('[data-arrival-state]');
      return !!board
        && board.getAttribute('data-unit-arrivals') !== 'pending'
        && board.getAttribute('data-arrival-state') === 'none'
        && !board.classList.contains('is-board-loading');
    }, { timeout: 60_000 });
  } catch { await fail('boot', 'the craft link never rendered a composed Battle board'); }
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

  // Plan with the app's own reader, so a gate can never pass against logic the screen is not
  // using. The expected payment is summed from the catalog for the same reason.
  const plan = await ask(`
    const size = live.game.size;
    const want = ${JSON.stringify(want)};
    for (const piece of live.game.pieces.filter((p) => p.side === 'player' && p.alive)) {
      for (const move of rules.legalMoves(piece, live.game.pieces, size, live.env)) {
        const after = rules.applyMove(live.game, piece.id, move);
        const earned = manubiae.manubiaeEarnedBy(after.state, after.events);
        if (!earned.length) continue;
        if (want && !earned.some((e) => e.award.id === want)) continue;
        const mover = after.state.pieces.find((p) => p.id === piece.id);
        return {
          pieceId: piece.id, type: piece.type,
          from: { x: piece.x, y: piece.y }, to: { x: mover.x, y: mover.y },
          earned: earned.map((e) => ({
            id: e.award.id,
            at: e.at,
            name: model.RUN_MANUBIUM_BY_ID[e.award.id].name,
            goldTenths: model.manubiumGoldTenths(e.award),
          })),
          gold: run.goldTenths,
        };
      }
    }
    return { none: live.game.pieces.filter((p) => p.alive).map((p) => p.side[0] + ':' + p.type + '@' + p.x + ',' + p.y) };
  `);
  if (plan.none) {
    await fail('position', `no ${want ?? 'Manubium'} is available in one move here — craft a position that offers one (board: ${plan.none.join(' ')})`);
  }
  const owed = plan.earned.reduce((sum, entry) => sum + entry.goldTenths, 0);
  console.log(`${plan.type} ${plan.from.x},${plan.from.y} → ${plan.to.x},${plan.to.y} earns ${plan.earned.map((e) => `${e.name} (${e.goldTenths})`).join(' + ')}`);

  const tileCenter = (cell) => page.evaluate(({ x, y }) => {
    const button = document.querySelector(`button.skirmish-board-cell-hit[data-cx="${x}"][data-cy="${y}"]`);
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, cell);

  // Real hit-tested clicks: select the unit, then commit onto the earning square.
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

  // The three things the player is owed, all read off the live app. The markers are read first
  // — they retire once their rise has played out, and the gate must not race them.
  const paid = await ask(`
    return {
      gold: run.goldTenths,
      notices: live.goldNotices.map((n) => ({ at: n.at, goldTenths: n.goldTenths })),
      log: live.log.map((entry) => entry.text ?? entry.note ?? JSON.stringify(entry)),
      tail: live.log.slice(-5).map((entry) => entry.text ?? entry.note ?? JSON.stringify(entry)),
    };
  `);
  const delta = paid.gold - plan.gold;
  if (delta !== owed) {
    await fail('gold', `the move moved gold by ${delta} instead of ${owed} (${plan.gold} → ${paid.gold})`);
  }
  for (const entry of plan.earned) {
    // The log line is the player's only durable record — the marker fades.
    if (!paid.log.some((line) => line.includes(entry.name))) {
      await fail('log', `the Battle log never said "${entry.name}" had been paid for (tail: ${paid.tail.join(' | ')})`);
    }
    const seated = paid.notices.find((notice) => (
      notice.goldTenths === entry.goldTenths && notice.at.x === entry.at.x && notice.at.y === entry.at.y
    ));
    if (!seated) {
      await fail('marker', `no ${entry.goldTenths}-gold marker was seated at ${JSON.stringify(entry.at)} for ${entry.name} (notices: ${JSON.stringify(paid.notices)})`);
    }
  }

  const board = await page.$('.skirmish-board-viewport') ?? await page.$('.skirmish-board');
  await (board ?? page).screenshot({ path: shotPath });

  console.log(`gold ${plan.gold} → ${paid.gold} (+${owed})`);
  console.log(`log: ${paid.tail.join(' | ')}`);
  console.log(`PASS — ${plan.earned.length} Manubium(s) paid on the live board (${shotPath})`);
  await done(0);
} catch (error) {
  await fail('run', error?.message ?? String(error));
}
