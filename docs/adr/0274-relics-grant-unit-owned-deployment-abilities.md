---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s direct ownership of seven piece-placement relic effects"
  - "[ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)'s deferral of the Marshalled name and relic relationship"
---

# ADR-0274: Relics grant unit-owned deployment abilities

## Context and Problem Statement

Seven Run relics currently describe and implement piece-placement preferences
as bespoke relic effects. The same preferences are now also intended to appear
on particular unit instances created by affected cards. Leaving the behavior on
the relics would create two parallel rule systems: a named unit modifier on one
unit and an anonymous direct placement override on every matching unit.

The card and relic sources should instead grant the same ability. The ability
must be the single owner of its deployment behavior, while the relic says only
which class of units receives it.

## Decision Drivers

- A player should learn one named ability regardless of whether a card or relic
  supplied it.
- Unit inspection must show the same effective ability for permanent and
  relic-granted instances.
- Relic descriptions should state their complete effect without duplicating the
  ability reference text.
- Existing deployment outcomes should remain stable while behavior ownership
  moves to the shared ability layer.

## Considered Options

- Keep bespoke relic placement effects and use similar but separate card
  modifiers.
- Repeat each full placement rule in both the relic and ability text.
- Make relics grant the shared named abilities and keep behavior definitions in
  one unit-ability reference.

## Decision Outcome

Chosen: **the relics grant unit-owned Positioned or Marshalled abilities.**

The exact grants are:

| Relic | Grant |
| --- | --- |
| Field Linens | Pawns gain Positioned |
| Royal Decree | the King gains Positioned |
| Crenellated Rampart | Rooks gain Positioned |
| Pope's Staff | Bishops gain Positioned |
| Ghibelline Rampart | Rooks gain Marshalled |
| Pope's Robes | Bishops gain Marshalled |
| Royal Sceptre | the King gains Marshalled |

- A relic's public rules text states only that grant. It does not append the
  ability's piece-specific behavior.
- **Positioned** continues to own the current automatic-region preferences:
  Pawns prefer the front deployment row, the King prefers the back row, Rooks
  prefer outer back-row squares, and Bishops prefer the back row.
- **Marshalled** owns the current role-aware preferences: the King prefers a
  board-edge zone square, Rooks prefer the established King-flank/corner
  formation, and Bishops prefer alternating square colors. The Bishop behavior
  retains ADR-0273's intentionally contextual and potentially diminishing
  value.
- A relic grant applies to every current and later-acquired persistent unit of
  the named piece type. The ability remains effective state derived from the
  relic; the relic does not write duplicate permanent ability values onto every
  unit.
- A unit that already owns the same ability does not stack another copy when a
  relic grants it. Unit inspection shows the ability once and identifies its
  permanent or relic source.
- Cards and future effects may put Positioned or Marshalled directly on a
  particular unit without changing these relic definitions.
- Discipline remains a separate exact-placement ability. Renaming Discipline
  or Positioned remains a separate decision.

### Consequences

- Good: cards and relics speak the same ability language.
- Good: changing an ability's behavior cannot leave relic prose or placement
  code describing a second version.
- Good: direct unit modifiers interact with the same formation logic as broad
  relic grants.
- Cost: the Enchiridion becomes necessary reference material for the full
  piece-specific meaning of each short relic description.
- Cost: legacy Run documents continue storing relic ids while the effective
  abilities must be derived consistently wherever units are displayed or
  deployed.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)
