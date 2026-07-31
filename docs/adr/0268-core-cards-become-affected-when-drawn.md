---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0262](0262-run-cards-keep-core-identities-while-units-carry-modifiers.md)'s unresolved relationship between core cards and modified instances"
  - "[ADR-0266](0266-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)'s deferred Pestiferous marking point"
---

# ADR-0268: Core cards become affected when drawn

## Context and Problem Statement

The 49 authored compositions need stackable unit modifiers and occasional
Pestiferous status, but adding a separate deck entry for every affected variant
would inflate the deck and give one composition several simultaneous chances
to appear. The owner instead intends an undesirable affected reveal to consume
that core card's opportunity in the current shuffle.

## Decision Drivers

- The core deck should remain understandable as 49 authored cards, not an
  enumerated modifier product.
- Effects should create volatile offers without multiplying the probability of
  drawing one particular composition.
- Passing an undesirable affected version should matter because a clean copy is
  not waiting beside it in the same deck.
- Reload and Reset Shop may not reroll a revealed card into a more favorable
  state.

## Considered Options

- Add every modified composition as another persistent core-deck entry.
- Create several variant copies of each core card and shuffle them together.
- Keep exactly one entry per core composition and affect its particular offer
  when drawn.

## Decision Outcome

Chosen: **the deck remains the 49-card core set; a core card becomes a
particular affected card only when it is drawn into an offer.**

- Each shop shuffles the same 49 core identities and reveals the normal three
  or relic-modified four. Modifier variants never become additional core-deck
  entries or additional chances to draw that composition.
- Revealing a core card deterministically creates its offer instance. That
  instance rolls particular units and their stackable modifiers. Under The
  Great Mortality, this is also when the offer receives its approximately
  one-in-eight Pestiferous roll.
- The revealed offer's effects, unit assignments, price, and random provenance
  are persisted as shop state. Reloading, leaving and returning, or Reset Shop
  restores the exact affected offers rather than rerolling them.
- Buying the offer promotes that exact affected instance into the player's
  persistent deck. Its modifiers and Pestiferous status do not reroll after
  purchase.
- Passing the offer discards that affected instance when the shop closes. The
  underlying core identity remains part of the 49-card deck and may be drawn
  again by a later deterministic shop shuffle, where it receives a new affected
  instance.
- Consequently, if a desired core composition appears with an unwanted effect,
  the player cannot look for an unaffected duplicate in that reveal. Passing it
  spends that composition's appearance for the current shuffle, and seeing it
  again depends on a later shop selecting the same one-of-49 core identity.
- Opening-draft modifier behavior remains a separate decision; this record
  governs ordinary core-deck shop draws.

### Consequences

- Good: the authored deck remains exactly 49 understandable identities while
  each Run and shop can produce substantial mechanical variety.
- Good: effects alter the value of a scarce draw instead of quietly increasing
  the frequency of popular compositions through variant copies.
- Good: deterministic persisted offers preserve the existing Reset Shop
  contract.
- Cost: shop state can no longer persist only core card ids; it must eventually
  store or deterministically reproduce complete affected offer instances.
- Cost: a player may see a wanted composition in an unwanted form and have no
  duplicate route to it in that shop, which is intentional pressure.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0262](0262-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0266](0266-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)

