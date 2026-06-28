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

// Dev-only mock for the backend's /api/bgm contract. Local dev has no BGM blob
// backend, so the real endpoint is empty and the Settings "View Tracks" view (and
// the BGM player) have nothing to show. Opt in with BGM_DEV_TRACKS=1 to serve a
// sample playlist — off by default, so dev otherwise matches prod-without-BGM.
// The urls are placeholders (no audio ships in the repo): the track LIST renders,
// but playback won't actually start in dev.
function bgmDevMock() {
  const enabled = process.env.BGM_DEV_TRACKS === '1';
  return {
    name: 'bgm-dev-mock',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      const titles = [
        'Opening Theme', "The Knight's Gambit", 'Endgame Tension', 'Castle Walls',
        'March of the Pawns', 'Queen Ascendant', "Bishop's Diagonal", 'Rook to the Rank',
      ];
      const tracks = titles.map((title, i) => ({
        title, url: `/assets/bgm-dev/${String(i + 1).padStart(2, '0')}.mp3`,
      }));
      server.middlewares.use('/api/bgm', (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ tracks }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), doodadCompositionSave(), nineSliceDevSave(), bgmDevMock()],
});
