// Forge the three Studio workspace-switcher
// glyphs (open book = Catalog, alchemical flask = Lab, magnifying glass = Viewer) as
// indie game-art icons of general, period-plausible objects (~0–1750 AD). They are NOT
// anchored to the anti-story lore (ADR-0035) — the owner's call (2026-07-03): they read as
// plain recognizable objects that belong to the universe at large.
//
// PORTABLE by design. forge-atom.mjs / pack-menu-icons.mjs hardcode the PRIMARY dev box's
// paths (D:/automation python, C:/Users/Nelson/.codex); this laptop is a different Windows
// user, so editing those would break them there. Instead this drives the PORTABLE engine
// (codex-imagegen.mjs: homedir-based CODEX / SESSIONS / generated_images + PATH python) and
// borrows only the two PURE-JS helpers (trimToEdge, padToCanvas) from forge-atom. Same
// method + gates as the kit (ADR-0011/0013/0014/0026):
//   codex txt2img onto a flat chroma plate -> method-verified via the session ROLLOUT
//   (image_generation_call, never stdout) -> despill to alpha -> low-fi downscale/quantize
//   -> trim to the glyph -> pad to the 64x64 icon canvas -> dimension assert.
//
//   node scripts/forge-studio-switcher-icons.mjs [catalog lab viewer] --slot-prefix <slot> -- <upload options>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';
import { trimToEdge, padToCanvas } from './forge-atom.mjs'; // pure pngjs helpers — no machine paths
import { optionValue, splitGeneratorArgs, uploadGeneratedCandidate } from './upload-generated-candidate.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'forge-studio-run-'));
const OUT_DIR = join(TMP, 'out');

// This laptop ships no PIL-python on PATH, and forge-atom/codex-imagegen call bare `python`.
// So both python steps (codex's chroma-key script + the low-fi downscale) run through a
// throwaway venv (tmp-forge-studio/venv, pillow+numpy) — no global env is mutated.
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const REMOVE_CHROMA = join(CODEX_HOME, 'skills', '.system', 'imagegen', 'scripts', 'remove_chroma_key.py');
const VENV_PY = process.env.FORGE_PY || join(TMP, 'venv', 'Scripts', 'python.exe');

// ADR-0014 low-fi step, portable (PATH python): LANCZOS-downscale the smooth cutout to its
// native footprint (the downscale IS the pixelation) then MEDIANCUT-quantize to a limited
// palette. Never upscales.
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

const SPECS = {
  catalog: {
    out: 'studio-catalog.png',
    subject: 'an OPEN BOOK — an open medieval codex / illuminated manuscript lying open, two gently curved vellum pages with a few faint lines of text, bound in a sturdy leather-and-wood cover, the spine down the middle',
    period: 'Bound codices with vellum pages and leather/wood covers are solidly in period (late antiquity through 1750).',
    palette: 'cream/parchment pages, warm brown leather, small touches of gold and deep-red rubrication',
  },
  lab: {
    out: 'studio-lab.png',
    subject: "an ALCHEMICAL FLASK — a single round-bottomed glass alchemist's vessel with a narrow neck and a small cork, half-full of a luminous liquid, a couple of tiny bubbles rising",
    period: 'Glassblown alchemical vessels (flasks, alembics, retorts) fit the era (antiquity through the early-modern alchemists).',
    palette: 'pale blue-green glass, warm amber or teal liquid, a muted-brown cork; keep it clearly glass, not metal',
  },
  viewer: {
    out: 'studio-viewer.png',
    subject: 'a MAGNIFYING GLASS — one round glass lens in a metal rim with a short turned wooden handle, held at a slight diagonal',
    period: 'A simple framed hand-lens (reading stone / early optics) in a rim-and-handle mount is period-plausible (pre-1750).',
    palette: 'pale glass lens with a soft highlight, a brass/bronze rim, a warm wooden handle',
  },
};

function buildPrompt(spec, key, prior) {
  return `IMAGE-GENERATION task: GENERATE one PNG using the built-in image generation tool. Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract pixels from any file — programmatic OR extracted output is automatically rejected and you will be asked again.${prior ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${prior}\n` : ''}

Generate ONE game UI ICON of ${spec.subject}. One clear object, centered, filling most of the frame, seen straight-on (no isometric skew, no dramatic perspective).

STYLE — indie video-game icon art: low-fi and a touch pixellated, chunky readable forms, a LIMITED harmonious palette (a few dozen colors), tasteful hand-crafted shading with soft light from the upper-left. It must read as a crafted asset from a handsome indie game — NOT a photograph, NOT a smooth 3D render, NOT a flat vector logo. No smooth gradients, no glow, no heavy anti-aliasing.

PERIOD: the object must be historically plausible for roughly 0 AD to 1750 AD. ${spec.period}

PALETTE (build a limited palette from these): ${spec.palette}.

TRANSPARENCY (do it exactly this way): paint everything OUTSIDE the object as a perfectly flat solid ${key} chroma-key background for local background removal. The background must be ONE uniform ${key} — no shadows, gradients, texture, floor plane, or lighting variation. Do NOT use ${key} anywhere in the object. No cast shadow, no reflection, no watermark, no text, no border, no frame.

