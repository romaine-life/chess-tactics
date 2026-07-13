---
status: "superseded by ADR-0083"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0082: Wall mirrors are exact one-to-one game-world reflections

> **Superseded by
> [ADR-0083](0083-mirror-aperture-coverage-is-authored-per-asset.md)
> (2026-07-11).** ADR-0082's exact position, 1:1 size, floor-contact, and no-fit
> transform rules remain. ADR-0083 narrows full-silhouette containment to Grand Gallery
> and other full-body mirrors; intentionally small authored apertures may crop.

## Context and Problem Statement

ADR-0080 introduced a tunable grid-depth field of view and an independent reflected
subject scale, and ADR-0081 retained both while correcting facing. In the live gallery,
those fit controls made the reflected knight smaller and lower-looking than the same
piece on the board. The owner clarified that mirrors follow a deliberately simplified
game-world rule: position, facing, and raster size are all reflected exactly, with no
optical depth or size compromise. If a full-size unit does not fit, the mirror-bearing
wall and aperture are too short; the piece must not be shrunk, shifted, or floated to
compensate.

## Decision Drivers

- A reflected piece must look the same size as its physical board counterpart.
- Position must be the complete board-grid wall-plane transform, not a tunable fraction
  of reflected depth.
- The physical and reflected floor-contact anchors must remain exact; fit must never add
  a visual lift or drop.
- A mirror-bearing wall may grow above the ordinary wall silhouette without changing its
  logical wall plane, footprint, or covered grid cells.
- Generated frame and glass pixels must own the taller presentation; runtime CSS, SVG,
  gradients, stretching, and code-painted wall extensions remain ineligible.
- The wall-local corridor, continuous coordinates, face-specific facing, raster
  chirality, shared planner, and live-physical-piece scope must remain unchanged.
- Studio must expose and prove the fixed one-to-one rule instead of offering controls
  that can violate it.

## Considered Options

- Keep the grid-depth FOV and reflected-subject scale as per-mirror tuning controls.
- Lock the existing controls to one while retaining them as persisted configuration.
- Remove independent depth/scale fitting, use the full wall-plane transform and 1:1
  raster size, and grow mirror-bearing walls/apertures upward to fit (chosen).
- Preserve the short aperture and shift, crop, or float reflected pieces until they fit.

## Decision Outcome

Chosen: **every wall mirror is an exact one-to-one game-world reflection. The planner
uses the full board-grid wall-plane transform and the physical draw's resolved raster
size, while the mirror-bearing wall and aperture provide the required headroom.** Glass
may still alter material appearance or opacity, but it cannot alter reflected position,
size, or floor contact.

The implementation follows these rules:

1. **Position is the complete wall-plane transform.** For an admitted physical piece at
   exact continuous board coordinate `p = (px, py)`, the reflected coordinate is always:

   ```text
   west wall at x = -0.5:  r = (-1 - px, py)
   north wall at y = -0.5: r = (px, -1 - py)
   ```

   The planner then applies the ordinary canonical orthographic-isometric projection to
   `r`. There is no field-of-view factor, grid-depth compression, aperture-center fit, or
   post-projection focal convergence. Fractional in-flight coordinates remain exact.

2. **Raster size is exactly one-to-one.** The reflected draw uses the same resolved
   screen-space width and height as the physical board draw after normal unit-catalog
   sizing. It has no independent subject-scale multiplier. Face-specific directional
   sprite selection and one final horizontal raster flip remain required by ADR-0081,
   but neither step may resize the result. “One-to-one” refers to the complete physical
   board presentation, not to unscaled source-file dimensions.

3. **Floor contact is invariant.** The physical draw's seat-relative rectangle is
   transferred to the exact reflected floor-contact seat, with the horizontal local
   geometry reflected for chirality. No mirror-specific vertical offset may raise or
   lower the subject to make it fit. A clipped head is an asset/aperture defect, not a
   reason to move the unit's feet.

4. **The mirror-bearing wall and aperture grow upward.** The visual wall variant, frame,
   and glass aperture for a mirror must provide enough headroom for the tallest resolved
   physical-unit raster in the accepted unit catalog at 1:1 scale. This requirement
   applies to both projected wall faces and to continuous multi-cell mirrors. The taller
   assembly may spill above the ordinary cell and wall silhouette, as other board relief
   already does, while the logical wall plane, contact footprint, anchor, span, and
   corridor remain unchanged. Ordinary non-mirror walls do not need to become taller.

