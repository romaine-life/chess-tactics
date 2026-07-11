// Method-verified img2img restyle of a temporary prop capture into a live-media
// candidate. No output path is accepted: the despilled PNG exists only until the
// canonical candidate uploader hash-verifies it.
//
// node scripts/forge-prop-restyle.mjs <capture.png> [attempts] -- \
//   --api-base <url> --cookie <cookie> --slot <slot> --domain prop --role sprite --label <label>
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodex, imageGenVerdict, sessionImage, removeChromaKey } from './codex-imagegen.mjs';

const separator = process.argv.indexOf('--', 2);
const localArgs = process.argv.slice(2, separator < 0 ? undefined : separator);
const uploadArgs = separator < 0 ? [] : process.argv.slice(separator + 1);
const reference = localArgs[0];
const attempts = Number(localArgs[1] || 3);
if (!reference || !existsSync(reference) || !Number.isInteger(attempts) || attempts < 1 || !uploadArgs.length) {
  console.error('usage: forge-prop-restyle <capture.png> [attempts] -- <live-media upload-candidate options>');
  process.exit(2);
}

const prompt = `Re-skin the attached reference image as clean, crisp game pixel art. Preserve exactly its geometry, silhouette, proportions, fixed 2:1 dimetric projection, footprint, and height. Change only the material treatment to a cohesive fantasy-chess palette lit from upper-left. Render on a flat #00FF00 background. Do not redesign the subject, change the angle, add a scene, or write code to draw it; use the image generation model.`;
const work = mkdtempSync(join(tmpdir(), 'live-media-prop-restyle-'));
try {
  let verdict = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptDir = join(work, `attempt-${attempt}`);
    const input = join(attemptDir, 'input_image.png');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(attemptDir, { recursive: true }));
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
  const keyed = removeChromaKey(generated, candidate);
  if (!keyed.ok) throw new Error(`chroma-key removal failed: ${keyed.reason}`);
  const client = fileURLToPath(new URL('./live-media-admin-client.mjs', import.meta.url));
  const uploaded = spawnSync(process.execPath, [client, 'upload-candidate', '--file', candidate, ...uploadArgs], { stdio: 'inherit' });
  if (uploaded.error) throw uploaded.error;
  if (uploaded.status !== 0) throw new Error(`candidate upload failed with exit ${uploaded.status}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
