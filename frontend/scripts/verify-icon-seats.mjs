#!/usr/bin/env node
// Guard the title bar's mark seat against the INSTALLED bytes.
//
//   node scripts/verify-icon-seats.mjs [--base http://127.0.0.1:5175]
//
// A mark is drawn into a square seat with `contain`, which scales the CANVAS — so
// transparent margin baked into that canvas comes straight off the drawn glyph. Marks
// that ship trimmed to their own ink need no compensation and get none. The kit's game
// glyphs are not trimmed, so style.css states each one's ink fraction by hand and grows
// its box by exactly that much.
//
// A hand-copied number is only true until someone re-uploads the art. Nothing in CI can
// catch that, because the bytes live in blob storage and not in git — so this reads the
// live catalog and fails when a declared fraction no longer matches the installed image.
// Without it, regenerating an icon silently mis-sizes it and the bar looks subtly wrong
// with nothing pointing at the cause.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const base = (flag('base', 'http://127.0.0.1:5175') ?? '').replace(/\/$/, '');
const ALPHA = 24;
const TOLERANCE = 0.01;

/** Which slot each compensated CSS rule is really talking about. */
const DECLARED = [
  { rule: '.skirmish-clock .skirmish-icon', slot: 'ui/kit/icons/game/wait.png' },
  { rule: '.skirmish-objective .skirmish-icon', slot: 'ui/kit/icons/game/objective.png' },
];

function declaredInkFill(css, rule) {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*--titlebar-mark-ink-fill:\\s*([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

function inkFill(bytes) {
  const png = PNG.sync.read(bytes);
  let minX = png.width; let minY = png.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((png.width * y + x) << 2) + 3] <= ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { fill: 0, ink: '0x0', canvas: `${png.width}x${png.height}` };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    fill: Math.max(w, h) / Math.max(png.width, png.height),
    ink: `${w}x${h}`,
    canvas: `${png.width}x${png.height}`,
  };
}

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const catalog = await (await fetch(`${base}/api/asset-catalog`)).json();
const slots = Array.isArray(catalog.slots)
  ? catalog.slots
  : Object.entries(catalog.slots).map(([slot, value]) => ({ slot, ...value }));
const bySlot = new Map(slots.map((row) => [row.slot, row]));

const failures = [];
for (const { rule, slot } of DECLARED) {
  const declared = declaredInkFill(css, rule);
  const row = bySlot.get(slot);
  if (!row?.media?.sha256) { failures.push(`${slot}: not in the live catalog`); continue; }
  const response = await fetch(`${base}/api/media/${row.media.sha256}`);
  if (!response.ok) { failures.push(`${slot}: media ${response.status}`); continue; }
  const measured = inkFill(Buffer.from(await response.arrayBuffer()));
  const trimmed = measured.fill >= 1 - TOLERANCE;
  if (trimmed && declared !== null) {
    failures.push(
      `${slot} now ships TRIMMED (${measured.canvas}, ink ${measured.ink}). `
      + `Delete "${rule} { --titlebar-mark-ink-fill }" — the seat needs no compensation for it.`,
    );
  } else if (!trimmed && declared === null) {
    failures.push(
      `${slot} is untrimmed (ink fills ${(measured.fill * 100).toFixed(0)}% of ${measured.canvas}) `
      + `but ${rule} declares no --titlebar-mark-ink-fill, so it draws small on the shared seat.`,
    );
  } else if (!trimmed && Math.abs(declared - measured.fill) > TOLERANCE) {
    failures.push(
      `${slot}: style.css declares --titlebar-mark-ink-fill: ${declared}, installed bytes measure `
      + `${measured.fill.toFixed(3)} (${measured.canvas}, ink ${measured.ink}). The art changed; update the rule.`,
    );
  }
  console.log(
    `${slot.padEnd(34)} declared ${String(declared ?? '—').padEnd(6)} measured ${measured.fill.toFixed(3)}  ${measured.canvas} ink ${measured.ink}`,
  );
}

if (failures.length) {
  console.error('\n✗ Title-bar mark seat FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\n✓ Title-bar mark seat OK: every compensated glyph matches its installed bytes.');
