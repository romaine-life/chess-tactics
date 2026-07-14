---
status: "superseded by ADR-0096"
date: 2026-07-13
deciders: Nelson, Codex
superseded_by: "[ADR-0096](0096-predrawn-candidate-review-uses-exact-board-plane-registration.md)"
---

# ADR-0095: Pre-drawn boards use one registered live-media plate

## Context

The tile renderer is useful for building exact gameplay geometry, but assembling
every visible surface from independent terrain, road, prop, and barrier sprites
does not produce the continuous environmental painting wanted for campaign
levels. A generated whole-board painting can provide that continuity, provided
that it remains a presentation of an already-authored level rather than an
invitation to change the level's rules or grid.

The review problem is deliberately honest: generated landmarks and proportions
may not land perfectly inside their intended cells. The useful review surface is
therefore the generated painting underneath the canonical live grid, not a
post-generation warp, crop, mask, or invented board geometry.

## Decision

A board may declare a special `predrawn` surface containing a stable live-media
slot and the width and height of its canonical board reference frame. Boards
without this surface retain the existing composed-tile renderer unchanged.

For a pre-drawn board, every renderer draws exactly one complete image registered
to the same centered board-space frame used to produce the generation reference.
The renderer may apply one global review scale and translation to fit that frame;
it must not crop, mask, bend, split, or independently align parts of the image.
Candidate scaling is calibration under ADR-0076. An accepted runtime plate must
be regenerated at its declared native frame dimensions.

The level remains authoritative for gameplay. Its cells, roads, props, fences,
walls, exits, and other baked geometry still determine movement, collision,
objectives, addressing, and validation, but their ordinary sprite pixels are not
drawn above the plate. The canonical grid, units, selection state, and tactical
overlays continue to render above it.

Because changing baked geometry would make the painting lie about the level, the
level editor locks resizing and all tile, terrain-generation, road, prop, fence,
wall, and wall-art editing while a pre-drawn surface is active. Units, rules,
zones, doodads, and animated ground cover remain additive editable overlays.
Occlusion authoring for those overlays is a separate concern; this decision does
not infer or generate occlusion masks from the plate.

Persisted level data stores only the semantic slot and declared frame dimensions,
never a candidate URL or repository path. Development review may substitute a
same-origin temporary candidate URL without saving it into the level. Candidate
and accepted bytes follow ADR-0085's live-storage lifecycle and are never
committed to Git.

## Consequences

- A campaign level can use one continuous environmental painting while retaining
  the exact authored game board underneath it.
- Grid-on review exposes proportional or semantic misses instead of concealing
  them with per-object fixes.
- Baked geometry changes require regeneration of the plate rather than tile
  painting on top of stale artwork.
- Units and optional living overlays keep their normal runtime behavior and draw
  order; plate-aware occlusion remains explicit future work.
- Server thumbnails, read-only viewers, the editor, and gameplay consume the same
  board-surface declaration.
