import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const backendDir = resolve(frontendDir, '..', 'backend');
const backendDepsMarker = resolve(backendDir, 'node_modules', 'express');
const backendLockfile = resolve(backendDir, 'package-lock.json');

if (existsSync(backendDepsMarker)) {
  console.log('[backend deps] already installed.');
  process.exit(0);
}

const installArgs = existsSync(backendLockfile) ? ['ci'] : ['install'];
console.log(`[backend deps] installing backend dependencies with npm ${installArgs.join(' ')} for this fresh worktree...`);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(npmCommand, installArgs, {
  cwd: backendDir,
  env: process.env,
  stdio: 'inherit',
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

if (!existsSync(backendDepsMarker)) {
  console.error('[backend deps] install finished, but backend/node_modules is still missing express.');
  process.exit(1);
}

console.log('[backend deps] ready.');
