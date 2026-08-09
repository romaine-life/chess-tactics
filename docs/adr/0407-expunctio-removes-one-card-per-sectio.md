---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0511](0511-held-cards-are-immutable-formations.md)'s retirement of individual-unit disposal and discounted Expunctio fees"
partially_supersedes:
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s two-movement inventory"
refines:
  - "[ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)"
  - "[ADR-0380](0380-run-save-versions-always-migrate.md)"
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)"
---

# ADR-0407: Expunctio removes one card per Sectio without sale arbitrage

## Context

Alienatio relinquishes an individual unit for gold but deliberately leaves its card in the
Chartulary. That dilution is the tradeoff: the player may liquidate army value, but the emptied
or weakened card remains a possible Klerosis draw. Removing a card is consequently more valuable
than selling one of its units and cannot be another sale action.

The Run did not yet have the separate paid operation, its one-use visit state, or a reset-complete
snapshot for card-owned loss history. Front Lines was marked removable but no player surface or
model transition could actually remove it.

## Decision

- **Expunctio** is the third movement within Sectio. It removes one held card from the Chartulary
  at most once during each Sectio visit. It is available in the opening and every post-Battle
  Sectio.
- Expunctio costs the card's full printed value plus the standard piece value of every unit still
  attached to it. Selling a unit through Alienatio therefore discounts the later removal price by
  that unit's full standard value, while Alienatio returns only half that value, or three quarters
  with Fair Scales. Even after every attached unit is sold, their proceeds cannot fully pay the
  card's remaining printed-value fee.
- Payment removes the card, every unit still attached to it, and card-owned target/loss state.
  It grants no proceeds. An emptied card still costs its full printed value.
- **His Grace** is permanently unavailable to Expunctio. Front Lines and ordinary acquired cards
  are removable. A card admitted during the current Sectio may also be removed; the one visit
  transaction records both movements exactly.
- Expunctio is immediate like Adlectio and Alienatio. **Reset Sectio** restores the exact entry
  cards, units, Pestiferous losses, gold, and operation availability without rerolling offers.
- Sectio exposes Expunctio as its own addressable, scene-authored workspace using the canonical
  held-card face. The workspace shows the remaining attached units, exact fee, permanent
  unavailability of His Grace, and whether the movement has already been spent this visit.

## Persistence transition

- `RunSaveVersion` advances from 19 to 20. Sectio gains one nullable `expunctedCard` transaction
  record, and its entry snapshot gains `pestiferousLosses` so Reset can restore a removed
  Pestiferous card losslessly.
- Browser migration advances version 19 to the exact version-20 shape. Append-only database
  migration 57 performs the same transform for account Runs and advances their CAS revision.
- The current validator accepts zero or one Front Lines card while still requiring exactly one
  intact His Grace. It validates the Expunctio record, price, removed membership, and the remaining
  Adlectio sequence rather than treating a legitimately removed card as corrupt.

## Consequences

- Alienatio can improve immediate liquidity but worsens future Klerosis density until the player
  pays the deliberately stronger Expunctio cost.
- Removing a dense intact card is expensive; removing a card after its units have been sold or
  lost is cheaper without ever becoming free or self-financing through Alienatio.
- The once-per-visit limit and exact reset state survive reload and account handoff instead of
  existing only in presentation state.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
