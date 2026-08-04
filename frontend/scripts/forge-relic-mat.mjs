// Forge LIPSANON MAT candidates (codex imagegen) -- the surface the Run's lipsanon offers are
// laid out on, mounted over the chosen Spolia backdrop.
//
// A mat is not a backdrop and not a 9-slice frame: it is one wide object with SOFT,
// IRREGULAR ALPHA EDGES -- a torn sheet, an unfolded cloth, a tray -- so the table beneath
// it stays visible and no rectangle seam appears. gpt-image cannot paint transparency
// (ADR-0013), so the mat is generated on flat chroma green and keyed out locally with
// codex's own remove_chroma_key.py. PixelLab has native alpha and is driven separately.
//
// Authored wide (about 8:3) because three lipsanon cards sit on it in a row: .run-card-grid
// tracks are minmax(196px, 236px) with one --ds-inline gap between them, so the row is
// roughly 730-760px across and the mat needs bleed past that on every side.
//
//   node frontend/scripts/forge-lipsanon-mat.mjs [--mat <id>] [--tries 2] -- <upload options>
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX, runCodex, imageGenVerdict, sessionImage, removeChromaKey } from './codex-imagegen.mjs';
import { optionValue, splitGeneratorArgs, uploadGeneratedCandidate } from './upload-generated-candidate.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const NATIVE_DIR = join(SCRIPTS, '..', 'tmp', 'lipsanon-mat');

// The mat is seen over a warm lamp-lit tabletop, so the set spreads across value and
// temperature: pale-warm, pale-cool, mid-warm, dark-cool. A mat that matches the table
// disappears into it.
const MATS = {
  'mat-parchment': {
    label: 'Inventory Sheet',
    body: 'a single large sheet of old laid parchment lying flat, seen straight down. The sheet is softly cockled and not perfectly flat, with two long fold creases, slightly curled corners, and a deckled, torn, uneven edge all the way round -- no straight machine-cut sides. Faint ruled guide lines and a few pale ghost stains cross it, plus one dark red wax blot near a corner and a small pin hole. The sheet is completely BLANK: no letters, words, numbers or marks that could be read as writing.',
    palette: 'warm bone and oatmeal parchment, soft umber staining toward the edges, one deep oxblood wax note',
  },
  'mat-linen': {
    label: 'Wrapping Linen',
    body: 'a piece of coarse undyed linen cloth unfolded and laid flat, seen straight down, as if goods had just been unwrapped from it. It keeps the square memory of its folds as soft creases and low ridges, the weave is visible, the selvedge is frayed with a few loose threads, and the outline is soft and irregular where the cloth slumps -- no straight cut edge.',
    palette: 'cool off-white and pale grey-oatmeal linen, soft blue-grey shadow in the creases, a little dust-brown at the frayed edge',
  },
  'mat-tray': {
    label: 'Opened Case',
    body: 'a shallow open wooden tray or the bottom half of an opened flat case, seen from slightly above and straight on, lying flat. It has low plank sides with visible joinery and old iron corner straps, and it is lined with faded, slightly rumpled felt that has taken the shape of objects that used to sit in it. The wood is worn pale on the rim edges. The outer silhouette is the tray itself -- irregular from the straps and worn corners, not a clean rectangle.',
    palette: 'mid-warm oak and walnut wood, dark iron straps, faded moss-green or dull madder felt lining',
  },
  'mat-slate': {
    label: 'Counting Slate',
    body: 'a single flat slab of dark slate lying on its face, seen straight down, of the kind used to tally and weigh against. The surface is scuffed pale by long use with soft chalk ghosting and a few old scratches, and one corner is chipped away. The edge is naturally split and uneven all the way round -- no sawn straight sides. No readable letters, numbers or tally marks: only worn abstract scuffing.',
    palette: 'cool blue-black slate, pale chalk-grey scuffing and dust, a warm grit note in the chipped corner',
  },
};

