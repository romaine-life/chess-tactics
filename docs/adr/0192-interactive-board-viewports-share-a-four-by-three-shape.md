---
status: "accepted"
date: 2026-07-28
deciders: Nelson, Codex
partially_superseded_by:
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)"
  - "[ADR-0203](0203-ordinary-board-previews-match-the-play-pane.md)"
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)"
partially_supersedes:
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)'s selected-preview 3:2 and gameplay-responsive-shape clauses"
refines:
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
---

# ADR-0192: Interactive board viewports share a four-by-three shape

## Context and Problem Statement

ADR-0189 unified the world-space opening composition but left gameplay's viewport responsive and
made the Campaign selected-level live preview 3:2. The same opening camera therefore produced
different visible compositions: the narrower preview revealed more vertical art than gameplay,
making a correctly framed board appear farther away on one surface.

Static list thumbnails benefit from a wide compact crop, but an interactive preview is a view of
the same board camera as play. Its literal drawable shape must match gameplay before their opening
zoom can be visually comparable.

## Decision

Gameplay and the Campaign/Campaign Editor selected-level live preview use one canonical 4:3
drawable viewport.

Gameplay takes the largest centred 4:3 rectangle that fits its responsive board seat. The selected
preview retains its fixed column width and derives its height from that width. Its ornamental
frame may extend equally beyond the drawable boundary; the interior boundary itself remains
exactly 4:3.

The shared playable-contact-surface opening calculation and accepted-art zoom-out floor remain
unchanged and independent. Compact raster derivatives, list thumbnails, and social cards remain
3:2 because they are static delivery formats rather than interactive board viewports. Exact-art
instruments and the Level Editor retain their task-specific shapes.

## Consequences

- Good: the same board and opening camera show the same world-space composition in preview and
  play.
- Good: the fixed-width preview becomes taller rather than making gameplay narrower than its
  available seat.
- Good: static thumbnails retain their compact 3:2 delivery format.
- Cost: gameplay may leave a small amount of unused space along one axis when its seat is not 4:3.

## More Information

- [ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)
- [ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)
- [Board render contract](../board-render-contract.md)
