---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0268](0268-core-cards-become-affected-when-drawn.md)"
partially_supersedes:
  - "[ADR-0264](0264-pestiferous-cards-lose-units-and-persist-when-empty.md)'s deferred eligibility and frequency rules"
---

# ADR-0266: Every Pestiferous card deteriorates at one-eighth prevalence

## Context and Problem Statement

ADR-0264 left open whether plague attrition applies to every owned Pestiferous
card or only one drawn or deployed in the preceding Battle. It also deferred
how common the hostile card type should be under The Great Mortality.

## Decision Drivers

- A Pestiferous card should remain a liability even when the deployment draw
  leaves it behind.
- Drawing or withholding one infected card should not protect every other
  infected card in the deck.
- The condition should be encountered often enough to shape a Run without
  replacing the ordinary card pool.
- Frequency must remain tunable until the modified deck-construction rule is
  settled and playable.

## Considered Options

- Deteriorate only Pestiferous cards drawn or deployed for the Battle.
- Select one owned Pestiferous card to deteriorate after each Battle.
- Deteriorate every owned Pestiferous card independently after each Battle.

## Decision Outcome

Chosen: **every owned nonempty Pestiferous card loses one unit on each persisted
Battle advancement, whether or not that card was drawn or deployed.**

- Each card resolves independently and uses ADR-0264's seeded, persisted random
  choice among its remaining Plagued units.
- Empty Pestiferous cards still resolve to no unit loss and remain in the deck
  until an explicit removal effect purges them.
- Under **The Great Mortality**, the initial tuning target is approximately
  **one Pestiferous card per eight otherwise eligible card instances**.
- One eighth is a prevalence target, not yet a promise about the randomization
  algorithm. Whether the deck is marked during Run construction or card
  instances are marked as they enter it remains coupled to the unresolved
  modified-deck construction decision.
- The eventual owner-operable tuning surface must expose the probability and
  the resulting realized distribution. There is no hidden hard-coded frequency
  outside the canonical generator.

### Consequences

- Good: every infected card matters every Battle, making deck composition and
  empty-card removal strategically relevant.
- Good: the expected one-eighth share introduces the mechanic as persistent
  pressure rather than the dominant identity of every offer.
- Cost: several Pestiferous cards can each lose a unit after the same Battle,
  making ownership of multiple infected cards substantially more dangerous.
- Cost: exact probability guarantees cannot be finalized until the deck's
  instance-generation point is chosen.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0264](0264-pestiferous-cards-lose-units-and-persist-when-empty.md)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
