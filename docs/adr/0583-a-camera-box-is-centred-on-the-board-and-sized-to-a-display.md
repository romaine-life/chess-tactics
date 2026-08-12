---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)"
  - "[ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)"
  - "[ADR-0491](0491-camera-boundary-can-adopt-the-current-editor-view.md)"
---

# ADR-0583: A camera box is centred on the board and sized to a display

## Context

Every existing way to write the camera boundary decides its POSITION and its SIZE together. Snap
derives both from the board, Fit to artwork derives both from the painting, Set from view derives
both from the canvas, and dragging changes whichever the grabbed handle touches. There was no way
to keep one and restate the other.

Both halves are things an author needs on their own.

The slack between the playable grid and the box is the distance a player can scroll in that
direction. A box that is off-centre hands one side more of that room than the other, and nothing on
the Camera page said so — Origin and Size are the box's own coordinates, and reading four scroll
distances off them is arithmetic an author should not be doing. The size is the part that gets
composed against the artwork by eye, so the fix cannot be "snap it back", which throws that away.

Size has its own question. World pixels are screen pixels at zoom 1, so a box the same size as a
display is the box that display sees fully zoomed out with the art drawn one-to-one — no scaling,
no resampling of a pixel-art plate. That relationship existed and was unreachable: stating it meant
dragging a handle until Size read 1920 × 1080.

## Decision

The Camera page gains two independent actions, each of which changes exactly one of the two.

**Centre on grid** moves the box until the playable grid sits in its middle, keeping its width and
height. The page states the four scroll distances (`Room left / right`, `Room above / below`) and
whether the box is already centred; when it is, the action is disabled, because it is a statement
about the box as much as a button. The mandatory opening frame shares the playable grid's centre,
so a box centred here survives `normalizeBoardCameraBounds` still centred — an undersized box grows
symmetrically rather than being shoved back off the centre it was just given.

**Snap to resolution** picks a display resolution and resizes the box to exactly that many world
pixels about the centre it already has. The presets are real display sizes grouped by aspect
family; the reported size is the resolution unless the required opening frame forced it larger, and
that case says so rather than reporting a resolution the box does not have.

The two compose in either order and neither one silently does the other's job: centring never
resizes, and snapping never recentres. Both go through the same normalization, undo, autosave and
persistence path as every other camera write, and both leave a writing session in Edit mode so the
outline and handles stay adjustable.

## Consequences

- Scrolling room is a stated quantity on the Camera page instead of something read off two
  coordinate pairs.
- A composed box can be recentred without losing the size it was composed at, and a centred box can
  be resized to a display without losing its centre.
- Naming a resolution is how an author says "this level is pixel-exact on that display", which
  previously had no expression.
- The preset list is a judgement about which displays matter and will need revisiting; it is
  authored data in `boardCameraBounds.ts`, not derived from anything.

## More Information

- [ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)
- [ADR-0303](0303-camera-page-preserves-explicit-view-and-edit-modes.md)
- [Board render contract](../board-render-contract.md)
