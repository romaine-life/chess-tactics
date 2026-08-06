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
| `schema_migrations` | append-only version, name, checksum, and application time for database schema history | internal migration authority | backend migration/check processes only |
| `levels` | per signed-in owner (`PK (owner_email, id)`) | `/api/levels`, `/api/levels/:id` | sign-in required |
| `campaign_workspaces` | one row per signed-in owner | `/api/campaign-workspace` | sign-in required |
| `active_runs` | one versioned, CAS-updated active Run document per signed-in owner, including persistent named army units | `/api/active-run` | sign-in required; anonymous Runs remain browser-local until adoption |
| `run_progression` | one monotonic highest-completed Ataraxia tier per signed-in owner | `/api/run-progression` | sign-in required; anonymous/offline unlocks remain browser-local and merge by maximum on sign-in |
| `lipsanon_stat_events` | idempotent owner-scoped lipsanon pick and Battle-win facts | `/api/run-lipsanon-statistics`, `/api/run-lipsanon-stat-events` | sign-in required; anonymous and unsynced facts remain browser-local |
| `level_working_copies` | one durable working copy per signed-in owner + workspace + level | `/api/editor-documents` | sign-in required; official workspaces also require admin |
| `level_working_copy_revisions` | retained checkpoints for each durable working copy | `/api/editor-documents/:id/revisions` | owner only; restore requires current CAS revision |
| `level_working_copy_revision_reasons` | closed canonical registry for retained working-copy revision reasons | internal schema contract | backend-owned; referenced by one validated foreign key from revision history |
| `editor_document_edit_sessions` | opaque attributable owner page credentials; legacy lease columns are not mutation authority | `/api/editor-documents/:documentId/...` | document owner only; cross-owner admin review is excluded |
| `editor_document_recoveries` | inert historical snapshots from the superseded lease system; no current route creates or presents them | none | unavailable |
| `predrawn_generation_attempts` | server-owned Board Art creation-slot identity, one exact reusable Raw Pipeline Source input, compatible canonical processing context, at-most-one committed warped/occlusion stage, and one latest warp-bound cell-visual-footprint draft under the compatibility cyan move-highlight field names | `/api/editor-documents/:documentId/generation-attempts` and its attempt actions | owner/current-writer mutations; owner/admin-scoped reads |
| `predrawn_background_versions` | immutable Generation References (`kind='source'`) plus raw-raster, registered-raster, and depth-mask lineage per editor document + level | `/api/editor-documents/:documentId/background-versions`, its `/:versionId/content` child, and `/api/background-versions/:versionId/content` | owner/current-writer mutations; owner/admin-scoped private reads; exact explicitly published content public |
| `predrawn_background_version_events` | actor-attributed created, content-uploaded, archived, and published lifecycle events | internal | written atomically by authorized lineage mutations; idempotent retries do not duplicate events |
| `predrawn_background_geometry_bindings` | immutable one-row-per-version normalization of an exact legacy v1 environment-geometry digest to cover-independent v2 | internal; effective v2 digest is projected with background-version reads | written only inside an authorized fenced autosave, derivative-create, Save, or Publish transaction after server-held Level proof; GET never writes |
| `predrawn_background_raw_contract_bindings` | immutable one-row-per-version proof of historically absent Raw Pipeline Source coordinate-basis/viewing-pane metadata, pinned to exact saved-Level frame/bounds, bytes, provenance, and geometry | internal; effective raw-source contract is projected with background-version reads | written only inside fenced processing-attempt creation after exact server-held saved-Level proof; GET/list/picker never writes |
| `public_maps` | owner-free snapshot of an explicitly published user Level | `POST /api/maps/publish`, `GET /api/maps/:publicId` | publish requires the signed-in owner; snapshot reads are public |
| `campaigns` | per signed-in owner (`PK (owner_email, id)`) | `/api/campaigns`, `/api/campaigns/:id`, `/api/campaigns/:id/levels` | sign-in required |
| `design_portfolios` | global, by id | `/api/design-portfolios/:id` | GET public, PUT requires sign-in (designer) |
| `prop_seats` | one complete global prop geometry/tuning document (`default`) | `/api/prop-seats/default` | GET public, PUT requires admin |
| `sfx_profiles` | one complete global SFX metadata/mix/assignment document (`default`) | `/api/sfx-profiles/default` | GET public, optimistic PUT requires admin |
| `unit_families` / `unit_assets` / `unit_sprites` | global live Unit Art catalog | `/api/unit-catalog`, `/api/admin/unit-assets` | GET public, mutations require admin |
| `unit_catalog_state` / `unit_asset_events` | Unit Art revision and audit history | internal | admin mutations write them |
| `media_slots` / `media_versions` / `media_blobs` | shared live-media substrate and active pointers | `/api/asset-catalog`, `/api/media/:sha`, `/assets/:slot`, `/api/admin/media-assets` | GET public, mutations require admin |
| `media_catalog_state` / `media_asset_events` | shared asset revision and audit history | internal | admin mutations write them |

The `run-card-icon-fitting-v1` design portfolio is the Studio Card Icon
Fitting draft. It records exact candidate ids/hashes, independent property
placements, and the shared unit-state placement so an owner can resume visual
fitting. Like every design portfolio, it is not an accepted media pointer or
installed runtime-configuration authority; publishing remains a separate admin
transaction. The current projection contains the four active property/unit-state pairs.
The former Praecipuus/Primogeniture fifth pair is retired from the projection; Praecipuus
remains a card property and retains its independent committed placement. This JSON portfolio
change requires no relational migration (ADR-0340, ADR-0419).
ADR-0414 separately promoted the starter illustrations and Praecipuus media through the
live-media and installed-drawable catalogs.
That pointer/configuration transaction does not change the portfolio document,
the relational schema, or `RunSaveVersion`.
Migration 59 completes ADR-0419's Primogeniture retirement as one installed-content graph
change: it removes the `app-ui` required role and drawable-media binding before retiring the
semantic slot and archiving its accepted version. Schema readiness verifies all three
postconditions, and live-media retirement refuses any slot still referenced by an active
drawable, so a partial retirement cannot make the public drawable catalog unavailable.

