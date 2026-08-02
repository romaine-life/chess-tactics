---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)'s one mounted scene/store/compositor and phase-gated Battle activation"
  - "[ADR-0352](0352-final-discipline-arrival-precedes-the-automatic-deployment-wave.md)'s final-arrival settlement boundary before automatic phase promotion"
  - "[ADR-0353](0353-battlefield-view-state-is-instance-owned-and-camera-ready-before-reveal.md)'s instance-local camera and pre-reveal preparation rule"
partially_supersedes:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s explicit Begin Battle confirmation after meaningful choices"
  - "[ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)'s implication that the completed automatic formation pauses in Deployment"
---

# ADR-0349: The final Deployment choice commits and camera authority follows the active scene

## Context and Problem Statement

Deployment already asks the player for the exact consequential choices. Requiring a separate
**Begin Battle** press after the final Discipline placement repeats confirmation without adding a
decision. The final placement also exposed a presentation defect: during the director-owned
Deployment-to-Battle transition, the outgoing and preparing battlefield surfaces were mounted at
the same time and both published viewport-derived zoom floors into the shared camera. The visible
board consequently zoomed out through transient preparing dimensions and then snapped back after
Battle activation.

## Decision Drivers

- The final required choice is already an intentional commit gesture.
- Deployment and Battle are two phases of one continuously presented battlefield.
- Hidden, preparing, and exiting scene participants must not mutate visible camera state.
- The director's activation boundary remains the authority for clocks, combat input, opponent
  resolution, and Battle arrival motion.

## Decision Outcome

Chosen: **the last required Deployment choice commits directly to Battle, and only the activated
battlefield scene may publish shared camera state.**

- There is no ready-but-waiting Deployment state and no **Begin Battle** control.
- A Discipline placement, Muster Roll choice, or Surveyor's Compass choice remains in Deployment
  while another required choice is unresolved. The action that completes the final requirement
  persists the resulting formation and requests Battle immediately.
- A resumed Deployment whose required choices are already complete commits immediately as well.
- The deterministic ordinary formation still resolves after Discipline, but when the final
  Discipline placement completes Deployment it first appears as part of the incoming Battle
  position rather than pausing for confirmation in the outgoing phase.
- Deployment and its Battle use the same Run-Battle activity identity for board-camera framing.
- A mounted battlefield may continue to measure its own viewport while preparing or exiting, but
  it cannot publish minimum zoom, zoom, pan, opening-camera, or user-interaction state until its
  scene is activated. The outgoing Deployment surface releases that authority as soon as the Run
  phase changes; the incoming Battle receives it only at director activation.
- Battle clocks, combat input, opponent pieces, and arrival motion remain inactive until the
  director activates Battle under ADR-0346.

## Consequences

- Good: the final placement flows directly into play without a redundant confirmation.
- Good: scene overlap cannot produce a transient camera zoom or pan.
- Good: Deployment and Battle behave as one continuous battlefield presentation while retaining
  their persisted domain and scene boundaries.
- Cost: choice handlers must commit through one readiness primitive rather than merely persisting
  their individual field.

## More Information

- [ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)
- [ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)
- [ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)
