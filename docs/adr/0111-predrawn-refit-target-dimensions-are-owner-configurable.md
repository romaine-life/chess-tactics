---
status: "accepted; post-picker review-grid clause superseded by ADR-0112"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md)"
partially_superseded_by: "[ADR-0112](0112-predrawn-review-overlay-uses-the-saved-refit-grid.md)"
---

# ADR-0111: Pre-drawn refit target dimensions are owner-configurable

## Context

ADR-0110 initialized the calibration grid from the authored level dimensions
and required fitted-guide counts to match those dimensions. That assumption
breaks the review instrument when a generated candidate paints an extra row or
column. Forcing a six-column painting into a five-column target distorts the
entire continuous scene and hides the actual generation error instead of making
it inspectable.

The owner needs to describe the grid that is visibly present in the candidate.
That description must control the refit itself, not select a playable subset,
compress a window, or mutate the canonical level.

## Decision

The pre-drawn calibration instrument exposes explicit **Refit columns** and
**Refit rows** controls. Authored level dimensions initialize those controls
only when the registration has no saved target dimensions. The owner may set
either target from 1 through 64 cells.

Changing an axis count rebuilds that axis with equal spacing and the exact
requested number of cells; its internal guides may then be fitted as before.
The four outside handles remain the boundary of the complete painted grid. A
saved version-3 registration records the target row and column counts together
with the corners and matching guide arrays.

The renderer maps the complete artwork boundary to a canonical grid having the
saved target dimensions, anchored at the canonical level's north/west grid
origin. The live gameplay grid continues to use the authored level dimensions.
Consequently, if a candidate contains six columns for a five-column level, the
sixth refitted art column remains visibly outside the five-column gameplay grid
instead of being compressed into it.

This control changes only development-review calibration. It does not resize
the level, add cells, choose a subset of the generated art, alter movement or
collision, or make an extra painted row or column acceptable for production.
The mismatch remains explicit generation feedback, and production acceptance
still requires native-frame regeneration under ADR-0076.

## Consequences

- The owner can accurately fit and diagnose candidates whose generated grid
  count differs from the requested level.
- The refit dimensions, guide count, saved payload, and rendered homography all
  share one explicit source of truth.
- The canonical playable level remains unchanged and visibly exposes any extra
  generated rows or columns.
- Changing a count intentionally resets only that axis's detailed spacing; a
  count change cannot ambiguously reuse guides from a different topology.
