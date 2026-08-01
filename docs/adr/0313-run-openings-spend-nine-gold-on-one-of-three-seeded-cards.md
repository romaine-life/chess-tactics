---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0317](0317-run-shops-allow-every-affordable-card-purchase.md)'s removal of the one-opening-card purchase cap"
  - "[ADR-0316](0316-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s eight-gold budget and 1–8 opening range"
  - "[ADR-0315](0315-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s replacement of the opening-specific transaction with the normal Shop"
  - "[ADR-0314](0314-run-openings-begin-with-only-the-permanent-king.md)'s removal of the three free starting Pawns"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s fixed two-choice six-point opening draft"
extends:
  - 0271-core-cards-become-affected-when-drawn.md
  - 0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0313: Run openings spend nine gold on one of three seeded cards

## Context and Problem Statement

The original Run opening always dealt two different six-point bundles from a
five-entry list and granted one for free. Although the compositions differed,
every start presented the same price and almost the same army value. The owner
wants the opening to participate in the card economy: give the player money and
deal three cards with random values so both the roster and carried gold vary.

## Decision Drivers

- Every core Units card should be able to appear at the start of a Run.
- The opening must remain one quick, legible choice rather than becoming a full
  multi-purchase shop transaction.
- Values and compositions must be seeded, persisted, and stable across reload.
- Low-value cards should not be crowded out by the greater number of high-value
  compositions in the 49-card core deck.
- The player must never be dealt an opening card they cannot afford.

## Considered Options

- Give six gold and draw only cards worth six or less.
- Give nine gold and shuffle three cards directly from the 49-card core deck.
- Give nine gold, sample three distinct values uniformly from one through nine,
  then sample one core composition at each value.

## Decision Outcome

Chosen: **start with nine gold and buy exactly one of three seeded standard
Units cards whose values are sampled uniformly without replacement from one
through nine.**

- The permanently retained King and three starting Pawns remain unchanged.
- A fresh Run begins with exactly 9 gold.
- Opening generation shuffles the nine possible whole-gold values and takes
  three distinct values. For each value, it deterministically selects one of
  the core card compositions with that exact value.
- All three complete offers are persisted in the active Run document. Reload,
  continuation, navigation, and inspection do not reroll them.
- The player buys exactly one offer. Its whole-gold value is deducted, its units
  join the persistent army, its card becomes an owned standard card, and every
  unspent gold remains available for later shops.
- Opening offers are standard cards. Ataraxia shop effects do not affect them
  unless a later decision explicitly extends those effects to the opening.
- Active Run format 6 owns the new opening. An uncommitted older opening is
  deterministically upgraded to the new 9-gold three-card deal. A Run that has
  already left its opening retains its committed army and economy.
- Studio Card Layout exposes an adjustable deterministic opening seed and the
  resulting three card identities and values, so the distribution remains
  inspectable without creating or abandoning persistent Runs.

Directly shuffling the 49 core cards was rejected because values with more
compositions would appear more often. Six starting gold was rejected because it
would exclude every seven-, eight-, and nine-gold card from the opening pool.

### Consequences

- Good: all 49 core cards can appear in an opening while all three offers remain
  affordable.
- Good: choosing a cheaper roster preserves more gold, creating an immediate
  economy-versus-force decision and more varied later shops.
- Good: distinct uniformly sampled values make the opening visibly varied even
  when two compositions happen to use similar unit roles.
- Cost: opening strength is no longer fixed at six points, so authored first
  Battles must tolerate a wider persistent-army range.
- Cost: legacy uncommitted openings change when first normalized to format 6.

## More Information

- [Game concept](../game-concept.md)
- [Persistence contract](../persistence.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0271](0271-core-cards-become-affected-when-drawn.md)
- [ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)