The active Run document names its schema marker **RunSaveVersion**. Its stored field is
`runSaveVersion`, its type is `RunSaveVersion`, and the client and server share
`CURRENT_RUN_SAVE_VERSION`. Normalization and writes accept only that exact version. The lossless
chain first renames version 16's marker to RunSaveVersion 17, rewrites version 17's Shop
vocabulary into RunSaveVersion 18's Sectio, Adlectio, and Alienatio vocabulary, advances version
18 to RunSaveVersion 19's starter Chartulary and historical deployment queue, advances version
19 to RunSaveVersion 20's Expunctio transaction and reset-complete Pestiferous loss snapshot,
advances version 20 to RunSaveVersion 21's stable nullable card seats and card-ordered Deployment,
advances version 21 to RunSaveVersion 22's explicit deal boundary and persisted transport, then
advances version 22 to RunSaveVersion 23 by migrating every embedded Battle Level to Level format
version 2, advances version 23 to RunSaveVersion 24's ability-free authored formation cards,
advances version 24 to RunSaveVersion 25's generated rarity deck and sideways formation settling,
and advances version 25 to RunSaveVersion 26's Battle-first opening and derived Sectio pile cursor.
Migration 54 owns the marker rename; migration 55 advances the Sectio vocabulary; migration 56
adds His Grace and Front Lines and returns a version-18 Deployment or Battle to its then-current
pre-information boundary because that version did not persist exact automatic destinations.
Migration 57 adds Expunctio without changing the player's current phase or resources. Migration 58
expands `unitIds` into the authored card shape as stable nullable `unitSeats`—restoring holes for
already-sold units—removes Primogeniture from every stored unit copy,
and returns an in-flight version-20 Deployment or Battle to the new empty-battlefield deal boundary.
Migration 60 removes the retired Deployment mode, maps a not-yet-settled old deal back to
`awaiting-deal`, maps an already-settled old pace boundary to the active card, and preserves every
later reveal, placement, settlement, and discard boundary while resuming it paused.
Migration 61 advances every embedded Battle Level and the containing Run marker together.
Migration 63 owns the two subsequent account-document edges that do not change PostgreSQL's
relational shape. It advances any durable version-23 or version-24 `active_runs.body` directly to
version 25: retired ability state is removed, valid held formation identities and every persistent
unit are preserved, offers receive canonical rarity, and in-flight Deployment or Battle state
returns to the formation-card deal boundary. The browser applies the equivalent version-23 to 24
and version-24 to 25 transforms to its local copy, so no persisted random translation survives
into deterministic right-to-left settling.
Migration 64 then advances version 25 to 26. It adds `sectioCardCursor`, removes the obsolete
Sectio `kind`, preserves a visible post-Battle offer row, and moves an in-progress opening Sectio
to Battle 1's Deployment without losing completed transactions. The browser performs the same
deterministic transform on first load.
Each account migration advances the Run's CAS revision, while the browser applies the same chain
to its local document on first load. Saves older than version 16 remain unavailable because their
retired gameplay state has no declared lossless transform. See
[ADR-0380](adr/0380-run-save-versions-always-migrate.md) and
[ADR-0392](adr/0392-sectio-is-the-run-disposal-and-acquisition-phase.md) through
[ADR-0393](adr/0393-adlectio-and-alienatio-are-the-movements-within-sectio.md), and
[ADR-0419](adr/0419-deployment-draws-a-hidden-card-stack-in-play-order.md), and
[ADR-0422](adr/0422-deployment-deals-a-visible-deck-before-transport-begins.md), and
[ADR-0407](adr/0407-expunctio-removes-one-card-per-sectio.md).

Beginning with RunSaveVersion 16, every version that reaches players has an explicit forward
migration for account and browser storage. Retired content maps to a typed tombstone or neutral
replacement—for example, a removed card remains in the deck as **Removed card**—rather than
invalidating the Run.

RunSaveVersion 26 begins in Bona Vacantia when the opening Conflict offers a lipsanon, otherwise
in Battle 1's Deployment. Taking that opening lipsanon also enters Deployment; there is no opening
Sectio. The Run carries the permanent King and two starting Pawns through the single starter-only
His Grace card and retains eight starting gold. The first Sectio follows Battle 1.

Every Run persists a non-negative `sectioCardCursor` into its seed-derived hidden card sequence.
Each 180-card pile contains exactly 135 Common, 36 Uncommon, and 9 Rare cards. Per-rarity queues
include all still-unseen identities before recycling; their selected quotas are shuffled together.
A normal Sectio consumes three positions and Quartermaster's Ledger consumes four. Reset Sectio
retains the same visible offers and cursor rather than redrawing. Army, card-aware Alienatio within
Expunctio, Adlectio, Reset Sectio, and Continue reuse the post-Battle model. Expunctio may remove one held card and its remaining units
per visit for its printed value plus those units' standard value; His Grace is never eligible.
Continue may perform no Adlectio. Deployment always persists the exact dealt-card
order, stable nullable seats, capacity decision, active card, revealed-card prefix, seat cursor,
deal boundary, paused/play/full-deploy transport, committed placements, settlement boundary, and
discard cursor. A one-gold in-Deployment or five-gold in-Battle position reroll replaces those
existing fields at the initial deal boundary with a new placement seed while retaining the dealt
card ids and nullable seat order. Its registered unit-departure track is presentation-only: the
atomic persisted replacement and gold debit occur after compositor completion, so animation
progress adds no RunSaveVersion field. A won
non-final Battle enters `aftermath`, which persists
the reward, turns, elapsed time, survivors, and fallen units until Continue opens Bona Vacantia
or the next Sectio. The exact terminal board crosses from the live Battle scene to aftermath in a
mandatory current-session handoff so Back is not conditional on a best-effort storage write;
browser match persistence remains the exact-identity reload fallback. See ADR-0321 through
ADR-0348, ADR-0377, ADR-0419, ADR-0422, ADR-0449, and ADR-0457 for those gameplay decisions.

