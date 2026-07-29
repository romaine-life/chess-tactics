#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const statePath = path.join(repoDir, '.codex-session', 'environment.json');

export function formatEnvironmentContext(state) {
  if (!state?.name || !state?.url) {
    return 'This Chess Tactics Codex environment has not completed its named local-server setup.';
  }
  const port = state.frontend_port ? ` (internal Vite port ${state.frontend_port})` : '';
  return [
    `This agent owns the named Chess Tactics environment "${state.name}".`,
    `Use ${state.url} for application links, browser testing, screenshots, and user handoff${port}.`,
    'The internal port is an implementation detail; do not substitute a localhost:PORT URL in handoff.',
  ].join('\n');
}

export async function main() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    process.stdout.write(`${formatEnvironmentContext(state)}\n`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      process.stdout.write(`${formatEnvironmentContext(null)}\n`);
      return;
    }
    throw error;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`Could not load named environment context: ${error.message}`);
    process.exitCode = 1;
  });
}
