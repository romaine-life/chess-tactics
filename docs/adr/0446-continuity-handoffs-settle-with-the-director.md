---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0385](0385-scene-crossing-visuals-use-the-directors-continuity-layer.md)'s outgoing-component lifetime rule"
refines:
  - "[ADR-0445](0445-transition-choreography-is-derived-from-scene-ownership.md)"
---

# ADR-0446: Continuity handoffs settle with the director

## Context

ADR-0385 made the outgoing feature component the React lifetime owner of a visual carried
through the director's continuity layer. That worked while every Run workspace navigation
overlapped two complete scene trees: retiring the outgoing tree released the carried paint
after the incoming canonical owner appeared.

ADR-0445 distinguishes a complete scene replacement from a selection change. A selection
retains one scene owner, fades only its selected region to the owner's neutral state, and
replaces that region during preparation. The outgoing selected component therefore unmounts
before the destination enters. Using its lifetime as the release signal makes the carried
object disappear during preparation; retaining the hook inside that component cannot satisfy
both the new ownership model and the no-blank-frame continuity contract.

## Decision

- A visual crossing an authored transition is owned by the nearest semantic scene owner that
  remains mounted for the complete handoff, not necessarily by the selected source component.
  For Bona Vacantia, the Run phase owner holds the lipsanon flight while the mat and targeting
  ledger remain replaceable gameplay-workspace selections.
- A `scene-settled` continuity contribution remains painted after landing once it observes a
  director transition. It releases only when that director generation returns to `current`,
  after the destination's canonical owner has entered, or when its semantic owner unmounts at
  the same completed boundary during a full scene replacement.
- The director's continuity host supplies phase and generation to the closed portal capability.
  Feature components do not inspect director DOM, choose transition type, run a guessed timer,
  or own navigation through the carry.
- Local presentation that does not cross authored ownership continues to release on landing.

## Enforcement

- `SceneContinuityHost` is the sole provider of director settlement state, and
  `SceneContinuityPortal` is the sole consumer that may notify a retained carry.
- Bona Vacantia's selected mat receives only the phase-owned launch capability; it may not
  instantiate its own scene-settled flight hook.
- The live Run scene gate samples the targeted selection handoff and the ordinary phase
  replacement handoff. It rejects a blank frame, a missing carry during preparation, a carry
  at a non-canonical coordinate, or a durable duplicate after settlement.

## Consequences

- Shared-element continuity now follows the same owner distinction as transition choreography.
- A retained selection owner can carry paint through deselection without keeping the outgoing
  selected subtree alive or mounting a second complete scene.
- Slow preparation and retry remain lifecycle-driven; there is no asset-speed timeout that can
  release the carry early.
