---
status: "accepted; topology mask rotation clause superseded by ADR-0248"
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0248](0248-topology-junction-ornaments-remain-upright.md)"
partially_supersedes:
  - 0243-grid-crossings-use-the-installed-divider-joint-atom.md
extends:
  - 0242-divided-inner-grids-own-one-rail-topology.md
---

# ADR-0245: Topology junction atoms center on the node

## Context

The divided-grid topology correctly gave every rail intersection one normalized
N/E/S/W node, but its renderer reused the installed divider atom's standalone
endpoint seating offsets. Those offsets place an atom relative to the end of a
divider reaching a box rail. They are directional by design.

A topology node is different: its coordinate is already the shared centerline
of every connected rail. Reapplying endpoint offsets moved left-facing and
four-way atoms to one side, right-facing atoms to the other, and top/bottom
atoms in opposite vertical directions even though their node coordinates were
correct.

## Decision

Every topology-owned junction atom is centered geometrically on its normalized
rail node.

- The atom rectangle's center and the node's N/E/S/W rail intersection are the
  same coordinate.
- A node mask chooses only the installed atom's rotation or reflection. It
  cannot change the atom center.
- Standalone `ChromeDivider` endpoints keep their accepted role-specific
  endpoint seating; topology junctions do not consume those directional
  offsets.
- Horizontal and four-way atoms center by their rendered width and height.
  Rotated vertical atoms center by their rendered, axis-swapped dimensions.
- Consumers remain unable to supply corrective offsets.

This partially supersedes ADR-0243's statement that grid crossings use the same
role-specific seating as corresponding three-way divider endpoints. Its
installed-joint material decision remains accepted.

## Consequences

- Left, right, top, bottom, and four-way junction masks share one spatial rule.
- Changing direction cannot move a junction away from its rail intersection.
- Non-square joint atoms remain centered after rotation.
- Endpoint calibration remains available where it actually applies, without
  leaking into topology geometry.

## More Information

- Extends [ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md).
- Partially supersedes
  [ADR-0243](0243-grid-crossings-use-the-installed-divider-joint-atom.md).
