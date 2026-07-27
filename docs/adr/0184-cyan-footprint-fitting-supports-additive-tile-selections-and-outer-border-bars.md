---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0183](0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0178](0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md)"
---

# ADR-0184: Cyan footprint fitting supports additive tile selections and outer border bars

## Context

Generated board art can drift across several adjacent playable cells. Correcting
those cells one at a time makes it difficult to preserve a deliberate border
across the selected area, while showing every cell edge obscures which edges
actually bound that area.

ADR-0183 made one complete cell edge editable, but its single-cell target does
not provide an area-level operation. Multi-cell selection must preserve precise
per-cell point work without creating a second persisted footprint model.

## Decision

### Tile selection is additive and keeps one primary tile

A plain playable-tile click replaces the current selection with that tile.
Shift+click adds an unselected tile or removes a selected tile, except that the
last selected tile cannot be removed. Selection therefore always contains at
least one tile while the editor is open.

The most recently added selected tile is primary. If it is removed, the most
recently added remaining tile becomes primary. Only the primary tile exposes
the four point handles from ADR-0183, so individual-corner editing remains
unambiguous while every selected tile remains visibly selected. Previous-tile
and next-tile navigation collapse the selection to the destination tile.

Selection membership, order, and the primary tile are session-local tool state.
They do not change the sparse footprint profile and are not Undo/Redo entries.

### Only the selected area's exposed boundary is editable

An edge segment is exposed when the playable neighbor across that edge is not
selected. A shared edge between two selected tiles is internal: it is hidden as
an edit target and cannot be selected.

Clicking an exposed segment selects the maximal contiguous bar containing that
segment whose tiles:

- are selected;
- expose the same top-right, bottom-right, bottom-left, or top-left edge index;
  and
- remain adjacent along that edge's board-projection tangent.

The bar stops at every gap, notch, change in edge index, or disconnected
component. An enclosed unselected region also exposes its surrounding selection
boundary; its bars remain separate from non-contiguous exterior bars. The active
bar is session-local selection state and does not alter profile data or history.

This boundary-bar target partially supersedes ADR-0183's requirement that the
session target be one point or one complete edge. A point still belongs only to
the primary tile, while an edge target may now contain one or more exposed
segments.

### Boundary edits and selected resets are atomic

A boundary-bar nudge applies the requested artwork-image-axis delta to every
segment through ADR-0183's existing supporting-line intersection and canonical
footprint validation. All segments are calculated against the same opening
profile. The edit succeeds only if every segment has a valid result; otherwise
the entire request is a no-op.

One successful bar nudge creates one snapshot in the existing bounded
session-local history, regardless of the number of segments. Undo and Redo
restore the whole group atomically. **Reset selected** likewise restores every
selected tile to the default full diamond as one atomic history entry. Exact
no-ops and rejected group edits create no entry.

The existing `cell-diamond-10000-v1` sparse profile, attempt draft, embedded
Level snapshot, backend endpoints, and database schema remain unchanged.

## Consequences

- The owner can shape a coherent border across adjacent generated-art cells
  without editing each cell separately.
- Internal selected-area edges no longer compete with the boundary being fitted.
- Point-level refinement remains available through one clearly identified
  primary tile.
- Irregular selections, holes, and disconnected components retain precise
  topology instead of being flattened into a bounding rectangle.
- Multi-segment edits cannot leave a partially changed border after one segment
  fails validation.

## Verification

Contract-complete implementation proves that:

- plain click replaces selection, while Shift+click adds and removes without
  permitting an empty selection;
- the most recently added selected tile alone exposes point handles;
- internal shared edges are hidden and ineligible;
- rectangular, notched, disconnected, and holed selections produce only their
  correct maximal contiguous same-edge bars;
- one invalid segment rejects the entire group nudge without modifying profile
  state or history;
- a successful group nudge and Reset selected each round-trip through one
  Undo/Redo entry; and
- saving and runtime rendering consume the unchanged sparse profile contract.
