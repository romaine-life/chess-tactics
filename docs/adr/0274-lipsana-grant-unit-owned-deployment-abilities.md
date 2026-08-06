---
status: superseded by ADR-0492
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)'s Agminate ability name"
  - "[ADR-0395](0395-eutactic-bestows-only-front-or-back-row-arrangement.md)'s removal of the Rook outer-square preference"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s one ordinary-unit ability limit"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s direct ownership of seven piece-placement lipsanon effects"
  - "[ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)'s deferral of the Marshalled name and lipsanon relationship"
---

# ADR-0274: Lipsana grant unit-owned deployment abilities

## Context and Problem Statement

Seven Run lipsana currently describe and implement piece-placement preferences
as bespoke lipsanon effects. The same preferences are now also intended to appear
on particular unit instances created by affected cards. Leaving the behavior on
the lipsana would create two parallel rule systems: a named unit modifier on one
unit and an anonymous direct placement override on every matching unit.

The card and lipsanon sources should instead grant the same ability. The ability
must be the single owner of its deployment behavior, while the lipsanon says only
which class of units receives it.

## Decision Drivers

- A player should learn one named ability regardless of whether a card or lipsanon
  supplied it.
- Unit inspection must show the same effective ability for permanent and
  lipsanon-granted instances.
- Lipsanon descriptions should state their complete effect without duplicating the
  ability reference text.
- Existing deployment outcomes should remain stable while behavior ownership
  moves to the shared ability layer.

## Considered Options

- Keep bespoke lipsanon placement effects and use similar but separate card
  modifiers.
- Repeat each full placement rule in both the lipsanon and ability text.
- Make lipsana grant the shared named abilities and keep behavior definitions in
  one unit-ability reference.

## Decision Outcome

Chosen: **the lipsana grant unit-owned Positioned or Marshalled abilities.**

The exact grants are:

| Lipsanon | Grant |
| --- | --- |
| Field Linens | Pawns gain Positioned |
| Royal Decree | the King gains Positioned |
| Crenellated Rampart | Rooks gain Positioned |
| Pope's Staff | Bishops gain Positioned |
| Ghibelline Rampart | Rooks gain Marshalled |
| Pope's Robes | Bishops gain Marshalled |
| Royal Sceptre | the King gains Marshalled |

- A lipsanon's public rules text states only that grant. It does not append the
  ability's piece-specific behavior.
- **Positioned** continues to own the current automatic-region preferences:
  Pawns prefer the front deployment row, the King prefers the back row, Rooks
  prefer outer back-row squares, and Bishops prefer the back row.
- **Marshalled** owns the current role-aware preferences: the King prefers a
  board-edge zone square, Rooks prefer the established King-flank/corner
  formation, and Bishops prefer alternating square colors. The Bishop behavior
  retains ADR-0273's intentionally contextual and potentially diminishing
  value.
- A lipsanon grant applies to every current and later-acquired persistent unit of
  the named piece type. The ability remains effective state derived from the
  lipsanon; the lipsanon does not write duplicate permanent ability values onto every
  unit.
- A unit that already owns the same ability does not stack another copy when a
  lipsanon grants it. Unit inspection shows the ability once and identifies its
  permanent or lipsanon source.
- Cards and future effects may put Positioned or Marshalled directly on a
  particular unit without changing these lipsanon definitions.
- Discipline remains a separate exact-placement ability. Renaming Discipline
  or Positioned remains a separate decision.

### Consequences

- Good: cards and lipsana speak the same ability language.
- Good: changing an ability's behavior cannot leave lipsanon prose or placement
  code describing a second version.
- Good: direct unit modifiers interact with the same formation logic as broad
  lipsanon grants.
- Cost: the Enchiridion becomes necessary reference material for the full
  piece-specific meaning of each short lipsanon description.
- Cost: legacy Run documents continue storing lipsanon ids while the effective
  abilities must be derived consistently wherever units are displayed or
  deployed.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)
