// Forge wall-mounted decor sprites with Codex img2img, method-gated through the
// shared imagegen rollout check. Output here is source material: build-wall-decor.py
// trims and normalizes the transparent sprites into runtime assets.
//
//   node frontend/scripts/forge-wall-decor.mjs [asset-id...] [--tries 2]
//   node frontend/scripts/forge-wall-decor.mjs [asset-id...] --recover

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
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
  {
    id: 'mirror-keep',
    ref: join(ROOT, 'docs/art/wall-art-concepts/codex/relief-rook-alpha.png'),
    prompt: 'a single tall austere rectangular keep mirror in heavy soot-darkened wrought iron, broad square rails, four large corner bolt heads, slightly chipped edges, cold opaque blue-gray antique glass with one broad diagonal moonlight highlight and two chunky foxed patches; severe practical castle hardware, no filigree or detailed room reflection',
    sizeHint: 'upright rectangular sprite, about 4:5, with a thick frame that remains readable at 32 pixels wide',
    palette: 'blackened iron, charcoal, cool silver-blue glass, tiny restrained pewter highlights; no green',
  },
  {
    id: 'mirror-court-oval',
    ref: join(ROOT, 'docs/art/wall-art-concepts/codex/lantern-brass-alpha.png'),
    prompt: 'a single vertical court mirror with a clearly oval silhouette, thick tarnished-brass double rim and one large simple hanging crown-loop at the top, warm aged metal around opaque cool silver glass, three broad edge-foxing clusters and one restrained crescent highlight; elegant but worn, no tiny scrollwork or detailed room reflection',
    sizeHint: 'upright oval sprite, about 4:5, with a strong simple outer silhouette and no tiny filigree',
    palette: 'aged brass, muted old gold, umber shadows, cool gray-blue glass, pale silver highlight; no green',
  },
  {
    id: 'mirror-chapel-glass',
    ref: join(ROOT, 'docs/art/wall-art-concepts/codex/relief-pawn-alpha.png'),
    prompt: 'a single tall chapel mirror shaped as one bold pointed Gothic arch, broad cool-gray carved-stone frame with one deep inset bevel and a restrained muted-gold inner rim, opaque midnight-blue silvered glass with one broad dim amber reflection suggesting distant candlelight; unmistakably a mirror rather than an open window, no tracery, cross, icon, or detailed room reflection',
    sizeHint: 'tall pointed-arch sprite, about 3:4, with a broad glass area and bold readable stone frame',
    palette: 'moonlit blue-gray stone, charcoal recesses, restrained old-gold inner line, dark silver-blue glass; no green',
  },
  {
    id: 'mirror-witch-eye',
    ref: join(ROOT, 'docs/art/wall-art-concepts/codex/lantern-brass-alpha.png'),
    prompt: 'a single small round convex antique mirror, heavy tarnished dark-bronze ring with three broad mounting lugs, nearly black opaque convex glass with one off-center cold silver crescent and two stepped blue-charcoal reflection bands; eerie only through emptiness, not an eyeball, eye symbol, occult object, portal, rune, or glowing artifact',
    sizeHint: 'compact circular sprite with a bold ring silhouette and large simple glass center',
    palette: 'black iron, dark bronze, smoky navy glass, one cold silver crescent; no green',
  },
  {
    id: 'mirror-grand-gallery',
    outputId: 'mirror-grand-gallery-grounded-wide',
    evidenceId: 'mirror-grand-gallery-grounded-wide',
    ref: join(ROOT, 'docs/art/wall-art-concepts/codex/mirror-grand-gallery-tall-raw.png'),
    editTarget: true,
    referenceRole: 'The attached image is the exact edit target. Preserve its identity, palette, pixel clustering, rail thickness, corner-boss scale, and entire lower rail/baseline; extend its glass and side rails upward and modestly outward only as requested.',
    prompt: 'rebuild the same single three-wall Grand Gallery mirror as a grounded floor-to-near-ceiling assembly: keep the complete bottom rail, bottom corner bosses, and lower mounting baseline fixed; extend both side rails and the uninterrupted glass substantially upward, move the top rail upward, and widen the distance between the side assemblies enough to finish near a 0.86:1 outer width-to-height aspect; preserve the blackened iron, restrained old-brass trim, four outer bosses, broad stepped highlights, and sparse foxing; one continuous opening with no mullions, dividers, seams, repeated panels, triptych, tiled mirrors, or detailed room reflection',
    sizeHint: 'very tall three-wall sprite, about 0.86:1 width-to-height, with the lower rail fixed and generous flat-green padding around one continuous glass opening',
    palette: 'blackened iron, muted old brass, cool silver-blue glass, restrained charcoal shadows and pale silver highlights; no green',
  },
];