Level documents have their own `formatVersion`, separate from the PostgreSQL schema-migration
ledger. Current code accepts exactly Level format version 2. The declared version 1 to 2 transform
retires Pawn-only deployment geometry: it folds every
`player-pawn-spawn` square into the general `player-spawn` zone, removes Pawn from that zone's
`excludedPieceTypes`, and rewrites both structured Levels and encoded `boardCode` wherever playable
Levels may persist: canonical and public Levels, campaigns, working copies and their retained
history/session/recovery state, active Runs, and lab/train/solve records. The transform is
idempotent and preserves every unrelated zone field and square. Migration 56 performed the first
in-place retirement; migration 61 establishes the explicit Level version edge across every durable
location and repairs working-copy baselines from exact `saved_revision` bodies. When retention has
already pruned that body, migration 62 restores only a later retained non-null baseline hash carrying
the same saved-revision identity; an old-format hash remains a deliberate conflict until explicit
Discard. Browser imports use the same shared transform, and embedded browser Runs advance through
RunSaveVersion 23. See [ADR-0429](adr/0429-level-format-versions-always-migrate.md) and
[ADR-0430](adr/0430-pruned-saved-revisions-retain-baseline-evidence.md).

The save stores the selected Ataraxia tier, named and numbered army units, held formation cards,
the derived Sectio pile cursor, lipsana and their Conflict state, current deployment or Battle
runtime, aftermath, and the complete Sectio reset snapshot. The retired `draft` phase,
`draftOffers`, and `chosenDraftId` are rejected. The generic `formatVersion` field is accepted only
by the exact version-16 storage migration; normalization and writes never treat it as a current
shape. Likewise, version 17's `shop` phase/property and `shop` unit source exist only on the
explicit migration boundary. Its `purchasedCardOfferIds` and `soldUnits` fields migrate directly
to `adlectedCardOfferIds` and `alienatedUnits`; current admitted units use source `adlectio`.
`normalizeRunDocument` repairs incomplete data only inside the
current RunSaveVersion; it contains no historical version upgrade path. The browser storage
boundary owns the explicit historical chain through version 26.

Run Battle Undo does not add another authority to `RunDocument`. The browser-owned resumable
match snapshot keeps one checkpoint from immediately before the latest player move, including the
bounded Run economy/runtime slice needed to reverse move-owned casualty, Reservist, and Pawn
cash-out effects. Undo restores that slice through the normal active-Run write and deducts one gold;
the checkpoint exists only alongside the device-local live board and is replaced by the next move
or cleared by Battle replacement (ADR-0394).

The same resumable match snapshot banks an untimed Battle's elapsed duration without persisting its
live wall-clock anchor. Version 1 snapshots migrate once to version 2 with a zero bank; current
snapshots resume the bank only after the painted Battle activates, so loading and reload gaps never
become displayed play time (ADR-0451).

Per-user scoping means each user has their own `id` namespace — two users can
both have a level `my-level` without colliding, and neither can read or
overwrite the other's. Writes upsert and bump a `revision`.

Per [ADR-0193](adr/0193-runs-are-war-driven-account-persisted-and-share-the-skirmish-shell.md),
anonymous Run progress remains browser-local while a signed-in account owns one
compare-and-swap protected `active_runs` document. Per
[ADR-0230](adr/0230-run-shops-separate-buying-army-inspection-and-selling.md),
that document also owns each unit's stable per-piece-type number and the current
Sectio's entry snapshot. Sectio Adlectio, Alienatio, and lipsanon choices save normally;
**Reset Sectio** restores the snapshot while retaining the exact offers already
dealt for that visit. Ataraxia unlocks are separate monotonic progression because
finishing or abandoning deletes the active Run document; the browser copy and
account `run_progression` row merge by their greatest completed tier.

Per
[ADR-0231](adr/0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md),
lipsanon history is not derived from the one mutable active Run document. Each
pick and each Battle victory while holding a lipsanon is recorded as an
owner-scoped event with a deterministic event id. The composite primary key
makes retries idempotent. Enchiridion reads server aggregates and merges only
the browser events that have not yet been acknowledged; signed-out play keeps
the same event shape in local storage until an authenticated sync is possible.

The global `prop_seats/default` document is also compare-and-swap protected.
Its admin PUT must send `expectedRevision`: `null` creates only when the row is
absent, while an integer must match the revision returned by GET or the write
returns `409 prop_seats_revision_conflict` with `currentRevision`. PropSeatLab
keeps the startup revision and advances it only from a successful save response,
so sequential edits cannot silently overwrite a newer document.

