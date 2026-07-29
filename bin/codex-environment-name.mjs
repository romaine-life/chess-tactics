#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoDir = path.resolve(path.dirname(scriptPath), '..');
const statePath = path.join(repoDir, '.codex-session', 'environment.json');
const PROJECT = 'chess-tactics';

export function normalizeEnvironmentName(raw) {
  let name = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (name.length > 63) name = name.slice(0, 63).replace(/-+$/g, '');
  if (!name) throw new Error('Environment name must contain at least one letter or number.');
  return name;
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function promptForName(existingName = '') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('No interactive terminal is available. Set CODEX_ENVIRONMENT_NAME or pass --name.');
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = existingName ? ` [${existingName}]` : '';
    const answer = await readline.question(`Name this Chess Tactics environment${suffix}: `);
    return answer.trim() || existingName;
  } finally {
    readline.close();
  }
}

export async function writeEnvironmentRecord(rawName) {
  const existing = await readExisting();
  const name = normalizeEnvironmentName(rawName);
  const hostname = `${name}.${PROJECT}.localhost`;
  const now = new Date().toISOString();
  const record = {
    schema_version: 1,
    project: PROJECT,
    name,
    hostname,
    url: `http://${hostname}`,
    repo_dir: repoDir,
    status: 'named',
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return record;
}

async function main() {
  const nameIndex = process.argv.indexOf('--name');
  const explicit = nameIndex >= 0 ? process.argv[nameIndex + 1] : process.env.CODEX_ENVIRONMENT_NAME;
  const existing = await readExisting();
  const rawName = explicit || await promptForName(existing?.name || '');
  const record = await writeEnvironmentRecord(rawName);
  console.log(`Environment name: ${record.name}`);
  console.log(`Local URL: ${record.url}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  main().catch((error) => {
    console.error(`Could not name this environment: ${error.message}`);
    process.exitCode = 1;
  });
}