5. **Height is solved in generated assets, not by runtime distortion.** Revising the
   required headroom means regenerating or extending the mirror-specific frame/glass
   source and its face-projected runtime assets, keeping the aperture aligned to the
   frame. Implementations must not stretch an existing mirror vertically, append a CSS,
   SVG, gradient, or code-painted strip, scale the reflected subject, or add a fitting
   offset. The frame, bevel, tint, foxing, scratches, and highlights remain generated
   material pixels; reflected pieces remain live draw operations.

6. **Aperture clipping remains a boundary, not a fit algorithm.** The frame-owned
   aperture still clips final pixels and may define the authored outer contour. Its
   vertical extent must nevertheless accommodate the accepted full-height unit bound.
   Lateral corridor admission and multi-span union rules remain those inherited from
   ADR-0080. An admitted piece is submitted once to one continuous mirror composition.

7. **Studio proves fixed invariants.** The reachable Wall Art instrument retains the
   aperture inspector, material/opacity inspection, and movable physical test pieces. It
   must include a tallest-unit, both-wall-face proof at normal board scale and report the
   exact depth and subject-size invariants as fixed `1x` behavior. FOV/grid-depth and
   reflected-subject-scale sliders are retired; an owner must not be able to author a
   mirror that violates this decision.

8. **The shared live-mirror architecture remains canonical.** Gameplay, the level
   editor, Studio, read-only boards, previews, and client or server thumbnails consume
   the same exact planner. Current physical chess pieces remain the only subjects. UI
   overlays, editor or drag ghosts, terrain, walls, props, doodads, lighting, particles,
   and shadows remain excluded. Material styling may affect the glass and final alpha,
   but it may not reintroduce spatial compression, subject scaling, shear, or a second
   projection path.

This decision supersedes ADR-0081. It replaces ADR-0080's inherited grid-depth FOV and
uniform subject-scale controls with fixed exact position and size, and adds the taller
mirror-bearing wall/aperture requirement. ADR-0081's wall-specific facing transform and
pre-flip directional sprite selection remain in force, as do the corridor, canonical
projection, live-piece scope, generated-material split, continuous multi-span
composition, and shared-planner requirements inherited from ADR-0080.

### Consequences

- Good: a reflection has the same spatial size, floor contact, and wall-normal distance
  as the physical piece, matching the game's simple grid-world convention.
- Good: art geometry absorbs the fit requirement instead of distorting live units.
- Good: mirrors no longer carry authorable FOV or reflected-subject-scale states that can
  make different assets obey different reflection physics.
- Cost: every mirror face and aperture must be regenerated or validated against the
  tallest accepted unit bound, which can make mirror-bearing walls visually taller.
- Cost: exact depth can place fewer pieces inside a finite authored aperture than a
  compressed view; the aperture or wall art must change if broader visibility is wanted.

## Pros and Cons of the Options

### Tunable depth and reflected-subject scale

- Good: can fit more board depth and more units into a short aperture.
- Bad: changes a mirror's game-space mapping and makes the reflected piece visibly
  smaller than the physical piece.
- Bad: treats the unit as the adjustable element when the aperture is undersized.

### Exact transform and size with a taller mirror-bearing wall

- Good: position, orientation, raster size, and floor contact all express one exact
  wall-plane rule.
- Good: preserves the accepted physical unit presentation without a second size system.
- Bad: requires taller mirror art, aperture geometry, painter-order validation, and new
  board-scale proof images.

### Shift, crop, or float the subject inside the old aperture

- Good: avoids revising mirror assets.
- Bad: breaks floor contact or hides a unit that should be fully visible.
- Bad: makes aperture fitting override the game's reflection rule.

## More Information

- Superseded decision:
  [ADR-0081](0081-wall-mirrors-reflect-piece-facing-in-board-grid-space.md)
- Position and corridor predecessor:
  [ADR-0080](0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md)
- Generated material rule:
  [ADR-0040](0040-feature-tiles-own-geometry-generate-material.md)
- Unit sizing and directional art:
  [ADR-0075](0075-unit-directions-are-blender-authored.md)
- Derived current-state contracts:
  [Board render contract](../board-render-contract.md) and
  [Asset generation contract](../asset-generation-contract.md)
- Owner-operated instrument rule:
  [ADR-0071](0071-the-deliverable-is-the-instrument.md)
