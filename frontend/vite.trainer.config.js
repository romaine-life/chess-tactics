import { defineConfig } from 'vite';

// SSR/library build of the PURE engine for the headless training Job. Bundles the
// whole engine graph (selfplay/tuning/sprt/validate/openingBook/ai/core) into a
// single DOM-free Node ESM at dist-trainer/engine.mjs, which backend/train-worker.mjs
// and its worker_threads import. `noExternal: true` inlines the app's own TS so the
// runtime image needs no frontend node_modules; the app's runtime deps (pixi/react)
// are never in this graph, so nothing browser-only is pulled in.
export default defineConfig({
  build: {
    ssr: 'src/trainer/engine.ts',
    outDir: 'trainer-bundle',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'engine.mjs', format: 'es' },
    },
  },
  ssr: { noExternal: true },
});
