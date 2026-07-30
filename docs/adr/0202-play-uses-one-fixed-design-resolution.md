---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0226](0226-play-expands-before-ultrawide-wings.md)"
partially_supersedes:
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)'s responsive Play-seat clause"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
---

# ADR-0202: Play uses one fixed design resolution

## Context and Problem Statement

Play previously recomputed its internal tracks from the current CSS viewport.
The title bar, board seat, and HUD could therefore change geometry at responsive
breakpoints or browser zoom levels. That made the board's actual viewing pane
an unstable authority for camera framing and for comparison with other board
surfaces.

The Battle UI is one composed game screen. Browser dimensions should scale that
composition, not independently redesign it.

## Decision

Play has one canonical design canvas of **1920 × 1080 design pixels**. Within
that canvas:

- the title bar is 88 pixels high;
- the HUD is 360 pixels wide and directly adjoins the board;
- the board viewing pane is exactly **1560 × 992 design pixels**.

The whole canvas is centered and uniformly scaled by the smaller of the browser
width and height scale factors. Surplus browser space is letterboxed. Resizing
the browser or changing browser zoom may change only that outer scale; it must
not run a different Play layout, move the HUD, hide status chrome, stack the
HUD, or change the board pane's internal dimensions.

Camera measurement, accepted-art coverage, clipping, and input continue to use
the complete visible board pane established by ADR-0201. Pointer deltas are
translated from rendered browser pixels back into design pixels before camera
movement, while screen-space drag affordances use the outer scale.

This decision establishes Play as the dimensional authority. It does not by
itself alter compact stored derivative dimensions, the selected-level preview,
Level Editor workspaces, or exact-art instruments.

## Consequences

- Good: every Play load has one deterministic internal composition.
- Good: browser zoom and window size cannot create competing Play layouts.
- Good: the board/HUD seam and board camera boundary remain identical.
- Good: other board surfaces can now compare against one stable Play pane.
- Neutral: non-16:9 browser rectangles show letterbox space rather than reflow.
- Neutral: derivative and preview harmonization is a separate follow-on change
  against the now-stable 1560 × 992 authority.

## More Information

- [Board render contract](../board-render-contract.md)
- [ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)
- [ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)
