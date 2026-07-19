---
status: "accepted; whole-board scene-alignment exception added by ADR-0118"
date: 2026-07-10
deciders: Nelson
partially_superseded_by: "[ADR-0118](0118-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md)"
---

# ADR-0076: Scaling is calibration — accepted production art is regenerated at native 1×

## Context and Problem Statement

Scaling is useful while making art. A large candidate can be placed in the game,
shrunk until its silhouette and visual weight feel right, and compared quickly
without spending another generation. That makes scale an effective **calibration
instrument**.

The failure is treating that tuned, scaled candidate as finished production art.
A downscale does more than change size: its resampler decides which edges, colors,
and details survive. The asset can look acceptable while the browser continues to
serve pixels authored for a different footprint, and the source never receives a
real pixel-art pass at the size players actually see.

[ADR-0040](0040-feature-tiles-own-geometry-generate-material.md) does not answer
this question. It decides who owns visible pixels — deterministic code may own
geometry while generated/source art owns material and color — but says nothing
about generation resolution, offline resampling, or live display scale. The fence
pass exposed that gap: it satisfies ADR-0040 provenance while shrinking generated
post subjects from `418×1173` to `10×28` and `590×808` to `18×24`, and shrinking
wood/stone materials to `48×48` before the production bake.

[ADR-0075](0075-unit-directions-are-blender-authored.md) subsequently established
a useful accepted-sprite recapture instrument but permitted its spatially resampled
output to become production art. That production-acceptance clause conflicts with
the native-pixel rule here. Recapture remains valid for calibration and provenance;
its resized output is not eligible for acceptance.

## Decision Drivers

- Pixel decisions must be made at the footprint players see, not delegated to a
  resampling filter.
- Studio scale controls must remain useful for fast visual calibration.
- "Accepted" must mean something stronger than "a scaled preview looked good."
- Runtime code, database scale values, and transparent padding must not become
  loopholes for shipping a mismatched source resolution.
- The rule must coexist with deterministic masks/composition, atlases, 9-slice
  assembly, device pixel ratios, and whole-scene user zoom.
- Production acceptance must leave machine-checkable evidence.

## Considered Options

- **A. Accept live-scaled source art.** Keep one large source and let CSS, canvas,
  or per-asset database scale produce every smaller role.
- **B. Bake the tuned downscale offline.** Resize the large candidate once, serve
  the resized PNG 1:1, and call the runtime asset native.
- **C. Scale to calibrate, then regenerate at the approved pixel contract.** Use
  the tuned preview to choose dimensions, then generate/render/forge the accepted
  pixels at those dimensions and serve them 1:1.

## Decision Outcome

Chosen: **C. Scaling is calibration; accepted production art is regenerated at
native 1×.** A candidate may be scaled as much as needed to find the right visual
footprint. The chosen footprint then becomes the specification for a new native
generation/render/export. The scaled candidate itself cannot be accepted.

### A. Canonical 1× and the required pixel contract

**Canonical 1×** is the asset role's authored baseline in app logical pixels,
before camera zoom, user inspection zoom, browser zoom, OS scaling, or device-pixel
ratio transforms.

Before acceptance, every raster asset role declares a required pixel contract:

- runtime frame width and height;
- visible/opaque subject footprint at 1×;
- anchor/contact point and transparent gutters;
- animation-frame or atlas rect dimensions, when applicable;
- the exact 1× draw dimensions used by DOM or canvas consumers.

The opaque subject matters as much as its transparent frame. Padding a downscaled
`10×28` post into a `96×180` image does not make the post native `96×180` art.

### B. Scaling is allowed before acceptance

Studio sliders, CSS transforms, canvas destination sizes, and offline resize tools
may be used to compare candidates and settle the required footprint. Those outputs
are **calibration candidates**. A scale value may be saved as the next generation's
brief, but it is not production acceptance metadata.

An acceptance action must not merely publish the candidate's current scale. It
must hand the approved footprint to a generation/render/export step and review the
resulting native pixels.

### C. Regenerate; do not resample into production

After calibration, regenerate, re-render, re-forge, or re-author the asset at the
required subject footprint and frame density. For sourced art, make a native-pixel
export/treatment from the source rather than spatially resizing the tuned candidate.

The accepted path contains **no spatial resampling step** used to reach the target:
no LANCZOS, bicubic, bilinear, nearest-neighbor, CSS scale, canvas destination
downscale, or asset-local runtime `scale < 1`. Nearest-neighbor is still scaling;
`image-rendering: pixelated` is not an exemption.

The following are allowed when they preserve authored pixels 1:1 and comply with
the other art ADRs:

- crop and translation;
- transparent padding and anchor seating;
- chroma-key removal, despill, and alpha hardening;
- palette cleanup that does not move pixels;
- masking, mirroring, compositing, and tiling without resampling;
- deterministic geometry under ADR-0040, using material pixels already authored
  at the required texel density;
- atlas packing without resizing its sprite rects.

### D. Production consumes the asset 1:1

At canonical 1×, one accepted source pixel maps to one app logical output pixel.
The intrinsic frame/atlas rect and the DOM or canvas draw rect therefore agree.
Asset-local CSS transforms, `drawImage(..., dw, dh)`, database display scales, and
pre-bake resizing cannot correct production art whose pixels were authored for a
different size.

If one subject has genuinely different production roles, each role needs a native
variant or a separately accepted asset family. A `64px` icon shown as `36px` is not
a universal master; the `36px` role needs pixels authored for `36px`.

### E. Narrow compositor exceptions

These are view/composition behavior, not ways to accept a mismatched asset:

- whole-scene camera zoom, temporary Studio inspection zoom, browser/OS
  accessibility zoom, and user-selected board zoom;
