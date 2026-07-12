# Wall Art Concept Sources

Wall art source sprites are separate transparent assets mounted on wall art in the
Studio preview. They are not wall material variants and do not change the wall
geometry bake. Non-mirror sources render as ordinary mounted sprites. A source whose
`kind` is `mirror` is instead an assembly of generated frame/glass material and the
canonical exact one-to-one live piece-reflection primitive required by
[ADR-0086](../../adr/0086-all-perimeter-walls-use-full-height-geometry.md) and the
wall-face support and grounded semantic line-of-sight proof in
[ADR-0085](../../adr/0085-mirror-surfaces-end-at-the-wall-floor-boundary.md).

## Active Set

- Original run record: `docs/art/wall-art-concepts/runs/wall-decor-runs-2026-07-06.json`
- Mirror anchor-pack run: `docs/art/wall-art-concepts/runs/wall-mirror-runs-2026-07-11.json`
- Contact sheet: `docs/art/wall-art-concepts/wall-decor-contact-sheet.png`
- Runtime proof: `docs/art/wall-art-concepts/proofs/wall-decor-runtime-proof.png`
- Mirror/material matrix: `docs/art/wall-art-concepts/proofs/mirror-wall-material-proof.png`
- Mirror layer split: `docs/art/wall-art-concepts/proofs/mirror-layer-split-proof.png`
- Grand Gallery full-unit fit proof: `docs/art/wall-art-concepts/proofs/mirror-full-unit-fit-proof.png`
- Grand Gallery versioned generated source:
  - active raw: `docs/art/wall-art-concepts/codex/mirror-grand-gallery-grounded-wide-raw.png`
  - active alpha: `docs/art/wall-art-concepts/codex/mirror-grand-gallery-grounded-wide-alpha.png`
  - first grounded-height edit evidence: `docs/art/wall-art-concepts/codex/mirror-grand-gallery-grounded-{raw,alpha}.png`
  - prior raised-fit evidence: `docs/art/wall-art-concepts/codex/mirror-grand-gallery-tall-{raw,alpha}.png`
- General aperture-capacity audit input: accepted navy west rook, immutable sprite hash
  `8ed72569b70f3bd56d47d92222cd839f34f1b22523336b09d9fd98c36e41e63b`, archived as
  `docs/art/wall-art-concepts/proof-inputs/accepted-rook-navy-west-8ed72569.png`
- Exact-seat proof inputs from live catalog revision 842:
  - limiting reflected navy rook/north-east, hash
    `c396999a1cec31c94311548d47e662f61634132b82b8acb59e287cfc012e8356`, archived as
    `docs/art/wall-art-concepts/proof-inputs/accepted-rook-navy-north-east-c396999a.png`
  - west-face physical navy rook/south-east, hash
    `bbeeef7ea117a79e897ce3ec3d10ab51c887839e83c6a15ce877b32775a09ee0`, archived as
    `docs/art/wall-art-concepts/proof-inputs/accepted-rook-navy-south-east-bbeeef7e.png`
  - north-face physical navy rook/north-west, hash
    `f73fc4a08bb05269c4aacaa0675ec8f0fe70515361589055ea668978aac69e5b`, archived as
    `docs/art/wall-art-concepts/proof-inputs/accepted-rook-navy-north-west-f73fc4a0.png`
  - semantic wall-crossing navy knight/west, hash
    `f40b46bb3e70bf3378fc29a8a06f85371a4fd278b160e069a6fb494e71ee7343`, archived as
    `docs/art/wall-art-concepts/proof-inputs/accepted-knight-navy-west-f40b46bb.png`
