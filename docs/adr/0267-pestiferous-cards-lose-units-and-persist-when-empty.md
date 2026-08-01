---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0269](0269-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)"
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s exclusive permanent-unit-removal rule"
---

# ADR-0267: Pestiferous cards lose units and persist when empty

## Context and Problem Statement

Plagued began as a temporary unit modifier, but removing every affected unit at
once felt less like attritional disease and created no lasting consequence for
a future deck that draws persistent cards rather than freely selecting roster
units. If units can fall away from a card, the system also needs an explicit
answer for the card after its final unit is gone.

## Decision Drivers

- Disease should feel like gradual, uncertain attrition rather than a timer
  that deletes an entire group at once.
- The card is a persistent container; its unit instances can change without
  changing its core identity.
- Later difficulty may introduce punitive deck burdens without making the
  baseline Run carry them.
- Random loss must be seeded and persisted so reloads and retries cannot reroll
  it.

## Considered Options

- Remove every Plagued unit after one Battle and automatically remove an empty
  card.
- Remove one random unit per Battle, then automatically remove the empty card.
- Remove one random unit per Battle and retain the Pestiferous card as an empty
  deck burden.

## Decision Outcome

Chosen: **Pestiferous is a hostile card property that causes gradual unit loss
and survives its contents.**

- A card **is Pestiferous**. Every unit instance it contains is Plagued; the
  unit modifier remains instance state and uses ADR-0265's stepped discount.
- A Pestiferous card can permanently lose **at most one** remaining Plagued unit
  when one Battle's plague attrition resolves. The chosen unit is random,
  seeded, and persisted.
- Battle failure and retry do not provide additional plague rolls. Resolution
  belongs to persisted Battle advancement rather than an attempt that can be
  replayed.
- After its final unit is removed, the Pestiferous card remains in the deck as
  an empty nuisance and possible dead draw. It never cleans itself up merely
  because it is empty.
- Removing that empty card requires an explicit card-removal effect, such as a
  future relic or paid shop service. The exact removal mechanisms remain
  undecided.
- It remains undecided whether plague attrition applies to every owned
  Pestiferous card on advancement or only to a card drawn or deployed for that
  Battle. That eligibility decision must be made before implementation; either
  way, no eligible card loses more than one unit per Battle advancement.
- **The Great Mortality**, introduced by ADR-0266, is the first Ataraxia that
  permits this card type to appear. Offer frequency and guarantees remain
  tuning decisions.

### Consequences

- Good: mixed cards erode one unit at a time, and the randomly selected loss can
  change the tactical value of the surviving composition.
- Good: empty persistence makes the card itself, rather than only its units, a
  meaningful difficulty object.
- Good: the card property has clean table language: “This card is
  Pestiferous.”
- Cost: persistent card contents, removal history, and deterministic random
  outcomes must become saved Run state before the mechanic can ship.
- Cost: the draw/deployment eligibility seam remains an explicit blocking
  design decision for implementation.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md)
