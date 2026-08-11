---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
supersedes:
  - "The single contain-only zoom floor introduced with the zoom ladder (#865)"
refines:
  - "[ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)"
  - "[ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)"
---

# ADR-0574: One box per level is the furthest a player may see

## Context

ADR-0301 gave every Level a camera coverage boundary and made it a hard limit: every possible
player viewport stays completely inside it, so no player view can reach world the level never
promised to paint.

The zoom ladder (#865) replaced the per-window float that limit produced with a rung on a global
ladder. That was right, and is kept. But it also replaced the QUESTION. The floor became the first
rung at which the boundary FITS INSIDE the viewport, rather than the furthest-out rung at which the
viewport still fits inside the boundary. Those are opposites: a boundary that fits inside the
viewport is by definition surrounded by whatever lies beyond it, so the widest view was guaranteed
to show the boundary plus a margin of unpainted world.

Two further gaps compounded it:

- **The camera was measured on the wrong rectangle.** The Play board is deliberately full-bleed: it
  paints past its 4:3 stage and is cut only at the screen edge, so it floats behind the title bar
  and HUD instead of being sliced under them. The floor and the pan clamp were both derived from
  the stage, leaving that bleed answerable to no boundary at all. On a 2400x1100 window the stage
  was 1349px wide and the art painted across 2028px.
- **The runtime boundary defaulted to the snap preset.** `defaultBoardCameraBounds` is an authoring
  convenience sized tightly around the playable surface, and it is normally far SMALLER than what a
  level already paints. Intersecting accepted pre-drawn pixels with it threw away real coverage on
  every level whose author never opened the Camera page.

Measured on Hold the Bridge at 2400x1100: 8.66% of the board region was unpainted stage, in
full-width bands at the left, right and bottom — at the OPENING view, without touching the wheel.

## Decision

**A stated camera boundary governs the zoom floor alone.**

- **Coverage (safety)** — `coverageTier`: the furthest-out rung at which the visible rectangle is
  still entirely inside the level's camera boundary. Rounds UP, because the chosen rung must land
  on the safe side of the constraint and one rung of slack outside the boundary is exposed black.
  A level that states a boundary is answered by this and nothing else: filling the boundary and
  stopping is the whole point of stating one.
- **Usefulness** — `zoomTierRange().outer`, unchanged: the first rung at which the whole level box
  fits inside the viewport. This answers only the case where there is NO boundary, because a
  viewport-locked backdrop paints wherever the camera goes and a camera that can retreat forever
  is useless. Coverage alone cannot stop that retreat, which is why the limit still exists.

The two are **not** combined into "whichever binds". They are measured against different boxes —
the boundary is what a level paints, the level box is the snap default sized around the playable
surface — so consulting both holds a boundary-governed camera short of its own boundary. Measured
on Hold the Bridge at 2000x1214: the boundary permits 1.5513 and reaches 89% of its own width,
while the level box permitted only 1.7103 and reached 81%. The Level Editor draws that boundary,
so stopping short of it is the editor and the game disagreeing again — the defect this ADR exists
to end, reintroduced from the other side.

A viewport can only touch a boundary of a different aspect on one axis; the other axis
necessarily shows less. That is the geometry of "the viewport stays inside the boundary", not a
shortfall to be corrected.

**Coverage is enforced on the rectangle art is VISIBLE in, not on the measured stage.** ViewPane
resolves it from the nearest clipping ancestor in the live DOM, so a change to where the board is
cut moves the coverage rectangle with it rather than silently desynchronising the two. A wider
window therefore costs zoom range instead of showing black.

**The runtime boundary is what the level actually paints, until an author states otherwise.**

| Level state | Boundary |
| --- | --- |
| Authored box, no accepted art | The box |
| Authored box + accepted art | Box intersected with the art |
| No authored box, accepted art | The art |
| No authored box, no accepted art | **None** — coverage is unconditional |

The last row is the case a viewport-locked backdrop creates: it paints wherever the camera goes, so
there is no unpainted world to keep a player out of, and usefulness alone limits it.

**The Camera page draws the boundary a player actually gets.** An unauthored pre-drawn level shows
its accepted pixels rather than the snap default, and the page re-frames when the boundary
resolves — landing on it by URL frames it seconds before the artwork arrives.

## Consequences

- No reachable view exposes unpainted world. Verified on the live route: 213,672 unpainted board-
  region pixels before, 8 after (dark art, not stage), across 1280x800 / 2400x1100 / 3440x1440, and
  unchanged by real drags to every extreme and the corner.
- A wider window shows the same world at a larger scale rather than more world. The camera stops
  where the level's promise stops, which is what an authored boundary means.
- Levels whose art falls short of their authored box are now zoomed IN slightly instead of showing
  black at the edge. That is the correct trade and it makes short art visible as a framing cost.
- The pre-drawn inspectors (`PredrawnMoveHighlightEditor`, `PredrawnWarpInspector`) pass a boundary
  and no level box, so they return to the coverage-only floor they had before #865.
- The Level Editor canvas remains unclamped (ADR-0301): it states neither limit.

## More Information

- [ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md) — the boundary this restores
- [ADR-0491](0491-camera-boundary-can-adopt-the-current-editor-view.md) — authoring the boundary
- `frontend/src/game/zoomTiers.ts`, `frontend/src/ui/shared/ViewPane.tsx`

## Addendum — the camera must not buy coverage for pixels nobody sees

Two further defects surfaced when the owner could still neither zoom out nor see the whole
board, and both came from this ADR's own first implementation.

**The visible region was the WINDOW.** `coverageViewportForStage` walked to the nearest
clipping ancestor and landed on `.skirmish-screen`, which includes the strips under the opaque
title bar and the Controls rail. The camera was therefore zooming in to keep art under chrome
nobody can see through, and paying for it out of the pixels a player can see — the rail is on
the right, which is exactly where the board was being cut. The region is now the board's own
allocation, `[data-shell-viewport-primary]`, which the shell already marks. At 2560x900 that
alone moves the floor from 1.80 to 1.55 and the board fits again.

**And a pre-drawn plate does not own every environment pixel.** `.skirmish-screen.is-predrawn-board::before { content: none }` and `shouldLoadSkirmishWorldBackground` both deleted the
battlefield backdrop on that premise. Hold the Bridge's raster is 1450x816 world px; the scene
layer paints nothing beyond it (read from canvas alpha). With no backdrop, anything outside the
raster was bare stage, so the camera had to be held inside it — and the raster clears the
opening composition by about 3% vertically, less than one 5% ladder rung, so there was no zoom
rung to take. Zero zoom-out range at almost every window size, measured on both pre-drawn
levels. Restoring the backdrop makes the region beyond the painting the game's own world layer,
and the floor becomes what it always should have been: **zooming out ends with the whole
painting visible**. At 1920x1080 that is four rungs of range where there were none.

Coverage still governs PAN: the viewport is held inside the boundary wherever that is feasible,
so a player cannot drag the board off the side of the screen.

## Final form — one box, one rule

Everything above records a camera whose limit depended on which case a level fell into: a
stored box, a stored box intersected with artwork, the artwork alone, or no boundary and a
usefulness limit instead. Four behaviours, indistinguishable on screen. The owner spent a full
session unable to answer "why can't I zoom out", because answering it required reconstructing
which branch his level took — and the rectangle the Level Editor drew was, on every level he
actually plays, a number recomputed each load rather than a value anyone had set.

**Every level stores one camera box. The view stops at it. That is the whole rule.**

- `effectiveBoardCameraCoverPolygon(board)` returns the level's box and consults nothing else —
  no artwork intersection, no artwork substitute, no dependence on whether an author has
  touched it.
- `boardZoomFloor` has one branch: the furthest-out rung at which the view is still inside the
  box. The usefulness limit and its `containBox` input are gone.
- The box is measured against the board's own allocation, `[data-shell-viewport-primary]`, so
  the camera never buys coverage for the strips under the opaque title bar and Controls rail.

Keeping a box inside its artwork is worth doing and belongs to authoring — an action that moves
the box, which the owner can press — not a runtime check that silently overrides it. A drawn
rectangle that does not mean what it says is the defect this ADR exists to end.

**Backfill.** 33 official levels had no stored box; they now carry
`defaultBoardCameraBounds(cols, rows)`, the same rectangle the editor was already drawing, so
nothing moved on screen. Four already had one and were left alone. Three carry no board code at
all and so have nothing to attach a box to: `off-l-pinned`, `off-l-high-ground`,
`off-l-ten-battle-run-test-battle-i`. Verified after the write: 40 levels before and after,
none lost or gained, both campaigns intact, and each level's measured zoom floor equals the
cover tier of its own stored box.

The default box is about ten percent larger than the opening composition while one ladder rung
is five percent, so most levels open with no zoom-out range. That is now a property of the
stored value rather than of the code, which is the point: it is a rectangle an author drags.

## Fitting the box to the artwork

A box that must be dragged by hand to every artwork edge is a chore, and a box assigned
artwork and then left bounding the previous one is the drawn-box-means-nothing problem again.
So the fit is an ACTION, in three places, all answering with the same function:

- **Camera page → Fit to artwork.** Shown only where there is artwork; a tiled level's backdrop
  follows the camera and has no edge to fit to. Commits through the ordinary boundary path, so
  it is an edit like any drag.
- **On assignment.** Setting a level's AI artwork refits the box to it, overwriting whatever was
  there. The artwork's edge moved, so the limit moves with it.
- **Backfilled** onto the nine existing AI-artwork levels, each of which now carries a box equal
  to its own painting: hold-bridge 1450x816, fortress-gate 1360x765, and seven test battles.

`largestBoxInsideBoardCameraPolygon` returns a rectangular accepted region unchanged, and fits
the largest axis-aligned rectangle inside a legacy warped quad by scanning pairs of horizontal
cuts. Its result still passes through `normalizeBoardCameraBounds`, so a level whose artwork is
smaller than its own opening frame keeps a box that shows the board — reachable only by
resizing a board after its artwork was made, or by masking the accepted region down.

Note for anyone writing a similar tool: the plate's stored `worldBounds` are relative to the
board origin, which is `boardLabMetrics`. A hand-rolled origin put every plate hundreds of
world pixels off and reported six of nine levels as needing to grow past their own art; the
package's own function is the only correct source.
