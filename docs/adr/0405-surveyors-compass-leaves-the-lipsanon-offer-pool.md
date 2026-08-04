---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s inclusion of Surveyor's Compass in seeded offers"
refines:
  - "[ADR-0380](0380-run-save-versions-always-migrate.md)"
  - "[ADR-0403](0403-surveyors-compass-chooses-between-ability-resolved-formations.md)"
  - "[ADR-0404](0404-muster-roll-leaves-the-lipsanon-offer-pool.md)"
---

# ADR-0405: Surveyor's Compass leaves the lipsanon offer pool

## Context

The developing phased Deployment flow now includes explicit timing choices, information locks,
and automatic waves. Surveyor's Compass exposes alternate complete formations and therefore
depends on those unresolved boundaries. Offering it during ordinary play would force that larger
interaction to settle before the underlying phases are ready.

Like Muster Roll, Surveyor's Compass already appears in persisted Runs as a held lipsanon or an
already-generated offer. Removing its identity would require account and browser migrations merely
to hide an unfinished acquisition.

## Decision

- Surveyor's Compass is excluded from the canonical lipsanon offer pool. Bona Vacantia and the
  After-Hours Key cannot reveal it in newly generated offers.
- Its registered identity, Enchiridion entry, current runtime behavior, and explicit Deployment Lab
  control remain available for existing Run references and focused development.
- Reintroducing it to acquisition waits for an accepted decision covering the complete phased
  Deployment flow and its information-lock boundary.
- The persisted Run shape does not change, so this decision requires neither a RunSaveVersion bump
  nor a database migration.

## Consequences

- Ordinary play cannot newly acquire either unfinished Deployment-choice lipsanon.
- Existing Runs remain truthful and readable.
- The registered catalog contains twenty identities while the canonical offer pool contains
  eighteen.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0380](0380-run-save-versions-always-migrate.md)
- [ADR-0403](0403-surveyors-compass-chooses-between-ability-resolved-formations.md)
- [ADR-0404](0404-muster-roll-leaves-the-lipsanon-offer-pool.md)
