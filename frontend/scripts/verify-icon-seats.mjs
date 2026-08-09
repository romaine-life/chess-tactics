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

/** Which slot each compensated CSS rule is really talking about.
 *
 * `baseline: true` marks a rule in a row that shares a BOTTOM edge, not merely a box.
 * Those also declare --titlebar-mark-ink-below — the fraction of the canvas under the
 * ink — and it is checked here for the same reason the fill is: a re-upload that moves
 * the glyph inside its canvas lifts it off the row with nothing pointing at the cause. */
const DECLARED = [
  { rule: '.skirmish-clock .skirmish-icon', slot: 'ui/kit/icons/game/wait.png' },
  { rule: '.skirmish-objective .skirmish-icon', slot: 'ui/kit/icons/game/objective.png' },
  { rule: '[data-strategikon-section="enchiridion"] img', slot: 'ui/kit/icons/design-index.png', baseline: true },
  { rule: '[data-strategikon-section="prosopography"] img', slot: 'ui/kit/icons/unit-studio.png', baseline: true },
  { rule: '[data-strategikon-section="lipsanotheca"] img', slot: 'ui/kit/icons/info.png', baseline: true },
  { rule: '.skirmish-hud-title-action-glyph', slot: 'ui/kit/icons/studio-catalog.png', baseline: true },
];

function declaredNumber(css, rule, property) {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*${property}:\\s*([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

const declaredInkFill = (css, rule) => declaredNumber(css, rule, '--titlebar-mark-ink-fill');
const declaredInkBelow = (css, rule) => declaredNumber(css, rule, '--titlebar-mark-ink-below');

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
  if (maxX < 0) return { fill: 0, below: 0, ink: '0x0', canvas: `${png.width}x${png.height}` };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    fill: Math.max(w, h) / Math.max(png.width, png.height),
    below: (png.height - (maxY + 1)) / png.height,
    ink: `${w}x${h} at (${minX},${minY})`,
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
for (const { rule, slot, baseline } of DECLARED) {
  const declared = declaredInkFill(css, rule);
  const declaredBelow = declaredInkBelow(css, rule);
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
  if (baseline && !trimmed) {
    if (declaredBelow === null) {
      failures.push(
        `${slot} sits in a row that shares a bottom edge, but ${rule} declares no `
        + `--titlebar-mark-ink-below. Its canvas carries ${(measured.below * 100).toFixed(1)}% under the ink, `
        + 'so it floats off the row.',
      );
    } else if (Math.abs(declaredBelow - measured.below) > TOLERANCE) {
      failures.push(
        `${slot}: style.css declares --titlebar-mark-ink-below: ${declaredBelow}, installed bytes measure `
        + `${measured.below.toFixed(4)} (${measured.canvas}, ink ${measured.ink}). The glyph moved inside its `
        + 'canvas; update the rule or its bottom edge leaves the row.',
      );
    }
  }
  console.log(
    `${slot.padEnd(34)} fill ${String(declared ?? '—').padEnd(6)}/${measured.fill.toFixed(3)}`
    + `  below ${String(baseline ? declaredBelow ?? '—' : '—').padEnd(6)}/${measured.below.toFixed(4)}`
    + `  ${measured.canvas} ink ${measured.ink}`,
  );
}

if (failures.length) {
  console.error('\n✗ Title-bar mark seat FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\n✓ Title-bar mark seat OK: every compensated glyph matches its installed bytes.');
