# Runtime Asset Cutover Runbook

This is the operational companion to [ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md)
and the [runtime asset contract](runtime-asset-contract.md). It covers the one-time
move from repository media to Postgres pointers plus private content-addressed Blob
storage. It is not a second storage contract and it does not authorize a permanent
Git fallback.

The cutover is complete only after the temporary importer and every tracked
production/review/source media file are deleted. Until then the migration is in
progress, not "compatible" or done.

## Runtime lanes

Exactly one object-store implementation is active in each backend process.

| Lane | Database | Object bytes | Seed variables | Azure identity |
| --- | --- | --- | --- | --- |
| Live app | `POSTGRES_HOST`, `POSTGRES_DATABASE`, `POSTGRES_USER` | `LIVE_MEDIA_CONTAINER_URL` | unset | workload identity; custom immutable-media read/create role on only `live-media` |
| Unserved candidate pod | the same live app variables | the same `LIVE_MEDIA_CONTAINER_URL` | unset | the normal app ServiceAccount; no Service, route, or ingress |
| Synthetic automated test | transient `DATABASE_URL` | temporary `LIVE_MEDIA_STORAGE_DIR` | unset unless a rendering diagnostic explicitly projects public immutable reads | none |

`LIVE_MEDIA_STORAGE_DIR` and `LIVE_MEDIA_CONTAINER_URL` are mutually exclusive.
Seed variables are valid only with directory storage. The live app and cutover
pods must fail closed if a seed variable or directory is present. Local
development uses the live app database and container by default; an explicitly
isolated synthetic test process must not silently retain production credentials.

Per [ADR-0086](adr/0086-runtime-asset-cutover-uses-one-live-data-plane.md), the
cutover does not create or seed a second owner-facing asset database. CI may
still create a transient synthetic Postgres as a test-process implementation
detail; it is not a content environment or release gate.

The substrate image has one temporary rollout variable,
`LIVE_MEDIA_SERVING_ENABLED=false`. While false, migration/admin/catalog and
immutable verification routes are live, but `/assets/*` and thumbnail asset
loads still use the packaged pre-cutover bytes. Only the stage-1 image may
contain this branch. The final no-media image deletes both the variable and the
legacy branch; this is not a permanent fallback switch.

## Why this cannot be one blind deploy

Three dependencies must exist before the final no-media image serves traffic:

1. OpenTofu must have created the private container and granted the production
   workload identity its data-plane role.
2. migration 18, the admin API, and object-store implementation must be running
   somewhere with production DB/Blob access so the old inventory can be uploaded.
3. every availability-critical stable slot must have an active pointer before the
   frontend requests `/api/asset-catalog` or the backend claims `/assets/*`.

A new empty-catalog backend cannot simply be rolled into production first. Its
backend-owned `/assets/*` route intentionally precedes static serving, so it would
shadow the old packaged paths before the import. Likewise, merging OpenTofu and the
application rollout in one unattended change races ArgoCD against container and
role creation.

Use the staged order below. Do not weaken catalog startup, add a packaged fallback,
or mark legacy pixels native merely to avoid the sequence.

## Stage 1: freeze and inventory

1. Start from a clean, current `origin/main` checkout that still contains the
   pre-cutover media.
2. Run the temporary migration tool's inventory mode and keep its JSON outside
   the repository. Its schema is `adr-0085-media-migration-inventory-v1`.
3. Record the source commit, count, byte total, per-file SHA-256, and the inventory
   file's own SHA-256 in the operator log.
4. Stop media-authoring changes until the final cutover, or regenerate the entire
   inventory after any such change.

Public runtime entries map to stable slots relative to `/assets` and import as
`legacy-bridge`, never accepted. Paths under the historical Chrome candidate
tree are not runtime merely because they lived beneath `frontend/public`: image
candidates remain non-active candidate versions, report/manifests become private
archives, and exactly five formerly installed parts receive separate canonical
bridge activations under `ui/chrome/{outer,inner,divider}/...`. Other non-runtime
source/review files become slotless private versions keyed by original source
path, are byte-verified, and are archived rather than exposed through the public
catalog. The importer has no review or acceptance input. Later production
acceptance uses the owner-operated application workflow only where that domain
already has a typed validator and review instrument. Terrain has that path;
Chrome/UI replacements remain bridge-only until their typed completeness
validator and game-owned review/accept controls exist.

