---
status: accepted
date: 2026-07-18
deciders: Nelson, Codex
supersedes: ADR-0127 single scenic-growth strategy
---

# ADR-0129: Level Editor terrain authoring is explicit and area-scoped

## Context and Problem Statement

Scenic terrain growth previously had one implicit authoring strategy: continue the explicitly
painted old canvas edge when possible and otherwise leave the new band to exact boundary
projection. That is useful when the surrounding terrain should continue the authored scene, but it
does not let the owner deliberately add a neutral grass field. Separately, the Generate layer can
select one connected terrain area while the Tile layer can only drag individual cells or replace
the whole board. Repainting a large existing patch with one exact tile therefore requires many
edits.

Both workflows need explicit, deterministic owner controls. Neither needs model inference,
pixel inspection, or a second terrain representation.

## Decision

The Scenic terrain rectangle exposes a transient **Generation** mode with exactly two choices:

- **Match reference tile** preserves the ADR-0127 rule. Each otherwise-unauthored destination
  copies the exactly aligned explicit scenic tile on the old whole-canvas edge. If that source is
  playable or unpainted, the destination remains unpainted and ADR-0126 exact boundary projection
  continues to determine its visible terrain or void.
- **Grass** writes the canonical base grass tile as explicit scenic terrain into every
  otherwise-unauthored destination in the newly exposed band. It intentionally fills across a
  non-grass reference or projected void.

Both modes preserve any terrain already authored at a hidden destination after shrink/re-expand.
One cardinal step is one edit. All-directions applies the canonical North, East, South, West order
and commits the complete result as one undoable edit. The selected mode is editor tool state and is
not persisted; the authored scenic tile identifiers already persist and fully determine the
reopened board.

The Tile layer shares the Generate layer's connected-area selection authority. Clicking a terrain
cell in selection mode selects its complete orthogonally connected patch of the same terrain
family, using the ADR-0126 resolved visible topology across playable and scenic coordinates. Tile
selection is transient and does not create a saved generated-region record.

**Fill selected area** stamps the exact currently selected single-tile asset into every selected
coordinate. Playable destinations are written to the ordinary cell channel and any overlapping
composite terrain placements are broken through the canonical macrotile helper. Scenic
destinations are written explicitly to the decorative-cell channel. The fill changes nothing
outside the selection, preserves unrelated layers, keeps the selection visible, and commits once
so one Undo restores the whole area.

No part of either operation uses randomness, an LLM, image recognition, nearest-neighbor search,
or material inference.

## Consequences

- Scenic expansion can deliberately continue the authored boundary or create a predictable grass
  field without changing gameplay geometry.
- Tile authors can repaint a connected playable/scenic patch with one exact tile and one Undo.
- Generate and Tile agree about which cells belong to a visible terrain area without Tile
  selections polluting saved Generate regions.
- The grass choice is intentionally a uniform exact tile stamp, not socket solving or terrain
  generation; richer variation remains the Generate layer's responsibility.

## More Information

- [ADR-0126](0126-scenic-terrain-preserves-boundary-topology-in-one-depth-pass.md)
- [ADR-0127](0127-scenic-terrain-extent-growth-copies-the-authored-canvas-edge.md)
- [Board render contract](../board-render-contract.md#level-editor-scenic-terrain-apron)
