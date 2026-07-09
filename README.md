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
frontend; source files live under `frontend/src`, and stable public assets live
under `frontend/public`.

## Production Links

- Main menu design portfolio: <https://chess.romaine.life/design/main-menu>

## Local Backend

Fresh worktrees do not have `backend/node_modules`; that is expected every time.
`npm run dev` installs/refreshes backend dependencies before Vite starts the
backend child process.

The server uses `auth.romaine.life` for Microsoft sign-in. Optional env:

- `AUTH_BASE_URL` defaults to `https://auth.romaine.life`.
- `PUBLIC_ORIGIN` defaults to the request host and can pin callback URLs.
- `FRONTEND_DIR` defaults to the built `frontend/dist` directory.
- `STATIC_FRONTEND_DIR` defaults to `/var/run/chess-tactics-static-override`.
- `HOT_BACKEND_DIR` defaults to `/var/run/chess-tactics-hot`.
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

Durable game/design data (levels, campaigns, campaign workspaces, design
portfolios) lives in **Azure Database for PostgreSQL**, reached passwordless via
Entra workload identity. Art assets remain committed files under
`frontend/public/assets`; they are not database records. The database is
self-provisioned by this repo's `tofu/`. Local backend startup defaults to
read-only schema checks; set `SCHEMA_MIGRATIONS=auto` when you intentionally want
to apply missing migrations to a local database. See
[docs/persistence.md](docs/persistence.md) for the schema, auth model, backups,
failure behavior, and the one post-`tofu apply` value to pin.

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

The app is deployed from `k8s/` by ArgoCD. CI builds and pushes
`romainecr.azurecr.io/chess-tactics:app-<content-fingerprint>` and updates the
Deployment image tag. Trusted test-slot CI runs also create a unique lookup tag
such as `ci-pr-<pr>-run-<run>-attempt-<attempt>` that points at the same ACR
manifest; those lookup tags are for Glimmung test-slot resolution, not chart
values.
