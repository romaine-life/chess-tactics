---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s clause that opening Shop offers never receive Ataraxia shop effects"
  - "[ADR-0327](0327-tactical-cards-roll-one-in-eight-and-may-cost-twelve.md)'s standard-only opening Shop cards"
extends:
  - 0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md
  - 0323-run-shops-allow-every-affordable-card-purchase.md
  - 0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md
  - 0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md
---

# ADR-0344: Opening Shop cards roll qualifiers inside the starting budget

## Context

Qualifiers were defined as a property roll performed when a card is drawn, but the
opening Shop generated its three offers through a separate path that hard-coded
`cardType: null`, and the server pinned every opening offer to `cost === value`.
A Run's first three cards — the ones that shape the whole army — were therefore
the only draws in the game that could never be Tactical, Concinnous or
Pestiferous. The owner requires the opening to draw like every other Shop.

The opening is also the one Shop with a fixed budget and a required purchase:
ADR-0322 trimmed the opening value pool to 1–8 gold precisely so every offered
card is buyable with the starting eight gold, and ADR-0323 disables Continue
until a card is bought. A three-gold Discipline surcharge applied blindly could
therefore produce an opening whose every offer is unaffordable, which is a
soft-locked Run rather than a hard choice.

## Decision

- **Opening draws roll like any other draw.** Each opening offer runs the same
  `createRunCardOffer` path as a post-Battle offer: the authoritative
  one-in-eight denominators, the Tactical → Pestiferous → Concinnous precedence,
  the shared affected pricing, and the seeded, persisted effect targets.
  Pestiferous remains gated on Ataraxia I, so No Ataraxia openings roll only
  Tactical and Concinnous.
- **Opening draws own their roll index space.** They roll at index `-1` rather
  than `0`, because the Shop after Battle 1 is also `battleIndex` 0; without a
  separate space a core identity offered in both places would mirror its own
  qualifier.
- **A qualifier the starting budget cannot carry is dropped.** If the qualified
  price would exceed `RUN_STARTING_GOLD`, the offer keeps its core identity and
  is offered standard at its core value. The qualifier is dropped, never
  repriced, and never cascades to a cheaper qualifier. Pestiferous discounts, so
  it is never dropped. Every opening offer therefore stays buyable and the
  required opening purchase is always reachable.
- **The server validates the opening as a Shop, not as a fixed list.** The
  opening contract keeps its pins on phase, indices, offer count, distinct
  values, empty Loot/paid-relic state and starting army, but its offers are now
  checked by the same shared qualifier and affected-pricing rules as every other
  Shop, plus the requirement that every opening offer cost at most eight gold.
- **No active-Run format bump.** The document shape is unchanged and only the set
  of legal values widens, while a bump would make every in-progress Shop document
  unsupported.
- Card Layout reports the opening sample with its rolled qualifier and price, and
  states the budget rule, so the instrument matches runtime.

## Consequences

- Good: the Run's first decision now carries the same texture as every later
  Shop, and an opening Tactical or Concinnous card can shape the army from
  Battle 1.
- Good: no seed can produce an opening that cannot satisfy its own required
  purchase.
- Cost: the qualifier rate is not flat across the opening value pool. Tactical
  cannot appear at core values 6–8 and Concinnous cannot appear at 7–8, so
  measured over 20,000 seeded openings at No Ataraxia 7.8% of offers are Tactical
  and 8.0% Concinnous — below the 12.5% and 10.9% seen in later Shops — and about
  41% of openings contain at least one qualified card.
- Cost: opening offers are no longer derivable as "cost equals value", so a
  reader of a stored Run must consult `cardType` to explain an opening price.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0327](0327-tactical-cards-roll-one-in-eight-and-may-cost-twelve.md)
- [ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)
