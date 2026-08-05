---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)"
  - "[ADR-0424](0424-run-battle-retry-costs-three-gold.md)"
refined_by:
  - "[ADR-0450](0450-live-units-leave-mounted-boards-through-registered-departure-tracks.md)"
---

# ADR-0449: Deployment position rerolls cost one before Battle and five after

## Context

Deployment currently commits one seeded formation which reload and three-gold Battle Retry preserve.
The player cannot spend Run gold to ask for different automatic positions, either while the ordered
placement sequence is still underway or after those positions have promoted into Battle.

A position reroll must not become a cheaper way to draw a different combat hand. It also cannot reset
only the units which have not appeared yet: after any revealed or manually placed unit, doing so would
price the same action differently according to presentation timing and leave a mixed-seed formation.

## Decision

- **Reroll deployment** is available at every persisted Deployment boundary for exactly **1 gold**,
  including awaiting Deal, dealing, card reveal, automatic placement, Adlected input, settlement, and
  discard.
- Once the same formation has promoted into Battle, **Reroll deployment** remains available for
  exactly **5 gold**. It returns the Run to Deployment and discards the current mutable Battle attempt.
  Other Run phases have no current formation to reroll and do not expose the action.
- Either action is one atomic model transition. It is unavailable below its phase-specific balance,
  deducts the price, derives a new placement seed, clears every automatic and manual placement,
  capacity result, temporary Adlection, revealed-card prefix, cursor, settlement, discard, and
  transport state, and returns to the initial awaiting-Deal boundary.
- The current combat's dealt-card ids and authored nullable seat order remain fixed. Rerolling
  positions does not draw a different combat pool. The cards replay from the beginning because the
  complete Deployment phase is being redone, even when the player saw them on the previous pass.
- Deployment Controls show the one-gold action throughout placement. Battle Controls and non-victory
  result actions show the five-gold action after placement, distinct from one-gold Undo and three-gold
  Retry.
- Three-gold Retry continues to preserve the exact persisted formation. Five-gold Deployment reroll
  is the explicit operation which replaces it.
- Battle-to-Deployment reentry preserves ADR-0350's mounted battlefield activity, compositor,
  `ViewPane`, and camera. The changed placement seed is nevertheless a new promotion identity, so the
  completed reroll builds one fresh browser match rather than retaining the discarded attempt.
- The transition replaces fields already present in `RunDeploymentState` and uses the existing
  `goldTenths` economy. It requires no RunSaveVersion or database migration.

## Consequences

- A player may abandon a partially revealed or partially placed formation without receiving a
  discount for acting earlier or later within Deployment.
- Reconsidering positions after Battle begins is deliberately more expensive than both Undo and
  Retry because it replaces the formation rather than only a move or mutable attempt.
- Repeated rerolls remain deterministic, persist through reload, and may coincidentally produce the
  same legal formation without refunding their cost.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [Board render contract](../board-render-contract.md)
