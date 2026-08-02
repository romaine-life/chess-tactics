---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0347](0347-opening-shop-purchases-are-optional.md)'s removal of the retained mandatory opening purchase"
partially_supersedes:
  - "[ADR-0319](0319-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)'s exactly-one opening purchase"
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s inherited one-card-per-visit Shop behavior"
  - "[ADR-0322](0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s disabled remaining cards and singular format-9 purchase field"
extends:
  - 0230-run-shops-separate-buying-army-inspection-and-selling.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0323: Run Shops allow every affordable card purchase

## Context and Problem Statement

The shared Run Shop inherited a singular purchase field and disabled every
remaining card as soon as one card was bought. That restriction applied to both
opening and post-Battle Shops. It was not communicated by the ordinary Shop
model and conflicts with the owner's rule that this surface is simply the one
normal Shop.

## Decision Drivers

- Opening and post-Battle Shops must have the same purchasing semantics.
- Gold and per-card availability should determine what can be bought.
- A player must never purchase the same dealt card twice.
- Every completed purchase must retain the explicit **Purchased** feedback.
- Reset and cross-device persistence must cover the complete visit.

## Decision Outcome

Chosen: **every dealt Shop card may be purchased once while the player has
enough gold. Buying one card does not disable another affordable card.**

- The one shared `buyCard` transaction rejects only an unknown offer, an offer
  already bought during this visit, or a price greater than the current gold.
- `purchasedCardOfferIds` records the visit's purchases in order. Each bought
  offer remains disabled and displays **Purchased**; each unbought offer is
  independently enabled whenever affordable.
- The opening Shop still requires at least one card purchase before Continue,
  but it does not impose a maximum. Post-Battle Shops have the same absence of
  a purchase-count cap.
- Reset Shop restores the entry snapshot and empties the purchase collection
  without rerolling the deal.
- Active Run format 10 owns the purchase collection. Current writes reject the
  retired singular field. Older documents already inside a Shop are unsupported
  rather than adapted through a compatibility field; committed Runs outside a
  Shop may receive the standing current-format normalization.
- An unsupported account Run is treated as unavailable without discarding its
  CAS revision or the user's signed-in state. Starting a fresh current-format
  Run replaces that retired document through the normal versioned write.
- Shop copy describes cards as independently affordable purchases rather than a
  single choice.

### Consequences

- Good: the screen behaves as one ordinary Shop in every Run position.
- Good: carried gold creates meaningful opportunities to buy multiple cards.
- Good: persisted purchase feedback remains exact for every bought offer.
- Cost: a pre-format-10 Run saved while inside a Shop must be restarted.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)
- [ADR-0322](0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)
