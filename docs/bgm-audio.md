# Background music (BGM)

The game plays a continuously **shuffled** soundtrack. This doc covers the
architecture and the one-time provisioning to make it live in production.

## Architecture

The **blob container is the single source of truth.** Audio and the playlist
both live there; nothing music-related is committed to git or the frontend. The
frontend talks only to the backend's own contract, never to Azure directly —
the same way it consumes `/api/lobbies`, `/api/campaigns`, etc. (*borrow
primitives, not boundaries*).

```
browser ── GET /api/bgm ──▶ chess-tactics backend ── GET <bgm>/index.json ──▶ Azure Blob (public)
   └────────── <audio> streams tracks directly from <bgm>/<file> (no-cors) ──────────┘
```

- **Backend** (`GET /api/bgm`, `backend/server.js`) reads `index.json` from the
  blob container over plain HTTPS (no Azure credentials — the container is
  public-read), caches it briefly (5 min TTL), and returns
  `{tracks:[{title,url}]}` with absolute track URLs. It never 500s: on error it
  serves the last good list, then an empty playlist. The container stays
  public-*read* but not public-*list*; nothing enumerates it.
- **Player** (`frontend/src/bgm.js`, `initBgm()` wired in `app.js`) fetches
  `/api/bgm`, builds a Fisher-Yates shuffle, and plays through it with one
  `<audio preload="none">` element, reshuffling each cycle and never repeating a
  track back-to-back across the boundary.
- **On-demand streaming** — only the *currently playing* track is fetched, one at
  a time, via HTTP range requests. A 150 MB library costs a listener only the
  song they're hearing. Nothing is preloaded or bundled.
- **Autoplay-safe** — browsers block audible autoplay until a user gesture, so
  playback is armed on the first `pointerdown`/`keydown`/`touchstart`.
- **Mute control** — a floating button (bottom-right) toggles mute, persisted in
  `localStorage` (`chess-tactics-bgm-muted-v1`). It hides itself when `/api/bgm`
  returns no tracks (BGM not provisioned).

`tools/bgm/generate.mjs` is the single source of truth that derives blob names,
`index.json` `file` entries, and display titles from the raw filenames — so the
three can never drift. `npm run check` (frontend) runs
`scripts/check-bgm-shuffle.mjs`, which guards the shuffle invariants.

## Where the audio lives

Nothing audio-related is in git or the image (`*.mp3` is git-ignored; there is no
committed manifest). It all lives in a public-read Azure Blob container,
provisioned by this repo's own OpenTofu (`tofu/storage.tf`):

- storage account: `chesstacticsmedia`, container: `bgm` (anonymous blob read)
- `index.json` — the playlist (`{tracks:[{title,file}]}`), written by the upload
  pipeline alongside the tracks
- the backend's `BGM_BASE_URL` (`k8s/values.yaml`) points at this container

Adding a song = drop it on `nelson/songs` and re-run the upload workflow. It
regenerates `index.json`, the backend picks it up within the cache TTL, and the
new track joins the shuffle — no code change, no redeploy.

## Provisioning runbook (one time)

The raw tracks live on the `nelson/songs` branch under `songs/`. CI lives in
`.github/workflows/`: `tofu.yaml` (plan/apply) and `upload-bgm.yml` (upload).

1. **Enable app-owned tofu** (infra-bootstrap, one line): add `chess-tactics` to
   `local.runs_own_tofu_apps` in `tofu/main.tf`. Merging grants this repo's CI
   service principal state access + Contributor + RBAC-admin and sets the
   `TFSTATE_STORAGE_ACCOUNT` repo variable.
2. **Apply this repo's tofu** — the `Infrastructure` workflow plans on PR and
   applies on merge to `main`, creating the storage account, the `bgm`
   container, and the CI SP's `Storage Blob Data Contributor` role.
3. **Upload the tracks** — run the **Upload BGM** workflow (`workflow_dispatch`).
   It slugs the raw tracks, writes `index.json`, and uploads both into the `bgm`
   container.

Until step 3, BGM is dormant in prod: `/api/bgm` returns an empty playlist (the
backend's index fetch 404s) and the control hides itself — no errors, no churn.
Test slots stage audio same-origin (below), so the shuffle UX is fully testable
before provisioning.

## Testing in a Glimmung slot

The real `/api/bgm` code path runs in the slot, pointed at a same-origin fixture
instead of the blob (the env split is configuration, not a second code path):

```sh
cd frontend && npm ci && npm run build            # static bundle
# stage slugged tracks + index.json the slot will serve same-origin
node tools/bgm/generate.mjs --src <raw songs dir> --out /tmp/bgm-staged
NS=chess-tactics-N; POD=$(kubectl -n "$NS" get pod -l app=$NS -o name | head -1 | cut -d/ -f2)
# 1) static hot-swap: frontend dist + the staged audio + index.json under /assets/audio
kubectl cp dist/.        "$NS/$POD:/var/run/chess-tactics-static-override/" -c "$NS"
kubectl cp /tmp/bgm-staged/. "$NS/$POD:/var/run/chess-tactics-static-override/assets/audio/" -c "$NS"
# 2) backend hot-swap with BGM env: read the index same-origin (localhost), hand
#    the browser the public slot URL for tracks
#    BGM_READ_URL = http://localhost:3000/assets/audio
#    BGM_BASE_URL = https://chess-tactics-N.tank.dev.romaine.life/assets/audio
```

In production only `BGM_BASE_URL` is set (the blob container), and the backend
reads and serves from the same place.
