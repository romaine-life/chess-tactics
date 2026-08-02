// Summarize a V8 .cpuprofile by SELF time per function — the "where do the
// microseconds actually go" view. Total time is misleading for a recursive search
// (negamax's total is ~100% by definition); self time is what an optimization moves.
//
//   node --cpu-prof --cpu-prof-dir=tmp-bench/prof scripts/bench-live-search.mjs --only '...' --reps 1 --no-selfplay
//   node scripts/analyze-cpuprofile.mjs tmp-bench/prof/<file>.cpuprofile
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let target = process.argv[2];
if (target && !target.endsWith('.cpuprofile')) {
  const files = readdirSync(target).filter((f) => f.endsWith('.cpuprofile'));
  if (!files.length) throw new Error(`no .cpuprofile in ${target}`);
  target = join(target, files.sort().at(-1));
}
const profile = JSON.parse(readFileSync(target, 'utf8'));

// Self time: each sample is attributed to exactly one node; timeDeltas[i] is the
// interval preceding samples[i].
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
let total = 0;
for (let i = 0; i < profile.samples.length; i += 1) {
  const dt = profile.timeDeltas[i] ?? 0;
  if (dt <= 0) continue;
  const node = byId.get(profile.samples[i]);
  if (!node) continue;
  const cf = node.callFrame;
  const name = cf.functionName || '(anonymous)';
  self.set(name, (self.get(name) ?? 0) + dt);
  total += dt;
}

const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
console.log(`${target}\ntotal sampled: ${(total / 1000).toFixed(1)}ms\n`);
console.log(`${'self ms'.padStart(9)}  ${'pct'.padStart(6)}  function`);
console.log('-'.repeat(60));
let shown = 0;
for (const [name, us] of rows) {
  const pct = (us / total) * 100;
  if (pct < 0.5) break;
  console.log(`${(us / 1000).toFixed(1).padStart(9)}  ${pct.toFixed(1).padStart(5)}%  ${name}`);
  shown += pct;
}
console.log('-'.repeat(60));
console.log(`${shown.toFixed(1)}% shown (functions >= 0.5% self time)`);
