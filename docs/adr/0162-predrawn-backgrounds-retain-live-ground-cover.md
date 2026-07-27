---
status: "accepted"
date: 2026-07-20
deciders: Nelson, Codex
partially_supersedes: "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)'s ground-cover suppression, authoring lock, and geometry-lineage clauses"
---

# ADR-0162: Pre-drawn backgrounds retain live ground cover

## Context

ADR-0158 correctly made an immutable pre-drawn raster the authority for baked
environment pixels, but it also classified ground cover as part of that baked
environment. That disabled the existing Cover tool, hid already-authored cover,
and made a cover-only edit invalidate an otherwise unchanged background and
occlusion lineage. Ground cover was already an intentionally live, animated,
owner-authored overlay under ADR-0098 and ADR-0116.

## Decision

An active pre-drawn background suppresses ordinary baked environment families,
but explicitly authored ground cover remains a live additive layer. The normal
Cover tool stays available across the complete authored visual-terrain surface,
including scenic coordinates outside the playable rectangle. Its `cover` and
`coverTypes` board data retain their existing persistence and visual-only
semantics.

The shared renderer draws only explicitly authored cover for an exact Level; it
does not synthesize ambient cover merely because a pre-drawn background is
active. Cover keeps its canonical back/front depth lanes around live units and
its own animation. When a matching persisted occlusion depth map is selected,
painted foreground geometry clips both live unit pixels and live cover pixels
using the same strict depth comparison. All other environment suppression in
ADR-0158 remains unchanged.

Generation-reference exports remain ground-cover-free so tuft silhouettes do
not obscure the authored terrain and raised geometry supplied to image
generation. That export rule does not require cover to be baked into the
generated raster: the owner may add, remove, or change live cover after any raw,
warped, or occlusion-ready background version exists.

Because ground cover is not represented by the immutable background or its
occlusion child, `cover` and `coverTypes` are excluded from the background
environment-geometry fingerprint. A cover-only edit therefore neither stales
the selected raster/mask nor requires a new image derivative. Terrain,
Subterrain, props, doodads, barriers, and other baked environment geometry keep
their existing lineage checks.

## Consequences

- The owner can paint and erase ground cover on a pre-drawn Level without
  leaving the background-art workflow or regenerating art.
- Existing authored cover remains visible in the editor, gameplay, read-only
  viewers, browser thumbnails, and server thumbnails through the shared render
  plan.
- Ground-cover animation is the narrow live-environment exception; it does not
  reopen terrain, scenery, lighting, particle, or other animation layers.
- The generation reference remains clean while the final Level retains an
  independently adjustable living-cover pass.

## Verification

- Cover is not a pre-drawn locked layer, and cover-only board mutations pass the
  hidden-mutation guard.
- Cover-only changes leave the environment-geometry fingerprint unchanged,
  while changes to baked environment geometry still change it.
- Installed and temporary pre-drawn backgrounds render cover but suppress the
  other environment families.
- Explicit cover renders on both playable and scenic visual-terrain
  coordinates and retains its depth ordering around units.
