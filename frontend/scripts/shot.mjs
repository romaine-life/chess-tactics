#!/usr/bin/env node
// Deterministic UI screenshot tool — works on ANY live route, no per-target scaffolding.
//
// Why: the in-editor preview capture hangs on this machine, and naive full-page grabs are
// too many pixels. This drives the installed Chrome via puppeteer-core (no bundled browser
// download), navigates to a real route, freezes animation for determinism, and — given a
// CSS selector — clips the capture to that element's exact bounds. The result is a small,
// focused, repeatable PNG. Read it to view.
//
// Usage:
//   node scripts/shot.mjs <url> [--select <css>] [--out <path>] [--size <WxH>] [--ready <jsExpr>]
//     [--timeout <ms>] [--throttle slow-4g|slow-3g] [--cold] [--assert-menu-atomic]
//     [--full] [--show-scrollbars]
//
// Examples:
//   node scripts/shot.mjs http://127.0.0.1:5199/play/select/skirmish --select '.menu-dest'
//   node scripts/shot.mjs http://127.0.0.1:5199/unit-studio --select '.studio-stage' --out tmp-shots/unit.png
//   node scripts/shot.mjs http://127.0.0.1:5199/doodad-proof/focus.html   (whole small fixture page)

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const url = argv[0];
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const has = (name) => argv.includes(`--${name}`);

const select = flag('select');
const out = resolve(process.cwd(), flag('out', 'tmp-shots/shot.png'));
const [w, h] = String(flag('size', '1280x800')).split('x').map(Number);
const scale = Math.max(1, Number(flag('scale', 1)) || 1); // deviceScaleFactor — bump for small elements
const readyExpr = flag('ready');
const timeout = Math.max(1_000, Number(flag('timeout', 30_000)) || 30_000);
const throttle = flag('throttle');
const cold = has('cold');
const assertMenuAtomic = has('assert-menu-atomic');
const fullPage = has('full');
const showScrollbars = has('show-scrollbars');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!url || url.startsWith('--')) { console.error('usage: shot <url> [--select css] [--out path] [--size WxH] [--scale n] [--ready jsExpr] [--timeout ms] [--throttle slow-4g|slow-3g] [--cold] [--full]'); process.exit(2); }
if (!executablePath) { console.error('No Chrome/Edge found. Checked:\n' + CHROMES.join('\n')); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', ...(showScrollbars ? [] : ['--hide-scrollbars'])],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  if (assertMenuAtomic) {
    await page.evaluateOnNewDocument(() => {
      window.__ctMenuAtomicViolations = [];
      const sample = () => {
        const menu = document.querySelector('.main-menu-layer');
        if (menu) {
          const title = document.querySelector('.app-titlebar');
          const state = {
            bg: menu.hasAttribute('data-reveal-bg'),
            buttons: menu.hasAttribute('data-reveal-buttons'),
            title: Boolean(title && !title.classList.contains('reveal-pending')),
          };
          const count = Number(state.bg) + Number(state.buttons) + Number(state.title);
          if (count > 0 && count < 3) window.__ctMenuAtomicViolations.push(state);
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  const throttleProfiles = {
    // DevTools-style profiles. Throughput values are bytes/second.
    'slow-4g': { latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 },
    'slow-3g': { latency: 400, downloadThroughput: 500_000 / 8, uploadThroughput: 500_000 / 8 },
  };
  if (throttle && !throttleProfiles[throttle]) {
    console.error(`unknown throttle profile: ${throttle}`);
    process.exit(2);
  }
  if (cold || throttle) {
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    if (cold) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (throttle) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        connectionType: 'cellular4g',
        ...throttleProfiles[throttle],
      });
    }
  }
  // One navigation only: retrying a timed-out navigation silently doubles cold-load work.
  // Persistent ambience connections also make network-idle an invalid readiness signal.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

  // Determinism: kill animations/transitions so a live screen captures identically every run.
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;animation-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}` });

  // Readiness: explicit gate if given, else a quick best-effort wait on window.__ready (fixtures set it).
  await page.waitForFunction(readyExpr || 'window.__ready===true', { timeout: readyExpr ? timeout : 1200 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));

  if (assertMenuAtomic) {
    const violations = await page.evaluate(() => window.__ctMenuAtomicViolations || []);
    if (violations.length) {
      console.error(`menu exposed a partial frame: ${JSON.stringify(violations[0])}`);
      process.exitCode = 4;
      throw new Error('atomic menu assertion failed');
    }
  }

  if (select) {
    const el = await page.$(select);
    if (!el) { console.error(`selector not found: ${select}`); process.exit(3); }
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage });
  }
  const { size } = statSync(out);
  console.log(`wrote ${out} (${(size / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close();
}
