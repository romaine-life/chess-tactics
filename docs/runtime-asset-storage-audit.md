# Runtime asset storage audit

Date: 2026-07-11

## Finding

The application was still broadly Git-backed for media at the 2026-07-11 audit
baseline:

- 2,217 tracked runtime/review/source-media files live in the repository
  (358,097,371 canonical Git bytes, including editable 3D/source formats);
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

## Re-audit after the parallel Chrome merge (2026-07-12)

PR #478 merged while this cutover and its repository guard were still on an
unmerged branch. It added 1,738 Chrome PNGs (70,277,870 bytes), modified one
existing runtime PNG, and added 26 JSON reports beneath the public asset root.
The repository-media/public-root snapshot consequently grew to 3,981 files and
428,614,935 canonical Git bytes: 1,764 more repository-backed asset records and
70,517,564
more bytes than the first frozen inventory. The full importer fingerprint also
freezes the three committed Chrome candidate/family catalogs that must be
archived before deletion, for 3,984 exact inputs and 428,728,479 canonical Git
bytes. Canonical object bytes, rather than checkout-normalized line endings, are
the freeze and upload authority so the inventory is identical on Windows and
Linux.

The new files exposed three policy gaps that the cutover must absorb rather than
grandfather:

1. 530 public Chrome review images were named like runtime assets and would have
   become active legacy bridges. They are backend candidate versions, not public
   runtime pointers.
2. Five live Chrome parts (outer/inner atom and rail plus divider joint) were
   selected by committed candidate ids. They require canonical semantic runtime
   slots whose active versions are owned by Postgres.
3. Committed Chrome candidate/family manifests and nine media-writing scripts
   had recreated Git as the candidate catalog and publication path. Candidate
   lists and provenance must come from the admin media-version catalog; useful
   generation work writes temporary files and uploads through the live-media
   client.

This recurrence did not bypass an active guard: the guard had not reached
`main`. The final guard now covers repository-wide media, public-root metadata,
candidate databases, installed candidate selectors, filesystem readers, and
committed-media writers so the same parallel-branch pattern fails once this
cutover lands.

## Final repository and runtime-authority cutover (2026-07-12)

The deletion pass removes all 3,984 frozen Git inputs (428,728,479 canonical
bytes), the one-time importer and its test, the two serving/import switches, the
packaged-file thumbnail reader, and the bridge-creation API. It preserves only
code-owned geometry, masks, prompts, and text provenance beneath the former art
trees. The existing `legacy-bridge` rows remain readable and replaceable because
they are live database state; normal application code cannot create another one.

The guard's frozen-fingerprint and importer allowances were themselves deleted.
CI runs its unconditional tracked-source checks in `npm run check`, then
`npm run build` runs an explicit output-only pass after Vite emits `dist` (the
Docker build context intentionally has no `.git` metadata). The operator's
post-build `check:media-final` combines both views. A fresh production build
reports zero tracked, embedded, packaged, static-authority, writer,
filesystem-assumption, or cutover-scaffold violations.

The unserved-pod verifier, manual exact-image approval token, and operational
runbook were cutover scaffold rather than steady-state release machinery. They
were retired after this audit completed; ADR-0094 restores ordinary merged-main
build and digest-pinned deployment.

This completes the storage/runtime cutover, not every domain's owner-operated
acceptance instrument. Unit Art and the atomic Water side projection are
contract-complete for promotion. Other migrated domains are live-backed and can
receive candidates, but acceptance remains fail-closed until each domain adds
the typed validator, exact-byte review surface, backend proof validation, and
atomic tests required by ADR-0085. The current coverage and ordered docket live
in [`runtime-asset-contract.md`](runtime-asset-contract.md#implemented-promotion-coverage).

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
  plane. The completed cutover and owner verification used unserved candidate
  pods against it;
  transient CI databases contain synthetic fixtures and are not promotion or
  release authorities ([ADR-0086](adr/0086-runtime-asset-cutover-uses-one-live-data-plane.md)).
- Generation and editing tools upload candidates. They do not write production
  media into the repository.

## Enforcement invariant

The completed migration keeps all of the following true:

- tracked runtime media is rejected repository-wide, not just for units;
- production code and CSS cannot treat `/assets/...` as a filesystem path;
- generators cannot target `frontend/public` or another committed runtime-media
  directory;
- server thumbnails and browser rendering resolve the same accepted catalog
  revision;
- accepted pointers and review evidence exist only in live storage;
- source and rejected-candidate binaries leave Git for private object storage;
- the one-time importer remains deleted after its verified cutover.

ADR-0085 records this as the repository-wide decision. Domain visual and geometry
rules remain valid; only their Git/filesystem storage clauses are superseded.
