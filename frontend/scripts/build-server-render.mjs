#!/usr/bin/env node
// Bundle the DOM-free board render plan for Express OG thumbnails.
//
// This intentionally writes a build artifact under backend/generated/ instead of
// committing it. PR #362 removed the old thumbnail path because the committed
// bundle drifted from source and blocked deploys; generating it during Docker /
// preview / test startup keeps the feature without the stale-file trap.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../src/render/serverBoardRender.ts');
const outfile = resolve(here, '../../backend/generated/board-render.cjs');

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  legalComments: 'none',
  absWorkingDir: resolve(here, '..'),
  logLevel: 'warning',
});

const bundled = result.outputFiles[0].text.replace(/\r\n/g, '\n');
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, bundled);

const mod = await import(`file://${outfile}?t=${Date.now()}`);
if (
  typeof mod.levelRenderPlan !== 'function' ||
  typeof mod.boardHashForLevel !== 'function' ||
  typeof mod.applyPropSeatOverrides !== 'function'
) {
  console.error('board-render.cjs missing expected exports');
  process.exit(1);
}
console.log(`bundled ${outfile} (${bundled.length} bytes)`);
