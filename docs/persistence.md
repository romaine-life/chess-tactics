# Persistence

chess-tactics' durable document store is **Azure Database for PostgreSQL —
Flexible Server**, provisioned by this repo's own OpenTofu (`tofu/`) and reached
**passwordless via Entra (AAD) workload identity**. It replaces the previous
pod-ephemeral JSON files under `/var/run` (which had no PersistentVolume and were
wiped on every restart/rollout — a latent data-loss bug, now fixed).

## What is stored

Durable document and live-content tables are created by the inline migrations in
`backend/server.js`:

| Table | Scope | Endpoint | Auth |
| --- | --- | --- | --- |
| `levels` | per signed-in owner (`PK (owner_email, id)`) | `/api/levels`, `/api/levels/:id` | sign-in required |
| `campaign_workspaces` | one row per signed-in owner | `/api/campaign-workspace` | sign-in required |
| `level_working_copies` | one durable working copy per signed-in owner + workspace + level | `/api/editor-documents` | sign-in required; official workspaces also require admin |
| `campaigns` | per signed-in owner (`PK (owner_email, id)`) | `/api/campaigns`, `/api/campaigns/:id`, `/api/campaigns/:id/levels` | sign-in required |
| `design_portfolios` | global, by id | `/api/design-portfolios/:id` | GET public, PUT requires sign-in (designer) |
| `prop_seats` | one complete global prop geometry/tuning document (`default`) | `/api/prop-seats/default` | GET public, PUT requires admin |
| `sfx_profiles` | one complete global SFX metadata/mix/assignment document (`default`) | `/api/sfx-profiles/default` | GET public, optimistic PUT requires admin |
| `unit_families` / `unit_assets` / `unit_sprites` | global live Unit Art catalog | `/api/unit-catalog`, `/api/admin/unit-assets` | GET public, mutations require admin |
| `unit_catalog_state` / `unit_asset_events` | Unit Art revision and audit history | internal | admin mutations write them |
| `media_slots` / `media_versions` / `media_blobs` | shared live-media substrate and active pointers | `/api/asset-catalog`, `/api/media/:sha`, `/assets/:slot`, `/api/admin/media-assets` | GET public, mutations require admin |
| `media_catalog_state` / `media_asset_events` | shared asset revision and audit history | internal | admin mutations write them |

Per-user scoping means each user has their own `id` namespace — two users can
both have a level `my-level` without colliding, and neither can read or
overwrite the other's. Writes upsert and bump a `revision`.

The global `prop_seats/default` document is also compare-and-swap protected.
Its admin PUT must send `expectedRevision`: `null` creates only when the row is
absent, while an integer must match the revision returned by GET or the write
returns `409 prop_seats_revision_conflict` with `currentRevision`. PropSeatLab
keeps the startup revision and advances it only from a successful save response,
so sequential edits cannot silently overwrite a newer document.

## Level editor working copies

The Level Editor uses a normal private document model, not a public-link map
store. `level_working_copies` holds the user's latest acknowledged editing
state indefinitely. Each row has an opaque, globally unique `document_id`,
which is the stable editor address. Level ids such as `l1` are only unique
inside one account and are never used as an editor URL authority. Loading or
copying a document address does not create a public record, grant access,
publish, save, or rewrite the URL (see ADR-0068). Opening a campaign's account-local
`levelId` route may resolve its document once and replace the address with that stable opaque id;
this is editor initialization, never an effect of copying. A request still filters by
both the signed-in owner and `document_id`, so pasting another account's URL
returns not found instead of accidentally resolving the viewer's unrelated
level with the same per-owner id.

`GET /api/editor-documents` is the private, authenticated recent-document
index. Dirty work is ordered before clean documents, and `status=dirty` or
`status=never-saved` can filter it directly. Pages contain at most 200 summaries
and return `next_offset` until all owner-scoped documents have been traversed,
including never-saved and migrated `legacy-*` documents, so an old draft cannot
be hidden behind newer clean rows. It does not grant access, publish, mutate a
document, or restore any public-by-link behavior. Full documents and summaries
expose `has_saved_baseline`; unlike `saved_revision`, it remains true for a
recovered dirty draft based on an existing canonical Level, so Discard remains
available.

