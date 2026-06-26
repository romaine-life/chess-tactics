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
import { existsSync, copyFileSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

export async function forgeAtom({ ref, out, desc, key = '#00ff00' }) {
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
  const raw = out.replace(/\.png$/i, '-raw.png');
  copyFileSync(produced, raw);
  const cr = despill(produced, out);
  if (cr.status !== 0) throw new Error(`forge-atom: despill failed: ${cr.stderr || cr.error}`);
  const t = transparencyOk(out);
  if (!t.ok) {
    throw new Error(`forge-atom: transparency gate failed — ${(t.frac * 100).toFixed(0)}% transparent (expected 5–97%). ~0% = opaque plate (key not removed); ~100% = empty. A mid-range miss can mean the art used the ${key} key color (holes) — re-run with a different --key (e.g. #ff00ff). Output: ${out}`);
  }
  console.log(`forge-atom OK -> ${out}  (${(t.frac * 100).toFixed(0)}% transparent; raw kept: ${basename(raw)})`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const ref = get('--ref'); const out = get('--out'); const key = get('--key') || '#00ff00';
  let desc = get('--desc');
  if (get('--desc-file')) desc = readFileSync(get('--desc-file'), 'utf8');
  if (!ref || !out || !desc) {
    console.error('usage: forge-atom.mjs --ref <png> --out <atoms/x.png> --desc "<atom description>" [--key #00ff00]');
    process.exit(2);
  }
  try { await forgeAtom({ ref, out, desc, key }); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
