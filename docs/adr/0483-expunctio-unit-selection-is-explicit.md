---
status: "accepted; highlight palette superseded by ADR-0488"
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by: "[ADR-0488](0488-expunctio-unit-selection-uses-one-blue-mark.md)"
partially_supersedes:
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)'s initially selected unit, cycle-primary interaction, and rejection of direct figure selection"
refines:
  - "[ADR-0427](0427-run-unit-controls-are-keyboard-and-touch-operable.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)"
---

# ADR-0483: Expunctio unit selection is explicit

## Context

Selecting the first attached unit as soon as Expunctio opens makes an ordinary card look as if
the player has already begun an Alienatio decision. Raising and enlarging that figure changes the
authored unit row merely because the workspace is visible. The gold selection glow also competes
with the card's parchment and gold paint, especially on dense cards.

The card face already exposes the exact figures a player means to inspect. Direct selection can
therefore make intent immediate, while the cycle control remains necessary for touch, keyboard,
and dense repeated-unit rows.

## Decision

- Every Expunctio card starts with no attached unit selected. Until the player chooses one, its
  Alienatio picker names the required action, shows no return, and keeps **Aliene** unavailable.
- Every occupied unit figure on the canonical face becomes a real labelled button in Expunctio
  only. Clicking or keyboard-activating that figure selects the exact stable Run unit projected
  into its authored card seat. Other card hosts remain non-interactive.
- With no selection, Next selects the first attached unit and Previous selects the last. After a
  selection, both controls cycle through the attached units in stable card-seat order.
- Selection never changes a figure's position or scale. The selected figure keeps its authored
  geometry and receives a stationary high-contrast magenta edge and dark-violet glow, deliberately distinct from
  the card's parchment, gold, and blue unit paint. Pointer hover may show a lighter cyan cue
  without committing selection.
- Selection is presentation state, is not persisted, and clears when its unit leaves the card.

## Consequences

- Opening Expunctio is visually neutral; a highlight always means the player deliberately chose
  that unit during the current interaction.
- Pointer users can select the intended figure directly, while arrow, keyboard, and touch users
  retain the same exact identity and transaction.
- Dense identical stacks remain stationary, so comparison does not disturb the authored card
  composition.

## More Information

- [ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)
- [Shared UI primitives](../shared-ui-primitives.md)
