import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
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

// Dev-only endpoint for Chrome Lab's "Save defaults" button. The lab owns live
// tuning in localStorage while the user experiments; this writes the accepted
// state to config/chrome-lab-defaults.json so the runtime imports the same values
// after refresh, without hand-copying JSON through Codex.
function chromeLabDefaultsSave() {
  return {
    name: 'chrome-lab-defaults-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__chrome-lab/defaults', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
        req.on('end', async () => {
          const send = (code, obj) => {
            res.statusCode = code;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
          };
          try {
            const parsed = JSON.parse(body || '{}');
            if (!parsed || typeof parsed !== 'object' || !parsed.outer || !parsed.inner || !parsed.divider) {
              send(400, { ok: false, error: 'expected { target, outer, inner, divider }' });
              return;
            }
            const payload = {
              _doc: "Committed Chrome Lab tuning. Chrome Lab's Save defaults button writes this file in dev; chromeFamilyRuntime imports it so live surfaces and the lab share one source of truth.",
              target: typeof parsed.target === 'string' ? parsed.target : 'level-editor',
              outer: parsed.outer,
              inner: parsed.inner,
              divider: parsed.divider,
            };
            const rel = 'config/chrome-lab-defaults.json';
            const out = join(process.cwd(), rel);
            await mkdir(dirname(out), { recursive: true });
            await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`);
            server.ws.send({ type: 'full-reload' });
            send(200, { ok: true, path: rel });
          } catch (err) {
            send(500, { ok: false, error: String(err?.message || err) });
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
// build. Owner-only escape hatch: DEV_NO_BACKEND=1 runs the frontend ALONE against the mock stack —
// no backend process, no DB (dev auth, bgm, official-campaigns fallback). DEV_OFFLINE=1 still
// works as a legacy alias. Agents must not use either flag to bypass a backend startup failure.
// host/db/user are not secrets (see k8s deployment); override any via the env.
// Ask the OS for a free port instead of hardcoding one, so multiple dev servers /
// worktrees never fight over a fixed number (the crash-loop that happened when several
// backends all pinned :3000). The backend and the /api proxy both use this exact port.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function prodBackend(port) {
  const backendDir = fileURLToPath(new URL('../backend', import.meta.url));
  const boardRenderDir = fileURLToPath(new URL('../packages/board-render', import.meta.url));
  // Per-worktree pidfile in the OS temp dir. On start we kill any backend left running
  // by a previously force-killed dev server, so orphans (each holding a live prod DB
  // connection) never stack up.
  const pidFile = join(tmpdir(), `chess-dev-backend-${createHash('md5').update(backendDir).digest('hex').slice(0, 8)}.pid`);
  let child = null;
  let stopping = false;
  // A fresh worktree ships with NO backend/node_modules, so `node server.js` throws
  // `Cannot find module 'express'` and the exit handler below relaunches it every 1s
  // FOREVER — the recurring fresh-worktree papercut. `vite` is meant to bootstrap the
  // WHOLE app ("vite ALONE is full prod from dev"), so bring the backend's deps up before
  // the first launch: `npm ci` when there's a lockfile, else `npm install`. Runs at most
  // once per worktree (the sentinel check short-circuits after) and only on a dev server
  // (apply:'serve'), so it never touches a production build.
  const ensureBackendDeps = (log) => {
    // Check a SENTINEL module, not just the node_modules dir: a Ctrl-C'd / half-populated
    // install leaves the dir present but express missing, which would still crash-loop.
    if (existsSync(join(backendDir, 'node_modules', 'express'))) return;
    const cmd = existsSync(join(backendDir, 'package-lock.json')) ? 'npm ci' : 'npm install';
    log.info(`[backend] installing dependencies (${cmd}) — first run in this worktree, one moment…`);
    execSync(cmd, { cwd: backendDir, stdio: 'inherit' });
    log.info('[backend] dependencies installed.');
  };
  const ensureBoardRenderPackage = (log) => {
    log.info('[backend] building shared board-render package.');
    execSync('npm run build', { cwd: boardRenderDir, stdio: 'inherit' });
  };
  const killStale = () => {
    try {
      if (!existsSync(pidFile)) return;
      const pid = Number(readFileSync(pidFile, 'utf8').trim());
      if (pid) { try { process.kill(pid); } catch { /* already gone */ } }
      unlinkSync(pidFile);
    } catch { /* best effort */ }
  };
  return {
    name: 'prod-backend',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      killStale();

      // The backend is a HARD dependency of the dev server, never an optional extra: the
      // frontend needs it for auth, campaigns, lobbies — everything under /api. If it can't
      // come up we take the WHOLE dev server DOWN with a loud, unmissable message instead of
      // serving a frontend that silently 500s on every /api call. Nobody — human or agent —
      // should be able to skate past a dead backend without noticing. The ONLY sanctioned way
      // to run without it is the explicit DEV_NO_BACKEND=1 opt-in, which never reaches here.
      const stop = () => { stopping = true; if (child) { child.kill(); child = null; } try { unlinkSync(pidFile); } catch { /* */ } };
      const fatal = (why) => {
        const bar = '━'.repeat(74);
        log.error(`\n${bar}`);
        log.error('  ✖  BACKEND FAILED TO START — taking the dev server down with it.');
        log.error('');
        log.error(`     ${why}`);
        log.error('');
        log.error('     The backend is NOT optional — the frontend talks to it for auth,');
        log.error('     campaigns, lobbies, everything under /api. Running the UI without it');
        log.error('     just hides the real failure. Fix the backend, then re-run `npm run dev`.');
        log.error('     (Deliberately want the mock stack? Opt in explicitly: DEV_NO_BACKEND=1.)');
        log.error(`${bar}\n`);
        stop();
        process.exit(1);
      };

      // Bootstrap deps before the first spawn. A failed install is fatal, not a warning —
      // otherwise the spawn below would just crash-loop on a missing module forever.
      try {
        ensureBackendDeps(log);
        ensureBoardRenderPackage(log);
      } catch (e) {
        fatal(`Could not prepare backend dependencies (${e.message}). Try \`npm ci\` in ${backendDir} and \`npm run build\` in ${boardRenderDir} by hand.`);
      }

      // "Ready" = the backend logged that it's listening. Until we've seen that for a given
      // launch, an exit means it couldn't start at all (missing module, bad code, DB auth
      // reject, port already taken). Tolerate a couple of fast retries, then give up LOUDLY
      // rather than relaunch into the void every second. A backend that ran fine and only
      // later crashed is treated as transient and relaunched. A boot that neither succeeds
      // nor exits (a hang) trips the watchdog — also a failure to start.
      const READY_RE = /listening on/i;
      const MAX_BOOT_FAILS = 3;
      const BOOT_TIMEOUT_MS = 60_000;
      let bootFails = 0;

      const start = () => {
        let ready = false;
        const watchdog = setTimeout(() => {
          if (!ready && child) fatal(`Backend never became ready within ${BOOT_TIMEOUT_MS / 1000}s (still starting, or hung).`);
        }, BOOT_TIMEOUT_MS);
        if (watchdog.unref) watchdog.unref();

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
            UNIT_ASSET_CONTAINER_URL: process.env.UNIT_ASSET_CONTAINER_URL || 'https://chesstacticsmedia.blob.core.windows.net/unit-assets',
            PORT: String(port),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        try { writeFileSync(pidFile, String(child.pid)); } catch { /* best effort */ }
        log.info(`[backend] launching on :${port}`);
        child.stdout.on('data', (d) => {
          const s = String(d);
          if (!ready && READY_RE.test(s)) { ready = true; bootFails = 0; clearTimeout(watchdog); }
          log.info(`[backend] ${s.replace(/\s+$/, '')}`);
        });
        child.stderr.on('data', (d) => log.warn(`[backend] ${String(d).replace(/\s+$/, '')}`));
        child.on('exit', (code) => {
          child = null;
          clearTimeout(watchdog);
          if (stopping) return;
          if (!ready) {
            // Died before it ever served a request — it could not start.
            bootFails += 1;
            if (bootFails >= MAX_BOOT_FAILS) {
              fatal(`Backend exited (code ${code}) before it was ready, ${bootFails}× in a row.`);
              return;
            }
            log.warn(`[backend] exited (code ${code}) before ready — retry ${bootFails}/${MAX_BOOT_FAILS} in 1s`);
          } else {
            log.warn(`[backend] exited (code ${code}) after running — relaunching in 1s`);
          }
          setTimeout(start, 1000);
        });
      };
      start();
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { stop(); process.exit(0); });
    },
  };
}

const noBackend = process.env.DEV_NO_BACKEND === '1' || process.env.DEV_OFFLINE === '1';

export default defineConfig(async ({ command }) => {
  // Only a dev server (command 'serve') spawns the backend + proxy; a production build
  // touches none of this. A fresh free port is chosen each start and shared by both.
  const isVitest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const useBackend = command === 'serve' && !noBackend && !isVitest;
  const backendPort = useBackend ? await getFreePort() : 0;
  const devApiPlugins = command === 'serve' && !isVitest
    ? (noBackend ? [bgmDevMock(), officialCampaignsDevProxy(), devAuthMock()] : [prodBackend(backendPort)])
    : [];
  return {
    plugins: [react(), buildInfo(), doodadCompositionSave(), chromeLabDefaultsSave(), nineSliceDevSave(), ...devApiPlugins],
    ...(useBackend ? { server: { proxy: { '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true, secure: false, ws: true } } } } : {}),
  };
});
