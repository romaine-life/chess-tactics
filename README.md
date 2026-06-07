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

## Checks

```sh
cd backend
npm test
```

## Deploy

The app is deployed from `k8s/` by ArgoCD. CI builds and pushes
`romainecr.azurecr.io/chess-tactics:<sha>` and updates the Deployment image tag.
