---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0452](0452-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
  - "[ADR-0455](0455-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0456: Aftermath report owns the optical center

## Context

The aftermath information box was mathematically centred in the Battle viewport. Although its
midpoint measured exactly 50%, the composition still read as low: the box is the largest and
darkest foreground mass, its actions extend below it, and human visual centring sits above a
rectangle's geometric centre. Treating Victory, the report, and the actions as one centred stack
would also make changing heading or action copy move the information the player came to read.

## Decision

- The aftermath information box is the screen's dominant focal point. Its own midpoint, rather
  than the bounds of the combined heading/report/action stack, sits at 45% of the Battle viewport
  measured from the top.
- **Victory** is the report's display heading and remains immediately above it. **Back** and
  Continue remain its following actions immediately below it. All three move together when the
  viewport changes size, preserving their proximity without allowing the heading or actions to
  choose the report's anchor.
- The position derives from the live workspace height. It is not a fixed pixel offset or a
  percentage of the browser window that would drift when title-bar or shell geometry changes.

## Consequences

- The report reads as the point of the screen instead of as content hanging in its lower half.
- Variable report height, optional subtitle copy, and action width do not redefine the focal line.
- Responsive layouts retain the same optical placement across Battle viewport heights.
