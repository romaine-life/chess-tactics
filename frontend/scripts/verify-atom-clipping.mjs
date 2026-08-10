#!/usr/bin/env node
// Finds chrome atoms that a scrollport or panel is cutting in half.
//
// An atom is seated ON a frame and paints OUTWARD past it — a junction cap straddles the rail it
// terminates, a corner ornament straddles the box's corner. Any ancestor that clips (a scrollport,
// a column with overflow hidden) will therefore take a bite out of one unless that ancestor carries
// an apron: clip box widened by the overhang, content pushed back in by the same amount, so nothing
// moves and the atom has room to finish.
//
// Nothing else can catch this. It is not paint (the surface-contract gate reads declarations), not
// composition (the rail gate reads source), and not something a screenshot review reliably spots at
// 1x — the bite is a few pixels off one edge. It is pure rendered geometry, so it is measured here,
// on the real routes, in a real browser.
//
// Usage: node scripts/verify-atom-clipping.mjs <url> [<url> ...] [--size WxH] [--tolerance px]
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const urls = argv.filter((value, index) => !value.startsWith('--') && !String(argv[index - 1] ?? '').startsWith('--'));
const [width, height] = String(flag('size', '1280x900')).split('x').map(Number);
// Sub-pixel: a fractional device row is not a bitten atom.
const tolerance = Number(flag('tolerance', '0.75'));
const timeout = Number(flag('timeout', '30000'));

