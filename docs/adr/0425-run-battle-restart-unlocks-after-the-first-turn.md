---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0394](0394-run-battle-undo-rewinds-one-player-decision-for-one-gold.md)"
  - "[ADR-0424](0424-run-battle-retry-costs-three-gold.md)"
partially_superseded_by:
  - "[ADR-0426](0426-run-battles-do-not-offer-resign.md)"
---

# ADR-0425: Run Battle Restart unlocks after the first turn

## Context

The paid Restart action is available as soon as a Run Battle opens. During the first turn,
before the opponent has completed a reply, restarting only replaces the opening attempt with
the same deterministic position and needlessly offers to spend three gold.

Terminal Retry is a different state of the same reset transition. A player may resign during
the first turn, and disabling that result action would leave the defeated Run with no playable
way forward.

## Decision

- While an active Run Battle has completed zero turns and has no terminal result, every
  Restart affordance is disabled.
- Restart unlocks after the first complete turn. The browser-owned match state already
  persists `turnsElapsed`, so reload preserves the same availability without changing the
  Run document.
- A terminal defeat, draw, or resignation keeps Retry available even if it occurred during
  the first turn. The three-gold affordability rule remains independently authoritative.
- A disabled first-turn control states that Retry becomes available after the first turn and
  continues to show the canonical three-gold price.
- The gate changes only whether the existing paid reset may be invoked. ADR-0235's in-place
  reset lifecycle remains unchanged.

## Consequences

- The untouched opening position cannot consume gold by restarting itself.
- A first-turn terminal result never strands the active Run behind a disabled Retry action.
- No RunSaveVersion or database migration is required.