function prompt(mat, prior) {
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.${prior ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${prior}\n` : ''}

Generate a WIDE LANDSCAPE pixel-art game object, aspect roughly 8:3 (much wider than tall): ${mat.body}

THE BACKGROUND IS THE MOST IMPORTANT INSTRUCTION. Everything that is not the object itself must be FLAT PURE CHROMA GREEN (#00FF00), one perfectly uniform solid colour, edge to edge, with NO gradient, NO texture, NO vignette, NO shadow falling onto it and NO drop shadow. The green will be deleted to transparency afterwards, so anything painted on it becomes a visible defect. Do NOT put any green, green tint, or green reflected light anywhere on the object itself.

The object must NOT touch or run off any edge of the canvas: leave a clear margin of flat green all the way around it, so its complete silhouette is inside the frame.

SILHOUETTE — the point of the whole image: the object's outer edge must be SOFT AND IRREGULAR — torn, frayed, split, worn or slumped according to what it is made of. It must NOT be a clean rectangle, a rounded rectangle, or a framed panel, and it must have no border, outline, rule or decorative frame drawn around it.

STYLE: refined, detailed PIXEL ART like a high-quality modern 16-bit game object (Octopath Traveler, Final Fantasy Tactics item art). Fine but clearly VISIBLE pixels, a limited harmonious palette, tasteful dithering. NOT a photograph, NOT a smooth digital painting, NOT a 3D render. Grounded medieval material culture — this is a real worn object, roughly 1000-1500 AD.

PALETTE AND LIGHT: ${mat.palette}. Light comes softly from the upper left; keep the middle of the object comparatively CALM, EVEN AND LOW-CONTRAST, because interface panels will be drawn on top of it and must stay readable. Put the character and incident at the edges.

HARD EXCLUSIONS: NO text, letters, numbers, runes, glyphs, signatures, tally marks, watermark or logo of any kind — every written surface is blank. NO chessboard, checkered pattern or game pieces. NO glowing light, magic, auras or sparkle. NO modern objects. NO people, hands or faces. NO objects sitting on top of the mat — the mat is empty and by itself.

Save it as ./mat.png in the current working directory, then stop.`;
}

function trimToObject(input, output) {
  const done = spawnSync('python', [join(SCRIPTS, 'trim-alpha.py'), input, output], { encoding: 'utf8' });
  if (done.error) return { ok: false, reason: String(done.error.message) };
  if (done.status !== 0) return { ok: false, reason: (done.stderr || done.stdout || `python exit ${done.status}`).trim().split('\n').pop() };
  return { ok: true, reason: done.stdout.trim() };
}

async function forgeMat(matId, mat, maxTries) {
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const work = mkdtempSync(join(tmpdir(), `lipsanonmat-${matId}-`));
    try {
      const { out: jsonl } = await runCodex(work, prompt(mat, prior));
      const verdict = imageGenVerdict(jsonl);
      if (!verdict.ok) {
        console.log(`  ${matId} try ${attempt}: METHOD x — ${verdict.reason}`);
        prior = 'the rollout shows you did NOT emit an image_generation_call — you hand-drew the PNG in code. You MUST use the built-in image_gen tool to GENERATE it as a real bitmap.';
        continue;
      }
      const flat = sessionImage(verdict.tid);
      if (!flat) { prior = 'image not found; generate again into the default folder.'; continue; }

      mkdirSync(NATIVE_DIR, { recursive: true });
      copyFileSync(flat, join(NATIVE_DIR, `${matId}-codex-chroma.png`));

      const keyed = join(work, 'keyed.png');
      const keyResult = removeChromaKey(flat, keyed);
      if (!keyResult.ok) {
        console.log(`  ${matId} try ${attempt}: CHROMA x — ${keyResult.reason}`);
        prior = 'the flat green background could not be keyed out. Paint the background as ONE perfectly uniform flat #00FF00 with no gradient, texture or shadow.';
        continue;
      }

      const trimmed = join(NATIVE_DIR, `${matId}-codex.png`);
      const trim = trimToObject(keyed, trimmed);
      if (!trim.ok) { console.log(`  ${matId}: trim failed — ${trim.reason}`); return { matId, pass: false }; }

      const provenance = join(work, 'provenance.json');
      writeFileSync(provenance, `${JSON.stringify({
        generator: 'forge-lipsanon-mat', mat: matId, threadId: verdict.tid,
        alpha: 'flat #00FF00 chroma key (ADR-0013) then trimmed to the object bounds',
      }, null, 2)}\n`);

      // The generated pixels are already on disk and keyed by this point, so an upload
      // fault must not take its siblings down with it -- concurrent upload processes have
      // died on Windows with 0xC0000409 mid-batch, and an unhandled reject here loses
      // every other mat in the same Promise.all. Report the file to retry instead.
      try {
        uploadGeneratedCandidate(trimmed, [
          ...uploadArgs,
          '--label', `Run lipsanon mat candidate — ${mat.label} (codex)`,
          '--provenance-json', provenance,
        ], `review/run-lipsanon-mat/${matId}/codex.png`);
      } catch (reason) {
        const why = reason instanceof Error ? reason.message : String(reason);
        console.log(`  ${matId}: UPLOAD x — ${why}; keyed pixels kept at ${trimmed}`);
        return { matId, pass: false, kept: trimmed };
      }
      console.log(`  ${matId} try ${attempt}: ok — ${trim.reason}`);
      return { matId, pass: true };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return { matId, pass: false };
}

const { toolArgs, uploadArgs } = splitGeneratorArgs(process.argv.slice(2));
if (!uploadArgs.length) throw new Error('forge-lipsanon-mat requires live-media options after --');
const only = optionValue(toolArgs, '--mat');
const triesIndex = toolArgs.indexOf('--tries');
const maxTries = Math.max(1, parseInt(triesIndex >= 0 ? toolArgs[triesIndex + 1] : '2', 10));
const mats = Object.entries(MATS).filter(([id]) => !only || id === only);
if (!mats.length) throw new Error(`no mat '${only}'`);

console.log(`forge-lipsanon-mat: ${mats.length} mat(s)\n  codex: ${CODEX}\n`);
const results = await Promise.all(mats.map(([id, mat]) => forgeMat(id, mat, maxTries)));
const ok = results.filter((r) => r.pass).length;
console.log(`\n==== ${ok}/${results.length} mats forged ====`);
for (const r of results.filter((r) => !r.pass)) {
  console.log(`  FAILED: ${r.matId}${r.kept ? ` (retry upload of ${r.kept})` : ''}`);
}
