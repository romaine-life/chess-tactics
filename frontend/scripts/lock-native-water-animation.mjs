// Graft native-resolution animated water frames onto the canonical tile body
// with ZERO resampling. Source frames MUST already be the canonical 96x140
// footprint (e.g. PixelLab animation seeded from the canonical tile). For each
// frame we copy ONLY the top-diamond pixels 1:1 onto a frozen canonical body,
// so the silhouette and sides are pixel-identical every frame (no wobble) and
// the top is crisp (no fractional downscale fringe).
//
// Usage:
//   node scripts/lock-native-water-animation.mjs <sourceDir> <outName> [frameCount]
//   - sourceDir: dir containing frame-00.png.. at 96x140 (canonical footprint)
//   - outName:   folder name under canonical-animated/
//   - frameCount: defaults to count of frame-*.png in sourceDir

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const [, , sourceDirArg, outNameArg, frameCountArg] = process.argv;

if (!sourceDirArg || !outNameArg) {
  console.error('Usage: node scripts/lock-native-water-animation.mjs <sourceDir> <outName> [frameCount]');
  process.exit(1);
}

const canonicalPath = path.join(
  repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-clean', 'water-clean-a.png',
);
const sourceDir = path.isAbsolute(sourceDirArg) ? sourceDirArg : path.join(repoRoot, sourceDirArg);
const outDir = path.join(
  repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', outNameArg,
);
const staticPath = path.join(
  repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', `${outNameArg}-static.png`,
);

// Canonical top diamond (matches lock-water-animation-to-canonical.mjs).
const TOP_DIAMOND = [[48, 0], [96, 27], [48, 54], [0, 27]];

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
const isInsideTop = (x, y) => insidePolygon(x + 0.5, y + 0.5, TOP_DIAMOND);

const idx = (png, x, y) => (y * png.width + x) * 4;
const clonePng = (src) => { const p = new PNG({ width: src.width, height: src.height }); src.data.copy(p.data); return p; };

function alphaBounds(png) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, opaque = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[idx(png, x, y) + 3] > 16) { opaque++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { minX, minY, maxX, maxY, opaque };
}

function diffOutsideTop(a, b) {
  let changed = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (isInsideTop(x, y)) continue;
    const i = idx(a, x, y);
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) changed++;
  }
  return changed;
}

const canonical = PNG.sync.read(fs.readFileSync(canonicalPath));

const frameFiles = frameCountArg
  ? Array.from({ length: Number(frameCountArg) }, (_, i) => `frame-${String(i).padStart(2, '0')}.png`)
  : fs.readdirSync(sourceDir).filter((f) => /^frame-\d+\.png$/.test(f)).sort();

if (frameFiles.length === 0) { console.error(`No frame-*.png found in ${sourceDir}`); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });

const report = [];
const boundsSet = new Set();

frameFiles.forEach((file, frame) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(sourceDir, file)));
  if (src.width !== canonical.width || src.height !== canonical.height) {
    console.error(`ABORT: ${file} is ${src.width}x${src.height}, expected ${canonical.width}x${canonical.height}. ` +
      `Source must be native canonical footprint (no resampling allowed).`);
    process.exit(2);
  }
  const out = clonePng(canonical);
  let topPixels = 0, written = 0;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    if (!isInsideTop(x, y)) continue;
    topPixels++;
    const si = idx(src, x, y);
    if (src.data[si + 3] < 12) continue; // keep canonical where source is transparent
    const oi = idx(out, x, y);
    out.data[oi] = src.data[si];
    out.data[oi + 1] = src.data[si + 1];
    out.data[oi + 2] = src.data[si + 2];
    out.data[oi + 3] = 255;
    written++;
  }
  const outPath = path.join(outDir, `frame-${String(frame).padStart(2, '0')}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  const b = alphaBounds(out);
  boundsSet.add(`${b.minX},${b.minY},${b.maxX},${b.maxY},${b.opaque}`);
  report.push({ frame, topPixels, written, bounds: b, changedOutsideTop: diffOutsideTop(out, canonical) });
});

fs.copyFileSync(path.join(outDir, 'frame-00.png'), staticPath);

// Verification: every frame must share identical alpha bounds (no wobble) and
// zero changes outside the top diamond (sides frozen).
const noWobble = boundsSet.size === 1;
const sidesFrozen = report.every((r) => r.changedOutsideTop === 0);
console.log(`Frames: ${report.length} -> ${outDir}`);
console.log(`Identical alpha bounds across frames (no wobble): ${noWobble ? 'PASS' : 'FAIL (' + [...boundsSet].join(' | ') + ')'}`);
console.log(`Sides frozen (0 changes outside top): ${sidesFrozen ? 'PASS' : 'FAIL'}`);
console.log(report.map((r) => `  f${r.frame}: wrote ${r.written}/${r.topPixels} top px, outsideTopDiff=${r.changedOutsideTop}`).join('\n'));
if (!noWobble || !sidesFrozen) process.exit(3);
