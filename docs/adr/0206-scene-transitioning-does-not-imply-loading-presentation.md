---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0199
  - ADR-0205
---

# ADR-0206: Scene transitioning does not imply Loading presentation

## Context

Authored Settings panels correctly need director-owned transition and visibility
authority, but General, Audio, Gameplay, and Creator Tools are synchronous,
already-resident controls. Showing centered Loading and enforcing a loading
minimum for those transitions falsely communicates acquisition work.

Scene ownership, transition choreography, and loading presentation are separate
concerns.

## Decision

Every scene manifest declares a wait presentation:

- `loading`: unresolved critical preparation displays Loading and observes the
  loading minimum before entrance.
- `transition-only`: the destination still mounts hidden, acknowledges its
  complete painted frame, and enters through the director, but displays no
  Loading copy and has no artificial loading minimum.

Both modes retain generation cancellation, committed/pending separation,
inertness, exit, paint acknowledgement, entrance, and failure handling. The mode
does not permit direct rendering from route state.

Settings General, Audio, Gameplay, and Creator Tools are `transition-only`.
Audio Tracks remains `loading` because it acquires the soundtrack list.

## Consequences

A button that reveals resident controls still participates in the coherent scene
system without pretending that the application is loading assets. Instrumentation
can distinguish transition time from genuine waiting time.
