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

Levels currently contain art-derived ids such as `pawn-codexsheet`. That is an
implementation detail, not game meaning: changing pawn pixels must not change or
invalidate a level. The browser game, editor renderer, and server-side thumbnail
renderer also need to resolve the same accepted pixels and geometry.

## Decision

There are exactly six stable board-unit identities: `pawn`, `rook`, `knight`,
`bishop`, `queen`, and `king`. New board data stores those family ids. Existing
art-derived ids remain permanent read aliases.

Postgres owns the live catalog:

- `unit_families` stores each stable family's accepted-art pointer and published
  display scale.
- `unit_assets` stores editable candidate metadata, footprint, source canvas, and
  contact anchor. Candidate UUIDs are Studio/storage identities and never gameplay
  identities.
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

The current accepted PNGs remain a synchronous fallback through the migration:

1. Apply storage infrastructure and migration 14.
2. Run `npm --prefix backend run units:import` with the storage and database
   environment configured. The importer is idempotent and skips already-accepted
   families unless passed `--force`.
3. Verify Unit Studio, gameplay, editor boards, and server thumbnails resolve the
   live catalog.
4. Remove accepted board PNGs from Git in a later cutover change. Portraits and
   neutral rocks are separate contracts and are not moved by this decision.

An unavailable or empty catalog retains the committed/last-good registry during the
cutover. Once committed board sprites are retired, cached live content plus a generic
missing-sprite fallback replace that temporary baseline.

## Consequences

- Unit art and size can be edited from a normal dev server without a Git/deploy loop.
- Repeated pieces use browser HTTP/decoded-image caches against one immutable URL;
  they do not cause repeated blob downloads.
- A changed image cannot invalidate a level because levels identify chess pieces,
  not art records.
- Candidate history leaves Git while remaining recoverable in storage and the DB.
- Infrastructure and migration 14 must land before live authoring becomes available;
  older backends return the committed fallback.
