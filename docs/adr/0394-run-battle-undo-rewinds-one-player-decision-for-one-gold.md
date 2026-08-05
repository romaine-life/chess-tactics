---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0235](0235-battle-restart-is-not-a-board-destructive-operation.md)"
  - "[ADR-0358](0358-a-premove-is-judged-against-permanent-board-law.md)"
partially_superseded_by:
  - "[ADR-0428](0428-run-defeat-offers-retry-and-exits-without-blocking-controls.md)"
---

# ADR-0394: Run Battle Undo rewinds one player decision for one gold

## Context

A Run is the game's persistent economy around an otherwise canonical chess Battle. A player
may currently retry the whole Battle for free, but cannot correct one mistaken move without
throwing away the complete attempt. The owner wants that smaller recovery to spend Run gold.

The word “move” needs one exact boundary against the local AI. Rewinding only the AI's latest
reply would leave the board on the AI turn and immediately reproduce another reply. Rewinding
only board pieces would also retain move-owned Run effects such as observed casualties,
Deployment Vehicle Reservists, or a Mercenary Boat cash-out. Those are not honest undos of the
decision the player is paying to retract.

## Decision

- An active single-player Run Battle exposes **Undo** in the Battle Controls and on a terminal
  Battle result while an undo is available. The action states its exact live cost with the
  canonical gold resource: **1 gold**.
- One Undo restores the checkpoint immediately before the latest committed player move. The
  player move, the deterministic enemy reply if it has landed, queued premoves, promotion
  resolution, adjudication, turn count, repetition state, event log additions, and Battle clock
  increment produced after that checkpoint are rewound together.
- The corresponding Run checkpoint is restored in the same action. Move-owned casualty,
  Reservist, and Mercenary Boat changes therefore rewind with the board rather than surviving
  on a position in which they never happened.
- The one-gold cost is debited from the pre-move Run checkpoint. Undo is unavailable when that
  checkpoint held less than one gold; a move cannot finance its own Undo with gold it produced.
- Undo has one level and no Redo. After an Undo, the next committed player move replaces the
  checkpoint. Restart, entering another Battle, multiplayer, administrator board mutation,
  resignation, and other Battle replacement clear it.
- The checkpoint is part of the existing browser-owned resumable match snapshot, so reload does
  not silently remove the offered Undo. It is not added to `RunDocument`: the active board is
  already device-local, while the restored Run economy continues through the ordinary active-Run
  persistence transaction. No RunSaveVersion change is created.
- Undo is an immediate gameplay command inside the mounted Battle. Like Restart, it must not
  remount, hide, reacquire, or reframe the battlefield.

## Consequences

- The player can pay to revisit the decision they controlled instead of receiving an unstable
  AI-turn position or restarting the whole Battle.
- Undo remains exact before the AI replies, after it replies, and after either side ends the
  Battle; stale asynchronous AI work is invalidated before the restored position becomes live.
- Repeated correction consumes repeated gold because only the next newly committed move creates
  another checkpoint.
- Run legal-move generation remains unchanged. The feature restores canonical state and spends
  economy; it does not grant a piece new chess behavior.
