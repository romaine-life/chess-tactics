---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0205
  - ADR-0206
---

# ADR-0213: The application title bar persists across scenes

## Context

The first scene director treated navigation without a shared destination host as
replacement of the complete visual hierarchy. That made launching a campaign
mission fade out the application title bar even though the same application bar
exists on both sides of the transition. It also made gameplay-to-menu feel less
continuous than menu-to-gameplay: the homepage background had an independent
persistent owner, while the outgoing battlefield and title bar disappeared with
the gameplay content.

The title bar's route-owned center controls and screen name can change, but its
frame, brand, persistent control lane, music, settings, and account controls are
application chrome. Scene identity does not own their existence.

## Decision

The one `AppTitleBar` is a persistent application host outside every replaceable
`SceneBoundary`.

- Normal navigation never fades, hides, unmounts, or makes the title-bar host
  inert.
- Initial startup remains the sole exception: its authored background, title,
  and main-controls reveal still gates the title bar until the title stage.
- Route-owned title contributions follow the director's committed mounted path;
  stale destination preparation cannot contribute visible controls.
- Full-scene exits fade only replaceable scene content.
- When gameplay exits, the director retains the exact battlefield background
  composition beneath the destination crossfade instead of substituting a
  generic color or gradient.
- Scene-critical title controls still participate in the destination's semantic
  readiness where required, but that readiness cannot hide the persistent bar
  frame or its invariant controls.

This refines ADR-0205's “complete scene” boundary: the atomic destination is the
replaceable visual scene inside the persistent application host. It also extends
ADR-0206's persistent-host principle above route-family hosts.

## Consequences

Launching a campaign mission no longer blinks the title bar. Returning from
gameplay retains the same outgoing battlefield pixels while the homepage scene
becomes ready and fades over them. The title bar remains a stable anchor in both
directions, while route-owned gameplay status may disappear or change only when
the director commits the new mounted path.
