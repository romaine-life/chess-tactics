---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md)'s deferred unlock and stacking rules"
partially_superseded_by:
  - "[ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md)"
---

# ADR-0268: Ataraxia unlocks linearly and stacks cumulatively

## Context and Problem Statement

ADR-0266 established No Ataraxia and the first historically named difficulty
condition, but deferred its unlock cadence and whether later conditions replace
or accumulate with earlier ones. A difficulty ladder needs one predictable
answer before additional historical conditions are designed.

## Decision Drivers

- Progression should be legible and should not ask the player to choose which
  rule becomes available next.
- A later difficulty must preserve the lessons and pressures introduced by its
  predecessors.
- The historical event title should identify one added condition without
  pretending the complete difficulty consists only of that event.

## Considered Options

- Unlock multiple independent conditions and let the player assemble them.
- Make each Ataraxia replace the previous condition.
- Unlock one fixed next tier per completed Run and stack every earlier tier.

## Decision Outcome

Chosen: **Ataraxia is one linear, cumulative sequence.**

- The first Run is **No Ataraxia**.
- Completing the highest currently available tier unlocks exactly the next
  tier. The sequence has no branching choice and never skips a tier.
- Selecting Ataraxia `N` applies the conditions from every tier `1...N`.
  Ataraxia II therefore retains **The Great Mortality** and adds its own named
  historical condition.
- The player's earlier ability to choose No Ataraxia or an unlocked tier is
  unchanged; the thing they cannot choose is which tier unlocks next or which
  lower-tier conditions to omit from a selected higher tier.
- The historical identity and mechanic of Ataraxia II remain undecided.

### Consequences

- Good: every completion at the available ceiling advances that ceiling by one
  understandable step.
- Good: later Ataraxias become increasingly layered records of historical
  pressure rather than disconnected mutators.
- Cost: each new condition must remain compatible with the entire preceding
  stack.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md)
