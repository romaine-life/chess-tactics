---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
extends:
  - 0240-run-self-inspection-owns-the-left-shell-workspace.md
  - 0211-navigational-drawing-requires-an-authored-scene-slot.md
---

# ADR-0244: Run self-inspection views are deep-linkable

## Context

Run Army and Lipsana are reviewable workspace destinations, but ADR-0240's first
implementation stored the selected destination only in component state. A link
to `/run` opened whichever operational Run phase was active and required the
recipient to find Controls, then Self inspection, then Army or Lipsana. That made
the exact screen impossible to hand off or capture through the canonical
screenshot route.

## Decision

The canonical Run route represents an open self-inspection destination with the
`view` query parameter:

- `/run?view=army` opens Army.
- `/run?view=lipsana` opens Lipsana.
- Missing or unsupported values open the current Run phase's primary workspace.
- Selecting Army or Lipsana in Controls replaces the current URL's `view` value.
  Returning to a phase-owned primary or selling destination removes it.
- Unrelated query parameters and the hash are preserved.
- The parameter selects presentation only. It never creates, advances, pauses,
  or mutates the persistent Run.

## Consequences

- Owner review and automated screenshots can open the exact workspace without
  preparatory clicks.
- Controls and the visible address describe the same self-inspection state.
- Links remain scoped to the owner's current persistent Run rather than
  serializing private Run data into the URL.

## More Information

- Extends [ADR-0240](0240-run-self-inspection-owns-the-left-shell-workspace.md).
- Follows the exact-workspace handoff pattern already used by Level Editor
  Events under [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md).
