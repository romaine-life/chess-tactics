---
status: "accepted; mandatory test-slot cutover gate superseded by ADR-0082"
date: 2026-07-11
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0005
  - ADR-0007
  - ADR-0009
  - ADR-0016
  - ADR-0019
  - ADR-0026
  - ADR-0027
  - ADR-0030
  - ADR-0032
  - ADR-0034
  - ADR-0035
  - ADR-0037
  - ADR-0038
  - ADR-0047
  - ADR-0054
  - ADR-0057
  - ADR-0060
  - ADR-0061
  - ADR-0063-section-dividers
  - ADR-0066
  - ADR-0073
---

> **The mandatory production-seeded test-slot cutover gate is superseded by
> [ADR-0082](0082-runtime-asset-cutover-uses-one-live-data-plane.md)
> (2026-07-12).** The existing app database and media container are the one live
> data authority; cutover and owner verification use unserved candidate pods
> against that authority. ADR-0081's storage, delivery, acceptance, and
> deletion-complete migration decisions stand.

# ADR-0081: Runtime assets are live storage-backed content behind stable semantic slots

## Context

The application still ships most images, audio, fonts, review media, and
generation inputs from Git. Vite copies `frontend/public` into the deployment;
compiled TypeScript, JSON, and CSS name those paths; server thumbnails read the
same files from disk. Changing accepted art therefore requires a commit and
deploy, and rejected candidates and source binaries accumulate in repository
history.

A generic `design_assets` database store briefly existed in June 2026 but never
became authoritative: it boot-seeded from Git, kept a baked fallback, stored PNG
bytes as Postgres `bytea`, and was removed before the UI consumed it. ADR-0073
later established the correct live-storage pattern for board units—Postgres
pointers plus content-addressed private Blob bytes—but deliberately scoped that
solution to six piece families. The persistence contract and CI continued to
require Git-backed media everywhere else.

The 2026-07-11 Water-edge review exposed the consequence. A Git manifest was
mistaken for promotion even though no database pointer, backend asset record, or
blob-backed runtime URL existed. The repository's active contracts had made that
mistake repeatable.

## Decision

### Live storage owns media

Every runtime, review, candidate, and source-media binary is live-storage-backed.
Git owns code, deterministic geometry, schemas, prompts, and text provenance; it
does not own accepted media bytes or accepted pointers.

Postgres owns:

- stable semantic asset slots;
- candidate/version identities and typed metadata;
- active pointers, accepted status, and atomic swaps;
- dimensions, media type, content hash, native-size and no-resampling evidence;
- owner-review evidence, optimistic revisions, and audit history.

Private Blob Storage owns immutable content-addressed bytes. Postgres does not
store production media as `bytea`.

### One ownership boundary, typed domain projections

The repository has one backend-owned media boundary rather than one untyped
mega-manifest. The generic live-media catalog supplies the shared
content-addressed candidate, acceptance, revision, and audit primitive for
domains that previously depended on repository files. Existing domain-native
stores that already satisfy the boundary do not have to be rewritten merely to
share a table or container.

- Unit Art retains its existing Postgres pointers, private content-addressed
  Blob container, palette/direction completeness, and stable piece identities.
- Terrain retains explicit top, side, and animation roles, projection geometry,
  logical terrain, and per-face rules.
- UI kit media retains nine-slice and state geometry.
- Props, wall art, backgrounds, portraits, SFX, fonts, and OG media retain their
  domain metadata and availability policies.
- BGM may retain its existing Blob-index/range-streaming projection, because it
  is already backend-resolved and not Git-backed.

Stable game/content data stores semantic slot ids, never candidate UUIDs, blob
hashes, repository paths, or accepted URLs.

### The backend owns resolution and delivery

The backend publicly resolves stable `/assets/<semantic-slot>` requests through
the current DB pointer and serves or redirects to an immutable same-origin
content-hash route. CSS, fonts, browser rendering, Studio, gameplay, client image
bakes, OG cards, and server thumbnails use that same resolution contract.
Executable build chunks use the disjoint `/app-code/` namespace.

