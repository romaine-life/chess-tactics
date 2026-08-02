// Compare two bench-live-search.mjs JSON runs: determinism first, then speed.
//
//   node scripts/compare-live-search.mjs tmp-bench/baseline.json tmp-bench/optimized.json
//
// Determinism is the gate, not a footnote. The live search is node-bounded, so an
// optimization is only legitimate if it expands the SAME tree and picks the SAME
// move: every fingerprint line (chosen action, node count, completed depth, and the
// full self-play transcripts) must match exactly. Speed is only meaningful after that.
import { readFileSync } from 'node:fs';

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) throw new Error('usage: compare-live-search.mjs <before.json> <after.json>');
const a = JSON.parse(readFileSync(aPath, 'utf8'));
const b = JSON.parse(readFileSync(bPath, 'utf8'));

console.log(`before: ${aPath}\nafter:  ${bPath}\n`);

// ── determinism ────────────────────────────────────────────────────────────────
let mismatches = 0;
const seen = new Set();
for (let i = 0; i < Math.max(a.fingerprint.length, b.fingerprint.length); i += 1) {
  const x = a.fingerprint[i];
  const y = b.fingerprint[i];
  if (x !== y) {
    mismatches += 1;
    if (mismatches <= 5) console.log(`  MISMATCH #${i}\n    before: ${x}\n    after:  ${y}`);
  }
  seen.add(i);
}
console.log(
  mismatches === 0
    ? `DETERMINISM: PASS — all ${a.fingerprint.length} fingerprint lines byte-identical (chosen moves, node counts, depths, self-play transcripts)\n`
    : `DETERMINISM: FAIL — ${mismatches} of ${seen.size} fingerprint lines differ\n`,
);

// ── speed ──────────────────────────────────────────────────────────────────────
const byName = new Map(b.results.map((r) => [r.name, r]));
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('position', 34)} ${pad('bound', 8)} ${pad('nodes', 7)} ${pad('before ms', 10)} ${pad('after ms', 10)} speedup`);
console.log('-'.repeat(88));
let beforeTotal = 0;
let afterTotal = 0;
let beforeNb = 0;
let afterNb = 0;
for (const r of a.results) {
  const o = byName.get(r.name);
  if (!o) continue;
  const nodesNote = r.nodes === o.nodes ? String(r.nodes) : `${r.nodes}→${o.nodes} !!`;
  beforeTotal += r.msMin;
  afterTotal += o.msMin;
  if (r.bound === 'node') { beforeNb += r.msMin; afterNb += o.msMin; }
  console.log(
    `${pad(r.name, 34)} ${pad(r.bound, 8)} ${pad(nodesNote, 7)} ${pad(r.msMin.toFixed(1), 10)} ${pad(o.msMin.toFixed(1), 10)} ${(r.msMin / o.msMin).toFixed(2)}x`,
  );
}
console.log('-'.repeat(88));
console.log(`${pad('ALL', 34)} ${pad('', 8)} ${pad('', 7)} ${pad(beforeTotal.toFixed(1), 10)} ${pad(afterTotal.toFixed(1), 10)} ${(beforeTotal / afterTotal).toFixed(2)}x`);
console.log(`${pad('NODE-BOUND (live-play class)', 34)} ${pad('', 8)} ${pad('', 7)} ${pad(beforeNb.toFixed(1), 10)} ${pad(afterNb.toFixed(1), 10)} ${(beforeNb / afterNb).toFixed(2)}x`);
process.exitCode = mismatches === 0 ? 0 : 1;