Each autosave is a compare-and-swap write. The client sends the last server
`revision` it observed; a stale tab receives `409
editor_document_revision_conflict` plus the current server document instead of
silently overwriting newer work. `saved_revision` records the working-copy
revision known to match the canonical workspace Level. `baseline_hash` records
the deterministic PostgreSQL `md5(level_jsonb::text)` identity of the canonical
Level that working copy was based on. On load/resolve, a clean working copy
automatically follows a newer canonical Level. A dirty working copy is preserved
and returns `baseline_conflict: true`; Save then returns `409
editor_document_baseline_conflict` with that intact document instead of blindly
overwriting the external canonical change. Discard deliberately adopts the
current canonical Level and resets the baseline. Autosave changes only the
working body and revision, never its canonical baseline (and keeps the document
clean when the submitted body exactly matches that baseline).

Browser storage is only a crash/offline fallback. Signed-in entries are keyed and
payload-validated by account plus opaque document id and remember the cloud revision
they observed, so switching accounts or replaying an old Test-return URL cannot upload
one document's recovery into another. Test-return board parameters are removed from the
address after that exact snapshot is acknowledged; they are not a second document store.

- `PUT /api/editor-documents/:documentId` updates only the working copy.
- `POST /api/editor-documents/:documentId/save` transactionally promotes the
  working copy (or the exact Level supplied with the Save click) into the
  account campaign workspace; admins may explicitly target an official
  workspace. It then advances both revision values together and returns the
  canonical `workspace_revision` from that same transaction, so the caller's
  next whole-workspace CAS does not conflict with its own Level Editor Save.
- `POST /api/editor-documents/:documentId/discard` transactionally replaces the
  working copy with the current canonical saved Level and advances both
  revision values together.

Whole-workspace writers use their own compare-and-swap token as well. `GET
/api/campaign-workspace` returns `revision`; its PUT must send that revision
beside `campaigns` and `levels`. A stale writer receives `409
workspace_revision_conflict` plus the current workspace. Official workspace
PUTs likewise send the `portfolio.revision` returned by GET and receive `409
official_campaign_revision_conflict` plus the current portfolio when stale.
An explicit Level Editor Save advances this workspace revision in the same
transaction as canonical promotion. Thus a Campaign Editor tab opened before
that Save cannot later revert it with a whole-document last-write-wins PUT.
The account workspace PUT also refuses to introduce a level id reserved by a
never-saved working document (`workspace_level_reserved`); only that document's
Save may cross the canonical boundary for its server-allocated id.

New user documents are allocated both an account-local `l<n>` level id and an
opaque global document id by the server. They begin as a durable but
never-saved working copy (`saved_revision = 0`). Their first Save creates the
canonical unassigned Level. Canonical workspaces remain the source for campaign
thumbnails and gameplay; autosaved working-copy content is never used for
either.

Migration 16 retires and drops the v13 `editor_maps` and
`editor_map_audit_events` tables after carrying forward signed-in working
copies. Repeated standalone rows whose old body used the shared placeholder id
`draft` each receive a distinct `legacy-<public_id>` level id, so they cannot
collapse under the one-working-copy-per-level constraint. Ordinary repeated
level ids retain the newest row; `off-*` rows map to the official `default`
workspace instead of being dropped. A migrated draft over an existing canonical
Level receives a synthetic saved revision 1 and a working revision of at least
2, preserving both its Discard target and its dirty state; only rows with no
canonical Level remain genuinely never-saved. Anonymous handoff,
misc-pool, edit-key, expiry, and public-by-link editor-document behavior no
longer exists. Migrated signed-in rows retain their former globally unique map
identity under a `legacy-` document-id prefix, but reads are now account-owned
and never public. During compatibility recovery, an old editor URL
`?map=<public_id>` is interpreted only as the private document id
`legacy-<public_id>` through the normal authenticated GET, then canonicalized to
the durable document URL; no old public/edit-key endpoint remains. This is
separate from `public_maps`, the explicit published
snapshot store used by the existing public `/play?map=...` subsystem; migration
16 deliberately leaves that store intact.

