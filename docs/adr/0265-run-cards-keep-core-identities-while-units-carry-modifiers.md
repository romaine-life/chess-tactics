---
status: superseded by ADR-0492
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0271](0271-core-cards-become-affected-when-drawn.md)"
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)"
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)"
  - "[ADR-0327](0327-tactical-cards-roll-one-in-eight-and-may-cost-twelve.md)'s all-value Discipline pricing"
  - "[ADR-0328](0328-tactical-targets-are-chosen-at-acquisition-and-use-the-discipline-icon.md)'s Tactical target timing"
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s replacement of the Plagued state name"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s one-entry-per-composition bundle-deck identity"
---

# ADR-0265: Run cards keep core identities while units carry modifiers

## Context and Problem Statement

The original Run shop deck contains 49 unique piece compositions worth one
through nine standard chess points. Naming and writing flavor for every
permutation of stackable unit modifiers would turn useful variety into
forgettable generated titles. The card still has to state its exact contents
and price without decimals, while preserving the teaching value of Pawn 1,
Knight/Bishop 3, Rook 5, and Queen 9.

## Decision Drivers

- A finite core set can receive deliberate names, flavor text, and later art.
- A modifier belongs to one particular unit instance, and one unit may carry
  more than one modifier.
- One coin remains a meaningful economic unit; shop-card prices do not use
  fractions or decimals.
- A lone temporary Pawn can be desirable because permanent roster bulk is not
  always beneficial, so its temporary nature does not make it categorically
  worse than a permanent Pawn.
- Exact card contents must remain legible even when the name and flavor stay
  stable.

## Considered Options

- Give every complete composition-and-modifier permutation its own title and
  flavor text.
- Let modifiers rename a core composition with generated prefixes or suffixes.
- Keep one authored identity per core composition and expose modifiers as
  instance state inside the card.

## Decision Outcome

Chosen: **the 49 composition cards are the stable authored core set; their unit
instances may vary without renaming the card.**

- Each core composition receives one stable title and one associated flavor
  text. Flavor belongs at the bottom of the rules box; it does not encode live
  modifiers.
- A shop may instantiate the same core composition with different particular
  unit instances. **Disciplined**, **Positioned**, and **Plagued** attach to
  those instances, may coexist on one unit, and do not change the core title or
  flavor text.
- The card's rules area, not its title, is responsible for communicating the
  exact unit-instance contents and modifiers. Its final ledger layout, row
  limit, and dense-card policy remain separate visual decisions.
- Current positive modifier values are **Disciplined +3** and **Positioned +2**.
- Plagued is not a half-price multiplier. It applies this stepped discount from
  the modified unit's otherwise additive price:

  | Piece | Standard value | Plagued discount | Plain Plagued price |
  | --- | ---: | ---: | ---: |
  | Pawn | 1 | 0 | 1 |
  | Knight | 3 | 1 | 2 |
  | Bishop | 3 | 1 | 2 |
  | Rook | 5 | 2 | 3 |
  | Queen | 9 | 3 | 6 |

- In formula form, one unit contributes `standard piece value + modifier
  values - Plagued discount for its piece type`. A card costs the sum of its
  unit contributions. All current terms are whole gold.
- Future modifiers may join the same instance system without multiplying the
  authored name-and-flavor catalog. Their values and distribution require
  their own decisions.

### Consequences

- Good: deliberate names and flavor remain tractable while the shop can offer
  far more than 49 mechanical configurations.
- Good: a Plagued Pawn remains exactly one gold, preserving both chess's Pawn
  valuation and the meaningful choice between temporary flexibility and a
  lasting body.
- Good: the Queen's Plagued price is 6, not the 5 produced by rounding a
  half-price rule; the discount scales by piece tier rather than pretending to
  be proportional.
- Cost: the illustration and title cannot fully specify the purchased object;
  the rules-area unit ledger is required gameplay information.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0225](0225-run-bundle-cards-show-every-board-unit.md)
