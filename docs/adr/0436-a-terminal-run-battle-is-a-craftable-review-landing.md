---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0443](0443-a-crafted-terminal-marker-lasts-through-its-victory-surface.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0338](0338-a-run-state-is-handed-over-as-a-link-that-crafts-it.md)"
  - "[ADR-0354](0354-a-crafted-run-link-is-a-stored-restart-address.md)"
  - "[ADR-0435](0435-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
---

# ADR-0436: A terminal Run Battle is a craftable review landing

## Context

ADR-0435 makes the won board itself a distinct product surface: the settled position remains
visible beneath **Victory** and **Rewards >**. The existing Run crafter could create the active
Battle before that surface and the aftermath report after it, but could not land on the terminal
board between them. Reviewing the new surface therefore still required opening a Battle link,
navigating to Admin Controls, and pressing Win. That is one interaction short of the exact state
and violates the craft-link handoff contract established by ADR-0338 and ADR-0354.

The board result is device-local match state while the active Run is durable account state. Adding
a terminal-result field to `RunDocument` merely for review would change the player save contract
and make the persisted Run claim it owns state that is actually reconstructed by the mounted game.

## Decision

- The Run craft grammar gains `battle-victory`. It composes the same server-valid persisted
  `battle` document as `battle`; it is a review landing, not a new `RunPhase`.
- The admin-only craft response carries `battleResult: "player"` beside that Run document. The
  result is never written into `RunDocument`, active-run storage, or browser match persistence.
- Before the craft link redirects to the clean Run route, the client registers that result against
  the exact fresh Run id and Battle index returned by the server. An ordinary craft clears any
  older instruction, and a different Run or Battle cannot consume it.
- The Run battlefield waits until that exact match has mounted and its board surface has painted,
  then applies victory through the existing one-shot Battle action and clears the instruction.
  The player lands directly on ADR-0435's visible-board Victory state without a placeholder-board
  flash or an automated UI click path.
- The minted `/run/craft/<id>` remains the address handed over. Opening it again reconstructs both
  the valid Battle and its terminal presentation from any later active-Run state.

## Consequences

- The board-visible Victory surface is now directly and repeatedly reviewable from one link.
- Production Run saves, RunSaveVersion, database schema, reward accounting, and ordinary Battle
  behavior do not change.
- The craft target remains administrator-only because the endpoint that supplies the terminal
  instruction already requires administrator authorization.
