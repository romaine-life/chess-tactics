import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const backendDir = resolve(frontendDir, '..', 'backend');
const backendDepsMarkers = [
  resolve(backendDir, 'node_modules', 'express'),
  resolve(backendDir, 'node_modules', '@chess-tactics', 'board-render'),
];
const backendLockfile = resolve(backendDir, 'package-lock.json');

if (backendDepsMarkers.every((marker) => existsSync(marker))) {
  console.log('[backend deps] already installed.');
  process.exit(0);
}

const installArgs = existsSync(backendLockfile) ? ['ci'] : ['install'];
console.log(`[backend deps] installing backend dependencies with npm ${installArgs.join(' ')} for this worktree...`);

const npmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...installArgs] : installArgs;
const install = spawnSync(npmCommand, npmArgs, {
  cwd: backendDir,
  env: process.env,
  stdio: 'inherit',
});

if (install.error) {
  console.error(`[backend deps] failed to run ${npmCommand}: ${install.error.message}`);
  process.exit(1);
}

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const missingMarkers = backendDepsMarkers.filter((marker) => !existsSync(marker));
if (missingMarkers.length > 0) {
  console.error(`[backend deps] install finished, but backend/node_modules is still missing: ${missingMarkers.join(', ')}`);
  process.exit(1);
}

console.log('[backend deps] ready.');
