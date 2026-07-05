// forge-titlebar-wall.mjs — forge the vertical title-bar WALL pieces as real codex art
// (ADR-0011/0013/0014), NOT code-drawn. Two sprites, both img2img-seeded from the shipped
// horizontal rule (band-studded.png) so rivets / palette / low-fi / TOP-lighting match by
// construction:
//   rail — the vertical riveted iron riser (the wall body).
//   boss — a forged riveted junction plate that caps where the riser meets the floor band
//          (the band passes under it and emerges both sides = the ⊥ three-way joint).
//
// PORTABLE (this laptop is user `nelsonlaptopuser`, not the primary box `Nelson`): drives the
// homedir-based codex engine (codex-imagegen.mjs) + a local pillow/numpy venv for the two
// python steps, exactly like forge-studio-switcher-icons.mjs. Method-verified against the
// ROLLOUT (image_generation_call), never stdout (kit-forge.md).
//
//   node scripts/forge-titlebar-wall.mjs [rail boss]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';
import { trimToEdge } from './forge-atom.mjs'; // pure pngjs helper — no machine paths

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(FRONTEND, 'public/assets/ui/titlebar');
const TMP = join(FRONTEND, 'tmp-forge-titlebar');
const REF = join(OUT_DIR, 'band-studded.png'); // the shipped horizontal rule = style seed
const VENV_PY = process.env.FORGE_PY || join(TMP, 'venv', 'Scripts', 'python.exe');
const REMOVE_CHROMA = join(process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME, '.codex'),
  'skills', '.system', 'imagegen', 'scripts', 'remove_chroma_key.py');

// ADR-0014 low-fi: LANCZOS-downscale the smooth cutout to a target footprint (the downscale IS
// the pixelation), then MEDIANCUT-quantize to a small palette. `fp` = target for the LONG side.
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

