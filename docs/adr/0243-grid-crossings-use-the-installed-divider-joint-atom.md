---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by: "[ADR-0245](0245-topology-junction-atoms-center-on-the-node.md)"
partially_supersedes:
  - 0242-divided-inner-grids-own-one-rail-topology.md
extends:
  - 0092-dividers-inherit-their-host-chrome-role.md
---

# ADR-0243: Grid crossings use the installed divider-joint atom

## Context

ADR-0242 correctly moved dense divided boxes to one programmatic rail topology,
but selected the wrong material for four-way nodes. Three-way nodes used the
installed divider-joint atom. Four-way nodes instead mirrored four host-frame
corner atoms around the crossing.

That composition encoded the correct N/E/S/W connectivity but visibly read as
four corners forming a small box. It also made a non-corner node depend on the
host corner source even though the chrome family already owns one accepted
divider-joint source and role-specific joint geometry.

## Decision

Every non-corner node in a divided chrome topology uses the installed
role-owned divider-joint atom.

- Three-way nodes keep their mask-selected orientation.
- At a four-way node, the topology draws the complete N/E/S/W rails underneath
  one installed divider-joint atom. The atom uses the same source, size, anchor,
  and role-specific seating as the corresponding three-way joint.
- A four-way node does not compose host-frame corners and does not introduce a
  separate cross media slot, generated fallback, or consumer-local paint.
- Runtime frame rendering owns frame rails and corner atoms only. Divider
  rendering owns every topology-junction atom.
- The shared junction renderer and Chrome Audit specimen are the verification
  surface; feature consumers continue to declare tracks and rows only.

This partially supersedes ADR-0242's four-corner cross-material clause. Its
topology, mask, rail, scrollbar, and consumer-ownership decisions remain
accepted.

## Consequences

- A crossing reads as a joint instead of a miniature box made from corners.
- Three-way and four-way nodes cannot drift into different material families.
- Replacing or tuning the installed divider-joint atom updates every divider
  node without feature-specific work.
- The renderer has no separate corner-derived cross asset or frame-owned
  junction overlay to maintain.

## More Information

- Refines [ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md).
- Upholds [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  and [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md).
