// Forge wall-mounted decor sprites with Codex img2img, method-gated through the
// shared imagegen rollout check. Output here is source material: build-wall-decor.py
// trims and normalizes the transparent sprites into runtime assets.
//
//   node frontend/scripts/forge-wall-decor.mjs [asset-id...] [--tries 2]

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX, imageGenVerdict, removeChromaKey, runCodex, sessionImage } from './codex-imagegen.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DOCS = join(ROOT, 'docs/art/wall-art-concepts');
const RAW_DIR = join(DOCS, 'codex');
const EVIDENCE_DIR = join(DOCS, 'runs/evidence');

const SPECS = [
  {
    id: 'banner-tattered',
    ref: join(ROOT, 'docs/art/wall-art-concepts/refs/banner-stone.png'),
    prompt: 'a single tattered hanging medieval banner for a stone castle wall, faded burgundy cloth with muted gold trim, torn lower points, small top hanging bar, no emblem letters',
    sizeHint: 'tall narrow sprite, about 2:3',
  },
  {
    id: 'relief-pawn',
    ref: join(ROOT, 'docs/art/wall-art-concepts/refs/relief-stone.png'),
    prompt: 'a square carved stone wall relief plaque with a simple pawn silhouette recessed into cool gray stone, chipped bevel, no letters',
    sizeHint: 'compact square sprite',
  },
  {
    id: 'relief-rook',
    ref: join(ROOT, 'docs/art/wall-art-concepts/refs/relief-stone.png'),
    prompt: 'a square carved stone wall relief plaque with a simple rook tower silhouette recessed into cool gray stone, chipped bevel, no letters',
    sizeHint: 'compact square sprite',
  },
  {
    id: 'lantern-brass',
    ref: join(ROOT, 'docs/art/wall-art-concepts/refs/lantern-wall-reference.png'),
    prompt: 'a small brass ring lantern bracket for mounting on a stone wall, unlit, soot-darkened top plate, warm aged metal, no wall texture included',
    sizeHint: 'narrow hanging sprite, about 1:2',
  },
];

function promptFor(spec, prior) {
  return `IMAGE-GENERATION task: use the attached image as an IMG2IMG visual reference for style and motif only. Create ONE new transparent-ready pixel-art sprite.
Do NOT hand-draw it with code, SVG, canvas, CSS, PIL, or any programmatic renderer. You must generate it with the built-in image_gen tool. The repo will reject outputs without an image_generation_call in the rollout.${prior ? `\n\nPrevious attempt was rejected: ${prior}\n` : ''}

Use case: stylized-concept
Asset type: wall-mounted decor sprite for a browser tactics game
Primary request: ${spec.prompt}.
Reference role: attached image is a style/motif reference only; extract the idea of the object, not the full wall material.
Style/medium: crisp refined pixel art, small game prop sprite, cohesive with moonlit fantasy chess-board terrain and stone perimeter walls.
Composition/framing: isolated front-facing wall-mounted object, centered with generous padding, ${spec.sizeHint}.
Lighting/mood: soft cool moonlit shading with restrained warm accents where appropriate.
Color palette: muted stone grays, aged brass, faded burgundy/gold accents; low glare.
Output background: perfectly flat solid #00ff00 chroma-key background for alpha removal.
Constraints: no stone-wall rectangle behind the object, no floor, no scene, no cast shadow, no contact shadow, no readable text, no watermark, no #00ff00 anywhere in the subject.
Save the generated PNG in the current working directory, then stop.`;
}

async function forgeOne(spec, maxTries) {
  if (!existsSync(spec.ref)) throw new Error(`missing reference for ${spec.id}: ${spec.ref}`);
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const work = mkdtempSync(join(tmpdir(), `wall-decor-${spec.id}-`));
    try {
      const ref = join(work, 'reference.png');
      copyFileSync(spec.ref, ref);
      const { code, out } = await runCodex(work, promptFor(spec, prior), ref);
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, `${spec.id}-try${attempt}.jsonl`), out);
      const verdict = imageGenVerdict(out);
      console.log(`${spec.id} attempt ${attempt}: exit=${code} gate.ok=${verdict.ok} reason=${verdict.reason}`);
      if (!verdict.ok) {
        prior = verdict.reason;
        continue;
      }
      const raw = sessionImage(verdict.tid);
      if (!raw) {
        prior = `no ig_*.png in session output for thread ${verdict.tid}`;
        continue;
      }
      mkdirSync(RAW_DIR, { recursive: true });
      const rawOut = join(RAW_DIR, `${spec.id}-raw.png`);
      const alphaOut = join(RAW_DIR, `${spec.id}-alpha.png`);
      copyFileSync(raw, rawOut);
      const keyed = removeChromaKey(rawOut, alphaOut);
      if (!keyed.ok) {
        prior = `chroma-key removal failed: ${keyed.reason}`;
        continue;
      }
      return { id: spec.id, ok: true, threadId: verdict.tid, raw: rawOut, alpha: alphaOut, attempts: attempt };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return { id: spec.id, ok: false, attempts: maxTries };
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const maxTries = Math.max(1, Number.parseInt(flag('--tries', '2'), 10));
const requested = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--tries');
const queue = requested.length ? SPECS.filter((spec) => requested.includes(spec.id)) : SPECS;

if (!queue.length) {
  console.error(`No matching wall decor specs. Known: ${SPECS.map((spec) => spec.id).join(', ')}`);
  process.exit(2);
}

console.log(`forge-wall-decor: ${queue.length} asset(s), up to ${maxTries} tries\n  codex: ${CODEX}\n`);
const results = [];
for (const spec of queue) results.push(await forgeOne(spec, maxTries));

mkdirSync(dirname(join(DOCS, 'runs/wall-decor-img2img-latest.json')), { recursive: true });
writeFileSync(join(DOCS, 'runs/wall-decor-img2img-latest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

const ok = results.filter((item) => item.ok);
console.log(`\n==== ${ok.length}/${results.length} forged ====`);
for (const item of ok) console.log(`  ${item.id}: thread=${item.threadId}`);
const failed = results.filter((item) => !item.ok);
if (failed.length) {
  console.log(`  FAILED: ${failed.map((item) => item.id).join(', ')}`);
  process.exit(1);
}
