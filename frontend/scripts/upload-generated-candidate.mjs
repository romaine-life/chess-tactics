// Small adapter for generators that already produced a verified temporary file.
// It delegates lifecycle/hash verification to the canonical admin client.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function splitGeneratorArgs(argv) {
  const separator = argv.indexOf('--');
  return {
    toolArgs: separator < 0 ? argv : argv.slice(0, separator),
    uploadArgs: separator < 0 ? [] : argv.slice(separator + 1),
  };
}

export function optionValue(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? '' : args[index + 1] || '';
}

export function uploadGeneratedCandidate(file, uploadArgs, slot) {
  if (!uploadArgs.length) throw new Error('live-media upload options are required after --');
  if (!slot) throw new Error('a stable semantic slot is required');
  const client = fileURLToPath(new URL('./live-media-admin-client.mjs', import.meta.url));
  const completed = spawnSync(process.execPath, [client, 'upload-candidate', '--file', file, '--slot', slot, ...uploadArgs], { stdio: 'inherit' });
  if (completed.error) throw completed.error;
  if (completed.status !== 0) throw new Error(`candidate upload failed with exit ${completed.status}`);
}
