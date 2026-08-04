---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s one ordinary-unit ability limit and Pawn station"
partially_supersedes:
  - "[ADR-0395](0395-eutactic-bestows-only-front-or-back-row-arrangement.md)'s two-outcome Eutactic row map"
refines:
  - "[ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)"
  - "[ADR-0345](0345-hieratic-draws-one-in-eight-and-grants-agminate-at-acquisition.md)"
  - "[ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)"
---

# ADR-0396: Eutactic and Agminate compose as best-fit row and station

## Context

Eutactic and Agminate may coexist on one unit. Treating their automatic-deployment effects as
unrelated numeric bonuses let a larger Agminate weight erase Eutactic's row preference. The two
abilities were then described as separate concepts even though their implementation made them
compete.

The card system may bestow either ability on every purchasable piece type, but Eutactic had no
Knight or Queen behavior and Agminate had no Pawn, Knight, or Queen behavior. Those units could pay
the full property premium and carry a named state that changed nothing.

## Decision

- **Every piece type has a complete Eutactic row preference.** Order the distinct rows in that
  piece type's eligible deployment geometry from front to back. Pawns target the front row.
  Knights and Bishops target the row immediately behind the front, collapsing naturally onto the
  back row when only two rows exist. Rooks, Queens, and the King target the back row.
- **Eutactic is best-fit.** If its target row has no currently available square, use the available
  row with the smallest ordinal distance from the target. Equidistant rows are a seeded tie. This
  works for any number of rows and for irregular or dedicated piece-type zones without inventing
  rows in geometric gaps.
- **Every piece type has a complete Agminate station.** Pawns and Queens gravitate toward the
  middle of the board. Knights prefer the ring one square in from the board edge. The King prefers
  the board edge. Rooks retain their King-flank and corner formation. Bishops retain their
  opposite-color preference.
- **The abilities compose rather than compete.** When a unit has both, Eutactic first selects its
  best-fit available row and Agminate arranges the unit within that row. Pawn and Queen therefore
  prefer the central files of their Eutactic row; a Knight prefers a file one square in from
  either side. Agminate alone evaluates the complete available deployment geometry.
- Seeded randomness breaks only a remaining equal fit. No arbitrary cross-ability weight decides
  which named ability is silently ignored.
- Concinnous and Hieratic continue selecting uniformly from every contained unit. No piece is
  excluded because both granted abilities now have complete six-piece behavior.

## Consequences

- A unit carrying both abilities receives both benefits whenever its turn has an available square.
- Three-or-more-row deployment zones have explicit formation depth instead of treating every
  non-Pawn as a back-row piece.
- A Concinnous or Hieratic premium can no longer purchase a state with no deployment behavior.
- Existing Run documents need no format change; ability identifiers and stored targets are
  unchanged.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)
- [ADR-0345](0345-hieratic-draws-one-in-eight-and-grants-agminate-at-acquisition.md)
- [ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)
- [ADR-0395](0395-eutactic-bestows-only-front-or-back-row-arrangement.md)