## Stage 2: provision storage first

Merge/apply the OpenTofu storage change before deploying an app that references it.
The apply must finish successfully before proceeding.

Verify all of the following from infrastructure state and Azure:

- private container `chesstacticsmedia/live-media` exists;
- anonymous access is disabled;
- `live_media_container_url` matches the Helm production value;
- `chess-tactics-identity` has the custom immutable-media data role scoped to
  that container, not the storage account; it can read/create objects but cannot
  delete objects or change container policy;
- the normal app ServiceAccount still carries the workload-identity client id.

Do not continue on eventual-consistency guesses. Confirm a short-lived pod under
that ServiceAccount can create and read a uniquely named probe blob and that a
delete attempt is denied. An operator identity with explicit storage-owner scope
may remove the probe afterward; the application identity must not gain delete
permission for cleanup convenience.

## Stage 3: exercise the substrate in automated tests

Before touching the live data plane, run the backend smoke suite. CI already
supplies its own transient Postgres and generated bytes for destructive test
cases; the operator does not create or seed another asset database. The smoke
must cover:

- migration 18 from an empty database and idempotent re-entry;
- candidate creation, byte upload, owner review and candidate acceptance,
  legacy-bridge activation, archive,
  optimistic revision conflicts, and catalog revision bumps;
- stable-slot redirect and immutable byte delivery;
- hash, byte length, media type, and image-dimension rejection;
- critical incomplete state returning an explicit availability error;
- rejection of incompatible directory/container/seed combinations;
- generated-fixture reads with hash verification and atomic local writes.

Keep upload concurrency at one or two during the legacy import. The current largest
tracked object is about 11.5 MiB. The backend buffers each upload in process and
shares a 256 MiB pod with runtime caches, so the API ceiling remains 32 MiB.
Larger future media requires streaming upload and a fresh memory analysis; do not
raise the limit independently of that work.

## Stage 4: bootstrap the live data plane without serving the candidate backend

The preferred bootstrap is an isolated, short-lived backend pod in the production
namespace. It uses the already-built migration image, the normal production
ServiceAccount, production Postgres variables, `LIVE_MEDIA_CONTAINER_URL`, and
`SCHEMA_MIGRATIONS=auto`, but has **no Service, HTTPRoute, or Ingress**. Reach it
only through `kubectl port-forward`.

Run the exact same-repository PR image published by `Docker Build Check`. Set
`LIVE_MEDIA_SERVING_ENABLED=true` and `LIVE_MEDIA_IMPORT_ENABLED=true` on this
unserved pod. Serving must be enabled inside the pod because the importer proves
stable semantic routes after the complete catalog exists; the pod remains
unreachable except through the operator's local port-forward.

For the one import session, loopback dev auth may identify the allowlisted admin;
send the mock session cookie over the port-forward. Never place that pod behind a
Service, and delete it immediately after import. An actual owner session cookie is
also valid and avoids dev auth. Do not merge or deploy the media-bearing
substrate image to the normal live Service.

The temporary importer runs from the frozen source checkout, not from the pod. It
must:

1. create each deterministic slot/version through the admin API;
2. upload bytes and require the server's recorded hash/length/type/dimensions to
   match the frozen inventory;
3. activate public runtime entries only as `legacy-bridge`, keep Chrome review
   images as candidates, and create only the five declared canonical Chrome
   bridge activations;
4. fetch every uploaded immutable route and stream-hash the returned bytes;
5. defer stable `/assets/<slot>` checks until every required group and remapped
   canonical slot is present, then verify all active semantic routes;
6. archive private migration entries after immutable proof;
7. emit a final JSON report with every action and verified hash.

The importer must be restart-safe: content hashes, stable runtime slots, and exact
private source paths make a retry converge, while any conflicting existing record
fails visibly. Never delete or overwrite an existing blob to make a retry pass.

After import, run the proof through the port-forward with an admin session in
`LIVE_MEDIA_COOKIE`, comparing both public and private records to the frozen
inventory:

```powershell
cd backend
npm run media:verify-cutover -- `
  --origin http://127.0.0.1:3000 `
  --inventory C:\path\outside-repo\live-media-inventory.json `
  --expect-min-slots 1
```

