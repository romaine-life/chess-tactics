---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0357](0357-a-unit-awaiting-its-entrance-is-staged-off-the-board.md)"
  - "[ADR-0438](0438-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0442: Battle scenes reveal once and terminal-review units stay settled

## Context

A prepared Battle had two independent opacity owners. The scene director first faded in the
Battle environment, then the board compositor's local readiness transition faded in the board.
The unit-arrival lifecycle followed afterward. On a crafted Victory landing, the Victory
acknowledgement added its own later entrance, making one destination read as several unrelated
reveals. Predrawn artwork boards had the same authority split even though their complete scene
plate lived inside the delayed board layer.

Unit presentation cannot be collapsed into the scene fade. An ordinary Battle deliberately opens
on an empty prepared board and its units arrive after activation under ADR-0357. Returning Back
from aftermath is different: it revisits the exact terminal position, whose units already arrived.
Replaying their entrance would rewrite the event the player is reviewing.

## Decision

- The scene director is the sole visible opacity owner for a navigated live Battle. Board
  readiness still keeps incomplete compositor pixels hidden and inert during preparation, but
  removing that gate inside the hidden incoming scene does not start a local board fade.
- Generated and predrawn Battle boards follow the same reveal contract. Their complete prepared
  environment, board, chrome, and any already-present overlays enter as one authored scene.
- Unit entrance remains a separate semantic event after scene activation. Ordinary Battle entry
  uses `pending → active`: units are staged off-board during preparation and arrive only after the
  scene reveal completes.
- A terminal board reached through aftermath Back uses `settled`. Its exact saved units paint at
  their existing seats during preparation and remain there through reveal; no arrival plan is
  created or replayed.
- A Victory earned on an already-visible board retains its own lightweight acknowledgement
  entrance. Scene reveal authority does not turn ordinary gameplay state changes into navigation.

## Consequences

- A Battle background and its board no longer fade one after the other.
- Ordinary unit arrival remains legible and keeps its established activation gate.
- Back means visual continuity with the terminal position rather than a fresh deployment of its
  survivors.
- Local board viewers outside an authored scene may retain the compositor's readiness fade; the
  scene-owned mode is explicit rather than a global CSS exception.
