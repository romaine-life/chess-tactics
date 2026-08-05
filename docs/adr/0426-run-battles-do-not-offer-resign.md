---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0425](0425-run-battle-restart-unlocks-after-the-first-turn.md)"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
  - "[ADR-0424](0424-run-battle-retry-costs-three-gold.md)"
---

# ADR-0426: Run Battles do not offer Resign

## Context

Single-player board Controls expose Resign. In a Run Battle, that action marks the local
board as a defeat without advancing the War, ending the Run, awarding anything, or applying
another Run consequence. Its result screen then offers paid Retry back into the same Battle.

The Run already has three complete lifecycle actions: one-gold Undo corrects the latest
decision, three-gold Retry discards the complete attempt, and Abandon Run deliberately ends
the persistent Run. Resign adds no distinct choice between them and can create a dead-end
Defeat screen when the Run cannot afford Retry.

## Decision

- Active Run Battles do not render the Resign action.
- Undo, Retry, and Abandon Run retain their existing meanings and prices.
- Campaign, standalone skirmish, editor playtest, and multiplayer resignation remain
  unchanged. The shared HUD therefore keeps resignation as an explicit non-Run capability
  rather than deleting the underlying single-player or network transition.
- Terminal defeat or draw still offers paid Retry even when it occurs on the first turn.
  ADR-0425's special reference to first-turn resignation is retired because that gesture is
  no longer available in Run.

## Consequences

- Run Controls expose no action whose only outcome is routing the player back to Retry.
- A Run below three gold cannot enter a resignation-made Defeat screen with no usable result
  action.
- No persistence shape, RunSaveVersion, or database migration changes.