This streams every active immutable object, checks SHA-256 and length, proves the
stable same-origin redirect, validates cache headers, and rejects unexplained
public slots. It also reads the authenticated admin catalog, stream-verifies
every remaining unique private candidate/archive blob, and requires one exact
version for every inventory entry: bridges stay `legacy-bridge`, review
candidates stay `candidate`, and private sources/reports stay `archived`. Hash,
length, type, dimensions, source path, namespace, slot, domain, role,
availability policy, acceptance contract, candidate metadata, native evidence,
disposition, and migration provenance must match; an extra or accepted migration
version fails proof.

Delete the bootstrap pod. Start a fresh unserved pod against the same live
Postgres/Blob state and re-run the verifier to prove the catalog and bytes did
not live only in process or pod storage.

## Stage 5: verify the final no-Git image against the live data plane

Now build the final image with:

- runtime consumers resolving semantic slots;
- tracked media and static accepted-pointer catalogs deleted;
- filesystem/server-thumbnail fallbacks deleted;
- the temporary importer deleted;
- the no-committed-media guard green.

Build first, then run the strict final-mode guard so it inspects both the source
tree and Vite's ignored output:

```powershell
cd frontend
npm run build
npm run check:media-final
```

The strict command also rejects the serving/import flags, bridge endpoint,
packaged-filesystem reader, cutover allowances, static Studio media inventories,
renamed/embedded media signatures, and any media copied into `frontend/dist`.

Push the final deletion commit to the same application PR and wait for `Docker
Build Check` to publish its exact `sha-<commit>` image. Run that image as another
unserved pod using the live app database, Blob container, and ServiceAccount,
with import disabled and with the temporary serving flag absent. Port-forward it
to a local origin and run the verifier:

```powershell
cd backend
$env:LIVE_MEDIA_COOKIE = '<owner session cookie>'
npm run media:verify-cutover -- --origin http://127.0.0.1:3000 --inventory C:\path\live-media-inventory.json --json
```

Restart the final candidate pod and repeat a critical-slot pass at the pinned
catalog revision:

```powershell
npm run media:verify-cutover -- --origin http://127.0.0.1:3000 --critical-only --expect-revision <revision>
```

Then verify the real application, not only the API:

- anonymous cold start reaches gameplay with no media request to a static file;
- Studio shows terrain/UI/portrait/font/audio roles from the same catalog revision;
- the Water edge and at least one abrupt boundary render at canonical 1×;
- a level thumbnail uses the same catalog and changes cache identity with its
  catalog revision;
- a missing critical test record produces the deliberate error state, not old or
  generic art;
- browser network logs contain stable `/assets/<slot>` and immutable
  `/api/media/<sha>`, with no Blob URL exposed.

User verification of this exact port-forwarded final image is the release gate.
It reads and writes the one live app data plane; no copied catalog participates.

## Stage 6: production cutover

Immediately before rollout:

1. rerun the production verifier with the frozen inventory;
2. confirm the final image digest is the user-verified unserved-pod digest;
3. confirm OpenTofu and migration 18 are already applied;
4. confirm `npm run check:media-final` passes after a fresh production build,
   with no importer/frozen exception;
5. confirm there were no media-authoring changes after inventory freeze.

Merge the application PR so the normal build/deploy workflow publishes that
same source to the `prod` deployment branch. Verify the live app's
`/api/asset-catalog`, every immutable
object, representative stable slots, the real board/Studio routes, and an on-demand
level thumbnail. Watch 404/503 rates for `/assets` and `/api/media`, catalog-load
failures, Blob authorization failures, and pod memory/restarts.

The final state has no seed variables in production and no repository media path.
Rollback of bad art is an accepted-pointer transaction. Application rollback must
use another live-storage-capable image. Reintroducing the pre-cutover Git image is
not a supported steady-state rollback; doing so means the migration itself was
reverted and is again incomplete.

## Completion record

Retain outside Git or in the normal operational evidence store:

- infrastructure apply id and container/role proof;
- frozen inventory and its SHA-256;
- importer final report;
- bootstrap and final-candidate verifier JSON reports;
- final image digest and catalog revision;
- user verification route/evidence;
- final no-committed-media guard output.

Only then may the cutover be called complete.
