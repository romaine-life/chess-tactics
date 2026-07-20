# Working in this repo

## Agent backend rule

Codex environment setup obtains a browser-approved `auth.romaine.life` device grant and stores it
in ignored worktree-local state. The full local dev backend consumes that verified grant for
loopback browser requests, so authenticated application and screenshot verification must use the
owner identity established at setup; do not fall back to a signed-out editor or ask the owner to
repair authentication during handoff.

`DEV_NO_BACKEND=1` and `DEV_OFFLINE=1` are owner-only escape hatches. Agents must
not set them, suggest them, or use them to keep working after the backend fails to
start. If the Vite-spawned backend fails, fix the backend startup issue (for
example install backend dependencies or address auth/DB access) or report the
backend failure as the blocker.

## Level Editor persistence rule

The stable `/editor/level?document=<opaque-id>&levelId=<id>` URL identifies its private editor document; `levelId` alone is account-local and is never the URL authority.
Its owner, or an authenticated allowlisted administrator given that exact opaque URL, may read the
existing document. Admin review does not grant cross-owner listing or mutation access, and a
missing ID remains not found; hand off only a URL whose document was acknowledged by the backend.
Authenticated edits autosave to a durable server-side working copy. **Save** promotes
that copy to the canonical level, and **Discard changes** restores the working copy
from canonical. Copying the browser URL must remain side-effect free: it does not
save, publish, create another document, change permissions, rewrite the URL, or
navigate. Gameplay and campaign/share/server thumbnails read canonical levels only.
The sole working-copy preview exception is the signed-in owner's bounded **Continue
editing** card list at `/editor`: it may read an existing private document to identify
the work being resumed, without saving or publishing it (ADR-0090). Browser storage
is a crash/offline fallback. Do not introduce another editor identity or a
link-triggered persistence path.

## Generated-art handoff rule

Generated-art work is not complete at exported files, manifests, filesystem
links, or contact sheets. Before saying **done** or **finished**, mount every
candidate Nelson is being asked to judge in a game-owned viewing surface and put
that exact surface in front of him.

For board art — tiles, units, props, walls, fences, and overlays — the default
proof is a durable private Level Editor document at canonical 1× over
representative terrain and neighboring game objects. Prefer an editable
document handoff under the persistence rule above.
A dedicated Studio map is allowed for a multi-candidate review batch only when it
uses the real game board renderer, mounts every candidate, and does not overwrite
accepted runtime art. Studio asset pages are supplemental when a map applies.

Open the exact deep link and provide a focused capture from that live route.
Review-only mounting does not promote a candidate. Contact sheets and standalone
PNGs are supplementary and never satisfy this handoff. If the game-surface proof
cannot be produced, report the generation task as unfinished and name the blocker.

## Taking screenshots (read this before trying to screenshot the app)

**Do NOT use the in-editor preview/screenshot tool to capture images on this
machine — its capture step hangs (every grab times out at ~30s, even on a blank
page). The dev server is fine; only the pixel grab is broken.** Don't retry it,
and don't tell the user screenshots are impossible. Use the helper below.

### How

