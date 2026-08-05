---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0027](0027-icon-optical-keylines.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
partially_superseded_by:
  - "[ADR-0446](0446-expunctio-tiles-use-shell-surface-and-oak-actions.md)'s removal of the repeated heading; its first-line ink inherits the same top keyline"
---

# ADR-0445: Card companions align to painted frame keylines

## Context

The Expunctio gallery aligned the canonical card canvas and its adjacent action
as CSS rectangles. Their DOM edges agreed exactly, but the card frame is painted
inside a transparent 1060×1484 canvas while the button's nine-slice reaches its
own border box. The visible card rail therefore ended about twelve rendered
pixels before the visible action rail. The heading line box likewise shared the
card canvas top while its ink and the card's first painted pixel did not.

Moving the card to the grid's lower edge aligned only one invisible rectangle and
could not make the painted top and bottom agree simultaneously.

## Decision

- Canonical card-frame geometry records the tight native-pixel paint bounds for
  every accepted frame identity alongside its plate boxes.
- A card companion shares the card's responsive 5:7 height. Its block-start and
  block-end insets derive from the active frame's paint bounds and the rendered
  card width, never from a screen-specific fixed nudge.
- The first heading aligns by visible cap-height to the painted top keyline. The
  adjacent action's painted lower rail aligns to the card's painted lower
  keyline. Transparent canvas, shadows, and line boxes are not alignment edges.
- Responsive layouts recompute the insets from the same frame ratios. Once card
  and companion stack, the cross-column optical alignment is released.

## Consequences

- DOM rectangles may intentionally disagree so the artwork agrees.
- All frame variants remain usable without Expunctio knowing their pixel files;
  the shared geometry supplies the active optical bounds.
- Future card-adjacent surfaces can reuse the same measured keylines instead of
  rediscovering transparent-canvas offsets by eye.
