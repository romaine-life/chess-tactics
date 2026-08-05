---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)'s commit-on-landing and inert-Sectio clauses"
  - "[ADR-0388](0388-remaining-shop-cards-settle-into-their-new-seats.md)'s inert-Sectio and moving-target prohibition"
refines:
  - "[ADR-0043](0043-ui-motion-system.md)"
  - "[ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md)"
---

# ADR-0431: Sectio transactions never wait for presentation

## Context

Adlectio originally treated one card transfer and the following survivor FLIP as a single locked
gesture. A full-screen continuity shield intercepted input, the complete Sectio viewport and its
phase controls became inert, every remaining card was disabled, and the model transaction waited
for the transfer to land. The player therefore had to watch one animation finish before buying a
different affordable card.

The lock protected presentation rather than game state. `performAdlectio` already validates the
exact offer against the latest Run, refuses a duplicate, and prices it against the current gold
balance. Delaying that transition made animation an unnecessary owner of state and made the
browser implementation feel slower than an equivalent game-engine interaction.

## Decision

- A valid Adlectio commits atomically on its click against the latest `RunDocument`. The updated
  gold, army, held card, and available-offer set become authoritative immediately. Per-card
  affordability and model legality remain enforced; animation state is never a legality input.
- The clicked face is measured before that commit and may travel to the Chartulary as a
  presentation-only snapshot. Missing geometry skips only the visual. Landing removes only the
  transient pixels and performs no gameplay mutation.
- Card flights are independent director-continuity contributions with unique instance identities.
  Any number may coexist, and starting a later flight never replaces, queues behind, or settles an
  earlier one.
- No card flight or survivor FLIP may install an input shield, make the Sectio viewport or Controls
  inert, disable another otherwise-legal card, or guard a Sectio action. Reset, Continue, the Sectio
  views, and other offers remain operable while presentation runs.
- A survivor remains a real click target while it is settling. If another Adlectio changes the row
  during that FLIP, the row captures each remaining survivor's current interpolated rectangle and
  begins the replacement FLIP there, preserving visual continuity without serializing input.
- Each accessible Adlectio announcement occurs at transaction commit. The transfer is not exposed
  as application busy state because it has no pending application work.
- Director deactivation or unmount may cancel obsolete transient pixels. This cannot lose or
  duplicate an Adlectio because the animation owns no state.

## Consequences

- Multiple affordable cards can be bought as quickly as the player can select them, while every
  corresponding transfer continues toward the Chartulary.
- Gold and duplicate protection stay exact under rapid input because every click reads the latest
  synchronously committed Run rather than reserving value in presentation state.
- Motion remains useful feedback, but a slow, interrupted, backgrounded, or unavailable animation
  can no longer slow down or alter play.

## More Information

- [UI kit standard](../ui-kit-standard.md)
- [Shared UI primitives](../shared-ui-primitives.md)
