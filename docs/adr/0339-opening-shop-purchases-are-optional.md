---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s mandatory opening purchase before Continue"
  - "[ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)'s retained mandatory opening purchase"
---

# ADR-0339: Opening Shop purchases are optional

## Context and Problem Statement

The opening uses the shared Shop transaction but uniquely disables **Continue
to first Battle** until at least one card has been purchased. No equivalent
minimum purchase exists in a post-Battle Shop. The restriction makes the first
Shop behave like a disguised draft even though the separate draft flow was
retired and the Run already begins with a playable King and two Pawns.

## Decision Drivers

- A normal Shop offers purchases; it does not require one before the player may
  leave.
- The opening party is already a legal persisted army without a card purchase.
- Affordability, selling, Reset Shop, multi-buy, and purchased feedback must
  remain one shared transaction.
- Mandatory Loot selection is a separate reward decision, not a card-purchase
  precedent.

## Decision Outcome

Chosen: **card purchases are optional in the opening Shop exactly as they are in
post-Battle Shops.**

- `canLeaveShop` has no opening-purchase branch. A Shop is blocked only when it
  owns an unresolved mandatory Loot choice.
- **Continue to first Battle** is enabled on initial entry. Continuing without
  a purchase retains the starting King, two Pawns, all eight gold, and no owned
  cards, then advances through the normal Deployment/Battle boundary.
- Buying any affordable number of dealt cards, selling units, resetting the
  visit, and continuing afterward keep their existing shared behavior.
- `kind: opening` remains progression context: it targets Battle index 0 and
  identifies the starting inventory/economy presentation. It does not authorize
  a different shopping rule.
- Opening inventory policy remains unchanged: three distinct-value standard
  offers from 1–8, no preceding Victory reward, and no Loot, paid-relic, or
  Ataraxia offer effects. Those are deal construction and Run-start context,
  not purchase requirements.
- No Run format change is required because zero purchases is already represented
  by the existing empty `purchasedCardOfferIds` collection.

### Consequences

- Good: the first Shop is voluntary commerce rather than a renamed draft.
- Good: a player may conserve all starting gold and fight with the baseline
  army.
- Good: one shared predicate now owns every card-purchase exit rule.
- Cost: players may enter Battle 1 with only the starting King and two Pawns.

## More Information

- [ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)
- [ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)
- [ADR-0338](0338-run-deployment-is-a-battlefield-state-with-conditional-input.md)
- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
