# Working in this repo

## Taking screenshots (read this before trying to screenshot the app)

**Do NOT use the in-editor preview/screenshot tool to capture images on this
machine — its capture step hangs (every grab times out at ~30s, even on a blank
page). The dev server is fine; only the pixel grab is broken.** Don't retry it,
and don't tell the user screenshots are impossible. Use the helper below.

### How

1. Start the dev server (from `frontend/`):
   ```
   npx vite --host 127.0.0.1 --port 5199 --strictPort
   ```
   It serves `index.html` for every route (SPA), so any path works.

2. Capture a route to a PNG with the helper, then read the PNG:
   ```
   npm run shot -- <url> [outPath] [WxH]
   ```
   Examples:
   ```
   npm run shot -- http://127.0.0.1:5199/unit-studio
   npm run shot -- "http://127.0.0.1:5199/tileset-studio?mode=lab&lab=board&view=board" tmp-shots/lab.png 1460x840
   ```
   Output defaults to `frontend/tmp-shots/shot.png` (the dir is gitignored).

This drives the installed Chrome/Edge headless (`frontend/scripts/shot.mjs`) — no
dependencies, no flaky capture step. Chrome and Edge are both installed on this
machine.

### Reaching a specific UI state

The Studio encodes its state in the URL, so deep-link instead of clicking:
- `mode=catalog|lab`
- `lab=board|tile|unit` (Lab component view)
- `view=board`, `family=<id>`, `collection=<id>`, `asset=<id>`, `unit=<id>`, `seed=<n>`
- `/unit-studio` is an alias for the Studio with the Units shelf preselected.

## Dev environment gotchas (git worktrees)

- A worktree's `frontend/node_modules` may be **partial** (missing react /
  typescript / etc.). Run `npm install` in the worktree once, or typecheck with
  the main checkout's compiler:
  `node ../../../frontend/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Never create symlinks/junctions to share `node_modules` — do a real install.
- Plain `npx vite` serves reliably. If you use the preview tool's managed server,
  pin an explicit `--port` and matching `port` in `.claude/launch.json` (no
  `autoPort`), or a port mismatch will make a healthy server look dead.
