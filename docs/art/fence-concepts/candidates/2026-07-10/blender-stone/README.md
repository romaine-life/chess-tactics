# Blender stone-fence native candidates

This directory records the historical Blender lane for the 2026-07-10
wood/stone fence comparison. Its source and rendered media moved to private live
storage; this text is not a rebuild path.

## Pixel contract

- Runtime frame: `96x180` RGBA, rendered at `100%`.
- Frame anchor: `(48,68)`.
- Board edge projection: `48x27` pixels per half-diamond edge.
- E rail path: front `(48,95)` toward right `(96,68)`.
- S rail path: left `(0,68)` toward front `(48,95)`.
- Rail model height: `1.0` world unit, which projects to approximately `14px`
  before the edge's `27px` isometric rise is included.
- Terminal-post target: visible `18x24`, with its last alpha row at anchor
  `y=68`.

Measured native render results (Pillow-style half-open alpha bounds):

| Candidate | Intrinsic size | Alpha bounds | Visible bounds |
| --- | --- | --- | --- |
| `stone-rail-e-native-96x180.png` | `96x180` | `(48,55,96,94)` | `48x39` |
| `stone-rail-s-native-96x180.png` | `96x180` | `(0,55,48,94)` | `48x39` |
| `stone-terminal-post-native-96x180.png` | `96x180` | `(39,45,57,69)` | `18x24` |

The rail bounds include both the approximately `14px` upright wall and the
`27px` isometric rise. Blender's compositor hardens native render coverage to
binary alpha without moving or resampling color pixels. There is no spatial
resize before or after rendering.

## ADR boundary and provenance

- ADR-0040 geometry: the reusable Blender source owns the modular wall, five
  capstone joints, post shaft, cap, camera projection, and seating.
- ADR-0040 material: all stone albedo pixels came from the sourced photoscan
  recorded with the private source version.
- ADR-0076: Blender renders directly to the final `96x180` frame. The only
  post-lighting compositor operation is permitted alpha hardening. The script
  has no bitmap resize, render-percentage correction, compositor scale, or
  runtime scale step.

These are candidates, not accepted runtime art. Promotion still requires an
in-app 1x proof, family acceptance record, and the runtime native-size guard
required by ADR-0076.

## Replacement workflow

Any new Blender pass fetches its private source version into a temporary
workspace, renders directly at the delivery raster, uploads the exact candidate
bytes and evidence, and removes the workspace after board review. It must not
rewrite files in this directory.
