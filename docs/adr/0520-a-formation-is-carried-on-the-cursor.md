---
status: accepted
date: 2026-08-08
deciders: Nelson, Claude
refines:
  - "[ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md)"
partially-supersedes:
  - "[ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)"
---

# ADR-0520: A formation is carried on the cursor

## Context and Problem Statement

Arranged Deployment ([ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md))
asks the player to place a whole formation at once. The first interaction built for it made the
player do the geometry:

- Every legal **anchor** was highlighted, where an anchor is the corner of the formation's
  bounding box. The player had to find one of those squares and click it.
- Turning lived on a rail of four buttons in the controls column, away from the board.

Both halves were backwards, and the same mistake caused both: the anchor is not a place the
player is thinking about.

**The anchor is frequently a square with no unit on it.** His Grace's formation is an L — three
units in a 2×2 box — so its bounding-box corner is the *missing* corner. Placing His Grace meant
pointing at the hole in his own formation and clicking there. Each quarter turn moved the hole to
a different corner, so the square to aim at jumped around as you turned. A player who aimed at the
unit they meant to place got the formation one square off.

**The highlights described the wrong thing.** Ten lit squares meant "ten places a corner could
go", not "ten places a unit could stand", so the lit region was neither where the formation would
end up nor where the player was looking.

**Turning was a round trip.** Aiming happens with the cursor on the battlefield; turning happened
with the cursor across the screen on a button. Trying a shape both ways meant leaving the square,
pressing a turn, and re-finding the square — and the preview blanked on the way out, so the
comparison was from memory rather than from the board.

## Decision Drivers

- The player is thinking about units and squares, not about bounding boxes.
- What is highlighted should be what will be occupied.
- Aiming and turning are one gesture and belong in one place: the cursor.
- Panning must survive: the deployment band is covered in hit targets
  ([ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md)).
- A gesture must not reach a state the visible controls cannot.

## Considered Options

- Keep anchor-hunting and merely re-label the highlights.
- Keep anchors but move the anchor to a unit seat rather than the box corner.
- Carry the formation on the cursor and resolve the seating from the pointed square.

## Decision Outcome

Chosen: **the formation is carried on the cursor. The player points at a square and the game finds
the seating; a secondary click turns what is being carried.**

1. **Every square on the battlefield takes the pointer**, not only the squares a corner could sit
   on. Sweeping the formation across the board is the gesture. A square outside the formation's
   reach carries a hit target *only* to locate the pointer — it is not an action, so it takes none
   of the shared board's square-local paint. Otherwise the generic hover ring rides the cursor
   across ground nothing can be placed on, lighting a tile on the far side of the board as though
   it were a target.
2. **The pointed square resolves to a whole seating that COVERS it.** Only seatings that cover the
   pointed square are candidates, so the formation is always under the hand and never slides off
   to somewhere else on the band. A square no seating can cover resolves to nothing rather than to
   a nearby guess.
3. **The formation hangs from a grip seat, never from the bounding box.** The grip is the seat
   nearest the shape's own centre of mass — a square a unit actually stands on. For His Grace's L
   that is the elbow. When the band cannot take the grip seating, the formation shifts to the
   legal candidate whose covering seat is nearest the grip, so the shift is the smallest one that
   works instead of a jump across the shape.
4. **The highlight is the footprint, over a band that never goes dark and never moves.** One paint
   at two strengths: quiet across the deployable band, full across the squares this seating fills,
   under the ghosts standing on them. The band is painted whenever a formation is in hand, so a
   moment with no seating resolved still shows where the player may deploy rather than bare
   ground.

   **The band is the level's, not the card's.** It is the authored deployment zone less the
   squares other formations have already taken — a question about the level and about what is
   seated, whose answer does not change when the player turns the piece. Painting the *reachable*
   set instead tied it to the current turn, and a formation turned in one corner put out a square
   at the far end of the band, six columns away: a tile reacting across the board to something
   with nothing to do with it. The reachable set is still computed per turn, but it drives the
   pointed square's marker, the tab order, and the cursor — never the band.
5. **The formation is the cursor.** While a seating is resolved the pointer is hidden beneath it.
   When nothing resolves the pointer returns, so the player is never left with neither a cursor
   nor a formation.
6. **A secondary press that releases without panning turns the formation.** The press that moves
   still pans: ADR-0128 gave the secondary button to the viewport because the board is wall-to-wall
   hit targets, and only the release of a press that carried no navigation is claimed here. Its
   refusal was about *erase*, and that stands unweakened — `ViewPane`'s `onSecondaryClick` seam is
   documented as non-destructive only, the threshold this introduces may never be put in front of
   a destructive action, and the Level Editor still has no secondary-button meaning at all.
