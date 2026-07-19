---
status: accepted; placement restrictions partially superseded by ADR-0098; synthesis and render-pass clauses partially superseded by ADR-0126
date: 2026-07-14
deciders: Nelson, Codex
superseded_by: 0098-authored-board-extends-beyond-playable-grid.md, 0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md
---

# ADR-0096: The Level Editor scenic terrain apron is decoration only

## Context

Board-art generation handoff needs a complete terrain field around the authored map. Asking an
image model to infer or ignore the empty void outside the tactical board produces a weaker and less
owner-controlled source image. Enlarging the tactical board to solve that presentation problem
would instead change movement, zones, placement, validation, solver state, and level content.

## Decision

The Level Editor owns four persisted **Scenic terrain rectangle** extents: top, right, bottom, and
left. Each independently adds zero to sixteen rows or columns beyond that board edge. Its shared
terrain renderer extends tile tops only through the requested rectangle and removes the visible
perimeter drop into void where an extent is nonzero. The apron copies the nearest available authored
terrain top until the owner generates that area. Scenic cells participate in the ordinary region
selection, saved-region, and scoped Generate workflow; Generate applies only to the selected area,
whether it contains playable cells, scenic cells, or both. A whole-surface Generate simply selects
the complete playable-plus-scenic rectangle. Generated outside cells persist in a separate decorative
channel, preventing mixed board edges from stretching into long bands. Decorative apron
animation is frozen on frame zero and renders on a separate canvas so playable animation cannot
create a continuous large-apron repaint.

Apron coordinates are render-only. Their generated terrain ids live in `EditorBoard.decorativeCells`,
never `EditorBoard.cells`; they are not gameplay addresses, hit
targets, terrain-layer entries, feature cells, generated regions, zones, unit/prop seats, or solver
state. They never enter `editorBoardToLevel`. Features, macrotiles, cover, props, barriers, walls,
tactical overlays remain bounded by the playable board. Grid inspection has two explicit scopes:
**Playable grid** draws only tactical cells, while **Whole grid** draws the complete scenic
rectangle. A terrain-free board has no apron to invent.

The four extents, decorative terrain, and saved region selections persist in `boardCode` so a durable private editor document reopens the exact
art-review surface. Old boards default every side to zero. Gameplay and thumbnails continue to render the authored board
only; this is an editor/art-handoff presentation mode, not a second content system.

## Consequences

- Art handoff can show authored terrain on every side without making decorative cells playable.
- The tactical board size and playability contract remain unchanged.
- Panning remains bounded by the finite review apron; changing its review extent is renderer tuning,
  not level geometry or authored content.
