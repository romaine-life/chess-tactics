# Working in this repo

## Agent backend rule

`DEV_NO_BACKEND=1` and `DEV_OFFLINE=1` are owner-only escape hatches. Agents must
not set them, suggest them, or use them to keep working after the backend fails to
start. If the Vite-spawned backend fails, fix the backend startup issue (for
example install backend dependencies or address auth/DB access) or report the
backend failure as the blocker.

## Taking screenshots (read this before trying to screenshot the app)

**Do NOT use the in-editor preview/screenshot tool to capture images on this
machine — its capture step hangs (every grab times out at ~30s, even on a blank
page). The dev server is fine; only the pixel grab is broken.** Don't retry it,
and don't tell the user screenshots are impossible. Use the helper below.

### How

1. Start the dev server **persistently** — through devctl (the dev-servers skill), not a
   backgrounded bash that dies between turns. Plain fallback from `frontend/`:
   `npx vite --host 127.0.0.1 --port 5199 --strictPort`. It serves `index.html` for every
   route (SPA), so any path works.

2. Capture with the `shot` tool. It drives the installed Chrome via `puppeteer-core`
   (system browser, no bundled download), freezes animation for determinism, and **clips
   to a CSS selector** — so you get small, focused, analyzable pixels instead of a
   full-page grab (too many pixels is what breaks image analysis):
   ```
   npm run shot -- <url> [--select <css>] [--out <path>] [--size <WxH>] [--ready <jsExpr>] [--full]
   ```
   Examples:
   ```
   # one element off a REAL screen — small, exact, no fixture needed:
   npm run shot -- http://127.0.0.1:5199/skirmish --select '[data-testid=skirmish-board]'
   npm run shot -- http://127.0.0.1:5199/skirmish --select '.skirmish-board-unit' --out tmp-shots/unit.png
   # whole viewport / a small fixture page:
   npm run shot -- http://127.0.0.1:5199/unit-studio --size 1200x800
   ```
   Output defaults to `frontend/tmp-shots/shot.png` (gitignored). **Default to showing the
   small PNG inline — never substitute a link + description for the pixels.**

This works on ANY live route by selector — no per-target fixture, so there's no "new
screen ⇒ flail" cliff. `frontend/scripts/shot.mjs` is the implementation.

### Reaching a specific UI state

The Studio encodes its state in the URL, so deep-link instead of clicking:
- `mode=catalog|lab`
- `lab=board|tile|unit` (Lab component view)
- `view=board`, `family=<id>`, `collection=<id>`, `asset=<id>`, `unit=<id>`, `seed=<n>`
- `/unit-studio` is an alias for the Studio with the Units shelf preselected.

## Dev environment gotchas (git worktrees)

- A fresh worktree's `backend/node_modules` is expected to be missing. That is
  normal setup, not a surprising backend failure. Run `npm install` in
  `backend/` once per worktree before expecting the Vite-spawned backend to
  start. Do not use `DEV_NO_BACKEND=1` to skip this.
- A worktree's `frontend/node_modules` may be **partial** (missing react /
  typescript / etc.). Run `npm install` in the worktree once, or typecheck with
  the main checkout's compiler:
  `node ../../../frontend/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Never create symlinks/junctions to share `node_modules` — do a real install.
- Plain `npx vite` serves reliably. If you use the preview tool's managed server,
  pin an explicit `--port` and matching `port` in `.claude/launch.json` (no
  `autoPort`), or a port mismatch will make a healthy server look dead.

## Verifying backend / multiplayer changes (NO Postgres needed)

The whole lobby/netplay surface (host/join/level/start/moves/resign/leave) lives in an
in-memory Map — those routes never touch the database, and the server boots and serves
them even with no DB configured (`server.js` starts anyway and only 503s the *persistence*
endpoints). So multiplayer features are fully testable locally without Postgres:

```
cd backend && npm ci        # once per worktree — a fresh worktree has NO backend node_modules
node netplay-smoke-test.js  # boots the server DB-free, exercises the lobby/netplay lifecycle
```

`netplay-smoke-test.js` is the go-to for any lobby/netplay change — it runs anywhere in
seconds. Do NOT say "I couldn't run the smoke test" for a multiplayer change; run this.

The full `smoke-test.js` additionally covers the DB-backed persistence endpoints
(campaigns, portfolios), so it needs Postgres — it self-provisions from system
`initdb`/`pg_ctl`/`createdb` if present, else set `DATABASE_URL` to any reachable Postgres.
On a host without Postgres binaries (this Windows box has none), the full smoke test can't
run locally — but `netplay-smoke-test.js` covers everything multiplayer, so reach for that.
Both are wired into `npm test` (netplay first, so netplay regressions fail fast).
