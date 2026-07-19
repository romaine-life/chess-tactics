---
status: "accepted; automatic corner authority superseded by ADR-0135; four-corner-only correction superseded by ADR-0110; development-only production-registration clause superseded by ADR-0123"
date: 2026-07-13
deciders: Nelson, Codex
supersedes: "[ADR-0133](0133-pre-drawn-boards-use-one-registered-live-media-plate.md)"
partially_superseded_by: "[ADR-0135](0135-predrawn-registration-is-owner-picked-source-geometry.md), [ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md), and [ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md)"
---

# ADR-0134: Pre-drawn candidate review uses exact board-plane registration

## Context

ADR-0133 established the pre-drawn board as one continuous plate over unchanged,
gameplay-authoritative level geometry. It limited review calibration to scale and
translation. In practice, a generated candidate can preserve the intended board
and still return with slightly different isometric framing. A scale/translation
fit cannot register that candidate to all four canonical board corners, while an
affine least-squares fit has only six degrees of freedom and distributes the
remaining error across the board. That made the near corner visibly miss even
when the board's own edge geometry already determined its location.

The cliff silhouette is not the board plane. In particular, the near cliff face
extends below the walkable top and may obscure the top-plane corner. Treating the
lowest foreground pixel as that corner is therefore semantically wrong.

## Decision

A development review candidate may use one four-point projective registration of
the complete plate. Source coordinates are ordered north, east, south, west and
map exactly to the corresponding four corners of the canonical board reference
frame. The renderer solves the full homography and rejects a solution unless all
four corner residuals are negligible. An affine best fit is not an acceptable
substitute.

This is still one drawing and one transform. The pipeline never splits terrain
from doodads, moves landmarks independently, or deforms individual cells or
objects. The authored level remains the sole owner of grid addressing, movement,
collision, objectives, and editable gameplay state.

For orthographic isometric candidates with a dark or transparent exterior, the
automatic detector must derive the top plane from line geometry rather than
eyeballed silhouette extrema:

1. Extract the foreground top profile.
2. Robustly fit the two long top-plane edge families and report their inlier
   ratios and pixel residuals.
3. Intersect those lines for the north corner and evaluate them at the west and
   east foreground extents for the side corners.
4. Derive the obscured near corner by parallelogram closure, `south = east + west
   - north`.
5. Fail closed when fit confidence, endpoint residuals, apex agreement, or image
   bounds do not meet declared thresholds. A rejected detection is not silently
   replaced by guessed coordinates.

Registration coordinates and temporary candidate URLs are development-review
inputs only. They are not serialized into the level. Under ADR-0076, a
projectively calibrated candidate is evidence for review, not production art;
an accepted runtime plate must be regenerated at its declared native frame and
render without that spatial resampling.

## Consequences

- All four outer grid corners can be pinned exactly during candidate review,
  including a near corner hidden by an overhanging cliff face.
- Detection produces inspectable measurements and confidence failures, so the
  same operation can become a repeatable import pipeline rather than an agent's
  one-off judgment.
- The live grid exposes internal generation drift that no four-corner transform
  can repair; registration cannot make incorrectly drawn cells correct.
- The one-piece continuity objective remains intact because there is no
  per-landmark or per-layer artwork alignment.
- Production acceptance still requires native regeneration; the review
  homography does not become a hidden runtime scaling exception.
