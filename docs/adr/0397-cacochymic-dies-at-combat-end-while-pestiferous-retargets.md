---
status: superseded by ADR-0492
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)'s attribution of death and pricing to the marked unit state"
refines:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)"
---

# ADR-0397: Cacochymic dies at combat end while Pestiferous retargets

## Context

The Cacochymic ability reference described a unit as possibly being lost when its Pestiferous card
resolved attrition and also included the marked unit's contribution to offer pricing. That tangled
the unit state's one effect with the Pestiferous card's selection, retargeting, and pricing rules.

The runtime already keeps a current Cacochymic unit on each nonempty Pestiferous card, removes that
unit at committed combat resolution, and immediately selects a surviving replacement. Other
permanent-removal paths also repair the current target.

## Decision

- **Cacochymic has one unit effect: the unit dies when combat ends.** Its ability description says
  exactly that and does not explain Pestiferous, target selection, or card pricing.
- **Pestiferous owns the target lifecycle.** It marks one contained unit Cacochymic. Whenever the
  current Cacochymic unit dies, it marks another remaining contained unit. An empty Pestiferous
  card has no target and remains in the deck.
- Pestiferous offer pricing may still use the marked unit's piece tier. That is a consequence of
  the card property and its public target, not an additional effect of the Cacochymic unit state.
- Existing committed-combat, retry-idempotence, seeded selection, persistence, and other
  permanent-removal behavior remain unchanged.

## Consequences

- Unit inspection and the Abilities reference state only what happens to a Cacochymic unit.
- Pestiferous references state what the card selects and when it replaces that selection.
- Runtime behavior and persisted Run documents require no migration.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)
- [ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)
