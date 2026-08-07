---
status: superseded by ADR-0510
date: 2026-08-05
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0510](0510-held-cards-are-immutable-formations.md)"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)"
  - "[ADR-0486](0486-run-disposal-prices-use-directional-gold-marks.md)"
---

# ADR-0487: Expunctio selection swaps content within persistent seats

## Context

Expunctio correctly began with no selected unit, but its unselected Alienatio return collapsed to
one dash. Selecting a unit then inserted the native 64×64 gain mark, increasing that branch's
height and pushing Aliene and the Expunctio fee down before the fixed card action stopped moving.
The resulting reflow made the card companion feel like a document being rewritten rather than a
persistent physical control panel.

Units can also expose different compact ability sets. Allowing those contents to determine row
height would repeat the same movement while cycling between units.

## Decision

- Every card with attached units permanently reserves one 64px Alienatio-return seat, one 20px
  compact-trait band, and the existing fixed picker and action seats before any unit is selected.
- The unselected return renders its dash inside the mounted directional-amount primitive without
  drawing the gain icon. A retained King replaces that dash with Retained in the same seat.
- Selecting or cycling a unit swaps only the name, identity, traits, return contents, button label,
  and stationary card highlight. It does not change the companion's section rectangles, move a
  control, scale a control, or animate layout.
- Compact traits stay on one reserved line. Current Run abilities fit that band; a later ability
  expansion must deliberately revise the shared seat contract rather than silently reintroduce
  wrapping reflow.
- Live desktop verification compares the companion, copy, picker, trait, return, Aliene, fee, and
  Athetize rectangles before and after selection; each must remain coordinate-identical.

## Consequences

- Expunctio reads as a stable physical panel whose indicators change in place.
- The gain icon still appears only after the player deliberately selects a sellable unit.
- Empty space in the unselected return is intentional reserved mechanism, not missing content.

## More Information

- [Explicit Expunctio unit selection](0483-expunctio-unit-selection-is-explicit.md)
- [Directional Run gold marks](0486-run-disposal-prices-use-directional-gold-marks.md)
- [Shared UI primitives](../shared-ui-primitives.md)
