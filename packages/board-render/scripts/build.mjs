#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, '..');
const entry = resolve(packageDir, 'src/index.ts');
const outfile = resolve(packageDir, 'dist/index.cjs');

async function loadEsbuild() {
  try {
    return await import('esbuild');
  } catch {
    const frontendEsbuild = resolve(packageDir, '../../frontend/node_modules/esbuild/lib/main.js');
    return import(pathToFileURL(frontendEsbuild).href);
  }
}

const { build } = await loadEsbuild();
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  legalComments: 'none',
  logLevel: 'warning',
});

const require = createRequire(import.meta.url);
delete require.cache[outfile];
const mod = require(outfile);
for (const name of ['levelRenderPlan', 'boardHashForLevel', 'hydratePropSeats', 'applyLiveMediaCatalog', 'applyServerRenderSnapshot', 'boardDrawOps', 'boardSocialFramingBounds', 'playRouteScreenName', 'unitAssetProductionEligibility']) {
  if (typeof mod[name] !== 'function') {
    console.error(`@chess-tactics/board-render missing expected export: ${name}`);
    process.exit(1);
  }
}
console.log(`built ${outfile}`);
