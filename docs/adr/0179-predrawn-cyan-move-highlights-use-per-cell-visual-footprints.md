---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0183](0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md)"
  - "[ADR-0185](0185-predrawn-fitted-cell-footprints-shape-every-square-local-visual-highlight.md)"
partially_supersedes:
  - "[ADR-0170](0170-derived-board-inspection-is-a-full-workspace-revision-gate.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
---

# ADR-0179: Pre-drawn cyan move highlights use per-cell visual footprints

## Context

An AI-painted board can retain small, intentional variations in its apparent
cell edges after the board grid itself is correctly fitted. The canonical cyan
move diamond may then paint over a nearby cliff face or another visibly
non-playable part of the painting even though the underlying gameplay cell,
movement rules, and hit target are correct.

Changing board geometry to follow those decorative variations would make
painting inconsistencies authoritative for movement. Keeping cyan fitting as a
temporary inspection overlay would instead make the owner repeat precision work
and leave the accepted Level unable to reproduce the approved treatment.

## Decision

### Each post-warp attempt owns one latest fitted draft

After a creation slot has an exact warped board, the slot may store one mutable
latest cyan move-highlight profile bound to that warp. The attempt owns the
profile, its canonical SHA-256 digest, and the exact warped-version identity as
one all-or-none bundle. This draft is authoring data, not another background
version, raster, mask, or Blob object.

Saving the draft is a current-writer-fenced compare-and-swap mutation. It
requires the expected attempt revision and exact current warped-version id,
validates against the attempt's retained semantic board and the current warp's
cover-independent environment-geometry digest, advances the attempt revision,
and records an attributed audit event. An exact replay is idempotent. A
conflicting revision or replaced warp fails instead of writing over the newer
draft. Discarding that warp clears the bound draft atomically.

The database history remains append-only. Migration 40 adds the three profile
columns, their all-or-none check, the restrictive warp foreign key, and the
profile-update audit action. PostgreSQL shortened migration 40's intended check
identifier because it exceeded the 63-byte identifier limit; the applied
migration is not edited or replayed. Migration 41 replaces only that
catalog check with the deliberately bounded stable identifier
`predrawn_generation_attempts_move_highlight_bundle_check`. Together migrations
40 and 41 own the required final profile topology.

### The profile is sparse, normalized, and visual-only

The profile schema is `predrawn-move-highlight-profile-v1` with coordinate
basis `cell-diamond-10000-v1`. Each authored entry is keyed by an exact playable
cell and contains four integer-normalized screen-space points in top, right,
bottom, left order. Coordinates range from 0 through 10,000 inside the
canonical cell's 96×54 bounding box. The complete default diamond is:

`[5000, 0, 10000, 5000, 5000, 10000, 0, 5000]`.

Every custom quadrilateral must remain contained by that diamond, strictly
convex, consistently ordered, and non-degenerate. Cell keys and coordinates
are canonicalized before hashing. Only deviations are stored; a cell omitted
from the map uses the complete default diamond, and an empty sparse map is a
valid explicitly saved profile.

The fitted quadrilateral clips only the cyan legal-move paint for its cell. The
complete canonical diamond remains the cell's hit target. Board addressing,
movement, pathfinding, selection, dragging, grid lines, threat and objective
overlays, cover, unit placement, and every solver rule remain unchanged.

### Installation embeds an exact Level snapshot

Setting a fitted warped or occlusion-ready artifact writes a schema-version-3
pre-drawn surface to the fenced Level working copy. That surface embeds the
exact canonical profile snapshot and digest alongside the exact warped
background selection. It does not point at the creation attempt's mutable
latest draft. Editing the attempt later therefore cannot change a working,
saved, or published Level until the owner explicitly sets that new snapshot.

Save and Publish revalidate the embedded profile against the selected warped
version, the Level's playable cells, its cover-independent environment geometry,
and the profile digest. Missing or mismatched schema-version-3 data fails closed;
runtime never substitutes a newer attempt draft.

Historical schema-version-2 pre-drawn Level surfaces remain readable and mean
the full canonical cyan diamond for every cell. They do not acquire a fabricated
profile or require a destructive migration.

### Occlusion follows explicit cyan review

Creating a new occlusion-ready result requires a valid saved profile for that
attempt's exact current warp. The empty sparse profile satisfies this gate when
the owner deliberately approves full diamonds everywhere. The profile does not
become mask pixels or alter the immutable occlusion artifact; the requirement
ensures that a final pipeline stage cannot bypass tactical-readability review.
Historical already-created occlusion artifacts and schema-version-2 Level
surfaces retain their compatibility behavior.

### Fitting is a full reversible workspace

Cyan fitting uses the Board Art Pipeline's full center workspace over the exact
warped artwork with units hidden, the registered review grid visible, and live
cyan paint. The owner selects a playable cell, drags or nudges four small corner
handles, resets one cell or all cells, and retains the ordinary right-drag pan
and wheel-zoom navigation.

Visible Undo and Redo controls own one bounded 100-entry session-local history.
One completed handle drag, successful keyboard nudge, or discrete reset is one
step. Undo, Redo, and a new edit after Undo have the conventional stack
behavior. Cell selection, active-handle selection, pan, zoom, Save, and closing
are not edits. The history is not persisted; Save commits only the exact
currently displayed sparse profile.

## Consequences

- Painted cliff variations can receive precise cyan treatment without becoming
  gameplay geometry.
- A creation slot keeps one operable latest draft while every installed Level
  remains an exact self-contained snapshot.
- Occlusion generation gains an explicit post-warp review gate.
- The profile adds structured Level content but no new media version or Blob
  allocation.
- Historical schema-version-2 Levels preserve their exact full-diamond
  appearance.

## Verification

Contract-complete implementation proves that:

- canonicalization removes full-diamond entries and rejects out-of-board cells,
  out-of-diamond, folded, degenerate, non-integer, and digest-mismatched
  profiles;
- the attempt mutation is writer-fenced, warp-bound, revision-CAS, attributed,
  idempotent for exact replay, and cleared with a discarded warp;
- new occlusion creation rejects a missing or mismatched saved profile;
- schema-version-3 board-code round trips preserve the exact profile snapshot
  and schema-version-2 surfaces retain full-diamond rendering;
- the renderer clips only cyan move paint while hit testing and movement remain
  the full canonical cell; and
- the full workspace supports precise handles, reset, pan, zoom, and complete
  bounded Undo/Redo behavior before explicit Save.
