---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)"
  - "[ADR-0574](0574-a-stated-camera-boundary-governs-how-far-out-the-camera-goes.md)"
partially_supersedes:
  - "[ADR-0190](0190-accepted-art-zoom-floor-uses-the-full-feasible-pan-region.md)'s no additional level-relative zoom-out restriction clause"
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)'s accepted-raster-only zoom/pan safety boundary clause"
refines:
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
  - "[ADR-0278](0278-level-editor-board-fills-its-authoring-workspace.md)"
  - "[ADR-0284](0284-board-views-render-the-complete-authored-visual-scene.md)"
---

# ADR-0301: Levels own an authored camera coverage boundary

## Context

Ordinary tiled levels used one global 55% zoom floor and unrestricted panning. The Level Editor
could therefore show only a centred example of the viewport at that zoom; it could not tell an
author every world location a player might reveal. Board size, scenic extent, and level intent did
not participate in the ordinary camera limit.

A temporary viewport rectangle is not a durable authoring instrument because its size and position
change with zoom and pan. Deriving camera limits from all placed scenery is also circular: placing
distant scenery would expand the view that must be filled with still more scenery.

## Decision

Every Level resolves one rectangular camera coverage boundary in TileGrid's board-centred projected
world pixels. Every possible player viewport must remain completely inside that boundary. The live
viewport dimensions and the boundary derive the stable zoom-out floor; pan stops where a viewport
edge reaches the boundary. The former global 55% floor is removed. A 5% technical renderer floor
remains only as a defensive numerical limit for exceptionally large authored boxes.

The zoom-out floor and pan clamp above are refined by
[ADR-0574](0574-a-stated-camera-boundary-governs-how-far-out-the-camera-goes.md): coverage remains this
hard limit, but it is one of two limits rather than the only one, it is measured on the rectangle
art is visible in rather than on the board's measured stage, and an unauthored level resolves its
boundary from what it actually paints rather than from the snap default described below.

The boundary must contain the canonical playable-contact-surface opening frame, including its
existing five-percent opening margin. Opening and Reset continue to use that board-owned frame;
the camera boundary limits exploration rather than recentering the opening composition.

The Level's lossless `boardCode` may persist `cameraBounds` as `minX`, `minY`, `width`, and `height`.
Older levels without the field resolve a deterministic default from the projected playable-contact
surface. Scenery never enlarges the default.

The Board page replaces the temporary Player-view snapshot with a Camera-boundary instrument:

- Hidden, Show, and Edit display modes share the house dropdown primitive.
- Edit exposes direct move and edge/corner resize handles; keyboard arrows operate the same handles.
- Snap writes an explicit boundary using one of three level-derived padding policies.
- **Balanced** is the default: per axis, use the greater of ten percent of the projected playable
  extent or two projected tile steps (96 world pixels horizontally and 48 vertically) per side.
- **Proportional** uses ten percent per axis. **Fixed** uses the two-step values per side.

Snap stores the resulting explicit rectangle; later board or scenery edits do not silently move it.
If a later playable-board resize would leave the opening frame outside the box, normalization grows
the box only enough to restore that invariant.

AI pre-drawn levels obey both authorities. Their effective coverage region is the convex
intersection of the authored camera rectangle and the accepted artwork polygon. Accepted pixels
therefore continue to prevent exposed black even when the authored rectangle is larger.

The main Level Editor remains a full-workspace authoring canvas and is not pan-clamped to the player
camera boundary. The boundary is the persistent scenery-planning object; no temporary player
viewport preview is provided.

## Consequences

- Camera reach and maximum zoom-out now vary coherently by level and actual player viewport.
- Authors can see, snap, and directly edit the exact persistent area that scenery must cover.
- Legacy levels gain a deterministic, level-relative camera without a data migration.
- Adding off-grid scenery cannot recursively widen the required scenery area.
- Pre-drawn art safety and authored camera intent compose instead of competing.
- The boundary is rectangular even when accepted pre-drawn pixels form a non-rectangular polygon;
  AI runtime coverage may therefore be smaller than the displayed authored rectangle.

## More Information

- [Board render contract](../board-render-contract.md)
- [ADR-0190](0190-accepted-art-zoom-floor-uses-the-full-feasible-pan-region.md)
- [ADR-0278](0278-level-editor-board-fills-its-authoring-workspace.md)
- [ADR-0284](0284-board-views-render-the-complete-authored-visual-scene.md)
