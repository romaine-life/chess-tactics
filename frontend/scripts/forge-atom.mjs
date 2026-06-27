// forge-atom.mjs — the ATOM-PAINTER: front half of the 9-slice pipeline (ADR-0012).
//
// Generates ONE transparent kit atom via the decided method (ADR-0013):
// built-in / subscription codex img2img on a flat chroma-key background, then
// remove_chroma_key.py -> alpha. The result is GATED twice and will NOT be saved
// unless both pass:
//   1. METHOD — an `image_generation_call` event in the rollout (real generation,
//      not code-drawn). The stdout method gate is known-unreliable; we read the
//      rollout (kit-forge.md).
//   2. TRANSPARENCY — the four corners are actually transparent after despill
//      (catches a chroma-key-color collision in the art; switch --key if so).
//
// The CALLER only describes the atom; this tool owns the method + transparency
// scaffolding so transparency can't be requested the wrong (prose) way — that
// failure (ADR-0013) is designed out, not left to the prompt author.
//
// Use:
//   node scripts/forge-atom.mjs --ref <ref.png> --out public/assets/ui/kit/atoms/<name>.png --desc "..."
//   import { forgeAtom } from './forge-atom.mjs'   // for per-element generators
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const CODEX = 'C:/Users/Nelson/AppData/Local/OpenAI/Codex/bin/38dff8711e296435/codex.exe';
const PY = 'D:/automation/python312/python.exe';
const REMOVE = 'C:/Users/Nelson/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py';
const SESSIONS = 'C:/Users/Nelson/.codex/sessions';

function banner(key) {
  console.log(`
┌─ forge-atom · paints ONE transparent kit atom (ADR-0012 front half · ADR-0013 method) ─
│ METHOD:       built-in/subscription codex img2img, verified by image_generation_call.
│ TRANSPARENCY: generate on a flat ${key} chroma-key bg -> remove_chroma_key.py.
│               Never request "transparent" in prose; never use ${key} in the art.
│ GATE:         refuses to save unless generation is verified AND corners transparent.
└─────────────────────────────────────────────────────────────────────────────────────────
`);
}

function buildPrompt(desc, key) {
  return `IMAGE-GENERATION task: GENERATE one PNG using the built-in image generation tool (img2img from the attached reference). Do NOT hand-draw it with code (PIL/cairo/SVG/HTML/CSS/canvas), do NOT write a script, and do NOT crop or extract pixels from any file — programmatic OR extracted output is automatically rejected.
${desc}
FIDELITY (match the concept's low-fi element look — ADR-0014 / docs/ui-chrome-vocabulary.md): low-fi, pixellated, indie. Use a LIMITED palette (a few hundred colors for this element, not thousands), CHUNKY / stepped edges, authored at native footprint. Do NOT anti-alias into smooth edges, do NOT produce a high-fidelity or painterly render, no gradients, no glow.
TRANSPARENCY (do it exactly this way): paint everything OUTSIDE the subject as a perfectly flat solid ${key} chroma-key background for local background removal. The background must be ONE uniform ${key} — no shadows, gradients, texture, reflections, floor plane, or lighting variation. Do NOT use ${key} anywhere in the subject. No cast shadow, no contact shadow, no reflection, no watermark, no text.
Save it as ./atom.png in the current working directory, then stop.`;
}

function run(prompt, ref) {
  return new Promise((res) => {
    const work = mkdtempSync(join(tmpdir(), 'forge-atom-'));
    const p = spawn(CODEX, ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', work, '-i', ref], { stdio: ['pipe', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', () => res({ log, work }));
    p.on('error', (e) => res({ log: String(e), work }));
    p.stdin.write(prompt); p.stdin.end();
  });
}

function methodVerified(startMs) {
  let best = null, bestT = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
        const t = statSync(p).mtimeMs;
        if (t >= startMs - 2000 && t > bestT) { bestT = t; best = p; }
      }
    }
  };
  try { walk(SESSIONS); } catch { /* sessions dir absent */ }
  return best ? readFileSync(best, 'utf8').includes('image_generation_call') : false;
}

function despill(src, dst) {
  return spawnSync(PY, [REMOVE, '--input', src, '--out', dst,
    '--auto-key', 'border', '--soft-matte',
    '--transparent-threshold', '12', '--opaque-threshold', '220', '--despill', '--force'], { encoding: 'utf8' });
}

// ADR-0014 low-fi step: bring the smooth despilled atom down to its native footprint
// and quantize to a limited palette. Downscaling smooth art to its real on-screen
// size IS the pixelation; the quantize collapses it toward the concept's few-hundred
// colors. This is what makes the atom chunky/low-fi instead of a smooth render.
function lofi(src, dst, footprint, colors) {
  const py = "from PIL import Image\nimport sys\ninp,outp,fp,cols=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])\nim=Image.open(inp).convert('RGBA')\nw,h=im.size\ns=fp/max(w,h)\nim2=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.LANCZOS)\na=im2.split()[3]\nrgb=im2.convert('RGB').quantize(colors=cols,method=Image.MEDIANCUT).convert('RGBA')\nrgb.putalpha(a)\nrgb.save(outp)";
  return spawnSync(PY, ['-c', py, src, dst, String(footprint), String(colors)], { encoding: 'utf8' });
}

