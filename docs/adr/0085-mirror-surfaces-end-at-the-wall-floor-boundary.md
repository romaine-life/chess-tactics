---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
---

# ADR-0085: Mirror surfaces end at the wall-floor boundary

## Context and Problem Statement

ADR-0084 required every opaque physical-unit pixel in a full-body proof to cross both
glass and a supporting wall segment. The first implementation represented each segment
with a tangent-bounded but vertically unbounded painter-order band. That band extended
through the projected wall/floor seam, so it incorrectly treated below-floor crossings
as supported and allowed generated frame, glass, and live-reflection pixels to appear on
top of the boundary tile.

The mirror is mounted on the wall behind that tile. The renderer and its proof therefore
need one shared, geometric definition of where the visible supporting wall face ends,
without changing the exact one-to-one game-world reflection.

## Decision Drivers

- The floor tile must visually occlude every mirror layer below the generated wall's
  back-edge/floor seam.
- Frame, glass, reflection, Studio inspection, and proof tooling must use the same wall
  support geometry.
- Multi-cell mirrors must remain one continuous authored composition while respecting
  each real supporting segment.
- Exact reflected position, 1:1 raster dimensions, facing, and floor anchor must remain
  unchanged; wall occlusion must not become a fitting transform.
- The exhaustive LOS proof must distinguish a valid floor occlusion from a glass miss or
  unsupported overhang.
- Painter-order partition geometry must not silently stand in for visual wall support.

## Considered Options

- Keep the unbounded segment band and accept the overlap with the floor tile.
- Raise the mirror or its lower rail until no generated pixel crosses the seam.
- Change global terrain/scene painter order so terrain redraws over the mirror.
- Add a shared wall-face support mask capped at the projected floor seam and classify
  below-seam LOS hits as floor-occluded (chosen).

## Decision Outcome

Chosen: **every mirror layer is clipped to the union of its real supporting wall-face
segments, whose lower edge is the generated wall's projected back-edge/floor seam.** The
boundary tile therefore owns the board-side half-plane. This is a topology/occlusion
rule downstream of the exact reflection transform, not a change to reflection geometry.

The implementation follows these rules:

1. **Depth bands and support masks are distinct primitives.** An ordinary coplanar
   wall-art depth band may remain vertically unbounded to partition painter order. A mirror's
   visual clip must instead use a wall-face support polygon. The unbounded band is never
   evidence that glass or frame pixels have wall behind them.

2. **The generated back-edge seam is the lower support boundary.** Each mirror segment
   uses the canonical tile slope and `WALL_FRAME_GEOMETRY.backEdgeApexOffsetY` for the
   face on which it sits. At the current projection this is:

   ```text
   west: supportBoundaryY(screenX) = -28 - (27 / 48) * screenX
   north: supportBoundaryY(screenX) = -28 + (27 / 48) * screenX
   ```

   Pixel centers on or above that line are on the wall side. Pixel centers strictly
   below it are behind the boundary tile and absent from the mirror draw.

3. **All mirror layers share the support union.** Generated frame, generated glass, and
   live reflection are clipped by the same per-segment wall-face polygons. This applies
   to one-cell mirrors as well as Grand Gallery. A source may retain antialiasing or
   decorative pixels beyond the line, but runtime must not show them on the tile.

4. **A multi-span mirror remains continuous.** The visual support is the union of the
   placement's actual tangent-bounded wall segments, including the established outer
   half-cell edge allowance. The frame, aperture, and reflection are still authored and
   planned once across the full coplanar span; support clips neither tile nor restart the
   composition.

5. **LOS gains an accepted floor-occluded class.** After corridor admission and the
   ADR-0084 board-axis wall-hit construction, a hit strictly below the face's support
   boundary is `floor-occluded`. It is reported separately and is not counted as a
   supported-glass hit. A hit on the wall side must still lie inside both the authored
   glass aperture and the supporting-segment aperture union; otherwise it remains an
   outside-glass or unsupported failure. Invalid corridor samples remain failures.

6. **Full-body acceptance counts both valid outcomes explicitly.** A full-body LOS proof
   passes only when every opaque physical destination pixel is either supported glass or
   floor-occluded and there are no outside-glass, unsupported, or invalid pixels. Studio
   and durable gates report the two accepted counts separately rather than relabeling
   floor occlusion as glass coverage.

7. **The exact virtual-raster gate remains independent.** Grand Gallery must still place
   the complete authored virtual raster at the exact ADR-0083 seat, dimensions, facing,
   and floor anchor, with no scale, shift, lift, FOV, or depth compression. The authored
   aperture continues to contain that unmodified raster. The final visible draw may lose
   pixels only where the shared wall support mask establishes legitimate floor
   occlusion; that loss is not an aperture-fit failure.

8. **The floor does not become a mirror subject or a special camera layer.** The shared
   clip expresses the tile's semantic foreground ownership at the seam. It introduces
   no viewer pose, perspective ray, terrain reflection, secondary projection, or global
   terrain-over-scene reorder.

This decision supersedes ADR-0084. It preserves ADR-0084's grounded board-axis crossing
construction and exhaustive physical alpha proof, but replaces “every pixel crosses
supported glass” with the exhaustive supported-glass-or-floor-occluded rule. ADR-0083's
exact one-to-one virtual raster and authored aperture roles remain in force.

### Consequences

- Good: the mirror is visibly behind the boundary tile instead of partially painted on
  top of it.
- Good: runtime, Studio, and CI use one support seam and cannot disagree about whether a
  pixel has wall behind it.
- Good: floor occlusion is legible evidence rather than a false supported-glass pass.
- Cost: full-body proof totals now require separate supported-glass and floor-occluded
  counts on each face.
- Cost: mirror frames as well as glass/reflections require support clips, including
  single-cell variants.

## More Information

- Superseded proof rule:
  [ADR-0084](0084-full-body-mirrors-prove-grounded-board-axis-line-of-sight.md)
- Exact reflection and authored aperture roles:
  [ADR-0083](0083-mirror-aperture-coverage-is-authored-per-asset.md)
- Derived contract: [Board render contract](../board-render-contract.md)
- Generated material rules: [Asset generation contract](../asset-generation-contract.md)
