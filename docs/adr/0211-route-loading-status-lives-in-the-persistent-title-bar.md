---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0201
  - ADR-0208
  - ADR-0209
---

# ADR-0211: Route loading status lives in the persistent title bar

## Context

The first scene director retained a reconstructed background after full-scene
exit and placed Loading copy in the middle of that image. That assumes every
playable board has an independent world background. Complete pre-drawn levels
violate the assumption: their accepted scene artwork is the board and the
background together, so substituting a generic battlefield background is neither
continuity nor an honest representation of the outgoing scene.

The application title bar already persists across normal navigation. Passive
wait status therefore has a stable application-owned location that does not
depend on any destination's artwork composition.

## Decision

- After startup, genuine scene acquisition renders `Loading…` directly beside
  “Chess Tactics” in the persistent brand lockup's title line. The existing
  screen-name line remains in place beneath it. Loading does not create a new
  title-bar child, grid track, or center-lane owner.
- Center-screen Loading copy is reserved for cold application startup before the
  title bar exists.
- During a full-scene transition, the director retains the complete outgoing
  scene as the painted lower layer while the complete destination prepares inert
  and hidden above it. Once the destination acknowledges a painted frame, the
  two complete scenes crossfade and only then may the outgoing DOM be destroyed.
  The director never exposes a blank intermediary or reconstructs a standalone
  world/background image independently of either authored scene.
- The incoming destination still enters only after its complete painted-frame
  acknowledgement. Composited boards and complete pre-drawn board artwork use the
  same lifecycle.
- Same-host transitions continue to preserve their authored host and replace only
  its named region. `transition-only` destinations continue to show no Loading copy.
- A terminal load failure may own a scene-canvas retry surface because it is an
  actionable destination state rather than passive wait text.

This supersedes only ADR-0201's retained-background and centered route-Loading
presentation. Its single-director, atomic destination, manifest, readiness, and
startup decisions remain in force.

## Consequences

No level type needs a synthetic background fallback or a blank intermediary
during navigation. Route loading has one stable visual address, while
transition-only controls remain snappy and silent. The title bar can communicate
acquisition without painting copy over level artwork or changing placement
according to scene composition.
