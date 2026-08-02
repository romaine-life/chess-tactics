---
status: superseded
date: 2026-08-01
deciders: owner (Nelson) + Codex
superseded-by: "[ADR-0337](0337-level-editor-brush-ships-the-exact-approved-option-01-pixels.md)"
refines:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
  - "[ADR-0334](0334-level-editor-brush-tool-uses-a-dedicated-paintbrush-icon.md)"
---

# ADR-0335: Level Editor Brush Option 01 sets the native production brief

## Context

The ADR-0334 review presented sixteen native 64×64 PixelLab exploration
candidates in the registered Brush button at its existing 18×18 calibration
size. The owner selected Option 01: a broad pale-bristled paintbrush with a
brass ferrule and warm wooden handle, running from lower left to upper right.
The selected exploration bytes are PixelLab object
`1fc78870-e355-4b1f-8012-7c0193bc8121`, frame 0, SHA-256
`abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a`.

PixelLab's direct object and edit generators enforce a 32px minimum, so they
cannot emit the required 18×18 runtime frame directly. Shipping the browser's
downscale would violate ADR-0076.

## Decision

- Option 01 owns the production motif: lower-left-to-upper-right orientation,
  broad pale bristles, compact brass ferrule, warm carved-oak handle, and an
  immediately paintbrush-like silhouette.
- The Level Editor Brush production role is one 18×18 transparent PNG drawn
  1:1 in `inner-brush-tool`. Its opaque bounds preserve at least one fully
  transparent pixel on all four frame edges. The adjacent button owns the
  accessible name, so media alt text is empty.
- The supported native-generation handoff uses PixelLab inpainting on a 32×32
  transparent canvas. A centered generation mask may be tightened within the
  centered 18×18 production box to guarantee its transparent outer gutter.
  The final asset is the exact 18×18 center crop; cropping is allowed, and no
  spatial resampling may occur after generation.
- The 64×64 Option 01 pixels may be resized only as the inpainting composition
  reference. The accepted pixels must differ from that resized calibration
  input and record the PixelLab job, exact prompt, 32px generator output hash,
  crop geometry, 18px output hash, alpha bounds, and edge-alpha result.
- `ui/kit/icons/brush.png` is a closed typed slot. Acceptance requires the
  `level-editor-tool-icon` / `brush` runtime projection, exact 18×18 intrinsic
  and draw geometry, native-evidence schema
  `level-editor-brush-icon-native-v1`, and exact-byte owner proof schema
  `level-editor-brush-icon-exact-byte-proof-v1`.
- Final review mounts the private candidate in the real Level Editor route as
  `?brushIconReviewVersion=<version-id>`. The Pencil remains installed until
  the owner verifies those final native pixels and the compare-and-swap
  acceptance succeeds.

The resulting owner-review candidate was authored by PixelLab job
`dafc4354-aaee-4856-b95a-89d20f74b923`, then cropped without resampling from
the 32×32 generator output. Its 18×18 PNG SHA-256 is
`ffbee3bb9cb38bde805e07ea208321702d95c91539700dd952c6ff2c054b4965`;
its opaque bounds are exactly `{x: 1, y: 1, width: 16, height: 16}`, with zero
alpha on every frame edge.

## Consequences

- The chosen visual direction survives, but final pixel decisions are authored
  for the footprint players actually see.
- A generic UI-kit candidate, a 64px downscale, clipped brush, stale review, or
  mismatched slot pointer cannot become the Level Editor Brush.
- Review remains possible before activation without exposing candidate bytes on
  a public runtime URL.
