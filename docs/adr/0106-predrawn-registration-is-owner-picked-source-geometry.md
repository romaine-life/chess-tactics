---
status: "accepted; separate Apply transaction superseded by ADR-0107; corner-only instrument superseded by ADR-0110; non-persisted production-alignment clause superseded by ADR-0123"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0105](0105-predrawn-candidate-review-uses-exact-board-plane-registration.md)"
partially_superseded_by: "[ADR-0107](0107-predrawn-registration-has-no-unsaved-dialog-state.md), [ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md), and [ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md)"
---

# ADR-0106: Pre-drawn registration is owner-picked source geometry

## Context

ADR-0105 made whole-plate registration exact once four source corners were known,
but it gave the automatic top-profile detector too much authority over what those
corners meant. The detector fit real image lines with low numeric residual and
still inferred the wrong semantic south point. A confident line fit can answer
"where is this silhouette?" without answering "which point should own the game
grid?"

The failed review also showed why an agent-supplied coordinate is not an
owner-operable pipeline. The level author needs to see the untouched candidate,
choose the source points directly, refine them, and immediately compare the
registered result under the live grid.

## Decision

Every development pre-drawn candidate route exposes an in-app corner-registration
instrument from the Board View controls. It displays the untouched source image,
not the already transformed board, and lets the owner place north, east, south,
and west handles in intrinsic source-image pixels.

The instrument must provide:

- visible named handles, source-pixel coordinate readouts, and the quadrilateral
  connecting the current four points;
- fit plus 100%, 150%, and 200% source zoom;
- repeated click placement for the active handle and one-pixel keyboard nudging
  (ten pixels with Shift);
- reset to the coordinates that opened the instrument;
- an Apply action only when all four points exist.

Apply serializes `(source width, source height, N, E, S, W)` into the existing
development `predrawnCorners` URL value and immediately re-renders the temporary
level with the grid enabled. The URL is the repeatable review handoff and survives
the existing editor/play round trip. It is not saved into level data.

Automatic detection may seed the four handles or provide evidence, but it is not
the semantic authority and may not silently overwrite owner-picked coordinates.
The exact whole-image homography from ADR-0105 remains the registration operation;
per-object and per-cell correction remain forbidden.

Production acceptance remains governed by ADR-0076 and ADR-0105: registration is
candidate calibration evidence, and the accepted plate must be regenerated at
its native canonical frame rather than shipping the review resampling.

## Consequences

- A wrong semantic corner can be corrected in seconds without code changes or an
  agent's visual interpretation.
- The same source-coordinate payload can become the corner-authoring step of a
  future candidate import pipeline.
- Detector confidence is still useful diagnostic evidence but no longer confused
  with design authority.
- The saved authored level remains untouched throughout candidate review.
