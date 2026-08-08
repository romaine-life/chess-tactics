---
status: accepted
date: 2026-08-07
deciders: Nelson, Claude
refines:
  - "[ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md)"
  - "[ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)"
---

# ADR-0520: A secondary click turns the formation being placed

## Context and Problem Statement

Arranged Deployment ([ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md))
asks the player to place a whole formation at once: pick a card, aim at a square on the
battlefield, click to seat every unit on it. Turning that formation lived only on a rail of four
buttons — `0° / 90° / 180° / 270°` — in the controls column, well away from the board.

That put the two halves of one decision in two places. Aiming happens with the cursor on the
battlefield; turning happened with the cursor across the screen on a button. Trying a shape both
ways meant leaving the square, pressing a turn, coming back, and re-finding the square — and the
hovered preview blanked on the way out, so the comparison was from memory rather than from the
board. The hand wants to turn the thing it is holding, where it is holding it.

The obvious binding — the secondary mouse button — was the one the board had already given away.
[ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md) made the secondary button **pan-only**
across the whole board viewport, because the Level Editor's canvas is wall-to-wall hit targets
with no empty space to pan from. Its reasoning was specifically about *erase*: distinguishing a
destructive click from a pan by a small movement threshold "would make a destructive action depend
on pixel-precise input and would still risk erasing work after an intended pan."

## Decision Drivers

- The turn belongs at the cursor, on the square being aimed at.
- Panning must survive intact: the deployment band is covered in placement highlights, so the
  board still has to be draggable from anywhere.
- ADR-0128's refusal was about destruction, and its force should be preserved exactly there.
- A gesture must not reach a state the visible controls cannot.
- Keyboard access must not regress.

## Considered Options

- Leave turning on the rail only, and accept the round trip.
- Bind the turn to a keyboard key (`R`) instead of a mouse button.
- Bind the turn to the secondary button, distinguishing a click from a pan by movement.

## Decision Outcome

Chosen: **a secondary press that releases without panning turns the formation waiting under the
cursor; a secondary press that moves still pans.** The rail of turn buttons stays exactly as it is.

The complete contract:

1. **The drag is untouched.** `ViewPane` still claims the secondary button in the capture phase
   and still owns panning throughout the viewport. Once a press crosses
   `VIEW_PANE_PAN_THRESHOLD_PX` it is navigation, and nothing else may happen at its release.
2. **Only the release of a press that never moved is claimable**, through
   `ViewPane`'s `onSecondaryClick`. A press that carried no navigation is the only thing being
   spent here.
3. **Nothing destructive may ever be bound to it.** ADR-0128 stands unweakened: the threshold
   this rule introduces is exactly the thing that ADR-0128 refused to put in front of an erase,
   and the reason it is acceptable here is that turning a formation that has not been placed yet
   costs nothing and undoes itself on the next click. Erase still requires the Erase tool, and the
   Level Editor still has no secondary-button meaning at all.
4. **The gesture is offered only while a dealt formation is waiting to be placed** — the arrange
   stage, with an admitted card selected. At every other moment the secondary button is pan-only,
   as before.
5. **The gesture and the rail walk one list.** Both read the turns that are *offered* — distinct
   under the formation's own symmetry, and placeable somewhere in this level's band. Clicking
   therefore can never reach a turn the player has no button for; a formation with one distinct
   turn holds still rather than flickering. The cycle wraps.
6. **The aimed square survives the turn.** Unlike the rail buttons, which clear the hover because
   the cursor has left the board, the gesture keeps the hovered anchor, so the preview spins in
   place on the square being aimed at. A turn that leaves that square illegal shows nothing until
   the player moves or turns back, rather than snapping the formation somewhere unasked.

Keyboard access is unchanged: the four rail buttons remain the accessible path to every turn, and
this decision adds a pointer shortcut to them rather than replacing them.

## Consequences

- Turning and aiming are one continuous motion at the cursor, and comparing a shape's turns is a
  matter of clicking rather than of memory.
- `ViewPane` gains a general non-destructive secondary-click seam. It is deliberately narrow —
  a click that never panned — and the prohibition in §3 is what keeps it from becoming a
  re-litigation of ADR-0128.
- The pan threshold is now a named, tested constant rather than an inline number, because it has
  become the boundary between two meanings instead of a private smoothing detail.
- A player who pans with short flicks will occasionally turn a formation instead. That is the
  intended cost: the turn is free, visible, and reversed by three more clicks.