Per
[ADR-0158](adr/0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md),
the remembered pre-drawn selection persists one exact immutable raster-version
identity and either one exact matching depth-aware occlusion-mask version or an
explicit no-mask state. Per
[ADR-0165](adr/0165-ai-artwork-separates-sources-attempts-and-background-mode.md),
the Level separately persists `legacy` or `ai` background mode. These are
durable Postgres-owned domain identities and content fields, not candidate ids,
blob hashes, mutable media-slot pointers, preview URLs, browser-local keys,
generated filenames, or picker state. Registration, rasterizer parameters,
parent hashes, geometry revision/hash, depth convention, and generator versions
belong to immutable artifact lineage; runtime does not replay them from Level
data. The raster version also owns frame dimensions and world bounds. A Level
projection may duplicate those values for self-contained rendering only when
the backend validates an exact match; they are not independent authoring knobs.
Per
[ADR-0179](adr/0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md),
a newly fitted selection is a schema-version-3 surface that also embeds the
exact canonical compatibility-named cyan move-highlight profile and digest
bound to its warped background and cover-independent geometry. Per
[ADR-0185](adr/0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md),
that snapshot is the cell-visual footprint for every square-local highlight,
not only cyan move paint. It never supplies logical hit, selection, movement,
pathfinding, occupancy, zone, placement, grid, fence, or solver geometry. The
Level content is a snapshot, not a pointer to mutable attempt state. Historical
schema-version-2 surfaces remain readable and mean the full canonical diamond
on every cell.

Per
[ADR-0166](adr/0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md),
a Generation Reference is separate from the remembered runtime selection.
Creating it captures the canonical saved Level through its saved frame and
active mode, stores immutable PNG bytes, and records the mode, exact selected
AI raster when applicable, canonical revision, geometry and semantic
identities, dimensions, bounds, hashes, and attribution. It is the non-settable
full-resolution image given to the model.

Per
[ADR-0168](adr/0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md),
the manual Generation Reference handoff and the deterministic Board Art slot
are separate persistence transitions. **Copy generation reference** reads the
exact `kind='source'` bytes without writing. **Paste AI-painted board**, direct
`Ctrl+V`, and **Choose PNG file instead** stage one exact PNG as a browser-local
preview. The explicit raw-source commit stores those unchanged bytes and hash as
an immutable `kind='raw'` Raw Pipeline Source with its Generation Reference,
canonical semantic request, request hash, and actor/time provenance. An
explicit editor-mounted preexisting Codex result may enter through the same
named raw-source import. Neither path makes the application claim the external
conversation's model, prompt, or parameters.

Each writable `predrawn_generation_attempts` row then references one exact
content-complete Raw Pipeline Source version and hash as its pre-modification
input. It records the compatible canonical geometry and processing context but
has no waiting-for-generated-artwork state and no second raw output slot. Its
nullable warped and internal `occlusion-ready` stage references may each hold
one current immutable result and are filled only in order through compare-and-swap
stage transactions. Per
[ADR-0175](adr/0175-rejected-warp-retries-stay-in-the-same-pipeline-slot.md),
an unpublished, unselected warp with no attached occlusion may be explicitly
discarded from that same slot: one fenced transaction archives the immutable
version, clears the exact warp pointer, advances the slot's processing
revision, and leaves the Raw Pipeline Source attached. Interrupted-create
retries still return the same in-flight result, while the next post-discard
generation receives a new stable stage identity. Clipboard contents, selected file
handles, uncommitted local previews, browser paste state, and temporary object
URLs are never durable authority.

Per
[ADR-0181](adr/0181-occlusion-mask-retries-stay-in-the-same-pipeline-slot.md),
the owner-facing **Board with occlusion mask** may also be detached from its
slot under the exact attempt, working-document, version, and writer fences.
This preserves the current warp and cyan profile and advances the processing
revision. A matching working surface falls back to that warp without
`occlusionVersionId`; canonical content is never rewritten by the retry action.
The immutable mask row is archived only when canonical content does not still
reference it, otherwise it remains retained history while no longer occupying
the slot's current stage.

A post-warp attempt may also own one mutable latest
`predrawn-move-highlight-profile-v1` draft. Its JSON profile, canonical SHA-256,
and exact `move_highlight_profile_warped_version_id` are nullable only as one
all-or-none bundle, and the composite warped-version/document foreign key is
restrictive. The sparse map contains only exact playable-cell deviations from
the full diamond, using four contained, convex, non-degenerate integer points
in `cell-diamond-10000-v1`. The profile's historical name remains the
compatibility contract even though ADR-0185 makes its rendering role the shared
cell-visual footprint.

The profile endpoint,
`PUT /api/editor-documents/:documentId/generation-attempts/:attemptId/move-highlight-profile`,
requires the current writer credential and fencing generation, expected
attempt row revision, and expected current warped-version id. The transaction
locks the document and attempt, validates the retained semantic board, playable
cells, warp lineage, v2 environment-geometry digest, canonical profile and
hash, then advances `row_revision` and records the attributed
`move-highlight-profile-updated` event. An exact replay is idempotent; stale
revision or warp identity conflicts. Discarding the warp clears all three
profile fields in the same transaction. The browser's working handles and
Undo/Redo history are never durable authority.

Creating a new occlusion stage requires that exact attempt and warp to carry a
valid saved profile; an explicitly saved empty sparse map represents approval of
full diamonds everywhere. The profile does not become a background version or
Blob and is not copied into mask bytes or mask lineage. ADR-0185 changes no
Level field, endpoint, event action, profile schema, digest, database column, or
constraint, so it requires no content or database migration.

A warped child's immutable operation metadata owns the canonical serialized
registration and the matching deterministic algorithm identity. A version-5
registration may contain at most 1,024 sparse row-major interior
shared-grid-node overrides and must pair with `grid-warp-v2` /
`shared-predrawn-rasterizer-v2`; version-1 through version-4 registrations pair
with the historical v1 identifiers. The normal 64 KiB operation limit applies.
Canonicalization, bounds, and non-fold validation occur before allocation, and
the exact operation participates in idempotency and lineage hashing.

