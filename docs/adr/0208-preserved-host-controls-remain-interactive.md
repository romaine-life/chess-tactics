---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0205
  - ADR-0207
---

# ADR-0208: Preserved host controls remain interactive

## Context

The original atomic-scene lifecycle made the complete outgoing hierarchy inert
when navigation was accepted. Nested persistent hosts make that rule visibly
incorrect: a main or Play rail that remains mounted and fully visible still
communicates available choices. Disabling it without a visual exit creates dead
controls and prevents the user from gracefully retargeting an in-flight load.

## Decision

Only the replaceable destination region becomes hidden and inert during a
same-host transition. Controls owned by every preserved ancestor host remain
visible, focusable, and clickable.

Activating a preserved control may retarget the director. The latest accepted
destination supersedes the in-flight generation; stale acquisition and paint
acknowledgements cannot reveal. Full-scene transitions with no shared host
continue to make the complete outgoing hierarchy inert.

Visibility and interaction must agree: a control may be disabled by its own
domain state, but the loading system may not leave a normally available,
preserved control visible while globally suppressing its interaction.

## Consequences

Users can move from a loading campaign to Levels, another campaign, or a main
menu destination without waiting. The destination region remains atomic, while
the stable navigation hierarchy behaves like stable navigation.
