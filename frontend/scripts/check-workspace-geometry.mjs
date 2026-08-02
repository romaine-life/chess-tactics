#!/usr/bin/env node
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import {
  assertObservationPatchConsumed,
  installObservationSessionPatch,
  isLevelEditorUrl,
  watchEditSessionOpens,
} from './shot-editor-session.mjs';

const args = process.argv.slice(2);
const url = args[0];
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const [width, height] = String(flag('size', '1440x900')).split('x').map(Number);
const bodySelector = String(flag('body', '[data-shell-workspace-body]'));
const contentSelector = String(flag('content', '[data-shell-workspace-content]'));
const dockSelector = String(flag('dock', bodySelector));
const readySelector = String(flag('ready', dockSelector));
const alignSelector = flag('align', null);
const tolerance = Number(flag('tolerance', '0.51'));
const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromes.find(existsSync);

if (!url || url.startsWith('--')) {
  console.error('usage: npm run verify:workspace -- <live-url> [--size 1440x900] [--body <selector>] [--content <selector>] [--dock <selector>] [--align <selector>] [--ready <selector>]');
  process.exit(2);
}
if (!executablePath) {
  console.error(`No Chrome/Edge found. Checked:\n${chromes.join('\n')}`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-background-networking', '--no-first-run'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const target = new URL(url);
  if (
    ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || target.hostname.endsWith('.localhost')
  ) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const authResponse = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!authResponse?.ok()) throw new Error(`local geometry sign-in failed (${authResponse?.status() ?? 'no response'})`);
    const authState = await page.evaluate(() => {
      try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
    });
    if (!authState?.signed_in) throw new Error('local geometry sign-in did not establish the owner session');
  }
  // Geometry verification is an authenticated OBSERVER of the owner's live document, never a
  // synthetic editing participant. Rewrite the session-open inside the page instead of through
  // CDP request interception: this gate waits on `.skirmish-hud`, a live board whose modules load
  // lazily, and interception wedges exactly those Vite dev-server module requests (see
  // installObservationSessionPatch). `watchEditSessionOpens` needs no interception and proves the
  // rewrite covered every open the browser actually made.
  const targetIsLevelEditor = isLevelEditorUrl(url);
  const editSessionOpens = targetIsLevelEditor ? watchEditSessionOpens(page) : null;
  if (targetIsLevelEditor) await installObservationSessionPatch(page);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 })
    .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  await page.waitForSelector('.skirmish-hud', { timeout: 15000 });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(({ bodyQuery, dockQuery }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && bounds.width > 0
        && bounds.height > 0;
    };
    return [...document.querySelectorAll(bodyQuery)].some(visible)
      && [...document.querySelectorAll(dockQuery)].some(visible)
      && [...document.querySelectorAll('.skirmish-hud')].some(visible);
  }, { timeout: 15000 }, { bodyQuery: bodySelector, dockQuery: dockSelector });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const geometry = await page.evaluate(({
    bodySelector: bodyQuery,
    contentSelector: contentQuery,
    dockSelector: dockQuery,
    alignSelector: alignQuery,
  }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && bounds.width > 0
        && bounds.height > 0;
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const body = [...document.querySelectorAll(bodyQuery)].find(visible);
    const content = [...document.querySelectorAll(contentQuery)].find(visible);
    const dock = [...document.querySelectorAll(dockQuery)].find(visible);
    const controls = [...document.querySelectorAll('.skirmish-hud')].find(visible);
    const workspace = body?.closest('.shell-workspace');
    if (!body || !content || !dock || !controls || !workspace) {
      return {
        missing: {
          body: !body,
          content: !content,
          dock: !dock,
          controls: !controls,
          workspace: !workspace,
        },
      };
    }
    const bodyStyle = getComputedStyle(body);
    const contentStyle = getComputedStyle(content);
    const contentRect = rect(content);
    const contentPaddingInlineEnd = Number.parseFloat(contentStyle.paddingInlineEnd);
    const alignmentLine = contentRect.right - contentPaddingInlineEnd;
    const aligned = alignQuery
      ? [...document.querySelectorAll(alignQuery)].filter(visible).map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          right: rect(element).right,
        }))
      : [];
    return {
      missing: null,
      body: rect(body),
      content: contentRect,
      dock: rect(dock),
      controls: rect(controls),
      workspace: rect(workspace),
      bodyPaddingInlineStart: Number.parseFloat(bodyStyle.paddingInlineStart),
      bodyPaddingInlineEnd: Number.parseFloat(bodyStyle.paddingInlineEnd),
      contentPaddingInlineEnd,
      contentEdgeAttached: content.hasAttribute('data-shell-workspace-content-edge'),
      alignmentLine,
      aligned,
      bodySelector: bodyQuery,
      contentSelector: contentQuery,
      dockSelector: dockQuery,
      alignSelector: alignQuery,
    };
  }, { bodySelector, contentSelector, dockSelector, alignSelector });

  const failures = [];
  const near = (actual, expected, relation) => {
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(`${relation}: expected ${expected}px, received ${actual}px`);
    }
  };
  if (geometry.missing) {
    failures.push(`required rendered element missing: ${JSON.stringify(geometry.missing)}`);
  } else {
    const sideBySide = Math.abs(geometry.workspace.right - geometry.controls.left) <= tolerance;
    const stacked = Math.abs(geometry.workspace.bottom - geometry.controls.top) <= tolerance;
    const controlsBoundary = sideBySide
      ? geometry.controls.left
      : stacked
        ? geometry.controls.right
        : null;
    if (controlsBoundary === null) {
      failures.push('workspace and Controls are neither side-by-side nor stacked on a shared shell boundary');
    } else {
      near(geometry.workspace.right, controlsBoundary, 'workspace to Controls boundary');
      near(geometry.body.right, controlsBoundary, 'shared workspace body to Controls boundary');
      near(geometry.content.right, controlsBoundary, 'shared workspace content container to Controls boundary');
      near(geometry.dock.right, controlsBoundary, 'primary dock target to Controls boundary');
    }
    near(geometry.bodyPaddingInlineEnd, 0, 'shared workspace body inline-end padding');
    near(
      geometry.contentPaddingInlineEnd,
      geometry.contentEdgeAttached ? 0 : geometry.bodyPaddingInlineStart,
      geometry.contentEdgeAttached
        ? 'edge-attached content inline-end padding'
        : 'ordinary content mirrors body inline-start padding',
    );
    if (alignSelector && geometry.aligned.length === 0) {
      failures.push(`no visible alignment targets matched: ${alignSelector}`);
    }
    for (const targetGeometry of geometry.aligned) {
      near(targetGeometry.right, geometry.alignmentLine, `aligned ${targetGeometry.tag}.${targetGeometry.className}`);
    }
  }

  const summary = {
    viewport: `${width}x${height}`,
    url,
    ...geometry,
  };
  if (failures.length) {
    console.error('Shell-workspace geometry violations:');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`✓ Shell-workspace geometry OK\n${JSON.stringify(summary, null, 2)}`);
  }
  if (targetIsLevelEditor && isLevelEditorUrl(page.url())) {
    await page.goto(new URL('/editor', target).href, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
  }
  // Identity is not negotiable, so this outranks the geometry verdict above: an open that reached
  // the network without the observe rewrite means this run edited the owner's live working copy.
  if (targetIsLevelEditor) await assertObservationPatchConsumed(page, editSessionOpens);
} finally {
  await browser.close();
}