- Runtime assets:
  - `frontend/public/assets/wall-decor/banner-tattered.png`
  - `frontend/public/assets/wall-decor/banner-tattered-west.png`
  - `frontend/public/assets/wall-decor/banner-tattered-north.png`
  - `frontend/public/assets/wall-decor/relief-pawn.png`
  - `frontend/public/assets/wall-decor/relief-pawn-west.png`
  - `frontend/public/assets/wall-decor/relief-pawn-north.png`
  - `frontend/public/assets/wall-decor/relief-rook.png`
  - `frontend/public/assets/wall-decor/relief-rook-west.png`
  - `frontend/public/assets/wall-decor/relief-rook-north.png`
  - `frontend/public/assets/wall-decor/lantern-brass.png`
  - `frontend/public/assets/wall-decor/lantern-brass-west.png`
  - `frontend/public/assets/wall-decor/lantern-brass-north.png`
  - `frontend/public/assets/wall-decor/mirror-keep.png`
  - `frontend/public/assets/wall-decor/mirror-keep-west.png`
  - `frontend/public/assets/wall-decor/mirror-keep-north.png`
  - `frontend/public/assets/wall-decor/mirror-keep-west-glass.png`
  - `frontend/public/assets/wall-decor/mirror-keep-north-glass.png`
  - `frontend/public/assets/wall-decor/mirror-court-oval.png`
  - `frontend/public/assets/wall-decor/mirror-court-oval-west.png`
  - `frontend/public/assets/wall-decor/mirror-court-oval-north.png`
  - `frontend/public/assets/wall-decor/mirror-court-oval-west-glass.png`
  - `frontend/public/assets/wall-decor/mirror-court-oval-north-glass.png`
  - `frontend/public/assets/wall-decor/mirror-chapel-glass.png`
  - `frontend/public/assets/wall-decor/mirror-chapel-glass-west.png`
  - `frontend/public/assets/wall-decor/mirror-chapel-glass-north.png`
  - `frontend/public/assets/wall-decor/mirror-chapel-glass-west-glass.png`
  - `frontend/public/assets/wall-decor/mirror-chapel-glass-north-glass.png`
  - `frontend/public/assets/wall-decor/mirror-witch-eye.png`
  - `frontend/public/assets/wall-decor/mirror-witch-eye-west.png`
  - `frontend/public/assets/wall-decor/mirror-witch-eye-north.png`
  - `frontend/public/assets/wall-decor/mirror-witch-eye-west-glass.png`
  - `frontend/public/assets/wall-decor/mirror-witch-eye-north-glass.png`
  - `frontend/public/assets/wall-decor/mirror-grand-gallery.png`
  - `frontend/public/assets/wall-decor/mirror-grand-gallery-west.png`
  - `frontend/public/assets/wall-decor/mirror-grand-gallery-north.png`
  - `frontend/public/assets/wall-decor/mirror-grand-gallery-west-glass.png`
  - `frontend/public/assets/wall-decor/mirror-grand-gallery-north-glass.png`
- Runtime manifest: `frontend/public/assets/wall-decor/manifest.json`
- Canonical catalog manifest: `packages/board-render/src/ui/design/wallDecorManifest.json`

## Pipeline

1. PixelLab `create_tiles_pro` produced wall-art reference strips for flag and
   relief motifs. Those outputs are archived under
   `docs/art/wall-art-concepts/pixellab/`.
2. Codex img2img generated standalone wall-mounted sprites from the references.
   The forge script verifies `image_generation_call` in the Codex rollout and
   removes the chroma-key background:

```powershell
node frontend/scripts/forge-wall-decor.mjs
```

The 2026-07-11 mirror anchor pack uses the existing pawn/rook relief and brass
lantern sources strictly as pixel-clustering and material references. The
three-wall `mirror-grand-gallery` uses `mirror-keep` in the same style-reference
role and is authored as one panoramic frame and aperture, never tiled mirrors.
The generated blue-silver or charcoal glass, foxing, and broad highlight are material inputs, not
finished opaque runtime backing and not a substitute for reflection. Each mirror's
asset pipeline owns a frame-aligned, inspectable glass aperture; runtime clips the
canonical live piece reflection through it between the generated `glassSrc`
underlay and the clear-aperture frame foreground. Frame, glass, and reflection are
then clipped together to the union of their actual wall-face support segments, whose
lower edge is the generated wall's projected back-edge/floor seam. This makes the
boundary tile occlude all below-seam mirror pixels. Aperture shape is versioned
with the source asset rather than stored as arbitrary live Wall Art geometry. The five
anchors are `mirror-keep`, `mirror-court-oval`, `mirror-chapel-glass`, and
`mirror-witch-eye`, plus `mirror-grand-gallery`. Keep, Court, Chapel, and Gallery
use planar material styling; Witch's Eye keeps its convex-looking generated glass
styling. Every variant uses the same exact live reflection position and 1:1 physical-unit
raster size. Grand Gallery declares `mirrorCoverage: "full-body"`: its panoramic frame
and aperture use the canonical full-height wall's relief to contain the tallest accepted
unit at its exact reflected floor anchor on both faces. Keep, Court, Chapel, and Witch's
Eye declare `mirrorCoverage: "authored-crop"` and retain their intentionally small
authored apertures, which may crop the unchanged live raster. No
variant changes the logical wall plane or supporting-cell coverage. There is deliberately
no decorative/off mirror mode and no FOV, depth-compression, or subject-scale fit. See
[ADR-0086](../../adr/0086-all-perimeter-walls-use-full-height-geometry.md).