A background-version row with `kind='raw'` is a Raw Pipeline Source.
Generation References, Raw Pipeline Sources, and deterministic outputs share
`predrawn_background_versions`, but no row is reclassified or aliased to
another kind. Zero, one, or many creation slots may reference one exact Raw
Pipeline Source in place. That relationship allocates no background-version or
Blob, does not mutate an existing slot, and is deterministic pipeline input
rather than model-input provenance. Warped and `kind='occlusion'` rows cannot be
creation-slot inputs.

Per
[ADR-0169](adr/0169-historical-raw-contracts-bind-only-from-saved-level-proof.md),
a historical raw missing only the later `coordinateBasis` and `viewingPane`
operation fields remains immutable. Fenced processing-attempt creation may
insert one external `predrawn_background_raw_contract_bindings` row only after
the backend locks the exact saved canonical Level and proves matching
frame/world bounds, Blob/content hash, dimensions, original
operation/provenance hashes, historical lineage, and v1 environment geometry.
The same transaction establishes ADR-0163's matching v1-to-v2 geometry binding
when required and creates the slot only if both bindings succeed.

The external row supplies the effective historical coordinate contract without
rewriting `predrawn_background_versions`. A repeated identical mapping is
idempotent; a contradictory stored field or mapping is a conflict. New raws
must carry the complete contract directly. Reads, picker opens, observers,
autosave, Save, Publish, and unrelated derivatives never insert a raw-contract
binding.

`Set` writes an exact AI selection only to the current fenced Level working copy
through its ordinary compare-and-swap/autosave mutation. For a newly fitted
warp, the schema-version-3 surface contains a canonical deep snapshot of the
attempt's exact current profile and digest; later profile saves cannot mutate
that Level. The separate Legacy/AI control writes the background mode through
the same boundary. Private Save or official Review and publish/Publish is the
separate canonical transaction. Deriving, previewing, setting a version, or
changing working mode cannot mutate canonical content or a global accepted
pointer. Canonical Save/Publish validates ready or published exact versions and
their immutable Blob objects when mode is AI, plus any schema-version-3 profile
against the selected warp, playable cells, v2 geometry, and stored digest.
Private Save atomically pins the remembered selection with the private
canonical Level while keeping ready versions owner/admin-scoped. Official Review
and publish/Publish atomically marks the exact active AI rows published with the
official Level change. Explicit user-map Publish performs the same exact-version
publication in the transaction that writes the owner-free `public_maps`
snapshot.

Only explicitly published selections become public. Generation References, Raw
Pipeline Sources, and unused creation-slot inputs do not become public merely
because a Level is published.
Failure changes neither database state, and no transaction moves or rewrites
Blob bytes. Working, canonical, creation-slot, and lineage references pin
Generation Reference, version, and Blob objects against deletion. In AI mode,
missing or mismatched lineage is a validation failure, not permission to fall
back to Legacy, a runtime warp, derived sprite mask, mutable slot or attempt
profile, or ordinary composed environment. A stale selection may remain in an
owner working draft under ADR-0164, but it gains no canonical or derivation
authority.

Per
[ADR-0172](adr/0172-archiving-a-board-art-slot-forgets-only-dormant-legacy-selection.md),
**Archive slot** may remove a matching dormant selection from both the working
and canonical Levels when each match is in Legacy mode. The writer fence,
expected working-document revision, slot revision, both current Level records,
and affected lineage are locked and revalidated with the archive. A matching
AI-mode use or published output rejects the entire transaction. Successful
working and canonical changes advance their respective revisions and the
response carries the authoritative document, canonical Level, and workspace
revision for immediate client adoption. Archive retains the immutable versions,
Blob bytes, lineage, and quota accounting.

Per
[ADR-0163](adr/0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md),
new background-version operations record only
`predrawn-environment-geometry-v2`, whose canonical input excludes live ground
cover. Migration 30 does not rewrite immutable v1 operation or provenance data.
Instead, `predrawn_background_geometry_bindings` records one immutable mapping
from a version's exact stored v1 schema and digest to its normalized v2 schema
and digest, together with document and actor/time attribution. Every relevant
legacy ancestor is bound atomically, and a v2 child cannot extend an unbound v1
lineage.

The backend may create that binding only while it already owns an authorized
write transaction and can prove the stored v1 digest from a server-held Level:
the pre-mutation Level on the first fenced autosave, the current Level during
direct derivative creation, or a Save/Publish fallback. GET, list, content
fetch, document load, and observer paths never insert bindings. V1 exists only
to validate stored legacy rows; all new operation input must be v2.

Per
[ADR-0164](adr/0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md),
the pre-mutation proof establishes only the old v1-to-v2 normalization; it does
not validate the incoming autosave body. Subject to ordinary document, fence,
and compare-and-swap checks, autosave preserves that body even when changed
baked geometry makes its selected art stale. Recovery upload and restore retain
the same owner draft rather than discarding it for an art mismatch. The AI
Artwork controls expose the stale remembered selection and disable AI
activation, Set, and derivative actions. Per ADR-0165, dormant stale art does
not block canonical Save or Generation Reference capture while background mode
is Legacy. Save and Publish in AI mode still compare the current Level with the
selected lineage and fail closed without changing canonical content.

## Level editor working copies and sessions

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
unknown or deleted ID still returns not found. It also does not create an owner page session or
presence and cannot mutate the shared working copy or restore history (ADR-0304).

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

Per [ADR-0304](adr/0304-level-editor-documents-are-live-shared-working-copies.md), each editor
document has one durable unpublished working copy and every ordinary authenticated owner page
targets it as an editor. Opening a second tab never creates a second document, follower branch, or
authority prompt.

Each page still registers an attributable session with authenticated display name/email, opaque
page id, one-way device relationship, best-effort client label, and a separate high-entropy
credential whose cryptographic hash is stored by the server. The public id and device relation are
not authorization. The credential must accompany mutations and cannot be reused after that page
session closes. Historical `active`, `waiting`, `displaced`, `expired`, lease, and fencing
columns remain deployment-era metadata; they do not grant or revoke an owner's ability to edit the
shared copy.

