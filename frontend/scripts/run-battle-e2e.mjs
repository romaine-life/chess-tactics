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

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!base) { console.error('usage: npm run e2e:run-battle -- <base-url>'); process.exit(2); }
const transitionOnly = process.argv.includes('--transition-only');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });
const browserProfile = mkdtempSync(join(tmpdir(), 'ct-run-battle-'));

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: browserProfile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const fail = async (step, extra) => {
  console.error(`FAIL at ${step}${extra ? ' — ' + extra : ''}`);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.setDefaultTimeout(30_000);
  // The named development backend carries the owner's verified grant for every
  // loopback request. This proof explicitly owns a disposable anonymous Run, so
  // answer only the read-only auth projection as signed out and leave all game,
  // content, media, and health requests on the real backend.
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === 'GET' && requestUrl.pathname === '/api/auth/me') {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signed_in: false }),
      });
      return;
    }
    void request.continue();
  });

  const navigationResponse = await page.goto(`${base}/play/select/run/new`, { waitUntil: 'domcontentloaded' });

  // App booted: the authored scene director has committed the Run picker and released
  // the static bootstrap face. Rendered controls behind a still-preparing scene are not
  // interactive authority.
  try {
    await page.waitForFunction(() => document.querySelector('[data-scene-phase="current"]')
      && !document.getElementById('app-bootstrap-status')
      && [...document.querySelectorAll('button')]
        .some((button) => (button.textContent || '').trim() === 'Start Run' && !button.disabled));
  } catch {
    const bootState = await page.evaluate(async () => {
      const timeline = await import('/src/diagnostics/loadingTimeline.ts');
      const director = document.querySelector('.scene-director');
      const boundary = document.querySelector('.scene-boundary');
      return {
        href: window.location.href,
        title: document.title,
        body: document.body?.innerText?.slice(0, 800) ?? '',
        director: director ? {
          phase: director.getAttribute('data-scene-phase'),
          committed: director.getAttribute('data-scene-committed'),
          pending: director.getAttribute('data-scene-pending'),
        } : null,
        boundary: boundary ? {
          scene: boundary.getAttribute('data-scene'),
          participants: boundary.getAttribute('data-scene-participants'),
          unresolved: boundary.getAttribute('data-scene-unresolved'),
        } : null,
        timeline: timeline.loadingEvents().slice(-15),
      };
    });
    await fail('app boot', `HTTP ${navigationResponse?.status() ?? 'none'}; ${JSON.stringify(bootState)}`);
  }

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

  const clickElement = async (selector) => {
    try {
      await page.waitForFunction((query) => {
        const element = document.querySelector(query);
        if (!(element instanceof HTMLElement)
          || element.getBoundingClientRect().width <= 0
          || element.closest('[inert]')
          || (element instanceof HTMLButtonElement && element.disabled)) return false;
        element.scrollIntoView({ block: 'center' });
        const rect = element.getBoundingClientRect();
        const x = (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2;
        const y = (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2;
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && (hit === element || element.contains(hit)));
      }, { timeout: 15_000 }, selector);
    } catch {
      return false;
    }
    const point = await page.evaluate((query) => {
      const element = document.querySelector(query);
      if (!(element instanceof HTMLElement) || element.closest('[inert]')) return null;
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      const x = (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2;
      const y = (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2;
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === element || element.contains(hit)) ? { x, y } : null;
    }, selector);
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    return true;
  };

  const buttonDiagnostics = (label) => page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => (candidate.textContent || '').trim() === text);
    if (!button) return { found: false };
    button.scrollIntoView({ block: 'nearest' });
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const director = document.querySelector('.scene-director');
    const boundary = document.querySelector('.scene-boundary');
    return {
      found: true,
      disabled: button.disabled,
      inert: Boolean(button.closest('[inert]')),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.trim() } : null,
      director: director ? {
        phase: director.getAttribute('data-scene-phase'),
        committed: director.getAttribute('data-scene-committed'),
        pending: director.getAttribute('data-scene-pending'),
      } : null,
      boundary: boundary ? {
        scene: boundary.getAttribute('data-scene'),
        participants: boundary.getAttribute('data-scene-participants'),
        unresolved: boundary.getAttribute('data-scene-unresolved'),
      } : null,
    };
  }, label);

  const elementDiagnostics = (selector) => page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!(element instanceof HTMLElement)) return { found: false };
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    const x = (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2;
    const y = (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      found: true,
      disabled: element instanceof HTMLButtonElement ? element.disabled : null,
      inert: Boolean(element.closest('[inert]')),
      pointerEvents: getComputedStyle(element).pointerEvents,
      visibility: getComputedStyle(element).visibility,
      opacity: getComputedStyle(element).opacity,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.trim().slice(0, 120) } : null,
      director: document.querySelector('.scene-director')?.getAttribute('data-scene-phase') ?? null,
      boundaries: [...document.querySelectorAll('.scene-boundary')].map((boundary) => ({
        scene: boundary.getAttribute('data-scene'),
        role: boundary.getAttribute('data-scene-visual-role'),
        inert: boundary.hasAttribute('inert'),
      })),
      ancestors: [...function* ancestors() {
        let current = element.parentElement;
        for (let index = 0; current && index < 8; index += 1, current = current.parentElement) {
          const style = getComputedStyle(current);
          yield {
            tag: current.tagName,
            className: current.className,
            covered: current.hasAttribute('data-shell-workspace-covered'),
            pointerEvents: style.pointerEvents,
            visibility: style.visibility,
            opacity: style.opacity,
          };
        }
      }()],
    };
  }, selector);

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
  if (!await clickButton('Start Run')) await fail('start-run', JSON.stringify(await buttonDiagnostics('Start Run')));
  await waitPhase('draft', 'start-run');

  if (!await clickElement('button.run-bundle-card:not([disabled])')) {
    await page.screenshot({ path: 'tmp-shots/run-draft-hit-failure.png' });
    await fail('draft-take', JSON.stringify(await elementDiagnostics('button.run-bundle-card:not([disabled])')));
  }
  await waitPhase('deployment', 'draft-take');

  await page.evaluate(() => {
    const outgoing = document.querySelector('.run-scene-slot');
    const probe = {
      outgoing,
      frame: 0,
      sawPending: false,
      sawOverlap: false,
      sawEntering: false,
      retainedOutgoing: false,
      inertOutgoing: false,
      blankFrame: false,
      interactiveBeforeCommit: false,
      arrivalBeforeCommit: false,
    };
    window.__ctRunTransitionProbe = probe;
    const tick = () => {
      const director = document.querySelector('.scene-director');
      const phase = director?.getAttribute('data-scene-phase') ?? 'missing';
      const pending = director?.getAttribute('data-scene-pending') ?? '';
      const boundaries = [...document.querySelectorAll('.scene-boundary')];
      const transitioning = phase !== 'current' && phase !== 'startup';
      probe.sawPending ||= pending.includes(':battle:');
      probe.sawOverlap ||= boundaries.some((entry) => entry.getAttribute('data-scene-visual-role') === 'outgoing')
        && boundaries.some((entry) => entry.getAttribute('data-scene-visual-role') === 'incoming');
      probe.sawEntering ||= phase === 'entering';
      probe.retainedOutgoing ||= transitioning && Boolean(probe.outgoing?.isConnected);
      probe.inertOutgoing ||= transitioning && Boolean(probe.outgoing?.closest('[inert]'));
      if (transitioning) {
        const visibleBoundary = boundaries.some((entry) => {
          const rect = entry.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && Number.parseFloat(getComputedStyle(entry).opacity) > 0.01;
        });
        if (!visibleBoundary) probe.blankFrame = true;
        const pendingBoard = boundaries
          .find((entry) => entry.getAttribute('data-scene-visual-role') === 'incoming')
          ?.querySelector('[data-testid="skirmish-board"]');
        if (pendingBoard?.getAttribute('data-interactive') === 'true') probe.interactiveBeforeCommit = true;
        if (pendingBoard?.getAttribute('data-arriving') === 'true') probe.arrivalBeforeCommit = true;
      }
      probe.frame = requestAnimationFrame(tick);
    };
    probe.frame = requestAnimationFrame(tick);
  });

  if (!await clickElement('.run-deployment-pane > button[data-chrome-unit="inner-text-button"]:not([disabled])')) {
    await fail('begin-battle', JSON.stringify(await elementDiagnostics('.run-deployment-pane > button[data-chrome-unit="inner-text-button"]')));
  }
  await waitPhase('battle', 'begin-battle');
  await page.waitForFunction(() => {
    const director = document.querySelector('.scene-director');
    return director?.getAttribute('data-scene-phase') === 'current'
      && (director.getAttribute('data-scene-committed') ?? '').includes(':battle:')
      && !director.getAttribute('data-scene-pending');
  });

  // Board revealed and composed (no is-board-loading), tile hit buttons live.
  await page.waitForFunction(() => {
    const lab = document.querySelector('.skirmish-board-lab');
    return lab && !lab.classList.contains('is-board-loading')
      && document.querySelectorAll('button.skirmish-board-cell-hit').length > 0;
  });

  const transition = await page.evaluate(() => {
    const probe = window.__ctRunTransitionProbe;
    cancelAnimationFrame(probe.frame);
    const director = document.querySelector('.scene-director');
    return {
      sawPending: probe.sawPending,
      sawOverlap: probe.sawOverlap,
      sawEntering: probe.sawEntering,
      retainedOutgoing: probe.retainedOutgoing,
      inertOutgoing: probe.inertOutgoing,
      blankFrame: probe.blankFrame,
      interactiveBeforeCommit: probe.interactiveBeforeCommit,
      arrivalBeforeCommit: probe.arrivalBeforeCommit,
      finalPhase: director?.getAttribute('data-scene-phase') ?? null,
      finalCommitted: director?.getAttribute('data-scene-committed') ?? null,
      finalPending: director?.getAttribute('data-scene-pending') ?? null,
    };
  });
  if (
    !transition.sawPending
    || !transition.sawOverlap
    || !transition.sawEntering
    || !transition.retainedOutgoing
    || !transition.inertOutgoing
    || transition.blankFrame
    || transition.interactiveBeforeCommit
    || transition.arrivalBeforeCommit
    || transition.finalPhase !== 'current'
    || !transition.finalCommitted?.includes(':battle:')
    || transition.finalPending
  ) {
    await fail('begin-battle-transition', JSON.stringify(transition));
  }
  console.log('director-owned Deployment → Battle transition: OK');

  await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
    ?.getAttribute('data-arriving') === 'false');
  const transitionShot = 'tmp-shots/run-deployment-battle-transition.png';
  const transitionBoard = await page.$('.skirmish-war-room');
  if (!transitionBoard) await fail('transition-screenshot', 'Battle workspace unavailable after commit');
  await transitionBoard.screenshot({ path: transitionShot });
  console.log('transition screenshot:', transitionShot);
  if (transitionOnly) {
    console.log('PASS — director owns the complete Deployment → Battle lifecycle');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }

  // Pick a real legal move from the live store.
  const plan = await page.evaluate(async () => {
    const g = await import('/src/game/SkirmishStoreContext.tsx');
    const r = await import('/src/core/rules.ts');
    const s = g.activeSkirmishStoreForDiagnostics()?.getState();
    if (!s) return null;
    for (const p of s.game.pieces.filter((q) => q.side === 'player' && q.alive)) {
      const moves = r.legalMoves(p, s.game.pieces, s.game.size, s.env);
      if (moves.length) return { pieceId: p.id, type: p.type, from: { x: p.x, y: p.y }, to: { x: moves[0].x, y: moves[0].y } };
    }
    return null;
  });
  if (!plan) {
    const gameState = await page.evaluate(async () => {
      const context = await import('/src/game/SkirmishStoreContext.tsx');
      const rules = await import('/src/core/rules.ts');
      const state = context.activeSkirmishStoreForDiagnostics()?.getState();
      return state ? {
        started: state.started,
        turn: state.game.turn,
        winner: state.game.winner,
        pieces: state.game.pieces.map((piece) => ({
          id: piece.id,
          side: piece.side,
          type: piece.type,
          alive: piece.alive,
          x: piece.x,
          y: piece.y,
          legal: rules.legalMoves(piece, state.game.pieces, state.game.size, state.env).length,
        })),
      } : null;
    });
    await fail('plan', JSON.stringify(gameState));
  }
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
      (id) => import('/src/game/SkirmishStoreContext.tsx').then((m) => m.activeSkirmishStoreForDiagnostics()?.getState().selectedId === id),
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
      ({ pieceId, to }) => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
        const s = m.activeSkirmishStoreForDiagnostics()?.getState();
        if (!s) return false;
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
      () => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
        const s = m.activeSkirmishStoreForDiagnostics()?.getState();
        if (!s) return false;
        return s.game.turn === 'player' && !s.game.winner;
      }),
      { timeout: 15_000 },
    );
  } catch {
    const replyState = await page.evaluate(async () => {
      const context = await import('/src/game/SkirmishStoreContext.tsx');
      const state = context.activeSkirmishStoreForDiagnostics()?.getState();
      return state ? {
        turn: state.game.turn,
        winner: state.game.winner,
        reason: state.game.reason,
        log: state.log.slice(0, 5),
      } : null;
    });
    await fail('enemy-reply', JSON.stringify(replyState));
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
  rmSync(browserProfile, { recursive: true, force: true });
} catch (error) {
  console.error('FAIL (unexpected):', error);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
}
