---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0199
  - ADR-0203
---

# ADR-0204: Empty scene slots commit without loading

## Context

Returning from Play to the bare Main Menu removes the `menu-destination` child.
The persistent background, title, and main navigation are already committed and
painted. Treating that removal like acquisition of a new visual surface presents
Loading and imposes a minimum wait even though there is nothing to acquire.

Transitioning and waiting for readiness are different states. Conflating them
makes a scene exit look like network or asset work.

## Decision

When an authored navigation retains a host and resolves its destination slot to
empty, the director performs an empty-slot commit:

1. The outgoing child fades out through the ordinary `exiting` phase.
2. The mounted path advances and the empty slot is committed.
3. The director returns directly to `current`.

The transition does not enter `loading` or `entering`, does not apply a loading
minimum, and does not show Loading copy. Loading presentation is shown only in
the `loading`, `entering`, or `error` phases (plus cold startup before its first
reveal), never merely because the director is exiting.

Empty-slot detection derives from the authored scene path and named slot. It is
not a URL or Main Menu special case.

## Consequences

Play → Main Menu removes the Play subtree cleanly while the persistent Main Menu
remains visible. Destinations with actual critical preparation still follow the
full paint-acknowledged loading lifecycle.
