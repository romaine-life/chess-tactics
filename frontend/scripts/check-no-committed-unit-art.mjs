import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const pieces = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
const palettes = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
const failures = [];

for (const piece of pieces) for (const palette of palettes) {
  const retiredDir = path.join(frontendRoot, 'public', 'assets', 'units', piece, palette);
  if (fs.existsSync(retiredDir)) failures.push(path.relative(repoRoot, retiredDir));
}

for (const retiredPath of [
  'backend/scripts/import-unit-assets.mjs',
  'frontend/scripts/codexsheet',
]) {
  if (fs.existsSync(path.join(repoRoot, retiredPath))) failures.push(retiredPath);
}

const forbidden = [
  /committedSpritePath/,
  /committed(?:\s+or|\/)last-good unit catalog/i,
  /\/assets\/units\/(?:pawn|rook|knight|bishop|queen|king)\/(?:navy-blue|crimson|golden|emerald|black|white)\//,
];
const sourceRoots = [
  path.join(frontendRoot, 'src'),
  path.join(repoRoot, 'packages', 'board-render', 'src'),
  path.join(repoRoot, 'backend'),
];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(target);
      continue;
    }
    if (!/\.(?:js|mjs|ts|tsx|json)$/.test(entry.name)) continue;
    const source = fs.readFileSync(target, 'utf8');
    if (forbidden.some((pattern) => pattern.test(source))) failures.push(path.relative(repoRoot, target));
  }
}

for (const root of sourceRoots) scan(root);

if (failures.length) {
  console.error('Committed unit-art migration guard FAILED:');
  for (const failure of [...new Set(failures)].sort()) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('Committed unit-art migration guard OK: live catalog is the only board-unit art source.');
