#!/usr/bin/env node
// Headless-Chrome screenshot helper.
//
// Why this exists: the in-editor preview/screenshot tool's *capture* step hangs
// on this machine (the dev server is fine — only the screenshot grab times out).
// Driving the installed Chrome/Edge in headless mode and writing a PNG to disk
// is reliable, dependency-free, and scriptable. Read the PNG to view it.
//
// Usage:
//   node frontend/scripts/shot.mjs <url> [outPath] [WxH]
//
// Examples:
//   node frontend/scripts/shot.mjs http://127.0.0.1:5199/unit-studio
//   node frontend/scripts/shot.mjs "http://127.0.0.1:5199/tileset-studio?mode=lab&lab=board&view=board" tmp-shots/lab.png 1460x840
//
// Notes:
//   * The studio encodes its state in the URL (mode=catalog|lab, lab=board|tile|unit,
//     view=board, family=, collection=, asset=, unit=, seed=...), so any Catalog/Lab
//     state is reachable as a deep link — no clicking required for a static shot.
//   * --virtual-time-budget lets React render and settle before the grab.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const url = process.argv[2];
const outArg = process.argv[3] ?? 'tmp-shots/shot.png';
const sizeArg = process.argv[4] ?? '1460x840';

if (!url) {
  console.error('Usage: node frontend/scripts/shot.mjs <url> [outPath] [WxH]');
  process.exit(2);
}

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge binary found. Checked:\n' + BROWSERS.join('\n'));
  process.exit(1);
}

const [w, h] = sizeArg.split('x');
const out = resolve(process.cwd(), outArg);
mkdirSync(dirname(out), { recursive: true });

const args = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${w},${h}`,
  '--virtual-time-budget=7000',
  `--screenshot=${out}`,
  url,
];

const res = spawnSync(browser, args, { stdio: 'inherit' });
if (res.status !== 0 || !existsSync(out)) {
  console.error(`Screenshot failed (exit ${res.status}).`);
  process.exit(res.status || 1);
}
console.log(`Wrote ${out}`);
