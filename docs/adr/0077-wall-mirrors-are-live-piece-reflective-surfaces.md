---
status: "superseded by ADR-0078"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0077: Wall mirrors are live piece-reflective surfaces

> **Superseded by [ADR-0078](0078-wall-mirrors-reflect-pieces-horizontally-in-screen-space.md)
> (2026-07-11).** The live-mirror requirement remains, but the physical wall-plane
> reflection and reflected-direction rules below are replaced by the deliberate
> screen-space reflection model in ADR-0078.

## Context and Problem Statement

The first wall-mirror anchor pack treated blue-silver glass and a baked highlight as
finished decoration. The owner clarified that a mirror is never dead wall decoration:
it must reflect the pieces currently on the board, and a large mirror must be able to
span several wall tiles as one continuous surface.

The board remains a fixed-camera orthographic-isometric 2D compositor. A real-time 3D
scene is therefore neither necessary nor compatible with the board-render contract;
the question is how to make truthful, live reflections within that renderer without
forking a different implementation for every board surface.

## Decision Drivers

- `kind: "mirror"` must have one reliable semantic meaning everywhere: live piece
  reflection, never an optional decorative approximation.
- Movement, capture, authored setup changes, and Studio test-piece changes must be
  visible in the reflection from the same piece state the board renders.
- The fixed camera permits a deterministic 2D solution with no runtime 3D engine.
- Generated art remains responsible for material character; code remains responsible
  for placement, projection, clipping, and live state.
- Multi-wall mirrors must read as one continuous lens, not repeated one-tile pictures.
- The owner needs a reachable instrument for inspecting and tuning the result.

## Considered Options

- Keep opaque decorative mirror sprites and add live reflection as an optional mode.
- Render a second real-time 3D scene into each mirror.
- Plan reflected piece draw operations in 2D and composite them through an authored
  aperture (chosen).

## Decision Outcome

Chosen: **every wall-decor source whose `kind` is `mirror` is a live piece-reflective
surface backed by one canonical fixed-camera 2D reflection planner.** There is no
decorative/off mode. A mirror with no eligible piece in view may show empty tinted or
foxed glass, but it may not substitute a baked room or permanently opaque painted glass
for the reflection.

The implementation follows these rules:

1. **One orthographic reflection model.** Piece centers are reflected across the
   physical perimeter wall plane before the result is passed through the canonical
   board projection. The west wall lies at `x = -0.5`, so `(x, y)` reflects to
   `(-1 - x, y)`. The north wall lies at `y = -0.5`, so `(x, y)` reflects to
   `(x, -1 - y)`. The planner consumes the same live or authored physical-piece
   snapshot as its host board. Orthographic projection means depth does not introduce
   perspective shrink; the mirror's field-of-view/depth window and subject-scale
   tuning control readability within the aperture.

2. **Planar and convex lenses share that model.** A planar mirror clips the projected
   reflected pieces without lens distortion. A convex mirror starts from the same
   truthful reflected-piece plan, then applies one deterministic aperture-local
   compression/warp. Convex is a lens treatment, not a prerecorded scene and not a
   separate reflection engine.

3. **The aperture belongs to the frame asset.** Every mirror source declares or
   generates inspectable glass-aperture geometry aligned to its actual frame. That
   geometry is versioned with the source/frame and is not freeform live Wall Art data;
   arbitrarily reshaping it in Studio would detach the reflection from the frame.
   Studio must visibly outline and inspect the aperture. Revising its shape happens in
   the asset pipeline, followed by the ordinary asset review.

4. **Generated material surrounds live state.** Generated pixels continue to own the
   frame, bevel, patina, glass tint, foxing, scratches, and highlight/occlusion overlays.
   The runtime reflection of pieces is composited inside the authored aperture between
   the glass backing/tint and the foreground frame/material overlays. Generated glass
   may modulate the reflection; it must not erase it. A baked reflected room or piece is
   not eligible runtime mirror content.

