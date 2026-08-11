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

# ADR-0573: The camera obeys coverage and usefulness as two limits

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

**A camera obeys two limits, and the zoom floor is whichever binds.**

- **Coverage (safety)** — `coverageTier`: the furthest-out rung at which the visible rectangle is
  still entirely inside the level's camera boundary. Rounds UP, because the chosen rung must land
  on the safe side of the constraint and one rung of slack outside the boundary is exposed black.
- **Usefulness** — `zoomTierRange().outer`, unchanged: the first rung at which the whole level box
  fits inside the viewport, so zooming out ends with the level visible and never further.

Neither subsumes the other. Coverage alone cannot stop a camera retreating forever on a level whose
backdrop is locked to the viewport; usefulness alone cannot keep a camera out of unpainted world.

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
