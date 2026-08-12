---
status: "superseded by ADR-0242"
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_supersedes:
  - 0239-run-army-rows-use-a-divided-portrait-bay-and-explicit-type-hierarchy.md
superseded_by:
  - 0242-divided-inner-grids-own-one-rail-topology.md
---

# ADR-0241: The Run Army ledger is one continuous divided inner grid

## Context

ADR-0239 correctly moved the portrait boundary onto the shared vertical
`ChromeDivider`, but it retained one complete inner 9-slice per unit row. An
attempt to let portrait pixels run beneath each row frame added a separate frame
overlay mode. In the real ledger that composition hid divider joints, let the
scrollport clip corner atoms, and still read as a stack of unrelated framed
cards rather than one army roster.

ADR-0063 and ADR-0092 already provide the intended composition: one role-owned
box may contain an arbitrary number of role-owned structural dividers. The Army
ledger is the first dense table-shaped use of that existing system.

## Decision

- The complete Army ledger is one canonical `InnerChromeBox`. It owns the only
  perimeter 9-slice and the four exterior corner atoms.
- Unit rows are interactive content regions inside that box, not registered
  inner-list-row frames. They do not paint borders, corners, or another 9-slice.
- The ledger inserts one inner-role horizontal `ChromeDivider` between adjacent
  units. Every row inserts inner-role vertical `ChromeDivider`s after the
  portrait column and before the Value column.
- Divider crossings are composed from the existing role-owned rails and
  installed joint renderings. The ledger introduces no local border, bespoke
  junction art, chrome role, or media slot.
- The scrolling content uses ADR-0093's measured inline clip apron. Horizontal
  divider joints may reach the containing frame rail without changing the rail
  coordinate or creating a horizontal scrollbar; the shared drawn scrollbar
  stays inside that apron.
- The portrait remains frameless inside its cell and uses the canonical
  database-authored crop. It fills the portrait cell's content rectangle; the
  ledger perimeter and structural dividers, not portrait padding or a nested
  frame, define its visible bounds.
- ADR-0239's shared vertical-divider support and explicit readable typography
  remain in force. Only its per-row 9-slice ownership and the associated frame
  overlay composition are superseded.

## Consequences

- The Army reads as one continuous roster/table with repeated cells rather than
  a vertical stack of cards.
- Exterior corners occur exactly once, and interior structure uses only
  dividers and their accepted joint treatment.
- Portrait, details, and Value columns remain aligned across every unit.
- Adding or filtering units changes only the number of row regions and
  dividers; it never creates another chrome variant.
- The unused frame-overlay primitive and its runtime CSS are removed.

## More Information

- Partially supersedes
  [ADR-0239](0239-run-army-rows-use-a-divided-portrait-bay-and-explicit-type-hierarchy.md).
- Applies [ADR-0618](0618-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md),
  [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md), and
  [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md).
- Upholds [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