The grounded Grand Gallery is a two-step, non-destructive built-in `image_gen` edit.
The first edit extends the earlier raised-fit source upward while holding the entire
bottom rail and lower corner bosses fixed. The second extends only the uninterrupted
horizontal span so the source matches its three-wall projected aspect without stretching.
All earlier `mirror-grand-gallery-{raw,alpha}.png` and `mirror-grand-gallery-tall-{raw,alpha}.png`
pairs remain as historical evidence; the build explicitly selects
`mirror-grand-gallery-grounded-wide-alpha.png`.

The active generated alpha bbox is 1002x1167 (0.8586:1). Its normalized 216x252 frame
projects to 144x168 (0.8571:1), a 0.18% relative aspect deformation. The authored
`u=.05..95, v=.04..96` opening keeps thin generated rails while supplying 154.56px of
vertical glass on either projected face. Mount Y 215 preserves a 30px generated
mount-to-bottom-rail datum; face-specific mounts project to runtime mount Y 152.

The runtime placement is grounded at slot `y=72`, rather than the retired `y=-4` fit
workaround. Two independent deterministic gates now run. The exact-virtual gate places
the limiting reflected rook/north-east raster at face-local origins `(16.500,69.515)`
west and `(70.500,69.515)` north with no search, scaling, or fitting displacement. The
semantic LOS gate rasterizes the pinned accepted navy knight/west physical draw and
translates all 1121 opaque destination pixels along grid X or grid Y to the wall plane.
At the generated back-edge seam, west reports 1007 hits through supported glass plus 114
floor-occluded hits, and north reports 1004 through supported glass plus 117
floor-occluded hits. Both faces account for all 1121 pixels with no outside-glass,
unsupported, or invalid failures. Floor-occluded pixels are expected wall topology, not
glass passes. The same supporting-segment union is the runtime mask for frame, glass, and
reflection. `frontend/scripts/check-imagegen-gate.mjs`, which runs in the normal frontend
check, repeats the pinned-source hashes, grounded slot, virtual-raster containment,
semantic wall-crossing classification, shared support seam, and tall-wall bounds.

3. The build script trims and frames the transparent sources into stable runtime
   PNGs and projects each sprite onto its wall-face slope. Grand Gallery projects west once and
   derives north as its pixel-exact horizontal counterpart per ADR-0087; other assets retain
   their authored projection policy. The bake splits every projected mirror into an aperture-only
   `*-glass.png` underlay
   plus a clear-aperture frame foreground. It then writes the runtime and
   canonical package manifests and creates proof/contact sheets:

```powershell
python frontend/scripts/build-wall-decor.py
```

The game catalog previews both face variants over a wall sample for review, but
runtime placement chooses the face matching the placed wall. Gallery face mounts
attach inside its first occupied segment: west grows down-left and north grows
down-right across the declared three-wall span. The assets remain independent
transparent sprites and mount by the chosen face's `mountX` / `mountY` without
rebaking wall materials. Gallery manifest preview targets are the actual runtime
slots `(42,72)` west and `(84,72)` north. It carries no wall-geometry selector; every
supporting segment already uses the canonical 128x336 full-height wall. The placed
142x240 mirror face canvas begins at local y=16 and stays inside the three supporting
wall frames while its lower rail meets the
projected wall/floor datum. Any generated source pixels that cross that datum are hidden
by the shared wall-face support mask rather than painted over the boundary tile.
