#!/usr/bin/env node
// Live navigation-lifecycle gate for a rail of sections inside a retained shell.
//
// The Strategikon's rail used to swap its pane with no transition at all: its
// sections were absent from the scene key, so `App` took its same-scene branch and
// the director never left `is-current`. Nothing caught that, because a source-level
// guard can only check that a family pasted the pattern — it cannot notice a family
// that never wrote it. This gate drives the real rails on the real route and fails
// if a section change does not run one director transition scoped to the region the
// rail replaces.
//
// It asserts, for each rail:
//   - exactly one exiting -> loading/entering -> current cycle per click;
//   - the element the director marked active is the shell's OWN region target, so
//     the rail beside the pane is retained rather than dragged through the fade;
//   - the Battle board mounted behind the workspace is never torn down;
//   - the persistent title bar keeps what the RETAINED host contributes. Activation
//     used to be read off the whole layer, so a host-preserving transition stood down
//     retained chrome as well as the region being replaced, and the Battle bar lost
//     its turn, clock, and objective chips for the length of every navigation.
//
// Usage: npm run verify:strategikon -- '<base-url>'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv[2];
if (!base) {
  console.error("usage: npm run verify:strategikon -- '<base-url>'");
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
const BATTLE = '?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge';
const START = `/play/strategikon/enchiridion/units${BATTLE}`;

// Each step names the rail tab to click and the region whose target must carry the
// fade. The reference rail replaces only the record pane; the section rail replaces
// the pane AND the reference rail that belongs to the section being left.
const STEPS = [
  { label: 'reference-rail', to: `/play/strategikon/enchiridion/terrain${BATTLE}`, region: 'strategikon-reference-shell' },
  { label: 'reference-rail-again', to: `/play/strategikon/enchiridion/lipsana${BATTLE}`, region: 'strategikon-reference-shell' },
  { label: 'reference-rail-ataraxia', to: `/play/strategikon/enchiridion/ataraxia${BATTLE}`, region: 'strategikon-reference-shell' },
  { label: 'section-rail', to: `/play/strategikon/prosopography${BATTLE}`, region: 'strategikon-shell' },
  // Returning to the Enchiridion goes through the SECTION rail, whose tab offers the
  // reference the section reopens with — the reference rail is gone while away.
  { label: 'section-rail-back', to: `/play/strategikon/enchiridion/units${BATTLE}`, region: 'strategikon-shell' },
];

const profile = mkdtempSync(join(tmpdir(), 'ct-strategikon-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const settled = `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'`;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const signIn = new URL('/api/auth/sign-in', base);
  signIn.searchParams.set('returnTo', '/api/auth/me');
  const auth = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  if (!auth || (!auth.ok() && auth.status() !== 304)) {
    throw new Error(`local sign-in failed (${auth?.status() ?? 'no response'})`);
  }

  await page.goto(new URL(START, base).href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(
    `${settled} && Boolean(document.querySelector('[data-testid="strategikon"]'))`,
    { timeout: TIMEOUT },
  );

  // Tag the mounted board so a remount behind the workspace is observable. The
  // Strategikon opens OVER a live Battle; re-keying its scene layer would tear that
  // board down, which is why its slots are identity-only.
  await page.evaluate(() => {
    const board = document.querySelector('.skirmish-board-frame');
    if (board) board.dataset.ctBoardWitness = 'original';
  });

  const results = [];
  for (const step of STEPS) {
    await page.evaluate(() => {
      const director = document.querySelector('[data-scene-phase]');
      const snap = () => ({
        phase: director.getAttribute('data-scene-phase'),
        // Which element the director actually marked — the region whose DOM fades.
        active: [...document.querySelectorAll('.scene-director [data-scene-transition-target][data-scene-transition-active]')]
          .map((node) => node.getAttribute('data-scene-transition-target')),
      });
      // Sample the bar on a timer, not on director mutations: the chips blanked
      // BETWEEN phase changes, so an attribute-driven sample would step right over it.
      const titleBar = () => (document.querySelector('.app-shell-titlebar')?.innerText ?? '')
        .replace(/\s+/g, ' ')
        // The battle clock ticks during the transition; compare structure, not time.
        .replace(/\d+:\d\d/g, 'M:SS')
        .trim();
      window.__strategikon = { phases: [snap()], titleBar: [titleBar()] };
      window.__strategikonTimer = setInterval(() => { window.__strategikon.titleBar.push(titleBar()); }, 25);
      new MutationObserver(() => { window.__strategikon.phases.push(snap()); })
        .observe(director, { attributes: true, attributeFilter: ['data-scene-phase'] });
    });

    const clicked = await page.evaluate((href) => {
      const target = [...document.querySelectorAll('[data-testid="strategikon"] [data-nav]')]
        .find((node) => node.getAttribute('data-nav') === href);
      if (!target) {
        return { ok: false, seen: [...document.querySelectorAll('[data-testid="strategikon"] [data-nav]')].map((n) => n.getAttribute('data-nav')) };
      }
      target.click();
      return { ok: true };
    }, step.to);
    if (!clicked.ok) throw new Error(`no rail control for ${step.to}\n  saw: ${JSON.stringify(clicked.seen)}`);

    await page.waitForFunction(
      (href) => window.location.pathname + window.location.search === href
        && document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current',
      { timeout: TIMEOUT },
      step.to,
    );
    await new Promise((resolve) => { setTimeout(resolve, 400); });

    const observed = await page.evaluate(() => {
      clearInterval(window.__strategikonTimer);
      return {
        phases: window.__strategikon.phases,
        titleBar: window.__strategikon.titleBar,
        boardWitness: document.querySelector('.skirmish-board-frame')?.dataset.ctBoardWitness ?? 'missing',
      };
    });

    const sequence = [];
    for (const entry of observed.phases) {
      if (sequence[sequence.length - 1]?.phase !== entry.phase) sequence.push(entry);
    }
    const phases = sequence.map((entry) => entry.phase);
    const activeDuringTransition = [...new Set(
      sequence.filter((entry) => entry.phase !== 'current').flatMap((entry) => entry.active),
    )];

    const violations = [];
    const exits = phases.filter((phase) => phase === 'exiting').length;
    // The bug class: no lifecycle at all. `current` never leaves, the pane just swaps.
    if (exits !== 1) violations.push(`expected exactly one exit, saw ${exits} (phases: ${phases.join(' -> ')})`);
    if (!phases.includes('entering')) violations.push(`no entrance phase (phases: ${phases.join(' -> ')})`);
    if (phases[phases.length - 1] !== 'current') violations.push(`did not settle: ${phases.join(' -> ')}`);
    if (!activeDuringTransition.includes(step.region)) {
      violations.push(`fade did not run on ${step.region} (marked: ${JSON.stringify(activeDuringTransition)})`);
    }
    // A wider region than the rail's own means the retained rail rode the fade.
    const wider = activeDuringTransition.filter((region) => region !== step.region);
    if (wider.length) violations.push(`fade also ran on retained chrome: ${JSON.stringify(wider)}`);
    if (observed.boardWitness !== 'original') {
      violations.push(`Battle board was remounted behind the workspace (${observed.boardWitness})`);
    }
    // The Strategikon replaces a region INSIDE the Battle shell, so the shell's own
    // title-bar contributions belong to retained chrome and may never drop out.
    const barAtRest = observed.titleBar[0];
    const barLost = observed.titleBar.find((entry) => !entry.startsWith(barAtRest));
    if (barLost !== undefined) {
      violations.push(`title bar lost retained content mid-transition: "${barLost}" (was "${barAtRest}")`);
    }

    results.push({ ...step, violations, phases, activeDuringTransition });
  }

  let failed = false;
  for (const result of results) {
    const ok = result.violations.length === 0;
    failed ||= !ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${result.label}: ${result.phases.join(' -> ')} on ${JSON.stringify(result.activeDuringTransition)}`);
    if (!ok) console.error(`  violations: ${result.violations.join('; ')}`);
  }
  await page.close();
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
