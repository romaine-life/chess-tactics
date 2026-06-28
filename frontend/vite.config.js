import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { nineSliceDevSave } from './scripts/vite-nine-slice-plugin.mjs';

// The legacy vanilla entry (index.html -> /src/app.js) is unchanged; the React
// plugin only adds JSX/TSX handling for the new surfaces we migrate onto.
// nineSliceDevSave is a dev-serve-only endpoint for the 9-slice editor's Save.

// Dev-only endpoint: the doodad editor POSTs a composition here and it lands on disk
// under public/assets/doodads/compositions/<name>.json (served + in the repo), so
// "Save" writes a file instead of forcing a download every time.
function doodadCompositionSave() {
  return {
    name: 'doodad-composition-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-doodad', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { name, data } = JSON.parse(body);
            const safe = String(name || 'untitled').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60);
            const rel = `public/assets/doodads/compositions/${safe}.json`;
            const out = join(process.cwd(), rel);
            await mkdir(dirname(out), { recursive: true });
            await writeFile(out, JSON.stringify(data, null, 2));
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: rel }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

// Dev-only stand-in for the backend's /api/bgm. Local dev has no backend process,
// so this fetches the REAL public BGM playlist (index.json) straight from the blob
// container and serves it in the same {tracks:[{title,url}]} shape the backend
// produces (backend/server.js) — track urls are the absolute public blob urls, so
// the soundtrack manager and player run against the real tracks. Opt in with
// BGM_DEV_TRACKS=1; override the source container with BGM_BASE_URL.
function bgmDevMock() {
  const enabled = process.env.BGM_DEV_TRACKS === '1';
  const baseUrl = (process.env.BGM_BASE_URL
    || 'https://chesstacticsmedia.blob.core.windows.net/bgm').replace(/\/+$/, '');
  const TTL = 5 * 60 * 1000;
  let cache = { tracks: null, expiry: 0 };
  async function loadTracks() {
    const now = Date.now();
    if (cache.tracks && cache.expiry > now) return cache.tracks;
    const res = await fetch(`${baseUrl}/index.json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`index ${res.status}`);
    const index = await res.json();
    const list = Array.isArray(index && index.tracks) ? index.tracks : [];
    const tracks = list
      .filter((t) => t && typeof t.file === 'string' && t.file)
      .map((t) => ({
        title: typeof t.title === 'string' && t.title ? t.title : t.file,
        url: `${baseUrl}/${encodeURIComponent(t.file)}`,
      }));
    cache = { tracks, expiry: now + TTL };
    return tracks;
  }
  return {
    name: 'bgm-dev-mock',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use('/api/bgm', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        try {
          res.end(JSON.stringify({ tracks: await loadTracks() }));
        } catch (err) {
          server.config.logger.warn(`[bgm-dev-mock] could not load ${baseUrl}/index.json: ${err.message}`);
          res.end(JSON.stringify({ tracks: [] }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), doodadCompositionSave(), nineSliceDevSave(), bgmDevMock()],
});
