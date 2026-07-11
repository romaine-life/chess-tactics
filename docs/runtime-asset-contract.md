# Runtime Asset Contract

This is the living storage and delivery contract derived from
[ADR-0081](adr/0081-runtime-assets-are-live-storage-backed.md). It applies to
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
- UI kit: state/slice geometry and native roles.
- Props, walls, backgrounds, portraits, SFX, fonts, and OG media: their declared
  component and availability contracts.
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

## Generation and editing

Generation tools may use temporary local files during an active run. Their
durable output is an uploaded candidate plus live provenance. They must not emit
accepted or review media into a committed directory. Source and rejected binary
attempts also go to private storage; only prompts and non-material deterministic
geometry may remain in Git.

## Tests and development

- The backend is required; no offline media fallback is permitted.
- Local development resolves the one live catalog through the Vite-spawned
  backend by default. The app database and private media container remain the
  authoritative content data plane.
- The cutover and owner verification use unserved candidate pods against that
  same data plane, as decided by
  [ADR-0082](adr/0082-runtime-asset-cutover-uses-one-live-data-plane.md). A
  production-seeded test database is not a release gate.
- Automated tests may use transient databases and local object storage for
  generated fixtures. Optional preview tooling may project immutable public
  reads, but it cannot write, promote, or supply cutover evidence.
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

The one-time legacy importer is a migration tool, not a seed path. It is removed
after every object and pointer is verified in live storage. Every existing
runtime asset is recorded and served as `legacy-bridge`, never accepted by the
importer regardless of prior files or metadata. The importer has no review or
acceptance input. A bridge pointer is named `active`, never `accepted`, and its
catalog entry is explicitly non-production-eligible; storage cutover cannot
legitimize its pixels.

The one-time infrastructure ordering, one-data-plane bootstrap, immutable proof,
and owner-verification gates are documented in the
[runtime asset cutover runbook](runtime-asset-cutover-runbook.md).
