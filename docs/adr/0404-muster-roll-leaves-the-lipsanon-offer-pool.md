---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s inclusion of every registered lipsanon in seeded offers"
refines:
  - "[ADR-0368](0368-conflicts-open-with-bona-vacantia-instead-of-closing-with-loot.md)"
  - "[ADR-0380](0380-run-save-versions-always-migrate.md)"
---

# ADR-0404: Muster Roll leaves the lipsanon offer pool

## Context

Muster Roll currently turns deployment overflow into a player choice. The developing card-deal
and deployment-pool boundary will determine what that choice should actually operate on, so
offering the lipsanon now commits the player to a mechanic whose subject is not settled.

Muster Roll has already reached persisted Runs, both as a held lipsanon and inside already-generated
offers. Deleting its registered identity or changing the current save shape merely to stop future
acquisition would require account and browser migrations without improving the unfinished design.

## Decision

- Muster Roll is excluded from the canonical lipsanon offer pool. Bona Vacantia and the
  After-Hours Key cannot reveal it in newly generated offers.
- Muster Roll remains in the lipsanon registry, Enchiridion, explicit playtest tooling, and current
  runtime behavior so a Run that already references it remains truthful and readable.
- Offer generation uses a named canonical pool distinct from the complete registry. Any future
  lipsanon deferral must be expressed at that shared boundary rather than patched into one reward
  surface.
- Reintroducing Muster Roll to acquisition waits for an accepted decision defining its role in the
  card-to-deployment-pool conversion.
- The persisted Run shape does not change, so this decision requires neither a RunSaveVersion bump
  nor a database migration.

## Consequences

- Players cannot newly acquire an unsettled deployment intervention.
- Existing Runs are not erased, rewritten, or silently stripped of something they already hold.
- The registered catalog contains twenty identities while the offer pool contains nineteen.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0368](0368-conflicts-open-with-bona-vacantia-instead-of-closing-with-loot.md)
- [ADR-0380](0380-run-save-versions-always-migrate.md)
