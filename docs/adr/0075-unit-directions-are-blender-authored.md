---
status: "accepted"
date: 2026-07-10
deciders: Nelson, Codex
---

# ADR-0075: Unit orientation and accepted-sprite recapture

## Context

A board unit is one object seen at eight exact facings. Direction is gameplay
information, so eight independently invented images are not an acceptable unit.
The accepted roster already has correct Blender-grounded geometry, approved
styling, six team palettes, and exact directional relationships.

Unit scale exploration established a second requirement: final stored sprites
should match their normal delivery raster. Keeping `512x512` PNGs that are always
drawn around `51x61` wastes transfer, decode memory, and storage, and leaves the
browser to repeat the same reduction. Rendering fresh tiny Blender frames avoids
that reduction but does not reproduce the accepted styling. An image-generation
restyle can also drift from the accepted orientation.

These are separate operations and must not be conflated:

- **New art generation** establishes geometry and orientation from Blender.
- **Accepted-art recapture** changes the stored raster size without redesigning
  or restyling the approved asset.

## Decision

Blender owns new unit geometry, camera projection, ground contact, and facing. The
camera stays fixed and one source model rotates around its vertical axis in exact
45-degree steps. The review order is `south`, `south-east`, `east`, `north-east`,
`north`, `north-west`, `west`, `south-west`; `south` shows the piece's authored
front facing board south.

For a size-only revision, the complete currently accepted asset is the sole visual
source. Unit Art's **Recapture** editor:

1. Reads all 6 palettes x 8 directions from the accepted storage-backed catalog
   asset, never from a candidate or a committed fallback.
2. Preserves the source aspect ratio inside the Unit Studio delivery canvas. A
   square `512x512` source targeting `51x61` becomes a smooth `51x51` contained
   image with five transparent rows above and below, never a `51x61` stretch.
3. Reduces with deterministic area sampling in premultiplied alpha, preserving
   antialiased boundaries without allowing RGB from transparent pixels to create
   dark or colored fringes.
4. Applies no recoloring, repainting, cropping, direction synthesis,
   or independent palette generation.
5. Previews the exact delivery PNGs in all eight directions and live on the board.
6. Creates an unaccepted candidate whose provenance records the accepted source
   asset id, catalog revision, source, contained, and delivery dimensions,
   `spatialResampling: true`, `aspectRatioPreserved: true`, premultiplied alpha,
   and `premultiplied-area-contain` resampling.
7. Scales the contact footprint by the contained horizontal ratio and preserves the
   accepted anchor.

A recaptured `512x512 -> 51x61` asset is explicitly downscaled. It may be called
delivery-sized, but it must not be described as pixel-authored, native-rendered,
or as pixels first authored on the `51x61` grid.

Acceptance remains a separate owner action after direction and board-context
review. It atomically changes the stable family's accepted pointer and publishes
the asset's delivery canvas as the family baseline. At logical `100%`, board draw
operations use the stored source width and height exactly, so a `51x61` accepted
pawn is drawn at `51x61` with no second resize.

The canonical Blender entry point remains `python scripts/generate-unit-art.py`
for genuinely new art. It is not the scale-only path for an already approved
asset. Image generation, whole-sheet restyling/slicing, south-concept fan-out, and
independently generated directions remain ineligible for final board-unit art.

Generated candidates and immutable sprites are storage-backed under ADR-0073,
not Git-backed public assets.

## Consequences

- The proven accepted styling and all eight directional relationships survive a
  size revision, subject only to the documented smooth area reduction.
- The 48 accepted pawn sprites fall from roughly `48 MiB` of decoded `512x512`
  RGBA data to about `0.57 MiB` at `51x61`.
- Runtime rendering becomes 1:1 and consistent across game, Studio, and thumbnail
  surfaces.
- Candidate provenance distinguishes source-authored dimensions from delivery
  dimensions instead of relabeling downscaled art as native.
- Downscaling does not create detail. The owner still reviews whether the accepted
  art survives at the chosen raster before acceptance.
