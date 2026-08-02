// Runner for scripts/bench-live-search.ts — esbuild-bundles the TS harness (and the
// core it imports) into a single ESM file and runs it on plain node. No Vite, no
// vitest: the engine core is pure TS with no DOM/asset imports, so a bundle is the
// least intrusive way to measure it, and it keeps the timings free of a test
// runner's instrumentation.
//
//   node scripts/bench-live-search.mjs [--json out.json] [--reps 3]
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'bench-live-search-'));
const outfile = join(dir, 'bench.mjs');
try {
  await build({
    entryPoints: [new URL('./bench-live-search.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // `require` is used for node:fs inside the harness; give it a real one.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  process.argv = [process.argv[0], outfile, ...process.argv.slice(2)];
  await import(pathToFileURL(outfile).href);
} finally {
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0).unref();
}
