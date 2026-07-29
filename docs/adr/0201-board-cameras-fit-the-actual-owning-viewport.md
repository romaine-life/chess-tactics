---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0202](0202-play-uses-one-fixed-design-resolution.md)"
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)"
partially_supersedes:
  - "[ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)"
refines:
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)"
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
---

# ADR-0201: Board cameras fit the actual owning viewport

## Context and Problem Statement

ADR-0192 imposed a 4:3 drawable rectangle on gameplay even though the Battle UI
already owned a larger visible pane beside its HUD. Gameplay also retained an older
full-bleed rule that painted outside the nominal 4:3 frame, so its camera measured
one rectangle while the player visibly received another. A fixed gameplay zoom cap
could stop the opening camera before the playable-board frame was contained on a
large viewport.

Viewport dimensions are UI layout. The Battle camera should use the complete pane
the Battle UI visibly gives it, rather than a second hidden rectangle.

## Decision

Gameplay fills its responsive board seat. Its camera measurement rectangle, clip
boundary, input surface, and visible pane are one and the same. This decision does
not change the selected-level live preview, compact browser/server thumbnails,
social derivatives, the main Level Editor, or exact-art instruments.

The cross-surface invariant remains the camera policy: contain and centre the
playable contact surface plus the canonical five-percent margin in the measured
visible rectangle. Accepted-art coverage may raise the zoom floor without replacing
that board-owned opening target.

Board content clips at the same boundary supplied to camera measurement, coverage
calculation, and input. A viewer must not paint through its measured boundary and
silently turn the visible surface into another aspect ratio.

The opening camera's natural fit may raise the interactive maximum zoom, just as the
accepted-art safety floor may already raise it. A fixed human-control cap must never
stop the initial or Reset composition from reaching the shared frame.

## Consequences

- Good: gameplay uses the complete pane visibly assigned by its UI.
- Good: every viewer still provides the same board-relative focus and padding policy.
- Good: camera measurement, accepted-art safety, input, and visible output use the
  same rectangle.
- Good: no hidden 4:3 frame competes with responsive gameplay or fixed derivatives.
- Neutral: other view surfaces retain their existing dimensions.

## More Information

- [Board render contract](../board-render-contract.md)
- [Loading contract](../loading-contract.md)
- [ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)
- [ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)
- [ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)