Automated visual verification remains the explicit `observing` exception from
[ADR-0160](adr/0160-automated-editor-verification-is-observation-only.md). An observing session may
read and close itself but cannot autosave, Save, Discard, delete, or restore history. Cross-owner
administrator review through an exact opaque document URL is likewise read-only and creates no
owner page session.

Owner pages poll the acknowledged document once per second while mounted. When a newer revision
arrives and the page has no pending local edit, the page mounts it directly. When local work is
pending, the page structurally merges that local candidate with the newer working copy, mounts the
merged result, and continues ordinary autosave. Heartbeat remains coarse attribution/diagnostic
metadata only; it is not a lock.

Autosave submits:

- the last acknowledged server `revision`;
- `base_level`, the exact Level acknowledged at that revision; and
- `level`, the page's current candidate.

The backend locks the working-copy row and writes one new revision. If the submitted revision is
stale, it performs the canonical three-way merge of base, local, and current server Levels.
Independent object fields, keyed arrays, and board entities survive together. If both sides changed
the same scalar field, the later server arrival wins that field. Board state is merged through the
canonical editor-board projection and regenerated from that projection so `boardCode` and gameplay
`layers` cannot diverge. A submitted revision ahead of the server is rejected.

Page close, browser/process termination, stale heartbeat, and expiry of legacy lease metadata never
create a recovery record and never block a valid owner page from editing. Start-editing, Follow
latest, Take over, displaced-client upload, server-recovery Restore/Delete, and recovery-attention
routes are retired. Existing rows in `editor_document_recoveries` are inert historical data pending
a separately coordinated shared-database migration; no application endpoint exposes or adds them.

Browser storage is a bounded crash/offline retry buffer for this same document, scoped by account,
opaque document id, and page id. It is not another document identity, a normal branch, or an
ever-growing owner cleanup surface. A current-page crash candidate may be retried only into the same
working copy; it never Save/publishes itself.

`saved_revision` records the working-copy revision known to match the canonical workspace Level.
`baseline_hash` records the deterministic PostgreSQL `md5(level_jsonb::text)` identity of that
canonical Level. Loading or resolving an existing working copy never changes its body or revision.
When canonical content changed elsewhere, the working copy remains intact and reports
`baseline_conflict: true`; Save rejects rather than overwriting the external canonical change.
Discard deliberately adopts the current canonical Level and resets that baseline. A retained
historical baseline restored after its exact saved body was pruned is intentionally conservative:
if its old-format hash differs from the current canonical hash, the same conflict and Discard rules
apply rather than silently blessing the current canonical Level.

Each acknowledged working-copy mutation records the complete resulting Level in
`level_working_copy_revisions` inside the same transaction. Retention keeps the newest 200
revisions, the newest checkpoint from each UTC day, and explicit lifecycle boundaries. History is
collapsed and not fetched by default. Expanding it loads owner-only body-free summaries. Restore
requires the current document revision and a valid owner page session, applies the retained body as
a new private revision, and never promotes it to canonical content.

- `PUT /api/editor-documents/:documentId` updates the one shared working copy. It requires a valid
  owner page credential, current or stale acknowledged revision, `base_level`, and `level`;
  stale writes merge under the document lock.
- `GET /api/editor-documents/:documentId/revisions` lists retained body-free checkpoints for the
  owner.
- `POST /api/editor-documents/:documentId/revisions/restore` restores a retained body as a new
  private working-copy revision and never publishes.
- `POST /api/editor-documents/:documentId/save` transactionally promotes the working copy (or the
  exact Level supplied with the Save click) into the account campaign workspace, then advances both
  revision values together and returns the canonical workspace revision.
- `POST /api/editor-documents/:documentId/discard` transactionally replaces the working copy with
  the current canonical saved Level and advances both revision values together.
- `DELETE /api/editor-documents/:documentId` compare-and-swap deletes only a never-saved working
  copy. It rejects saved-baseline documents and never deletes canonical content.
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
domain-native Blob-index/range-streaming projection, refined by
[ADR-0200](adr/0200-bgm-is-private-storage-behind-app-owned-capability-routes.md):
the container is private, the public playlist contains only opaque app playback
routes, the anonymous route validates the current catalog and issues a
short-lived per-Blob read capability, and Azure serves the media bytes. BGM is
public game-content read under the standing anonymous-play rule; account
authentication is not its access boundary. See
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

New `kind='source'` Generation References, Raw Pipeline Sources, creation slots,
and every registered-raster or occlusion-mask child are
allocated by authenticated backend transactions. Clients never form an
identity from a Level id, hash, filename, storage path, label, or array
position. The backend records immutable generation provenance, exact raw-source
input, slot scope, typed deterministic parentage, and one-time output-stage
ownership before returning the new identity.
For a registered-raster child this includes the exact canonical registration,
its matched rasterizer version, and the output digest; the backend never
normalizes a v5 mesh into a v1 operation or substitutes a neighboring
registration.
Canonical level-list thumbnails are used only when the backend's Level
projection supplies an immutable derivative URL; a missing derivative has no
constructed stable-path or read-through fallback.

Migration groups each existing complete or partial raw-to-warp-to-occlusion
path into a first-class historical creation slot. Branches become separate
slots and may reference the same immutable historical stage rows without
copying bytes. Existing `kind=raw` rows project as Raw Pipeline Sources, not
Generation References. Because the original model input was not retained, the
source keeps `missing-historical-source` rather than inventing a Generation
Reference. Historical slots retain their exact artifact bytes, settable state,
hashes, and audit history. An exact content-complete, geometry-compatible
historical Raw Pipeline Source may be selected as a separate writable slot's
input by stored version/Blob reference. That slot begins at grid fitting and
does not repair, reclassify, copy, mutate, or claim new model-generation
provenance for the historical lineage. Every new writable slot requires one
real Raw Pipeline Source input.

