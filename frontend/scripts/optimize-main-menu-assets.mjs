#!/usr/bin/env node
// Deterministic optimizer for the main-menu first-visit image payload.
//
// Reads deterministic format preferences from optimized-images.json, consumes
// PNG sources explicitly fetched from live media, and emits AVIF/WebP candidate
// files beneath the OS temporary directory. It never publishes repository media.
//
// sharp is a dev-only tool and is intentionally NOT a committed dependency
// (it ships large native binaries we don't want in CI installs). Run:
//   npm --prefix frontend install --no-save sharp
//   npm --prefix frontend run optimize:assets
// The encode params live in the JSON, so derivatives are reproducible.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(here, '..');
const manifestPath = join(frontendDir, 'src', 'ui', 'design', 'optimized-images.json');
const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const sourceOption = option('source-dir');
const outputOption = option('out-dir');
if (!sourceOption || !outputOption) {
  console.error('Usage: node scripts/optimize-main-menu-assets.mjs --source-dir <fetched-slot-tree> --out-dir <temp-output>');
  process.exit(2);
}
const sourceDir = resolve(sourceOption);
const outputDir = resolve(outputOption);
if (relative(resolve(tmpdir()), outputDir).startsWith('..')) {
  throw new Error(`--out-dir must be beneath the OS temporary directory ${resolve(tmpdir())}`);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is not installed. Run: npm --prefix frontend install --no-save sharp');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const targets = manifest.targets || [];
if (!targets.length) {
  console.error('No targets in optimized-images.json');
  process.exit(1);
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const sizeOf = (p) => {
  try { return statSync(p).size; } catch { return 0; }
};

let totalPng = 0;
let totalAvif = 0;
let totalWebp = 0;
const rows = [];

for (const target of targets) {
  const urlPath = target.path;
  if (!urlPath.startsWith('/assets/')) {
    console.error(`Target is not a semantic live-media slot: ${urlPath}`);
    process.exit(1);
  }
  const slotPath = urlPath.slice('/assets/'.length);
  const pngFile = join(sourceDir, slotPath);
  if (!urlPath.endsWith('.png')) {
    console.error(`Target is not a .png: ${urlPath}`);
    process.exit(1);
  }
  const pngBytes = sizeOf(pngFile);
  if (!pngBytes) {
    console.error(`Missing source PNG: ${pngFile}`);
    process.exit(1);
  }

  const base = join(outputDir, slotPath).slice(0, -'.png'.length);
  const avifFile = `${base}.avif`;
  const webpFile = `${base}.webp`;
  mkdirSync(dirname(base), { recursive: true });

  const avifOpts = { quality: 55, effort: 6, ...(target.avif || {}) };
  const webpOpts = { quality: 82, effort: 6, ...(target.webp || {}) };

  // alphaQuality keeps button/title alpha edges crisp; chromaSubsampling 4:4:4
  // avoids color bleed on the painted UI art.
  await sharp(pngFile)
    .avif({ quality: avifOpts.quality, effort: avifOpts.effort, chromaSubsampling: '4:4:4' })
    .toFile(avifFile);
  await sharp(pngFile)
    .webp({ quality: webpOpts.quality, effort: webpOpts.effort, alphaQuality: 100 })
    .toFile(webpFile);

  const avifBytes = sizeOf(avifFile);
  const webpBytes = sizeOf(webpFile);
  totalPng += pngBytes;
  totalAvif += avifBytes;
  totalWebp += webpBytes;

  rows.push({
    path: urlPath,
    png: pngBytes,
    avif: avifBytes,
    webp: webpBytes,
  });
  console.log(
    `${urlPath}\n  png ${kib(pngBytes)}  ->  avif ${kib(avifBytes)} (-${(100 - (avifBytes / pngBytes) * 100).toFixed(0)}%)  webp ${kib(webpBytes)} (-${(100 - (webpBytes / pngBytes) * 100).toFixed(0)}%)`,
  );
}

console.log('\n=== totals ===');
console.log(`PNG  : ${kib(totalPng)}`);
console.log(`AVIF : ${kib(totalAvif)}  (-${(100 - (totalAvif / totalPng) * 100).toFixed(0)}% vs PNG)`);
console.log(`WebP : ${kib(totalWebp)}  (-${(100 - (totalWebp / totalPng) * 100).toFixed(0)}% vs PNG)`);
console.log(`\nTemporary derivative candidates written beneath ${outputDir}.`);
console.log('Upload each derivative to its matching semantic slot with scripts/live-media-admin-client.mjs upload-candidate.');
