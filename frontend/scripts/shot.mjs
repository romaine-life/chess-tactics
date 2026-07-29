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
//     [--timeout <ms>] [--throttle slow-4g|slow-3g] [--cold|--warm] [--assert-menu-atomic]
//     [--assert-board-atomic] [--assert-shell-font-atomic] [--assert-surface-atomic <name>]
//     [--assert-bootstrap-priority]
//     [--assert-menu-host-continuity]
//     [--bootstrap-out <path>]
//     [--assert-editor-viewer]
//     [--abort-request <url-substring>] [--abort-request-once <url-substring>]
//     [--abort-request-until-retry <url-substring>] [--retry-scene-error]
//     [--click <selector>] [--click-ready <jsExpr>] [--assert-backdrop-continuity]
//     [--back-after-click-ms <ms>]
//     [--full] [--show-scrollbars] [--allow-motion]
//
// Examples:
//   node scripts/shot.mjs http://127.0.0.1:5199/play/select/skirmish --select '.menu-dest'
//   node scripts/shot.mjs http://127.0.0.1:5199/unit-studio --select '.studio-stage' --out tmp-shots/unit.png
//   node scripts/shot.mjs http://127.0.0.1:5199/doodad-proof/focus.html   (whole small fixture page)

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  isLevelEditorUrl,
  isObservationSessionState,
  observationOpenPostData,
} from './shot-editor-session.mjs';

const argv = process.argv.slice(2);
const url = argv[0];
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const has = (name) => argv.includes(`--${name}`);

