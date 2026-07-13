---
status: "superseded by ADR-0081"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0080: Wall mirrors reflect along the board-grid wall normal

> **Superseded by [ADR-0081](0081-wall-mirrors-reflect-piece-facing-in-board-grid-space.md)
> (2026-07-11).** Grid-axis corridor, placement, FOV, projection, aperture, and
> composition rules remain. ADR-0081 replaces only the source-facing-plus-`flipX`
> orientation rule with wall-specific board-grid facing reflection and directional
> sprite selection.

## Context and Problem Statement

ADR-0079 correctly made mirror eligibility a wall-local board-grid corridor, but it
carried forward ADR-0078's placement rule for admitted pieces: project the physical
piece first, then reflect its anchor horizontally about the mirror aperture's screen-X
centerline. That mixes two coordinate systems. A west-wall mirror admits along the
game-grid X axis, yet the admitted image then moves along screen X instead of following
the projected game-grid X axis. The same mismatch applies to a north-wall mirror and
the game-grid Y axis.

The owner clarified that “X axis” and “Y axis” mean the board's in-game grid axes, not
the cardinal axes of the final 2D screen. Those grid axes appear diagonal after the
canonical isometric projection. Placement must therefore stay in continuous board-grid
coordinates through the reflection step and project only afterward.

## Decision Drivers

- A west-wall reflection must vary board-grid X while holding board-grid Y fixed.
- A north-wall reflection must vary board-grid Y while holding board-grid X fixed.
- The reflected anchor must use the same exact continuous coordinate as live movement.
- The canonical orthographic-isometric projection must remain the only board-to-screen
  mapping.
- ADR-0079's corridor intervals, boundary ownership, multi-span union, and admission
  order must remain unchanged.
- Field of view must preserve the grid-axis ray by compressing wall-normal depth about
  the wall plane before projection, not about a screen-space focal point afterward.
- Uniform subject scale, source sprite plus `flipX`, clipping, live-only semantics,
  physical-piece scope, shared planner, and Studio instrument must remain intact.
- The correction must not introduce a perspective mirror camera, face-specific
  directional sprite remapping, shear, nonuniform foreshortening, or a second projection
  path.

## Considered Options