function promptFor(spec, prior) {
  const referenceRole = spec.referenceRole ?? (spec.editTarget
    ? 'The attached image is the exact edit target. Preserve its identity, palette, pixel clustering, width, lower rail, and lower mounting baseline; change only the requested upward height extension.'
    : 'The attached image is a style/motif reference only; extract the idea of the object, not the full wall material.');
  return `IMAGE-GENERATION task: use the attached image through the built-in image_gen tool to create ONE new transparent-ready pixel-art sprite.
Do NOT hand-draw it with code, SVG, canvas, CSS, PIL, or any programmatic renderer. You must generate it with the built-in image_gen tool. The repo will reject outputs without an image_generation_call in the rollout.${prior ? `\n\nPrevious attempt was rejected: ${prior}\n` : ''}

Use case: stylized-concept
Asset type: wall-mounted decor sprite for a browser tactics game
Primary request: ${spec.prompt}.
Reference role: ${referenceRole}
Style/medium: crisp refined small-scale pixel art with broad stepped pixel clusters, limited palette, strong silhouette, and no smooth gradients or painterly detail; cohesive with moonlit fantasy chess-board terrain and stone perimeter walls.
Composition/framing: isolated front-facing wall-mounted object, centered with generous padding, ${spec.sizeHint}.
Lighting/mood: soft cool moonlit shading with restrained warm accents where appropriate.
Color palette: ${spec.palette ?? 'muted stone grays, aged brass, faded burgundy/gold accents; low glare'}.
Output background: perfectly flat solid #00ff00 chroma-key background for alpha removal.
Constraints: the mirror glass is an opaque painted part of the sprite, never transparent; no stone-wall rectangle behind the object, no floor, no scene, no cast shadow, no contact shadow, no readable text, no watermark, no #00ff00 anywhere in the subject.
Avoid: photorealistic product rendering, complex scenery inside the glass, faces or figures, eye motifs, runes, portals, glow, hairline ornament that disappears when reduced, soft blurry outer edges.
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
      const evidenceId = spec.evidenceId ?? spec.id;
      writeFileSync(join(EVIDENCE_DIR, `${evidenceId}-try${attempt}.jsonl`), out);
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
      const outputId = spec.outputId ?? spec.id;
      const rawOut = join(RAW_DIR, `${outputId}-raw.png`);
      const alphaOut = join(RAW_DIR, `${outputId}-alpha.png`);
      copyFileSync(raw, rawOut);
      const keyed = removeChromaKey(rawOut, alphaOut);
      if (!keyed.ok) {
        prior = `chroma-key removal failed: ${keyed.reason}`;
        continue;
      }
      return {
        id: spec.id,
        ok: true,
        threadId: verdict.tid,
        reference: relative(ROOT, spec.ref).replaceAll('\\', '/'),
        prompt: spec.prompt,
        sizeHint: spec.sizeHint,
        raw: relative(ROOT, rawOut).replaceAll('\\', '/'),
        alpha: relative(ROOT, alphaOut).replaceAll('\\', '/'),
        attempts: attempt,
      };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return {
    id: spec.id,
    ok: false,
    reference: relative(ROOT, spec.ref).replaceAll('\\', '/'),
    prompt: spec.prompt,
    sizeHint: spec.sizeHint,
    attempts: maxTries,
  };
}

function recoverOne(spec) {
  if (!existsSync(EVIDENCE_DIR)) {
    return {
      id: spec.id,
      ok: false,
      reference: relative(ROOT, spec.ref).replaceAll('\\', '/'),
      prompt: spec.prompt,
      sizeHint: spec.sizeHint,
      attempts: 0,
      recovered: true,
    };
  }
  const evidenceId = spec.evidenceId ?? spec.id;
  const attempts = readdirSync(EVIDENCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${evidenceId}-try`) && entry.name.endsWith('.jsonl'))
    .map((entry) => ({
      name: entry.name,
      attempt: Number.parseInt(entry.name.slice(`${evidenceId}-try`.length, -'.jsonl'.length), 10),
    }))
    .filter((entry) => Number.isFinite(entry.attempt))
    .sort((a, b) => b.attempt - a.attempt);

  for (const candidate of attempts) {
    const out = readFileSync(join(EVIDENCE_DIR, candidate.name), 'utf8');
    const verdict = imageGenVerdict(out);
    console.log(`${spec.id} recover try ${candidate.attempt}: gate.ok=${verdict.ok} reason=${verdict.reason}`);
    if (!verdict.ok) continue;
    const raw = sessionImage(verdict.tid);
    if (!raw) continue;
    mkdirSync(RAW_DIR, { recursive: true });
    const outputId = spec.outputId ?? spec.id;
    const rawOut = join(RAW_DIR, `${outputId}-raw.png`);
    const alphaOut = join(RAW_DIR, `${outputId}-alpha.png`);
    copyFileSync(raw, rawOut);
    const keyed = removeChromaKey(rawOut, alphaOut);
    if (!keyed.ok) continue;
    return {
      id: spec.id,
      ok: true,
      threadId: verdict.tid,
      reference: relative(ROOT, spec.ref).replaceAll('\\', '/'),
      prompt: spec.prompt,
      sizeHint: spec.sizeHint,
      raw: relative(ROOT, rawOut).replaceAll('\\', '/'),
      alpha: relative(ROOT, alphaOut).replaceAll('\\', '/'),
      attempts: candidate.attempt,
      recovered: true,
    };
  }
  return {
    id: spec.id,
    ok: false,
    reference: relative(ROOT, spec.ref).replaceAll('\\', '/'),
    prompt: spec.prompt,
    sizeHint: spec.sizeHint,
    attempts: attempts[0]?.attempt ?? 0,
    recovered: true,
  };
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const maxTries = Math.max(1, Number.parseInt(flag('--tries', '2'), 10));
const recover = argv.includes('--recover');
const requested = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--tries');
const queue = requested.length ? SPECS.filter((spec) => requested.includes(spec.id)) : SPECS;

if (!queue.length) {
  console.error(`No matching wall decor specs. Known: ${SPECS.map((spec) => spec.id).join(', ')}`);
  process.exit(2);
}

console.log(`forge-wall-decor: ${queue.length} asset(s), ${recover ? 'recovering verified evidence' : `up to ${maxTries} tries`}\n  codex: ${CODEX}\n`);
const results = [];
for (const spec of queue) results.push(recover ? recoverOne(spec) : await forgeOne(spec, maxTries));

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
