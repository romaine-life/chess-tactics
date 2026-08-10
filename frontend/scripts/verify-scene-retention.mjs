#!/usr/bin/env node
// Live gate: a scene replacement must not rebuild the scene the player is already looking at
// (ADR-0557).
//
// The defect this exists to catch: pressing Rewards on a settled Victory tore the battlefield
// down and mounted a second copy of it. The board vanished, its own "Preparing battlefield…"
// card appeared over the village backdrop with the Victory heading still on top, the board
// came back — and only THEN did the crossfade to the report begin. Nothing was wrong with the
// destination or with the crossfade. The outgoing layer's React key simply changed the instant
// the transition began, and a changed key is an instruction to destroy and rebuild.
//
// It is asserted on DOM MOUNT IDENTITY rather than on pixels, because that is what the defect
// actually is. An expando written on the committed scene's boundary element cannot survive a
// remount: React builds a new element and the mark is gone. Pixels would only tell you that
// something flashed; this tells you what.
//
// The gate is route-agnostic on purpose — every scene replacement in the app shared this bug,
// so any transition is a valid subject. Point it at a settled screen and give it something to
// press.
//
// Usage:
//   node scripts/verify-scene-retention.mjs <url> --click <selector> [--size WxH] [--timeout ms]

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const url = argv[0];
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
};
const click = flag('click');
const [width, height] = String(flag('size', '1280x800')).split('x').map(Number);
const timeout = Math.max(1_000, Number(flag('timeout', 60_000)) || 60_000);

if (!url || url.startsWith('--') || !click) {
  console.error('usage: verify-scene-retention <url> --click <selector> [--size WxH] [--timeout ms]');
  process.exit(2);
}

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) {
  console.error(`No Chrome/Edge found. Checked:\n${CHROMES.join('\n')}`);
  process.exit(1);
}

const SETTLED = "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'";

const profile = mkdtempSync(join(tmpdir(), 'ct-scene-retention-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1',
  ],
});

const fail = (message, detail) => {
  console.error(`FAIL ${message}`);
  if (detail) console.error(detail);
  process.exitCode = 1;
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout });
  await page.waitForFunction(SETTLED, { timeout });
  await page.waitForSelector(click, { visible: true, timeout });
  // The settled screen has finished its own entrance; anything still resolving belongs to it,
  // not to the transition under test.
  await page.waitForFunction(
    "!document.querySelector('.scene-boundary')?.getAttribute('data-scene-unresolved')",
    { timeout },
  );

  // Mark the committed boundary, then watch every frame of the transition. A retained layer
  // keeps this element and merely has its visual-role attribute rewritten.
  const observed = await page.evaluate(async (selector) => {
    const director = document.querySelector('[data-scene-phase]');
    const committed = document.querySelector('.scene-boundary');
    if (!director || !committed) return { error: 'no scene director on this page' };
    const MARK = '__sceneRetentionMark';
    committed[MARK] = 'committed';
    const startedCommitted = director.getAttribute('data-scene-committed');

    const samples = [];
    let running = true;
    const sample = () => {
      const roots = [...document.querySelectorAll('.scene-boundary')];
      const outgoing = roots.find((node) => node.getAttribute('data-scene-visual-role') === 'outgoing')
        ?? roots.find((node) => node[MARK] === 'committed')
        ?? roots.find((node) => node.getAttribute('data-scene-visual-role') === 'single');
      samples.push({
        phase: director.getAttribute('data-scene-phase') ?? '-',
        committed: director.getAttribute('data-scene-committed') ?? '',
        pending: director.getAttribute('data-scene-pending') ?? '',
        // The mark is the whole assertion: false means this is not the element that was here.
        retained: Boolean(outgoing?.[MARK]),
        role: outgoing?.getAttribute('data-scene-visual-role') ?? 'none',
        unresolved: outgoing?.getAttribute('data-scene-unresolved') ?? '',
        marked: roots.filter((node) => node[MARK]).length,
        roots: roots.length,
      });
      if (running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    document.querySelector(selector).click();
    await new Promise((resolve) => {
      const started = performance.now();
      const settle = () => {
        const phase = director.getAttribute('data-scene-phase');
        const moved = director.getAttribute('data-scene-committed') !== startedCommitted;
        if ((phase === 'current' && moved) || performance.now() - started > 20_000) resolve();
        else requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    });
    running = false;
    return { samples, startedCommitted, endedCommitted: director.getAttribute('data-scene-committed') };
  }, click);

  if (observed.error) {
    fail(observed.error);
  } else {
    const { samples, startedCommitted, endedCommitted } = observed;
    const transitioned = samples.some((entry) => entry.phase === 'loading' || entry.phase === 'entering');

    // A click that never moved the director proves nothing, and a silent pass here is how a
    // gate rots into decoration.
    if (!transitioned || startedCommitted === endedCommitted) {
      fail(
        'the click did not run a scene transition, so nothing was tested',
        `committed stayed ${startedCommitted}; phases seen: ${[...new Set(samples.map((s) => s.phase))].join(', ')}`,
      );
    }

    const rebuilt = samples.filter((entry) => !entry.retained && entry.phase !== 'current');
    if (rebuilt.length > 0) {
      const first = rebuilt[0];
      fail(
        'the outgoing scene was destroyed and rebuilt during its own replacement',
        `first seen in phase '${first.phase}' with ${first.roots} boundaries and ${first.marked} still carrying the original mount`
        + '\nThe player watches the screen they are leaving blink through its entrance before the crossfade starts.'
        + '\nThe layer key changed: see sceneLayerKey/committedEpoch in App.tsx (ADR-0557).',
      );
    }

    // A retained layer that re-enters loading is the same defect wearing a different hat: its
    // participants went back to unresolved, so its own loading presentation is on screen again.
    const regressed = samples.filter((entry) => entry.retained && entry.unresolved);
    if (regressed.length > 0) {
      fail(
        'the outgoing scene went back to loading while it was still on screen',
        `unresolved participants: ${[...new Set(regressed.map((entry) => entry.unresolved))].join(' | ')}`,
      );
    }

    if (!process.exitCode) {
      const phases = [...new Set(samples.map((entry) => entry.phase))].join(' → ');
      console.log(`PASS outgoing scene retained across ${startedCommitted} → ${endedCommitted}`);
      console.log(`     ${samples.length} frames observed, phases ${phases}`);
    }
  }
} catch (error) {
  fail('scene retention could not be observed', error?.stack ?? String(error));
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
