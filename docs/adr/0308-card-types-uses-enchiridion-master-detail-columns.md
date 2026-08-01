---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0254](0254-enchiridion-content-owns-the-remaining-menu-canvas.md)"
  - "[ADR-0306](0306-enchiridion-filters-cards-and-previews-affected-types.md)"
  - "[ADR-0307](0307-run-card-presentations-promote-atomically.md)"
---

# ADR-0308: Card Types uses the Enchiridion master-detail columns

## Context

ADR-0306 established four affected-card records, but its first presentation
rendered all four card faces in a grid inside the Enchiridion content area. The
rest of the main-menu reference workspace already reads as four columns: the
main rail, Enchiridion section rail, record selector, and selected-record
detail. Four simultaneous previews discard that established selector/detail
language and make each card too small to serve as the reference authority.

## Decision

- Card Types uses the remaining Enchiridion canvas as a master-detail pair. Its
  four affected-type names are selectable rows in the third column, and exactly
  one selected canonical `RunCardFace` occupies the fourth column.
- **Pestiferous** is the initial selection. Type selection is local to the open
  reference surface; individual affected types do not gain routes or persisted
  selection state.
- The two provisional rows retain an explicit **Provisional** status, while
  the selected card itself owns the visible type name and effect. No separate
  description card competes with it in the detail column.
- Both the main-menu Enchiridion and Battle-hosted Strategikon use the same
  component and selection behavior.
- Changing the selected type keeps using ADR-0307's atomic `RunCardFace`
  promotion, so a newly selected type's text, frame, art, and unit imagery
  become visible as one presentation.

## Consequences

- The Card Types destination now completes the intended four-column menu
  composition instead of displaying a gallery inside the content columns.
- A card remains large enough to read, and only one affected-type record is the
  visible authority at a time.
- The provisional records remain honest without requiring placeholder routes
  or runtime mechanics.
