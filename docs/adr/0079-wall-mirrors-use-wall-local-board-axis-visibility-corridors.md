---
status: "superseded by ADR-0080"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0079: Wall mirrors use wall-local board-axis visibility corridors

> **Superseded by [ADR-0080](0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md)
> (2026-07-11).** Corridor admission, continuous movement, half-open boundary
> ownership, and multi-span union semantics remain. Admitted-piece placement no longer
> uses screen-horizontal aperture-center reflection; ADR-0080 applies FOV to wall-normal
> board-grid depth and then canonically projects the reflected coordinate.

## Context and Problem Statement

ADR-0078 replaced physical wall-plane reflection with a deliberate isometric screen-space
placement rule. Its implementation submitted every physical piece to every mirror before
the aperture-local field-of-view fit. That made a piece outside the wall rows or columns
covered by a mirror eligible for reflection; the fit could then pull the unrelated piece
into the aperture. A west-wall mirror could therefore show a piece in a different board
row, even though the owner's game rule is that the mirror looks straight inward along the
board X axis.

The intended behavior is neither real-world ray tracing nor catch-all screen-X mirroring.
It is a wall-local board rule: a mirror covers authored wall cells and casts their complete
width straight into the board. Eligibility must be decided in continuous board space
before screen projection, field-of-view fitting, or aperture clipping can move the visual
result.

## Decision Drivers

- A west-wall mirror must see only physical pieces aligned with its covered wall rows.
- A north-wall mirror must see only physical pieces aligned with its covered wall columns.
- In-flight movement must use the piece's continuous board position rather than a rounded
  source or destination cell.
- Boundary ownership must be deterministic and must not let adjacent spans both admit the
  same piece.
- A multi-span mirror must use its full authored coverage as one visibility corridor and
  one composition, not repeat eligibility or reflection per wall tile.
- Existing aperture-local placement, fit, clipping, `flipX`, live-only semantics, physical
  subject scope, shared planner, and Studio instrument must remain intact.

## Considered Options

