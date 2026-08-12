#!/usr/bin/env node
// Live mobile-usability gate. Drives the REAL routes in a REAL device-emulated Chrome
// (touch points, coarse pointer, mobile UA) and measures the rendered DOM.
//
// Why a live gate rather than unit tests: this app's narrow-width behaviour is produced by
// baked dressing-room offsets (a rail `translate(-238px)`, fixed 322/572px destination
// columns, a 900px minimum shell) that are neutralised by ONE band of overrides at the
// bottom of style.css. Nothing in a unit test observes whether those overrides still reach
// the elements they were written for — and they stopped reaching them when the menu chrome
// was rebuilt into the twin-screen shell. The symptom was a menu whose panels rendered
// entirely off the left edge, which only measured geometry can see.
//
// What it measures, per route per device profile:
//   page-overflow-x   the page scrolls sideways (the classic desktop-layout-on-a-phone tell)
//   control-cut-off   a control is clipped to under 60% of itself by an ancestor or the viewport
//   control-offscreen a control's centre lies outside the viewport — unreachable at any scroll
//   touch-target      a visible control's hit box is under 44x44 CSS px (WCAG 2.5.5)
//   stranded-overflow content overflows a container that cannot scroll, so it cannot be reached
//
// It reports the rotate gate as its own outcome rather than a pass: a portrait phone that is
// shown "Rotate your device" is not a portrait phone that works, and a gate covering the
// screen would otherwise make every portrait route trivially clean.
//
// Usage:
//   npm run verify:mobile -- '<base-url>' [--profile <id>] [--route <path>] [--json]
//     [--ignore-rotate-gate]
//     e.g. npm run verify:mobile -- http://testingme.chess-tactics.localhost
//          npm run verify:mobile -- <base> --profile phone-portrait --route /settings
//
// --ignore-rotate-gate hides the portrait gate and measures the layout underneath it. Portrait
// is otherwise unmeasurable — the gate covers the screen, so every portrait route reports the
// gate and nothing else. Use it to see what portrait WOULD be; a run with the flag is reported
// as gate-suppressed and never as a portrait pass.
//
// The Level Editor is deliberately NOT in the route set: it is out of scope for mobile
// (a desktop authoring surface). Pass --route to audit anything not listed.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const base = argv[0];
const flagAll = (name) => argv.reduce((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const has = (name) => argv.includes(`--${name}`);

if (!base || base.startsWith('--')) {
  console.error("usage: npm run verify:mobile -- '<base-url>' [--profile <id>] [--route <path>] [--json]");
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

// A phone user agent so anything that sniffs it behaves as it would in the player's hand.
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

// Device profiles. Widths/heights are CSS px — the sizes the layout actually sees.
// iPhone 15 / Pixel 8 class in both orientations, plus the largest landscape phone
// (Pro Max, 932px) which sits just under the 960px narrow-chrome ceiling.
const PROFILES = [
  { id: 'phone-portrait', label: 'Phone portrait (390x844)', width: 390, height: 844, touch: true, ua: PHONE_UA },
  { id: 'phone-landscape', label: 'Phone landscape (844x390)', width: 844, height: 390, touch: true, ua: PHONE_UA },
  { id: 'phone-landscape-max', label: 'Large phone landscape (932x430)', width: 932, height: 430, touch: true, ua: PHONE_UA },
  { id: 'tablet-portrait', label: 'Tablet portrait (768x1024)', width: 768, height: 1024, touch: true, ua: PHONE_UA },
];

// In-scope surfaces: gameplay and the screens around it. A Run route is written with the
// `?craft=` grammar so the gate builds its own Run state instead of depending on whatever
// the account's active Run has become.
const BATTLE = '/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge';
const ROUTES = [
  { path: '/', label: 'Main menu' },
  { path: '/play/select/run', label: 'Play — Run picker' },
  { path: '/play/select/continue', label: 'Play — Continue' },
  { path: '/play/select/levels', label: 'Play — Levels' },
  { path: '/settings', label: 'Settings' },
  { path: BATTLE, label: 'Battle board' },
  { path: '/run?craft=commendatio', label: 'Run — Commendatio' },
  { path: '/run?craft=sectio&battle=3&gold=250&army=knight,rook&offers=q,pb-front,rr-vertical', label: 'Run — Sectio' },
  { path: '/run?craft=deployment&battle=2&army=rook,rook,bishop,pawn&gold=120', label: 'Run — Deployment' },
  { path: '/run?craft=battle&battle=4&lipsana=royal-tent', label: 'Run — Battle' },
  { path: '/run?craft=battle-victory&battle=4&lipsana=royal-tent', label: 'Run — Battle victory' },
  { path: '/run?craft=aftermath&battle=3&turns=21&seconds=402&fallen=2', label: 'Run — Aftermath' },
  { path: '/run?craft=victory&gold=400', label: 'Run — War victory' },
];

const wantedProfiles = flagAll('profile');
const wantedRoutes = flagAll('route');
const ignoreGate = has('ignore-rotate-gate');
const profiles = wantedProfiles.length ? PROFILES.filter((p) => wantedProfiles.includes(p.id)) : PROFILES;
const routes = wantedRoutes.length ? wantedRoutes.map((path) => ({ path, label: path })) : ROUTES;
if (!profiles.length) { console.error(`unknown --profile. known: ${PROFILES.map((p) => p.id).join(', ')}`); process.exit(2); }

const TIMEOUT = 150_000;

// ── The measurement, run inside the page ────────────────────────────────────────────────
// Kept as a single serialisable function so every profile/route measures identically.
function measure() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const doc = document.scrollingElement || document.documentElement;

  const visible = (el) => {
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    } else if (!el.getClientRects().length) return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    return true;
  };

  const gateEl = document.querySelector('.rotate-gate');
  const gated = Boolean(gateEl && visible(gateEl) && gateEl.getBoundingClientRect().width > vw * 0.5);

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${label ? ` "${label}"` : ''}`;
  };

  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  const intersect = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
    get width() { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  });

  // How much of an element survives every clipping ancestor AND the viewport. This is the
  // number that matters: a control translated off the left edge is 100% "laid out" and 0%
  // reachable, and only the intersection tells them apart.
  const visibleFraction = (el) => {
    const rect = el.getBoundingClientRect();
    if (area(rect) === 0) return 0;
    let clip = { left: 0, top: 0, right: vw, bottom: vh, width: vw, height: vh };
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const box = node.getBoundingClientRect();
      // A scrollable axis is reachable by scrolling, so it does not count as clipping.
      const scrollableX = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      const scrollableY = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      clip = intersect(clip, {
        left: clipsX && !scrollableX ? box.left : -Infinity,
        right: clipsX && !scrollableX ? box.right : Infinity,
        top: clipsY && !scrollableY ? box.top : -Infinity,
        bottom: clipsY && !scrollableY ? box.bottom : Infinity,
      });
    }
    return area(intersect(rect, clip)) / area(rect);
  };

  const INTERACTIVE = [
    'button', 'a[href]', '[role="button"]', '[role="tab"]', '[role="link"]',
    'input:not([type="hidden"])', 'select', 'textarea', 'summary',
  ].join(', ');

  const findings = [];
  const push = (kind, detail, el, extra = {}) => {
    findings.push({ kind, detail, target: describe(el), ...extra });
  };

  const pageOverflowX = Math.round(doc.scrollWidth - doc.clientWidth);
  if (pageOverflowX > 1) {
    // Name the widest offender so the failure points at a selector, not just a number.
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) continue;
      if (!worst || r.right > worst.right) worst = { right: r.right, el };
    }
    findings.push({
      kind: 'page-overflow-x',
      detail: `page scrolls sideways by ${pageOverflowX}px`,
      target: worst ? describe(worst.el) : '(unattributed)',
      overflow: pageOverflowX,
    });
  }

  const controls = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  const seenTiny = new Set();
  // A control below the fold is NORMAL — the page scrolls. What matters is whether the
  // player can bring it into view at all, so anything that fails where it currently sits is
  // re-measured after asking the browser to scroll it into view. Only a control that is
  // STILL unreachable is a finding. (Without this the gate calls every long settings page
  // broken, and a genuinely off-edge control looks the same as one you just scroll to.)
  const unreachable = [];
  for (const el of controls) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const offscreen = cx < 0 || cx > vw || cy < 0 || cy > vh;
    if (offscreen || visibleFraction(el) < 0.6) unreachable.push(el);

    // Touch-target floor applies wherever the control sits. One finding per distinct
    // control shape so a grid of 20 identical small buttons is one line, not twenty.
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 44 || h < 44) {
      const key = `${describe(el).split('"')[0]}|${w}x${h}`;
      if (!seenTiny.has(key)) {
        seenTiny.add(key);
        push('touch-target', `hit box ${w}x${h} is under 44x44`, el);
      }
    }
  }
  const stillUnreachable = new Set();
  for (const el of unreachable) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const frac = visibleFraction(el);
    if (cx < 0 || cx > vw || cy < 0 || cy > vh) {
      stillUnreachable.add(el);
      push('control-offscreen', `cannot be scrolled into view — settles at (${Math.round(cx)}, ${Math.round(cy)}) in ${vw}x${vh}`, el);
    } else if (frac < 0.6) {
      stillUnreachable.add(el);
      push('control-cut-off', `only ${Math.round(frac * 100)}% visible even scrolled into view`, el);
    }
  }
  // Put the page back so the overflow pass below measures the resting layout.
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollTop) el.scrollTop = 0;
    if (el.scrollLeft) el.scrollLeft = 0;
  }
  window.scrollTo(0, 0);

  // Content that overflows a container which cannot scroll is simply unreachable.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const style = getComputedStyle(el);
    const hiddenY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    const hiddenX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const overY = hiddenY && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
    const overX = hiddenX && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
    if (!overY && !overX) continue;
    // Only report when a control this pass already PROVED unreachable is inside — stranded
    // decoration is ordinary clipping, and a control that merely sits below the fold is
    // reachable by scrolling. This names the container responsible for a real failure.
    const stranded = [...el.querySelectorAll(INTERACTIVE)].some((c) => stillUnreachable.has(c));
    if (!stranded) continue;
    push(
      'stranded-overflow',
      `${overY ? `${el.scrollHeight - el.clientHeight}px below` : ''}${overY && overX ? ' and ' : ''}${overX ? `${el.scrollWidth - el.clientWidth}px beside` : ''} a container that cannot scroll`,
      el,
    );
  }

  return { vw, vh, gated, pageOverflowX, findings };
}

// ── Drive it ────────────────────────────────────────────────────────────────────────────
const profileDir = mkdtempSync(join(tmpdir(), 'ct-mobile-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profileDir,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const results = [];
try {
  const page = await browser.newPage();

  // Same loopback dev sign-in the screenshot tool uses: these are owner routes.
  const target = new URL(base);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.hostname.endsWith('.localhost');
  if (loopback) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const res = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    if (!res?.ok()) throw new Error(`dev sign-in failed (${res?.status() ?? 'no response'})`);
  }

  for (const profile of profiles) {
    await page.setUserAgent(profile.ua);
    await page.setViewport({
      width: profile.width,
      height: profile.height,
      deviceScaleFactor: 1,
      hasTouch: profile.touch,
      isMobile: profile.touch,
    });
    for (const route of routes) {
      const url = new URL(route.path, base).href;
      const entry = { profile: profile.id, profileLabel: profile.label, route: route.label, path: route.path, url };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        if (ignoreGate) {
          await page.addStyleTag({ content: '.rotate-gate{display:none !important}' });
          entry.gateSuppressed = true;
        }
        await page.waitForFunction(
          "Boolean(document.querySelector('[data-scene-phase=\"current\"]')) || Boolean(document.querySelector('.rotate-gate:not([hidden])') && getComputedStyle(document.querySelector('.rotate-gate')).display !== 'none')",
          { timeout: TIMEOUT },
        );
        // Let entrances and any craft redirect settle before measuring.
        await new Promise((r) => setTimeout(r, 2_000));
        Object.assign(entry, await page.evaluate(measure));
      } catch (err) {
        entry.error = String(err?.message || err);
        entry.findings = [];
      }
      results.push(entry);
      const count = entry.findings?.length ?? 0;
      const mark = entry.error ? 'ERROR' : entry.gated ? 'GATED' : count ? `${count} issue${count === 1 ? '' : 's'}` : 'clean';
      process.stderr.write(`  ${profile.id.padEnd(20)} ${route.label.padEnd(26)} ${mark}\n`);
    }
  }
} finally {
  await browser.close();
  rmSync(profileDir, { recursive: true, force: true });
}

if (has('json')) {
  console.log(JSON.stringify({ base, results }, null, 2));
}

// ── Report ──────────────────────────────────────────────────────────────────────────────
const KIND_ORDER = ['page-overflow-x', 'control-offscreen', 'control-cut-off', 'stranded-overflow', 'touch-target'];
const totals = new Map();
for (const r of results) for (const f of r.findings ?? []) totals.set(f.kind, (totals.get(f.kind) ?? 0) + 1);

console.log('\n════ mobile audit ════');
console.log(`base: ${base}`);
for (const profile of profiles) {
  const rows = results.filter((r) => r.profile === profile.id);
  if (!rows.length) continue;
  console.log(`\n── ${profile.label} ──`);
  for (const row of rows) {
    if (row.error) { console.log(`  ✗ ${row.route}: ERROR ${row.error}`); continue; }
    if (row.gated) { console.log(`  ⊘ ${row.route}: rotate gate covers the screen (not usable, not measured)`); continue; }
    const findings = row.findings ?? [];
    if (!findings.length) { console.log(`  ✓ ${row.route}: clean`); continue; }
    console.log(`  ✗ ${row.route}: ${findings.length} issue${findings.length === 1 ? '' : 's'}`);
    const byKind = new Map();
    for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    for (const kind of KIND_ORDER) {
      const list = byKind.get(kind);
      if (!list) continue;
      console.log(`      ${kind} (${list.length})`);
      for (const f of list.slice(0, 4)) console.log(`        · ${f.detail} — ${f.target}`);
      if (list.length > 4) console.log(`        · … ${list.length - 4} more`);
    }
  }
}

const gatedCount = results.filter((r) => r.gated).length;
const errorCount = results.filter((r) => r.error).length;
const failing = results.filter((r) => !r.gated && !r.error && (r.findings?.length ?? 0) > 0);
console.log('\n──── summary ────');
for (const kind of KIND_ORDER) if (totals.get(kind)) console.log(`  ${kind}: ${totals.get(kind)}`);
console.log(`  routes measured: ${results.length - gatedCount - errorCount}/${results.length}` +
  `${gatedCount ? `, gated: ${gatedCount}` : ''}${errorCount ? `, errored: ${errorCount}` : ''}`);
console.log(`  routes with issues: ${failing.length}`);

const ok = failing.length === 0 && gatedCount === 0 && errorCount === 0;
if (ignoreGate) {
  console.log('\n  NOTE: --ignore-rotate-gate was set. Portrait results describe the layout UNDER the');
  console.log('        rotate gate; on a real device portrait still shows "Rotate your device".');
}
console.log(ok ? '\nPASS — every audited route is usable on every profile.' : '\nFAIL — see above.');
process.exit(ok ? 0 : 1);
