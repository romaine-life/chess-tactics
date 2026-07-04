#!/usr/bin/env node
// Bundle the PURE board-render geometry (src/render/serverBoardRender.ts + its transitive imports)
// into a single CJS module the Express backend requires at runtime — backend/generated/board-render.cjs.
// This is the single-source-of-truth bridge: the server composites thumbnails from the SAME geometry
// the live editor uses (no reimplementation, no drift). The output is COMMITTED (like src/generated/),
// so it ships with `COPY backend/` and needs no Dockerfile step; `--check` (wired into `npm run check`)
// fails if the committed bundle is stale after a geometry change. Tree-shakes the browser-only
// compositing (Image/OffscreenCanvas).

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../src/render/serverBoardRender.ts');
const outfile = resolve(here, '../../backend/generated/board-render.cjs');
const checkOnly = process.argv.includes('--check');

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  write: false,
  legalComments: 'none',
  // Pin the working dir so esbuild's per-module `// <relative-path>` comments are IDENTICAL no
  // matter where the script is invoked from — otherwise the committed bundle looks "stale" whenever
  // it's rebuilt from a different cwd (the paths shift), tripping the --check gate spuriously.
  absWorkingDir: resolve(here, '..'),
  logLevel: 'warning',
});
// Normalize line endings so a CRLF checkout (Windows/autocrlf) never diverges from the LF build.
const bundled = result.outputFiles[0].text.replace(/\r\n/g, '\n');

if (checkOnly) {
  // Compare CR-agnostically: git may check the committed bundle out as CRLF on Windows.
  const current = existsSync(outfile) ? readFileSync(outfile, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== bundled) {
    console.error('backend/generated/board-render.cjs is STALE — run `npm run build:server-render` and commit the result.');
    process.exit(1);
  }
  console.log('board-render.cjs is up to date.');
} else {
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, bundled);
  // Fail-fast: the bundle must require cleanly in Node (no DOM at module top-level).
  const mod = await import(`file://${outfile}?t=${bundled.length}`);
  if (typeof mod.levelRenderPlan !== 'function' || typeof mod.boardHashForLevel !== 'function') {
    console.error('board-render.cjs missing expected exports'); process.exit(1);
  }
  console.log(`bundled ${outfile} (${bundled.length} bytes) — exports OK`);
}
