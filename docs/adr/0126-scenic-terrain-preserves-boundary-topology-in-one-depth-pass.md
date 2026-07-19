---
status: accepted; extent-growth non-propagation clause partially superseded by ADR-0127
date: 2026-07-16
deciders: Nelson, Codex
supersedes: ADR-0096 nearest-available synthesis and separate-canvas clauses
superseded_by: 0127-scenic-terrain-extent-growth-copies-the-authored-canvas-edge.md
---

# ADR-0126: Scenic terrain preserves boundary topology in one depth pass

## Context and Problem Statement

The Level Editor can extend its visual terrain beyond the playable rectangle for art handoff.
Copying the nearest occupied terrain tile closes a playable-edge opening when the exact boundary
cell is empty, turning an open channel into a false enclosed pit. Rendering the synthesized apron
and playable terrain on separate canvases also lets a farther playable side face paint over a
nearer scenic top, exaggerating the false gap.

The scenic surface must preserve the authored board's exact boundary topology, participate in the
same terrain depth order, and remain incapable of changing gameplay.

## Decision Drivers

- An empty cell on the playable boundary must remain an open visual exit when scenic rows or
  columns are added beyond it.
- The visible terrain topology must not disagree between rendering, region selection, and scoped
  generation.
- Terrain painter order must follow board depth across the playable/scenic seam.
- Large scenic surfaces must not introduce a full animated-canvas repaint on every frame.
- Scenic coordinates must remain visual-only and must never enter the playable Level projection.

## Considered Options

- Continue copying the nearest occupied tile and patch particular openings.
- Keep separate canvases and add local z-index or side-face exceptions.
- Project exact boundary occupancy and render the complete scenic terrain surface in one ordered
  pass.

## Decision Outcome

Chosen: **project exact boundary occupancy and use one ordered terrain pass**.

For an unpainted scenic coordinate, the editor clamps its column and row independently to the
playable rectangle and reads that exact boundary coordinate. It synthesizes a terrain top only when
that clamped coordinate owns one. An empty boundary coordinate therefore remains empty through
every added row or column along that projection. At a corner, both axes clamp to the exact playable
corner. The algorithm never searches sideways or inward for the nearest occupied substitute.

An explicitly authored scenic terrain cell overrides synthesis at that exact scenic coordinate.
That override is not a new propagation source for other unpainted coordinates; each coordinate
continues to resolve from its own clamped playable boundary coordinate.

This visible synthesized topology is the single authority for terrain rendering, region-family
selection, and the scoped Generate base map. Those tools must not treat an unpainted scenic
coordinate as empty when it visibly inherits terrain, or treat a projected boundary void as filled.

When any scenic extent is active, playable and scenic terrain cells render in one depth-coherent
terrain-compositor pass. The complete pass is frozen on frame zero so the correct shared painter
order does not require a continuously repainting large canvas. With no scenic extent, ordinary
playable terrain animation remains unchanged.

The playable rectangle remains the sole gameplay projection. Synthesized terrain and explicitly
authored scenic terrain remain outside movement, collision, units, zones, objectives, solver state,
and serialized Level terrain.

### Consequences

- Good: edge-connected openings stay open instead of becoming false pits when a scenic edge grows.
- Good: terrain sides and tops obey one painter order across the playable/scenic seam.
- Good: rendering, selection, and generation observe the same deterministic terrain topology.
- Good: gameplay geometry and export remain unchanged.
- Cost: adding scenic terrain freezes playable terrain animation in the editor's art-handoff
  surface until all scenic extents return to zero.
- Cost: filling an inherited boundary opening requires explicitly painting every scenic coordinate
  that should contain terrain; one painted coordinate does not implicitly fill farther rows.

## More Information

- [Board render contract](../board-render-contract.md#level-editor-scenic-terrain-apron)
- [ADR-0096](0096-level-editor-scenic-terrain-apron-is-decoration-only.md)
- [ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)
