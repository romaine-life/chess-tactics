# Runtime Asset Contract

This is the living storage and delivery contract derived from
[ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md). It applies to
runtime, review, candidate, and source-media binaries: images, audio, fonts,
atlases, animation sheets, and other media consumed or judged by the application.

## Ownership

- Postgres owns stable semantic slots, candidate/version metadata, active
  pointers, accepted status, provenance, revisions, native-size evidence, and
  audit events.
- Private Blob Storage owns immutable content-addressed media bytes.
- The backend owns public reads and admin-gated writes.
- Git owns code, deterministic geometry/masks, schemas, prompts, and text
  provenance. Git does not own media bytes or accepted pointers.

The term **DB-backed asset** means the accepted pointer and lifecycle are
database-authoritative while the bytes are in backend-owned object storage. It
does not mean storing large media values in Postgres `bytea`.

## Stable identity

Game data and code refer to stable semantic slots such as a terrain layer role or
UI-kit part. They never persist a candidate UUID, blob hash, generated filename,
repository path, or currently accepted URL.

A pre-drawn board persists its background's semantic slot, the accepted image's
actual pixel width and height, and the versioned whole-image alignment geometry
defined by
[ADR-0123](adr/0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md).
That payload contains the four owner-approved source-pixel board corners, refit
row and column counts, monotonic normalized guides that the renderer uses, and
the version-4 pinned boundary. It is canonical Level data because it preserves
the exact approved registration; the pinned boundary remains display-only and
does not affect rendering or gameplay. The accepted image has no required
3840x2160 size and is not resized or regenerated solely to reach one.

A same-origin temporary preview URL and a source-scoped browser-local record may
substitute candidate bytes and hold pending alignment during development review.
Promotion copies the exact approved versioned alignment into the pre-drawn
background declaration. The preview URL, candidate id, blob hash, browser-local
key, and picker state are never serialized into the Level. Accepted bytes still
resolve through the live-media catalog's stable semantic slot.

Per
[ADR-0122](adr/0122-predrawn-occlusion-derives-from-canonical-raised-geometry.md),
the current automatic occlusion seed is not another runtime asset. Its alpha and
depth are derived deterministically from the board's canonical raised geometry
through the shared render planner. No mask bytes, candidate id, URL, occlusion
slot, or depth value is added to level data or the live-media catalog.
Any future owner-painted correction and accepted mask artifact requires a
separate authoring and storage decision rather than a local or repository
fallback.

The stable route `/assets/<slot>` is a backend route, not a filesystem path. The
backend resolves it through the current active pointer and redirects or serves
the immutable content-addressed object. A literal `/assets/...` string is valid
only as a semantic slot address; the same path must not exist under
`frontend/public`.

Executable Vite chunks are emitted under `/app-code/`, never `/assets/`. This
keeps deploy-owned code and live-storage-owned media in disjoint URL namespaces.

## Catalogs

One backend-owned media boundary supports typed domain projections. The generic
live-media substrate owns domains migrated from repository files; existing
domain-native stores such as Unit Art and BGM remain conforming because their
runtime bytes and pointers are already backend-resolved rather than Git-backed.
Each projection validates its own completeness and geometry before acceptance:

- Unit Art: family, palette, direction, anchor, and native footprint.
- Terrain: top, side, animation, alpha ownership, projection, face semantics.
- Ground cover: every `groundcover/<terrain>/v<id>.png` version declares its
  terrain/id, frame dimensions/count, base anchor, and content width in
  `versionMetadata.runtime.groundCover`. Browser boards and server thumbnails
  hydrate the same shared renderer projection from the applied catalog; frame
  geometry is not duplicated in a generated source module.
- UI kit: state/slice geometry and native roles.
- Props, walls, backgrounds, portraits, fonts, and OG media: their declared
  component and availability contracts.
- SFX: recording bytes resolve from live media slots. The complete revisioned
  `sfx_profiles/default` document owns sound-set metadata/gains, all landable-
  terrain assignments, and arrival sample/gain/firing. Missing profile state is
  decorative silence and an unavailable editor, never a committed default.
- BGM: its existing backend/Blob playlist and range-streaming contract.

The browser, Studio, client image bakes, and server thumbnails must observe one
catalog revision. A critical catalog that cannot hydrate is an availability
failure. There is no committed or generic-art fallback.

## Candidate and acceptance lifecycle

1. A tool or Studio editor creates a candidate/version for a stable slot.
2. Media bytes upload to the backend and become content-addressed immutable
   objects.
3. The candidate records source dimensions, required runtime dimensions,
   provenance, allowed transforms, and review evidence.
4. A game-owned instrument renders those exact candidate bytes at the declared
   role and canonical 1×.
5. Admin acceptance validates the domain contract and atomically swaps the
   accepted pointer, archives the prior version, bumps the catalog revision, and
   writes an audit event.

Browser `localStorage`, a Git manifest, a contact sheet, or copying a file cannot
perform step 5.

### Implemented promotion coverage

