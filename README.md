# Chess Tactics

Chess-based squad combat prototype.

The sample is a small tactical browser game served by Node/Express. Three
hybrid chess units defend anchors against enemy telegraphs across six breaches.

## Local Dev

```sh
cd backend
npm install
npm start
```

Open `http://localhost:3000`.

## Agent Preview Contract

Agents and session tooling should start preview through the repo-owned launcher:

```sh
bin/agent-preview
```

The launcher uses `$PORT` when it is set by the session, otherwise `3000`.
It always starts `backend/supervisor.js`; do not run `backend/server.js`
directly for preview work. The supervisor is the supported entrypoint because
it owns the hot backend and static override paths used during session edits.
When the session does not provide explicit override directories, the launcher
uses writable paths under `${XDG_RUNTIME_DIR:-/tmp}`.

To check whether the expected preview is running:

```sh
bin/agent-preview-status
```

A direct `node backend/server.js` process, even on the right port, is not the
agent preview contract.

The server uses `auth.romaine.life` for Microsoft sign-in. Optional env:

- `AUTH_BASE_URL` defaults to `https://auth.romaine.life`.
- `PUBLIC_ORIGIN` defaults to the request host and can pin callback URLs.
- `FRONTEND_DIR` defaults to the baked `frontend/` directory.
- `STATIC_FRONTEND_DIR` defaults to `/var/run/chess-tactics-static-override`.
- `HOT_BACKEND_DIR` defaults to `/var/run/chess-tactics-hot`.

The container starts `backend/supervisor.js` as PID 1. The supervisor copies
the baked `backend/server.js` into `HOT_BACKEND_DIR/server.js`, runs that hot
entrypoint with `NODE_PATH` pointed at the baked dependencies, and reloads the
child process when PID 1 receives `SIGHUP`.

Static hot-swap writes files into `STATIC_FRONTEND_DIR`; Express serves that
directory before the baked frontend, while keeping the baked frontend as the
baseline for files that have not been overridden.

Backend hot-swap writes a replacement server artifact to
`HOT_BACKEND_DIR/server.js` and sends `SIGHUP` to PID 1. The replacement runs
from the hot directory while still serving the baked frontend and using the
baked `node_modules`.

## Checks

```sh
cd backend
npm test
```

## Deploy

The app is deployed from `k8s/` by ArgoCD. CI builds and pushes
`romainecr.azurecr.io/chess-tactics:<sha>` and updates the Deployment image tag.
