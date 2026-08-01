---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)'s independently purchasable cards and format-10 purchase collection"
partially_supersedes:
  - "[ADR-0224](0224-owner-supplied-sfx-open-as-full-source-trim-instruments.md)'s dedicated card-purchase runtime cue"
  - "[ADR-0319](0319-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)'s nine-gold budget, 1–9 opening range, and all-core-cards-reachable outcome"
  - "[ADR-0320](0320-run-openings-begin-with-only-the-permanent-king.md)'s King-only pre-purchase party"
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s current transaction vocabulary and format-8 shape"
extends:
  - 0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md
  - 0230-run-shops-separate-buying-army-inspection-and-selling.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0322: Run openings use two Pawns, eight gold, and card-native purchase feedback

## Context and Problem Statement

The normal opening Shop established by ADR-0321 made a purchase remain visible,
but its starting balance and completed state were not settled. A King-only party
with 9 gold made the chosen card the entire non-royal army. The selected card was
then identified only by a generic active-button outline, and its dedicated card
sound did not read as the same gold transaction used by Sell. The implementation
also continued to call cards by an older domain noun in model fields, actions,
components, tests, and player copy.

The owner wants a smaller guaranteed Pawn floor, a tighter budget, obvious
completion feedback, one currency sound language, and **card** as the accepted
word for every current deck entry and offer.

## Decision Drivers

- The opening should retain variety without allowing a one-Pawn card to make the
  complete non-royal party.
- Every opening offer must be affordable from the starting budget.
- A completed purchase must be legible without relying on an unexplained color
  or focus-like outline.
- Buying and selling are both gold transactions and should sound related.
- One domain concept must have one current noun from persistence through UI.
- Purchase feedback must compose the registered chrome system and preserve the
  accepted shared card face.

## Decision Outcome

Chosen: **a fresh Run starts with the King, two Pawns, 8 gold, and three cards;
purchase completion is a textual chrome state and uses the gold cue.**

- The pre-purchase army is exactly the permanent King plus `run-pawn-a` and
  `run-pawn-b`, numbered Pawn 1 and Pawn 2 with source `starting`. A purchased
  Pawn begins at Pawn 3.
- Starting gold is exactly 8. Opening generation samples three distinct values
  uniformly without replacement from 1 through 8, then samples one core card at
  each value. Nine-gold core cards remain available in later Shops but cannot be
  opening offers because they are unaffordable.
- Buying stays in the normal Shop. The bought card does not receive the generic
  `active` button class or its blue selected outline. Instead, a registered
  inner-chrome box directly beneath the unchanged card face says
  **Purchased**. The other cards remain disabled and subdued. Reset Shop removes
  the marker with the rest of the transaction.
- A successful card purchase requests `gold-sell`, the same accepted gold
  transaction cue used by Sell. The dedicated `card-purchase` runtime assignment
  is retired; historical live-media candidates do not authorize a runtime call.
- **Card** is the sole current gameplay noun. Current types, constants, fields,
  actions, components, CSS, accessibility labels, tests, and living docs use
  `RunCoreCard`, `RunCardOffer`, `RUN_CARD_DECK`, `cardOffers`,
  `purchasedCardOfferId`, `buyCard`, `cardContentsLabel`, and `RunCard`.
- Active Run format 9 owns this shape. Current writes accept only format 9 and
  the card-named Shop fields. An older Shop document is unsupported rather than
  adapted through a compatibility field path; committed Runs outside Shop may
  still receive unrelated standing identity normalization before their next
  current-format write.
- Card Layout exposes the current 8-gold budget and
  `King + 2 Pawns + selected card` opening party.

### Consequences

- Good: the opening preserves a small reliable army while the bought card still
  creates substantial roster and carried-gold variety.
- Good: every displayed opening card is affordable and the choice remains three
  visibly distinct values.
- Good: **Purchased** is explicit, visible, accessible text and does not confuse
  transaction completion with selection or keyboard focus.
- Good: Buy and Sell share one recognizable currency sound language.
- Good: current code and player copy no longer split one concept between two
  nouns.
- Cost: nine-gold cards no longer appear in opening Shops.
- Cost: pre-format-9 Shop documents are unsupported.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [ADR-0222](0222-run-sell-clink-uses-the-owner-supplied-coins-recording.md)
- [ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)
