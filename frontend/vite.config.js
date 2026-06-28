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

// Generate a short mono sine-tone WAV (16-bit PCM) with a tiny fade in/out so it
// doesn't click. Used only by the dev BGM mock below.
function toneWav(freq, seconds, rate = 8000) {
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  let o = 0;
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + n * 2, o); o += 4;
  buf.write('WAVE', o); o += 4;
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;      // PCM chunk size
  buf.writeUInt16LE(1, o); o += 2;       // format = PCM
  buf.writeUInt16LE(1, o); o += 2;       // channels = mono
  buf.writeUInt32LE(rate, o); o += 4;    // sample rate
  buf.writeUInt32LE(rate * 2, o); o += 4; // byte rate
  buf.writeUInt16LE(2, o); o += 2;       // block align
  buf.writeUInt16LE(16, o); o += 2;      // bits per sample
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(n * 2, o); o += 4;
  const amp = 0.18 * 0x7fff;
  const fade = Math.max(1, Math.floor(rate * 0.04));
  for (let i = 0; i < n; i += 1) {
    const env = Math.min(1, i / fade, (n - i) / fade);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * env), 44 + i * 2);
  }
  return buf;
}

// Dev-only mock for the backend's /api/bgm contract. Local dev has no BGM blob
// backend, so the real endpoint is empty and the Settings soundtrack manager (and
// the BGM player) have nothing to exercise. Opt in with BGM_DEV_TRACKS=1 to serve a
// sample playlist whose tracks are real, playable sine tones (one pitch each), so
// Play/Stop and the per-track on/off rotation can be tested for real. Off by
// default, so dev otherwise matches prod-without-BGM.
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
      const freqs = [262, 294, 330, 349, 392, 440, 494, 523]; // a C-major scale
      const tracks = titles.map((title, i) => ({
        title,
        url: `/assets/bgm-dev/tone.wav?f=${freqs[i]}&t=${String(i + 1).padStart(2, '0')}`,
      }));
      server.middlewares.use('/api/bgm', (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ tracks }));
      });
      server.middlewares.use('/assets/bgm-dev/tone.wav', (req, res) => {
        const params = new URL(req.url || '', 'http://localhost').searchParams;
        const freq = Math.min(2000, Math.max(50, Number(params.get('f')) || 440));
        const seconds = Math.min(30, Math.max(1, Number(params.get('s')) || 8));
        const wav = toneWav(freq, seconds);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', String(wav.length));
        res.end(wav);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), doodadCompositionSave(), nineSliceDevSave(), bgmDevMock()],
});
