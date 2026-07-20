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
| `level_working_copy_revisions` | retained checkpoints for each durable working copy | `/api/editor-documents/:id/revisions` | owner only; restore requires current CAS revision |
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

Pre-drawn automatic occlusion under ADR-0117 adds no stored document or media
field. The runtime re-derives the seed alpha and depth from the same canonical
board geometry already carried by the Level. Under ADR-0118, the pre-drawn
background declaration persists its semantic surface slot, actual image
dimensions, and exact approved versioned whole-image alignment. The pinned
boundary may round-trip inside that alignment but remains display-only; the
declaration does not persist a preview URL, candidate id, browser-local key, or
picker state. A future
plate-specific paint/erase artifact is not authorized to enter `boardCode`, a
working-copy-only field, or browser-local runtime state without a separate
persistence decision.

## Level editor working copies

The Level Editor uses a normal private document model, not a public-link map
store. `level_working_copies` holds the user's latest acknowledged editing
state indefinitely unless the owner explicitly deletes a never-saved document.
Each row has an opaque, globally unique `document_id`,
which is the stable editor address. Level ids such as `l1` are only unique
inside one account and are never used as an editor URL authority. Loading or
copying a document address does not create a public record, grant access,
publish, save, or rewrite the URL (see ADR-0068). Opening a campaign's account-local
`levelId` route may resolve its document once and replace the address with that stable opaque id;
this is editor initialization, never an effect of copying. A direct
`GET /api/editor-documents/:documentId` filters by both the signed-in owner and
`document_id` for an ordinary account. An authenticated allowlisted administrator may instead
read an existing row by that exact opaque ID for review (ADR-0132). This exception does not apply
to the owner-scoped document list, resolve/create, autosave, Save, Discard, or Delete, and an
unknown or deleted ID still returns not found.

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

Per [ADR-0090](adr/0090-private-draft-cards-preview-and-manage-working-copies.md),
the signed-in owner's bounded `/editor` Continue-editing list may hydrate its
displayed summaries through the existing owner-scoped full-document GET and render
the working Level as a private resume preview. The summary index remains body-free.
This preview does not make autosaved work canonical, playable, shared, or public.

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
The client compares cloud content through the editor's canonical projection before deciding an
autosave is needed. Merely opening a valid stored Level whose serialization normalizes differently
must not dirty the working copy or create a new revision.

Browser storage is only a crash/offline fallback. Signed-in entries are keyed and
payload-validated by account plus opaque document id and remember the cloud revision
they observed, so switching accounts or replaying an old Test-return URL cannot upload
one document's recovery into another. Test-return board parameters are removed from the
address after that exact snapshot is acknowledged; they are not a second document store.
An autosave error or conflict interrupts every Level Editor layer. When an older browser
recovery is preserved, **Keep recovered work** clears the recovery marker only if that scoped
entry still matches the exact cloud revision and signature on screen, then resumes the ordinary
compare-and-swap autosave. A concurrent newer server write conflicts again rather than being
overwritten; choosing the recovery does not Save or publish it.

Each acknowledged working-copy update also records the resulting complete Level in
`level_working_copy_revisions` inside the same transaction. Retention keeps the newest 200
revisions, one newest checkpoint per UTC day, and every explicit lifecycle boundary. The owner-only
history endpoint returns body-free summaries. Restore requires both the current document revision
and a retained target revision; it applies that body as a new working-copy revision, preserving the
version it replaced and leaving the canonical saved Level unchanged. ADR-0132 direct-review admins
cannot list or restore another owner's history. The editor can download its exact scoped browser
recovery and current cloud working copy as JSON without mutating either side.

- `PUT /api/editor-documents/:documentId` updates only the working copy.
- `GET /api/editor-documents/:documentId/revisions` lists retained body-free checkpoints.
- `POST /api/editor-documents/:documentId/revisions/restore` CAS-restores a retained body as a new
  private working-copy revision; it never promotes that body to the canonical workspace.
- `POST /api/editor-documents/:documentId/save` transactionally promotes the
  working copy (or the exact Level supplied with the Save click) into the
  account campaign workspace; admins may explicitly target an official
  workspace. It then advances both revision values together and returns the
  canonical `workspace_revision` from that same transaction, so the caller's
  next whole-workspace CAS does not conflict with its own Level Editor Save.
- `POST /api/editor-documents/:documentId/discard` transactionally replaces the
  working copy with the current canonical saved Level and advances both
  revision values together.
- `DELETE /api/editor-documents/:documentId` compare-and-swap deletes only a
  never-saved working copy. It rejects saved-baseline documents and never deletes
  a canonical Level; saved-backed cleanup uses Discard instead.

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
canonical unassigned Level. Canonical workspaces remain the source for campaign,
gameplay, share, and server thumbnails. Autosaved content is not used by those
surfaces; only the private owner-scoped resume preview defined by ADR-0090 may
render the working copy itself.

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

Per [ADR-0106](adr/0106-installed-content-is-database-owned.md), `drawable_assets`
owns the installed logical inventory and `drawable_asset_media` assigns its named
roles to live-media slots. Concrete editor/catalog entries are database records,
not compiled TypeScript members.

Defaults are installed configuration too. A drawable domain that needs a
default marks exactly one database row (or uses an equally explicit unique
role); consumers never substitute array position zero for a missing or unknown
id. Required behavior fields such as structure blocking/split/scale,
ground-cover density counts, surface probability/role, wall-art span/reflection,
and nine-slice flags are validated as present. An omitted field or an unknown
requested id fails closed instead of manufacturing a code default.

`/ready` validates a fresh media catalog, drawable catalog, prop-seat document,
and Unit Art catalog through the shared renderer projection and reports all four
revisions. A filename-shaped media slot is never accepted as evidence that a
logical drawable exists.

Terrain-family rows declare both their serialized gameplay terrain and the
gameplay terrain values they render. Editor conversion, free-skirmish assembly,
and gameplay rendering use that projection; they do not keep family maps or a
compiled `grass` fallback.

Installed unit-portrait rows also own their crop geometry in `behavior.crop`.
The Portrait Editor keeps browser state only as an unsaved draft and persists
accepted geometry through the admin drawable transaction; gameplay, roster,
and catalog rendering read the database projection and fail closed when a crop
is absent or invalid.

Studio Assets and Artwork membership is projected from `studio-catalog-item`
drawable rows. Each row owns its label, grouping, presentation metadata, and
explicit media roles; semantic-slot filenames are opaque join keys and are not
parsed into a roster. Configuration-only `chrome-fill-tint` rows likewise own
the installed Chrome tint names and RGB values.

New pre-drawn board media slots are allocated by the authenticated backend
media transaction and returned with the candidate version. Clients never form
a slot from a level id. Canonical level-list thumbnails are used only when the
backend's level projection supplies an immutable derivative URL; a missing
derivative has no constructed stable-path or read-through fallback.

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
| `check` | Default. Read-only verification that `schema_migrations` contains every migration version and that required runtime relations actually exist; missing schema returns `503 schema_migration_required` on persistence endpoints. | Local backend runs against an already-prepared DB without applying DDL by surprise. |
| `auto` | Applies missing inline migrations under the Postgres advisory lock, idempotently repairs required runtime relations from their governing migration when numeric history and actual schema disagree, then verifies them before serving persistence endpoints. | Kubernetes prod/test-slot backends and smoke tests, where the environment intentionally owns schema rollout. |
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