No runtime path may read `frontend/public`, a packaged asset directory, or a
committed fallback. Missing or incomplete availability-critical catalog state is
an explicit startup/render failure. A domain may fail soft only when an existing
decision explicitly makes that media decorative; fail-soft means omission, not
selecting committed prior art.

### Promotion is a backend transaction

Review instruments write review evidence to live storage. Accepting an asset is
an admin-gated transaction that validates the domain's completeness, provenance,
native-pixel contract, and owner proof, then swaps the stable accepted pointer and
archives the previous version atomically.

Local browser storage may preserve an editing draft, but it is never promotion.
A Git manifest flag, filename, copied output, contact sheet, or local review
selection is not production registration.

### Tools upload; they do not publish into Git

Generators and editors may use local temporary files while a run is active, but
their durable output is an uploaded candidate/version plus live provenance. They
must not write accepted or review media into `frontend/public`, `docs/art`, a
generated source module, or another committed media directory.

Source and rejected-candidate binaries are private storage records. Text prompts,
schemas, deterministic masks, and algorithms may remain in Git when they do not
contain material pixels.

### Tests use the live contract

Ephemeral test slots seed isolated Postgres and local object storage from the
live catalog, lazily fetching immutable objects as needed. Unit tests inject small
synthetic catalog records and generated fixture bytes. Production media is not a
test fixture and never returns to Git to make tests convenient.

### Migration is deletion-complete

The cutover removes, end to end:

- tracked runtime/review/source media;
- static accepted catalogs and baked fallbacks;
- generators that target committed runtime directories;
- filesystem asset readers in browser/server tooling;
- Git-presence and Git-hash promotion guards;
- comments and contracts that call media code-owned.

They are replaced by catalog-schema, domain-completeness, provenance, acceptance,
and no-committed-media guards. A one-time importer may verify and upload the old
inventory, but it has no review or acceptance input, is deleted after cutover,
and is never a runtime seed path. Storage migration does not manufacture visual
acceptance: every existing runtime asset is activated as an explicit
`legacy-bridge`, never marked accepted or production-eligible by the importer,
regardless of prior files or metadata. Its pointer is called `active`, not
`accepted`. A later native candidate replaces and archives that bridge through
the normal owner-operated acceptance transaction.

## Scope of supersession

This ADR supersedes only storage, source-of-truth, fallback, and repo-write clauses
in the listed decisions. Their visual direction, geometry, composition, semantic
identity, interaction, and native-pixel rules remain authoritative. ADR-0060's
public-read/admin-write rule remains; only its asset-catalog no-DB premise is
superseded. ADR-0073's Unit Art domain rules and existing live-storage
implementation remain a conforming typed projection of this ownership boundary.

Pending terrain decisions that publish into static `tileAssets` or eight copied
Water files are ineligible for acceptance under this decision. Their per-face,
socket, and logical-terrain rules may stand after their storage clauses are
rewritten against live semantic slots.

## Consequences

- Art can be reviewed and promoted from the running application without a Git
  or deploy loop.
- Browser and server rendering cannot drift between packaged files and live art.
- Candidate history and large binaries leave repository history.
- A missing backend catalog is visible instead of being hidden by old pixels.
- CSS/font/static-shell consumers require backend-resolved stable slots.
- The initial migration is large because the prior Git boundary covered every
  visual system; partial per-family exceptions are no longer acceptable.

## Alternatives rejected

### Restore the retired `design_assets` `bytea` table

Rejected. It was Git-seeded, fallback-driven, non-content-addressed, and lacked a
real acceptance model. Storing hundreds of megabytes of media in Postgres also
mixes document and object-storage workloads.

### Keep Git for fixed assets and use live storage only for tunable families

Rejected. That is the exception model that caused the recurrence. Whether an
asset is currently being tuned does not change who owns its accepted pointer.

### Migrate only the Water edge

Rejected. A Water-only table would be a bespoke parallel, leave the contradictory
global policy intact, and guarantee the same problem in the next asset family.
