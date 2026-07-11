---
status: "accepted"
date: 2026-07-09
deciders: Nelson, Codex
---

# ADR-0073: Unit art is live storage-backed content behind six stable piece identities

## Context

Board sprites and rejected candidates were committed under `frontend/public` and
listed by a static TypeScript catalog. Changing accepted art required a commit and
deploy, while candidate libraries accumulated in Git. Unit Studio now also provides
per-piece display-size tuning and a generation handoff, so the accepted size and the
replacement image need one live source of truth.

Gameplay data previously contained art-derived ids. The cutover normalized board
data to piece-family ids so changing pawn pixels cannot change or invalidate a
level. The browser game, editor renderer, and server-side thumbnail renderer also
need to resolve the same accepted pixels and geometry.

## Decision

There are exactly six stable board-unit identities: `pawn`, `rook`, `knight`,
`bishop`, `queen`, and `king`. Board data stores only those family ids. Art-record
UUIDs and former art-derived ids are not gameplay identities or read aliases.

Postgres owns the live catalog:

- `unit_families` stores each stable family's accepted-art pointer and published
  display scale.
- `unit_assets` stores active editable candidate metadata, footprint, source canvas,
  and contact anchor. Candidate UUIDs are Studio/storage identities and never
  gameplay identities. Retired records may be exported to private archive storage
  and removed from the operational catalog.
- `unit_sprites` maps candidate + palette + direction to content-addressed PNG
  metadata.
- `unit_catalog_state` supplies one revision for manifests and thumbnail caches.
- `unit_asset_events` records creation, upload, acceptance, archive, restore, and
  size publication.

PNG bytes live in the private `unit-assets` container in the existing media storage
account. The backend reads and writes it with workload identity and serves images
through same-origin `/api/unit-sprites/<sha>.png` routes with immutable cache headers.
Postgres does not store image bytes and the backend does not preload every image; it
keeps bounded compressed-byte and decoded-image caches.

The Units catalog remains browse-only under the Studio control architecture and
ADR-0029. Its Inspect action opens the embedded `Unit Art` Viewer kind, which owns
the board-context preview and all editing controls. That editor previews size changes
locally, can publish family sizes, creates and uploads candidates, and only accepts a
candidate after all 6 palettes x 8 directions exist. Acceptance atomically swaps the
family's pointer and archives the previous accepted art. Archived rows and immutable
blobs provide rollback without exposing a user-facing piece revision model.

The shared renderer hydrates one synchronous registry. Browser gameplay, editor
boards, HUD paths, and server thumbnails all resolve accepted URLs through it.
Published scale and anchor are applied to both DOM seats and thumbnail draw plans.

## Cutover

The cutover completed as one migration:

1. Storage infrastructure and migration 14 created the live model.
2. The six accepted families and all 288 frames were imported and verified in
   production.
3. The one-time importer, Git-backed board frames, retired generators, static
   runtime URLs, and art-derived read aliases were deleted.
4. A repository guard rejects reintroduction of the removed board-art path.

The live catalog is required. The browser does not render the application until a
valid snapshot contains one complete accepted asset for every family. Server-side
board rendering aborts when that same contract cannot be hydrated. Neither path
selects cached prior art, committed art, or a generic substitute. Portraits and
neutral rocks remain separate contracts.

Ephemeral test slots seed their isolated Postgres and local blob directory from the
current production live catalog. This exercises the same storage-backed model
without granting test-slot service accounts production identity.

## Consequences

- Unit art and size can be edited from a normal dev server without a Git/deploy loop.
- Repeated pieces use browser HTTP/decoded-image caches against one immutable URL;
  they do not cause repeated blob downloads.
- A changed image cannot invalidate a level because levels identify chess pieces,
  not art records.
- Candidate history leaves Git and the operational DB while remaining recoverable
  from verified manifests and immutable bytes in private archive storage.
- A missing or incomplete catalog is an explicit availability failure, not a request
  to render another source.
