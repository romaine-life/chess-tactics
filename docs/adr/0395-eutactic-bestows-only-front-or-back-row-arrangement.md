---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s Rook outer-square Positioned preference"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)'s Rook outer-square Positioned preference"
refines:
  - "[ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)"
partially_superseded_by:
  - "[ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)'s complete six-piece row map"
---

# ADR-0395: Eutactic bestows only front- or back-row arrangement

## Context

The Eutactic reference described Pawns as preferring the front row, the King and Bishops as
preferring the back row, and Rooks as preferring outer back-row squares. The automatic placer
implemented that extra horizontal preference. That made Eutactic more than the intended row
arrangement ability and overlapped with Agminate's responsibility for piece-specific stations and
formations.

## Decision

- **Eutactic bestows only front- or back-row arrangement.** Pawns prefer the front row. The King,
  Bishops, and Rooks prefer the back row.
- An Eutactic Rook has no horizontal preference within the back row. Ordinary seeded deployment
  chooses among those squares unless another ability supplies a separate preference.
- The Enchiridion, glossary, per-unit tooltip, and Card Icon Fitting copy describe only this row
  arrangement. “Piece-specific region” and “outer back-row square” are retired descriptions of
  Eutactic.
- Agminate remains the separate piece-specific formation ability and is unchanged.

## Consequences

- Crenellated Rampart and a directly Eutactic Rook steer the Rook to the back row without steering
  it toward either edge.
- Every affected piece now receives one of exactly two Eutactic outcomes: front row or back row.
- Existing Run documents need no format change because no persisted shape or identifier changes.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)
- [ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)
- [ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)