- Keep reflecting an already-projected anchor about the aperture's vertical screen-X
  centerline (ADR-0078 and ADR-0079's placement rule).
- Reflect the continuous board-grid coordinate across the wall plane with field of view
  applied to its wall-normal depth, then use the canonical isometric projection (chosen).
- Reflect in board-grid space, project, and then compress the projected anchor about a
  shared lower-aperture focal point.
- Preserve screen-horizontal placement and visually force it onto a grid axis with a
  face-specific shear or sprite remap.
- Render a perspective or second-camera mirror scene.

## Decision Outcome

Chosen: **after corridor admission, reflect the physical piece's continuous board-grid
coordinate across the supporting perimeter wall, holding the wall-tangent grid
coordinate fixed and applying field of view only to wall-normal grid depth, and then
pass that reflected coordinate through the canonical orthographic-isometric
projection.** The physical piece, its wall-plane intersection, and its reflected anchor
remain collinear along the relevant in-game grid axis at every field-of-view value. That
grid axis is expected to appear diagonal on screen.

The implementation follows these rules:

1. **ADR-0079 corridor admission remains the gate.** For a physical piece at continuous
   board coordinate `p = (px, py)`, a west-wall mirror casts from `x = -0.5` along board
   `+X` and tests `py` against the authored wall-row interval. A north-wall mirror casts
   from `y = -0.5` along board `+Y` and tests `px` against the authored wall-column
   interval. For a span of `N >= 1` cells at integer tangent anchor `a`, membership
   remains:

   ```text
   I(a, N) = [a - 0.5, a + N - 0.5)
   ```

   Admission is evaluated from the exact continuous movement coordinate before
   reflection, projection, FOV fitting, or clipping. The lower boundary remains
   inclusive, the upper boundary remains exclusive, and neither end is epsilon-expanded.
   A piece outside the corridor is never planned or drawn for that mirror.

2. **Reflect and fit along the board-grid wall normal.** For an admitted piece and a
   normalized field-of-view value `f > 0`, the exact reflected board coordinate `r` is:

   ```text
   west wall at x = -0.5:  xr = -0.5 - (px + 0.5) / f, yr = py
   north wall at y = -0.5: xr = px, yr = -0.5 - (py + 0.5) / f
   ```

   At `f = 1`, these reduce to the undiluted wall-plane reflections
   `(-1 - px, py)` and `(px, -1 - py)`. Larger FOV values shorten only the reflected
   wall-normal depth; they do not change the tangent coordinate. The west transform
   therefore holds board Y and follows the game-grid X axis. The north transform holds
   board X and follows the game-grid Y axis. For every positive `f`, the physical piece,
   its wall intersection `(-0.5, py)` or `(px, -0.5)`, and the reflected point remain on
   one board-grid line. Fractional coordinates are preserved throughout; the planner
   must not round or snap an in-flight piece to either endpoint cell.

3. **Project the reflected grid coordinate through the canonical projection.** The base
   reflected floor-contact anchor is `projectBoardPoint(r)` using the same fixed
   orthographic-isometric mapping as physical board content. The planner must not first
   project `p` and then apply
   `reflectedX = 2 * apertureCenterX - projectedPieceX`, preserve projected screen Y, or
   substitute any other screen-horizontal centerline equation. North and west naturally
   produce different projected grid-axis directions from their different board-grid
   transforms; this is correct and requires no perspective camera or secondary projector.

4. **There is no post-projection focal-point fit.** Field of view is fully resolved by
   the wall-normal grid-depth equation before canonical projection. The planner has no
   shared lower-aperture reflection focal point and must not compress a projected anchor
   toward one: that screen-space operation moves the result off the projected grid-axis
   ray. Reflected-subject scale remains uniform in X and Y. Opacity, planar/convex
   styling, and final aperture clipping remain downstream presentation, but they may not
   move the base anchor with screen-X reflection, screen-focal convergence, shear,
   nonuniform foreshortening, or a wall-face-specific post-projection distortion path.

5. **Reuse the physical sprite and apply `flipX`.** The mirror draw uses the same
   authored directional sprite selected for the physical piece and applies the existing
   horizontal raster flip for mirror chirality. The wall face changes the reflected
   board coordinate, not the selected facing asset. There is no face-specific
   directional sprite remap, reflected-facing lookup, reverse-camera sprite, or
   independently authored mirror pose.

6. **A multi-span mirror remains one corridor and one composition.** When one placement
   owns multiple authored spans, eligibility is the exact union of their half-open
   tangent intervals. Contiguous intervals coalesce; an authored gap is not filled by a
   bounding hull. An admitted piece is submitted once to the complete mirror. The full
   coplanar placement retains one continuous aperture, wall-normal FOV value, lens
   treatment, and reflection plan; per-wall depth or clip segments may partition painter
   order but may not restart or repeat the reflection.

7. **The live shared architecture and subject scope remain unchanged.** Every
   `kind: "mirror"` asset is a live piece-reflective surface with no decorative/off
   mode. The shared board-render package owns the pure corridor, grid-depth/FOV
   reflection, projection, and draw plan consumed by gameplay, the level editor, Studio,
   read-only boards, previews, and client or server thumbnails. Current physical chess
   pieces are the only subjects. UI and legal-move overlays, editor or drag ghosts,
   terrain, walls, props, doodads, lighting, particles, and shadows remain excluded.
   Generated frame, bevel, tint, foxing, scratch, and highlight pixels remain material
   layers around live sprites rather than baked reflected content.

8. **Studio remains the owner-operated instrument.** The reachable Wall Art viewer
   renders this exact canonical primitive on a real board and retains the aperture
   inspector, reflection opacity, field of view, uniform subject scale, lens treatment,
   and movable test pieces. Moving a test piece along the west mirror's grid X line or
   north mirror's grid Y line must visibly follow that projected grid axis. Crossing a
   tangent corridor boundary must still update eligibility continuously under ADR-0079's
   half-open rule.

This decision supersedes ADR-0079. It carries forward ADR-0079's corridor admission and
all inherited live-mirror, generated-material, shared-planner, physical-piece,
continuous-aperture, multi-span, and Studio requirements. It replaces only the admitted
piece placement inherited from ADR-0078. It reinstates the board-coordinate wall-plane
transform recorded in ADR-0077 without reinstating ADR-0077's reflected-facing or
directional-sprite remapping.

### Consequences

- Good: visibility and placement now use one coherent board-grid model.
- Good: west reflections follow the projected game-grid X axis and north reflections
  follow the projected game-grid Y axis instead of cardinal screen X.
- Good: continuous movement, exact corridor boundaries, canonical projection, uniform
  subject scale, and one shared renderer remain deterministic.
- Good: grid-depth FOV preserves physical-point-to-wall-to-reflection collinearity at
  every supported FOV instead of bending the ray toward a screen focal point.
- Good: the current physical sprite remains usable through `flipX` without a new facing
  family or mirror camera.
- Cost: north and west mirrors intentionally use different board-coordinate transforms,
  so tests must cover both faces rather than assuming one shared screen-horizontal
  equation.
- Cost: tests and implementations that assert unchanged projected Y or aperture-center
  screen-X reflection must be replaced, not retained as fallback behavior.

## Pros and Cons of the Options

### Screen-horizontal aperture-center reflection

- Good: one simple screen-space equation serves both wall faces.
- Bad: it does not follow either in-game grid axis after isometric projection.
- Bad: it makes corridor admission and reflected placement answer to different
  coordinate systems.

### Board-grid wall-normal reflection, then canonical projection

- Good: directly expresses the owner's grid-axis rule with exact continuous coordinates.
- Good: uses the canonical board projection and preserves the existing 2D compositor,
  wall-normal FOV control, aperture, sprite, and clipping pipeline.
- Bad: the two wall faces require their correct, distinct grid-coordinate transforms.

### Post-projection lower-aperture focal fit

- Good: can pull projected anchors toward a convenient point inside the glass.
- Bad: breaks collinearity between the physical piece, wall-plane intersection, and
  reflection, so movement no longer follows the projected in-game grid axis.

### Face-specific shear, remap, or perspective camera

- Good: could force or simulate other visual effects.
- Bad: introduces a parallel geometry or asset path instead of correcting the base
  coordinate transform.
- Bad: conflicts with the fixed-camera sprite compositor and exceeds the physical-piece
  reflection scope.

## More Information

- Superseded decision:
  [ADR-0079](0079-wall-mirrors-use-wall-local-board-axis-visibility-corridors.md)
- Earlier screen-horizontal decision:
  [ADR-0078](0078-wall-mirrors-reflect-pieces-horizontally-in-screen-space.md)
- Original live-mirror decision:
  [ADR-0077](0077-wall-mirrors-are-live-piece-reflective-surfaces.md)
- Derived current-state contract: [Board render contract](../board-render-contract.md)
- Shared primitive rule:
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
- Owner-operated instrument rule:
  [ADR-0071](0071-the-deliverable-is-the-instrument.md)
