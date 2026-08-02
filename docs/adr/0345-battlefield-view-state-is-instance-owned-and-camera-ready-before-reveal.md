---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0341](0341-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s activated-scene-only shared-camera publication rule"
refines:
  - "[ADR-0136](0136-loading-is-manifest-driven-and-frame-acknowledged.md)"
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)"
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0342](0342-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
---

# ADR-0345: Battlefield view state is instance-owned and camera-ready before reveal

## Context and Problem Statement

The scene director may retain an outgoing battlefield while a destination battlefield measures and
paints. The match store was made instance-owned for that lifetime, but `SkirmishViewState` remained
a process-global singleton containing zoom, pan, viewport-derived limits, opening framing, and
overlay state. Two mounted battlefields could therefore mutate one camera.

An attempted safeguard allowed only a director-activated battlefield to publish camera state. That
conflated gameplay activation with visual preparation. The destination became visible during its
entrance at the generic camera, then applied its real viewport-derived camera only when the entrance
completed. Deployment and ordinary Battle cold loads consequently snapped between two compositions.

## Decision Drivers

- A destination's first visible frame includes its final camera transform.
- Hidden preparation must be able to measure and compose without mutating an outgoing scene.
- Input, clocks, AI, and arrival motion are activation effects; camera fitting is preparation.
- Deployment and its Battle retain one battlefield lifetime and therefore one view-state instance.
- Distinct mounted battlefield scenes must not coordinate through a global mutable camera.
- Readiness must describe the pixels and transform actually intended for reveal.

## Decision Outcome

Chosen: **every mounted battlefield owns an instance-local view store, and its canonical opening
camera is a required preparation result before the battlefield may report surface readiness.**

- `Skirmish` creates one view store beside its instance-owned match store. `SkirmishBoard`, its HUD,
  and imperative view actions consume that contextual instance; production battlefield state does
  not fall back to a process-global singleton.
- Camera zoom, pan, minimum/maximum zoom, opening camera, reset identity, and transient board
  overlays belong to that mounted battlefield. A later durable player preference may seed a new
  instance, but it cannot be the live mutable store shared by mounted scenes.
- The shared board-framing controller measures the actual owning `ViewPane` and applies the opening
  camera during hidden preparation. It is not gated by scene activation.
- Board surface readiness remains false until both the real compositors have painted and the
  controlled camera matches the canonical opening camera for the current board identity, viewport,
  and effective coverage floor. A placeholder/default camera is never a ready frame.
- Scene activation continues to gate chess input, clocks, opponent behavior, and unit-arrival
  motion. Those concerns do not gate camera measurement or composition.
- An outgoing and incoming battlefield may prepare simultaneously because their stores are
  isolated. Neither can change the other's visible camera.
- Run Deployment and its Battle retain the same `Skirmish`, view store, `ViewPane`, and camera under
  ADR-0342. Phase promotion introduces state and behavior; it does not create or reset a camera.
- No Deployment-specific camera branch, copied camera calculation, delay, or reveal-time correction
  is permitted. Gameplay surfaces use the same contextual store, `ViewPane`, and shared framing
  primitive.

## Consequences

- Good: the first visible Deployment and Battle frames already use their settled composition.
- Good: overlapping authored scenes cannot fight over camera state.
- Good: preparation and activation regain distinct meanings across the scene system.
- Good: Deployment/Battle continuity follows store and compositor identity rather than copied
  values.
- Cost: view-store consumers and tests must use an explicit battlefield provider or an explicitly
  constructed isolated store.
- Cost: live transition verification must observe camera state throughout loading and entrance,
  not only after the director reaches `current`.

## Verification

- Cold Deployment and ordinary Battle traces assert that every visible frame uses the final camera.
- An overlap test mounts two battlefield instances and proves incoming preparation cannot mutate the
  outgoing view store.
- Deployment-to-Battle verification proves the provider, board, canvases, and camera remain
  identical while gameplay-only activation changes.
- Static architecture checks reject a process-global production view hook and activation-gated
  opening-camera publication.
