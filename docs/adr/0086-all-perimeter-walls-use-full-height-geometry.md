---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
---

# ADR-0086: All perimeter walls use full-height geometry

## Context and Problem Statement

ADR-0083 preserved ordinary-height perimeter walls and introduced a taller visual wall
variant only under Grand Gallery and other full-body mirrors. That kept the logical wall
plane stable, but made the mounted mirror appear substantially taller than the wall
system around it. At runtime the special support read as a mirror-sized architectural
replacement rather than the same wall receiving wall art.

The owner rejected cropping or shrinking Grand Gallery to disguise that mismatch. Grand
Gallery remains a full-body mirror: its exact one-to-one live reflection and complete
tallest-unit coverage are product requirements. The wall system therefore needs one
full-height visual geometry for mirror-bearing and non-mirror perimeter walls alike.

## Decision Drivers

- Grand Gallery must retain the complete tallest-unit silhouette at exact one-to-one
  size and its exact reflected floor-contact anchor.
- Wall art must mount on the wall system rather than silently replace nearby walls with
  a uniquely taller architectural variant.
- Adjacent wall segments must share one consistent top silhouette whether or not they
  carry a mirror.
- Logical wall edges, contact footprint, anchors, visibility corridors, and the
  wall-floor support seam must not change when visual height changes.
- Generated/source material must own the taller wall pixels; runtime stretching or
  code-painted extensions remain ineligible.
- Intentionally small mirrors must retain their authored apertures and may continue to
  crop the unchanged exact-size live raster.

## Considered Options

- Keep ordinary walls short and use the tall wall variant only under full-body mirrors.
- Shorten or crop Grand Gallery to fit the ordinary wall silhouette.
- Shrink, shift, float, or depth-compress the live reflection inside the existing wall.
- Make the full-height generated wall geometry the only perimeter-wall lane (chosen).

## Decision Outcome

Chosen: **every perimeter wall uses the full-height generated wall geometry. Grand
Gallery remains an uncropped full-body aperture with the exact one-to-one reflection;
the mirror-only tall wall variant and ordinary short runtime wall lane are retired.**

The implementation follows these rules:

1. **Full height is the canonical wall geometry.** Every north and west perimeter wall,
   with or without wall art, uses the full-height generated frame and the corresponding
   face-projected material asset. Wall material may vary, but wall height may not vary by
   mirror presence, wall-art kind, or placement state.

2. **The mirror does not select a wall variant.** Wall-art manifests and placements do
   not carry a `wallVariant`, mirror-support-height flag, or equivalent instruction that
   swaps the wall beneath an asset. Adding or removing Grand Gallery changes only wall
   art and live reflection state; the supporting wall raster remains the same canonical
   full-height wall. Mirror metadata describes aperture intent instead:
   `mirrorCoverage: "full-body"` for Grand Gallery and `"authored-crop"` for the small
   mirrors. That semantic role governs proofs, never wall geometry.

3. **Grand Gallery remains full-body and uncropped by its authored glass aperture.** Its
   generated frame and continuous aperture must contain the complete tallest resolved
   physical-unit silhouette on both wall faces at ADR-0083's exact virtual seat, raster
   size, facing, and floor anchor. Insufficient headroom requires revising generated
   Grand Gallery source or the canonical full-height wall bake, never cropping, scaling,
   shifting, floating, stretching, or depth-compressing the reflection.

4. **Small-mirror aperture roles remain authored.** Keep, Court, Chapel, and Witch's Eye
   retain their intentionally small glass polygons and may crop the unchanged exact-size
   raster. Making the supporting wall universally tall does not enlarge their apertures
   or turn aperture clipping into a fitting transform.

5. **Board-space geometry remains unchanged.** The taller canonical wall preserves the
   existing logical wall plane, occupied perimeter edge, contact footprint, tangent span,
   seat anchor, back-edge/floor seam, visibility corridor, and scene-depth semantics.
   Only generated visual extent above the seam changes.

6. **ADR-0085 support and floor occlusion remain authoritative.** Generated frame,
   generated glass, and live reflection are still clipped to the union of actual
   supporting wall-face segments capped at the generated back-edge/floor seam. Taller
   walls extend support upward; they do not move the seam or allow mirror pixels onto the
   boundary tile.

7. **The asset migration is end to end.** The canonical `wall-*` assets are regenerated
   at full height and replace the ordinary short wall pixels at every runtime and preview
   consumer. Mirror-only `wall-tall-*` assets, wall-variant selectors, parallel
   short/tall catalog entries, fallback defaults, and obsolete proof expectations are
   deleted rather than kept as compatibility paths. Historical source evidence may
   remain clearly labeled as retired evidence outside runtime asset paths.

8. **Proofs cover the uniform wall system.** Wall material contact sheets and runtime
   seat proofs show the canonical full-height geometry for every material. Board-scale
   mirror proofs show Grand Gallery mounted on that same geometry beside ordinary wall
   segments, while retaining exact-virtual containment and ADR-0085's exhaustive
   supported-glass-or-floor-occluded line-of-sight gate on both faces.

This decision supersedes ADR-0083's ordinary-versus-mirror-specific wall-height lane.
ADR-0083's universal exact reflection, final authored aperture masks, small/full-body
aperture roles, generated-material rules, and proof requirements remain in force as
restated here. ADR-0085 remains accepted and unchanged.

### Consequences

- Good: Grand Gallery reads as wall art mounted on the same architecture as neighboring
  walls instead of as an oversized wall replacement.
- Good: full-body reflection coverage is solved by the wall system without compromising
  exact position, size, facing, or floor contact.
- Good: wall placement and wall-art placement no longer change the underlying wall-height
  lane.
- Cost: every wall material, thumbnail, proof, renderer, editor preview, and thumbnail
  consumer must migrate to the larger visual frame.
- Cost: taller ordinary walls increase board relief and may require depth, occlusion,
  framing, and editor-hit-target review even when no mirror is present.

## Pros and Cons of the Options

### Mirror-only tall wall variant

- Good: limits taller relief to the asset that needs it.
- Bad: makes the mirror replace the wall visually and produces inconsistent adjacent
  wall heights.
- Bad: adds a wall-art-controlled geometry lane to the renderer and asset catalog.

### Crop or fit Grand Gallery inside ordinary walls

- Good: preserves the old ordinary wall silhouette.
- Bad: violates Grand Gallery's full-body role or exact one-to-one reflection contract.
- Bad: makes reflection geometry compensate for undersized architecture.

### One canonical full-height wall lane

- Good: makes wall height consistent and independent of decoration.
- Good: provides the headroom required by exact full-body mirrors.
- Bad: changes the silhouette and relief budget of every perimeter wall.

## More Information

- Superseded decision:
  [ADR-0083](0083-mirror-aperture-coverage-is-authored-per-asset.md)
- Wall-face support and floor occlusion:
  [ADR-0085](0085-mirror-surfaces-end-at-the-wall-floor-boundary.md)
- Generated feature-material rule:
  [ADR-0040](0040-feature-tiles-own-geometry-generate-material.md)
- Migration policy: [Migration policy](../migration-policy.md)
- Derived current-state contracts:
  [Board render contract](../board-render-contract.md) and
  [Asset generation contract](../asset-generation-contract.md)