7. **The turn spins the formation INSIDE the box it is standing in, and can never make it
   vanish.** The pointer says where the formation goes; a turn only says which way it faces once
   it is there. So a turn holds the box and the shape turns within it — His Grace's L cycles which
   corner it leaves empty, and the box does not move. Re-seating from the pointed square instead
   kept a unit under the cursor but walked the box a square every quarter turn, so a formation
   that only ever covers two squares by two swept three by three across the band.

   A consequence, and the intended one: the pointed square may become the corner the formation
   leaves empty. The cursor stays inside the box either way, and clicking commits the box on
   screen rather than re-resolving from the square under it.

   **Moving the pointer releases the box**, and the seating resolves from the new square. The band
   still has the final say: where it cannot take the formation in the held box, the box is given
   up and the seating re-resolves from the pointed square, so a turn never leaves the player
   holding nothing. Turns with no seating either way are not offered at all — walking the
   band-wide list instead stepped onto them and the formation disappeared. That list is computed
   independently of the current turn, so pointing at a narrow gap and turning finds the way the
   formation fits, and a position that takes only one turn holds still rather than blanking.
8. **The rail stays band-wide.** Its four buttons offer the turns that are distinct under the
   formation's own symmetry and placeable somewhere in this level's band, and they do not change
   as the cursor moves. The square's list is always a subset, so a turn arrived at by clicking is
   always one the player could have pressed. Off the board there is no square to preserve and the
   rail's list applies. Both cycles wrap.
9. **Q and E turn it too, in opposite directions.** The pointer gesture turns one way only, and a
   quarter turn is easy to overshoot — undoing one press by making three more is not a control. E
   is clockwise and Q counter-clockwise, matching the pair every other game binds to this job.
   They walk the same square's list the click does, on the same terms the rail's buttons are
   offered, so no gesture can turn the formation out of sight and none can reach a turn the
   others cannot. They match the character the key produces rather than its physical position, so
   the keys that turn are the ones printed Q and E on the player's own keyboard, which is what the
   on-screen hint names. Auto-repeat is refused: one press is one quarter turn. A field or an open
   dialog owns a bare letter first.
9. **A formation already on the board is taken back by clicking it.** Its squares are a real
   action, so they carry the pointer, the target ring, and a grip cursor, and say so. Clicking one
   selects that card again rather than reading as an attempt to drop the held formation on top of
   it — repositioning otherwise meant finding the card in the hand and removing it first.
10. **The hand shows one card at a time, and every control wears its key.** A formation card is
   read by its SHAPE, so laying the whole hand out at once squeezed away the only information on
   it. The card takes the panel's whole width and its steppers sit UNDER it rather than either
   side, which is what buys that width. Turning is **two buttons, not four absolute angles**: the
   formation on the board already shows which way it faces, so the control is the verb, and it is
   the same verb the keys and the secondary click run. Each of the four — Back, Next, Left,
   Right — carries the key that does the same thing (**W/S** and **Q/E**) in the shared shortcut
   cap the in-match grid already uses, so the keyboard is discovered from the control rather than
   from a hint. Stepping wraps over the admitted cards only; a reserve cannot be placed this
   Battle, so it is not stepped onto.
11. **The whole dealt hand is read in the Chartulary**, reserves included. Opened while arranging
   it comes up already narrowed to this Battle's dealt cards — the setting exists either way, and
   still widens to the full Chartulary — so the register answers what the one-card hand cannot
   show at once.
12. **The Controls scroll on the house rail** (`KitScroll`, ADR-0030), never the browser's own
   bar. The panel itself does not scroll; Abandon Run stays outside the rail, pinned, rather than
   scrolling out of reach.
13. **Placing hands the next formation to the cursor.** Seating a formation finishes with it, so
   the hand advances to the next admitted card still to be placed, resuming after the one just
   seated and wrapping — placing out of order walks the rest of the hand rather than jumping back
   to the front. The pointed square is deliberately kept, so the next formation appears under the
   cursor ready to place and a whole hand is seated without the mouse leaving the battlefield.
   When nothing is left to place the just-placed card stays selected, so it can still be moved or
   removed.

Keyboard access is unchanged. The four turn buttons remain, and the pointable squares remain the
tab-reachable placement actions — squares the formation cannot cover are taken out of the tab
order rather than presented as dead buttons.

## Consequences

- Placing a formation is aiming at a unit, and the lit squares are the squares that will be
  filled. The L no longer asks to be placed by its hole.
- Aiming and turning are one continuous motion at the cursor; comparing a shape's turns is
  clicking rather than remembering.
- More squares are pointable than were previously highlighted — the union of every seating's
  footprint rather than the set of legal corners — so the affordance is wider as well as truer.
- `ViewPane` gains a general non-destructive secondary-click seam. It is deliberately narrow, and
  the prohibition in §6 is what keeps it from becoming a re-litigation of ADR-0128.
- The pan threshold is now a named, tested constant, because it has become the boundary between
  two meanings instead of a private smoothing detail.
- A player who pans with short flicks will occasionally turn a formation instead. That is the
  intended cost: the turn is free, visible, and reversed by three more clicks.