For a historical raw lacking the later coordinate contract, selection means
eligible for the fenced ADR-0169 proof, not already repaired. Attempt creation
establishes the external raw-contract binding and, for a legacy v1 parent, the
exact ADR-0163 v2 binding from the same server-held saved Level proof. The
newly allocated deterministic child records the current contract in its own
immutable operation and provenance; allocation never copies missing fields
backward or rewrites its ancestors.

[ADR-0159](adr/0159-predrawn-background-authoring-storage-is-bounded.md) and
ADR-0165 bound permanent allocation to 256 background-version rows of every
kind, including Generation References, and 128 generation-attempt rows per
editor document, plus 1 GiB of distinct retained background-version Blob bytes
per owner. The byte check is serialized under owner-scoped database authority
in the same transaction that binds a new distinct hash. Before media parsing
can allocate its bounded body, the server also admits only the contracted
in-flight upload per document. Archived and published history remains in every
applicable count because those identities and bytes remain resolvable; client
UI cannot bypass or reinterpret the limits.

The SFX runtime profile is a separate typed document projection over live-media
recording slots. It owns labels/descriptions, sound-set gains, terrain
assignments, and arrival behavior, with a compare-and-swap revision on admin
Save. Its migration creates no default row: absence is decorative silence and
Studio-unavailable state, while localStorage is only a revision-bound unsaved
draft. See [ADR-0089](adr/0089-sfx-runtime-profile-is-db-authoritative.md).

What is **not** in Postgres (deliberate, see "Boundaries"): the `lobbies`
matchmaking map.

## Client authentication state

Per [ADR-0306](adr/0306-browser-authentication-has-one-session-owner.md), the browser has one
auth-session owner. `GET /api/auth/me` is transported only by `frontend/src/net/auth.ts`; the
application-level `frontend/src/net/authSession.ts` owns its probe, retry, and the shared
`checking | unavailable | authenticated | anonymous` state. A successful contract-valid response
is the only authority for authenticated or anonymous. Backend restart responses, malformed bodies,
timeouts, and network failures are unavailable and may not produce a Sign In affordance.

Screens consume this snapshot rather than fetching or caching identity. Any account-gated
operation that consumes an authoritative 401 as session state reports it to the owner, while
domain stores retain only their own connection state. In particular, the Level Editor decides
recovery presentation from shared
unavailability but owns no auth retry policy. The auth-session source guard makes parallel probes
and screen-local identity caches a failing repository check.

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
Exact lipsanon-reference unfurls likewise remain public and resolve the canonical
lipsanon name/effect plus its installed immutable live icon (ADR-0261).

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

Per
[ADR-0174](adr/0174-database-migrations-are-append-only-checksummed-and-explicit.md)
and
[ADR-0186](adr/0186-legacy-migration-36-is-an-explicit-sparse-history-bridge.md),
the inline migration registry is a contiguous append-only history. An applied
migration's version, name, and SQL are immutable. CI compares the current
registry with the branch base and rejects an edited, renamed, removed,
reordered, duplicated, or gapped historical entry.

`schema_migrations` stores the version, name, and normalized
version/name/SQL SHA-256 for every newly applied migration. Migration 37 adds
that identity contract. The former deployed ledger contains numeric-only rows
1–27 and 36; the pre-sealing planner recognizes only numeric-only migration 36
as that exact historical sparse row, applies 28–35, and then seals the complete
1–36 history against the pinned canonical registry. Migration 38 makes the
identity columns non-null, closing the one-time bridge at the database
boundary. Runtime planning rejects a checksum/name mismatch, partial identity,
an unexpected version, every other non-prefix history, and any identified
version 36 after a gap; it never treats altered contents under a recorded
number as pending work.

The backend always connects to the configured database, but ordinary startup
and explicit schema mutation are separate:

| Value | Behavior | Intended use |
| --- | --- | --- |
| `check` | Default. Read-only verification of complete checksummed history, required runtime relations, and required schema topology. Missing migrations or topology return `503 schema_migration_required`; changed or malformed recorded migration identity returns `503 schema_migration_history_invalid`. | Every normal local backend start and any process which must not apply DDL. |
| `auto` | Plans from immutable history, applies only missing migrations transactionally under the Postgres advisory lock, repairs allowed idempotent schema contracts, seals eligible legacy history, and verifies postconditions before serving persistence endpoints. | Kubernetes deployment and disposable smoke/test-slot backends which explicitly own schema rollout. |
| `off` | Skips schema readiness entirely; queries run against whatever schema exists and fail naturally if it is incompatible. | Debugging unusual DB states. |

Normal local backend startup always defaults to `check`. To advance the shared
development database, run the dedicated one-shot command:

```sh
cd backend
npm run schema:migrate
```

It resolves the same shared development Postgres identity as the Vite-launched
backend when `DATABASE_URL` is absent, applies and verifies schema only, prints
the sanitized target mode/host/database/user before any DDL, and exits without
opening an HTTP listener or seeding content. Its result names the exact
applied/skipped/pending migration versions, each completed relation/contract
repair step, and legacy identity rows sealed. If a later migration, repair, or postcondition
fails after earlier commits, the failure names those completed mutations and
the exact failing migration or verification phase. Passwords are never printed.
The Helm deployment sets
`SCHEMA_MIGRATIONS=auto` explicitly; disposable smoke and test-slot processes do
the same.