Repository and runtime authority cutover is complete: every migrated runtime
slot resolves through a Postgres pointer and private Blob bytes, and every
domain can receive non-active candidates or private source archives. Typed
owner promotion is currently complete only where a domain-owned validator and
exact-byte review instrument exist:

| Projection | Runtime authority | Candidate ingress | Review and promotion |
| --- | --- | --- | --- |
| Board Unit Art | Unit Art Postgres catalog + private Blob | Unit Art APIs | Complete; atomic family acceptance after palette, direction, geometry, and native-pixel checks |
| Water side faces | Shared live-media catalog + private Blob | Shared single/batch APIs | Complete; all eight faces are reviewed on the canonical board and accepted atomically |
| Other terrain and generic media domains | Shared live-media catalog + private Blob | Shared single/batch APIs | Deliberately blocked until that projection has a typed completeness validator, domain-owned exact-byte review instrument, backend proof validation, and atomic acceptance/rollback tests |
| BGM | Backend-listed private Blob container | Blob administration | Existing range-streaming projection; intentionally not the generic candidate lifecycle |

The remaining promotion docket is UI kit/Chrome; remaining terrain; props,
walls, rocks, and atlases; portraits, backgrounds, and social media; then fonts
and SFX. A generic proof payload or network helper is not a review instrument,
and must not be used to bypass a missing domain projection.

The SFX profile editor is a configuration instrument, not an audio acceptance
instrument. It saves the DB document with optimistic revision control; browser
storage retains only an unsaved draft. Changing a profile reference cannot make
a candidate recording public or production-eligible.

## Generation and editing

Generation tools may use temporary local files during an active run. Their
durable output is an uploaded candidate plus live provenance. They must not emit
accepted or review media into a committed directory. Source and rejected binary
attempts also go to private storage; only prompts and non-material deterministic
geometry may remain in Git.

`frontend/scripts/live-media-admin-client.mjs` is the command-line boundary for
non-browser tools. `archive-source` stores and verifies one exact private source;
`upload-candidate` stores one candidate; and `upload-candidate-batch` consumes an
outside-repository manifest, archives its declared sources first, then uploads
idempotent candidates whose provenance binds those archived version ids and
hashes. These commands deliberately cannot review, accept, or activate media.
Those judgment operations remain reachable only through the game-owned backend
review instrument.

`frontend/scripts/build-groundcover.mjs` accepts only outside-repository source,
tile, and output workspaces. It emits one outside-repository
`live-media-candidate-batch-v1` manifest whose candidate records carry the typed
ground-cover runtime metadata, and can upload that same batch when given
`--api-base`. It never writes a runtime directory or generated TypeScript
catalog.

## Tests and development

- The backend is required; no offline media fallback is permitted.
- Local development resolves the one live catalog through the Vite-spawned
  backend by default. The app database and private media container remain the
  authoritative content data plane.
- The completed cutover and owner verification used unserved candidate pods
  against that same data plane, as decided by
  [ADR-0086](adr/0086-runtime-asset-cutover-uses-one-live-data-plane.md). A
  production-seeded test database is not a steady-state release gate.
- Automated tests may use transient databases and local object storage for
  generated fixtures. Optional preview tooling may project immutable public
  reads, but it cannot write, promote, or supply cutover evidence.
- Deployed validation slots copy the public Unit Art/media catalogs and the
  complete `prop_seats/default` document once into their throwaway Postgres and
  local object-store implementation. That read-only projection never runs in
  production, never writes back to the live data plane, and is not a second
  owner-facing content environment.
- Unit tests use generated/synthetic fixture bytes and injected catalog records.
  Production media is not committed as a test fixture.

## Repository enforcement

CI rejects:

- tracked media under `frontend/public` or another runtime delivery directory;
- tracked source/review/candidate media outside the narrow synthetic-fixture
  exception;
- generators or editor endpoints that write media into the repository;
- server thumbnail code that resolves semantic asset slots through the
  filesystem;
- static catalogs or manifest flags used as accepted-pointer authority;
- fallback selection of committed, cached prior, or generic art.

The one-time legacy importer completed the byte-exact cutover and was deleted;
it is not a seed path and there is no API for creating another bridge. Existing
runtime slots remain readable as `legacy-bridge`; source/review bytes are private
archives; and files that were only Chrome review candidates are non-active
candidate versions. Five historically installed Chrome parts are additionally
mapped to canonical `ui/chrome/...` bridge slots so generated candidate
filenames no longer select live art. The completed importer never marked a
version accepted and had no review or acceptance input. A bridge pointer is
named `active`, never `accepted`, and its catalog entry is explicitly
non-production-eligible; storage cutover cannot legitimize its pixels.

The one-time infrastructure ordering, bootstrap verifier, and manual image
approval gate were deleted after the cutover completed. Normal releases build
the merged `main` revision and deploy its digest as defined by
[ADR-0094](adr/0094-merge-builds-and-deploys-the-merged-image.md).
