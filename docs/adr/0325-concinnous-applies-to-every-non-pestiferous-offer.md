---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)'s one-through-nine and single-digit cost limit"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)'s one-digit cost description"
  - "[ADR-0310](0310-concinnous-offers-use-a-seeded-one-in-eight-eligible-roll.md)'s nine-gold eligibility ceiling"
extends:
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)"
---

# ADR-0325: Concinnous applies to every non-Pestiferous offer

## Context

ADR-0310 limited Concinnous eligibility to core cards whose ordinary value plus
the two-gold Positioned premium did not exceed nine. Because only 26 of the 49
core cards satisfy that ceiling, a one-in-eight eligible roll produced
Concinnous on only about one in fifteen shop cards at Ataraxia 0. The intended
experience is approximately one affected card in eight, and the premium is
allowed to raise a card beyond the ordinary core deck's nine-gold maximum.

## Decision

Every otherwise ordinary shop offer independently receives the existing seeded
**one-in-eight Concinnous roll**, regardless of its ordinary card value.

- Ataraxia I still resolves Pestiferous first. Only a non-Pestiferous offer may
  become Concinnous, so an offer retains at most one affected qualifier.
- A Concinnous offer costs its ordinary value plus two gold. Ordinary
  nine-gold cards therefore cost eleven when Concinnous; eight-gold cards cost
  ten. The price is not capped or discounted to fit the coin.
- Run-card costs remain positive whole gold. The shared live coin renders costs
  from 1 through 11, including two live digits in the same coin; numbered coin
  artwork remains forbidden.
- At Ataraxia 0, Concinnous appears on exactly one in eight offers in
  probability. At Ataraxia I, Pestiferous precedence makes the absolute
  Concinnous probability seven in sixty-four, or about one in 9.1 offers.
- Target selection, persistence, purchase behavior, and the two-gold premium are
  unchanged.
- Card Layout exposes costs 10 and 11 as owner-operable preview states and its
  deterministic prevalence sample includes every core card.

## Consequences

- Good: the displayed frequency now matches the intended approximately
  one-in-eight experience across the complete 49-card deck.
- Good: high-value cards participate in the same qualifier system instead of
  forming an unexplained immune tier.
- Good: the cost remains literal; no cap silently erases part of Positioned's
  price.
- Cost: the compact coin must legibly support two digits.
- Cost: eleven-gold offers require the player to carry enough gold before they
  can be purchased.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)
- [ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)
- [ADR-0310](0310-concinnous-offers-use-a-seeded-one-in-eight-eligible-roll.md)
