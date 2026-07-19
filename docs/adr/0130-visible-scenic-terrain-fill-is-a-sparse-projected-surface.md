---
status: "superseded by ADR-0131"
date: 2026-07-18
deciders: Nelson, Codex
superseded_by: "[ADR-0131](0131-sparse-scenic-terrain-separates-footprint-from-material.md)"
---

# ADR-0130: Visible scenic terrain fill is a sparse projected surface

## Context and Problem Statement

The Scenic terrain rectangle grows an axis-aligned range in board coordinates, which projects as
a diamond-shaped surface on screen. Increasing all four cardinal extents until that diamond covers
the current rectangular viewport authors large North, East, South, and West tips that are not
visible. The owner instead needs a viewport-aware authoring action that fills exactly the scenic
tile diamonds visible at the current pan and zoom without replacing the existing rectangle controls
or introducing a second terrain store.

## Decision Drivers

- The action must follow the live shared board viewport rather than a presumed screen size.
- A viewport fill must not author new offscreen diamond tips merely to complete a board-coordinate
  rectangle.
- Visibility must come from canonical board projection and camera geometry, not pixels, image
  recognition, or model judgment.
- The current Generation choice must determine material without inventing a new inference rule.
- Existing authored terrain must survive the operation, and one click must be one Undo step.
- Filling and undoing scenic terrain must not recenter or otherwise move the editor camera.
- Saved content must continue to have one decorative-terrain authority.

## Considered Options

- Increase all four Scenic terrain rectangle extents until their projected diamond covers the
  viewport.
- Add a separately persisted scenic mask for viewport-authored coordinates.
- Treat explicit decorative terrain coordinates as sparse additions to the existing rectangle and
  derive the visible additions from exact projection geometry.

## Decision Outcome

Chosen: **treat explicit decorative terrain coordinates as sparse additions to the existing
rectangle and fill them from exact viewport geometry**.

The active visual terrain surface is the union of:

- the existing optional Scenic terrain rectangle; and
- every valid, explicitly authored decorative terrain coordinate outside that rectangle.

The existing `decorativeCells` channel remains the sole persisted authority for explicit scenic
terrain. There is no separate footprint, mask, inferred fill record, or second material store.
Rendering, hit editing, Whole grid display, resolved-area selection, and terrain-area authoring use
the same union. The playable rectangle remains the sole gameplay projection.

The Scenic terrain controls retain the canonical North, East, South, and West extent actions and
their All directions action. They add a distinct owner-operated **Fill visible area** action. The
shared `ViewPane` reports its live content width and height from its existing `ResizeObserver`.
Together with current pan and zoom, the editor applies the canonical isometric projection and exact
tile-diamond/viewport intersection test. It considers only non-playable coordinates whose projected
terrain diamonds intersect the live viewport. It materializes those coordinates directly instead
of expanding the surrounding rectangle, so it creates no new offscreen diamond tips.

Fill visible area uses the current transient Generation mode:

- **Grass** writes the canonical base grass tile at every otherwise-unauthored visible scenic
  destination.
- **Match reference tile** clamps each destination to its exact corresponding playable-boundary
  coordinate under ADR-0126 and materializes that exact terrain tile. If the clamped coordinate is
  a void, the destination remains unpainted. The action does not search the authored scenic edge,
  scan a ray, choose a nearest tile, inspect pixels, or ask a model.

Existing explicitly authored terrain at any destination wins and remains unchanged. A successful
click commits all additions as one edit, so one Undo removes the complete fill. A request with
invalid viewport state or one that exceeds the supported authoring limit reports a no-op or limit
instead of partially filling the viewport.

The Level Editor anchors its board projection origin to playable cells. Sparse scenic additions,
rectangle growth, and their Undo operations therefore do not alter the camera's apparent position.
This stable origin is editor viewing state; it does not change canonical board projection or
gameplay coordinates.

### Consequences

- Good: the owner can fill the visible rectangular work area without paying for invisible
  diamond-tip terrain.
- Good: viewport fill is deterministic from board data and the shared camera transform.
- Good: existing levels and cardinal rectangle workflows keep their persisted representation and
  controls.
- Good: rendering and authoring share one explicit scenic coordinate authority without a mask that
  can drift from material data.
- Good: the operation is inspectable, repeatable, and reversible as one owner action.
- Cost: the visual terrain surface is no longer necessarily one board-coordinate rectangle, so
  every scenic renderer and terrain editor must use the canonical rectangle-plus-explicit union.
- Cost: Match reference deliberately preserves projected playable-boundary voids; filling those
  holes requires Grass or explicit tile painting.

## More Information

- [Board render contract](../board-render-contract.md#level-editor-scenic-terrain-apron)
- [Studio control architecture](../studio-control-architecture.md#terrain-area-authoring)
- [ADR-0126](0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md)
- [ADR-0129](0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md)
