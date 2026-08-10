#!/usr/bin/env node
// GATE: pressing a control must never take the screen away from the player.
//
// Usage: npm run verify:no-freeze -- '<url>' --click '<css>' [--budget <ms>] [--settle <ms>]
//
// Why this exists: the app has an elaborate loading system — a director, ordered phases, a
// loading presentation, a cold-load ladder — and every one of those ADRs is about how waiting
// LOOKS. Not one of them asked whether the main thread stays free while it happens, and nothing
// measured it, so it silently was not: pressing the Enchiridion's card catalog produced a single
// 1194ms task with no paint anywhere in it (ADR-0562/0563). The menu's rain is a rAF canvas draw
// and its waterfalls animate `background-position` under `steps()` — a main-thread property that
// is never composited — so the whole screen stopped dead, and so did input.
//
// The owner's requirement is not "load faster". Loading may take as long as it likes. It may not
// block. That is a property no unit test can see and no screenshot can show, because both look
// perfect either way: the only evidence is whether frames kept being painted WHILE the work ran.
//
// So this drives the real app, presses a real control, and reads the gaps between real animation
// frames. A gap is a stretch where the player got nothing — no rain, no waterfall, no response.

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 || at === args.length - 1 ? fallback : args[at + 1];
};
const url = args[0];
const click = flag('click');
const budget = Number(flag('budget', '250'));
const settle = Number(flag('settle', '1200'));
const watchFor = Number(flag('watch', '4500'));

if (!url || url.startsWith('--') || !click) {
  console.error("usage: verify-no-ui-block <url> --click '<css>' [--budget ms] [--settle ms] [--watch ms]");
  process.exit(2);
}

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) {
  console.error(`No Chrome/Edge found. Checked:\n${CHROMES.join('\n')}`);
  process.exit(1);
}

// Frame gaps, not CPU profiles: a profile says where time went, this says whether the player saw
// anything. Only the second one is the requirement.
const watchFrames = () => {
  window.__uiBlockStart = performance.now();
  window.__uiBlockFrames = [];
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    window.__uiBlockFrames.push({
      at: Math.round(now - window.__uiBlockStart),
      gap: Math.round(now - last),
    });
    last = now;
    window.__uiBlockRaf = requestAnimationFrame(tick);
  };
  window.__uiBlockRaf = requestAnimationFrame(tick);
};

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-gpu', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars',
  ],
});

let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

  // A press only counts once the director has settled. Clicking through startup measures the
  // startup, not the press.
  await page.waitForFunction(
    () => document.querySelector('.scene-director')?.dataset.scenePhase === 'current',
    { timeout: 90000, polling: 'raf' },
  );
  await page.waitForSelector(click, { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, settle));

  await page.evaluate(watchFrames);
  await page.click(click);
  await new Promise((resolve) => setTimeout(resolve, watchFor));

  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__uiBlockRaf);
    return window.__uiBlockFrames;
  });
  if (frames.length < 2) {
    console.error('✗ verify-no-ui-block: no frames were sampled — the page never animated at all');
    failed = true;
  } else {
    const over = frames.filter((frame) => frame.gap > budget);
    const worst = frames.reduce((a, b) => (b.gap > a.gap ? b : a));
    const summary = `${frames.length} frames over ${watchFor}ms, worst gap ${worst.gap}ms at ${worst.at}ms`;
    if (over.length) {
      failed = true;
      console.error(`✗ verify-no-ui-block: the screen stopped for longer than the ${budget}ms budget`);
      console.error(`  ${summary}`);
      console.error(`  gaps over budget: ${over.map((frame) => `${frame.gap}ms@${frame.at}ms`).join(', ')}`);
      console.error('  The work does not have to be faster — it has to be interruptible. Put it up in');
      console.error('  pieces with a paint between them (shared/useProgressiveMount), and keep DOM');
      console.error('  measurement out of the render phase. See ADR-0562 and ADR-0563.');
    } else {
      console.log(`✓ verify-no-ui-block: nothing blocked past ${budget}ms — ${summary}`);
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
