---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)'s rule that a placement click is itself an entry beat, for Run Deployment's arranged formations"
---

# ADR-0532: A seated formation is a plan until Battle

## Context and Problem Statement

Run Deployment let the player carry a formation on the cursor and click a square to seat it. The
carried formation was drawn translucent — visibly a proposal. The moment it was seated it turned
solid and played ADR-0045's materialize-and-drop, the same entrance a unit gets when it joins a
battlefield.

That put the arrival on the wrong event. Seating a formation is not a unit arriving; it is the
player writing down where a unit will go. The seating can be turned, taken back, moved to another
square, or left off the board entirely, and the enemy is standing there watching none of it happen.
Deployment therefore spent the army's entrance one formation at a time, on a decision, and by the
time Battle actually began there was nothing left to arrive — Begin Battle promoted a board whose
units were already standing on it, so the moment the fight starts had no physical beat at all.

ADR-0351 was right that the mounted board should key arrival off unit identity rather than a phase
label, and right that a genuinely new unit must not pop. Its one wrong step was treating a
Deployment placement as a genuinely new unit.

## Decision Drivers

- Placing, turning, and taking back a formation must all read as editing a plan, not as units
  marching on and off the field.
- The strength a seated formation is drawn at should be the strength it was drawn at while carried,
  because nothing about it has become more real.
- Begin Battle is the event the whole screen exists to reach; it must be the beat that puts the
  army on the ground.
- A unit genuinely introduced mid-Battle — a Discipline placement, a promotion, a reservist — still
  arrives when it appears. This is not a retreat from ADR-0351's identity ledger.
- The retained board must not remount, reframe, or re-drop anything already standing.

## Decision Outcome

Chosen: **a unit the player has seated but not yet sent into battle is PLANNED — drawn at plan
strength, held out of the arrival ledger, and given its entrance by the promotion into Battle.**

- `SkirmishBoardSurfaceState` carries `plannedPieceIds`. Run Deployment fills it with the keys of
  the deployment layout's placements, which are the Run unit ids and therefore the board's own
  piece ids (`setup.ts` seats a level unit under its `runUnitId`).
- The scene compositor paints a planned piece at `PLANNED_UNIT_OPACITY`, the same value a previewed
  piece is drawn at, so the formation on the cursor and the formation on the square match exactly.
- The arrival ledger admits only DEPLOYED pieces. A planned piece is never entered into the visible
  ledger and never receives an arrival plan, so seating it plays no entrance and taking it back
  costs nothing.
- Begin Battle promotes the plan into the live match on the same mounted board. The player's units
  are then live for the first time, ADR-0351's ledger sees them as newly visible identities, and
  they take ADR-0045's staggered drop together. The enemy force, which stood on the Deployment
  board as the position being arranged against, is already in the ledger and stays seated.
- The promotion voices the deploy roll-call (`voiceDeployRollCall`). `preserveBoardPresentation`
  used to mean both "keep this board" and "stay silent"; those are now separate, because a
  promotion keeps the board AND lands an army, while a plain restart keeps the board and lands
  nobody.
- A withdrawal (a Deployment reroll) begins from the strength the unit was actually drawn at, so a
  planned unit fades out from plan strength instead of solidifying in order to leave.

### Consequences

- Good: the deployment band reads as a plan being drafted, and Begin Battle reads as an army being
  committed.
- Good: the entrance is spent once, on the event that deserves it, instead of once per click.
- Good: taking a formation back is now visually free — nothing arrived, so nothing withdraws.
- Cost: the surface-state contract carries one more field, and the compositor separates "live" from
  "deployed" where it previously had one list.
- Cost: ADR-0351's statement that a placement click supplies its own entry beat no longer holds for
  arranged Deployment formations. It still holds for every unit introduced during a live Battle.

## More Information

- [ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md) — the entrance itself.
- [ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md) — why the board is
  retained across the promotion rather than remounted.
- [ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md) — the identity
  ledger this decision narrows the input of, rather than replacing.
- [ADR-0357](0357-a-unit-awaiting-its-entrance-is-staged-off-the-board.md) — a unit that has an
  entrance owed to it is never painted seated first; a planned unit is owed nothing, which is why
  it is painted at its square from the moment it is seated.
