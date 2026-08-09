---
status: superseded
date: 2026-08-05
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0485](0485-expunctio-unit-pointer-targets-include-the-visible-outline.md)"
refines:
  - "[ADR-0427](0427-deployment-cards-retain-their-authored-seat-geometry.md)"
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)"
---

# ADR-0484: Expunctio unit pointers follow sprite alpha

## Context

ADR-0483 makes an attached unit's visible silhouette glow on hover and selection, but the semantic
button behind that sprite is necessarily rectangular. Letting the complete rectangle trigger its
hover and click makes transparent pixels behave as if they belong to the visible outline. The
interface then teaches a target boundary that its pointer behavior does not honor.

The card renderer already reads each source sprite's alpha pixels to measure its visible width.
That same canonical measurement can define pointer behavior without another authored hit shape.

## Decision

- Expunctio pointer hover and click use the actual alpha pixels of the installed unit sprite. The
  cached source measurement retains a one-bit visible-pixel mask using the renderer's existing
  alpha threshold.
- Pointer coordinates inside the stable rectangular semantic button map back into the sprite's
  source pixels. Only a visible source pixel enables the pointer cursor and hover glow or commits
  direct selection; transparent source pixels are inert.
- The semantic button remains rectangular for focus layout and accessibility. Keyboard activation
  has no pointer coordinate and therefore activates the focused unit directly. The Previous and
  Next controls remain unchanged.
- The hit mask is derived at runtime from the same installed pixels the player sees. It is neither
  a parallel hand-authored outline nor persisted gameplay state.

## Consequences

- The visible hover outline is the pointer target the player can trust, including transparent
  corners inside a unit's layout seat.
- Pointer and keyboard users retain one exact stable-unit selection result even though their input
  geometries differ appropriately.
- Sprite replacement automatically changes the pointer silhouette with its alpha pixels; there is
  no separate hit-shape asset to drift.

## More Information

- [ADR-0483](0483-expunctio-unit-selection-is-explicit.md)
- [Shared UI primitives](../shared-ui-primitives.md)
