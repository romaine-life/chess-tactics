---
status: superseded
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)"
partially_supersedes:
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)'s compact-preview 3:2 clause"
  - "[ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)'s selected-preview 4:3 and compact-preview 3:2 clauses"
refines:
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)"
  - "[ADR-0202](0202-play-uses-one-fixed-design-resolution.md)"
---

# ADR-0203: Ordinary board previews match the Play pane

## Context and Problem Statement

ADR-0202 established one stable Play board pane of 1560×992 design pixels.
Selected-level live previews still used 4:3, while stored list thumbnails and
browser-baked authoring thumbnails still used 3:2. They therefore showed a
different camera crop even though the product presents them as previews of the
same level the player will open.

The fixed Play pane is now a stable dimensional authority. Ordinary previews
should use it directly rather than retaining historical delivery ratios.

## Decision

Play, the Campaign and Campaign Editor selected-level live preview, canonical
stored level thumbnails, and browser-baked unsaved level thumbnails use one
literal drawable aspect: **1560:992**, reduced to **195:124**.

Stored and browser-baked compact derivatives use a quarter-scale **390×248**
raster. The shared LevelThumbnail component owns the ratio; callers choose
width but may not provide an independent height. Chrome sits outside the
drawable rectangle and sizes itself so its interior remains 195:124.

The board-relative opening camera remains the shared playable-contact-surface
frame plus five-percent margin. Changing the viewport shape changes only which
axis limits that contain operation; it does not introduce a second crop.

The board framing revision advances to 3 and the backend thumbnail renderer
revision advances to 7. Existing 3:2 derivatives are stale and are repaired by
the established read/save/publish path.

Platform-constrained social cards, the main Level Editor workspace, and
exact-art fitting instruments keep their task-specific output dimensions.

## Consequences

- Good: ordinary previews show the same shaped window the player receives.
- Good: a component caller can no longer reintroduce a competing height.
- Good: stale 3:2 stored files cannot be served as current derivatives.
- Cost: compact thumbnail rasters grow from 288×192 to 390×248.

## More Information

- [Board render contract](../board-render-contract.md)
- [Loading contract](../loading-contract.md)
- [ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)
- [ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)
- [ADR-0202](0202-play-uses-one-fixed-design-resolution.md)
