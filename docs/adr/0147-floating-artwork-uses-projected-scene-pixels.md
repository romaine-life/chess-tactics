---
status: "accepted; Level Editor placement and interaction clauses superseded by ADR-0148"
date: 2026-07-23
deciders: Nelson, Codex
supersedes: ADR-0145 board-coordinate/contact-depth clauses and ADR-0146 seated-target/bounded-axis clauses
partially_superseded_by: "[ADR-0148](0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md)"
---

# ADR-0147: Floating artwork uses projected scene pixels

## Context and Problem Statement

ADR-0145 made installed source art directly placeable without creating a prop
or doodad, but attached every instance to a continuous board coordinate and
used that contact point for scene depth. ADR-0146 removed the invented visible
placement diamond, yet still seated selection and axis bounds against the
board.

That attachment is unnecessary for image-to-image composition. An author needs
to position the source pixels visually, including between or beyond tiles,
without implying a tile, footprint, contact point, or depth-bearing game object.

## Decision Outcome

Direct source-art instances are **floating artwork**. Each instance persists:

- a stable instance id and installed structure source-art id;
- integer `pixelX` and `pixelY`, denoting the image center in canonical
  unzoomed projected-scene pixels;
- one installed canonical rendered direction; and
- a positive per-instance source-composition scale.

Floating artwork has no board coordinate, tile, anchor cell, footprint, contact
point, terrain eligibility, collision, gameplay projection, or authorable
depth. It renders above the authored board scene in collection order. This
ordering is visual composition state and does not create gameplay semantics.

The Level Editor:

- creates an instance at the exact pointer pixel on the existing playable or
  scenic board hit surface;
- selects it through a transparent hit target centered on the image;
- drags it by direct screen-pixel delta divided by the current board zoom,
  without grid projection or snapping;
- exposes X px and Y px as slider-plus-integer-number rows, alongside Scale;
- keeps duplicate, delete, and installed-direction controls; and
- leaves floating artwork unchanged when tactical board dimensions or their
  cell addresses are resized or shifted.

Canonical projected-scene pixels travel with the board through ViewPane pan and
zoom and through the saved pre-drawn generation frame. They are not browser CSS
pixels, device pixels, transient viewport coordinates, or world/tile
coordinates.

The `EditorBoard.floatingArtwork` channel and board-code wire key `fa` replace
the retired board-space `scenicArtwork`/`sa` channel. The old channel is not
decoded or migrated. The generation semantic packet names the center
`positionPx` and keeps `gameplay: none`.

Directional media, live-storage ownership, missing-media behavior, per-instance
scale, generation-reference inclusion, pre-drawn locking, and suppression after
a plate is installed remain as decided by ADR-0145.

## Consequences

- Source pixels can be freely composed without inventing placement geometry.
- Drag and exact numeric adjustment describe the same scene-pixel state.
- Board resizing cannot unexpectedly move or delete floating art.
- Floating artwork deliberately overlays normal board depth; an author who
  needs collision, terrain rules, or depth-seated occlusion must use the
  existing prop or doodad systems.
- The storage cutover is intentionally incompatible with the unreviewed
  board-attached prototype; there is no parallel legacy path.

## More Information

- Partially supersedes
  [ADR-0145](0145-scenic-artwork-is-free-transform-generation-input.md) and
  [ADR-0146](0146-scenic-artwork-reuses-object-selection-and-axis-sliders.md).
- Reuses the projected coordinate conventions in
  [ADR-0142](0142-owner-authored-frame-defines-predrawn-generation-reference.md).
- Persistence and media resolution remain governed by
  [ADR-0085](0085-runtime-assets-are-live-storage-backed.md) and
  [ADR-0106](0106-installed-content-is-database-owned.md).
