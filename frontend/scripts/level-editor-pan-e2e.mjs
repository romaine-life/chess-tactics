#!/usr/bin/env node
// Live-input E2E for ADR-0128: a real secondary-button drag that begins on an
// editable board hit target must move the shared ViewPane and suppress Chrome's
// context menu. Source-structure tests cannot catch an overlay that shields the
// viewport, so this check deliberately uses hit-tested mouse input.
//
// Usage: npm run e2e:level-editor-pan -- <full-level-editor-url>

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import {
  assertObservationPatchConsumed,
  installObservationSessionPatch,
  isLevelEditorUrl,
  isObservationSessionState,
  watchEditSessionOpens,
} from './shot-editor-session.mjs';

const url = process.argv[2];
if (!url || !isLevelEditorUrl(url)) {
  console.error('usage: npm run e2e:level-editor-pan -- <full-level-editor-url>');
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
  console.error('No Chrome/Edge found.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.setDefaultTimeout(30_000);

  await page.evaluateOnNewDocument(() => {
    window.__levelEditorContextMenus = [];
    window.addEventListener('contextmenu', (event) => {
      window.__levelEditorContextMenus.push({
        defaultPrevented: event.defaultPrevented,
        targetClass: event.target instanceof Element ? event.target.className : '',
      });
    });
  });

  const target = new URL(url);
  const signIn = new URL('/api/auth/sign-in', target);
  signIn.searchParams.set('returnTo', '/api/auth/me');
  const authResponse = await page.goto(signIn.href, { waitUntil: 'domcontentloaded' });
  if (!authResponse?.ok()) throw new Error(`local sign-in failed (${authResponse?.status() ?? 'no response'})`);
  const authState = await page.evaluate(() => {
    try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
  });
  if (!authState?.signed_in) throw new Error('local sign-in did not establish the owner session');

  let resolveViewer;
  const viewerRegistration = new Promise((resolve) => { resolveViewer = resolve; });
  const forbiddenRequests = [];
  page.on('response', async (response) => {
    const request = response.request();
    const requestUrl = new URL(request.url());
    if (
      request.method() !== 'POST'
      || !/\/api\/editor-documents\/[^/]+\/edit-sessions$/.test(requestUrl.pathname)
    ) return;
    try {
      const requestBody = JSON.parse(request.postData() || '{}');
      const body = await response.json();
      resolveViewer({
        ok: response.ok(),
        state: body.session?.state,
        sessionId: requestBody.session_id,
        sessionKey: requestBody.session_key,
        closePath: `${requestUrl.pathname}/${encodeURIComponent(requestBody.session_id)}`,
      });
    } catch {
      resolveViewer({ ok: false, state: null });
    }
  });

  // Watching requests needs no CDP interception, and deliberately does not use it: interception
  // routes the page's whole module graph through this process and wedges Vite dev-server module
  // requests indefinitely (see installObservationSessionPatch). This proof loads the editor board's
  // lazily-imported modules, so it carried that hang risk for nothing.
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const isEditorDocument = /\/api\/editor-documents\/[^/]+/.test(requestUrl.pathname);
    const isTakeover = request.method() === 'POST' && requestUrl.pathname.endsWith('/takeover');
    const isWorkingMutation = request.method() === 'PUT'
      && /\/api\/editor-documents\/[^/]+$/.test(requestUrl.pathname);
    if (isEditorDocument && (isTakeover || isWorkingMutation)) {
      forbiddenRequests.push(`${request.method()} ${requestUrl.pathname}`);
    }
  });
  const editSessionOpens = watchEditSessionOpens(page);
  await installObservationSessionPatch(page);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => {
      const stage = document.querySelector('.tileset-view-stage[aria-label="Level editor board"]');
      return !document.getElementById('app-bootstrap-status')
        && stage
        && getComputedStyle(stage).pointerEvents !== 'none'
        && document.querySelector('.tileset-cell-hit');
    }, { timeout: 60_000 });
  } catch (error) {
    const readiness = await page.evaluate(() => {
      const stage = document.querySelector('.tileset-view-stage[aria-label="Level editor board"]');
      const inert = stage?.closest('[inert]');
      const boundary = stage?.closest('[data-scene-phase]');
      return {
        url: location.href,
        title: document.title,
        stageCount: document.querySelectorAll('.tileset-view-stage[aria-label="Level editor board"]').length,
        hitCount: document.querySelectorAll('.tileset-cell-hit').length,
        inert: inert ? { className: inert.className, ariaHidden: inert.getAttribute('aria-hidden') } : null,
        scenePhase: boundary?.getAttribute('data-scene-phase') ?? null,
        status: document.querySelector('[role="status"]')?.textContent?.trim() ?? null,
      };
    });
    console.error(`editor readiness failed: ${JSON.stringify(readiness)}`);
    throw error;
  }

  // The canonical observation-only session intentionally makes the authoring
  // field inert. Lift that browser-local input lock only for this navigation
  // gesture; the request watcher above still fails the run on any content PUT
  // or takeover, so the verification cannot become an authoring session.
  await page.evaluate(() => {
    const stage = document.querySelector('.tileset-view-stage[aria-label="Level editor board"]');
    const field = stage?.closest('.skirmish-field');
    if (field instanceof HTMLElement) field.inert = false;
  });

  const drag = await page.evaluate(() => {
    const stage = document.querySelector('.tileset-view-stage[aria-label="Level editor board"]');
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    for (let row = 1; row < 16; row += 1) {
      for (let col = 1; col < 22; col += 1) {
        const x = rect.left + rect.width * col / 22;
        const y = rect.top + rect.height * row / 16;
        const top = document.elementFromPoint(x, y);
        if (top?.closest('.tileset-cell-hit')) {
          return { x, y, stageRect: rect.toJSON() };
        }
      }
    }
    return null;
  });
  if (!drag) {
    const hitState = await page.evaluate(() => {
      const stage = document.querySelector('.tileset-view-stage[aria-label="Level editor board"]');
      if (!stage) return null;
      const rect = stage.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      return {
        fieldInert: stage.closest('.skirmish-field')?.hasAttribute('inert') ?? null,
        stagePointerEvents: getComputedStyle(stage).pointerEvents,
        center: { x, y, tag: top?.tagName ?? null, className: top?.className ?? null },
      };
    });
    throw new Error(`no hit-tested editable board target was reachable: ${JSON.stringify(hitState)}`);
  }

  const readPan = () => page.evaluate(() => {
    const layer = document.querySelector('.tileset-view-art-layer');
    if (!layer) return null;
    const style = getComputedStyle(layer);
    return {
      x: Number.parseFloat(style.getPropertyValue('--view-pan-x')) || 0,
      y: Number.parseFloat(style.getPropertyValue('--view-pan-y')) || 0,
    };
  });

  const before = await readPan();
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(drag.x + 90, drag.y + 55, { steps: 8 });
  await page.waitForFunction(({ x, y }) => {
    const layer = document.querySelector('.tileset-view-art-layer');
    if (!layer) return false;
    const style = getComputedStyle(layer);
    const nextX = Number.parseFloat(style.getPropertyValue('--view-pan-x')) || 0;
    const nextY = Number.parseFloat(style.getPropertyValue('--view-pan-y')) || 0;
    return Math.hypot(nextX - x, nextY - y) > 20;
  }, {}, before);
  await page.mouse.up({ button: 'right' });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const after = await readPan();
  const contextMenus = await page.evaluate(() => window.__levelEditorContextMenus);
  if (!after || Math.hypot(after.x - before.x, after.y - before.y) <= 20) {
    throw new Error(`secondary drag did not move the board: ${JSON.stringify({ before, after })}`);
  }
  if (!contextMenus.length || contextMenus.some((event) => !event.defaultPrevented)) {
    throw new Error(`secondary drag did not suppress the context menu: ${JSON.stringify(contextMenus)}`);
  }

  const viewer = await Promise.race([
    viewerRegistration,
    new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
  if (
    !viewer?.ok
    || !isObservationSessionState(viewer.state)
    || !viewer.sessionId
    || !viewer.sessionKey
    || forbiddenRequests.length
  ) {
    throw new Error(`editor verification was not observation-only: ${JSON.stringify({ viewer, forbiddenRequests })}`);
  }
  // The server's 'observing' state above proves the session it answered was rewritten. This proves
  // no OTHER open slipped past the page-side patch and registered as an editing participant.
  await assertObservationPatchConsumed(page, editSessionOpens);

  // Leave through the application so the observing session closes cleanly.
  await page.evaluate(() => {
    const exit = document.createElement('a');
    exit.href = '/editor';
    exit.hidden = true;
    document.body.append(exit);
    exit.click();
  });
  await page.waitForFunction(() => location.pathname === '/editor');
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
    throw new Error(`observation-only editor cleanup returned HTTP ${closeResult.status}`);
  }

  console.log(`secondary drag moved board: ${JSON.stringify({ before, after })}`);
  console.log('context menu suppressed: OK');
  console.log('observation-only editor session closed cleanly: OK');
  console.log('PASS — Level Editor right-drag panning is live');
} finally {
  await browser.close();
}
