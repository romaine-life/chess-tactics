import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const forbiddenPortArgs = new Set(['--port', '-p', '--strictPort']);
const forwardedArgs = process.argv.slice(2);
const badArg = forwardedArgs.find((arg) => forbiddenPortArgs.has(arg) || arg.startsWith('--port='));

if (badArg) {
  console.error('');
  console.error('[dev server] Do not specify a Vite port for this repo.');
  console.error('[dev server] Run `npm run dev` and let Vite choose the available port.');
  console.error(`[dev server] Rejected argument: ${badArg}`);
  console.error('');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const npmBin = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const npmArgs = (...args) => (process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args);

const setupCommands = [
  [process.execPath, ['scripts/ensure-backend-deps.mjs'], frontendDir],
  [npmBin, npmArgs('--prefix', '../packages/board-render', 'run', 'build'), frontendDir],
];

for (const [command, args, cwd] of setupCommands) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[dev server] Failed to start setup command: ${command}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const managedPort = process.env.DEVCTL_MANAGED === '1'
  ? Number.parseInt(process.env.DEVCTL_FRONTEND_PORT || '', 10)
  : null;
if (process.env.DEVCTL_MANAGED === '1' && (!managedPort || managedPort < 1 || managedPort > 65535)) {
  console.error('[dev server] DEVCTL_FRONTEND_PORT must be a valid port for a managed environment.');
  process.exit(1);
}
const viteArgs = [
  viteBin,
  '--host',
  '0.0.0.0',
  ...(managedPort ? ['--port', String(managedPort), '--strictPort'] : []),
  ...forwardedArgs,
];

const child = spawn(process.execPath, viteArgs, {
  cwd: frontendDir,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