Save it as ./atom.png in the current working directory, then stop.`;
}

// ADR-0013 chroma-key -> alpha, via codex's own remove_chroma_key.py (soft matte + despill),
// run through the venv python. Auto-keys the BORDER, so it works whatever chroma color the
// generation used. Same tuning forge-atom uses for kit glyphs.
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

// Post-process a raw chroma-plate generation into the final 64x64 glyph. Pure (no codex),
// so it is free to re-run on a saved raw plate (REUSE_RAW=1) while tuning despill/low-fi.
// Returns { ok, out, frac } or { ok:false, reason, frac?, collision? }.
function finish(name, spec, rawCopy) {
  const smooth = join(TMP, `${name}-smooth.png`);
  const cr = despill(rawCopy, smooth);
  if (cr.status !== 0) return { ok: false, reason: `despill: ${(cr.stderr || cr.error || 'failed').toString().trim().split('\n').pop()}` };
  try { trimToEdge(smooth); } catch (e) { return { ok: false, reason: `trim: ${e.message}` }; }
  const out = join(OUT_DIR, spec.out);
  mkdirSync(OUT_DIR, { recursive: true });
  const lr = lofi(smooth, out, 48, 64);
  if (lr.status !== 0) return { ok: false, reason: `lofi: ${(lr.stderr || lr.error || '').toString().trim().split('\n').pop()}` };
  padToCanvas(out, 64, 64, 2);
  const fin = PNG.sync.read(readFileSync(out));
  if (fin.width !== 64 || fin.height !== 64) return { ok: false, reason: `canvas ${fin.width}x${fin.height} != 64x64` };
  const frac = transparencyFrac(out);
  if (!(frac > 0.05 && frac < 0.97)) return { ok: false, reason: `transparency ${Math.round(frac * 100)}% out of range`, frac, collision: true };
  return { ok: true, out, frac };
}

async function forgeOne(name, spec, maxTries) {
  const rawCopy = join(TMP, `${name}-raw.png`);
  mkdirSync(TMP, { recursive: true });
  const keys = ['#ff00ff', '#00ff00']; // magenta first (subjects carry greens/ambers); alternate if it collides
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const key = keys[(attempt - 1) % keys.length];
    const work = mkdtempSync(join(tmpdir(), `forge-studio-${name}-`));
    process.stdout.write(`\n[${name}] try ${attempt}/${maxTries} (key ${key}) …\n`);
    const { out: jsonl } = await runCodex(work, buildPrompt(spec, key, prior));
    writeFileSync(join(TMP, `${name}-try${attempt}.jsonl`), jsonl);
    const verdict = imageGenVerdict(jsonl);
    if (!verdict.ok) {
      console.log(`  METHOD ✗ — ${verdict.reason}`);
      prior = 'the rollout shows you did NOT emit an image_generation_call — you hand-drew the PNG in code. You MUST render it with the built-in image generation tool.';
      continue;
    }
    const raw = sessionImage(verdict.tid);
    if (!raw) { console.log('  no generated image in the session dir; retrying'); continue; }
    copyFileSync(raw, rawCopy);
    const r = finish(name, spec, rawCopy);
    if (r.ok) {
      const provenance = join(TMP, `${name}-provenance.json`);
      writeFileSync(provenance, `${JSON.stringify({ generator: 'forge-studio-switcher-icons', threadId: verdict.tid, icon: name }, null, 2)}\n`);
      uploadGeneratedCandidate(r.out, [...uploadArgs, '--provenance-json', provenance], `${slotPrefix}/${spec.out}`);
      console.log(`  ✓ ${spec.out} — 64×64, ${Math.round(r.frac * 100)}% transparent (uploaded)`);
      return { name, ok: true, out: `${slotPrefix}/${spec.out}` };
    }
    if (r.collision) {
      console.log(`  transparency ${Math.round(r.frac * 100)}% out of range — key ${key} likely collided; switching key & retrying`);
      prior = `the previous cutout came out ${Math.round(r.frac * 100)}% transparent — the ${key} chroma color probably also appeared in the object and punched holes. Keep the object completely free of ${key}.`;
    } else {
      console.log(`  ✗ ${r.reason} — retrying`);
      prior = '';
    }
  }
  return { name, ok: false };
}

const { toolArgs, uploadArgs } = splitGeneratorArgs(process.argv.slice(2));
const slotPrefix = optionValue(toolArgs, '--slot-prefix').replace(/\/+$/, '');
if (!slotPrefix || !uploadArgs.length) throw new Error('forge-studio-switcher-icons requires --slot-prefix and live-media options after --');
const prefixIndex = toolArgs.indexOf('--slot-prefix');
const argv = toolArgs.filter((_, index) => index !== prefixIndex && index !== prefixIndex + 1).filter((a) => !a.startsWith('--'));
const names = argv.length ? argv.filter((a) => SPECS[a]) : Object.keys(SPECS);
console.log(`forge-studio-switcher-icons: ${names.join(', ')}`);
const results = [];
for (const n of names) results.push(await forgeOne(n, SPECS[n], 3)); // SEQUENTIAL: bail-friendly + avoids the concurrent image cross-grab
console.log(`\n==== ${results.filter((r) => r.ok).length}/${results.length} forged ====`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? ` -> ${r.out}` : ''}`);
rmSync(TMP, { recursive: true, force: true });
process.exit(results.every((r) => r.ok) ? 0 : 1);
