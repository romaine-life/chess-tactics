---
status: "accepted"
date: 2026-07-27
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)'s tile-relief/headroom framing clause"
refines:
  - "[ADR-0190](0190-accepted-art-zoom-floor-uses-the-full-feasible-pan-region.md)"
---

# ADR-0191: Board opening frame uses the playable contact surface

## Context and Problem Statement

ADR-0189 correctly made the artistic opening board-owned, but defined the playable presentation
as the full canonical tile sprite frame, including its 180px relief/headroom extent. That extent
is authored storage geometry rather than playable-board size. It disproportionately enlarges the
right-angle framing box for tall, narrow boards: Fortress Gate's `5×11` board becomes
height-limited and opens visibly farther away than a comparably legible wider board.

## Decision

The board-owned opening geometry is the union of the playable cells' projected contact diamonds.
Its right-angle bounds have width `(columns + rows) × stepX` and height
`(columns + rows) × stepY`. Five percent of those dimensions remains added on every side.

Tile sprite relief/headroom, units, props, doodads, scenic terrain, and generated artwork do not
participate in the opening frame. The live camera preserves the contact surface's real offset
inside TileGrid's full-sprite coordinate system so the surface—not the storage frame—is centred.

The accepted-art zoom-out floor remains independently governed by ADR-0190. Changing this opening
geometry advances both browser and server derivative framing revisions.

## Consequences

- Good: tall and narrow boards no longer open farther away because of fixed sprite headroom.
- Good: board size means the projected playable surface consistently across generated and tiled
  boards.
- Good: Hold the Bridge changes only slightly because width already limits its composition, while
  Fortress Gate receives the intended closer opening.
- Cost: disposable board thumbnails regenerate under the new framing revision.

## More Information

- [ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)
- [ADR-0190](0190-accepted-art-zoom-floor-uses-the-full-feasible-pan-region.md)
- [Board render contract](../board-render-contract.md)
