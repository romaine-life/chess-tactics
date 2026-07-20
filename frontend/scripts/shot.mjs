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
//     [--assert-board-atomic] [--assert-shell-font-atomic] [--assert-surface-atomic <name>]
//     [--abort-request <url-substring>]
//     [--click <selector>] [--click-ready <jsExpr>] [--assert-backdrop-continuity]
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
const assertBoardAtomic = has('assert-board-atomic');
const assertShellFontAtomic = has('assert-shell-font-atomic');
const assertSurfaceAtomic = flag('assert-surface-atomic');
const abortRequest = flag('abort-request');
const click = flag('click');
const clickReady = flag('click-ready');
const assertBackdropContinuity = has('assert-backdrop-continuity');
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
  if (abortRequest) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().includes(String(abortRequest))) void request.abort('failed');
      else void request.continue();
    });
  }
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
          if (count === 3) {
            const criticalImages = [
              ...menu.querySelectorAll('.settings-rail-frame img'),
              ...(title?.querySelectorAll('img') || []),
            ];
            const imagesComplete = criticalImages.length > 0
              && criticalImages.every((img) => img.complete && img.naturalWidth > 0);
            if (!imagesComplete) window.__ctMenuAtomicViolations.push({ ...state, imagesComplete });
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  if (assertBackdropContinuity) {
    await page.evaluateOnNewDocument(() => {
      window.__ctBackdropVisibleSeen = false;
      window.__ctBackdropViolations = [];
      const sample = () => {
        const menu = document.querySelector('.main-menu-layer');
        const scene = menu?.querySelector('.scene-backdrop');
        const canvas = scene?.querySelector('.scene-backdrop-canvas');
        const visible = Boolean(scene && canvas
          && Number.parseFloat(getComputedStyle(scene).opacity) > 0.001
          && getComputedStyle(canvas).backgroundImage !== 'none');
        if (visible) window.__ctBackdropVisibleSeen = true;
        else if (window.__ctBackdropVisibleSeen) {
          window.__ctBackdropViolations.push({ menu: Boolean(menu), scene: Boolean(scene), canvas: Boolean(canvas) });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  if (assertBoardAtomic) {
    await page.evaluateOnNewDocument(() => {
      window.__ctBoardAtomicViolations = [];
      window.__ctBoardAtomicSeen = 0;
      const required = ['terrain', 'barriers', 'scene'];
      const sample = () => {
        for (const board of document.querySelectorAll('.skirmish-board-lab')) {
          window.__ctBoardAtomicSeen += 1;
          const layers = new Set((board.getAttribute('data-painted-layers') || '').split(',').filter(Boolean));
          const complete = required.every((layer) => layers.has(layer));
          const loading = board.classList.contains('is-board-loading');
          const failed = board.classList.contains('is-board-error');
          const opacity = Number.parseFloat(getComputedStyle(board).opacity);
          if (!failed && ((!loading && !complete) || (loading && opacity > 0.001) || (loading && !board.inert))) {
            window.__ctBoardAtomicViolations.push({ layers: [...layers], loading, failed, opacity, inert: board.inert });
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  if (assertShellFontAtomic) {
    await page.evaluateOnNewDocument(() => {
      window.__ctShellFontSamples = 0;
      window.__ctShellFontViolations = [];
      const sample = () => {
        const status = document.querySelector('.app-startup-status');
        if (status) {
          window.__ctShellFontSamples += 1;
          const style = getComputedStyle(status);
          const visible = style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.001;
          const finalFace = style.fontFamily.includes('Advance Wars 2 GBA')
            && document.fonts.check('19px "Advance Wars 2 GBA"', status.textContent || 'Loading live assets');
          if (visible && !finalFace) {
            window.__ctShellFontViolations.push({ fontFamily: style.fontFamily, visibility: style.visibility });
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  if (assertSurfaceAtomic) {
    await page.evaluateOnNewDocument((surfaceName) => {
      window.__ctSurfaceAtomicSeen = 0;
      window.__ctSurfaceAtomicViolations = [];
      const sample = () => {
        const surface = document.querySelector(`[data-loading-surface="${CSS.escape(surfaceName)}"]`);
        if (surface) {
          window.__ctSurfaceAtomicSeen += 1;
          const content = surface.querySelector('.painted-surface-content');
          const loading = surface.classList.contains('is-loading');
          const failed = surface.classList.contains('is-error');
          const childrenVisible = content
            ? [...content.children].some((child) => getComputedStyle(child).visibility !== 'hidden')
            : false;
          const imagesComplete = content
            ? [...content.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0)
            : false;
          if (!failed && ((loading && (childrenVisible || !content?.inert)) || (!loading && !imagesComplete))) {
            window.__ctSurfaceAtomicViolations.push({ loading, failed, childrenVisible, inert: content?.inert, imagesComplete });
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, String(assertSurfaceAtomic));
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

  if (click) {
    if (clickReady) await page.waitForFunction(clickReady, { timeout });
    await page.waitForSelector(String(click), { visible: true, timeout });
    await page.click(String(click));
  }

  // Readiness: explicit gate if given, else a quick best-effort wait on window.__ready (fixtures set it).
  if (readyExpr) {
    // An explicit readiness contract is an assertion, not a best-effort delay. Swallowing
    // its timeout produced screenshots of blank/partial surfaces that looked like passes.
    await page.waitForFunction(readyExpr, { timeout });
  } else {
    await page.waitForFunction('window.__ready===true', { timeout: 1200 }).catch(() => {});
  }
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
  if (assertBackdropContinuity) {
    const result = await page.evaluate(() => ({
      seen: window.__ctBackdropVisibleSeen || false,
      violations: window.__ctBackdropViolations || [],
    }));
    if (!result.seen || result.violations.length) {
      console.error(`homepage backdrop continuity failed: ${JSON.stringify(result)}`);
      process.exitCode = 8;
      throw new Error('homepage backdrop continuity assertion failed');
    }
  }
  if (assertBoardAtomic) {
    const result = await page.evaluate(() => ({
      violations: window.__ctBoardAtomicViolations || [],
      seen: window.__ctBoardAtomicSeen || 0,
    }));
    if (!result.seen) {
      console.error('atomic board assertion observed no skirmish board');
      process.exitCode = 5;
      throw new Error('atomic board assertion had no target');
    }
    const violations = result.violations;
    if (violations.length) {
      console.error(`board exposed a partial or interactive frame: ${JSON.stringify(violations[0])}`);
      process.exitCode = 5;
      throw new Error('atomic board assertion failed');
    }
  }
  if (assertShellFontAtomic) {
    const result = await page.evaluate(() => ({
      violations: window.__ctShellFontViolations || [],
      samples: window.__ctShellFontSamples || 0,
    }));
    if (!result.samples) {
      console.error('atomic shell-font assertion observed no startup status');
      process.exitCode = 6;
      throw new Error('atomic shell-font assertion had no target');
    }
    if (result.violations.length) {
      console.error(`startup status exposed a fallback-font frame: ${JSON.stringify(result.violations[0])}`);
      process.exitCode = 6;
      throw new Error('atomic shell-font assertion failed');
    }
  }
  if (assertSurfaceAtomic) {
    const result = await page.evaluate(() => ({
      violations: window.__ctSurfaceAtomicViolations || [],
      seen: window.__ctSurfaceAtomicSeen || 0,
    }));
    if (!result.seen) {
      console.error(`atomic surface assertion observed no ${assertSurfaceAtomic} surface`);
      process.exitCode = 7;
      throw new Error('atomic surface assertion had no target');
    }
    if (result.violations.length) {
      console.error(`surface exposed a partial or interactive frame: ${JSON.stringify(result.violations[0])}`);
      process.exitCode = 7;
      throw new Error('atomic surface assertion failed');
    }
  }

  if (select) {
    let el = await page.$(select);
    if (!el) { console.error(`selector not found: ${select}`); process.exit(3); }

    // Canvas-backed elements outside the viewport can be captured at the right dimensions while
    // Chrome leaves the off-viewport pixels unpainted. Grow the viewport from the selector's
    // measured CSS bounds before taking the element screenshot so large boards are complete
    // without callers guessing or hard-coding an image size.
    const initialBox = await el.boundingBox();
    if (!initialBox) { console.error(`selector has no rendered bounds: ${select}`); process.exit(3); }
    const viewport = page.viewport() ?? { width: w, height: h, deviceScaleFactor: scale };
    const measuredWidth = Math.max(viewport.width, Math.ceil(initialBox.width));
    const measuredHeight = Math.max(viewport.height, Math.ceil(initialBox.height));
    if (measuredWidth !== viewport.width || measuredHeight !== viewport.height) {
      await page.setViewport({ width: measuredWidth, height: measuredHeight, deviceScaleFactor: scale });
      await page.evaluate(() => new Promise((resolveFrame) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolveFrame));
      }));
      el = await page.$(select);
      if (!el) { console.error(`selector disappeared after measured viewport resize: ${select}`); process.exit(3); }
    }
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage });
  }
  const { size } = statSync(out);
  console.log(`wrote ${out} (${(size / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close();
}
