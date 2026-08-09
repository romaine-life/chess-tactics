---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md)"
  - "[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md)"
---

# ADR-0541: A formation in hand is off the board

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

The same duplicate arrives from the other end too. Placing the last card of a hand leaves that card
selected (ADR-0526 §14, so it can still be moved or removed), and a selected card was carried on
the cursor whether or not it was standing on the board — so the formation the player had just put
down went on following the mouse.

## Decision Drivers

- The formation under the hand is the subject. ADR-0526 already commits to this — while a seating
  resolves the pointer is hidden beneath the formation, because the formation *is* the cursor.
- Moving a formation should be the gesture that placed it, not a different one. Anything left
  behind on its old squares is a second copy of the thing in your hand.
- ADR-0533's equal strength must survive for every other pair. Two DIFFERENT formations, one in
  hand and one seated, are the same kind of statement and must go on matching exactly.
- Picking a formation up must stay free: no entrance, no withdrawal, nothing persisted, and no
  penalty for picking one up and changing your mind.

## Considered Options

- **Make the carried copy the ghost and leave the seating solid.** The board would then say "this
  is where it is, and this is where it would go". It reads correctly for a preview, but it
  contradicts ADR-0526: the thing under the hand would be the fainter of the two, and the cursor
  is hidden beneath it.
- **Leave the seating in place as a shadow.** Tried and rejected on sight: a faint formation with a
  faint plot still reads as a formation standing on those squares, so the board still shows the
  same body twice. Half a lift is not a lift.
- **Take the formation off the board while it is in hand.** Chosen.

## Decision Outcome

Chosen: **a formation in the player's hand is not on the battlefield at all. Picking one up takes
its units and its plot off the board, so moving a formation looks exactly like placing it for the
first time.**

- **In hand** is: a card that has not been placed, or a placed card the player has picked up.
  Picking up is a gesture — clicking the formation on the board, or choosing its card in the hand
  rail or with the keys. It is deliberately not "selected": placing the last card of a hand leaves
  it selected, and a card resting on the board must stay on the board.
- **The whole carry belongs to the card in hand.** The band, the reachable squares, the offered
  turns, the formation on the cursor and the placement click are all gated on it. A formation
  resting on the board paints none of them, so it cannot be moved by a click the player was never
  offered — and ADR-0526's rule that the band is painted whenever a formation is in hand now says
  exactly what it does.
- **Nothing is written to the Run.** The document keeps the placement while the formation is in
  hand, so putting it down is an ordinary placement and picking it up then walking away restores
  the seat it came from. A mis-click costs nothing. `deploymentLayoutInHand` and
  `seatedFormationsBySquare(run, cardInHandId)` are projections over the same two fields the
  grouping already reads, so no save version moves.
- **The document still records where the held formation stood**, so its own old squares must read
  as ground to place on rather than as a formation to pick up again. Clicking any OTHER seated
  formation still picks that one up.
- ADR-0533 is untouched: a formation in hand and a formation on the ground are still drawn at the
  same plan strength, because they are never the same formation any more.

## Consequences

- Good: moving a seated formation is the placing gesture, start to finish. There is one of each
  formation on screen at all times.
- Good: the just-placed card stops following the cursor, which was the same duplicate reached from
  the other direction.
- Cost: a formation picked up is briefly absent from the board, so a player comparing "here versus
  there" no longer sees both at once. That comparison was the thing that read as two formations.
- Cost: turning is offered only for a formation in hand. A resting formation must be picked up
  before Q/E, the rail's turn buttons, or a secondary click do anything to it.

## More Information

- [ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) — the carry gesture, and the rule that
  the formation is the cursor.
- [ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md) — plan strength, and why seating
  spends no entrance.
- [ADR-0535](0535-a-formation-is-drawn-as-one-block-on-the-ground.md) — the block outline that
  leaves the board with its formation.