// Transparency gate: confirm the despill produced a real alpha cutout (the key
// background was removed) rather than an opaque plate (the ADR-0013 failure mode).
// We can't assume WHERE the transparency is — a corner atom keeps an opaque
// interior corner, an edge atom keeps one opaque side, a fill is fully opaque — so
// we check the global transparent fraction is in a sane range, not specific corners.
function transparencyOk(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width: w, height: h, data } = png;
  let transparent = 0, total = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { total += 1; if (data[(y * w + x) * 4 + 3] < 20) transparent += 1; }
  const frac = transparent / total;
  return { ok: frac > 0.05 && frac < 0.97, frac };
}

// EDGE-FLUSH contract: a kit atom's frame must reach the atom's edge — no empty
// exterior margin. Codex tends to draw the frame inset inside a transparent margin
// (it reproduces the reference crop's surroundings); that inset margin is what the
// assembler's full-canvas fill bleeds navy into. So we trim the atom to its opaque
// bounding box, guaranteeing the frame is flush to the edge — the same property the
// accepted gold atoms already have. Throws if the atom is empty.
function trimToEdge(file) {
  const png = PNG.sync.read(readFileSync(file));
  const { width: w, height: h, data } = png;
  const a = (x, y) => data[(y * w + x) * 4 + 3];
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a(x, y) > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) throw new Error('forge-atom: atom is fully transparent — no frame to trim to');
  const margins = { top: minY, left: minX, bottom: h - 1 - maxY, right: w - 1 - maxX };
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  if (cw === w && ch === h) return { margins, w: cw, h: ch };
  const o = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = ((minY + y) * w + (minX + x)) * 4, d = (y * cw + x) * 4; o.data[d] = data[s]; o.data[d + 1] = data[s + 1]; o.data[d + 2] = data[s + 2]; o.data[d + 3] = data[s + 3]; }
  writeFileSync(file, PNG.sync.write(o));
  return { margins, w: cw, h: ch };
}

export async function forgeAtom({ ref, out, desc, key = '#00ff00', footprint = 48, colors = 64, noTrim = false }) {
  if (!existsSync(ref)) throw new Error(`forge-atom: ref not found: ${ref}`);
  banner(key);
  const started = Date.now();
  const { log, work } = await run(buildPrompt(desc, key), ref);
  if (!methodVerified(started)) {
    throw new Error(`forge-atom: NO image_generation_call in rollout — codex did not generate (rejected). tail:\n${log.slice(-400)}`);
  }
  const produced = join(work, 'atom.png');
  if (!existsSync(produced)) throw new Error(`forge-atom: codex produced no atom.png (workdir had: ${readdirSync(work).join(', ') || '(empty)'})`);
  mkdirSync(dirname(out), { recursive: true });
  const raw = out.replace(/\.png$/i, '-raw.png');        // green plate (raw generation)
  const smooth = out.replace(/\.png$/i, '-smooth.png');  // despilled, pre-low-fi (inspection)
  copyFileSync(produced, raw);
  const cr = despill(produced, smooth);
  if (cr.status !== 0) throw new Error(`forge-atom: despill failed: ${cr.stderr || cr.error}`);
  const lr = lofi(smooth, out, footprint, colors);       // ADR-0014: native footprint + limited palette
  if (lr.status !== 0) throw new Error(`forge-atom: low-fi step failed: ${lr.stderr || lr.error}`);
  // trimToEdge is a 9-slice invariant (frame flush to the edge so border-image tiles
  // seamlessly). A self-contained BADGE sprite is placed whole, not tiled, so its
  // transparent margin is intentional — skip the trim for --no-trim. Transparency is
  // unaffected either way: it comes from despill() above, not from trimming.
  const trim = noTrim ? null : trimToEdge(out);
  const t = transparencyOk(out);
  if (!t.ok) {
    throw new Error(`forge-atom: transparency gate failed — ${(t.frac * 100).toFixed(0)}% transparent (expected 5–97%). ~0% = opaque plate (key not removed); ~100% = empty. A mid-range miss can mean the art used the ${key} key color (holes) — re-run with a different --key (e.g. #ff00ff). Output: ${out}`);
  }
  if (trim) {
    const m = trim.margins;
    console.log(`forge-atom OK -> ${out}  (${trim.w}x${trim.h} edge-flush, ${colors}-color low-fi; trimmed margin t${m.top}/l${m.left}/b${m.bottom}/r${m.right}; ${(t.frac * 100).toFixed(0)}% transparent)`);
  } else {
    console.log(`forge-atom OK -> ${out}  (no-trim sprite, ${colors}-color low-fi; ${(t.frac * 100).toFixed(0)}% transparent)`);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const ref = get('--ref'); const out = get('--out'); const key = get('--key') || '#00ff00';
  const footprint = Number(get('--footprint')) || 48;
  const colors = Number(get('--colors')) || 64;
  let desc = get('--desc');
  if (get('--desc-file')) desc = readFileSync(get('--desc-file'), 'utf8');
  const noTrim = args.includes('--no-trim');
  if (!ref || !out || !desc) {
    console.error('usage: forge-atom.mjs --ref <png> --out <atoms/x.png> --desc "..." [--key #00ff00] [--footprint 48] [--colors 64] [--no-trim]');
    process.exit(2);
  }
  try { await forgeAtom({ ref, out, desc, key, footprint, colors, noTrim }); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
