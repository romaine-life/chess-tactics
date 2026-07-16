---
status: "superseded by ADR-0100"
date: 2026-07-15
deciders: Nelson, Codex
supersedes:
  - ADR-0037
---

# ADR-0099: Title bar and control panels form one outer rail

Superseded by [ADR-0100](0100-title-and-controls-are-one-branched-rail-topology.md).

## Context and Problem Statement

The persistent title bar still used a bespoke forged nailhead band while Play and
the Level Editor had moved to the accepted outer chrome role. A layout gutter
separated that band from the right-side control box. The two unrelated rails and
the small exposed corner between them made a continuous background cumbersome and
left the title bar outside the owner-operated Chrome Lab system.

## Decision Outcome

The accepted `outer` box rail is the only structural rail used by the title bar,
Play controls, and Level Editor controls. The bespoke title-bar band and diamond
are retired.

- The persistent title bar is an outer-role rail consumer and receives its rail,
  thickness, fit, fill, and atom geometry from the installed Chrome Lab family.
- The title bar's trailing menu boundary and the seam into a right-side control
  panel use the outer-role divider/joint concept. They do not introduce another
  rail asset or locally painted separator.
- On Play and Level Editor layouts, the vertical gutter between the title bar and
  controls is zero. Their rail boxes meet at one coordinate so a background can
  continue through the former corner.
- The control box aligns to the viewport edge. Bottom corner atoms are paint-only
  overlays flush to that rail edge under ADR-0093. At the title/control seam, top
  corner atoms give way to divider-joint atoms.
- Horizontal spacing between the board and controls remains a layout concern and
  is not removed by this decision.

The shared persistent title bar remains invariant under ADR-0042; this changes its
chrome source and its structural joints, not its content or route ownership.

## Consequences

- Chrome Lab adjustments propagate to the title bar and both control surfaces.
- One accepted rail family now owns the complete top/right shell silhouette.
- The former `frontend/public/assets/ui/titlebar` band and stud are retired from
  runtime use; live media continues to resolve through the canonical outer rail
  and divider-joint slots.

## More Information

- Supersedes [ADR-0037](0037-title-bar-full-bleed-bottom-rule.md).
- Extends [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md) and
  [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md).
