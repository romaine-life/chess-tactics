---
status: "accepted"
date: 2026-07-10
deciders: Nelson, Codex
---

# ADR-0071: Accepted chrome rails are native-size directional families

## Context and Problem Statement

Chrome Lab exposed a useful source-scale readout after ADR-0070. That readout
revealed that every selectable rail candidate was being substantially reduced at
runtime. The installed outer rail rendered a `95px` source canvas at `12px`
(`13%`), while the installed inner rail rendered a `74px` source canvas at `7px`
(`10%`). No selectable rail rendered near its source size.

The source category was also incorrect. Several files labeled as rails were
actually two-edge panel strips with an opaque center. The runtime treated the
entire mini-panel as one rail and compressed it into the target thickness. That
made small pixel-phase differences highly visible and defeated the purpose of
separate rail, atom, fill, and contents controls.

## Decision Drivers

- Pixel art should be manufactured at its installed pixel size.
- Failed generation must be rejected, not repaired through resizing.
- Horizontal and vertical rails have different lighting and raster behavior.
- Corner atoms cover rail overlap; atoms must remain independent art.
- Repeat-safe and long organic rails are both useful, but have different runtime
  contracts.
- The isolated Rail Lab is the approval surface before live Chrome Lab use.

## Decision Outcome

Chosen: **an accepted chrome rail is a native-size directional family, not an
arbitrary image scaled into a border**.

The role specifications are measured by the accepted family that is actually
installed, not by a temporary Chrome Lab slider value. Current admitted families:

- `outer-titlebar-forged-native-v1`: `14px` native rail thickness;
- `inner`: `7px` native rail thickness.

An installed rail source must have a short canvas axis exactly equal to its role
or family thickness and render at `100%` on the short axis. Production defaults
may not upscale or downscale that source. Chrome Lab may temporarily preview
another thickness to discover a better target, but that state is a generation
request, not an acceptable installed family.

A rail family supplies orientation-specific artwork. At minimum it contains one
horizontal and one vertical source; it may contain distinct `top`, `right`,
`bottom`, and `left` sources. The runtime must not rotate a horizontal bitmap to
manufacture the vertical rail. All four rail runs overlap beneath independent
corner atoms. Rail sources never contain corner atoms, end caps, junction atoms,
panel fill, or a second parallel edge.

Geometric compatibility does not establish family membership. Family records
must name exact admitted source IDs for each direction and must record an
assembled `100%` visual review. Attempt-level, provider-level, role-level, and
palette-distance grouping are prohibited. An admitted source without a reviewed
counterpart remains an unpaired candidate and does not appear in the family
picker.

Two fit contracts are permitted:

- `repeat`: a native-size tile whose opposing endpoints pass the seam gate;
- `long`: native-size artwork long enough for its declared consumer range, used
  at 1:1 and cropped only at covered endpoints. It is never stretched.

Outer chrome should prefer the `long` contract. The outer frame is a
high-importance, low-count structural element with enough screen real estate to
carry authored scratches, bevel variation, and material detail. A small repeated
tile can make that frame read as wallpapered or mechanically stamped instead of
crafted. Long-authored rails preserve intentional variation and avoid seam
anxiety; independent atoms cover endpoint overlap.

Outer `repeat` families are acceptable as prototypes, fallbacks, or explicit
human-approved exceptions, but they are not the default target for new outer
chrome art. Inner chrome may prefer simple `repeat` rails because inner controls
appear frequently, need quieter visual weight, and benefit from a restrained
pipe-like treatment.

Generated sheets and review packs are attempts, not candidates. Admission uses
fixed-coordinate crop or transparent-canvas trim only. Resizing, resampling,
interpolation, seam repair, and clipping painted pixels are prohibited. The gate
checks exact output dimensions, out-of-lane spill, continuous rail coverage,
painted thickness, and repeat seams. A failed attempt remains provenance or is
discarded; it does not enter the picker.

When a generator cannot produce non-square isolated objects reliably, one
cohesive transparent family sheet may be generated against fixed horizontal and
vertical lane scaffolds. Each rail is then admitted only through its predefined
lane at `1:1`; the sheet is rejected as a unit for out-of-lane paint, broken
coverage, or failed seams. The lane scaffold is not permission to resize or
repair generated artwork.

All previously selectable rail candidates are retired. Replacements enter Rail
Lab first at `100%`, and only a human-approved family is promoted to Chrome Lab
and live consumers. Rail Lab selects a family, previews its horizontal and
vertical members together as an atomless box, and keeps candidate cycling scoped
to one orientation inside that family. Divider rails continue to inherit the
approved outer horizontal rail; divider atoms remain independent.

## Consequences

- Good: installed pixel art has a stable one-source-pixel to one-screen-pixel
  relationship.
- Good: left/right rails no longer depend on rotating and resampling horizontal
  artwork.
- Good: a failed generator cannot silently become a candidate through a resize
  helper.
- Good: the source picker stops mixing panels, rails, and paired edges.
- Cost: generation may produce no accepted result. That is an honest failure and
  requires another generation attempt or a new target, not a code workaround.
- Cost: rail families require more source files than one rotatable strip.

## More Information

- Amends [ADR-0070](0070-chrome-frame-geometry-is-derived-not-authored-state.md):
  rendered rail thickness remains visible authored state during exploration, but
  accepted installed art must match it natively.
- Builds on [ADR-0066](0066-title-bar-rule-is-a-forged-tileset.md): orientation-lit
  horizontal ledges and vertical walls are distinct assets.
- Enforced by `frontend/scripts/import-native-rail-attempt.mjs`,
  `frontend/scripts/screen-native-rail-directory.mjs`, and the checked family
  composition in `frontend/config/native-rail-families.json`.
