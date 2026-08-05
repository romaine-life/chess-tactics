---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0423](0423-run-battle-retry-costs-five-gold.md)"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
---

# ADR-0424: Run Battle retry costs three gold

## Context

ADR-0423 set the price of restarting or retrying an active Run Battle at five gold.
The owner has revised that economy decision: throwing away the attempt should still cost
more than one-gold Undo, but five gold is too high.

The existing paid reset already owns affordability, atomic debit, every Run retry
affordance, and the in-place battlefield lifecycle. Only its canonical price changes.

## Decision

- Restarting or retrying an active Run Battle costs exactly **3 gold**.
- Every other accepted clause of ADR-0423 remains in force: the action is unavailable below
  its price, every Run reset affordance uses the same model transition and visible live-gold
  cost, the debit is atomic, and the deterministic deployment and mounted battlefield persist.
- Campaign level Replay/Retry, editor playtests, board links, and standalone skirmishes remain
  free because they are outside the Run economy.
- This remains a transition over the existing `goldTenths` field. It requires no
  RunSaveVersion or database migration.

## Consequences

- A Run holding exactly three gold may retry and finishes the transaction at zero gold.
- A Run below three gold cannot restart the Battle through any alternate control.
- Whole-Battle retry remains more expensive than one-gold Undo while consuming two less gold
  than ADR-0423 specified.
