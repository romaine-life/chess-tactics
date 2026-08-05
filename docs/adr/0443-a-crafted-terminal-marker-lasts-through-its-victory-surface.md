---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0436](0436-a-terminal-run-battle-is-a-craftable-review-landing.md)'s immediate-clear timing"
refines:
  - "[ADR-0442](0442-battle-scenes-reveal-once-and-terminal-review-units-stay-settled.md)"
---

# ADR-0443: A crafted terminal marker lasts through its Victory surface

## Context

The crafted `battle-victory` instruction originally cleared immediately after the mounted match
applied its one-shot win. That made a later render of the same visible Battle indistinguishable
from an ordinary live Battle. The compositor could switch from `settled` back to the ordinary
unit-arrival lifecycle, and the Victory banner could register its active-scene acknowledgement
fade after the director had already revealed the board. The crafted destination therefore still
read as a board entrance followed by a small Victory straggler.

The instruction remains transient presentation state rather than part of `RunDocument`. The
problem is only when its exact terminal classification ends.

## Decision

- The transient crafted-result marker remains keyed to its exact Run id and Battle index for the
  complete lifetime of that board-visible Victory surface.
- Applying the one-shot win does not clear the marker. The already-decided match makes repeated
  presentation renders idempotent, while the retained marker keeps `reviewTerminalResult` true.
- A crafted terminal Battle prepares settled units and its Victory/Rewards overlay before the
  scene director reveals it. The overlay owns no child opacity entrance in this mode.
- Rewards clears the marker in the same action that retires the Battle surface for aftermath.
  Registering an ordinary or different craft also continues to clear or replace any older marker.
- An aftermath Back review remains governed by its saved terminal match; it does not depend on
  the crafted marker after Rewards has retired that marker.

## Consequences

- A crafted Victory link has one visible reveal: environment, board, settled units, Victory, and
  Rewards rise together under the scene director.
- A Victory earned during an already-visible ordinary Battle may still use the lightweight
  acknowledgement fade required by ADR-0435.
- No crafted-result field enters Run persistence, match persistence, or `RunSaveVersion`.
- The live terminal gate can require Victory to exist before scene current, remain at child
  opacity one throughout the reveal, and observe no unit entrance.
