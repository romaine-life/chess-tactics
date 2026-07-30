---
status: "accepted; Run Army per-row frame ownership superseded by ADR-0241"
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - 0241-run-army-ledger-is-one-continuous-divided-inner-grid.md
---

# ADR-0239: Run Army rows use a divided portrait bay and explicit type hierarchy

## Context

The Run Army ledger placed its portrait inside a complete inner box even though
the selectable ledger row already owned an inner-role frame. The result was a
box inside a box. The adjacent status, abilities, Value label, and numeric value
also inherited browser `<small>` sizing, making important row information
illegible beside the unit name.

ADR-0063 and ADR-0092 already establish one shared, role-owned structural
divider for horizontal row separation. A local vertical border or a special
portrait frame would duplicate that chrome vocabulary.

## Decision

- `ChromeDivider` supports explicit `horizontal` and `vertical` orientations.
  Horizontal remains the default for existing consumers.
- Orientation changes only the layout axis. Both forms inherit rail thickness,
  repeat/stretch behavior, band size, reach, and joint material from their
  `outer` or `inner` host role.
- The vertical renderer uses the host frame's vertical rail slice and rotates
  the same installed divider-joint source into top and bottom joints. It does
  not introduce another chrome role, media slot, or locally painted border.
- Chrome Lab shows the horizontal and vertical forms together under the same
  role-owned Divider controls, so tuning remains inspectable across both axes.
- Each Run Army ledger row is one inner-role box. Its portrait keeps the shared
  crop, backdrop, sizing, and live-media renderer but omits its own
  `InnerChromeBox`; one inner-role vertical divider forms the portrait bay.
- Full Run unit profiles, the Skirmish Selected Unit card, roster thumbnails,
  and portrait-authoring previews retain their complete portrait frame.
- Ledger status, ability, no-ability, and Value-label text use the design-system
  medium text token. The numeric value uses the extra-large display token. Browser
  default `<small>` sizing is never the hierarchy authority for these fields.

## Consequences

- The ledger row reads as one composition rather than nested boxes.
- Vertical and horizontal separators cannot drift into different chrome
  material or tuning systems.
- The portrait fills its allotted bay without reserving padding for a retired
  nested frame.
- Identity, status, abilities, and value remain visually distinct and readable
  at the Run canvas's normal scale.
- Existing horizontal dropdown dividers and framed portrait consumers are
  unchanged.

## More Information

- Partially supersedes the horizontal-only scope of
  [ADR-0063](0063-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md).
- Extends [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md).
- Refines [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md).
- Upholds [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  and [ADR-0071](0071-the-deliverable-is-the-instrument.md).
