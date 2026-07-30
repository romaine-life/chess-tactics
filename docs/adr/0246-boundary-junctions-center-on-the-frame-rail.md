---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
extends:
  - 0245-topology-junction-atoms-center-on-the-node.md
  - 0242-divided-inner-grids-own-one-rail-topology.md
---

# ADR-0246: Boundary junctions center on the frame rail

## Context

ADR-0245 centers each atom rectangle on its topology node. Interior crossings
already used the CSS grid-line intersection as that node, so four-way atoms
were correct.

A perimeter tee begins at the divided box's content edge, while the surrounding
9-slice frame rail occupies a full role-owned reach between that content edge
and the box's outer edge. Translating the tee by the full reach therefore made
its node the outer edge of the frame. The atom was centered correctly on the
wrong node and appeared outside the border.

## Decision

The divided-grid primitive derives boundary nodes from the frame rail's
centerline.

- Interior nodes continue to use their CSS grid-line coordinate directly.
- A frame-start node moves from the content edge toward the frame by half the
  role rail's reach.
- A frame-end node moves by the same half reach in the opposite direction.
- The rule applies symmetrically on the inline and block axes.
- The full role rail reach remains the rail-extension distance; it is not a
  junction-center offset.
- Consumers cannot override or tune the boundary-node offset.

ADR-0245's atom-centering rule then applies unchanged: the installed atom is
centered geometrically on this derived node, and its mask controls only
orientation.

## Consequences

- Perimeter tees sit on the visible frame rail rather than its outer edge.
- Three-way and four-way nodes follow the same intersection logic after their
  node coordinates are normalized.
- Changing the role rail width moves the boundary node deterministically
  without screen-specific correction.

## More Information

- Extends [ADR-0245](0245-topology-junction-atoms-center-on-the-node.md).
- Extends [ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md).
