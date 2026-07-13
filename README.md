# Chess Tactics

Chess-based squad combat prototype.

The sample is a small tactical browser game served by Node/Express. Three
hybrid chess units defend anchors against enemy telegraphs across six breaches.

## Local Dev

Use Vite for local development. It dynamically acquires a frontend port and
spawns the backend on its own free port, then proxies `/api` through Vite.
Open the local URL printed by Vite.

```sh
cd frontend
npm install
npm run dev
```

For baked preview:

```sh
cd frontend
npm install
npm run build

cd backend
npm install
npm start
```

Open `http://localhost:3000`.

The browser app is built by Vite. Express serves `frontend/dist` as the baked
frontend; source files live under `frontend/src`. Runtime media resolves through
backend-owned semantic `/assets/<slot>` routes backed by Postgres and private
object storage. `frontend/public` is limited to non-media code and legal text.

## Production Links

- Main menu design portfolio: <https://chess.romaine.life/design/main-menu>

## Local Backend

Level Editor documents use a stable `/editor/level?document=<opaque-id>&levelId=<id>` URL. The opaque document id is global; the level id remains account-local.
For authenticated editors, changes autosave to a durable server-side working copy;
**Save** promotes that working copy to the canonical level, while **Discard changes**
replaces it with the canonical saved level. Copying the browser URL is side-effect
free: it does not save, publish, grant access, or create another document. Gameplay
and thumbnails read only canonical saved levels. Browser storage is a crash/offline
fallback, not the cloud persistence model.

Fresh worktrees do not have `backend/node_modules`; that is expected every time.
`npm run dev` installs/refreshes backend dependencies before Vite starts the
backend child process.

The server uses `auth.romaine.life` for Microsoft sign-in. Optional env:

- `AUTH_BASE_URL` defaults to `https://auth.romaine.life`.
- `PUBLIC_ORIGIN` defaults to the request host and can pin callback URLs.
- `FRONTEND_DIR` defaults to the built `frontend/dist` directory.
- `STATIC_FRONTEND_DIR` defaults to `/var/run/chess-tactics-static-override`.
- `HOT_BACKEND_DIR` defaults to `/var/run/chess-tactics-hot`.
- `LIVE_MEDIA_CONTAINER_URL` selects the private production object store.
- `LIVE_MEDIA_STORAGE_DIR` selects isolated local/test object storage; it is
  mutually exclusive with the container URL and requires a disposable database.
- `SCHEMA_MIGRATIONS` controls DB schema readiness:
  `check` (default, read-only), `auto` (apply missing migrations), or `off`
  (skip readiness checks).

The container starts `backend/supervisor.js` as PID 1. The supervisor prepares
the runtime server entrypoint, runs it with `NODE_PATH` pointed at the baked
dependencies, and reloads the child process when PID 1 receives `SIGHUP`.

Test-slot validation should deploy the CI-built image for the pushed ref with
Glimmung `deploy_image_to_test_slot`, so backend code, frontend assets, and
runtime wiring are exercised from the same image that PR CI proved.

## Persistence

Durable game/design data and live asset metadata live in **Azure Database for
PostgreSQL**, reached passwordlessly through Entra workload identity. Runtime,
review, candidate, and source-media bytes are content-addressed in private Blob
Storage; the backend resolves their database-owned semantic slots. No runtime
media is shipped from `frontend/public`. The database and storage are
self-provisioned by this repo's `tofu/`. Local backend startup defaults to read-only schema checks;
set `SCHEMA_MIGRATIONS=auto` when you intentionally want to apply missing
migrations to a local database. See
[docs/persistence.md](docs/persistence.md) and
[docs/runtime-asset-contract.md](docs/runtime-asset-contract.md) for the schema, auth model, backups,
failure behavior, and the one post-`tofu apply` value to pin.

New board-unit geometry has one supported entry point: `python
scripts/generate-unit-art.py`, which renders the calibrated Blender turntable at
eight exact facings. Resizing already accepted art uses Unit Art's **Recapture**
editor instead: it deterministically reduces the approved 6-palette x 8-direction
set to the chosen delivery raster and creates a review-only storage-backed
candidate with explicit source and resampling provenance.
See [docs/art/unit-concepts/README.md](docs/art/unit-concepts/README.md).

## Checks

```sh
cd backend
npm test
```

The backend smoke-test exercises the Postgres-backed endpoints, so it needs a
Postgres. It uses `DATABASE_URL` if set, otherwise self-provisions a throwaway
local Postgres from system binaries (as on the GitHub-hosted CI runners). Hosts
without Postgres binaries should set `DATABASE_URL`. The smoke-test explicitly
runs with `SCHEMA_MIGRATIONS=auto` because its database is throwaway/reset. The
frontend gate runs without a database:

```sh
cd frontend
npm run check   # node checks + vitest + tsc
```

## Deploy

The app is deployed from `k8s/` by ArgoCD. PR CI tests the pushed ref, publishes
its content-fingerprint image for validation, and records the `sha-<commit>`
alias used by Glimmung test slots. PR images do not own production release state.

Merging to `main` authorizes deployment. Build and Deploy checks out and tests
that exact merged revision, computes the patch version and a fingerprint over
the complete tracked Docker inputs, explicit `linux/amd64` platform, Buildx
version, and resolved base-image digest, then builds and pushes the production
image when it is not already present. The workflow locks both the fingerprint
tag and manifest against overwrite and deletion, then writes the full
`romainecr.azurecr.io/chess-tactics@sha256:...` reference to the Argo-tracked
`prod` branch. No pull-request comment or second release gesture is required
after merge.
