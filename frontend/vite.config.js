import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nineSliceDevSave } from './scripts/vite-nine-slice-plugin.mjs';

// Stamp build/server provenance into the bundle so Settings → About can always
// say exactly what's serving this page. Every build carries the app's semver
// (package.json) — the human-facing "which release is this". In dev it also names
// the WORKTREE + commit (the thing that would have made "you're on the wrong
// worktree's server" a glance instead of a two-hour hunt — a server from another
// worktree injects its own name). Prod builds run inside Docker with no .git, so
// the commit is unknowable here (it falls back to nothing) and the deploy-time
// PR/commit provenance is served separately at runtime by /api/build-info — see
// backend/server.js and k8s/values.yaml's `build:` block. Always defined, so the
// reader never hits an undefined global.
function buildInfo() {
  return {
    name: 'build-info',
    config(_config, { command }) {
      const sh = (c) => { try { return execSync(c, { cwd: process.cwd() }).toString().trim(); } catch { return ''; } };
      const version = (() => {
        try { return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || ''; }
        catch { return ''; }
      })();
      const commit = sh('git rev-parse --short HEAD') || '(no-git)';
      const dirty = sh('git status --porcelain').length > 0;
      if (command !== 'serve') {
        return { define: { __BUILD_INFO__: JSON.stringify({ mode: 'prod', version, commit, dirty }) } };
      }
      const cwd = process.cwd();
      const worktree = cwd.replace(/[\\/]frontend[\\/]?$/, '').split(/[\\/]/).pop() || cwd;
      return { define: { __BUILD_INFO__: JSON.stringify({ mode: 'dev', version, worktree, commit, dirty, startedAt: Date.now() }) } };
    },
  };
}

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

// NOTE: the dev-only `/__prop-seat/save` + `/__prop-seat/delete` file-writing endpoints were RETIRED
// in ADR-0061 step 3. /prop-lab Save now PUTs the live seat map to the DB (PUT /api/prop-seats/default,
// admin-gated, instant-live) instead of writing src/core/propSeats.json on disk; base/variant integrity
// moved server-side into that PUT's validation (backend/server.js validatePropSeatsData). The committed
// propSeats.json stays as the always-render baseline, kept in sync by the DB→file bake-back cron.

// Dev-only stand-in for the backend's /api/bgm. Local dev has no backend process,
// so this proxies the DEPLOYED backend's playlist (which lists the blob container
// live, each track's title/artist/album coming from blob metadata) and serves it
// verbatim — the {tracks:[{title,artist?,album?,url}]} shape the player and the
// soundtrack manager consume, with absolute public blob urls. Opt in with
// BGM_DEV_TRACKS=1; override the source with BGM_API_URL.
function bgmDevMock() {
  const enabled = process.env.BGM_DEV_TRACKS === '1';
  const apiUrl = (process.env.BGM_API_URL || 'https://chess.romaine.life/api/bgm').replace(/\/+$/, '');
  const TTL = 5 * 60 * 1000;
  let cache = { tracks: null, expiry: 0 };
  async function loadTracks() {
    const now = Date.now();
    if (cache.tracks && cache.expiry > now) return cache.tracks;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`bgm ${res.status}`);
    const body = await res.json();
    const tracks = Array.isArray(body && body.tracks) ? body.tracks : [];
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
          server.config.logger.warn(`[bgm-dev-mock] could not load ${apiUrl}: ${err.message}`);
          res.end(JSON.stringify({ tracks: [] }));
        }
      });
    },
  };
}

