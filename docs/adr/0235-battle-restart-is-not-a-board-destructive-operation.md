---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
refines:
  - ADR-0136
  - ADR-0214
---

# ADR-0235: Battle restart is not a board-destructive operation

## Context

Restarting a Battle has historically returned its pieces and mutable match state
to their starting positions inside the already-mounted Play surface. It does not
select another board, navigate to another scene, or invalidate the terrain and
art that are already painted.

A readiness change conflated a new match-state generation with a new board-surface
generation. Restart cleared the parent surface-ready acknowledgement even though
the board signature stayed the same. A subsequent workaround keyed the complete
board renderer to the match epoch so that React would destroy and reconstruct it.
That avoided a stranded loading gate, but introduced a visible flash and replaced
an immediate gameplay command with a board-destructive lifecycle.

## Decision

- Restart and Retry Battle are immediate gameplay commands within the current
  committed Battle scene. They are not navigation, scene replacement, surface
  acquisition, renderer recovery, or loading transitions.
- Restart replaces only mutable match state with the canonical starting state:
  pieces return to their starting positions and turn, outcome, clock, log,
  selection, and other battle-local state reset as their gameplay contracts
  require.
- The mounted board, board viewport, HUD, camera, terrain/barrier/scene
  compositors, decoded resources, and painted-surface acknowledgement survive
  restart. Match/session epochs must not be used as React keys or visual-host
  identities for these objects.
- Restart must not hide the board or HUD, clear an already-valid surface-ready
  acknowledgement, display Preparing/Loading copy, reacquire unchanged critical
  resources, or create an empty frame. Existing renderers repaint the changed
  piece state in place.
- Surface readiness may be invalidated only when a dependency of that surface
  actually changes or its compositor reports failure. Choosing another level,
  board, installed-art identity, or visual contract is a board replacement or
  new-Battle operation, not a restart. That operation follows the painted-frame
  lifecycle in ADR-0136 while preserving the outgoing surface as required by the
  scene contracts.
- Renderer Retry remains recovery from an explicit rendering failure. It is a
  separate action and lifecycle from restarting healthy gameplay.

## Consequences

- Restart preserves the immediate visual behavior: pieces return to their
  starting positions without the battlefield flashing, disappearing, or showing
  a preparation overlay.
- Gameplay state generation and visual-surface generation remain separate
  identities even when both are represented by counters in the same store.
- Regression coverage must prove that Restart leaves the board component and its
  readiness mounted while resetting the match. Browser verification must inspect
  the transition itself, not only the settled frame after it.
- A restart implementation that fixes readiness by remounting the board is
  contract-invalid even if it eventually reaches the correct final position.

## More Information

- [ADR-0136](0136-loading-is-manifest-driven-and-frame-acknowledged.md)
- [ADR-0214](0214-the-scene-director-owns-transition-target-lifetime.md)
- [Loading contract](../loading-contract.md)
