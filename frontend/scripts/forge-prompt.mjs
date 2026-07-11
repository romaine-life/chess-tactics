// Method-verified one-shot image generation into a live-media candidate.
// The generated bitmap exists only in an OS temp workspace; everything after
// `--` is passed to the canonical `upload-candidate` client.
//
// node scripts/forge-prompt.mjs "<prompt>" -- --api-base <url> --cookie <cookie> \
//   --slot <slot> --domain <domain> --role <role> --label <label>
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';

const separator = process.argv.indexOf('--', 2);
const prompt = process.argv.slice(2, separator < 0 ? undefined : separator).join(' ').trim();
const uploadArgs = separator < 0 ? [] : process.argv.slice(separator + 1);
if (!prompt || !uploadArgs.length) {
  console.error('usage: forge-prompt "<prompt>" -- <live-media upload-candidate options>');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'live-media-forge-prompt-'));
try {
  const { out } = await runCodex(work, prompt);
  const verdict = imageGenVerdict(out);
  if (!verdict.ok) throw new Error(`method verification failed: ${verdict.reason}`);
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
