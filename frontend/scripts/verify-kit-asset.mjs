// Deterministic gate for the "clipping" class of kit-asset bugs. Usage:
//   node verify-kit-asset.mjs <png> [--symmetric]
//   import { verifyAsset } from './verify-kit-asset.mjs'  // throws on failure
// Exits non-zero / throws and reports the offending coordinate on failure.
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Importable gate: pass a PNG instance (or path) + opts; throws with details.
export function verifyAsset(pngOrPath, { symmetric = false, label = '' } = {}) {
  const p = typeof pngOrPath === 'string' ? PNG.sync.read(readFileSync(pngOrPath)) : pngOrPath;
  const fails = check(p, symmetric);
  if (fails.length) throw new Error(`verify FAILED ${label}\n  - ${fails.join('\n  - ')}`);
  return true;
}

function check(p, symmetric) {
const A = (x, y) => p.data[(y * p.width + x) * 4 + 3];
const L = (x, y) => { const i = (y * p.width + x) * 4; return p.data[i] + p.data[i + 1] + p.data[i + 2]; };
const fails = [];

// 1. no fully-transparent interior column/row (the half-black button)
for (let x = 0; x < p.width; x += 1) {
  let allClear = true; for (let y = 0; y < p.height; y += 1) if (A(x, y) > 8) { allClear = false; break; }
  if (allClear) { fails.push(`empty column x=${x} (fully transparent — clipped region)`); break; }
}
for (let y = 0; y < p.height; y += 1) {
  let allClear = true; for (let x = 0; x < p.width; x += 1) if (A(x, y) > 8) { allClear = false; break; }
  if (allClear) { fails.push(`empty row y=${y} (fully transparent — clipped region)`); break; }
}

// 2. symmetry for mirrored assets (the broken-mirror bug)
if (symmetric) {
  for (let x = 0; x < p.width >> 1; x += 1) for (let y = 0; y < p.height; y += 1) {
    const i = (y * p.width + x) * 4; const j = (y * p.width + (p.width - 1 - x)) * 4;
    if (Math.abs(p.data[i] - p.data[j]) + Math.abs(p.data[i + 1] - p.data[j + 1]) + Math.abs(p.data[i + 2] - p.data[j + 2]) > 12) {
      fails.push(`asymmetric at x=${x},y=${y} (left/right mismatch)`); x = p.width; break;
    }
  }
}

// 3. each edge should carry a border brighter than the interior (the clipped-border class; heuristic)
const interiorMed = (() => {
  const v = []; for (let y = 4; y < p.height - 4; y += 2) for (let x = 4; x < p.width - 4; x += 2) if (A(x, y) > 8) v.push(L(x, y));
  v.sort((a, b) => a - b); return v[v.length >> 1] || 0;
})();
// Border must be CONTINUOUS along each edge, not just present at the corners.
// (The open-sided button passed the old max-based check because its bright
// CORNERS satisfied "edge has a bright pixel" while the SIDE border was clipped.)
// For each edge, take the per-line max within BW px, then the MEDIAN across the
// edge: if most of the edge length lacks a border, the median collapses to the
// interior level and we flag it.
const BW = Math.max(3, Math.min(9, Math.floor(Math.min(p.width, p.height) / 3))); // wide enough for inset borders (the row's sits 6px in)
const median = (a) => { a.slice().sort((x, y) => x - y); const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
// A real border runs the whole length of an edge; body (even brightish) doesn't.
// So look for a CONSISTENT line near each edge: the brightest near-edge line by
// its MEDIAN brightness. Body lines have low median; a true border line is high
// for (almost) its whole length. This separates "border present" from "just
// body" even on dark buttons where peak brightness alone can't.
const lineMedian = (vertical, idx) => {
  const v = [];
  const N = vertical ? p.height : p.width;
  for (let n = 0; n < N; n += 1) { const x = vertical ? idx : n; const y = vertical ? n : idx; if (A(x, y) > 8) v.push(L(x, y)); }
  return median(v);
};
const bestBorderLine = (vertical, fromEnd) => {
  let best = 0;
  for (let k = 0; k < BW; k += 1) { const idx = fromEnd ? (vertical ? p.width - 1 - k : p.height - 1 - k) : k; best = Math.max(best, lineMedian(vertical, idx)); }
  return best;
};
const thr = interiorMed * 1.35;
const edgeChecks = { top: [false, false], bottom: [false, true], left: [true, false], right: [true, true] };
for (const [name, [v, e]] of Object.entries(edgeChecks)) {
  if (bestBorderLine(v, e) < thr) fails.push(`broken ${name} border (no continuous border line near edge — corners present but side likely clipped)`);
}

  return fails;
}

// CLI: node verify-kit-asset.mjs <png> [--symmetric]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  const symmetric = process.argv.includes('--symmetric');
  const p = PNG.sync.read(readFileSync(file));
  const fails = check(p, symmetric);
  if (fails.length) { console.error(`FAIL ${file}\n  - ${fails.join('\n  - ')}`); process.exit(1); }
  console.log(`PASS ${file} (${p.width}x${p.height}${symmetric ? ', symmetric' : ''})`);
}
