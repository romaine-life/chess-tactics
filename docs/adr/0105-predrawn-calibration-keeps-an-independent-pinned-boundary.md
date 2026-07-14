---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0105: Pre-drawn calibration keeps an independent pinned boundary

## Context

The ideal-grid snap intentionally replaces the working grid's outer corners.
That made it impossible to keep seeing the owner's hand-fitted painted map
boundary while experimenting with ideal counts, projection, and placement. The
painted boundary and the working refit grid answer different questions and must
not overwrite each other.

## Decision

The calibration instrument supports an independent pinned boundary reference.
`PIN BOUNDARY` copies the working grid's current N/E/S/W corners into a second
four-line outline. That outline uses a distinct color, remains visible while the
working grid is snapped or edited, and exposes four independently draggable and
keyboard-nudgeable reference handles. `UPDATE BOUNDARY` replaces it from the
current working corners, and `CLEAR BOUNDARY` removes it.

The pinned boundary is review metadata only. It does not affect the artwork
homography, inverse warp, review-grid cells, gameplay geometry, or hit targets.
The version-4 registration payload stores it with the source-scoped calibration
so it survives save, `DONE`, URL mirroring, and picker reopening.

## Consequences

- The owner can preserve a precise painted-edge trace while comparing and
  adjusting canonical ideal-grid geometry.
- The working grid and reference boundary are visually and behaviorally
  independent; snapping one cannot silently move the other.
- Registration parsing remains backward-compatible with legacy, v2, and v3
  payloads while v4 carries the optional boundary reference.
