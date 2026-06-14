# Background music (BGM)

The game plays a continuously **shuffled** soundtrack. This doc covers the
architecture and the one-time provisioning to make it live in production.

## How it works

- **Player** — `frontend/src/bgm.js` (`initBgm()`, wired in `app.js`). It fetches
  a manifest, builds a Fisher-Yates shuffle of the track list, and plays through
  it with a single `<audio preload="none">` element. When a cycle ends it
  reshuffles, never repeating a track back-to-back across the boundary.
- **On-demand streaming** — only the *currently playing* track is fetched, one at
  a time, via HTTP range requests. A 20-track / ~150 MB library costs a listener
  only the song they're hearing. Nothing is preloaded; nothing is bundled.
- **Autoplay-safe** — browsers block audible autoplay until a user gesture, so
  playback is armed on the first `pointerdown`/`keydown`/`touchstart`.
- **Mute control** — a floating button (bottom-right) toggles mute; the choice is
  persisted in `localStorage` (`chess-tactics-bgm-muted-v1`). Muting pauses
  (no silent background streaming); unmuting resumes.

## Where the audio lives

Audio is **not** committed to the repo or baked into the Docker image (`*.mp3` is
git-ignored). It lives in a public-read Azure Blob container, provisioned by this
repo's own OpenTofu (`tofu/storage.tf`):

- storage account: `chesstacticsmedia`
- container: `bgm` (anonymous blob read)
- public base URL: `https://chesstacticsmedia.blob.core.windows.net/bgm/`

The committed manifest `frontend/public/assets/audio/bgm-manifest.json` is the
only audio-related file in the repo. Its `baseUrl` points at the blob container;
each `tracks[].file` is a slug that exactly matches a blob name.

`tools/bgm/generate.mjs` is the single source of truth that derives blob names,
manifest `file` entries, and display titles from the raw filenames — so the three
can never drift. `npm run check` (frontend) runs `scripts/check-bgm-shuffle.mjs`,
which guards the shuffle invariants.

## Provisioning runbook (one time)

The raw tracks live on the `nelson/songs` branch under `songs/`. Bringing BGM
live in production is four ordered steps:

0. **Install the CI workflows** (one time, needs `workflows` permission): move
   `docs/ci/tofu.yaml` and `docs/ci/upload-bgm.yml` into `.github/workflows/`.
   They live under `docs/ci/` in this PR because the Tank GitHub App that pushes
   session branches lacks the `workflows` scope and cannot write
   `.github/workflows/` itself.
1. **Enable app-owned tofu** (infra-bootstrap, one line): add `chess-tactics` to
   `local.runs_own_tofu_apps` in `tofu/main.tf`. Merging that grants this repo's
   CI service principal state access + Contributor + RBAC-admin and sets the
   `TFSTATE_STORAGE_ACCOUNT` repo variable. (Required once; see the companion
   infra-bootstrap change.)
2. **Apply this repo's tofu** — merge this PR (with the workflows installed). The
   `Infrastructure` workflow plans on PR and applies on merge to `main`, creating
   the storage account, container, and the CI SP's `Storage Blob Data
   Contributor` role assignment.
3. **Upload the tracks** — run the **Upload BGM** workflow
   (`workflow_dispatch`). It slugs the raw tracks with `generate.mjs`, verifies
   them against the committed manifest, and `az storage blob upload-batch`es them
   into the `bgm` container.

After step 3, production streams BGM straight from blob. Until then, the feature
is dormant in prod (the manifest 404s harmlessly); test slots stage the audio
locally (see below), so the shuffle UX is fully testable before provisioning.

## Testing in a Glimmung slot

`apply_test_slot_hot_swap` doesn't cover `static`; use the manual copy. After
`kubectl cp frontend/dist` into the slot's static-override dir, also stage the
audio so the slot can serve it same-origin:

```sh
# produce slugged copies + a slot-local manifest (baseUrl = /assets/audio/)
node tools/bgm/generate.mjs --src <raw songs dir> --out /tmp/bgm-staged \
  --base /assets/audio/ --write-manifest /tmp/bgm-manifest-slot.json
NS=chess-tactics-N; POD=$(kubectl -n "$NS" get pod -l app=$NS -o name | head -1 | cut -d/ -f2)
kubectl cp /tmp/bgm-staged/. "$NS/$POD:/var/run/chess-tactics-static-override/assets/audio/" -c "$NS"
kubectl cp /tmp/bgm-manifest-slot.json \
  "$NS/$POD:/var/run/chess-tactics-static-override/assets/audio/bgm-manifest.json" -c "$NS"
```