- Submit every physical piece to every mirror and rely on aperture/FOV fitting and clipping
  to determine visibility (ADR-0078's catch-all behavior).
- Use a camera-correct reflected frustum or real-world ray intersection.
- Filter physical pieces through an authored wall-local board-axis corridor before
  submitting them to the existing aperture-local reflection composition (chosen).

## Decision Outcome

Chosen: **each mirror casts a half-infinite visibility corridor inward from the authored
wall cells it covers. A west-wall mirror casts along board `+X` and filters by continuous
board Y; a north-wall mirror casts along board `+Y` and filters by continuous board X.**
Only physical pieces inside that corridor are submitted to the reflection composition.

The implementation follows these rules:

1. **The authored wall-cell span defines the tangent interval.** For a span of `N >= 1`
   wall cells whose first cell has integer tangent coordinate `a`, the interval is:

   ```text
   I(a, N) = [a - 0.5, a + N - 0.5)
   ```

   On a west wall, `a` is the first covered wall row's Y coordinate. On a north wall,
   `a` is the first covered wall column's X coordinate. The corridor comes from these
   authored supporting wall cells, not from the screen-space aperture bounds, generated
   frame pixels, or field-of-view setting.

2. **Wall face selects the cast axis and tangent test.** For a current physical piece at
   continuous board coordinate `p = (px, py)`:

   ```text
   west wall: cast from x = -0.5 along +X; admit iff py is in I(a, N)
   north wall: cast from y = -0.5 along +Y; admit iff px is in I(a, N)
   ```

   Physical board pieces already occupy the inward side of those perimeter wall planes,
   so the corridor has no additional depth cutoff. Field of view may fit an admitted
   piece's presentation, but it may not widen the tangent interval. The planner uses the
   same exact continuous board coordinate as live movement; it must not infer membership
   from projected pixels or snap an animated piece to an integer cell.

3. **Intervals are lower-inclusive and upper-exclusive.** Membership is evaluated as
   `t >= a - 0.5 && t < a + N - 0.5`. A piece exactly on the lower boundary is admitted;
   a piece exactly on the upper boundary is not. The upper boundary therefore belongs to
   an immediately adjacent later span, if one exists. Implementations must not expand both
   ends with an epsilon, because that would make seam ownership ambiguous. Regression tests
   cover the lower boundary, the last value below the upper boundary, and the exact upper
   boundary for both wall faces.

4. **Admission happens before reflection presentation.** A piece outside the corridor is
   not submitted, planned, fitted, clipped, or drawn for that mirror. Aperture clipping is
   a final raster boundary, not a substitute for this board-space visibility test. For an
   admitted piece, the existing aperture-local horizontal placement, focal/FOV fit, uniform
   subject scale, opacity, lens treatment, and clipping remain downstream presentation.
   The draw operation continues to reuse the physical piece's selected directional sprite
   with `flipX`; it does not restore wall-plane coordinate reflection or face-specific
   directional remapping.

5. **Multi-span coverage is one union corridor.** When one mirror placement owns multiple
   authored wall-cell spans, its eligibility set is the union of all their half-open
   tangent intervals. Contiguous intervals therefore behave as one complete interval;
   individual supporting tiles or depth clip segments must not test and submit the same
   piece independently. A piece that belongs to the union is admitted once to the mirror's
   one continuous composition. The union is exact rather than a bounding hull, so an
   authored gap, if such a placement is ever allowed, does not silently become visible.

6. **The live-mirror architecture remains canonical.** Every `kind: "mirror"` asset is a
   live piece-reflective surface with no decorative/off mode. The shared board-render
   package owns the pure planner, including corridor admission and the resulting draw plan.
   Gameplay, the level editor, Studio, read-only boards, previews, and client or server
   thumbnails consume that primitive; none may implement a local visibility approximation.

7. **Aperture, generated material, and subject scope remain unchanged.** The frame asset
   owns its inspectable glass aperture. Generated frame, bevel, tint, foxing, scratches,
   and highlight pixels surround or modulate live reflected sprites but never bake a piece
   or room reflection. Eligible subjects are current physical chess pieces only; selection
   and legal-move overlays, editor or drag ghosts, terrain, walls, props, doodads, lighting,
   particles, and shadows remain excluded.

8. **Studio remains the owner-operated instrument.** The reachable Wall Art viewer renders
   the exact canonical corridor-aware primitive on a real board. It keeps the aperture
   inspector, reflection opacity, field of view, subject scale, lens treatment, and movable
   test pieces. Moving a test piece across either tangent boundary must update eligibility
   immediately, making the corridor and its half-open boundary rule reviewable without a
   parallel fixture renderer.

This decision supersedes ADR-0078. It carries forward ADR-0078's deliberate isometric
aperture-local presentation and `flipX`, together with the live-only, generated-material,
shared-planner, physical-piece, continuous-aperture, and Studio requirements inherited
from ADR-0077. It retires catch-all submission of every physical piece to every mirror;
screen-space placement and aperture/FOV fitting cannot make an out-of-corridor piece
eligible.

### Consequences

- Good: mirror contents now follow a legible game-space line/corridor rule tied directly
  to the wall cells the mirror occupies.
- Good: an unrelated piece in another row or column cannot be pulled into the aperture by
  field-of-view fitting.
- Good: continuous movement and exact seam ownership are deterministic on both wall faces.
- Good: the existing reflection composition, generated art layers, and cross-renderer
  architecture remain reusable after the admission filter.
- Cost: the planner must carry each subject's continuous board coordinate in addition to
  its projected floor-contact anchor.
- Cost: north and west faces share downstream presentation but intentionally use different
  board-axis admission tests.

## Pros and Cons of the Options

### Catch-all submission with aperture clipping

- Good: requires no board-coordinate visibility test.
- Bad: clipping occurs after fitting, so unrelated pieces can be transformed into the
  aperture and appear visible.
- Bad: gives authored wall coverage no semantic role in deciding what the mirror sees.

### Camera-correct reflected frustum

- Good: can model real-world view-dependent mirror visibility.
- Bad: conflicts with the owner's deliberately simple board-axis isometric game rule.
- Bad: introduces camera and scene complexity beyond the physical-piece sprite compositor.

### Wall-local board-axis corridor

- Good: directly expresses “shoot inward from the covered wall cells” in stable board
  coordinates.
- Good: filters before downstream visual transforms and retains the existing live mirror
  composition for eligible pieces.
- Bad: is intentionally not real-world mirror visibility and differs by wall face in board
  coordinates.

## More Information

- Superseded decision:
  [ADR-0078](0078-wall-mirrors-reflect-pieces-horizontally-in-screen-space.md)
- Original live-mirror decision:
  [ADR-0077](0077-wall-mirrors-are-live-piece-reflective-surfaces.md)
- Derived current-state contract: [Board render contract](../board-render-contract.md)
- Shared primitive rule:
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
- Owner-operated instrument rule:
  [ADR-0071](0071-the-deliverable-is-the-instrument.md)
