---
status: "superseded by ADR-0079"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0078: Wall mirrors reflect pieces horizontally in screen space

> **Superseded by [ADR-0079](0079-wall-mirrors-use-wall-local-board-axis-visibility-corridors.md)
> (2026-07-11).** Screen-space placement and `flipX` remain downstream presentation
> for admitted pieces, but mirror visibility is now governed by the wall-local
> board-axis corridor defined in ADR-0079 rather than catch-all piece submission.

## Context and Problem Statement

ADR-0077 established that every mirror is a live piece-reflective surface and chose a
physically motivated fixed-camera model: reflect a piece across the north or west board
wall plane, then project the reflected board coordinate. Reviewing that behavior in the
running isometric game exposed a mismatch with the owner's intended visual language. The
wall-plane calculation makes the result angle- and face-aware, while the desired game
convention is the simpler expectation that a mirror sends the already-visible piece
straight across the screen.

The board is a fixed orthographic-isometric composition, not a camera-correct 3D scene.
The reflection therefore needs a precise screen-space rule that is intentionally
consistent with the game's visual compromises rather than with real-world ray geometry.

## Decision Drivers

- Reflections should read immediately as horizontal mirror copies in the fixed game view.
- North and west mirrors should apply one predictable rule rather than different
  board-plane transforms.
- The canonical board projection and current physical-piece snapshot must remain the
  source of truth.
- The current directional sprites should remain usable without inventing a
  mirror-camera or wall-face-specific facing model.
- Aperture clipping, tunable fit/lens treatment, multi-wall continuity, and renderer
  parity from ADR-0077 must remain intact.
- The deliberate departure from physical perspective must be explicit and testable.

## Considered Options

- Reflect board coordinates across the physical north or west wall plane, then project
  them (ADR-0077's model).
- Render a second camera-correct 3D view into the mirror.
- Reflect the already-projected piece horizontally in screen space and flip its existing
  directional sprite (chosen).

## Decision Outcome

Chosen: **each mirror reflects an already-projected physical piece horizontally about
the vertical centerline of its aperture, preserves projected Y at that reflection step,
and renders the piece's original directional sprite with a horizontal flip.** This is an
intentional isometric game convention, not an approximation of wall-plane or perspective
ray geometry.

The implementation follows these rules:

1. **Project first, reflect in screen space second.** The planner consumes the same
   current physical-piece snapshot as its host board and obtains each piece's
   floor-contact anchor from the canonical board projection. With the piece anchor and
   aperture center expressed in the same screen coordinate space, the base reflected
   anchor is:

   ```text
   reflectedX = 2 * apertureCenterX - projectedPieceX
   reflectedY = projectedPieceY
   ```

   Equivalently, the piece's horizontal offset from the aperture center is negated while
   its projected vertical coordinate is copied unchanged. This base reflection happens
   before the existing aperture-local field-of-view and layout fit.

2. **Wall face does not change reflection math.** North and west placements use the same
   screen-space equation. The wall face still determines where the mirror asset and its
   aperture are seated, but the planner must not reflect board coordinates across
   `x = -0.5` or `y = -0.5`, reproject a virtual board position, or introduce another
   face-specific reflected-anchor path.

3. **Keep the source facing and flip the raster horizontally.** The mirror draw operation
   uses the same authored directional sprite selected for the physical piece and applies
   `flipX`. It does not remap the piece to a different directional sprite based on the
   north/west wall face or a computed reflected facing. The horizontal flip supplies the
   expected mirror chirality.

4. **Fit and lens treatment remain downstream.** The existing reflection opacity,
   subject scale, field-of-view convergence, planar fit, and convex aperture-local
   compression may transform the base result after the screen-space reflection. They are
   readability and lens treatments, not alternate reflection geometry, and may not
   reintroduce wall-plane coordinate reflection or face-specific facing selection. The
   final draw is clipped through the frame-owned aperture.

5. **A multi-wall mirror still owns one composition.** A contiguous coplanar mirror span
   uses the centerline of its complete placement-local aperture and one downstream fit
   and lens transform. Per-tile clipping windows must not reflect independently, restart
   the field of view, or repeat the subjects.

6. **The live-mirror architecture remains canonical.** Every `kind: "mirror"` asset is a
   live piece-reflective surface with no decorative/off mode. One shared pure planner
   serves gameplay, the level editor, Studio, read-only boards, previews, and client or
   server thumbnails. Generated frame/glass pixels remain material layers around live
   sprites rather than baked reflected content.

7. **The subject and instrument scopes remain unchanged.** Current physical chess pieces
   are reflected; UI overlays, selection/legal marks, editor or drag ghosts, terrain,
   walls, props, doodads, lighting, particles, and shadows are not. Studio continues to
   expose the aperture inspector, reflection opacity, field of view, subject scale, lens
   treatment, and movable test pieces against the canonical primitive.

This decision supersedes ADR-0077. Its live-mirror product meaning, aperture ownership,
generated-material split, shared-renderer requirement, multi-wall continuity, physical
piece scope, and owner-operated Studio instrument are carried forward here. Its physical
wall-plane coordinate equations and face-specific reflected-direction planning are
retired.

### Consequences

- Good: reflection movement is simple, stable, and immediately legible in screen space.
- Good: north and west mirrors share one anchor and sprite rule.
- Good: the renderer can reuse the already-selected directional sprite and represent the
  mirror operation explicitly as `flipX`.
- Good: aperture, FOV/lens, multi-span, and cross-renderer behavior remain available.
- Cost: reflected placement and facing are deliberately not physically correct for the
  wall's isometric orientation.
- Cost: tests and implementations based on ADR-0077's virtual board coordinates or
  reflected-direction remap must be replaced rather than retained as fallback paths.

## Pros and Cons of the Options

### Reflect board coordinates across the wall plane

- Good: corresponds to planar reflection geometry before orthographic projection.
- Bad: produces angle- and wall-face-aware motion that does not match the chosen
  isometric game convention.
- Bad: requires virtual board coordinates plus reflected-facing logic for a result the
  owner reads less naturally.

### Render a second 3D view

- Good: could support camera-correct reflections of arbitrary scene geometry.
- Bad: conflicts with the fixed-camera sprite compositor and is far beyond the
  physical-piece reflection scope.

### Reflect the projected piece horizontally and flip its sprite

- Good: directly expresses the intended visual rule, is deterministic, and behaves
  identically on both wall faces.
- Good: retains the canonical projection, live piece state, aperture, and existing
  sprites.
- Bad: knowingly sacrifices real-world angle correctness.

## More Information

- Superseded decision: [ADR-0077](0077-wall-mirrors-are-live-piece-reflective-surfaces.md)
- Derived current-state contract: [Board render contract](../board-render-contract.md)
- Shared primitive rule:
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
- Owner-operated instrument rule:
  [ADR-0071](0071-the-deliverable-is-the-instrument.md)
