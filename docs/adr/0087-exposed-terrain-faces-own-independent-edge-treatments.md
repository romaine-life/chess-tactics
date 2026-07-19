---
status: "accepted; material fallback superseded by ADR-0105"
partially_superseded_by: "[ADR-0105](0105-subterrain-is-an-opt-in-drawable-surface.md)"
date: 2026-07-12
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0039
  - ADR-0041
---

# ADR-0087: Exposed terrain faces own independent edge treatments

## Context

The fixed camera shows two vertical faces of a terrain cell: logical south and
logical east. The renderer previously reduced both to one `drawSide` boolean and
one whole-cell `sideAsset`. If either neighbor was void, it painted the complete
96x180 side frame and relied on neighboring tops to hide the interior half. That
made topology and styling inseparable, allowed a face treatment to wrap around a
corner, and let browser and thumbnail paths disagree.

The defect became visible after the walkable-top seam treatment changed. Its
dilated repair pixels escaped the map contour and exposed Water's inherited blue
cube body. Owner review accepted the intended abrupt-cut styling: a restrained
blue meniscus over a quiet dark substrate, with no implied waterfall.

## Decision

### Exposure is resolved per face

One shared primitive resolves exposure from logical occupancy:

- south is exposed when `(x, y + 1)` is unoccupied;
- east is exposed when `(x + 1, y)` is unoccupied.

The canonical side frame has two source regions. South owns columns `0..47` and
east owns columns `48..95`. Compositors draw only the exposed 48px half. They do
not draw a whole frame and depend on occlusion to hide it.

### Treatment is selected per exposed face

Each face independently resolves a side source. The cell's base side is the
default; a mural, story feature, transition treatment, or explicit waterfall may
override south or east without changing the other. `sideAssets.south/east`
replaces the whole-cell `sideAsset`, and an override never changes exposure.

`packages/board-render/src/render/terrainSides.ts` owns the exposure,
material-fallback, and half-frame mapping used by the browser terrain canvas and
shared render plan. Generated boards, gameplay, Studio/editor views, client
bakes, and server thumbnails therefore use the same face decision.

### Abrupt cuts and waterfalls are different treatments

An abrupt map boundary is valid topology. Water's ordinary boundary treatment
is the reviewed thin water cap over generated dark substrate. A waterfall is an
explicit connected edge feature; Water touching void does not imply one.

The Water cut material is assembled at the native 96x180 footprint from
generated native-density meniscus and bedrock pixels using only 1:1 crop,
translation, tiling, and a deterministic hard-alpha face mask. Its source bytes,
mask, provenance, candidate, and accepted pointer belong to live backend storage
under ADR-0085, not Git.

### Top seam repair is geometry, not styling

The two-pixel top dilation exists only to seal internal raster misses. It is
clipped to the union of occupied logical diamonds, including holes and irregular
contours. A colored lip or cap belongs to side media; the renderer never creates
generic edge padding or a top-color apron outside the map.

## Migration

- Remove `drawSide` and whole-cell `sideAsset` end to end.
- Slice side draw operations by canonical south/east face in live and thumbnail
  paths.
- Import the existing Git inventory as byte-exact legacy bridges before changing
  any active Water pointer.
- Upload the reviewed native Water source and its evidence as private backend
  records, review all eight semantic side slots on the real board, and swap the
  eight pointers atomically only after the Git cutover verifier has completed.

ADR-0041 remains authoritative for continuity murals and story-feature art, but
its whole-cell assignment and corner-spill behavior are superseded here.
ADR-0039's independent top/side layering remains and is refined to face-level
side composition.

## Consequences

- East-only, south-only, corner, stair-step, and hole boundaries are explicit
  and testable.
- A corner can use two different materials without either one wrapping.
- Draw-op count follows exposed faces rather than exposed cells; source decoding
  remains content-hash deduplicated.
- Persisted exact boards still store one tile id per cell, so both faces default
  to that tile's side source. Persisted authored face overrides require a later
  content-schema decision.

## Related decisions

Builds on ADR-0040 (generated material and deterministic geometry), ADR-0059
(one canonical primitive), ADR-0071 (owner-operated review), ADR-0076 (native
1x production pixels), and ADR-0085 (live-storage media ownership).