5. **A multi-wall mirror is one continuous composition.** A mirror placement may span
   multiple contiguous coplanar north or west wall tiles. It owns one placement-local
   aperture, lens transform, and reflection plan across the complete span. Individual
   wall segments may be clipping windows into that plan, but they must not restart the
   field of view, repeat the reflection, or introduce seams at tile boundaries.

6. **One canonical primitive serves every board renderer.** The shared board-render
   package owns the pure reflection plan (subjects, reflected anchors/facings, aperture
   clipping, lens transform, and draw order). Gameplay, the level editor, Studio,
   read-only boards, previews, and server/client thumbnails consume that primitive or
   its draw plan; none may implement a local reflection approximation. This is a domain
   instance of ADR-0059.

7. **Studio delivers the instrument.** The reachable Wall Art viewer must show the
   exact canonical reflection primitive on a real board. It exposes the aperture as a
   visible inspector/overlay and lets the owner tune reflection opacity, field of view,
   reflected-subject scale, and planar/convex lens treatment. Test-piece controls let
   the owner add/select and move representative pieces, change their relevant visual
   state, and see the reflection update immediately. These controls display the
   committed baseline and reset to it under ADR-0057; they do not create a parallel
   renderer or a freeform aperture editor. This is the mirror-specific instrument
   required by ADR-0071.

8. **The reflection scope is physical pieces.** Reflected subjects are the current
   physical chess pieces. Selection rings, legal-move/threat overlays, editor brush
   ghosts, drag ghosts, handles, labels, and other UI are excluded. Full terrain,
   walls, props, doodads, particles, lighting, and shadows are outside this decision's
   scope. They may be considered later without weakening the rule that every mirror
   reflects pieces now.

9. **Reverse-side sprite limits stay explicit.** The planner reflects piece position
   and facing correctly, but the current fixed-camera unit set does not contain a
   separate mirror-camera/reverse-side raster for every pose. The renderer uses the
   closest valid authored directional sprite, so asymmetric pieces (especially knights)
   can be visually approximate even while their reflected location and motion are
   correct. Studio must make this limitation reviewable. It is not grounds for showing
   dead glass; later reverse-view art can improve fidelity without replacing the
   planner.

### Consequences

- Good: all mirrors now have a testable product meaning, and moves/captures cannot leave
  a stale painted reflection behind.
- Good: one planner keeps gameplay, authoring, previews, and thumbnails in parity.
- Good: large gallery mirrors can be authored as real multi-wall features without
  repeating one-tile scenery.
- Good: generated frames retain their material value while live board state remains
  live, matching the asset-generation contract.
- Cost: existing mirror anchors need explicit aperture data and layered glass/frame
  output before they qualify as finished runtime mirrors.
- Cost: convex warping, multi-span clipping, and reverse-side sprite fidelity require
  additional validation beyond ordinary wall decoration.

## Pros and Cons of the Options

### Optional reflection over decorative sprites

- Good: cheapest migration from the first opaque anchor pack.
- Bad: makes `mirror` ambiguous and permits the exact dead-decoration failure the owner
  rejected.

### A real-time 3D mirror scene

- Good: could eventually reflect arbitrary geometry and lighting.
- Bad: replaces the fixed-camera 2D render architecture for a feature whose required
  subjects are already available as sprites.

### Canonical 2D reflected-piece planner

- Good: truthful live piece state, deterministic output, multi-surface reuse, and a
  bounded implementation compatible with the fixed camera.
- Bad: reverse-side appearance is limited by the directional sprites available, and
  non-piece scene reflection remains intentionally absent.

## More Information

- Derived current-state contract: [Board render contract](../board-render-contract.md)
- Source/art split: [Asset generation contract](../asset-generation-contract.md)
- Mirror source provenance: [Wall Art Concept Sources](../art/wall-art-concepts/SOURCES.md)
- Shared primitive rule: [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
- Owner-operated instrument rule: [ADR-0071](0071-the-deliverable-is-the-instrument.md)
