---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0184](0184-cyan-footprint-fitting-supports-additive-tile-selections-and-outer-border-bars.md)"
partially_supersedes:
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
  - "[ADR-0182](0182-cyan-footprint-editing-has-image-axis-locks-and-native-pixel-nudges.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0178](0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md)"
---

# ADR-0183: Cyan footprint fitting is viewport-level and edits points or edges

## Context

Cyan-footprint fitting is precision work over the complete warped scene. Keeping
that instrument inside the Board Art Pipeline's center column left the editor
smaller than the grid fitter and made meticulous comparison unnecessarily hard.

Point handles remain useful for an individual corner, but adjusting both ends of
one visible cell side should not require two separately coordinated edits. A
whole-side operation must also work from the default full diamond, where rigidly
translating both endpoints would immediately leave the canonical containment
diamond.

## Decision

### Cyan fitting uses the viewport-level precision workspace

Opening **Edit cyan highlights** presents a viewport-level workspace using the
same full-screen shell treatment as the pre-drawn grid fitter. The exact warped
raster receives nearly the complete browser viewport rather than only the Level
Artwork center column. Closing returns to the same pipeline slot and stage.

The mounted Level Editor and pipeline manager continue to own the document,
attempt, save state, and writer authority underneath the workspace. Opening the
instrument neither changes routes nor acquires, takes over, or extends an editor
lease. Escape and the visible Close action dismiss it when no save is active,
and focus returns to the prior control.

This placement partially supersedes ADR-0179's center-workspace placement. It
does not change profile persistence, raster identity, or the Save boundary.

### The session target is one point or one complete edge

For the selected playable cell, the owner may select either:

- one of the existing top, right, bottom, or left points; or
- one of the four complete edges between adjacent points.

Point dragging and point nudging retain ADR-0182's behavior. Edge selection is
session-local tool state and does not alter the persisted profile.

An edge nudge translates the selected edge's infinite supporting line along the
requested artwork-image X or Y axis. The editor intersects that shifted line
with the two unchanged neighboring supporting lines to derive both new
endpoints. It does not rigidly translate endpoints outside the canonical
diamond, clamp the two endpoints independently, or rotate the selected edge as
a side effect.

One- and ten-pixel edge moves use the exact raster-to-normalized floating-point
scale through the intersection calculation. The two derived endpoints are then
jointly rounded once: all adjacent floor/ceiling combinations are validated
through the canonical footprint normalizer. The deterministic valid result with
the least parallel-line error wins, followed by the least intersection error,
the greatest requested-axis progress, and a stable coordinate tie-break. An
invalid, outward, degenerate, or unchanged result is a no-op.

The existing `cell-diamond-10000-v1` four-point schema remains sufficient. No
backend column, migration, raster, or new background version is introduced.

### Edge actions use the existing reversible history

Selecting a point or edge is not history. Each successful point or whole-edge
nudge is one atomic entry in the existing bounded session history. A rejected
or quantized no-op creates no entry. Undo and Redo restore the exact complete
sparse profile snapshot.

The four edge hit targets stay narrow and track the visible polygon sides.
Selection is visibly distinct, while point handles remain above edge targets so
individual-corner work is still reachable.

## Consequences

- Cyan fitting has the same page-sized working area as grid fitting.
- The owner can refine a complete visible cell side without coordinating two
  independent point edits.
- Whole-edge editing is usable from the default full diamond while preserving
  containment, convexity, point ordering, and profile compatibility.
- Level routing, writer-lease behavior, persistence, and runtime rendering do
  not change.

## Verification

Contract-complete implementation proves that:

- the live cyan workspace covers the Level Editor and leaves the exact pipeline
  manager mounted underneath;
- all four edges can move inward from a full diamond without rotating;
- outward and invalid movement is a history-free no-op;
- exact one- and ten-raster-pixel requests are rounded only after edge
  intersection;
- point editing remains unchanged; and
- point and edge edits participate in the same Undo/Redo history.
