#!/usr/bin/env node
// Live navigation-lifecycle gate for the Play hub (and the scene director generally).
//
// Reproduces the canonicalizing navigation that once double-faded the outgoing menu:
// from /settings/general, click the Play rail tab; PlayMenu then canonicalizes the
// /play/select hub root to its sole Run address (ADR-0514) while the destination is
// still preparing. The gate drives that flow twice — once at natural timing and once
// with Run hydration delayed so the canonicalization always lands mid-transition
// — and fails if the director ever exits more than once per navigation, ends anywhere
// but the committed canonical Run address, or loses the canonicalization event
// (the App location subscription must deliver it: an in-flight retarget shows a
// second scene-navigation-accepted mark; a post-commit refresh shows
// scene-address-refreshed). It also starts a replacement Run and verifies that the
// outgoing confirmation remains structurally frozen while the Run store is replaced.
//
// Usage: npm run verify:play-transition -- '<base-url>'

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv[2];
if (!base) {
  console.error("usage: npm run verify:play-transition -- '<base-url>'");
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

const TIMEOUT = 30_000;
const CANONICAL_PREFIX = '/play/select/run';
const captureStartRun = process.argv.includes('--capture-start-run');
const profile = mkdtempSync(join(tmpdir(), 'ct-playnav-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

async function runScenario({ label, delayRunMs }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    if (delayRunMs) {
      // Land PlayMenu's canonicalization in its own quiet flush, after run hydration
      // settles, so the replace navigation is always dispatched mid-transition.
      //
      // Hold the active-Run read INSIDE the page rather than through CDP request interception
      // (page.setRequestInterception). Interception routes every request in the page through this
      // process, and against the Vite dev server it wedges module requests: run-battle-e2e measured
      // 6/6 runs hung with a lazily-imported module graph paused in flight forever, versus 6/6
      // clean runs with interception removed (commit af37db63). A paused request raises no error
      // event, so nothing times out — this scenario would simply never reach its assertions. The
      // Run read goes through `fetch` (net/activeRun.ts), so patching `window.fetch`
      // delays exactly that request. The tally lives in sessionStorage so the count survives
      // every navigation this scenario makes.
      await page.evaluateOnNewDocument((delayMs) => {
        const KEY = '__ctDelayedRunReads';
        const read = () => Number(sessionStorage.getItem(KEY) ?? '0') || 0;
        const bump = () => {
          const next = read() + 1;
          window[KEY] = next;
          try { sessionStorage.setItem(KEY, String(next)); } catch { /* window copy still stands */ }
        };
        window[KEY] = read();
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const href = typeof input === 'string' ? input : (input?.url ?? '');
          const url = new URL(href, window.location.origin);
          const method = String(init?.method ?? 'GET').toUpperCase();
          if (url.pathname === '/api/active-run' && method === 'GET') {
            bump();
            await new Promise((resolve) => { setTimeout(resolve, delayMs); });
          }
          return nativeFetch(input, init);
        };
      }, delayRunMs);
    }

    // The isolated browser has no owner cookies; establish the loopback dev session
    // exactly as scripts/shot.mjs does.
    const signIn = new URL('/api/auth/sign-in', base);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const auth = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    // 304 = the shared browser profile revalidated an already-established session.
    if (!auth || (!auth.ok() && auth.status() !== 304)) {
      throw new Error(`local sign-in failed (${auth?.status() ?? 'no response'})`);
    }

    await page.goto(new URL('/settings/general', base).href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(
      `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'
        && Boolean(document.querySelector('.main-menu-mode-tab[data-nav="/play/select"]'))`,
      { timeout: TIMEOUT },
    );

    await page.evaluate(async () => {
      const timeline = await import('/src/diagnostics/loadingTimeline.ts');
      const director = document.querySelector('[data-scene-phase]');
      const snap = () => ({
        at: Math.round(performance.now()),
        phase: director.getAttribute('data-scene-phase'),
        committed: director.getAttribute('data-scene-committed'),
        pending: director.getAttribute('data-scene-pending'),
      });
      const baselineAt = performance.now();
      window.__playNav = { phases: [snap()], baselineAt };
      new MutationObserver(() => { window.__playNav.phases.push(snap()); })
        .observe(director, { attributes: true, attributeFilter: ['data-scene-phase', 'data-scene-pending'] });
      window.__playNavMarks = () => timeline.loadingEvents()
        .filter((event) => event.at >= baselineAt && event.kind !== 'resource')
        .filter((event) => event.phase.startsWith('scene-'))
        .map((event) => ({ at: Math.round(event.at), surface: event.surface, phase: event.phase }));
    });

    await page.click('.main-menu-mode-tab[data-nav="/play/select"]');
    await page.waitForFunction(
      `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'
        && (document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-committed') || '').startsWith('play')`,
      { timeout: TIMEOUT },
    );
    // The canonical address is the settled outcome, not a race to win.
    await page.waitForFunction(
      (prefix) => window.location.pathname.startsWith(prefix),
      { timeout: TIMEOUT },
      CANONICAL_PREFIX,
    );
    await new Promise((resolve) => setTimeout(resolve, 700));

    const result = await page.evaluate(() => ({
      finalPath: window.location.pathname + window.location.search,
      finalPhase: document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') ?? null,
      phases: window.__playNav.phases,
      marks: window.__playNavMarks(),
      delayedRunReads: Number(sessionStorage.getItem('__ctDelayedRunReads') ?? '0') || 0,
    }));

    const phaseRuns = [];
    for (const entry of result.phases) {
      const last = phaseRuns[phaseRuns.length - 1];
      if (!last || last.phase !== entry.phase) phaseRuns.push(entry);
    }
    const exitingCount = phaseRuns.filter((entry) => entry.phase === 'exiting').length;
    const acceptedCount = result.marks.filter((mark) => mark.phase === 'scene-navigation-accepted').length;
    const refreshedCount = result.marks.filter((mark) => mark.phase === 'scene-address-refreshed').length;
    const canonicalizationDelivered = delayRunMs
      ? acceptedCount >= 2
      : acceptedCount >= 2 || refreshedCount >= 1;

    const violations = [];
    // A forced-timing scenario that silently stopped forcing anything is not a passing run — it is
    // the natural-timing scenario wearing its name, and it would report OK while proving nothing.
    if (delayRunMs && result.delayedRunReads === 0) {
      violations.push('the active-Run read was never held, so this scenario never forced a mid-transition canonicalization');
    }
    if (exitingCount !== 1) violations.push(`expected exactly one exit, saw ${exitingCount}`);
    if (result.finalPhase !== 'current') violations.push(`scene did not settle: ${result.finalPhase}`);
    if (!result.finalPath.startsWith(CANONICAL_PREFIX)) {
      violations.push(`address did not canonicalize: ${result.finalPath}`);
    }
    if (!canonicalizationDelivered) {
      violations.push(`canonicalization navigation was not delivered (accepted=${acceptedCount}, refreshed=${refreshedCount})`);
    }
    return { label, delayRunMs, violations, exitingCount, acceptedCount, refreshedCount, ...result, phaseSequence: phaseRuns };
  } finally {
    await page.close();
  }
}

async function runStartRunScenario() {
  const label = 'start-run-outgoing-snapshot';
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    const signIn = new URL('/api/auth/sign-in', base);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const auth = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    if (!auth || (!auth.ok() && auth.status() !== 304)) {
      throw new Error(`local sign-in failed (${auth?.status() ?? 'no response'})`);
    }

    await page.goto(new URL('/play/select/run/new', base).href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(
      `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'
        && Boolean(document.querySelector('[data-testid="run-replace-warning"]'))
        && Boolean(document.querySelector('[data-testid="run-start"]'))`,
      { timeout: TIMEOUT },
    );
    await page.click('[data-testid="run-start"]');
    await page.waitForSelector('[data-testid="run-abandon-and-start"]', { visible: true, timeout: TIMEOUT });

    await page.evaluate(() => {
      const director = document.querySelector('[data-scene-phase]');
      const rect = (element) => {
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return [bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Math.round(value * 100) / 100);
      };
      const read = () => {
        const detail = document.querySelector('[data-testid="run-detail-new"]');
        const warning = detail?.querySelector('[data-testid="run-replace-warning"]') ?? null;
        const actions = detail?.querySelector('.run-replace-decision') ?? null;
        const buttons = detail
          ? [...detail.querySelectorAll('button[data-testid]')]
            .map((element) => element.getAttribute('data-testid'))
            .filter((value) => value === 'run-keep' || value === 'run-abandon-and-start' || value === 'run-start')
            .sort()
          : [];
        window.__startRunFrames.push({
          at: Math.round(performance.now()),
          phase: director?.getAttribute('data-scene-phase') ?? null,
          detailVisible: Boolean(detail),
          warningVisible: Boolean(warning),
          buttons,
          geometry: [rect(detail), rect(warning), rect(actions)],
        });
      };
      window.__startRunFrames = [];
      read();
      window.__startRunObserver = new MutationObserver(read);
      window.__startRunObserver.observe(document.body, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    if (captureStartRun) {
      const captureDir = join(process.cwd(), 'tmp-shots');
      mkdirSync(captureDir, { recursive: true });
      await page.screenshot({ path: join(captureDir, 'start-run-armed.png'), fullPage: false });
    }
    await page.click('[data-testid="run-abandon-and-start"]');
    if (captureStartRun) {
      await page.waitForFunction(
        `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'entering'`,
        { timeout: TIMEOUT },
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      await page.screenshot({ path: join(process.cwd(), 'tmp-shots', 'start-run-transition.png'), fullPage: false });
    }
    await page.waitForFunction(
      `window.location.pathname === '/run'
        && document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'`,
      { timeout: TIMEOUT },
    );
    const frames = await page.evaluate(() => {
      window.__startRunObserver?.disconnect();
      return window.__startRunFrames;
    });
    const visibleFrames = frames.filter((frame) => frame.detailVisible);
    const baselineGeometry = visibleFrames[0]?.geometry ?? null;
    const unstableFrames = visibleFrames.filter((frame) => (
      !frame.warningVisible
      || frame.buttons.join(',') !== 'run-abandon-and-start,run-keep'
      || JSON.stringify(frame.geometry) !== JSON.stringify(baselineGeometry)
    ));
    const violations = [];
    if (visibleFrames.length === 0) violations.push('the armed outgoing detail was never observed');
    if (unstableFrames.length > 0) {
      const signatures = [...new Set(unstableFrames.map((frame) => (
        `${frame.phase}:warning=${frame.warningVisible}:buttons=${frame.buttons.join(',')}`
      )))];
      violations.push(`outgoing confirmation changed before retirement (${signatures.join(' | ')})`);
    }
    return { label, violations, finalPath: page.url(), visibleFrames: visibleFrames.length };
  } finally {
    await page.close();
  }
}

try {
  const scenarios = [
    await runScenario({ label: 'natural-timing', delayRunMs: 0 }),
    await runScenario({ label: 'forced-mid-transition-canonicalization', delayRunMs: 600 }),
    await runStartRunScenario(),
  ];
  let failed = false;
  for (const scenario of scenarios) {
    const ok = scenario.violations.length === 0;
    failed ||= !ok;
    const details = 'exitingCount' in scenario
      ? `exits=${scenario.exitingCount} accepted=${scenario.acceptedCount} refreshed=${scenario.refreshedCount}`
      : `visibleFrames=${scenario.visibleFrames}`;
    console.log(`${ok ? 'OK' : 'FAIL'} ${scenario.label}: ${details} final=${scenario.finalPath}`);
    if (!ok) {
      console.error(`  violations: ${scenario.violations.join('; ')}`);
      if ('phaseSequence' in scenario) console.error(`  phases: ${JSON.stringify(scenario.phaseSequence)}`);
      if ('marks' in scenario) console.error(`  marks: ${JSON.stringify(scenario.marks)}`);
    }
  }
  process.exitCode = failed ? 10 : 0;
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
