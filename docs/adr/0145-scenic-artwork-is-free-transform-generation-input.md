---
status: "accepted; editor nudge clause superseded by ADR-0146; board-coordinate/contact-depth clauses superseded by ADR-0147"
date: 2026-07-22
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0146](0146-scenic-artwork-reuses-object-selection-and-axis-sliders.md), [ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md)"
---

# ADR-0145: Scenic artwork is free-transform generation input

## Context and Problem Statement

The Level Editor already turns installed structure source artwork into authored
props and doodads. Those definitions intentionally carry gameplay and placement
policy such as footprints, terrain eligibility, blocking, and contact geometry.
For pre-drawn board composition, an author also needs to place the installed
source pixels directly: a house, rock, windmill, or similar reference object
should be movable and scalable without first creating or locating a prop or
doodad definition.

A flat rotation of one raster is not a substitute for turning a 3D object. The
project already has a canonical eight-direction vocabulary for unit art and can
store distinct live-media roles for each view.

## Decision Outcome

`EditorBoard` gains an optional scenic-artwork collection. Each placement owns a
stable instance id, an installed structure source-art id, continuous board-space
`x` and `y`, one canonical eight-way `Direction`, and a positive per-instance
scale.

Scenic artwork:

- references DB-installed drawable records and Blob-owned media directly;
- is independent of prop and doodad definitions and does not change either
  creation workflow;
- is losslessly persisted in `boardCode`, but is never projected into gameplay
  terrain, collision, blocking, or `Level.layers`;
- uses continuous canonical board coordinates. Its contact anchor determines
  normal board depth, so there is no authorable or persisted `z`;
- rotates only by selecting a complete direction-specific source frame. The
  renderer never uses planar image rotation and never silently substitutes a
  different direction when a selected direction is unavailable;
- may scale per instance because it is source/reference composition input.
  This does not relax ADR-0076 for accepted runtime art: the resulting accepted
  pre-drawn plate still ships at its native approved pixels;
- appears in the canonical pre-drawn generation reference and semantic packet
  as explicitly visual-only artwork; and
- is suppressed, along with other baked scene layers, after a pre-drawn plate is
  installed. Its editor layer is locked while that plate is active so logical
  reference state cannot drift behind baked pixels.

An installed structure drawable may expose `back` and `front` as its south/default
view and may additionally expose paired `<direction>-back` and
`<direction>-front` media roles. A direction is offered only when both halves
exist with valid, matching raster geometry. Per-direction anchor and scale
metadata may override the record's default placement geometry.

The owner-operable Level Editor instrument consists of:

- an **Artwork** source shelf populated from installed structure source art;
- direct placement anywhere on the authored visual board;
- click selection and direct continuous dragging;
- numeric `x`/`y` fields plus nudge controls;
- direction selection limited to the source's installed views;
- scale control; and
- duplicate and delete actions.

Missing installed media omits the pixels honestly while preserving the persisted
placement for repair. No compiled fallback inventory or repository-owned media
is introduced.

## Consequences

- A Blender render set can become useful board-composition input without first
  becoming a gameplay object.
- Houses, rocks, trees, and future structures can share the same directional
  contract as units while keeping their own source-art catalog.
- Scenic placement gains free `x`/`y` composition without creating a second
  projection or depth system.
- Prop/doodad behavior remains explicit and unchanged; choosing direct artwork
  deliberately gives up their gameplay semantics.
- Pre-drawn references can communicate stronger object silhouettes to img2img,
  while accepted plates remain one continuous runtime image.

## More Information

- Refines [ADR-0071](0071-the-deliverable-is-the-instrument.md),
  [ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md),
  [ADR-0098](0098-authored-board-extends-beyond-playable-grid.md),
  [ADR-0106](0106-installed-content-is-database-owned.md),
  [ADR-0120](0120-predrawn-reference-is-canonical-and-gridless.md), and
  [ADR-0142](0142-owner-authored-frame-defines-predrawn-generation-reference.md).
- Storage and promotion remain governed by
  [ADR-0085](0085-runtime-assets-are-live-storage-backed.md).
