---
status: accepted; single-strategy requirement partially superseded by ADR-0129
date: 2026-07-16
deciders: Nelson, Codex
supersedes: ADR-0126 explicit scenic-cell non-propagation during extent growth
superseded_by: 0129-level-editor-terrain-authoring-is-explicit-and-area-scoped.md
---

# ADR-0127: Scenic terrain extent growth copies the authored canvas edge

## Context and Problem Statement

ADR-0126 makes an unpainted scenic coordinate resolve from its exact aligned playable-boundary
coordinate. That preserves a boundary void and prevents synthesis from searching for a nearby
occupied substitute. It also means that increasing a scenic extent beyond explicitly painted
scenic terrain can make the new outer band visually revert to the playable-boundary terrain. The
rectangle then follows the legal board edge instead of continuing the latest terrain that the owner
painted at the edge of the whole visual canvas.

Extent growth needs to continue explicitly authored outer-edge terrain without turning runtime
synthesis into a search or materializing playable-boundary fallback as new authored content.

## Decision Drivers

- The newest authored whole-canvas edge is more relevant than the playable-board edge when both
  exist on the same outward line.
- Boundary voids must remain void unless the owner has explicitly painted scenic terrain on that
  exact line.
- Expanding a rectangle must not overwrite scenic terrain that already exists at a destination.
- The operation must be deterministic and independent of pixel or model inference.
- Runtime terrain resolution, shared depth order, and gameplay isolation from ADR-0126 remain
  unchanged.

## Considered Options

- Change runtime synthesis to scan inward for the nearest authored scenic tile.
- Copy the currently resolved visual value at the old canvas edge, including playable-boundary
  fallback.
- During extent growth only, copy an explicit scenic tile from the exact aligned old whole-canvas
  edge coordinate.

## Decision Outcome

Chosen: **during extent growth only, copy explicit terrain from the exact aligned old canvas
edge**.

Each one-cell increase of a cardinal scenic extent is an authoring operation over the newly exposed
band. For every destination in that band, the source is the directly adjacent coordinate on the old
whole-canvas edge, aligned on the unchanged axis:

- North copies from the old minimum row into the new row immediately above it.
- East copies from the old maximum column into the new column immediately to its right.
- South copies from the old maximum row into the new row immediately below it.
- West copies from the old minimum column into the new column immediately to its left.

If the destination already owns an explicit scenic terrain tile, the editor preserves it. Otherwise,
if the exact source coordinate owns an explicit scenic terrain tile, the editor writes that same tile
identifier to the destination as explicit scenic terrain. If the source has no explicit scenic tile,
the editor leaves the destination unpainted. The ordinary ADR-0126 playable-boundary fallback then
continues to determine the unpainted destination's visible terrain.

The growth operation copies neither a synthesized value nor a playable terrain cell. It performs no
ray scan, nearest-neighbor search, sideways search, diagonal search, or pixel inference. It affects
terrain only; it does not duplicate features, fences, walls, props, doodads, cover, units, or zones.

An increase of more than one cell is evaluated as ordered one-cell growth steps. A tile copied in one
step is explicit authored scenic terrain and can therefore become the exact edge source for the next
step. Corner destinations follow the same directly aligned source rule for the cardinal side being
extended. Sequential side extensions follow the order in which they are applied, so a later side may
copy an explicit corner created by an earlier side; there is no diagonal merge or substitute search.

Reducing an extent does not delete authored scenic terrain. If a later increase exposes a destination
that already owns an explicit tile, preserving that destination takes precedence over copying the
current edge source.

ADR-0126 otherwise remains in force: an unpainted scenic coordinate resolves only from its exact
clamped playable-boundary coordinate, all visible terrain uses the shared frame-zero depth pass while
scenic extents are active, and the playable rectangle remains the sole gameplay projection.

### Consequences

- Good: extending past a painted scenic edge continues that authored terrain instead of reverting to
  the legal-board edge.
- Good: an unpainted old canvas edge does not manufacture terrain, so boundary openings stay open.
- Good: repeated expansion naturally chains through explicit copied cells without changing runtime
  synthesis.
- Good: reducing and re-expanding the rectangle does not destroy or overwrite hidden authored work.
- Cost: sequential cardinal edits can produce different corner authorship when the prior explicit
  corner sources differ; the result remains deterministic from the recorded edit order.
- Cost: continuing a synthesized playable-boundary edge requires painting a scenic edge cell first;
  synthesized values are deliberately not copied into authored storage.

## More Information

- [Board render contract](../board-render-contract.md#level-editor-scenic-terrain-apron)
- [ADR-0126](0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md)
- [ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)
