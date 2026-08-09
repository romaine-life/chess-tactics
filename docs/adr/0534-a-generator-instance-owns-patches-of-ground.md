---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
---

# ADR-0534: A generator instance owns patches of ground, not a rectangle

## Context and Problem Statement

A Town and a Forest were each placed by dragging exactly one rectangle. That rectangle was the
instance's whole ground: `bounds` on the saved document, the outline drawn on the board, the
territory the plan was fitted to, and the boundary a building or a tree had to stay inside.

One rectangle is the wrong unit for both of the things authors actually build with these tools.

A settlement is rarely a rectangle. It bends around a corner, follows a road, wraps a lake, or
thickens at one end. Dragging the rectangle that CONTAINS such a town hands the generator ground
the town does not want, and the only alternative was to place two towns and hope they read as one —
two recipes, two seeds, two entries in the dropdown, and a hard join down the middle where each
one's edge falloff fades it out.

A town can also be longer than the screen. The drag is a pointer gesture on a viewport, so the
ground an author can select in one go is bounded by what is on screen at that zoom. Wanting a
village that runs the length of a large board meant zooming out until the tiles were too small to
place anything against, or accepting that the town stops where the pane did.

## Decision Drivers

* The author already thinks in dragged rectangles; the gesture is right, there is just one of it.
* Shift-extends-the-selection is the convention already in the editor — the Scene Art marquee
  extends its selection on a shift-drag.
* A saved instance is a rerunnable unit: its ground has to persist, and every document written
  before this change has to keep opening and generating identically.
* The plans are shape TEMPLATES — a street through the middle, a ring around a green, lanes off a
  centre. A template has to be fitted to a rectangle; it has no meaning against an arbitrary blob.

## Decision Outcome

**A saved Town or Forest owns a LIST of rectangles, and its ground is their union.**

Shift-drag on the board adds another patch to the selected instance instead of starting a new one.
A plain drag still starts a new instance, so the gesture that existed is unchanged. A single
shift-CLICK adds its one cell, because extending is a correction as often as an extension.

`areas` carries the list on `BoardTown` and `BoardForest`. Three rules keep it honest:

* **`bounds` is derived, never authored.** It is the union's bounding box, recomputed by the
  sanitizer, so it can never disagree with the patches.
* **One patch is not written out.** An instance holding a single rectangle encodes exactly as it
  did before `areas` existed, so board codes and documents that never used shift-drag are
  untouched, and an old document needs no migration: the absent list means `[bounds]`, which IS
  the old meaning.
* **A patch another patch already covers is dropped**, so shift-dragging over ground the instance
  already holds is a no-op rather than an unbounded list.

**Membership consults the union; layout is still fitted to rectangles.** Which plots exist, which
cells are scattered into, and where the ground's edge is for the falloff all read the union. The
street skeleton is fitted to `mergeGeneratorAreas` — the fewest rectangles that still describe the
union exactly. That merge is the whole of what makes both shapes work:

* Two patches laid end to end, the LENGTH case, merge back into the one long rectangle they
  visually are, and get ONE street running the whole way rather than two halves meeting at a join.
* An L keeps its two arms, and each arm is given a street of its own — fitting a single skeleton to
  the box around an L runs its frontage through the missing corner and fronts buildings onto ground
  the town does not own.

**The seam is not an edge.** Two patches that meet are one continuous piece of ground, and every
boundary test had to be restated to say so, because the natural implementations all get this wrong
and each one leaves a visible bare stripe along the join:

* A footprint is tested against the union's COVERAGE (`projectedGroundFootprintWithinGridRects`),
  not against each rectangle in turn. An object straddling a join is inside neither patch alone.
* The town's half-cell inset is applied by growing the footprint and restating the patches in cell
  EDGES, so the inset lands on the town's outer boundary and not on an internal join.
* The Forest's edge falloff measures out along the four grid axes through whatever ground is there,
  rather than to the nearest rectangle's own sides.
* The town's coarse plot pre-filter stays on the territory's bounding box. It is a cheap test on a
  bare point, and a point test would fall through the half-cell gap where two patches meet.

The invariant this buys, and the one the tests pin: **two patches that tile a rectangle produce
exactly the town, and exactly the trees, that the single rectangle produces.**

### Consequences

* An instance's ground reads as `N areas · M tiles` wherever a size was quoted — the dropdown, the
  panel, the on-board label. The bounding box's sides are not quoted for a union, because they name
  ground the instance does not own.
* **Undo last area** takes the most recent patch back off the selected instance. Generated art is
  left standing until Generate is pressed again, like every other generator setting.
* Erase hit-tests every patch, so dragging the erase tool over any arm removes the instance.
* A town whose plan cannot use the shape it was given still says so in its own words — *"Placed 7
  of 26. 7 buildings would have overhung the area"* — which is the existing report, now telling the
  truth about a non-rectangular area.
* No RunSaveVersion is involved: this is editor-authored board content, not a Run document.

## More Information

* `packages/board-render/src/core/generatorAreas.ts` — the union model and `mergeGeneratorAreas`.
* `packages/board-render/src/core/projectedGroundFootprint.ts` — union coverage for a footprint.
* The generator panels' recipe, seed and Reset contracts
  ([ADR-0057](0057-studio-tuning-surfaces-reset-to-authoritative-baseline.md)) are untouched: only
  the ground moved.
