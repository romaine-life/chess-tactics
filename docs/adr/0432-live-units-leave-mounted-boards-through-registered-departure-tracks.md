---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)"
  - "[ADR-0431](0431-deployment-position-rerolls-cost-one-before-battle-and-five-after.md)"
---

# ADR-0432: Live units leave mounted boards through registered departure tracks

## Context

ADR-0431 initially replaced the persisted formation as soon as the player bought a reroll. The
mounted compositor correctly projected that new empty Deployment state, but the visible units
therefore vanished in one frame. The model transition had a cost and a destination but no physical
exit.

Unit entrance already has a compositor-owned identity ledger and completion signal. A live unit
leaving the same mounted board needs the corresponding lifecycle. Allowing each feature to invent
an offset, fade, timer, or immediate removal would keep “unit disappears” as the accidental default
and make physical continuity depend on whichever screen initiated the transition.

## Decision

- A gameplay transition which intentionally removes a still-live unit from a mounted battlefield
  selects a reason from the shared unit-departure contract. The reason resolves to a default track;
  an authored caller may choose another track only from the same closed registry. Arbitrary caller-
  supplied curves and screen-owned disappearance timers are not accepted.
- The initial physical track registry contains **withdraw-home** and **withdraw-nearest-edge**.
  Deployment reroll defaults to **withdraw-home**: player units turn and leave through the player
  edge, enemy units turn and leave through the enemy edge. The nearest-edge track exists for an
  authored evacuation whose fiction does not name a side's home.
- Death and capture are distinct reasons, not an implicit still-live departure. They must use their
  own registered removal treatment when that lifecycle is standardized; they may not silently
  borrow reroll withdrawal or make an arbitrary feature-local track.
- The mounted board compositor owns departure positions, staggering, clipping, mirrors, frame
  scheduling, active ids, and completion. It publishes the selected track and departing ids for live
  verification. No Run screen duplicates the motion duration.
- Buying a Deployment reroll starts the selected departure first. Deployment transport, dealing,
  placement input, Battle input, clock, AI, premoves, Undo, and Retry are frozen while it owns the
  board. The existing atomic gold-and-reroll model transition commits only after the compositor
  reports every currently visible non-neutral unit clear of the board.
- A unit which is still inside its arrival lifecycle transfers directly into departure from its
  current painted pose. It does not finish arriving, snap to its seat, disappear, and then leave.
- The board, terrain, `ViewPane`, camera, scene activity, and compositor remain mounted. A reload or
  navigation before the presentation-only departure completes retains the pre-reroll Run state and
  spends no gold; the player may request the reroll again.

## Consequences

- Reroll reads as the existing formation withdrawing before the placement process starts again.
- Adding another physical way for a live unit to leave is a deliberate registry and reason-mapping
  change rather than a permissive animation prop.
- The domain transition stays deterministic and atomic without persisting animation progress or
  adding a Run save/database field.

## More Information

- [Board render contract](../board-render-contract.md)
- [Game concept](../game-concept.md)
- [ADR-0431](0431-deployment-position-rerolls-cost-one-before-battle-and-five-after.md)
