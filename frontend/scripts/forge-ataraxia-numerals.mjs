// Forge the Ataraxia rung numerals — the mark each row of the Enchiridion's Ataraxia
// section carries in place of a section glyph (ADR-0362).
//
// THE WHOLE LADDER IS FORGED AT ONCE, not one rung per installed tier. Ataraxia grows by
// editing ATARAXIA_BY_TIER (ADR-0268); an art pass standing between a designed tier and a
// shippable one would make that edit a two-day job. 0 through X covers every rung the
// ladder can currently reach.
//
// Every glyph after the first takes its own style's `I` as a `-i` style reference, so the
// set holds one material, palette, bevel and stroke weight instead of eleven independent
// inventions. Method + gates are the kit's (ADR-0011/0013/0014/0026): codex txt2img onto a
// flat chroma plate -> verified via the session ROLLOUT (never stdout) -> despill to alpha
// -> low-fi downscale/quantize -> 64x64 canvas.
//
//   node scripts/forge-ataraxia-numerals.mjs [--style stone|gold] [--only I,II] \
//     --slot-prefix ui/kit/numerals -- <live-media upload options>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodex, imageGenVerdict, sessionImage, removeChromaKey } from './codex-imagegen.mjs';
import { optionValue, splitGeneratorArgs, uploadGeneratedCandidate } from './upload-generated-candidate.mjs';

const CONCURRENCY = 5;

// ADR-0014 low-fi step: LANCZOS-downscale the smooth cutout to its native footprint (the
// downscale IS the pixelation), then MEDIANCUT-quantize to a limited palette.
const PYSRC_LOFI = `from PIL import Image
import sys
inp,outp,fp,cols=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
im=Image.open(inp).convert('RGBA')
w,h=im.size
s=min(1.0, fp/max(w,h))
im2=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS)
a=im2.split()[3]
rgb=im2.convert('RGB').quantize(colors=cols,method=Image.MEDIANCUT).convert('RGBA')
rgb.putalpha(a)
rgb.save(outp)`;

export const NUMERAL_STYLES = {
  // The owner-selected set (2026-08-02): quieter than gold leaf and closer to the
  // existing chrome, which is what a reference row wants.
  stone: 'CARVED STONE — the letterform is chiselled into pale weathered limestone, a deep V-cut with a hard shadow on the lower-right inner face and a bright lit upper-left face. No ornament, no color beyond the stone.',
  gold: 'GOLD-LEAF ILLUMINATION — the letterform itself is burnished gold with a darker gold bevel, resting on a small deep-crimson ground with a few fine white filigree hairlines. Think a rubricated initial from a medieval psalter.',
};

export const NUMERALS = [
  { key: '0', slot: 'zero', glyph: 'the numeral ZERO — a single closed oval "0"' },
  { key: 'I', slot: 'i', glyph: 'the Roman numeral ONE — a single vertical stroke "I" with a serif slab at the top and at the bottom' },
  { key: 'II', slot: 'ii', glyph: 'the Roman numeral TWO — exactly TWO vertical strokes side by side, "II", each with serif slabs top and bottom, evenly spaced' },
  { key: 'III', slot: 'iii', glyph: 'the Roman numeral THREE — exactly THREE vertical strokes side by side, "III", each with serif slabs top and bottom, evenly spaced' },
  { key: 'IV', slot: 'iv', glyph: 'the Roman numeral FOUR — one vertical stroke followed by a V, "IV", read left to right' },
  { key: 'V', slot: 'v', glyph: 'the Roman numeral FIVE — a single "V", two strokes meeting at a point at the bottom' },
  { key: 'VI', slot: 'vi', glyph: 'the Roman numeral SIX — a V followed by one vertical stroke, "VI", read left to right' },
  { key: 'VII', slot: 'vii', glyph: 'the Roman numeral SEVEN — a V followed by exactly two vertical strokes, "VII", read left to right' },
  { key: 'VIII', slot: 'viii', glyph: 'the Roman numeral EIGHT — a V followed by exactly three vertical strokes, "VIII", read left to right' },
  { key: 'IX', slot: 'ix', glyph: 'the Roman numeral NINE — one vertical stroke followed by an X, "IX", read left to right' },
  { key: 'X', slot: 'x', glyph: 'the Roman numeral TEN — a single "X", two strokes crossing at the middle' },
];

export function buildPrompt(style, numeral, ref, prior) {
  return `IMAGE-GENERATION task: GENERATE one PNG using the built-in image generation tool. Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract pixels from any file — programmatic OR extracted output is automatically rejected and you will be asked again.${prior ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${prior}\n` : ''}

Generate ONE numeral: ${numeral.glyph}. The whole numeral is ONE unit, centered, upright, filling most of the frame, seen straight-on. This is a LETTERFORM, not a scene and not an object — no other characters beyond the ones named, no words, no alphabet sheet, no border, no decorative scene around it. Count the strokes and get the number exactly right.

