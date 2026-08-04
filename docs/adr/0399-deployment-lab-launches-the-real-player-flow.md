---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0400](0400-deployment-playtests-carry-a-visible-return-to-the-lab.md)'s explicit return control"
supersedes:
  - "[ADR-0398](0398-run-deployment-has-an-owner-operated-studio-lab.md)'s debug-result-only boundary"
refines:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)"
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0352](0352-final-discipline-arrival-precedes-the-automatic-deployment-wave.md)"
---

# ADR-0399: Deployment Lab launches the real player flow

## Context

ADR-0398 supplied an algorithm debugger: it varied placement inputs, rendered the final formation,
and explained the placer. That does not test what the player deals with when Deployment triggers.
It omits the real Controls sequence, sparse Adlected presentation, arrival settlement, automatic
formation wave, and promotion of the mounted battlefield into combat.

Reimplementing those behaviors inside Studio would create a second Deployment UI whose timing and
choice rules could drift from the Run screen it is meant to verify.

## Decision

- Deployment Lab retains its deterministic algorithm result and trace, and adds a **Player flow**
  launcher. Player-flow inputs include Muster Roll and Surveyor's Compass; Adlected remains a
  per-unit ability in the roster.
- Launch constructs a validator-complete one-Battle active Run from the current lab geometry,
  roster, abilities, seed, obstacles, and deployment lipsana. It clears debug-only manual squares
  and layout selection so the player must resolve the case. A retained `run-king` is required.
- The synthetic Battle includes a fixed enemy opening force outside the player zone. Opponents
  remain hidden during Deployment by the existing presentation and enter when Battle begins.
- Launch replaces the owner's disposable active Run and navigates to `/run`. From that point the
  instrument uses the actual `RunScreen`, active-Run store, Deployment controls, Skirmish session,
  compositor arrival reporting, readiness functions, and in-place Deployment-to-Battle promotion.
  Studio does not simulate or embed a parallel flow.
- The final required choice continues directly into Battle under the standing Run contracts. The
  browser Back action returns to the URL-addressed lab configuration for another case.
- The synthetic War is an active-Run test snapshot only. It is never saved or published as a War,
  Campaign, or canonical Level.

## Consequences

- The owner can debug an algorithm result and then experience that exact setup as the player.
- Any difference between the lab-launched flow and an ordinary Run is a defect in shared Run state,
  not an expected limitation of a Studio imitation.
- Starting a flow intentionally replaces the current active Run, matching the repository's active
  Run testing policy.

## More Information

- [ADR-0398](0398-run-deployment-has-an-owner-operated-studio-lab.md)
- [ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)
- [ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)
- [ADR-0352](0352-final-discipline-arrival-precedes-the-automatic-deployment-wave.md)