Per [ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md), media is live
content. Postgres stores stable slots, active pointers, accepted status, candidate metadata,
geometry/provenance, revisions, and content hashes. Private Blob Storage stores
immutable content-addressed bytes. The backend resolves stable `/assets/<slot>`
addresses and immutable same-origin object routes. It never reads a packaged
`frontend/public/assets` fallback, and Postgres does not store large media bytes.

Unit Art remains a typed catalog over the same ownership model. BGM retains its
existing Blob-index/range-streaming projection. See
[`runtime-asset-contract.md`](runtime-asset-contract.md).

The SFX runtime profile is a separate typed document projection over live-media
recording slots. It owns labels/descriptions, sound-set gains, terrain
assignments, and arrival behavior, with a compare-and-swap revision on admin
Save. Its migration creates no default row: absence is decorative silence and
Studio-unavailable state, while localStorage is only a revision-bound unsaved
draft. See [ADR-0089](adr/0089-sfx-runtime-profile-is-db-authoritative.md).

What is **not** in Postgres (deliberate, see "Boundaries"): the `lobbies`
matchmaking map.

## Request auth: reads public, writes gated

The standing rule for HTTP request auth is **game-content reads are public, only
writes are login-gated — playing never requires a session** (per
[ADR-0060](adr/0060-playing-never-requires-sign-in.md)). Everything needed to load
and play the game serves **without a session**: official campaigns
(`GET /api/official-campaigns/:id`), public shareable maps
(`GET /api/maps/:publicId`), the `design_portfolios` catalog, and OG/thumbnail
unfurls — so anonymous cold-start players and link-preview crawlers work. Writes
require sign-in, and publishing **global** game content (officials, and future
DB-backed tweakables such as props) additionally requires admin (`requireAdmin` /
`ADMIN_EMAILS`, per [ADR-0038](adr/0038-campaigns-are-tiered-game-content.md)).

Private **per-user** documents are the exception by nature, not a contradiction:
`levels` and `campaign_workspaces` are scoped to `owner_email`, so their reads
*and* writes require sign-in — they are the viewer's own data, not game content.
Any new DB-backed content we want to tweak live inherits this public-read /
admin-write shape, never a blanket session gate.

## Authentication to the database

Two connection modes, chosen by environment in `backend/server.js`:

- **Production** — `POSTGRES_HOST` / `POSTGRES_DATABASE` / `POSTGRES_USER` are
  set (non-secret) and the pod authenticates **passwordless**: the
  azure-workload-identity webhook projects the ServiceAccount token,
  `DefaultAzureCredential` exchanges it for an Entra access token scoped to
  `https://ossrdbms-aad.database.windows.net/.default`, and that token is
  presented as the Postgres password on each new connection (recycled before the
  ~1h token TTL). The app's UAMI `chess-tactics-identity` is the server's Entra
  administrator, so startup migrations run under it. No app password exists.
- **CI / test slots / local** — `DATABASE_URL` is set and used directly
  (password mode) against a throwaway Postgres.

## Schema migration mode

The backend always connects to the configured database, but schema mutation is
controlled separately by `SCHEMA_MIGRATIONS`:

| Value | Behavior | Intended use |
| --- | --- | --- |
| `check` | Default. Read-only verification that `schema_migrations` exists and contains every migration version in `backend/server.js`; missing schema returns `503 schema_migration_required` on persistence endpoints. | Local backend runs against an already-prepared DB without applying DDL by surprise. |
| `auto` | Applies any missing inline migrations under the Postgres advisory lock, then serves persistence endpoints. | Kubernetes prod/test-slot backends and smoke tests, where the environment intentionally owns schema rollout. |
| `off` | Skips schema readiness entirely; queries run against whatever schema exists and fail naturally if it is incompatible. | Debugging unusual DB states. |

The Helm deployment sets `SCHEMA_MIGRATIONS=auto` explicitly. Local backend
startup defaults to `check`; set `SCHEMA_MIGRATIONS=auto` only when you
intentionally want that run to advance the local database schema.

## Failure behavior