// COHERENT SET (ADR-0037 reforge): one flat-strap / top-lit-rivet style so the horizontal
// band, the vertical wall, and the joint plate are the SAME art in different orientations.
// The key to coherence AND correct lighting: a FLAT strap face (no directional edge bevel) —
// the ROUND RIVETS carry the top-light (glint on top), so the look reads identically whether
// the strap runs across or up-and-down. `symmetric` specs also pass a left/right symmetry gate.
const SPECS = {
  band: {
    out: 'band-forged.png',
    footprint: 168, // long side (width) -> a horizontal strip
    shape: `a HORIZONTAL forged-iron riveted rule — a long FLAT iron strap with a straight ROW of round dome rivets marching left-to-right along its centre, about ten rivets, evenly spaced, the strap starting and ending on plain metal so it tiles. Same navy-steel palette and rivet size as the reference.`,
    light: `Light from straight ABOVE: each round rivet glints on its TOP and shades darker toward its bottom. Keep the strap face FLAT and EVEN — do NOT paint a bright chamfer along the top edge or a dark band along the bottom edge. The RIVETS carry the light, not the strap edges.`,
  },
  rail: {
    out: 'rail-forged.png',
    footprint: 96, // long side (height) -> vertical strip; resized to 14px wide on wiring
    seed: 'band-forged.png', // seed from the NEW flat band so the set stays coherent
    symmetric: true,
    shape: `a VERTICAL forged-iron riveted rule — a tall FLAT iron strap with a straight COLUMN of round dome rivets marching top-to-bottom along its centre, about six rivets, evenly spaced, ending on plain metal at top and bottom. Same navy-steel palette and rivet size as the reference band.`,
    light: `Light from straight ABOVE: each round rivet glints on its TOP and shades darker below. The strap face is FLAT and PERFECTLY SYMMETRIC left-to-right — the left half and right half are identical, with NO bright edge or highlight on either side. Only the rivets carry the light.`,
  },
  // JOINT pieces (9-slice "corners"): the rule frame ITSELF branching into a junction — NO
  // plate, boss, gem, or anything overlaid. Just the same flat riveted strap forming a T / +.
  // Transparent in the concave corners (chroma-key) so the wood shows; the three/four arm-ends
  // are plain flat strap so the continuous runs tile up to them and connect with no seam.
  tee: {
    out: 'joint-tee-forged.png',
    footprint: 50,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a ⊥ T-JUNCTION of the forged riveted rule: a short HORIZONTAL flat riveted iron bar with a short VERTICAL flat riveted iron bar rising straight UP from the centre of its top edge — ONE continuous piece of the SAME forged iron, the strap simply branching into a T. Put a round dome rivet on each of the three arms; leave the three arm-ends (left, right, top) as PLAIN FLAT strap so a matching run can tile into them. Absolutely NO plate, boss, gem, disc, or ornament laid over the junction — it is only the rule metal forming the T. Everything OUTSIDE the T (the two upper concave corners) is the flat chroma-key background (colour specified below).`,
    light: `Light from straight ABOVE: rivets glint on TOP, strap faces flat and even, PERFECTLY SYMMETRIC left-to-right.`,
  },
  cross: {
    out: 'joint-cross-forged.png',
    footprint: 50,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a + CROSS-JUNCTION of the forged riveted rule: a horizontal flat riveted iron bar and a vertical flat riveted iron bar crossing at their centres — ONE continuous piece of the SAME forged iron branching four ways. A round dome rivet on each of the four arms; leave all four arm-ends as PLAIN FLAT strap so matching runs tile into them. Absolutely NO plate, boss, gem, disc, or ornament over the crossing — only the rule metal forming the +. Everything OUTSIDE the cross (the four concave corners) is the flat chroma-key background (colour specified below).`,
    light: `Light from straight ABOVE: rivets glint on TOP, strap faces flat and even, symmetric left-to-right and top-to-bottom.`,
  },
  // TWO joints for the kit — DISTINCT shapes for distinct jobs, both seeded from the row so
  // they share its metal/rivets/palette (consistency is the whole point):
  diamond: {
    out: 'joint-diamond-forged.png', // the band's CENTRE cap
    footprint: 34,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a single forged DIAMOND stud — one square iron nailhead turned 45° so it stands on its point (a diamond ◆), gently domed. It is DULL FORGED IRON, the SAME muted navy metal as the round rivets on the reference rule — NOT a shiny gem, NOT glass, NOT a crystal, no glassy sparkle. Just the ONE iron diamond stud — no square plate, no corner rivets, nothing behind it. Everything outside the diamond is the flat chroma-key background (colour below).`,
    light: `Light from straight ABOVE, symmetric left-to-right, but SUBTLE: the upper facets are only slightly lighter than the lower, matching the dull brightness of the iron rivets — no bright white highlight, no specular sparkle, no shine. Keep it as dim and matte as the rest of the rule.`,
  },
  square: {
    out: 'joint-square-forged.png', // the column↔row INTERSECTION cover
    footprint: 40,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a forged SQUARE junction plate — an upright AXIS-ALIGNED square iron plate (flat sides horizontal and vertical, NOT turned to a diamond) with a round dome rivet at each of its four corners, the kind bolted over an intersection to cover it. Same navy-steel iron, palette, and rivets as the reference rule. Everything outside the square is the flat chroma-key background (colour below).`,
    light: `Light from straight ABOVE, symmetric left-to-right: corner rivets glint on top; the plate face is flat and even.`,
  },
  // ATOMS for the shared-rivet / orientation-lit-strap runs. One rivet (used upright in both
  // strips → identical), two plain straps lit per orientation (ledge vs wall). Assembled into
  // the run tiles by compose-runs (below), so the rivets can't drift between H and V.
  rivet: {
    out: 'atom-rivet.png',
    footprint: 18,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a SINGLE forged iron RIVET — one round domed nailhead stud, gently 3-D, set into metal with a subtle darker recessed ring around its base. Just the ONE rivet, centered, nothing else — no strap, no plate. Same navy-steel iron as the reference rule. Everything outside the rivet is the flat chroma-key background (colour below).`,
    light: `Light from straight ABOVE: the dome's crown catches a small bright glint on its TOP, shading darker toward the bottom; left-right symmetric.`,
  },
  straph: {
    out: 'atom-strap-h.png',
    footprint: 128,
    seed: 'band-forged.png',
    shape: `a plain HORIZONTAL forged-iron STRAP — a long flat iron band with NO rivets, NO studs, NO holes, just the bare hammered-iron surface, uniform along its length so it tiles left-to-right. Same navy-steel iron and palette as the reference rule.`,
    light: `A horizontal LEDGE lit from straight above: the TOP edge is BRIGHTER (it catches the light) and it shades DARKER toward the bottom edge — a clear top-to-bottom gradient. Uniform left-to-right.`,
  },
  strapv: {
    out: 'atom-strap-v.png',
    footprint: 128,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a plain VERTICAL forged-iron STRAP — a tall flat iron band with NO rivets, NO studs, NO holes, just the bare hammered-iron surface, uniform top-to-bottom so it tiles. Same navy-steel iron and palette as the reference rule.`,
    light: `A vertical WALL lit from straight above: PERFECTLY SYMMETRIC left-to-right — no bright edge on either side, an even face across its width. At most a very gentle top-to-bottom fade.`,
  },
  squareplate: {
    out: 'atom-square-plate.png', // the intersection plate BODY; shared rivets composited on corners
    footprint: 44,
    seed: 'band-forged.png',
    symmetric: true,
    shape: `a plain forged-iron SQUARE PLATE — an upright axis-aligned square of flat hammered iron with softly rounded corners, NO rivets, NO studs, NO holes, just the bare plate face. Same navy-steel iron and palette as the reference rule. Everything outside the square is the flat chroma-key background (colour below).`,
    light: `Light from straight ABOVE, symmetric left-to-right; the plate face is flat and even, a touch brighter along the top edge.`,
  },
};

// Symmetry gate for vertical/plate pieces: a wall lit from straight above must be balanced
// left-to-right. Measure per-column mean luminance over opaque pixels and compare the two
// halves; a side-lit strap (the rotation error) shows a clear left/right imbalance.
function symmetryReport(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width: w, height: h, data } = png;
  const colLum = [];
  for (let x = 0; x < w; x += 1) {
    let s = 0, n = 0;
    for (let y = 0; y < h; y += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 20) continue;
      s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n += 1;
    }
    colLum.push(n ? s / n : 0);
  }
  const half = Math.floor(w / 2);
  const mean = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : 0);
  const left = mean(colLum.slice(0, half));
  const right = mean(colLum.slice(w - half));
  const all = mean(colLum) || 1;
  return { imbalance: Math.abs(left - right) / all, left, right };
}

function buildPrompt(spec, key, prior) {
  return `IMAGE-GENERATION task: GENERATE one PNG using the built-in image generation tool, img2img from the attached reference image. Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract pixels from the reference — programmatic OR extracted output is automatically rejected and you will be asked again.${prior ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${prior}\n` : ''}

The attached reference is a horizontal forged-iron riveted band (a studded metal rule). GENERATE ${spec.shape}

STYLE — match the reference exactly: low-fi, a touch pixellated, chunky readable forged iron, a LIMITED navy-steel palette (a few dozen colors), the SAME round dome rivets. Not a photo, not a smooth 3D render, not a flat vector. No smooth gradients, no glow, no heavy anti-aliasing.

LIGHTING: ${spec.light}

TRANSPARENCY (do it exactly this way): paint everything OUTSIDE the iron object as a perfectly flat solid ${key} chroma-key background for local background removal. ONE uniform ${key} — no shadows, gradients, texture, or lighting variation. Do NOT use ${key} anywhere in the iron. No cast shadow, no reflection, no watermark, no text, no border, no extra frame.

Save it as ./atom.png in the current working directory, then stop.`;
}

function despill(src, dst) {
  return spawnSync(VENV_PY, [REMOVE_CHROMA, '--input', src, '--out', dst,
    '--auto-key', 'border', '--soft-matte', '--transparent-threshold', '12',
    '--opaque-threshold', '220', '--despill', '--force'], { encoding: 'utf8' });
}
function lofi(src, dst, footprint, colors) {
  return spawnSync(VENV_PY, ['-c', PYSRC_LOFI, src, dst, String(footprint), String(colors)], { encoding: 'utf8' });
}
function transparencyFrac(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width: w, height: h, data } = png;
  let t = 0, n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { n++; if (data[(y * w + x) * 4 + 3] < 20) t++; }
  return t / n;
}

function finish(name, spec, rawCopy) {
  const smooth = join(TMP, `${name}-smooth.png`);
  const cr = despill(rawCopy, smooth);
  if (cr.status !== 0) return { ok: false, reason: `despill: ${(cr.stderr || cr.error || 'failed').toString().trim().split('\n').pop()}` };
  try { trimToEdge(smooth); } catch (e) { return { ok: false, reason: `trim: ${e.message}` }; }
  const out = join(OUT_DIR, spec.out);
  const lr = lofi(smooth, out, spec.footprint, 24);
  if (lr.status !== 0) return { ok: false, reason: `lofi: ${(lr.stderr || lr.error || '').toString().trim().split('\n').pop()}` };
  const fin = PNG.sync.read(readFileSync(out));
  const frac = transparencyFrac(out);
  // These are OPAQUE forged strips/plates: after trimToEdge the subject fills its box, so
  // ~0% transparency is CORRECT (no chroma holes). Only a mostly-transparent result signals a
  // bad key that ate the iron — that's the real failure to catch.
  if (frac >= 0.9) return { ok: false, reason: `mostly transparent (${Math.round(frac * 100)}%) — key likely ate the iron`, frac, collision: true };
  // SYMMETRY gate: a vertical wall / plate lit from straight above must be balanced left↔right.
  if (spec.symmetric) {
    const s = symmetryReport(out);
    if (s.imbalance > 0.12) return { ok: false, reason: `side-lit: left↔right imbalance ${Math.round(s.imbalance * 100)}% (L${Math.round(s.left)} vs R${Math.round(s.right)})`, asym: true };
  }
  return { ok: true, out, frac, dim: `${fin.width}x${fin.height}` };
}

async function forgeOne(name, spec, maxTries) {
  const rawCopy = join(TMP, `${name}-raw.png`);
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  if (process.env.REUSE_RAW === '1' && existsSync(rawCopy)) {
    process.stdout.write(`\n[${name}] REUSE_RAW — reprocessing saved raw (no generation)\n`);
    const r = finish(name, spec, rawCopy);
    console.log(r.ok ? `  ✓ ${spec.out} ${r.dim}, ${Math.round(r.frac * 100)}% transparent (reused)` : `  ✗ ${r.reason}`);
    return { name, ok: r.ok, out: r.out };
  }
  const keys = ['#00ff00', '#ff00ff']; // green first (iron carries no green); alternate on collision
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const key = keys[(attempt - 1) % keys.length];
    const work = mkdtempSync(join(tmpdir(), `forge-tb-${name}-`));
    const ref = spec.seed && existsSync(join(OUT_DIR, spec.seed)) ? join(OUT_DIR, spec.seed) : REF;
    process.stdout.write(`\n[${name}] try ${attempt}/${maxTries} (key ${key}, seed ${ref.split(/[\\/]/).pop()}) …\n`);
    const { out: jsonl } = await runCodex(work, buildPrompt(spec, key, prior), ref);
    writeFileSync(join(TMP, `${name}-try${attempt}.jsonl`), jsonl);
    const verdict = imageGenVerdict(jsonl);
    if (!verdict.ok) {
      console.log(`  METHOD ✗ — ${verdict.reason}`);
      prior = 'the rollout shows you did NOT emit an image_generation_call — you hand-drew the PNG in code. You MUST render it with the built-in image generation tool.';
      continue;
    }
    const raw = sessionImage(verdict.tid);
    if (!raw) { console.log('  no generated image in session dir; retrying'); continue; }
    copyFileSync(raw, rawCopy);
    const r = finish(name, spec, rawCopy);
    if (r.ok) { console.log(`  ✓ ${spec.out} — ${r.dim}, ${Math.round(r.frac * 100)}% transparent (image_generation_call verified)`); return { name, ok: true, out: r.out }; }
    console.log(`  ✗ ${r.reason} — retrying`);
    if (r.collision) { prior = `the cutout came out ${Math.round(r.frac * 100)}% transparent — ${key} likely appeared in the iron and punched holes. Keep the iron free of ${key}.`; }
    else if (r.asym) { prior = `your strap was SIDE-LIT — one side came out brighter than the other, as if the light came from the side. It must be lit from STRAIGHT ABOVE: the left and right halves identical, flat even strap face, no bright edge on either side, only the round rivets glinting on their tops.`; }
    else { prior = ''; }
  }
  return { name, ok: false };
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = argv.length ? argv.filter((a) => SPECS[a]) : ['band', 'rail', 'plate'];
console.log(`forge-titlebar-wall: ${names.join(', ')} (ref = band-studded.png)`);
const results = [];
for (const n of names) results.push(await forgeOne(n, SPECS[n], 3));
console.log(`\n==== ${results.filter((r) => r.ok).length}/${results.length} forged ====`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? ` -> ${r.out}` : ''}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
