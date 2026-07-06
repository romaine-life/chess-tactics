// Method-gated Codex img2img forge for wall MATERIAL textures.
//
// The output is not a final isometric wall sprite. It is a generated flat
// material texture that build-wall-tiles.py projects into the shipped tile's
// canonical back-edge geometry, so the final app asset keeps the board angle.
//
//   node scripts/forge-wall-material.mjs <reference.png> <out.png> <material-name> [attempts]

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';

const REF = process.argv[2];
const OUT = process.argv[3];
const MATERIAL = process.argv[4] || 'brick';
const ATTEMPTS = Number(process.argv[5] || 3);

if (!REF || !existsSync(REF) || !OUT) {
  console.error('usage: forge-wall-material <reference.png> <out.png> <material-name> [attempts]');
  process.exit(2);
}

const materialPrompt = {
  brick: 'gray castle brick wall texture: rectangular masonry blocks, chipped corners, varied cool gray stones, subtle mortar lines',
  mossy: 'old mossy stone wall texture: irregular stones, green moss in cracks, damp age, readable block structure',
  basalt: 'dark basalt block wall texture: chunky volcanic blocks, cool charcoal palette, subtle cracks',
  palisade: 'wooden palisade plank wall texture: vertical worn planks, rough bark edges, muted brown timber',
}[MATERIAL] || `${MATERIAL} wall texture`;

const PROMPT = `Use case: style-transfer
Asset type: square material texture for a 2D game wall bake
Input image: the attached image is a stone-wall material reference; use it as img2img source/style reference, not as final geometry.
Primary request: generate one seamless square pixel-art material texture for ${materialPrompt}.
Composition/framing: flat front-facing orthographic material swatch, no camera perspective, no wall object silhouette, no floor, no background scene.
Style/medium: crisp readable pixel art, game asset texture, cohesive with fantasy chess board terrain.
Constraints: preserve the idea of stone/brick/plank surface detail from the reference, but do not preserve its photograph look. Make the texture tileable enough for projection into a small isometric wall face. No text, no watermark, no cast shadow, no transparent background. Do NOT write code to draw it; use the image generation model.`;

let verdict = null;
let tid = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const cwd = mkdtempSync(join(tmpdir(), `wall-material-${MATERIAL}-${attempt}-`));
  copyFileSync(REF, join(cwd, 'input_material.png'));
  const { code, out } = await runCodex(cwd, PROMPT, join(cwd, 'input_material.png'));
  verdict = imageGenVerdict(out);
  console.log(`attempt ${attempt}: exit=${code} gate.ok=${verdict.ok} reason=${verdict.reason}`);
  if (verdict.ok) {
    tid = verdict.tid;
    break;
  }
}

if (!verdict || !verdict.ok) {
  console.error('GATE FAILED: codex did not produce a method-verified image-generation run');
  process.exit(1);
}

const raw = sessionImage(tid);
if (!raw) {
  console.error(`no ig_*.png in session dir for thread ${tid}`);
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });
copyFileSync(raw, OUT);
console.log(`OK ${MATERIAL} material -> ${OUT}`);
console.log(`thread=${tid}`);
