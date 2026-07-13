---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
---

# ADR-0087: Grand Gallery wall faces are exact visual counterparts

## Context and Problem Statement

Grand Gallery was baked by independently shearing the same front-facing generated source onto
the west and north wall slopes. The source contains directional diagonal highlights. Opposite
shears spread those highlights on one face and compress them on the other, so the same mirror
read as materially different artwork on west and north walls even though its dimensions, mount,
aperture coverage, and reflection geometry matched.

## Decision Outcome

Grand Gallery's west projected face is the canonical emitted material. Its north projected face
is the pixel-exact horizontal counterpart of west, for both the generated frame and generated
glass layers.

Asset parity alone is insufficient: Grand Gallery is depth-partitioned into one draw slice per
supporting wall. Exact-abutting canvas clips allowed the next west wall tile to repaint their
shared raster column, producing two stone-colored seams in the otherwise continuous mirror.

The bake and manifest obey these rules:

1. North frame and glass pixels equal the horizontally mirrored west pixels at every RGBA sample.
2. North `mountX` equals `width - west.mountX`; `mountY` is unchanged.
3. The north normalized aperture is the horizontal mirror of west. Polygon winding is restored
   after reflection so runtime convex clipping remains valid.
4. This is an asset-projection rule only. It does not change board-grid reflection corridors,
   reflected seats, piece facing, 1:1 scale, wall support, or floor occlusion.
5. The generation gate compares the emitted north frame and glass against mirrored west pixels
   and fails on any difference.
6. Runtime north and west slot X values are complements around the shared wall-art datum; slot Y
   remains equal. Grand Gallery therefore mounts at `x=42` west and `x=86` north around datum
   `x=64`.
7. Per-wall depth ordering remains intact. Each later mirror slice owns a one-canvas-pixel overlap
   backward along the wall tangent so a subsequently painted wall cannot leak through a shared
   clip edge. The overlap follows the wall slope and may not cross the wall/floor boundary.
8. A production-raster regression renders the shipped frame, glass, supporting walls, and real
   depth interleave on both faces. It fails if an internal seam exposes any underlying wall pixel.

### Consequences

- Good: Grand Gallery reads as the same generated mirror on either perimeter-wall face.
- Good: directional sheen, weathering, frame edges, aperture, and mount geometry cannot drift
  independently between faces.
- Good: the continuous three-wall surface cannot regress to exact-abutting clip seams while its
  source PNGs still pass.
- Cost: north is intentionally derived from west rather than independently projected from the
  front-facing source.

## More Information

- Canonical wall geometry: [ADR-0086](0086-all-perimeter-walls-use-full-height-geometry.md)
- Generated mirror assembly: [Asset generation contract](../asset-generation-contract.md)
- Runtime reflection geometry: [Board render contract](../board-render-contract.md)
