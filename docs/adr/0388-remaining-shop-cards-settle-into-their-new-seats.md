---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)'s replacement of the Shop terminology with Sectio"
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s replacement of purchase terminology with Adlectio"
  - "[ADR-0431](0431-sectio-transactions-never-wait-for-presentation.md)'s interactive survivor FLIP and non-blocking Sectio"
refines:
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)"
  - "[ADR-0043](0043-ui-motion-system.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
---

# ADR-0388: Remaining Shop cards settle into their new seats

## Context

ADR-0387 keeps a bought card's Shop seat occupied until its transfer reaches the Chartulary,
then commits the purchase and removes that offer. The remaining grid consequently changes from
three centred seats to two, or from two centred seats to one. Letting layout paint the new
positions immediately makes every surviving card jolt sideways at the exact moment the transfer
finishes. The destination is explained, but the Shop loses spatial continuity.

This is not one left-to-right special case. Buying the left, middle, or right card from three
produces different survivor vectors, as does buying either card from two. Installed band wraps
also compute their seats differently from the ordinary centred grid.

## Decision

- The purchase still commits when the Shop-to-Chartulary transfer lands. Immediately after the
  survivor layout commits, the row owner compares each surviving offer's new rectangle with its
  pre-commit rectangle by stable offer id. It applies the FLIP inverse delta, then settles that
  card from the old visual seat to the new logical seat.
- Measurement belongs to `ShopCardRow`, the owner that chooses between the ordinary grid and an
  installed band wrap. It measures the real rendered seats in either host; no purchase-position
  table, assumed card width, guessed centre, or reserved ghost seat participates at runtime.
- Every survivor moves concurrently along one straight translation. The Web Animation reads
  `--ds-duration-fade` and `--ds-ease-standard` from the live token layer, so JavaScript owns no
  duplicate duration or easing. Reflow adds no scale, opacity, arc, overshoot, bounce, or stagger.
- The complete five-case geometry is guarded: remove left/middle/right from three, and remove
  left/right from two. A survivor begins on its previous visual rectangle, occupies an
  intermediate rectangle on a later frame, and finishes exactly on the newly centred rectangle.
- Shop content and phase controls remain inert through both the transfer and the survivor settle.
  A moving card never becomes a moving click target. A row with no moving survivor unlocks
  immediately, and a missing animation capability leaves the already-correct logical layout.
- This bounded straight settle is the same narrow functional-motion exception ADR-0387 applies
  to the card transfer. Windows' reduced-motion report does not turn relocation into a teleport:
  removing the translation recreates the jolt this decision exists to prevent.
- Reset Shop and the repeatable crafted Shop remain the owner-operable replay instrument. The
  geometry table and live checks cover every survivor arrangement rather than blessing one
  agent-selected purchase order.

## Consequences

- The Shop has one continuous purchase gesture: the acquired card travels to its durable home,
  then the remaining deal calmly closes the vacated space.
- Logical state is never delayed for the reflow. The animation only explains the already-committed
  survivor layout, and canceling it cannot lose or duplicate a purchase.
- Plain and wrapped Shops inherit the same behavior because the shared row owns measurement.

## More Information

- [Game concept](../game-concept.md)
- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
