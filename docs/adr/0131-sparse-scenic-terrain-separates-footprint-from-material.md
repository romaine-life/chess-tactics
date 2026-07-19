---
status: accepted
date: 2026-07-18
deciders: Nelson, Codex
supersedes: ADR-0130
---

# ADR-0131: Sparse scenic terrain separates footprint from material

## Context and Problem Statement

ADR-0130 made every explicitly authored `decorativeCells` coordinate outside the Scenic terrain
rectangle active. That conflates saved material with active surface membership. The rectangle's
existing shrink behavior deliberately retains authored material outside its reduced bounds so a
later re-expansion can restore it; activating every retained key would make the minus controls
unable to hide that terrain.

Viewport-aware fill still needs a sparse surface that avoids offscreen diamond tips. Its active
coordinates must therefore persist independently from retained decorative material without
creating a second material store.

## Decision Drivers

- Shrinking the Scenic terrain rectangle must continue to hide, not destroy or reactivate, retained
  material outside its new bounds.
- Sparse viewport fill must survive save/reopen and remain independent from rectangle extents.
- Material identifiers must continue to have one persisted authority.
- Rendering, grid, editing, and selection must agree about which sparse coordinates are active.
- Viewport membership must come from exact projection geometry, never pixel or model inference.
- One viewport-fill click must remain one fail-atomic, undoable owner action.
- Scenic edits must not recenter the board or move the editor camera.

## Considered Options

- Continue inferring active sparse membership from every stored `decorativeCells` key.
- Delete decorative material whenever rectangle shrink makes it inactive.
- Persist a compact coordinate footprint separately from the existing material map.

## Decision Outcome

Chosen: **persist sparse activity in a compact `decorativeFootprint` coordinate set while retaining
`decorativeCells` as the only material store**.

The active visual terrain surface is the union of:

- the existing optional Scenic terrain rectangle; and
- every valid non-playable coordinate in `decorativeFootprint`.

`decorativeFootprint` records membership only. It contains no tile identifier, material, generated
value, or gameplay meaning. `decorativeCells` remains the sole persisted authority for explicit
scenic material. A retained decorative material key outside both the current rectangle and the
footprint stays hidden; it does not activate itself. Rectangle shrink and later re-expansion can
therefore hide and restore authored material exactly as before.

Rendering, hit editing, Whole grid display, resolved-area selection, and terrain-area authoring all
use the rectangle-plus-footprint union. Erasing an active sparse coordinate removes its footprint
membership, deactivating it when it is outside the rectangle. Retained material continues to follow
the rectangle shrink/re-expand policy rather than implicitly defining activity. The playable
rectangle remains the sole gameplay projection.

The Scenic terrain controls retain their canonical North, East, South, West, and All directions
rectangle actions and add a distinct owner-operated **Fill visible area** action. The shared
`ViewPane` reports its live content dimensions from its existing `ResizeObserver`. Using those
dimensions with current pan and zoom, the editor applies the canonical isometric projection and
exact tile-diamond/viewport intersection test. It considers only non-playable coordinates whose
projected terrain diamonds intersect the live viewport and adds those coordinates to
`decorativeFootprint`; it does not grow an enclosing rectangle or author its offscreen diamond
tips.

Fill visible area uses the current transient Generation mode and preserves existing explicit
material:

- **Grass** writes the canonical base grass tile to every otherwise-unauthored destination and adds
  its footprint membership.
- **Match reference tile** adds footprint membership, clamps each otherwise-unauthored destination
  to its exact corresponding playable-boundary coordinate under ADR-0126, and materializes that
  exact tile only when the boundary coordinate owns terrain. A projected void receives no material.
  The action does not search the authored scenic edge, scan a ray, choose a nearest tile, inspect
  pixels, or ask a model.

A successful click commits all footprint and material changes as one edit, so one Undo restores
the complete prior state. A request with invalid viewport state or one that exceeds the supported
authoring limit reports a no-op or limit instead of partially changing either authority.

The Level Editor anchors its board projection origin to playable cells. Sparse membership,
rectangle growth or shrink, and their Undo operations therefore do not alter the camera's apparent
position. This stable origin is editor viewing state; it does not change canonical board projection
or gameplay coordinates.

### Consequences

- Good: viewport fill covers the visible rectangular work area without authoring invisible
  diamond-tip terrain.
- Good: rectangle shrink and re-expansion keep their established non-destructive material behavior.
- Good: sparse activity and scenic material each have one explicit, inspectable persisted
  authority.
- Good: viewport fill remains deterministic, reversible, and independent of pixel or model
  judgment.
- Cost: scenic persistence now includes a compact footprint set in addition to the material map.
- Cost: all scenic renderers and authoring tools must use the canonical rectangle-plus-footprint
  union rather than treating stored material keys as active coordinates.
- Cost: Match reference preserves projected playable-boundary voids; Grass or explicit painting is
  required to give those active coordinates terrain material.

## More Information

- [Board render contract](../board-render-contract.md#level-editor-scenic-terrain-apron)
- [Studio control architecture](../studio-control-architecture.md#terrain-area-authoring)
- [ADR-0126](0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md)
- [ADR-0129](0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md)
- [ADR-0130](0130-visible-scenic-terrain-fill-is-a-sparse-projected-surface.md)
