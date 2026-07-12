// Method-verified wall-material img2img generation into a live-media source or
// candidate. The generated swatch exists only in an OS temp workspace and is
// passed directly to the canonical uploader.
//
// node scripts/forge-wall-material.mjs <reference.png> <material> [attempts] -- \
//   --api-base <url> --cookie <cookie> --slot <slot> --domain terrain --role wall-material --label <label>
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';

const separator = process.argv.indexOf('--', 2);
const localArgs = process.argv.slice(2, separator < 0 ? undefined : separator);
const uploadArgs = separator < 0 ? [] : process.argv.slice(separator + 1);
const reference = localArgs[0];
const material = localArgs[1] || '';
const attempts = Number(localArgs[2] || 3);
if (!reference || !existsSync(reference) || !material || !Number.isInteger(attempts) || attempts < 1 || !uploadArgs.length) {
  console.error('usage: forge-wall-material <reference.png> <material> [attempts] -- <live-media upload-candidate options>');
  process.exit(2);
}

const descriptions = {
  brick: 'gray castle brick wall texture with chipped rectangular masonry and subtle mortar',
  mossy: 'old mossy stone wall texture with irregular blocks and damp moss in cracks',
  basalt: 'dark basalt block wall texture with chunky volcanic blocks and subtle cracks',
  palisade: 'wooden palisade texture with worn vertical planks, bark edges, and muted timber',
};
const prompt = `Use the attached image only as an img2img material reference. Generate one seamless square pixel-art material swatch for ${descriptions[material] || material}. Keep it flat, front-facing, orthographic, and tileable for deterministic projection into an isometric wall face. No object silhouette, floor, scene, text, watermark, cast shadow, or transparency. Do not write code to draw it; use the image generation model.`;
const work = mkdtempSync(join(tmpdir(), `live-media-wall-${material}-`));
try {
  let verdict = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptDir = join(work, `attempt-${attempt}`);
    await mkdir(attemptDir, { recursive: true });
    const input = join(attemptDir, 'input_material.png');
    copyFileSync(reference, input);
    const { code, out } = await runCodex(attemptDir, prompt, input);
    verdict = imageGenVerdict(out);
    console.log(`attempt ${attempt}: exit=${code} gate.ok=${verdict.ok} reason=${verdict.reason}`);
    if (verdict.ok) break;
  }
  if (!verdict?.ok) throw new Error('method verification failed on every attempt');
  const generated = sessionImage(verdict.tid);
  if (!generated) throw new Error('image generation returned no session image');
  const candidate = join(work, 'candidate.png');
  copyFileSync(generated, candidate);
  const client = fileURLToPath(new URL('./live-media-admin-client.mjs', import.meta.url));
  const uploaded = spawnSync(process.execPath, [client, 'upload-candidate', '--file', candidate, ...uploadArgs], { stdio: 'inherit' });
  if (uploaded.error) throw uploaded.error;
  if (uploaded.status !== 0) throw new Error(`candidate upload failed with exit ${uploaded.status}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