const select = flag('select');
const out = resolve(process.cwd(), flag('out', 'tmp-shots/shot.png'));
const bootstrapOut = flag('bootstrap-out');
const [w, h] = String(flag('size', '1280x800')).split('x').map(Number);
const scale = Math.max(1, Number(flag('scale', 1)) || 1); // deviceScaleFactor — bump for small elements
const readyExpr = flag('ready');
const timeout = Math.max(1_000, Number(flag('timeout', 30_000)) || 30_000);
const throttle = flag('throttle');
const cold = has('cold');
const warm = has('warm');
const assertMenuAtomic = has('assert-menu-atomic');
const assertBoardAtomic = has('assert-board-atomic');
const assertShellFontAtomic = has('assert-shell-font-atomic');
const assertBootstrapPriority = has('assert-bootstrap-priority');
const assertMenuHostContinuity = has('assert-menu-host-continuity');
const assertSurfaceAtomic = flag('assert-surface-atomic');
const abortRequest = flag('abort-request');
const abortRequestOnce = flag('abort-request-once');
const abortRequestUntilRetry = flag('abort-request-until-retry');
const retrySceneError = has('retry-scene-error');
const allowSceneError = has('allow-scene-error');
const click = flag('click');
const clickReady = flag('click-ready');
const backAfterClickMs = flag('back-after-click-ms');
const assertBackdropContinuity = has('assert-backdrop-continuity');
const assertEditorViewer = has('assert-editor-viewer');
const fullPage = has('full');
const showScrollbars = has('show-scrollbars');
const allowMotion = has('allow-motion');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!url || url.startsWith('--')) { console.error('usage: shot <url> [--select css] [--out path] [--size WxH] [--scale n] [--ready jsExpr] [--timeout ms] [--throttle slow-4g|slow-3g] [--cold|--warm] [--full] [--allow-motion] [--assert-editor-viewer]'); process.exit(2); }
if (cold && warm) { console.error('--cold and --warm are mutually exclusive'); process.exit(2); }
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
  let resolveEditorViewer;
  const editorViewerRegistration = assertEditorViewer
    ? new Promise((resolveViewer) => { resolveEditorViewer = resolveViewer; })
    : null;
  const editorViewerForbiddenRequests = [];
  if (assertEditorViewer) {
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      const isEditorDocument = /\/api\/editor-documents\/[^/]+/.test(requestUrl.pathname);
      const isSessionOpen = request.method() === 'POST'
        && /\/api\/editor-documents\/[^/]+\/edit-sessions$/.test(requestUrl.pathname);
      const isTakeover = request.method() === 'POST' && requestUrl.pathname.endsWith('/takeover');
      const isWorkingMutation = request.method() === 'PUT'
        && /\/api\/editor-documents\/[^/]+$/.test(requestUrl.pathname);
      if (isEditorDocument && !isSessionOpen && (isTakeover || isWorkingMutation)) {
        editorViewerForbiddenRequests.push(`${request.method()} ${requestUrl.pathname}`);
      }
    });
    page.on('response', async (response) => {
      const request = response.request();
      const requestUrl = new URL(request.url());
      if (
        request.method() !== 'POST'
        || !/\/api\/editor-documents\/[^/]+\/edit-sessions$/.test(requestUrl.pathname)
      ) return;
      try {
        const requestBody = JSON.parse(request.postData() || '{}');
        const responseBody = await response.json();
        resolveEditorViewer({
          ok: response.ok(),
          status: response.status(),
          sessionState: responseBody.session?.state,
          activeSessionId: responseBody.presence?.active_editor?.session_id ?? null,
          sessionId: requestBody.session_id,
          sessionKey: requestBody.session_key,
          closePath: `${requestUrl.pathname}/${encodeURIComponent(requestBody.session_id)}`,
        });
      } catch {
        resolveEditorViewer({ ok: false, status: response.status() });
      }
    });
  }
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
          const directorCurrent = document.querySelector('[data-scene-phase="current"]');
          if (directorCurrent && count !== 3) {
            window.__ctMenuAtomicViolations.push({ ...state, directorCurrent: true });
          }
          if ((state.title && !state.bg) || (state.buttons && (!state.bg || !state.title))) {
            window.__ctMenuAtomicViolations.push(state);
          }
          if (count === 3) {
            const criticalImages = [
              ...menu.querySelectorAll('.settings-rail-frame img'),
              ...(title?.querySelectorAll('img') || []),
            ];
            const imagesComplete = criticalImages.length > 0
              && criticalImages.every((img) => img.complete && img.naturalWidth > 0);
            const backgroundPainted = Boolean(document.querySelector(
              '.scene-backdrop-canvas[data-homepage-scene-painted]',
            ));
            if (!imagesComplete || !backgroundPainted) {
              window.__ctMenuAtomicViolations.push({ ...state, imagesComplete, backgroundPainted });
            }
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
        const host = document.querySelector('.scene-homepage-background');
        const menu = document.querySelector('.main-menu-layer');
        const scene = host?.querySelector('.scene-backdrop');
        const canvas = scene?.querySelector('.scene-backdrop-canvas');
        const visible = Boolean(scene && canvas
          && Number.parseFloat(getComputedStyle(host).opacity) > 0.001
          && Number.parseFloat(getComputedStyle(scene).opacity) > 0.001
          && getComputedStyle(canvas).backgroundImage !== 'none');
        if (visible) window.__ctBackdropVisibleSeen = true;
        else if (window.__ctBackdropVisibleSeen) {
          window.__ctBackdropViolations.push({ host: Boolean(host), menu: Boolean(menu), scene: Boolean(scene), canvas: Boolean(canvas) });
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
        const status = document.querySelector('.app-bootstrap-status, .app-startup-status');
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
  if (assertMenuHostContinuity) {
    await page.evaluateOnNewDocument(() => {
      window.__ctMenuHostContinuity = {
        seen: false,
        violations: [],
        playSeen: false,
        playViolations: [],
      };
      window.__ctMenuHostRail = null;
      window.__ctPlayHostRail = null;
      const sample = () => {
        const director = document.querySelector('.scene-director');
        const boundary = document.querySelector('.scene-boundary');
        const rail = document.querySelector('[aria-label="Game modes"]');
        const playRail = document.querySelector('.play-source-rail[aria-label="Play"]');
        if (rail && !window.__ctMenuHostRail) window.__ctMenuHostRail = rail;
        if (playRail && !window.__ctPlayHostRail) window.__ctPlayHostRail = playRail;
        if (director?.classList.contains('is-host-preserving')) {
          window.__ctMenuHostContinuity.seen = true;
          const title = document.querySelector('.app-shell-titlebar');
          const railOpacity = rail ? Number.parseFloat(getComputedStyle(rail).opacity) : 0;
          const titleOpacity = title ? Number.parseFloat(getComputedStyle(title).opacity) : 0;
          const railInteractive = Boolean(
            rail
            && !rail.closest('[inert]')
            && getComputedStyle(rail).pointerEvents !== 'none'
          );
          if (
            !rail
            || rail !== window.__ctMenuHostRail
            || !rail.isConnected
            || railOpacity < 0.99
            || titleOpacity < 0.99
            || !railInteractive
          ) {
            window.__ctMenuHostContinuity.violations.push({
              phase: director.getAttribute('data-scene-phase'),
              rail: Boolean(rail),
              sameRail: rail === window.__ctMenuHostRail,
              connected: Boolean(rail?.isConnected),
              railOpacity,
              titleOpacity,
              railInteractive,
            });
          }
        }
        if (
          director?.classList.contains('is-host-preserving')
          && boundary?.getAttribute('data-transition-region') === 'play-shell'
        ) {
          window.__ctMenuHostContinuity.playSeen = true;
          const playRailOpacity = playRail ? Number.parseFloat(getComputedStyle(playRail).opacity) : 0;
          const playRailInteractive = Boolean(
            playRail
            && !playRail.closest('[inert]')
            && getComputedStyle(playRail).pointerEvents !== 'none'
          );
          const phase = director.getAttribute('data-scene-phase');
          const committed = director.getAttribute('data-scene-committed');
          const pending = director.getAttribute('data-scene-pending');
          const content = document.querySelector('[data-scene-region="play-shell"]');
          const mounted = content?.getAttribute('data-scene-instance') ?? null;
          const contentOpacity = content ? Number.parseFloat(getComputedStyle(content).opacity) : 0;
          const contentVisibilityViolation = (
            phase === 'exiting' && mounted !== committed
          ) || (
            phase === 'loading'
            && mounted === pending
            && contentOpacity > 0.001
          );
          if (
            !playRail
            || playRail !== window.__ctPlayHostRail
            || !playRail.isConnected
            || playRailOpacity < 0.99
            || !playRailInteractive
            || contentVisibilityViolation
          ) {
            window.__ctMenuHostContinuity.playViolations.push({
              phase,
              playRail: Boolean(playRail),
              samePlayRail: playRail === window.__ctPlayHostRail,
              connected: Boolean(playRail?.isConnected),
              playRailOpacity,
              playRailInteractive,
              committed,
              pending,
              mounted,
              contentOpacity,
              contentVisibilityViolation,
            });
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }
  if (assertBootstrapPriority) {
    await page.evaluateOnNewDocument(() => {
      window.__ctBootstrapPriority = { visibleAt: null, exitingAt: null };
      const sample = () => {
        const status = document.querySelector('#app-bootstrap-status');
        if (status) {
          const visible = getComputedStyle(status).visibility !== 'hidden'
            && Number.parseFloat(getComputedStyle(status).opacity) > 0.001;
          if (visible && window.__ctBootstrapPriority.visibleAt === null) {
            window.__ctBootstrapPriority.visibleAt = performance.now();
          }
          if (
            status.classList.contains('is-exiting')
            && window.__ctBootstrapPriority.exitingAt === null
          ) {
            window.__ctBootstrapPriority.exitingAt = performance.now();
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
  // The isolated browser has no owner cookies. Acquire the backend's loopback-only dev session
  // through its real sign-in endpoint before opening a private route. This remains available when
  // the verified device grant's remote JWKS endpoint is temporarily unreachable; it never runs
  // for a non-loopback target.
  const target = new URL(url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const authResponse = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout });
    if (!authResponse?.ok()) throw new Error(`local screenshot sign-in failed (${authResponse?.status() ?? 'no response'})`);
    const authState = await page.evaluate(() => {
      try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
    });
    if (!authState?.signed_in) throw new Error('local screenshot sign-in did not establish the owner session');
  }

  // Visual verification is an authenticated observer, never a synthetic writer. Patch only the
  // Level Editor's session-open request. The optional failure injection shares this one
  // interception handler so a Level Editor capture never tries to continue the same request twice.
  const targetIsLevelEditor = isLevelEditorUrl(url);
  let retryFailureReleased = false;
  if (targetIsLevelEditor || abortRequest || abortRequestOnce || abortRequestUntilRetry) {
    let abortedOnce = false;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const abortAlways = abortRequest && request.url().includes(String(abortRequest));
      const abortFirst = !abortedOnce
        && abortRequestOnce
        && request.url().includes(String(abortRequestOnce));
      const abortUntilRetry = !retryFailureReleased
        && abortRequestUntilRetry
        && request.url().includes(String(abortRequestUntilRetry));
      if (abortAlways || abortFirst || abortUntilRetry) {
        if (abortFirst) abortedOnce = true;
        void request.abort('failed');
        return;
      }
      const postData = observationOpenPostData({
        targetIsLevelEditor,
        method: request.method(),
        requestUrl: request.url(),
        postData: request.postData(),
      });
      if (!postData) { void request.continue(); return; }
      const headers = { ...request.headers() };
      delete headers['content-length'];
      void request.continue({ headers, postData });
    });
  }

  // A warm assertion deliberately completes the same route once in this browser, then
  // reloads with its populated HTTP cache. Ordinary and cold assertions still perform
  // exactly one target navigation; a timed-out navigation is never silently retried.
  // Persistent ambience connections make network-idle an invalid readiness signal.
  if (warm) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(
      "Boolean(document.querySelector('[data-scene-phase=\"current\"]'))",
      { timeout },
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout });
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  }
  if (bootstrapOut) {
    await page.waitForFunction(
      `(() => {
        const status = document.querySelector('#app-bootstrap-status.is-font-ready');
        return Boolean(status)
          && Number.parseFloat(getComputedStyle(status).opacity) > 0.99
          && document.fonts.check('19px "Advance Wars 2 GBA"', status.textContent || 'Loading...');
      })()`,
      { timeout },
    );
    const bootstrapPath = resolve(process.cwd(), String(bootstrapOut));
    mkdirSync(dirname(bootstrapPath), { recursive: true });
    await page.screenshot({ path: bootstrapPath, fullPage: false });
    console.log(`wrote early bootstrap ${bootstrapPath}`);
  }
  if (click) {
    if (clickReady) await page.waitForFunction(clickReady, { timeout });
    await page.waitForSelector(String(click), { visible: true, timeout });
    if (assertBackdropContinuity) {
      const outgoingBackdropVisible = await page.evaluate(() => {
        const host = document.querySelector('.scene-homepage-background');
        const scene = host?.querySelector('.scene-backdrop');
        const canvas = scene?.querySelector('.scene-backdrop-canvas');
        const visible = Boolean(scene && canvas
          && Number.parseFloat(getComputedStyle(host).opacity) > 0.001
          && Number.parseFloat(getComputedStyle(scene).opacity) > 0.001
          && getComputedStyle(canvas).backgroundImage !== 'none');
        if (visible) window.__ctBackdropVisibleSeen = true;
        return visible;
      });
      if (!outgoingBackdropVisible) {
        throw new Error('outgoing homepage backdrop was not painted before navigation');
      }
    }
    await page.click(String(click));
    if (backAfterClickMs !== undefined) {
      const clickedHref = page.url();
      const delay = Math.max(0, Number(backAfterClickMs) || 0);
      if (delay) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      await page.evaluate(() => window.history.back());
      await page.waitForFunction(
        (departedUrl) => window.location.href !== departedUrl,
        { timeout },
        clickedHref,
      ).catch(() => {});
    }
  }
  if (assertMenuHostContinuity && !click) {
    await page.waitForFunction(
      `Boolean(
        document.querySelector('[data-scene-phase="current"]')
        && document.querySelector('.main-menu-mode-tab[data-nav="/play/select/skirmish"]')
      )`,
      { timeout },
    ).catch(async (error) => {
      const state = await page.evaluate(() => ({
        phase: document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase'),
        error: document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-error'),
        boundary: document.querySelector('[data-scene-generation]')?.getAttribute('data-scene'),
        menu: Boolean(document.querySelector('.main-menu-mode-tab')),
        bootstrap: document.querySelector('#app-bootstrap-status')?.className,
      }));
      console.error(`menu host initial scene unavailable: ${JSON.stringify(state)}`);
      throw error;
    });
    await page.click('.main-menu-mode-tab[data-nav="/play/select/skirmish"]');
    await page.waitForFunction(
      `Boolean(
        document.querySelector('[data-scene-phase="current"]')
        && document.querySelector('.main-menu-mode-tab[data-nav="/play/select/campaign/off-c-crown-valoria"]')
      )`,
      { timeout },
    );
    await page.click('.main-menu-mode-tab[data-nav="/play/select/campaign/off-c-crown-valoria"]');
    await page.waitForFunction(
      `document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'exiting'`,
      { timeout },
    );
    await page.click('.main-menu-mode-tab[data-nav="/play/select/levels"]');
  }
  if (retrySceneError) {
    await page.waitForSelector('[data-scene-phase="error"] .scene-loading-presentation button', {
      visible: true,
      timeout,
    });
    const failedGeneration = await page.$eval(
      '[data-scene-generation]',
      (node) => Number(node.getAttribute('data-scene-generation')),
    );
    retryFailureReleased = true;
    await page.click('[data-scene-phase="error"] .scene-loading-presentation button');
    await page.waitForFunction(
      (generation) => {
        const scene = document.querySelector('[data-scene-phase="current"]');
        const boundary = document.querySelector('[data-scene-generation]');
        return Boolean(scene && boundary)
          && Number(boundary.getAttribute('data-scene-generation')) > generation;
      },
      { timeout },
      failedGeneration,
    );
  }

  // An explicit readiness contract is an assertion: the explicit gate fails closed. The implicit fixture gate stays
  // best-effort so this generic tool can still capture ordinary live routes without `window.__ready`.
  if (readyExpr) await page.waitForFunction(readyExpr, { timeout });
  else await page.waitForFunction('window.__ready===true', { timeout: 1200 }).catch(() => {});

  // The scene director is the one route-level lifecycle owner. Freezing animation while it
  // is exiting/loading/entering would strand a partial composition, so explicit captures
  // fail closed until the director reports a terminal complete scene or an
  // explicitly requested coherent error scene.
  const isManagedApp = await page.evaluate(() => Array.from(
    document.querySelectorAll('script[type="module"][src]'),
  ).some((script) => (script.getAttribute('src') || '').includes('/src/main.tsx')));
  const requiresTerminalScene = Boolean(
    isManagedApp || readyExpr || assertMenuAtomic || assertBoardAtomic || assertShellFontAtomic
    || assertSurfaceAtomic || assertBackdropContinuity || assertBootstrapPriority
    || assertMenuHostContinuity,
  );
  const waitForSettledScene = page.waitForFunction(
    "Boolean(document.querySelector('[data-scene-phase]')) && !document.querySelector('[data-scene-phase]:not([data-scene-phase=\"current\"]):not([data-scene-phase=\"error\"])')",
    { timeout: requiresTerminalScene ? timeout : 1200 },
  );
  if (requiresTerminalScene) {
    try {
      await waitForSettledScene;
    } catch (error) {
      const state = await page.evaluate(() => {
        const director = document.querySelector('[data-scene-phase]');
        const boundary = document.querySelector('[data-scene-generation]');
        return {
          href: window.location.href,
          phase: director?.getAttribute('data-scene-phase') ?? null,
          error: director?.getAttribute('data-scene-error') ?? null,
          scene: boundary?.getAttribute('data-scene') ?? null,
          generation: boundary?.getAttribute('data-scene-generation') ?? null,
          participants: boundary?.getAttribute('data-scene-participants') ?? null,
          unresolved: boundary?.getAttribute('data-scene-unresolved') ?? null,
        };
      });
      console.error(`scene did not settle: ${JSON.stringify(state)}`);
      throw error;
    }
  } else await waitForSettledScene.catch(() => {});
  if (assertMenuAtomic) {
    await page.waitForFunction(
      `(() => {
        const menu = document.querySelector('.main-menu-layer[data-reveal-bg][data-reveal-buttons]');
        const controls = document.querySelector('.main-menu-twin-screen');
        const title = document.querySelector('.app-titlebar:not(.reveal-pending)');
        const background = document.querySelector('.scene-homepage-background');
        return Boolean(menu && controls && title && background)
          && Number.parseFloat(getComputedStyle(controls).opacity) > 0.99
          && Number.parseFloat(getComputedStyle(title).opacity) > 0.99
          && Number.parseFloat(getComputedStyle(background).opacity) > 0.99;
      })()`,
      { timeout },
    );
  }
  const terminalScene = await page.$eval('[data-scene-phase]', (node) => ({
    phase: node.getAttribute('data-scene-phase'),
    error: node.getAttribute('data-scene-error'),
  })).catch(() => null);
  if (terminalScene?.phase === 'error') {
    console.error(`scene terminal error: ${terminalScene.error || 'unknown'}`);
    if (!allowSceneError) {
      process.exitCode = 13;
      throw new Error('unexpected terminal scene error');
    }
  }

  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

  // Determinism starts only after app readiness and screen entrance settlement, so disabling
  // animation cannot change the visible lifecycle state that the capture is meant to prove.
  // Callers using --allow-motion keep production animation behavior after that readiness gate.
  if (!allowMotion) {
    await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;animation-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}` });
  }
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
  if (assertMenuHostContinuity) {
    const result = await page.evaluate(() => window.__ctMenuHostContinuity);
    if (
      !result?.seen
      || result.violations.length
      || !result.playSeen
      || result.playViolations.length
    ) {
      console.error(`menu host continuity failed: ${JSON.stringify(result)}`);
      process.exitCode = 15;
      throw new Error('menu host continuity assertion failed');
    }
    console.log(`menu host continuity OK: ${JSON.stringify(result)}`);
  }
  if (assertEditorViewer && targetIsLevelEditor) {
    const editorFrame = await page.$eval('[data-testid="level-editor"]', (node) => ({
      authority: node.getAttribute('data-editor-authority'),
      terrain: node.getAttribute('data-editor-terrain'),
      scene: node.getAttribute('data-editor-scene'),
      frame: node.getAttribute('data-editor-frame'),
      inert: node.inert,
      opacity: Number.parseFloat(getComputedStyle(node).opacity),
    })).catch(() => null);
    if (
      !editorFrame
      || editorFrame.authority !== 'ready'
      || !['painted', 'predrawn'].includes(editorFrame.terrain || '')
      || editorFrame.scene !== 'painted'
      || editorFrame.frame !== 'painted'
      || editorFrame.inert
      || editorFrame.opacity < 0.99
    ) {
      console.error(`editor exposed an incomplete frame: ${JSON.stringify(editorFrame)}`);
      process.exitCode = 12;
      throw new Error('atomic editor assertion failed');
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
  if (assertBootstrapPriority) {
    const result = await page.evaluate(async () => {
      const projection = await window.__ctBootstrapScene;
      const backgroundUrl = projection?.scene?.background?.immutableUrl || '';
      const entries = performance.getEntriesByType('resource');
      const start = (part) => entries.find((entry) => entry.name.includes(part))?.startTime ?? null;
      return {
        ...window.__ctBootstrapPriority,
        bootstrapStart: start('/api/app-bootstrap-scene'),
        mainStart: start('/src/main.tsx'),
        backgroundStart: backgroundUrl ? start(backgroundUrl) : null,
        catalogStarts: [
          start('/api/asset-catalog'),
          start('/api/drawable-catalog'),
          start('/api/unit-catalog'),
        ],
        backgroundUrl,
      };
    });
    const catalogStarts = result.catalogStarts.filter((value) => value !== null);
    const visibleDuration = result.visibleAt !== null && result.exitingAt !== null
      ? result.exitingAt - result.visibleAt
      : null;
    const ordered = result.bootstrapStart !== null
      && result.mainStart !== null
      && result.backgroundStart !== null
      && catalogStarts.length === 3
      && catalogStarts.every((start) => result.bootstrapStart < start)
      && catalogStarts.every((start) => result.backgroundStart < start);
    if (!ordered || visibleDuration === null || visibleDuration < 350) {
      console.error(`bootstrap priority failed: ${JSON.stringify({ ...result, visibleDuration })}`);
      process.exitCode = 14;
      throw new Error('bootstrap priority assertion failed');
    }
    console.log(`bootstrap priority OK: ${JSON.stringify({ ...result, visibleDuration })}`);
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
      if (readyExpr) await page.waitForFunction(readyExpr, { timeout });
      el = await page.$(select);
      if (!el) { console.error(`selector disappeared after measured viewport resize: ${select}`); process.exit(3); }
    }
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage });
  }

  // A headless Level Editor page can become the writer when no owner tab currently holds the
  // lease. Closing Chrome directly then lets that synthetic lease expire, which manufactures a
  // recovery copy and makes visual verification pollute the recovery UI it is inspecting. Leave
  // through the app's normal navigation blocker so it closes even an observing session (and
  // final-autosaves a real writer) before this isolated browser exits.
  // Events is a nested URL-addressed workspace: its first app departure closes Events and
  // intentionally remains in the Level Editor. Repeat the same normal departure until the
  // editor route is actually released. Ordinary editor routes leave on the first attempt.
  for (let exitAttempt = 0; exitAttempt < 3 && isLevelEditorUrl(page.url()); exitAttempt += 1) {
    const previousUrl = page.url();
    await page.evaluate(() => {
      const exit = document.createElement('a');
      exit.href = '/editor';
      exit.hidden = true;
      document.body.append(exit);
      exit.click();
      exit.remove();
    });
    await page.waitForFunction(
      (before) => location.href !== before,
      { timeout: Math.min(timeout, 5_000) },
      previousUrl,
    ).catch(() => {});
  }
  if (isLevelEditorUrl(page.url())) {
    throw new Error(`Level Editor observer session did not release after nested-workspace cleanup: ${page.url()}`);
  }
  const { size } = statSync(out);
  console.log(`wrote ${out} (${(size / 1024).toFixed(1)} KB)`);
  if (assertEditorViewer) {
    const viewerTimeout = new Promise((resolveViewer) => {
      setTimeout(() => resolveViewer(null), Math.min(timeout, 10_000));
    });
    const viewer = await Promise.race([editorViewerRegistration, viewerTimeout]);
    if (
      !viewer?.ok
      || !isObservationSessionState(viewer.sessionState)
      || !viewer.sessionId
      || !viewer.sessionKey
      || editorViewerForbiddenRequests.length
    ) {
      console.error(
        `editor viewer assertion failed: ${JSON.stringify({
          viewer,
          forbiddenRequests: editorViewerForbiddenRequests,
        })}`,
      );
      process.exitCode = 6;
      throw new Error('editor viewer assertion failed');
    }
    const closeResult = await page.evaluate(async ({ closePath, sessionKey }) => {
      const response = await fetch(closePath, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_key: sessionKey }),
      });
      return { ok: response.ok, status: response.status };
    }, viewer);
    if (!closeResult.ok) {
      console.error(`editor viewer cleanup returned HTTP ${closeResult.status}`);
      process.exitCode = 6;
      throw new Error('editor viewer cleanup failed');
    }
    console.log(`editor viewer stayed lease-free and closed cleanly${viewer.activeSessionId ? ' while another writer remained active' : ''}`);
  }
} finally {
  await browser.close();
}
