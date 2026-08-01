---
status: "accepted"
date: 2026-07-27
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0067](0067-board-previews-render-on-the-level-background-not-a-checkerboard.md)'s baked dense-solid crop and no-live-viewer clauses"
refines:
  - "[ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)"
  - "[ADR-0136](0136-loading-is-manifest-driven-and-frame-acknowledged.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
partially_superseded_by:
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
  - "[ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)"
  - "[ADR-0203](0203-ordinary-board-previews-match-the-play-pane.md)"
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)"
  - "[ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)"
---

# ADR-0189: Board-facing views open on playable geometry

## Context and Problem Statement

Board-facing surfaces accumulated unrelated hard-coded opening zooms, while static thumbnails
framed either the union of rendered objects, the complete generated painting, or its largest
opaque interior. The Campaign selected-level viewer also exposed a fixed `0.2` zoom floor without
the accepted raster boundary, allowing a user to zoom beyond the generated pixels into black.

Generated scenery is intentionally larger than the tactical board. It must provide optional pan
room without deciding the opening composition, and the artistic opening shot must remain separate
from the hard safety limit that prevents leaving accepted artwork.

## Decision Drivers

- The playable board is the stable geometry a player is trying to read.
- Moving a unit, prop, doodad, or generated scenic pixel must not reframe the board.
- Accepted immutable raster bounds remain the authority for how far a user may zoom or pan.
- Gameplay, live previews, browser bakes, and server derivatives must share one calculation.
- Exact-art editing tools must continue showing the complete artifact they exist to inspect.

## Considered Options

- Use the complete generated scene as both opening frame and zoom-out limit.
- Frame the current union of all rendered objects.
- Continue opaque-pixel crop heuristics for static previews and hard-coded live cameras.
- Separate a playable-board opening frame from the accepted-art safety boundary.

## Decision Outcome

Chosen: **separate a canonical playable-board opening frame from the accepted-art safety
boundary**.

The stable playable presentation is the projected rectangular board footprint including canonical
tile relief/headroom, excluding units, props, doodads, scenic terrain, and generated art. Every
side receives a margin equal to five percent of that presentation's corresponding width or height.
A live viewport contains that expanded rectangle and centres it. The accepted raster's persisted
frame dimensions and world bounds may raise the opening zoom when necessary, but they never lower
it or replace the board-owned centre.

The maximum permitted zoom-out remains ADR-0121's viewport-cover floor. Pan remains separately
clamped at the accepted art edge. User camera input releases automatic opening-frame following;
changing levels or explicitly resetting the view restores it. Resizing follows the opening frame
only while the user has not changed the camera.

This policy applies to gameplay opening/reset, the shared Campaign/Campaign Editor selected-level
viewer, the Level Editor opening/reset, board replay and solver viewers, client authoring
thumbnails, canonical server list derivatives, and social cards. Compact derivatives and their
preview seats use one 3:2 composition. The selected-level live preview uses a 3:2 viewport; full
gameplay remains responsive and shares world-space framing rather than literal pixel dimensions.

Generation-frame picking, grid/warp inspection, occlusion editing, background-version comparison,
move-highlight fitting, source/reference previews, and component/material labs remain full-art
inspection instruments. They do not adopt the board-opening default.

The dense-solid opaque-crop preview path selected by ADR-0067 is removed. ADR-0067's world
background and no-transparency-checker requirements remain in force.

### Consequences

- Good: the same board opens at the same meaningful scale across player and authoring surfaces.
- Good: generated overscan becomes useful exploration room rather than accidental composition.
- Good: live and static previews no longer reframe when scene content changes.
- Good: accepted raster metadata prevents black exposure in every interactive board-facing view.
- Cost: a malformed or undersized accepted painting may force a tighter opening than the desired
  five-percent frame; safety wins and the content defect remains visible.
- Cost: changing the shared framing policy invalidates disposable thumbnail derivatives.

## Migration

- Delete the opaque-interior crop helper and all tests and comments that authorize it.
- Replace scene/draw bounds with the shared playable-board framing primitive in browser and server
  preview renderers.
- Replace hard-coded live starts with the shared measured-viewport camera controller.
- Wire the accepted raster cover polygon into every board-facing interactive preview.
- Normalize compact preview delivery to 3:2.
- Bump the canonical thumbnail renderer revision. Existing read-repair and save/publish derivative
  preparation regenerate stale bytes; accepted AI artwork itself is not regenerated.

## More Information

- [Board render contract](../board-render-contract.md)
- [Loading contract](../loading-contract.md)
- [ADR-0067](0067-board-previews-render-on-the-level-background-not-a-checkerboard.md)
- [ADR-0121](0121-predrawn-pan-stops-at-art-boundary.md)
- [ADR-0136](0136-loading-is-manifest-driven-and-frame-acknowledged.md)
- [ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)
