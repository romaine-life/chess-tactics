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
| `run_relic_stat_events` | idempotent owner-scoped relic pick and Battle-win facts | `/api/run-relic-statistics`, `/api/run-relic-stat-events` | sign-in required; anonymous and unsynced facts remain browser-local |
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
transaction (ADR-0340).

Active Run format 12 starts in the normal `shop` phase with Shop kind `opening`,
the permanent King plus two starting Pawns, a seeded three-card deal, and an
8-gold budget. The opening cards have three distinct values sampled from 1–8.
Buying stays in that same Shop transaction; its purchased state, Army and Sell
views, Reset Shop, and explicit Continue reuse the post-Battle Shop model. The
opening kind carries zero victory gold and no Loot or paid-relic offers. Opening
offers roll Legatine, Concinnous, and — under Ataraxia I — Pestiferous through the
same draw and affected pricing as any later Shop, at every core value, so a
surcharge may price an opening card past the 8-gold budget. At least one opening
offer is always affordable: a deal in which none is repairs its cheapest card to
standard (ADR-0344). Each dealt card may be purchased once while sufficient gold remains;
Continue permits zero card purchases and enters Deployment at Battle index 0
(ADR-0347). Deployment remains durable when it owns a player choice; when the
formation has no meaningful choice, Continue prepares it and commits directly
to Battle without exposing an intermediate destination (ADR-0346). Format 12
names the transaction `cardOffers`,
`purchasedCardOfferIds`, and `buyCard`; current Shop documents using the former
gameplay noun are unsupported. The retired `draft` phase, `draftOffers`, and
`chosenDraftId` are absent and rejected on current writes. Hydrating an
unsupported account Run retains the signed-in account and its CAS revision while
treating that retired document as unavailable; a fresh current-format Run can
therefore replace it without adapting or replaying the retired transaction. See
[ADR-0321](adr/0321-run-opening-is-the-normal-shop-and-draft-is-retired.md) and
[ADR-0322](adr/0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md),
as superseded for Shop purchase cardinality by
[ADR-0323](adr/0323-run-shops-allow-every-affordable-card-purchase.md) and for
opening purchase optionality by
[ADR-0347](adr/0347-opening-shop-purchases-are-optional.md). Format 12
also stores the selected Ataraxia tier and each persisted affected Shop offer.
Pestiferous offers store their public Cacochymic piece index under the current
format's non-presentational `plaguedPieceIndex` storage identifier;
Concinnous offers store their concealed Eutactic target index; Legatine and
Hieratic offers deliberately store no target index because purchase chooses the
unit. Owned Concinnous, Legatine and Hieratic cards store the exact affected unit
id, while owned Pestiferous cards store the current Cacochymic unit id under
`cacochymicUnitId` and the exact loss history. Format 12 adds the Hieratic
qualifier and its granted Agminate ability. Format 14 makes a stored value and
its player-facing name one word: abilities persist as `adlected`, `eutactic` and
`agminate`, the unit modifier as `cacochymic`, and the card type as `legatine`,
with the fields named after the retired words renamed to match. Format 14
discards in-progress Runs rather than translating them, and the server validator
accepts only the new words (ADR-0309, ADR-0310, ADR-0311, ADR-0325, ADR-0327,
ADR-0328, ADR-0341, ADR-0345, ADR-0369).
Format 3 stores each army unit's role-specific historical name.
Format-1 unnamed documents and the provisional format-2 generated-name documents
are deterministically normalized to format 3 from the Run seed and each piece
type's acquisition order before the next save. Once a document is format 3, a
valid stored name is authoritative so the future name editor can change it
without normalization undoing the player's choice. See
[ADR-0228](adr/0228-run-unit-names-are-role-specific-historical-identities.md).

Per-user scoping means each user has their own `id` namespace — two users can
both have a level `my-level` without colliding, and neither can read or
overwrite the other's. Writes upsert and bump a `revision`.

Per [ADR-0193](adr/0193-runs-are-war-driven-account-persisted-and-share-the-skirmish-shell.md),
anonymous Run progress remains browser-local while a signed-in account owns one
compare-and-swap protected `active_runs` document. Per
[ADR-0230](adr/0230-run-shops-separate-buying-army-inspection-and-selling.md),
that document also owns each unit's stable per-piece-type number and the current
shop's entry snapshot. Shop purchases, sales, and relic choices save normally;
**Reset Shop** restores the snapshot while retaining the exact offers already
dealt for that visit. Ataraxia unlocks are separate monotonic progression because
finishing or abandoning deletes the active Run document; the browser copy and
account `run_progression` row merge by their greatest completed tier.

Per
[ADR-0231](adr/0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md),
relic history is not derived from the one mutable active Run document. Each
pick and each Battle victory while holding a relic is recorded as an
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
Discard deliberately adopts the current canonical Level and resets that baseline.

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
Exact relic-reference unfurls likewise remain public and resolve the canonical
relic name/effect plus its installed immutable live icon (ADR-0261).

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
apply 28–35 and 37–45, seal the completed historical rows 1–36, enforce
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
