// Durable guard for ADR-0063 (the title-bar rule is a forged tileset). Fails the build if a
// RETIRED asset reappears in live src, if a deleted asset returns, or if the rule stops being
// wired the way the ADR requires. Enforcement, not a buried memory.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(frontend, 'src');
const titlebar = join(frontend, 'public/assets/ui/titlebar');
const failures = [];

// 1) Retired chrome must not reappear in live src. band-studded survives ONLY as the forge's root
//    style-seed under frontend/scripts (not scanned here); it must never return to the app.
const RETIRED = /\b(band-studded|rail-studded|ornament-nailstud|joint-boss|plate-forged|joint-tee-forged|joint-cross-forged)\b/;
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collect(p));
    else if (/\.(ts|tsx|js|jsx|css)$/.test(name)) out.push(p);
  }
  return out;
}
for (const file of collect(src)) {
  const rel = file.slice(frontend.length + 1).replaceAll('\\', '/');
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (RETIRED.test(line)) failures.push(`${rel}:${i + 1}: retired title-bar asset — ${line.trim()}`);
  });
}

// 2) Deleted assets must stay deleted.
for (const png of ['rail-studded', 'ornament-nailstud', 'joint-boss', 'plate-forged', 'joint-tee-forged', 'joint-cross-forged']) {
  if (existsSync(join(titlebar, `${png}.png`))) failures.push(`retired asset still present: ${png}.png`);
}

// 3) The forged tileset atoms + composed tiles must exist (the kit is what ships).
for (const png of ['atom-rivet', 'atom-strap-h', 'atom-strap-v', 'atom-square-plate', 'band-forged', 'rail-forged', 'joint-square-forged', 'joint-diamond-forged']) {
  if (!existsSync(join(titlebar, `${png}.png`))) failures.push(`missing title-bar kit asset: ${png}.png`);
}

// 4) Structural lock (ADR-0042/0063): the wall renders on the INVARIANT cluster, so the rule is on
//    every screen. The cluster component must mount .cluster-wall.
const cluster = readFileSync(join(src, 'ui/shared/HeaderAccountCluster.tsx'), 'utf8');
if (!/className="cluster-wall"/.test(cluster)) {
  failures.push('HeaderAccountCluster.tsx must render <span className="cluster-wall"> (the rule wall on the invariant cluster).');
}

// 5) The rule must be wired to the composed forged tiles, not raw shapes.
const css = readFileSync(join(src, 'style.css'), 'utf8');
for (const need of ['band-forged.png', 'rail-forged.png', 'joint-square-forged.png', 'joint-diamond-forged.png']) {
  if (!css.includes(need)) failures.push(`style.css: the forged tileset must reference ${need}`);
}

if (failures.length) {
  console.error('\n✗ title-bar rule kit guard FAILED (ADR-0063):');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ title-bar rule kit guard OK: forged tileset intact, no retired assets in src.');
