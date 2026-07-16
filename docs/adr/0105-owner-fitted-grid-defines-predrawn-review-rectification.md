---
status: "accepted; fixed authored-dimension target superseded by ADR-0106"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0100](0100-predrawn-candidate-review-uses-exact-board-plane-registration.md) and [ADR-0101](0101-predrawn-registration-is-owner-picked-source-geometry.md)"
partially_superseded_by: "[ADR-0106](0106-predrawn-refit-target-dimensions-are-owner-configurable.md)"
---

# ADR-0105: Owner-fitted grid defines pre-drawn review rectification

## Context

Four-corner registration can pin the outside of a generated board while its
painted internal rows and columns still drift from the canonical gameplay grid.
Showing the live canonical grid over that uncorrected painting identifies the
problem but does not provide an owner-operable way to measure or correct it.

An arbitrary point mesh would be difficult to author, could fold or reorder
cells, and would invite independent landmark correction. The required
instrument is narrower: the author needs to place the complete logical grid over
the candidate, stretch its row and column spacing, inspect the size of those
stretches, and apply the inverse mapping to the one continuous painting.

## Decision

The development pre-drawn registration instrument displays the complete logical
grid over the untouched source candidate. The four named corner handles still
define the projective board plane. One internal handle for each non-boundary
column and row records where that canonical grid line appears inside the plane.

Internal guides are normalized to the board plane, include fixed `0` and `1`
endpoints, and are strictly monotonic. A guide may move only between its two
neighbors. The instrument therefore cannot fold the image, reverse cell order,
or create an extra row or column. It shows the owner-fitted grid together with
an equal-spacing reference and reports the minimum, maximum, and largest
per-cell correction. A center handle translates all four outer corners without
changing the internal fit.

Saving writes a versioned, source-scoped local registration containing the four
source-pixel corners and both guide arrays, synchronously reads it back, mirrors
the same stable payload into the temporary URL, and enables comparison with the
live game grid. Legacy ten-number corner registrations remain readable and
initialize equal guide spacing.

For development review, the renderer uses the saved guide arrays as an inverse
piecewise-linear coordinate map inside the one projective plane. The map is
applied to the complete plate before the existing four-corner homography; it
does not split terrain, doodads, props, roads, or background into separate art
layers and it never changes gameplay coordinates. Corrections extend through
the painting as one continuous raster operation. If the guide counts do not
match the authored board dimensions, or the guide arrays are invalid, the
internal correction fails closed.

This instrument calibrates and measures a candidate. ADR-0076 still governs
production acceptance: an accepted plate must be regenerated at its canonical
native frame and may not ship with this spatial resampling. Large correction,
non-monotonic geometry, a semantic miss, or a landmark that cannot be described
by shared row/column guides is a generation failure, not permission for an
independent object warp.

## Consequences

- The owner can make the visible grid describe the painting instead of guessing
  four corners and discovering internal drift only after closing the picker.
- Saved corrections are deterministic measurements that a later generation
  pipeline can use as prompt or camera feedback.
- The one-piece visual-continuity objective survives because rectification is
  one coordinate transform over the complete candidate, not asset placement.
- Arbitrary per-intersection, per-object, and per-layer manipulation remains
  forbidden; the monotonic row/column model deliberately cannot hide every kind
  of generation error.