Readiness treats the migration ledger as history, not proof of operational
schema. It also inspects required relations and semantic postconditions. For
the ledger itself, migration 38's required boundary is two `text NOT NULL`
identity columns and exactly one local, validated
`schema_migrations_identity_check` with the canonical name-length and SHA-256
definition; nullable columns, a dropped/weakened/unvalidated check, or competing
identity checks keep the database unready. For
working-copy revisions, the required state is the complete
`level_working_copy_revision_reasons` catalog, no stale reason `CHECK`, and
exactly one validated `level_working_copy_revisions.reason` foreign key to that
catalog with restricted update/delete behavior. `auto` may replay the
append-only idempotent repair under the lock; `check` only reports the mismatch.
Readiness also requires every saved working copy to have a baseline. Auto repair
uses migration 61 for old Level/embedded Run bodies and exact saved-body
reconstruction, then migration 62 for a pruned saved body whose later retained
revision still records the same saved-revision baseline; absent evidence remains
an unrepaired hard failure.

For attempt-owned cyan profiles, migrations 40 and 41 together own the required
state. Migration 40 adds the exact three nullable typed profile columns, the
all-null-or-all-populated check, the validated restrictive composite foreign
key from the profile's warped-version/document identity to
`predrawn_background_versions`, and the exact generation-attempt event action
set including `move-highlight-profile-updated`. Its intended check-constraint
name exceeded PostgreSQL's 63-byte identifier limit, so PostgreSQL stored a
truncated catalog name.

The already-applied migration 40 remains immutable. Append-only migration 41
drops that truncated check and installs the same definition under the stable
bounded identifier
`predrawn_generation_attempts_move_highlight_bundle_check`. The populated
branch explicitly requires all three fields non-null so PostgreSQL's nullable
`CHECK` semantics cannot admit a partial bundle. Readiness requires that exact
post-41 name and definition and rejects missing, weakened, renamed, duplicated,
or competing profile topology.

Append-only migration 42 registers
`generation-attempt-occlusion-discard` as the distinct retained working-copy
revision reason used when a mask retry falls the working Level back to its
warped parent. It also extends the closed background-version event action
contract with `attempt-detached`, so a canonical-retained immutable mask has an
attributable audit event even though its media row is not archived. Migration
42 is a new identity; migrations 37, 40, and 41 remain byte-for-byte immutable.

Per
[ADR-0187](adr/0187-required-schema-repair-installs-final-state.md),
append-only migration 43 is the complete current-state repair for
`predrawn_generation_attempts` and
`predrawn_generation_attempt_events`. Missing generation-attempt relations and
drifted retry or move-highlight contracts repair through migration 43's final
topology. Readiness does not replay transitional migrations 31–41, whose
superseded intermediate constraints can reject valid retained
`pipeline-source` attempts or `move-highlight-profile-updated` events. Normal
upgrade execution still applies every historical migration in order.

Startup output is derived from the completed plan. It names each migration that
actually committed, each already-applied migration skipped, and anything still
pending. Merely entering `auto` mode is never reported as “migrations applied.”

## Failure behavior

HTML and deploy-owned executable chunks can still be served during a database
outage, and `/health` remains a process-only liveness probe. The playable app is
intentionally database-dependent: `/ready`, the complete `prop_seats/default`
document, the live asset catalog, stable
`/assets/<slot>` routes, and catalog-backed thumbnails fail closed when Postgres,
the required critical catalog, or Blob Storage is unavailable. Persistence
endpoints likewise return **503** with a logged error when the database is
unavailable or behind the required schema. A missing migration, relation, or
required topology is reported as `schema_migration_required`; changed,
unexpected, partial, or otherwise malformed recorded migration identity is
reported as `schema_migration_history_invalid`. In `auto` mode,
`ensureDbReady()` retries migrations on the next request (self-healing after a
transient outage). Startup never blocks on the DB, but Kubernetes readiness
keeps an unready process out of service.

A PostgreSQL constraint failure during a Board Art storage mutation is not a
storage outage. The backend reports
`background_version_schema_contract_violation` with the operation, PostgreSQL
error code, table, and constraint identity, while reserving
`background_version_store_unavailable` for actual unclassified store failures.

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

`npm run schema:check-history` extracts the migration registry and compares it
with the pull request base. CI fails closed if the base cannot be inspected or
if an existing migration changed or disappeared; new migrations may only append
to the contiguous sequence.

The backend smoke-test (`backend/smoke-test.js`, run by `npm test`) exercises the
Postgres-backed endpoints. It uses `DATABASE_URL` if provided, otherwise
self-provisions a throwaway local Postgres from system binaries (present on the
GitHub-hosted runners), so CI needs no database service container or workflow
change. Hosts without Postgres binaries (e.g. the musl session pod) must supply
`DATABASE_URL` or rely on the test slot.

The smoke database begins with the exact former ledger: immutable migrations
1–27 and 36 have executed and only those versions are recorded in the old
numeric-only format. The production auto-mode runner must skip 1–27 and 36,
apply 28–35 and 37–56, seal the completed historical rows 1–36, enforce
non-null identity, report that exact plan, and pass its live relation and
constraint-topology postconditions. The same upgraded database then receives
the real authenticated generation-attempt archive request; the test verifies
the archived slot and its retained `generation-attempt-archive` working-copy
revision. Separate retained-data scenarios prove migration 43 can repair around
an existing reusable pipeline-source attempt and an existing
`move-highlight-profile-updated` event. A second backend starts in check mode
against the upgraded database and must report no applied or pending migration.
The database is throwaway/reset, so this remains isolated from production
content.

## Boundaries

- **Game art/assets** are live storage-backed. The retired `design_assets`
  `bytea` table and its Git-seeded fallback routes remain absent; the replacement
  is the content-addressed live-media substrate governed by ADR-0085.
- **`lobbies`** remain process-memory matchmaking state. They are transient room
  coordination, not authored game content.