1. Start the dev server **persistently** — through devctl (the dev-servers skill), not a
   backgrounded bash that dies between turns. Plain fallback from `frontend/`:
   `npm run dev`. It serves `index.html` for every route (SPA), so any path works.
   Use the local URL Vite prints.

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
   npm run shot -- <vite-url>/play/select/skirmish --select '.menu-dest'
   npm run shot -- '<vite-url>/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge' --select '.skirmish-board-unit' --out tmp-shots/unit.png
   # whole viewport / a small fixture page:
   npm run shot -- <vite-url>/unit-studio --size 1200x800
   ```
   Output defaults to `frontend/tmp-shots/shot.png` (gitignored). **Default to showing the
   small PNG inline — never substitute a link + description for the pixels.**

   Persistent title-bar control changes additionally run the rendered geometry gate
   on the exact live route and every affected responsive width:
   ```
   npm run verify:titlebar -- '<vite-url>/editor/level?returnTo=%2Feditor&...' --size 1280x800
   npm run verify:titlebar -- '<same-url>' --size 740x430
   ```
   The gate measures the real DOM: contributed and persistent controls must share a
   top/bottom coordinate, clear the horizontal divider, and use the same tokenized
   gaps at both sides of the persistent divider and the viewport edge.

This works on ANY live route by selector — no per-target fixture, so there's no "new
screen ⇒ flail" cliff. `frontend/scripts/shot.mjs` is the implementation.

### Reaching a specific UI state

The app is ours and the routes are inspectable. When the owner asks how to see
or verify an owned app surface, build the direct URL from the route contract
instead of giving only click-by-click instructions. Click paths are fine as
extra context, but they are not a substitute for the link.

The Studio encodes its state in the URL, so deep-link instead of clicking:
- `mode=catalog|lab|viewer`
- `cat=<category>` (for example `gym`, `gamelab`, `assets`, `props`)
- `vk=<viewer-kind>` for Viewer surfaces (for example `gym`, `gamelab`,
  `nineslice`)
- selected item params such as `gymlvl=<levelId>`, `glvl=<levelId>`,
  `kit=<asset>`, `frame=<frame>`, `prop=<propId>`
- `lab=board|tile|unit` (Lab component view)
- `view=board`, `family=<id>`, `collection=<id>`, `asset=<id>`, `unit=<id>`, `seed=<n>`
- `/unit-studio` is an alias for the Studio with the Units shelf preselected.

## Dev environment gotchas (git worktrees)

- A fresh worktree's `backend/node_modules` is expected to be missing. That is
  normal setup, not a surprising backend failure. `npm run dev` installs or
  refreshes backend dependencies before starting the Vite-spawned backend.
  Do not use `DEV_NO_BACKEND=1` to skip this.
- A worktree's `frontend/node_modules` may be **partial** (missing react /
  typescript / etc.). Run `npm install` in the worktree once, or typecheck with
  the main checkout's compiler:
  `node ../../../frontend/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Never create symlinks/junctions to share `node_modules` — do a real install.
- Plain `npm run dev` serves the full app and lets Vite dynamically acquire a
  frontend port. Use the URL Vite prints instead of assuming a fixed port.
- **`npm run dev` (from `frontend/`) runs the WHOLE app** — vite auto-spawns the backend
  (each worktree gets its own free port + pidfile, so many run side-by-side). On a fresh
  worktree it now **auto-installs `backend/node_modules` on first run**, so you no longer
  `cd backend && npm ci` by hand for dev. And the backend is a **HARD dependency**: if it
  can't start (deps install fails, exits before ready 3×, or hangs >60s), vite prints a
  loud banner and **exits `npm run dev` with code 1** instead of crash-looping or serving a
  backend-less UI that silently 500s on `/api`. Do NOT work around a dead backend — fix it.
  The one sanctioned no-backend run is the explicit `DEV_NO_BACKEND=1` (mock stack).
  Implementation: `frontend/vite.config.js` → `prodBackend`.

## Verifying backend / multiplayer changes (NO Postgres needed)

Live lobby state and move/result relay live in an in-memory Map. Production level selection
and Start deliberately read the canonical official level from Postgres so a client cannot
author timing metadata and reconnect can pin the exact content snapshot. The DB-free protocol
smoke supplies canonical test content through an explicit `NODE_ENV=test`-only seam; gameplay
protocol changes therefore remain fully testable locally without Postgres:

```
cd backend && npm ci        # for the smoke test's OWN `node` run — `npm run dev` auto-installs this itself
node netplay-smoke-test.js  # boots DB-free with canonical test content; exercises lobby/netplay
```

`netplay-smoke-test.js` is the go-to for any lobby/netplay change — it runs anywhere in
seconds. Do NOT say "I couldn't run the smoke test" for a multiplayer change; run this.

The full `smoke-test.js` additionally covers the DB-backed persistence endpoints
(campaigns, portfolios), so it needs Postgres — it self-provisions from system
`initdb`/`pg_ctl`/`createdb` if present, else set `DATABASE_URL` to any reachable Postgres.
On a host without Postgres binaries (this Windows box has none), the full smoke test can't
run locally — but `netplay-smoke-test.js` covers everything multiplayer, so reach for that.
Both are wired into `npm test` (netplay first, so netplay regressions fail fast).