HTML and deploy-owned executable chunks can still be served during a database
outage, and `/health` remains a process-only liveness probe. The playable app is
intentionally database-dependent: `/ready`, the complete `prop_seats/default`
document, the live asset catalog, stable
`/assets/<slot>` routes, and catalog-backed thumbnails fail closed when Postgres,
the required critical catalog, or Blob Storage is unavailable. Persistence
endpoints likewise return **503** with a logged error when the database is
unavailable or behind the required schema. In `check` mode, a behind/missing
schema is reported as `schema_migration_required`; in `auto` mode,
`ensureDbReady()` retries migrations on the next request (self-healing after a
transient outage). Startup never blocks on the DB, but Kubernetes readiness keeps
an unready process out of service.

## Backups & break-glass

- **Backups**: Azure-managed automated backups with 7-day point-in-time restore
  (`backup_retention_days = 7`, geo-redundant off). See `tofu/postgres.tf`.
- **Break-glass**: password auth stays enabled for human ops only (the app never
  uses it). The `pgadmin` password is generated by tofu and stored in the
  `ng6-chess-tactics` Key Vault as `chess-tactics-pg-admin-password` (alongside
  `-host` and `-database`). Connect with
  `psql "host=<fqdn> user=pgadmin dbname=chess_tactics sslmode=require"`.

## Provisioning (self-service tofu)

The database is owned by this repo. `tofu/postgres.tf` + `tofu/identity.tf` +
`tofu/keyvault.tf` declare the Flexible Server (westus3 — westus2 is
offer-restricted for Flexible Server), the `chess-tactics-identity` UAMI + its
federated credential, the Entra-admin grant, the Azure-internal firewall rule,
and the Key Vault. `.github/workflows/tofu.yaml` runs `tofu plan` on PRs and
`tofu apply` on merge to `main`, against chess-tactics' own state
(`chess-tactics.tfstate`) and service principal.

After the first apply, copy the outputs into `k8s/values.yaml`:

| tofu output | values.yaml field | notes |
| --- | --- | --- |
| `postgres_fqdn` | `postgres.host` | deterministic: `chess-tactics-pg.postgres.database.azure.com` |
| `postgres_database_name` | `postgres.database` | `chess_tactics` |
| `app_identity_name` | `postgres.user` | `chess-tactics-identity` |
| `app_identity_client_id` | `serviceAccountClientId` | **non-deterministic — must be pinned after apply** |

Only `serviceAccountClientId` is unknown before apply. Until it is pinned, the SA
is left un-annotated and prod persistence returns 503 (the game still serves);
once pinned and rolled out, the workload-identity path activates.

## Test slots

A Glimmung test slot can't federate to the prod UAMI (its ServiceAccount subject
differs) and must never touch prod data, so the chart renders an **ephemeral
in-cluster Postgres** (`k8s/templates/postgres-testslot.yaml`, `postgres:16-alpine`
on `emptyDir`) for slots only, and points the app at it via `DATABASE_URL`. The
data dies with the slot. The chart also sets `SCHEMA_MIGRATIONS=auto`, so the
throwaway DB is prepared by the app before endpoint tests run. At startup, the
slot copies the public Unit Art/media catalogs and the complete
`prop_seats/default` document into that isolated database; immutable media bytes
are fetched by hash into local object storage as needed. This is a read-only
validation projection with no production credentials or write-back path, not a
second owner-facing content environment or a release authority.

## CI

The backend smoke-test (`backend/smoke-test.js`, run by `npm test`) exercises the
Postgres-backed endpoints. It uses `DATABASE_URL` if provided, otherwise
self-provisions a throwaway local Postgres from system binaries (present on the
GitHub-hosted runners), so CI needs no database service container or workflow
change. Hosts without Postgres binaries (e.g. the musl session pod) must supply
`DATABASE_URL` or rely on the test slot. The smoke-test sets
`SCHEMA_MIGRATIONS=auto` and resets the document tables at the start of each run,
so it is idempotent against the intended throwaway database.

## Boundaries

- **Game art/assets** are live storage-backed. The retired `design_assets`
  `bytea` table and its Git-seeded fallback routes remain absent; the replacement
  is the content-addressed live-media substrate governed by ADR-0085.
- **`lobbies`** remain process-memory matchmaking state. They are transient room
  coordination, not authored game content.