if (!urls.length) {
  console.error('usage: verify-atom-clipping <url> [<url> ...] [--size WxH] [--tolerance px]');
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

const MEASURE = (tolerancePx) => {
  const describe = (el) => {
    const name = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return cls ? `${name}.${cls}` : name;
  };
  const paintedBoxes = [];

  // Junction caps: a zero-size anchor whose ::before paints the ornament centred on it.
  for (const anchor of document.querySelectorAll('.chrome-junction')) {
    const before = getComputedStyle(anchor, '::before');
    if (before.content === 'none') continue;
    const w = parseFloat(before.inlineSize || before.width) || 0;
    const h = parseFloat(before.blockSize || before.height) || 0;
    if (!w || !h) continue;
    const rect = anchor.getBoundingClientRect();
    const dx = parseFloat(before.insetInlineStart) || 0;
    const dy = parseFloat(before.insetBlockStart) || 0;
    paintedBoxes.push({
      kind: 'junction',
      el: anchor,
      what: describe(anchor),
      left: rect.left + dx,
      top: rect.top + dy,
      right: rect.left + dx + w,
      bottom: rect.top + dy + h,
    });
  }

  // Corner ornaments. The ::after overlay box is deliberately far larger than the art — it is a
  // bleed area, and the four corner images are positioned INSIDE it — so its inset is not the
  // painted extent. The runtime publishes the real overhang per side (the amount an atom reaches
  // PAST the box), which is the same number the existing aprons are built from; use that.
  for (const el of document.querySelectorAll('[data-chrome-unit], .le-outer-panel, .chrome-divided-grid')) {
    const after = getComputedStyle(el, '::after');
    if (after.content === 'none' || !after.backgroundImage || after.backgroundImage === 'none') continue;
    const cs = getComputedStyle(el);
    const overhang = (name) => Math.max(0, parseFloat(cs.getPropertyValue(name)) || 0);
    const left = overhang('--le-inner-atom-left-overhang');
    const right = overhang('--le-inner-atom-right-overhang');
    const top = overhang('--le-inner-atom-top-overhang');
    const bottom = overhang('--le-inner-atom-bottom-overhang');
    if (!(left || right || top || bottom)) continue;
    const rect = el.getBoundingClientRect();
    paintedBoxes.push({
      kind: 'corner',
      el,
      what: describe(el),
      left: rect.left - left,
      top: rect.top - top,
      right: rect.right + right,
      bottom: rect.bottom + bottom,
    });
  }

  const findings = [];
  for (const box of paintedBoxes) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    // The subject is an ornament poking out of a box that is ITSELF on screen. A box scrolled out
    // of its own viewport is hidden, which is the scrollport working; only report the case where
    // the box fits inside the clipper on an edge and its atom does not.
    const owner = box.kind === 'corner' ? box.el : box.el.closest('.chrome-divided-grid, [data-chrome-unit]') ?? box.el;
    const or = owner.getBoundingClientRect();
    for (let host = box.el.parentElement; host && host !== document.documentElement; host = host.parentElement) {
      const cs = getComputedStyle(host);
      const clipsX = cs.overflowX !== 'visible';
      const clipsY = cs.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const hr = host.getBoundingClientRect();
      const cuts = [];
      const fitsLeft = or.left >= hr.left - tolerancePx;
      const fitsRight = or.right <= hr.right + tolerancePx;
      const fitsTop = or.top >= hr.top - tolerancePx;
      const fitsBottom = or.bottom <= hr.bottom + tolerancePx;
      if (clipsX && fitsLeft && box.left < hr.left - tolerancePx) cuts.push(`left by ${(hr.left - box.left).toFixed(1)}px`);
      if (clipsX && fitsRight && box.right > hr.right + tolerancePx) cuts.push(`right by ${(box.right - hr.right).toFixed(1)}px`);
      if (clipsY && fitsTop && box.top < hr.top - tolerancePx) cuts.push(`top by ${(hr.top - box.top).toFixed(1)}px`);
      if (clipsY && fitsBottom && box.bottom > hr.bottom + tolerancePx) cuts.push(`bottom by ${(box.bottom - hr.bottom).toFixed(1)}px`);
      if (cuts.length) {
        findings.push({ kind: box.kind, atom: box.what, clipper: describe(host), cuts });
        break;
      }
    }
  }
  return { atoms: paintedBoxes.length, findings };
};

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: mkdtempSync(join(tmpdir(), 'ct-atoms-')),
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--host-resolver-rules=MAP *.localhost 127.0.0.1'],
});
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(
      `!document.querySelector('[data-scene-phase]')
        || document.querySelector('[data-scene-phase]').getAttribute('data-scene-phase') === 'current'`,
      { timeout },
    ).catch(() => {});
    // The chrome family is installed by a runtime stylesheet, so the atoms exist only once that
    // CSS has landed — measuring before it does reports a clean route that was never drawn.
    await page.waitForFunction(
      `document.querySelectorAll('.chrome-junction').length > 0
        && getComputedStyle(document.querySelector('.chrome-junction'), '::before').content !== 'none'`,
      { timeout: 15000 },
    ).catch(() => {});
    await page.evaluate(() => new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    }));
    const { atoms, findings } = await page.evaluate(MEASURE, tolerance);
    if (!atoms) {
      console.log(`  · ${url} — no atoms on this route`);
      continue;
    }
    if (!findings.length) {
      console.log(`  ✓ ${url} — ${atoms} atoms, none clipped`);
      continue;
    }
    failed = true;
    console.error(`  ✗ ${url} — ${findings.length} of ${atoms} atoms cut:`);
    for (const finding of findings) {
      console.error(`      ${finding.kind} ${finding.atom}  cut ${finding.cuts.join(', ')}  by ${finding.clipper}`);
    }
  }
} finally {
  await browser.close();
  rmSync(browser.process()?.spawnargs?.find((a) => a.startsWith('--user-data-dir='))?.slice(16) ?? '', { recursive: true, force: true });
}

if (failed) {
  console.error('\nAn atom paints OUTSIDE the box it sits on. The clipping ancestor needs the two-sided apron:');
  console.error('widen its clip box by the overhang and push its content back in by the same amount, so the');
  console.error('content line does not move. See .settings-scroll, .le-hud-scroll, .house-select-menu-scroll.');
  process.exit(1);
}
console.log('✓ atom clipping: every painted chrome atom finishes inside its clipping ancestors.');