STYLE — ${NUMERAL_STYLES[style]}
${ref ? `\nThe attached reference image is the SAME numeral set's letter I. Match it exactly: identical material, palette, bevel, stroke weight, serif shape, and lighting. This glyph must look like it came from the same carved set — only the character differs.\n` : ''}
Render it as indie video-game art: low-fi and a touch pixellated, chunky readable forms, a LIMITED harmonious palette, hand-crafted shading with light from the upper-left. Not a photograph, not a smooth 3D render, not a flat vector logo. No smooth gradients, no glow, no heavy anti-aliasing.

BACKGROUND: a completely FLAT, UNIFORM chroma-key GREEN (#00B140) filling the entire frame behind the glyph. No gradient, no vignette, no shadow cast onto the green, no green anywhere in the glyph itself.

Save the result as a PNG in the working directory.`;
}

async function forgeOne({ style, numeral, ref, outDir, tmp }) {
  const label = `${style}-${numeral.key}`;
  let prior = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const cwd = mkdtempSync(join(tmp, `${label}-`));
    const { out } = await runCodex(cwd, buildPrompt(style, numeral, ref, prior), ref);
    const verdict = imageGenVerdict(out);
    if (!verdict.ok) { console.log(`  ${label} try ${attempt}: METHOD ✗ — ${verdict.reason}`); prior = 'the rollout shows you did NOT run the image model — you hand-drew the PNG in code. Use the built-in image generation tool.'; continue; }
    const raw = sessionImage(verdict.tid);
    if (!raw) { console.log(`  ${label} try ${attempt}: verified but no session image`); prior = 'no PNG landed in the session output dir'; continue; }
    const keyed = join(cwd, 'keyed.png');
    const key = removeChromaKey(raw, keyed);
    if (!key.ok) { console.log(`  ${label}: chroma key ✗ — ${key.reason}`); return { label, ok: false }; }
    const final = join(outDir, `${label}.png`);
    const lofi = spawnSync('python', ['-c', PYSRC_LOFI, keyed, final, '64', '24'], { encoding: 'utf8' });
    if (lofi.status !== 0) { console.log(`  ${label}: low-fi ✗ — ${(lofi.stderr || '').trim().split('\n').pop()}`); return { label, ok: false }; }
    copyFileSync(raw, join(outDir, `${label}-source.png`));
    console.log(`  ${label}: ✓ (${verdict.reason})`);
    return { label, ok: true, file: final, threadId: verdict.tid, numeral, style };
  }
  console.log(`  ${label}: gave up after 3 attempts`);
  return { label, ok: false };
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await worker(items[i]);
  }));
  return results;
}

const invokedDirectly = !!process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/forge-ataraxia-numerals.mjs');
if (invokedDirectly) {
  const { toolArgs, uploadArgs } = splitGeneratorArgs(process.argv.slice(2));
  const style = optionValue(toolArgs, '--style') || 'stone';
  const slotPrefix = optionValue(toolArgs, '--slot-prefix').replace(/\/+$/, '');
  const onlyRaw = optionValue(toolArgs, '--only');
  const only = onlyRaw ? new Set(onlyRaw.split(',').map((k) => k.trim())) : null;
  if (!NUMERAL_STYLES[style]) throw new Error(`unknown --style ${style}; expected ${Object.keys(NUMERAL_STYLES).join(' or ')}`);
  if (!slotPrefix || !uploadArgs.length) throw new Error('forge-ataraxia-numerals requires --slot-prefix and live-media options after --');

  const tmp = mkdtempSync(join(tmpdir(), 'forge-ataraxia-'));
  const outDir = join(tmp, 'out');
  mkdirSync(outDir, { recursive: true });
  const wanted = NUMERALS.filter((n) => !only || only.has(n.key));

  // The anchor is forged alone first — everything else references it.
  const anchorSpec = wanted.find((n) => n.key === 'I') || wanted[0];
  console.log(`forge-ataraxia-numerals (${style}): anchor ${anchorSpec.key}, then ${wanted.length - 1} more`);
  const anchor = await forgeOne({ style, numeral: anchorSpec, ref: null, outDir, tmp });
  if (!anchor.ok) { console.error('anchor failed; aborting'); process.exit(1); }
  const anchorSource = join(outDir, `${style}-${anchorSpec.key}-source.png`);
  const rest = wanted.filter((n) => n.key !== anchorSpec.key)
    .map((numeral) => ({ style, numeral, ref: anchorSource, outDir, tmp }));
  const results = [anchor, ...await pool(rest, forgeOne, CONCURRENCY)];

  for (const result of results) {
    if (!result.ok) continue;
    const provenance = join(tmp, `${result.label}-provenance.json`);
    writeFileSync(provenance, `${JSON.stringify({
      generator: 'forge-ataraxia-numerals', style, numeral: result.numeral.key, threadId: result.threadId,
      styleAnchorThreadId: anchor.threadId,
    }, null, 2)}\n`);
    uploadGeneratedCandidate(result.file, [...uploadArgs, '--provenance-json', provenance], `${slotPrefix}/${style}/${result.numeral.slot}.png`);
    console.log(`  uploaded ${slotPrefix}/${style}/${result.numeral.slot}.png`);
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n==== ${ok}/${results.length} forged and uploaded ====`);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok === results.length ? 0 : 1);
}
