---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
partially_supersedes:
  - 0245-topology-junction-atoms-center-on-the-node.md
extends:
  - 0242-divided-inner-grids-own-one-rail-topology.md
  - 0246-boundary-junctions-center-on-the-frame-rail.md
---

# ADR-0248: Topology junction ornaments remain upright

## Context

The divided-grid topology already draws the complete N/E/S/W rail graph beneath
each junction and centers the installed divider-joint atom on the normalized
node. The junction renderer nevertheless used the node mask to choose mirrored
or quarter-turned copies of that atom.

The accepted atom has directional lighting and asymmetric visible weight.
Rotating or reflecting its pixels therefore changes its apparent center even
when every raster rectangle has the same mathematical center. A frame tee and
the cross directly below it can consequently look misaligned despite sharing
one grid-line coordinate.

The node mask does not need to encode that topology a second time in the
ornament. The rails beneath the ornament already own it.

## Decision

Every topology-owned `ChromeJunction` uses one upright, unreflected rendering of
the installed role-owned divider-joint atom.

- N/E/S/W side masks remain semantic descriptions of connected rails. They do
  not select a rotated or reflected raster.
- Tee and cross shapes are formed exclusively by the complete rail graph
  underneath the atom.
- The canonical upright rendering includes the installed divider tune's one
  base orientation. Every topology node reuses those exact pixels and
  dimensions.
- ADR-0245 and ADR-0246 continue to own geometric centering and boundary-node
  normalization unchanged.
- Standalone `ChromeDivider` endpoints retain their directional variants. This
  decision applies to topology-owned `ChromeJunction` nodes.
- Consumers cannot choose an ornament orientation or add optical offsets.

This partially supersedes ADR-0245's clause that a topology node mask chooses
the installed atom's rotation or reflection. Its centering decision remains
accepted.

## Consequences

- A boundary tee and an interior cross on the same grid line display identical
  lit ornament pixels at the same center.
- Top-down highlights remain upright rather than rotating with rail direction.
- Replacing or tuning the one installed divider-joint source still updates
  every topology node.
- Shared runtime and architecture tests reject a return to mask-selected
  topology rasters.

## More Information

- Partially supersedes
  [ADR-0245](0245-topology-junction-atoms-center-on-the-node.md).
- Extends [ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md).
- Extends
  [ADR-0246](0246-boundary-junctions-center-on-the-frame-rail.md).