// Dev-only mock of the auth backend. frontend/src/net/auth.ts talks to relative
// /api/auth/* paths that the deployed backend proxies to auth.romaine.life (Microsoft
// sign-in). Local `vite` has no backend process, so the real "Sign In" button was a
// dead redirect and nothing signed-in was testable. This middleware makes the WHOLE
// round-trip work with just the dev server: click Sign In -> mock session cookie set
// -> redirect back -> /api/auth/me reports a signed-in user -> the account menu
// (rename, sign out) works. It mirrors the backend's own dev bypass EXACTLY — same
// cookie (`better-auth.session=mock-dev-session`) and the same mock identity as
// `node server.js` run with DEV_AUTH=1 (backend/server.js isDevAuthHost) — so the
// two local modes show the same player and are interchangeable. `apply: 'serve'`
// means this exists only under `vite dev`; it is never part of a production build.
function devAuthMock() {
  const COOKIE_NAME = 'better-auth.session';
  const COOKIE_VALUE = 'mock-dev-session';
  const EMAIL = process.env.DEV_AUTH_EMAIL || 'player@example.com';
  const DEFAULT_NAME = process.env.DEV_AUTH_NAME || 'Tactics Player';
  // Match backend gravatarUrl(): md5 of the lowercased email, retro (pixel-art) fallback.
  const avatar = (() => {
    const hash = createHash('md5').update(EMAIL).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?d=retro&s=96`;
  })();
  // In-memory rename override for the running dev session (the DB-backed store the
  // real PATCH /api/auth/me writes to isn't available locally). Reset on sign-out.
  let displayName = null;
  const user = () => ({
    signed_in: true,
    email: EMAIL,
    name: displayName || DEFAULT_NAME,
    image: null,
    gravatar_url: avatar,
    avatar_url: avatar,
    role: 'pending',
    is_admin: false,
  });
  return {
    name: 'dev-auth-mock',
    apply: 'serve',
    configureServer(server) {
      // Mounted at /api/auth, so req.url here is the remainder (/sign-in, /me, /sign-out).
      server.middlewares.use('/api/auth', (req, res) => {
        const url = req.url || '/';
        const signedIn = (req.headers.cookie || '').includes(`${COOKIE_NAME}=${COOKIE_VALUE}`);
        const json = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // GET /api/auth/sign-in?returnTo=/path — set the session cookie and bounce back.
        if (req.method === 'GET' && url.startsWith('/sign-in')) {
          const raw = new URLSearchParams(url.split('?')[1] || '').get('returnTo') || '/';
          const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
          res.statusCode = 302;
          res.setHeader('Set-Cookie', `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`);
          res.setHeader('Location', returnTo);
          res.end();
          server.config.logger.info(`[dev-auth-mock] signed in as ${EMAIL} -> ${returnTo}`);
          return;
        }
        // POST /api/auth/sign-out — clear the cookie and any rename override.
        if (req.method === 'POST' && url.startsWith('/sign-out')) {
          res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
          displayName = null;
          json(200, { ok: true });
          return;
        }
        // GET /api/auth/me — the session probe fetchMe() calls on mount.
        if (req.method === 'GET' && url.startsWith('/me')) {
          json(200, signedIn ? user() : { signed_in: false });
          return;
        }
        // PATCH /api/auth/me — rename the account (in-memory only for local dev).
        if (req.method === 'PATCH' && url.startsWith('/me')) {
          if (!signedIn) { json(401, { error: 'sign_in_required' }); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const next = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 48) : '';
              displayName = next || null;
            } catch { /* keep prior name on a bad body */ }
            json(200, user());
          });
          return;
        }
        json(404, { error: 'not_found' });
      });
    },
  };
}

// Dev-only, opt-in: read the OFFICIAL campaign tier from the LIVE prod DB during local
// testing instead of the committed fallback file. The official GET is PUBLIC (no auth),
// so this needs no DB credentials — it proxies GET /api/official-campaigns/<id> to the
// deployed origin (default chess.romaine.life, override with PROD_ORIGIN — the same var
// the bake workflow uses) so the gym / campaign screens hydrate from whatever is live
// right now, not the committed snapshot. READ-ONLY: any non-GET is refused so a local
// edit can never write to prod, and a prod hiccup returns non-2xx so the frontend's own
// loader falls back to the committed file (loadOfficialCampaigns). Opt in with
// DEV_PROD_DATA=1. `apply:'serve'` — never in a production build. NOTE: the signed-in
// user's OWN campaigns (/api/campaign-workspace) are NOT proxied — they need the user's
// prod session cookie, which localhost can't carry; that's the local-backend path
// (DATABASE_URL=<prod> DEV_AUTH=1 node server.js), a separate, write-capable choice.
function officialCampaignsDevProxy() {
  const enabled = process.env.DEV_PROD_DATA === '1';
  const origin = (process.env.PROD_ORIGIN || 'https://chess.romaine.life').replace(/\/+$/, '');
  return {
    name: 'official-campaigns-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.config.logger.info(`[dev-prod-data] official campaigns read live from ${origin}`);
      server.middlewares.use('/api/official-campaigns', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'read-only dev proxy' })); return; }
        const target = `${origin}/api/official-campaigns${req.url || ''}`;
        try {
          const upstream = await fetch(target, { signal: AbortSignal.timeout(8000) });
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (err) {
          server.config.logger.warn(`[dev-prod-data] ${target} failed: ${err.message}`);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'prod fetch failed' }));
        }
      });
    },
  };
}

// Dev default: run the WHOLE app against the LIVE prod backend + DB. On `vite` dev-
// server start, spawn backend/server.js as a CHILD pointed at the prod Flexible Server
// (passwordless via your `az login`, resolved through DefaultAzureCredential) and
// signed in as your real account (DEV_AUTH), then proxy every /api call to it. The
// child is tied to vite's lifecycle — starts with the dev server, relaunches if it
// crashes, and is killed when vite exits — so `vite` ALONE is "full prod from dev", and
// a reboot is just re-running it. `apply:'serve'`, so this NEVER touches a production
// build. Escape hatch: DEV_OFFLINE=1 skips the backend and restores the mock stack.
// host/db/user are not secrets (see k8s deployment); override any via the env.
const BACKEND_PORT = 3000;
function prodBackend() {
  const backendDir = fileURLToPath(new URL('../backend', import.meta.url));
  let child = null;
  let stopping = false;
  return {
    name: 'prod-backend',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      const start = () => {
        child = spawn(process.execPath, ['server.js'], {
          cwd: backendDir,
          env: {
            ...process.env,
            POSTGRES_HOST: process.env.POSTGRES_HOST || 'chess-tactics-pg.postgres.database.azure.com',
            POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'chess_tactics',
            POSTGRES_USER: process.env.POSTGRES_USER || 'nelson-devops-project@outlook.com',
            DEV_AUTH: '1',
            DEV_AUTH_EMAIL: process.env.DEV_AUTH_EMAIL || 'nelson@romaine.life',
            DEV_AUTH_NAME: process.env.DEV_AUTH_NAME || 'Nelson',
            ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'nelson@romaine.life',
            PORT: String(BACKEND_PORT),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (d) => log.info(`[backend] ${String(d).replace(/\s+$/, '')}`));
        child.stderr.on('data', (d) => log.warn(`[backend] ${String(d).replace(/\s+$/, '')}`));
        child.on('exit', (code) => {
          child = null;
          if (stopping) return;
          log.warn(`[backend] exited (code ${code}) — relaunching in 1s`);
          setTimeout(start, 1000);
        });
      };
      const stop = () => { stopping = true; if (child) { child.kill(); child = null; } };
      start();
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { stop(); process.exit(0); });
    },
  };
}

const offline = process.env.DEV_OFFLINE === '1';
const devApiPlugins = offline
  ? [bgmDevMock(), officialCampaignsDevProxy(), devAuthMock()]
  : [prodBackend()];

export default defineConfig({
  plugins: [react(), buildInfo(), doodadCompositionSave(), nineSliceDevSave(), ...devApiPlugins],
  ...(offline ? {} : { server: { proxy: { '/api': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true, secure: false } } } }),
});
