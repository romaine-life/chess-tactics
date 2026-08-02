#!/usr/bin/env node
// Live navigation-lifecycle gate for the Play hub (and the scene director generally).
//
// Reproduces the canonicalizing navigation that once double-faded the outgoing menu:
// from /settings/general, click the Play rail tab; PlayMenu then canonicalizes the
// /play/select hub root to a Continue address (ADR-0260) while the destination is
// still preparing. The gate drives that flow twice — once at natural timing and once
// with campaign hydration delayed so the canonicalization always lands mid-transition
// — and fails if the director ever exits more than once per navigation, ends anywhere
// but a committed canonical Continue address, or loses the canonicalization event
// (the App location subscription must deliver it: an in-flight retarget shows a
// second scene-navigation-accepted mark; a post-commit refresh shows
// scene-address-refreshed).
//
// Usage: npm run verify:play-transition -- '<base-url>'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
const CANONICAL_PREFIX = '/play/select/continue';
const profile = mkdtempSync(join(tmpdir(), 'ct-playnav-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

async function runScenario({ label, delayCampaignsMs }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    if (delayCampaignsMs) {
      // Land PlayMenu's canonicalization in its own quiet flush, after run hydration
      // settles, so the replace navigation is always dispatched mid-transition.
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/official-campaigns') || url.includes('/api/campaign-workspace')) {
          setTimeout(() => { void request.continue(); }, delayCampaignsMs);
          return;
        }
        void request.continue();
      });
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
    }));

    const phaseRuns = [];
    for (const entry of result.phases) {
      const last = phaseRuns[phaseRuns.length - 1];
      if (!last || last.phase !== entry.phase) phaseRuns.push(entry);
    }
    const exitingCount = phaseRuns.filter((entry) => entry.phase === 'exiting').length;
    const acceptedCount = result.marks.filter((mark) => mark.phase === 'scene-navigation-accepted').length;
    const refreshedCount = result.marks.filter((mark) => mark.phase === 'scene-address-refreshed').length;
    const canonicalizationDelivered = delayCampaignsMs
      ? acceptedCount >= 2
      : acceptedCount >= 2 || refreshedCount >= 1;

    const violations = [];
    if (exitingCount !== 1) violations.push(`expected exactly one exit, saw ${exitingCount}`);
    if (result.finalPhase !== 'current') violations.push(`scene did not settle: ${result.finalPhase}`);
    if (!result.finalPath.startsWith(CANONICAL_PREFIX)) {
      violations.push(`address did not canonicalize: ${result.finalPath}`);
    }
    if (!canonicalizationDelivered) {
      violations.push(`canonicalization navigation was not delivered (accepted=${acceptedCount}, refreshed=${refreshedCount})`);
    }
    return { label, delayCampaignsMs, violations, exitingCount, acceptedCount, refreshedCount, ...result, phaseSequence: phaseRuns };
  } finally {
    await page.close();
  }
}

try {
  const scenarios = [
    await runScenario({ label: 'natural-timing', delayCampaignsMs: 0 }),
    await runScenario({ label: 'forced-mid-transition-canonicalization', delayCampaignsMs: 600 }),
  ];
  let failed = false;
  for (const scenario of scenarios) {
    const ok = scenario.violations.length === 0;
    failed ||= !ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${scenario.label}: exits=${scenario.exitingCount} accepted=${scenario.acceptedCount} refreshed=${scenario.refreshedCount} final=${scenario.finalPath}`);
    if (!ok) {
      console.error(`  violations: ${scenario.violations.join('; ')}`);
      console.error(`  phases: ${JSON.stringify(scenario.phaseSequence)}`);
      console.error(`  marks: ${JSON.stringify(scenario.marks)}`);
    }
  }
  process.exitCode = failed ? 10 : 0;
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
