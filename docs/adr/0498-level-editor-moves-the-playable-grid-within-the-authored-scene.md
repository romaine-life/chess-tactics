---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)"
  - "[ADR-0131](0131-sparse-scenic-terrain-separates-footprint-from-material.md)"
  - "[ADR-0365](0365-props-stand-on-the-authored-surface-not-the-playable-grid.md)"
---

# ADR-0498: Level Editor moves the playable grid within the authored scene

## Context

The Level Editor already owns one authored visual scene with a zero-based playable rectangle inside
its scenic terrain surface. Authors can resize that rectangle from any side and independently grow
or reduce the scenic rectangle, but cannot move the complete playable projection after composing
terrain and scenery around it. Reaching the same result through paired resizes is destructive,
non-obvious, and does not preserve every coordinate-bearing channel as one operation.

Persisted board coordinates remain relative to the playable origin. Introducing a second durable
origin would make every board renderer, gameplay projection, solver input, board code, and accepted
art registration understand two coordinate systems for an operation whose result can instead be
stored as an ordinary canonical board.

## Decision

The ordinary Level Editor Board page adds **Move playable grid** controls for North, East, South,
and West. One activation moves the playable rectangle exactly one tile in that direction inside the
existing rectangular scenic terrain surface. The move consumes one scenic row or column on the
requested side and adds one on the opposite side, so board dimensions and the total authored
rectangle do not change. A direction is unavailable when its entering scenic extent is zero or the
opposite extent is already at the sixteen-tile limit.

The persisted result keeps the standard zero-based playable origin. To express the moved projection,
the editor atomically rebases the complete authored scene by one coordinate in the opposite
direction. Terrain, features, barriers, Subterrain, cover, props, generated-region selections,
Town and Forest bounds, and projected-pixel Scene Art all retain their alignment with one another.
The generation frame and authored camera boundary move by the same canonical projected-pixel delta.
An inherited scenic terrain band that enters play is materialized from its exact clamped boundary
source so the move cannot turn visible synthesized terrain into an accidental gameplay void.

Units, Doodads, and gameplay-zone tiles remain playable-only. A move removes those that leave the
new playable rectangle and reports the count. A prop remains when its complete shifted footprint is
still on authored ground and wholly playable or wholly scenic; a footprint that newly straddles the
boundary is removed under ADR-0365. These are the same projection-boundary consequences already
used by a destructive-side resize, now disclosed beside the movement instrument.

Each move is one undoable and autosaved EditorBoard mutation. Accepted pre-drawn boards keep their
locked registration and do not expose the control; moving an immutable plate's grid belongs to the
Board Art fitting/version workflow rather than ordinary level authoring.

## Consequences

- Authors can reposition the tactical area after composing a larger scene without manually pairing
  two resizes or rebuilding the board.
- Board code, Level schema, gameplay coordinates, and renderer inputs gain no alternate origin or
  migration; the result is an ordinary canonical zero-based board.
- The complete scene moves as one transform, while gameplay-only placements continue to obey the
  playable projection instead of leaking authority into scenic coordinates.
- Directional availability makes the scenic space consumed by each move explicit and prevents
  hidden clipping at the authored rectangle's limit.

## Verification

- North, East, South, and West each transfer the correct scenic extent and apply the opposite
  coordinate delta to every authored channel.
- Synthesized scenic terrain becomes explicit playable terrain when it enters the grid.
- Units, Doodads, zone tiles, and newly straddling props are removed when required and reported.
- Scene Art, generation frame, camera boundary, generated selections, Towns, and Forests retain
  their relative alignment.
- One Undo restores the complete pre-move board.

## More Information

- [Board render contract](../board-render-contract.md)
- [ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)
- [ADR-0131](0131-sparse-scenic-terrain-separates-footprint-from-material.md)
- [ADR-0365](0365-props-stand-on-the-authored-surface-not-the-playable-grid.md)
