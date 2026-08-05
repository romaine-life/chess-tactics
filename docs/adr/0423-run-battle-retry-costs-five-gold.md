---
status: superseded
date: 2026-08-04
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0424](0424-run-battle-retry-costs-three-gold.md)"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
---

# ADR-0423: Run Battle retry costs five gold

## Context

A Run Battle can currently be restarted from its live Controls or retried after a defeat
without spending anything. That makes throwing away the whole attempt cheaper than the
one-gold Undo that preserves most of it, and it leaves Battle retry outside the Run economy.

The same reset is called **Restart Battle** during the attempt and **Retry** on a terminal
result. Pricing only one affordance would leave the other as a free route to the identical
state transition. Ordinary Campaign levels, playtests, board links, and skirmishes have no
Run gold authority and must not acquire one.

## Decision

- Restarting or retrying an active Run Battle costs exactly **5 gold**. Every Run affordance
  that resets the current Battle invokes the same paid model transition.
- The transition is available only when the current Run holds at least 5 gold. An
  unaffordable retry is visibly disabled and the model refuses the transition; gold never
  becomes negative.
- The canonical retry action displays its cost with the accepted live Run gold resource.
  Compact icon-only placement may state that same cost through its accessible name and title.
- The five gold is debited atomically before the Battle runtime is reset. The fresh attempt
  retains the existing deterministic deployment, begins a new Battle clock, and otherwise
  keeps ADR-0235's in-place reset semantics.
- Campaign level Replay/Retry, editor playtests, board links, and standalone skirmishes remain
  free because they are outside the Run economy.
- This changes a transition over the existing `goldTenths` field and does not change the Run
  document shape. It requires no RunSaveVersion or database migration.

## Consequences

- Discarding a complete Run Battle attempt is a materially larger economy decision than
  correcting the latest player decision with one-gold Undo.
- A Run with less than five gold must continue from its current position or end the attempt;
  no alternate restart control bypasses the affordability rule.
- Retry continues to preserve the mounted board, HUD, camera, decoded resources, and painted
  acknowledgement while replacing only mutable match state.
