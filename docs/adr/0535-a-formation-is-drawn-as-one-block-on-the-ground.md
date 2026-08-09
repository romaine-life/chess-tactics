---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md)"
  - "[ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md)"
---

# ADR-0535: A formation is drawn as one block on the ground, in hand and seated alike

## Context and Problem Statement

A Run card is a small authored formation: two or three units in a fixed relative shape, placed as
one body by a single click, turned as one body, and taken back as one body. Nothing on the
battlefield said so. Once a formation was seated its units were ordinary pieces on ordinary
squares, and the only signal that a square held a formation at all was the cursor turning to
`grab` when the pointer crossed it.

That is an affordance with no signifier. A hand of three cards seats seven pieces along the
deployment band and reads as seven individuals, so the fact that one click takes a whole formation
back is discoverable only by accident — and the formation the player bought, whose SHAPE is the
whole of what the card grants, visibly dissolves at the moment they commit to it.

The card face had already solved the same problem for itself. `runCardFormationBoardCells` draws a
card's units on one connected plot and strokes only the edges that face OFF the footprint, because
a line BETWEEN two occupied seats reads as a grid rather than as a body. That drawing stopped at
the card.

## Decision Drivers

- The shape a card grants is the card's content; it must survive being placed.
- The board must say which body holds a square, not merely that some body does — a mark that looks
  the same for every formation only says "these squares are spoken for".
- Whatever is drawn has to read over grass, sand, water and stone, on a board that already strokes
  a dark line along every tile edge and already tints the whole deployment band.
- No second source of truth: the grouping is already in the Run document and must not be copied
  into a new field.
- Since ADR-0533 the formation on the cursor and the formation on the ground are the same plan at
  the same strength, so a mark that distinguished them would be inventing a difference.

## Decision Outcome

Chosen: **a formation is drawn as one liveried plot — the card's own outlined footprint, on the
battlefield's own tile geometry — from the moment it is carried, unchanged when it is seated.**

- `formationBlockSquares` is the one solver, fed either the committed placements or the seating
  currently resolved under the pointer. It delegates to the card face's `runCardFormationBoardCells`
  rather than reimplementing the edge rule, so the board and the card cannot disagree.
- The geometry transfers with no adaptation: the card's diagram is the battlefield's own projection
  scaled into card units, and both tiles are 96×54, so `RUN_CARD_FORMATION_EDGE_LINE` lands on a
  `.skirmish-board-cell-hit` exactly.
- Each formation wears a livery keyed to its place in the dealt hand. A Battle deals three cards,
  four while the Quartermaster's Ledger is held, and `RUN_FORMATION_LIVERY_COUNT` is six, so the
  cycle is never reached in play.
- The carried block wears the livery it will keep. Only the ground it covers is lifted, because
  that ground is the one thing on the board still being decided; the line does not change colour
  under the player's hand at the moment they commit it. Pointing at a seated block lifts it the
  same way, so the gesture that picks a formation up also confirms it is one thing.
- **Nothing is persisted.** The grouping is already in the document twice over — a card's
  `unitSeats` name its units for the life of the card, and `deployment.placements` name the square
  each unit stands on. This is a projection, so no RunSaveVersion moves and the server's
  closed-set unit validator is untouched.
- The block belongs to Deployment. The overlay that carries it is the arrangement overlay, so it
  ends when the plan is promoted and the army becomes live.

### Two things the pixels decided, not the design

- **The boundary is drawn at twice its visible weight and halved by the clip.** The line sits ON
  the tile edge and the square hosting it is clipped to exactly that edge, so a centred stroke
  loses its outer half and antialiases the remainder to nothing. Insetting the geometry instead
  would open a gap at every corner where an outward edge meets a shared one, breaking the
  footprint's outline into per-square arcs — the grid reading this exists to remove.
- **The livery rides a light stroke over a dark carrier.** The battlefield already draws a dark
  line along every tile edge, so a dark boundary is camouflaged by the grid it is meant to be read
  against; a light one alone disappears over sand. The pair reads on both.

### Consequences

- Good: the shape the card granted is visible for as long as the plan exists, and the whole-body
  pickup has a signifier instead of a cursor change.
- Good: one solver and one geometry shared with the card face, so the two drawings cannot drift.
- Good: derived, so no save version and no validator change.
- Cost: the deployment band now carries a second persistent paint under the pieces. It is bounded
  by the hand — three or four blocks — but it is not free, and a longer hand would need the livery
  set revisited rather than the cycle widened.
- Rejected: **a tether** joining members' centres. On an isometric board a line between diamond
  centres reads as a path rather than a bond, and the pieces stand on the centres it would need.
- Rejected: **hover-only**, which cannot fix a discoverability problem — the player must already
  suspect the block exists before they will point at it to confirm it.
- Rejected for now: **a planted standard that is itself the pickup handle**, which is the strongest
  precedent (Total War selects a unit by its banner; a standard-bearer historically let a commander
  move a body by moving its flag). It needs art the catalog does not have, and it occludes on an
  isometric board where three to five blocks sit close together.

## More Information

- [ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md) — why carried and seated are the
  same plan at the same strength, which is why one mark serves both.
- [ADR-0492](0492-run-cards-are-small-authored-formations-without-abilities.md) — the formation is
  the whole of what a card grants.
- [ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) — the carry this mark now rides along
  with, and the gesture that makes a block land anywhere and therefore need identifying.
