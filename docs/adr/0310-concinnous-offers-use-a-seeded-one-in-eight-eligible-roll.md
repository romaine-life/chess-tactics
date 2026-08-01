---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
extends:
  - "[ADR-0271](0271-core-cards-become-affected-when-drawn.md)"
  - "[ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)"
---

# ADR-0310: Concinnous offers use a seeded one-in-eight eligible roll

## Context

ADR-0309 fixes the Concinnous mechanic and semantic identity but deliberately
leaves prevalence and eligibility open. The card now needs a complete draw-time
rule analogous to the implemented Pestiferous offer rule without allowing a
two-gold Positioned premium to violate the card face's one-through-nine cost
contract.

## Decision

Each otherwise ordinary eligible shop offer independently receives a seeded
**one-in-eight Concinnous roll** at draw time.

- Concinnous is available at every Ataraxia tier. Ataraxia I first resolves its
  existing Pestiferous roll; only a non-Pestiferous offer may roll Concinnous.
  An offer therefore has at most one affected qualifier.
- A core card is eligible only when its ordinary value plus Positioned's
  existing two-gold value is no greater than nine.
- The Concinnous roll is bound to Run seed, Battle index, shop slot, and core
  card identity. Reset Shop and reload preserve the exact result.
- When the roll succeeds, a second deterministic draw selects exactly one of
  the card's individual units with uniform probability. The selected unit
  index is stored on the offer before purchase.
- Purchase adds Positioned to that stored unit, records its persistent unit id
  on the owned card, and charges ordinary card value plus two gold. It does not
  reroll the target.
- Before purchase, the card presents Positioned with **Target hidden**. After
  purchase, the same face reveals the exact selected unit occurrence.
- Card Layout exposes the Concinnous denominator, a deterministic realized
  sample, and both hidden and revealed target states.

## Consequences

- Good: the white card is a stable wager with the same understandable baseline
  frequency as the black card.
- Good: every individual unit remains equally likely even when a composition
  contains repeated piece types.
- Good: qualified cards remain mutually exclusive and every displayed price
  fits the accepted single-digit anatomy.
- Cost: under Ataraxia I the absolute Concinnous rate is slightly below one in
  eight because Pestiferous has precedence.
- Cost: value-eight and value-nine core cards cannot become Concinnous under the
  current one-through-nine price contract.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)
- [ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)
- [ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)
