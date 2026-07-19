---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
---

# ADR-0122: Pre-drawn occlusion derives from canonical raised geometry

## Context

A pre-drawn plate bakes fences, posts, walls, and props into one continuous
painting, while units, doodads, and living ground cover remain additive runtime
art. Drawing every additive pixel above the plate lets grass and units paint
through a foreground fence or obstacle.

The runtime cannot determine which painted pixels are a fence by looking at the
plate without introducing fallible visual inference. In a trial segmentation,
the image model classified long road sections as foreground occluders and missed
the authored fence topology. The canonical level already owns those semantics,
placement, sprite alpha, and depth.

## Decision

Pre-drawn occlusion is derived from canonical raised geometry, never inferred
from plate pixels. The shared render planner creates a seed board that removes
the plate, terrain, linear features, macrotiles, units, doodads, and ground
cover while retaining authored props, fences, fence posts, walls, and wall art.
Its ordinary alpha-bearing draw operations are the occlusion masks. Props and
walls retain their existing scene depth; fence rails and posts move to the
half-depth plane of their canonical board edge so the owner-side cell is behind
the fence and the adjacent cell is in front.

For each additive scene draw operation, only masks with strictly greater depth
and overlapping draw bounds apply. The renderer paints that one operation into
an isolated transparent scratch surface, erases it with those front masks using
their exact alpha, and then composites the result. Erased pixels reveal the
unchanged plate already below. Equal-depth operations keep the shared stable
painter-order rule. Terrain and the plate are never erased.

Editor, read-only viewer, gameplay, browser thumbnail, and server thumbnail
consume the same mask planner and depth rule. Mask sources participate in the
same readiness preload as visible art so an overlay cannot flash through before
its occluders decode.

The Level Editor exposes two owner proof controls for a registered plate:
`Occlusion` switches the real clipping pass before/after, and `Seed mask` shows
the exact derived silhouettes in magenta. Both states are deep-linkable. This
instrument is generic board functionality; it does not branch on a level id or
hard-code Fortress Gate coordinates.

The automatic seed is deterministic derived geometry, so it adds no Level,
`EditorBoard`, database, or live-media field and persists no mask pixels or
depth values. A future owner paint/erase refinement and accepted mask artifact
would be a separate storage and authoring decision.

This decision does not split, crop, mask, or independently align the plate. It
only removes additive overlay pixels that canonical raised art places in front,
so ADR-0134's one complete plate and one registration transform remain intact.

## Consequences

- Runtime does not need to recognize a fence, house, or boulder from pixels.
- Fence joins, prop halves, and posts inherit the same geometry and depth rules
  already used by the composed renderer.
- A slightly mismatched generated silhouette remains visible in the magenta
  proof instead of being hidden behind an opaque model-generated mask.
- The automatic pass is reproducible and storage-free, but a candidate still
  requires owner visual verification against its registered plate.
- Manual plate-specific refinements are deliberately not smuggled into level
  data or local-only runtime state.
