---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)'s requirement to expose every exact modified unit before purchase"
  - "[ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)'s requirement to show every exact modifier target at every card state"
partially_superseded_by:
  - "[ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)'s primary-type and affected-qualifier type-line grammar"
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)'s removal of automatic ability-description projection"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)'s Concinnous name and exact one-unit Positioned scope"
---

# ADR-0272: Card types author effects and may conceal unit targets

## Context and Problem Statement

Pestiferous established a card-level classification that changes both the card
and all its units. A proposed **Tactical** classification may instead cause one
contained unit to gain Positioned, potentially without revealing which unit
until after purchase. Restricting card types to one semantic axis, such as only
card lifecycle, would force this causal card rule back into an unexplained unit
roll and discard useful design space familiar from trading-card games.

## Decision Drivers

- A card type should identify the rule responsible for an affected card, not
  merely describe unit state after the fact.
- Different card types may govern different parts of play: persistence,
  attrition, enhancement, information timing, acquisition, or deployment.
- Hidden information must be an explicit card rule and a stable wager, not a
  reroll performed only after the player commits.
- The player must know every fact needed to understand price and risk even when
  one exact target remains concealed.

## Considered Options

- Reserve card types for lifecycle changes and leave positive modifiers as
  anonymous draw-time rolls.
- Derive a Tactical label from any card that happens to contain a Positioned
  unit.
- Let card types author heterogeneous rules, with Tactical owning a positive
  unit enhancement and its reveal timing.

## Decision Outcome

Chosen: **card types are causal rule-bearing classifications and need not all
affect the same layer of a card.**

- **Pestiferous** is a card type whose rule affects both layers: it makes every
  contained unit Plagued, deteriorates once per Battle advancement, and remains
  after becoming empty.
- **Tactical** is the card type family for a card-authored positive enhancement
  of one or more contained units. Its card text states the modifier, affected
  count, and reveal timing. The initial simple form under consideration is:
  **“Tactical — One unit on this card is Positioned.”**
- A card is not retroactively Tactical merely because a unit acquires
  Positioned from a relic or another external source. Tactical means the card's
  own rule introduced the enhancement.
- Tactical may openly identify its affected unit or explicitly conceal that
  target until purchase. For a concealed target, the seeded target is chosen
  and persisted when the offer is created; purchase reveals the stored result
  rather than rolling it after commitment.
- A concealed Tactical offer still names the modifier and number of affected
  units, and its displayed cost includes their known modifier value. Before
  purchase, the ledger marks the target as hidden; afterward it identifies the
  exact modified unit.
- Flavor text remains present under ADR-0270. Hidden gameplay information is a
  deliberate rules element, not an excuse to clip or omit public card content.
- The exact Tactical modifier catalog, appearance probability, target-selection
  distribution, and whether multiple card types may coexist on one offer remain
  separate decisions.

### Consequences

- Good: card types can create substantially different acquisition and deck
  behavior without pretending every type is a variation of Pestiferous.
- Good: a hidden target creates a real purchase wager while remaining seeded,
  priced, and resistant to reset or reload manipulation.
- Good: the type records provenance; an identical-looking unit modifier can
  arise through a different rule without falsely changing the card's type.
- Cost: the ledger needs distinct pre-purchase hidden and post-purchase revealed
  states.
- Cost: each card type requires literal rules text because the category name
  alone does not promise one universal kind of behavior.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0267](0267-pestiferous-cards-lose-units-and-persist-when-empty.md)
- [ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)
- [ADR-0271](0271-core-cards-become-affected-when-drawn.md)
