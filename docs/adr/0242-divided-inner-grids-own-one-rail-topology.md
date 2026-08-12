---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by: "[ADR-0243](0243-grid-crossings-use-the-installed-divider-joint-atom.md)"
supersedes:
  - 0241-run-army-ledger-is-one-continuous-divided-inner-grid.md
extends:
  - 0063-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md
  - 0092-dividers-inherit-their-host-chrome-role.md
  - 0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md
---

# ADR-0242: Divided inner grids own one rail topology

## Context

ADR-0241 chose the correct visual object for the Run Army ledger: one inner
9-slice divided into continuous cells. Its implementation still left topology
to the consumer. The Army screen inserted one horizontal divider between rows,
two vertical dividers inside every row, and a separately positioned vertical
divider beside the scrollbar.

Each standalone `ChromeDivider` owned endpoint joints. When horizontal and
vertical dividers crossed, independent endpoint atoms could overlap, disappear,
or miss the crossing. The consumer then compensated with Run-only margins,
absolute positioning, apron arithmetic, and pixel offsets. Those values aligned
one screenshot but did not encode the invariant that every rail intersection
has exactly one correctly oriented junction.

This is a shared primitive gap, not an Army-layout exception. Future tables,
inventories, rosters, and editor grids must not solve the same rail graph again.

## Decision

A divided inner grid is one shared, topology-owned chrome primitive:
`DividedInnerChromeBox`.

- A consumer declares ordered column tracks and row content. It does not insert,
  position, or select individual dividers or junctions.
- CSS grid lines are the sole geometric authority. The primitive derives all
  vertical rails, horizontal row rails, frame endpoints, and optional scrollbar
  gutter from those lines.
- Every topological node has one normalized N/E/S/W connection mask. The mask
  selects one corner, three-way tee, or four-way cross rendering. Exactly one
  `ChromeJunction` owns each node; managed `ChromeDivider` rails suppress their
  standalone endpoint joints.
- Perimeter tees use the installed role-owned divider-joint source and its
  accepted tuning. Interior crosses use ADR-0063's canonical four-corner
  composition, derived at runtime from the installed host-role corner pixels.
  The composition creates no new media slot, fallback art, or feature-local
  paint.
- Rails begin and end at node coordinates. Frame reach is derived from the host
  role. There are no consumer-authored rail offsets.
- A drawn scrollbar is an explicit final grid track. Its width is derived from
  the shared `KitScroll` rail width and inset plus half the host rail thickness,
  so the vertical grid rail and scrollbar track meet by formula.
- Vertical column rails and their frame tees remain fixed to the box while row
  rails and their junction nodes move with scrolling content. This preserves one
  continuous framed viewport without detaching intersections from their rows.
- Chrome Audit's Inner Box specimen uses this primitive with repeated rows and
  columns, making tees and crosses visible under the existing divider-count and
  size controls.
- The Run Army ledger declares three content tracks—portrait, details, and
  Value—and requests the scrollbar track. Run code contains no `ChromeDivider`,
  joint placement, clip-apron arithmetic, or scrollbar offset.

Standalone one-dimensional section dividers remain valid for boxes that do not
form a grid. Their endpoint-owned behavior from ADR-0063 and ADR-0092 is
unchanged.

## Consequences

- Rail and joint placement is reusable and deterministic across every divided
  inner grid.
- Changing row count, column widths, scrollbar presence, or responsive size
  recomputes the same topology instead of requiring pixel retuning.
- A crossing cannot double-paint independent endpoint atoms because managed
  rails paint no endpoints.
- The topology model and rendered DOM counts are unit-tested independently of
  the Army feature. The shared source guard rejects a return to Run-local
  dividers or placement variables.
- The runtime chrome composer now produces a role-owned cross overlay from the
  installed corner source in addition to the existing four corner and divider
  tee renderings.

## More Information

- Supersedes
  [ADR-0241](0241-run-army-ledger-is-one-continuous-divided-inner-grid.md),
  retaining its one-box continuous-ledger intent while replacing its
  consumer-composed divider placement.
- Extends [ADR-0618](0618-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md),
  [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md), and
  [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md).
- Upholds [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  and [ADR-0071](0071-the-deliverable-is-the-instrument.md).
