# Runtime asset storage audit

Date: 2026-07-11

## Finding

The application is still broadly Git-backed for media. At current `origin/main`:

- 2,217 tracked runtime/review/source-media files live in the repository (about
  342 MB, including editable 3D/source formats);
- 1,582 of those files are under `frontend/public` (about 223 MB);
- production source contains 735 literal `/assets/` references;
- Vite copies `frontend/public` into the deployment, and the backend serves those
  files from disk;
- CSS, TypeScript registries, JSON manifests, generators, tests, and server
  thumbnails all assume that filesystem layout.

Board-unit art and BGM are the exceptions. Unit Art uses Postgres-owned active
pointers and accepted status with immutable bytes in private Blob Storage. BGM is listed from Blob
Storage through the backend. Terrain, UI chrome, backgrounds, props, doodads,
ground cover, portraits, wall decoration, SFX, fonts, OG images, review images,
and most generation inputs remain Git-backed.

The Water edge reviewed on 2026-07-11 was therefore not promoted through live
storage. Its eight runtime side files were public Git files, its registry URLs
were compiled strings, and its `registeredForProduction` value was only a JSON
field checked by a repository script.

## Why the problem recurred

This was policy-driven rather than a single stray fallback.

1. Commit `aed37424` (PR #58, 2026-06-16) introduced a generic
   `design_assets` table and `/api/design-assets` routes. It never became the
   runtime authority. The table boot-seeded from committed media, the frontend
   loader was best-effort, and a baked Git fallback remained.
2. Commit `b82999cb` (PR #76, 2026-06-17) removed that unused store before
   adoption. Migration 2 became reserved, migration 3 explicitly dropped
   `design_assets`, the routes and loader were deleted, and the persistence
   contract declared art assets to be committed files.
3. ADR-0073 later solved the problem only for the six board-unit families. Its
   schema, completeness rules, Studio workflow, and repository guard were all
   deliberately unit-specific. The accompanying contracts described Unit Art
   as the one live-storage exception and left other media in `frontend/public`.
4. Subsequent art pipelines followed those standing rules. The terrain guard
   positively requires committed PNGs, while the no-committed-art guard covers
   only unit sprites. New work was therefore pulled back toward Git by the
   repository's own contracts and CI.

The earlier generic implementation should not be restored. It stored PNG bytes
as Postgres `bytea`, had no stable accepted pointers, no content addressing, no
candidate lifecycle, no atomic promotion, no audit trail, and no required
runtime catalog. Its seed and fallback behavior are exactly the ownership split
that this migration must eliminate.

## Required replacement

The canonical replacement is a shared live-media substrate with typed domain
catalogs:

- Postgres owns stable semantic slots, candidate/version metadata, accepted
  pointers, provenance, native-size evidence, revisions, and audit events.
- Private Blob Storage owns immutable content-addressed media bytes.
- The backend owns all delivery. Stable `/assets/<slot>` requests resolve through
  the accepted DB pointer and redirect to an immutable hash URL; no request reads
  a repository file.
- Domain projections retain their real contracts: Units keep their palette and
  direction completeness rules; terrain keeps top/side/animation and alpha
  rules; UI kit assets keep nine-slice geometry; BGM keeps range-streaming and
  playlist semantics.
- Promotion is an admin-gated backend transaction. A browser-local review marker,
  Git manifest, filename, or copied PNG cannot promote an asset.
- Critical catalogs are required at startup and in server rendering. There is no
  committed fallback, cached prior-art fallback, or generic substitute.
- The existing app Postgres/Blob pair is the one authoritative content data
  plane. Cutover and owner verification use unserved candidate pods against it;
  transient CI databases contain synthetic fixtures and are not promotion or
  release authorities ([ADR-0082](adr/0082-runtime-asset-cutover-uses-one-live-data-plane.md)).
- Generation and editing tools upload candidates. They do not write production
  media into the repository.

## Enforcement gap to close

The migration is incomplete until all of the following are true:

- tracked runtime media is rejected repository-wide, not just for units;
- production code and CSS cannot treat `/assets/...` as a filesystem path;
- generators cannot target `frontend/public` or another committed runtime-media
  directory;
- server thumbnails and browser rendering resolve the same accepted catalog
  revision;
- accepted pointers and review evidence exist only in live storage;
- source and rejected-candidate binaries leave Git for private object storage;
- the one-time importer is removed after its verified cutover.

ADR-0081 records this as the repository-wide decision. Domain visual and geometry
rules remain valid; only their Git/filesystem storage clauses are superseded.
