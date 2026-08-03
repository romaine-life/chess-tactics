---
status: accepted
date: 2026-08-02
deciders: Nelson, Claude
partially_supersedes:
  - "[ADR-0176](0176-placed-art-and-level-artwork-are-separate-editor-destinations.md)'s Props placement boundary"
partially_restores:
  - "[ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)'s off-board prop authoring permission"
refines:
  - "[ADR-0096](0096-level-editor-scenic-terrain-apron-is-decoration-only.md)"
---

# ADR-0365: Props stand on the authored surface, not the playable grid

## Context and Problem Statement

[ADR-0098](0098-authored-board-extends-beyond-playable-grid.md) established one authored visual
board whose inner playable rectangle is a gameplay projection rather than an authoring boundary.
[ADR-0176](0176-placed-art-and-level-artwork-are-separate-editor-destinations.md) later pulled
Props and Doodads back inside that rectangle so the three Placed Art subtypes would read as
visual-only / nonblocking / blocking, with the playable boundary visible in the object semantics.

That made the boundary legible at the cost of the thing props are for. A prop is a tree, a cottage,
a rock — scenery that composes the scene. The scenic apron exists precisely so the authored terrain
does not stop at the tactical edge, and every other terrain-seated tool already works out there:
tiles, ground cover, roads, rivers, fences, wall faces, subterrain. Props were the only ones that
stopped at the grid, so a board could have terrain running sixteen cells past the playable edge with
nothing standing on it. Composing the outer scene meant reaching for Scene Art, which is free pixel
placement with no tile seating, no terrain gate, no footprint, and no occupancy — the wrong
instrument for an object that should sit on ground.

The legibility ADR-0176 wanted does not actually require a placement boundary. It requires that an
off-board prop have no gameplay authority, which ADR-0098 already achieves through the export
projection.

## Decision Outcome

**A prop may be placed, moved, and erased anywhere on the authored surface — the playable board
plus the scenic apron — exactly as it is on the playable board.**

The bound is authored ground, not the playable rectangle. A prop's complete footprint must land on
cells that have a resolved terrain top whose family accepts that prop. Past the scenic rectangle
there is no tile, so there is nothing to stand on and placement is refused; a void boundary cell
stays a void and refuses too. The terrain-family gate, the footprint occupancy rule (no overlapping
another prop or a placed unit), the hover footprint ghost, the Move tool, and erase all behave
identically inside and outside the playable rectangle.

A footprint must be **wholly playable or wholly scenic**. Props project into `layers.props` by
anchor, so a straddling prop would draw over playable cells the gameplay projection cannot give a
collider: the editor would refuse a unit there while the game walked straight through the tree.
All-in-or-all-out keeps editor and in-game collision identical and leaves the containment rule for
a board-anchored prop exactly as ADR-0176 had it.

Doodads are unchanged: they remain playable-only per ADR-0176. Scene Art is unchanged: it remains
the free-pixel, gameplay-inert channel and is still the only Placed Art type that leaves the
terrain entirely. Units and gameplay zones remain playable-only per ADR-0098.

### Gameplay isolation is the projection, not the brush

An off-board prop persists losslessly in `boardCode`'s `p` map and renders through the ordinary
shared prop path. It does **not** enter `layers.props`: `editorBoardToLevel` continues to project
only playable-anchored props, so an off-board prop stamps no collider and cannot affect movement,
collision, deployment, objectives, or solver state. `validateLevel` and the backend's playable-bounds
rejection for `layers.props` therefore stay exactly as they are — no loosened validation, no
document-format change, no migration.

### Resize

Resize applies the same rule to what it keeps: a prop survives when every footprint cell still has
authored ground under the new dimensions and the footprint is still wholly on one side of the
playable edge. A prop is dropped only when a shrink pulls the ground out from under it or a grow
would straddle it across the new edge, which matches how the scenic channel already survives resize.

## Consequences

- The outer scene can be composed with the instrument built for it: terrain-seated, footprinted,
  occupancy-checked props, instead of free-floating Scene Art pixels.
- The playable boundary stops being an authoring wall and goes back to being what ADR-0098 says it
  is: an export projection.
- Placed Art's three subtypes still read as one deliberate choice — Scene Art is visual-only and
  free, Doodads are nonblocking and playable, Props are blocking **where the board is playable** and
  scenery where it is not.
- No content migration: every existing prop keeps its position and its meaning, and ADR-0176's
  retained off-board objects become ordinary authored content again rather than compatibility debt.

## Verification

- A prop places, moves, and erases on a scenic apron cell whose terrain family accepts it.
- A prop is refused past the scenic rectangle, on a void boundary cell, and when its footprint
  would straddle the playable edge.
- The hover ghost outlines footprint cells on the apron and reports placeable/blocked out there.
- `editorBoardToLevel` emits only playable-anchored props into `layers.props` while `boardCode`
  round-trips the off-board ones, and the resulting Level still passes `validateLevel`.
- Resize keeps an apron-standing prop and drops one whose ground is gone.
