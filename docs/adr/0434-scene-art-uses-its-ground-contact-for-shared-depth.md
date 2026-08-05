---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md)'s no-depth and always-overlay clauses"
refines:
  - "[ADR-0176](0176-placed-art-and-level-artwork-are-separate-editor-destinations.md)"
  - "[Board render contract](../board-render-contract.md)"
---

# ADR-0434: Scene Art uses its ground contact for shared depth

## Context

Scene Art persisted a free projected-pixel center and deliberately painted above the complete
board scene in collection order. A correctly placed castle behind a nearer perimeter wall therefore
painted over that wall, and moving an instance could not repair the overlap without manually
reordering unrelated content. The installed directional sprite already declares the anchor that
identifies where the depicted object meets the ground.

## Decision

- Scene Art remains free projected-pixel, gameplay-inert Placed Art. It still persists no tile,
  footprint, collision, board coordinate, or `z` value.
- At render time, the shared compositor derives the exact ground-contact scene pixel from the
  placement center, selected directional sprite dimensions, source scale, instance scale, and that
  directional sprite's installed anchor.
- Projected scene Y is the fixed-isometric depth axis. The compositor maps that continuous contact
  into the canonical object back/base/front bands used by tile-addressed structures, so Scene Art
  interleaves with walls, wall art, fences, props, doodads, units, and cover by physical depth.
- Collection order is only the stable tie-breaker for exact equal-depth operations. Authors never
  repair ordinary overlap by reordering content, and the obsolete **Fix scene art overlap order**
  action is removed.
- Every board consumer uses the shared draw plan: the Level Editor, gameplay, Studio/read-only
  boards, generation references, previews, thumbnails, and server rendering may not recreate an
  overlay-only Scene Art lane.

## Consequences

- A wall nearer than a Scene Art ground contact covers that art; moving the art to the near side
  automatically reverses the order.
- Existing Level data needs no migration because depth is derived from already-persisted placement
  and installed sprite geometry.
- Changing an installed directional anchor now changes both seating and depth, which makes anchor
  calibration a single truthful ground-contact authority.
