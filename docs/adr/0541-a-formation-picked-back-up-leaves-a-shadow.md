---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md)"
  - "[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md)"
---

# ADR-0541: A formation picked back up leaves a shadow, not a second copy

## Context and Problem Statement

Two decisions met at a state neither of them was written for.

[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) made a formation already on the board
pickable: clicking one of its squares selects that card again, so it can be repositioned without
being removed from the hand first. [ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md)
made a seated formation a PLAN, drawn at exactly the strength the carried one is drawn at, so that
seating a formation neither solidifies it nor spends its entrance.

Each is right on its own. Together, at the moment a player picks a seated formation back up, the
same formation is painted twice over — once on the squares it still holds and once on the cursor —
at identical strength, in identical livery, with identical outlines. Nothing on screen says which
of the two the player is deciding about. The board reports a formation that is simultaneously
placed and moving around, which is not a state the game has.

The confusion is worst exactly where the gesture is most useful: sweeping a placed formation a
square or two along the band, where the two copies are close enough to be read as one formation of
twice the size.

## Decision Drivers

- The formation under the hand is the subject. ADR-0526 already commits to this — while a seating
  resolves the pointer is hidden beneath the formation, because the formation *is* the cursor.
- The squares a formation was picked up from are still information: it is where the formation
  goes back to if the player never seats it elsewhere, and losing the plot entirely would read as
  "removed from the board" rather than "in your hand".
- ADR-0533's equal strength must survive for every other pair. Two DIFFERENT formations, one in
  hand and one seated, are the same kind of statement and must go on matching exactly.
- Picking a formation up must stay free: no entrance, no withdrawal, nothing persisted.

## Considered Options

- **Make the carried copy the ghost and leave the seating solid.** The board would then say "this
  is where it is, and this is where it would go". It reads correctly for a preview, but it
  contradicts ADR-0526: the thing under the hand would be the fainter of the two, and the cursor
  is hidden beneath it.
- **Take the seating off the board entirely while it is carried.** Unambiguous, and wrong at the
  edges — the plot vanishes, so a player who carries the formation off the band cannot see where
  it will end up if they drop the gesture.
- **Leave the seating in place as a shadow.** Chosen.

## Decision Outcome

Chosen: **a formation the player has picked back up is drawn at the seats it came from as a
shadow, and the copy on the cursor keeps plan strength.**

- `SkirmishBoardSurfaceState` carries `liftedPieceIds` beside `plannedPieceIds`. A lifted piece is
  still planned in every other respect: it stays out of the arrival ledger, so picking a formation
  up and putting it down spends no entrance and costs nothing, exactly as ADR-0533 requires.
- The compositor paints a lifted piece at `LIFTED_UNIT_OPACITY`, half plan strength — the same
  answer the board already gives a live piece being dragged away from its square. One function,
  `plannedUnitOpacity`, decides plan strength for the frame and for a withdrawal's starting
  strength alike, so a formation cannot fade out from a strength it was never drawn at.
- **A formation is lifted only while it is actually being carried** — while a seating resolves
  under the cursor. A card that is merely selected is resting on the board, not in the air, and
  is drawn as any other plan. This matters because ADR-0526 leaves the last-placed card selected
  when there is nothing else to place.
- **The vacated plot stays drawn, receded.** The block outline is what says the ground is still
  this formation's, so it recedes with the pieces rather than disappearing. The "you may pick this
  up" lift that a seated plot gets under the pointer is not offered on it: it has been picked up.
- Nothing is persisted. The lift is a projection of the selected card, its committed placements,
  and where the pointer is — the same three things the carried footprint is already solved from —
  so no Run save version moves.

## Consequences

- Good: moving a seated formation reads as picking it up. One copy is the decision, the other is
  the ground it came from.
- Good: ADR-0533's equal strength is untouched for every pair of formations that are not the same
  formation, which is every other pair on the board.
- Cost: the surface-state contract carries one more field, and plan strength now has two values
  instead of one.
- Cost: a player who selects a placed card from the hand rail and then sweeps the board sees that
  formation lift as soon as a seating resolves, before they have clicked anything. That is the
  intended reading — it is in their hand — but it is a state the previous behaviour never showed.

## More Information

- [ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) — the carry gesture, and the rule that
  the formation is the cursor.
- [ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md) — plan strength, and why seating
  spends no entrance.
- [ADR-0535](0535-a-formation-is-drawn-as-one-block-on-the-ground.md) — the block outline this
  recedes rather than removes.
