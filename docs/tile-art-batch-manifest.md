# Tile Art Batch Manifest

This manifest defines the input/output contract for the next terrain-art batch.

## Fixed geometry and representation

- Frame: `96x180px` transparent RGBA.
- Top diamond: apex `(48,41)`, right `(96,68)`, front `(48,95)`, left `(0,68)`.
- Grid step: `48px` X, `27px` Y.
- Registry representation: explicit `topSrc`, `sideSrc`, optional `topAnimSrc`.
- A 1x1 combined top+side PNG is prohibited as an input, output, preview dependency, or
  filename stem (ADR-0075).

## Accepted base inputs

The six production families each provide eight static top layers and eight side layers.
Water also provides an eight-frame top animation sheet per variant. Art generation should
reference the relevant `-top.png` files—or the original flat PixelLab material—not a cube
or side-bearing image.

## Transition batch

Supported pairs:

1. Grass-Water.
2. Grass-Stone.
3. Stone-Water.

Each pair owns fourteen mixed socket masks, ordered north/east/south/west. Pure `0000` and
`1111` remain base terrain. Start with single-edge masks, then adjacent corners, opposite
edges, and three-edge masks.

Each candidate record must include:

- pair and mask;
- exact top-only reference assets;
- source tool, run ID, prompt/parameters, and native output size;
- deterministic geometry/bake command;
- mechanical geometry result;
- real-board preview location;
- review state: candidate, rejected, or owner-accepted.

## Mechanical gates

- Canonical vertices and the transition top's hard-alpha silhouette are exact.
- Neighbor sockets resolve to the declared families.
- Source material is not pre-shrunk or thumbnail-downscaled. The recorded deterministic
  bake affine-projects it into the diamond with nearest-neighbour sampling, and runtime
  display remains native/integer-aligned.
- Generated pixels remain the material source; code owns only masks, projection, and
  validation.
- Missing transition art is reported as missing art, not replaced by a hard-edge fallback.

## Human gate

Passing geometry does not accept the art. The owner reviews the top transition on the real
board first. Side/cliff treatment is reviewed independently after the top direction is
accepted.
