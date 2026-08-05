---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0463](0463-continuity-handoffs-settle-with-the-director.md)'s outgoing-component lifetime rule"
refines:
  - ADR-0205
  - ADR-0206
  - ADR-0215
  - ADR-0307
  - ADR-0383
---

# ADR-0385: Scene-crossing visuals use the director's continuity layer

## Context

Taking a Bona Vacantia lipsanon animates one physical object from the mat into the
persistent held strip. Landing then requests either the targeted-unit scene or the
Shop. The flight used to release its visual immediately, while the incoming scene's
real strip was correctly mounted but hidden during preparation. The lipsanon therefore
vanished for the loading interval and reappeared when entrance began.

Keeping it alive for an arbitrary delay would tie continuity to asset luck and reopen
the local transition choreography retired by ADR-0307. Putting it in either scene layer
would make it inherit that layer's fade. A scene-crossing visual needs an explicit owner
for the interval in which its semantic owner changes.

## Decision

The presentation director owns one inert continuity layer outside every
`SceneBoundary`. Feature code may contribute to it only through the closed
`SceneContinuityPortal` capability and a typed `shared-element` contribution
object carrying a stable transition-local id.

A continuity contribution is transient paint only. It cannot receive input, own a
viewport, select scene identity, navigate, or carry application state. The outgoing
scene remains its React lifetime owner. When the moving visual lands, that owner keeps
the landed copy in the continuity layer and requests the destination normally. The
incoming scene prepares and reveals its canonical visual owner underneath. Only when
the director retires the outgoing scene does the carried copy unmount, leaving the
already-visible canonical copy at the same coordinate.

Bona Vacantia opts its lipsanon flight into this `scene-retirement` handoff for both
the targeted-unit transition and an ordinary take into the Shop. Studio-local flight
review keeps the default release-on-landing behavior.

## Enforcement

- Only `SceneContinuityHost` emits the continuity layer and only
  `SceneContinuityPortal` calls `createPortal` for Run transition paint.
- The layer and every direct contribution are pointer-inert.
- The live Run scene gate samples every animation frame through both the targeted and
  ordinary handoffs and fails if no visible instance owns the chosen lipsanon.
- The incoming canonical strip remains the sole durable instance after the outgoing
  scene is retired.

## Consequences

- A scene-crossing object no longer blinks or fades merely because its semantic owner
  changes.
- The capability can support another genuine shared-element handoff without granting
  arbitrary feature portals or another screen authority.
- Failed or slow destination preparation leaves the landed object visibly held by the
  outgoing scene instead of exposing a blank interval.