- device-pixel-ratio-specific native exports (`1x`, `2x`, etc.); a `2x` export does
  not remove the required `1x` asset;
- declared 9-slice/tiled repeat regions, while corners, caps, rail thickness, and
  other fixed authored details remain native;
- explicitly authored animation transforms that do not exist to repair the
  asset's baseline size.

Any further exception requires another ADR; it cannot be introduced in a bake
script or CSS rule.

### F. Acceptance evidence and enforcement

An asset cannot be marked `accepted` or `production` until its family records and
checks:

1. the calibrated target frame, subject footprint, anchor, and 1× draw rect;
2. the generator/render/export dimensions that produced the accepted pixels;
3. provenance showing no spatial resampling between that output and the runtime
   asset;
4. a machine assertion that intrinsic frame/atlas dimensions equal the 1× runtime
   draw contract and that asset-local baseline scale is `1`;
5. an in-app 1× proof reviewed at the actual role and background.

Family-specific CI guards may compare dimensions, opaque bounds, manifests, and
translate/pad-only pixel identity. A provenance guard such as ADR-0040's fence-art
check is necessary but is **not** a native-size acceptance gate.

### G. Relationship to existing decisions

- **Refines ADR-0011 and ADR-0040:** those govern generation/provenance and pixel
  ownership; this ADR governs resolution and production acceptance.
- **Makes ADR-0014's native-footprint rule global and exact.**
- **Generalizes ADR-0039, ADR-0048, and ADR-0063:** their native 1:1/no fractional
  downscale rules become the default for all production pixel art.
- **Supersedes ADR-0026 §D's multi-context live downscale allowance.** Its `64×64`
  canvas and safe-area decisions remain accepted; smaller roles need native assets.
- **Supersedes ADR-0027 §C.1 and its LANCZOS "re-pack, not re-forge" method.** Its
  optical-keyline decisions remain accepted.
- **Supersedes the production-scaling part of ADR-0061.** Prop scale remains a
  calibration instrument; a tuned production footprint requires a native re-render.
- **Refines ADR-0073:** unit display scale may calibrate candidates, but an accepted
  unit family must be regenerated for the published footprint and resolve to native
  baseline scale rather than relying on a live correction.
- **Supersedes ADR-0075's production recapture acceptance clause.** Its Blender-owned
  orientation, complete-family source requirement, aspect-preserving premultiplied
  recapture method, and provenance remain accepted as calibration. The recaptured
  raster itself cannot become the accepted family; its target dimensions must feed
  a native Blender render that passes this ADR's evidence gate.

### H. Migration and current debt

Existing non-native assets are not grandfathered into acceptance. They may remain
live temporarily only as explicitly labeled **calibration/legacy bridges**, never
as evidence that downscaling is allowed. Replacing or materially modifying one
must satisfy this ADR.

The first named bridge is the current fence family:

- generated wood and stone posts are heavily downscaled into their visible runtime
  footprints;
- both rail materials are resized to `48×48` before being masked into the final
  frames;
- the final `96×180` files are served 1:1, but that does not undo the earlier
  resampling.

Native fence materials and posts must be regenerated before the family is marked
accepted production art. The migration inventory also includes multi-context
`64px` icons, unit/prop/doodad families with asset-local production scales, and any
other bake that spatially resizes generated pixels.

Adoption ships with one explicit enforcement debt. Unit-art migration 17 records a
server-owned, monotonic `spatial-resampling` block for accepted-sprite recaptures;
the backend refuses to accept or restore those candidates even if their editable
method/notes are later changed. The positive native-evidence schema for arbitrary
manual unit uploads is not yet first-class, so absence of that block is not by
itself proof of ADR-0076 compliance. Until that schema and generator handoff land,
an admin acceptance action still requires the external native render manifest and
1× proof; it cannot legitimize a resampled raster. This debt does not reinstate
ADR-0075's recapture-acceptance allowance.

### Consequences

- Good: the reviewed 1× preview and shipped pixels are the same pixel decisions.
- Good: scale controls stay useful, but their output becomes an exact regeneration
  brief instead of silent production debt.
- Good: "production" becomes mechanically distinguishable from "looks okay when
  shrunk."
- Cost: one more generation/render pass after visual sizing is settled.
- Cost: roles at different sizes need native variants, increasing generation work
  and storage.
- Cost: current live-scaled families become named migration debt.

## Pros and Cons of the Options

### A. Accept live-scaled source art

- Good: fastest iteration and one reusable source.
- Bad: the browser/filter owns final pixel decisions; visual density drifts by
  role; oversized assets are served; candidate and production are indistinguishable.

### B. Bake the tuned downscale offline

- Good: the runtime can draw the resulting file 1:1.
- Bad: resampling still authored the final edges and detail. A native-sized frame
  disguises rather than fixes the non-native source.

### C. Calibrate, then regenerate at native 1×

- Good: keeps rapid tuning while ensuring accepted pixels were intentionally made
  for their real role; supports meaningful automated acceptance gates.
- Bad: requires another generation/export and review cycle after tuning.

## More Information

- Consolidated rule: [asset-generation-contract.md](../asset-generation-contract.md).
- Fidelity vocabulary: [ui-chrome-vocabulary.md](../ui-chrome-vocabulary.md).
- Triggering family and provenance: [fence-concepts/SOURCES.md](../art/fence-concepts/SOURCES.md).
- Related decisions: [ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md),
  [ADR-0039](0039-tile-top-and-side-are-composable-layers.md),
  [ADR-0040](0040-feature-tiles-own-geometry-generate-material.md),
  [ADR-0063](0063-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md),
  [ADR-0073](0073-unit-art-is-live-storage-backed-content.md), and
  [ADR-0075](0075-unit-directions-are-blender-authored.md).
