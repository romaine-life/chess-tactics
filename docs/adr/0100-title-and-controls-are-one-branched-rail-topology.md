---
status: "accepted; exterior-corner clause superseded by ADR-0103"
date: 2026-07-15
deciders: Nelson, Codex
supersedes:
  - ADR-0099
---

# ADR-0100: Title and controls are one branched rail topology

## Context and Problem Statement

ADR-0099 removed the layout gutter but its first implementation still painted the
title bar as one complete box and the right controls as a second complete box.
Their adjacent bottom and top rails remained two visible bars. Proximity is not
continuity: a divider exists specifically so one framed shell can branch into
sections without drawing another exterior boundary.

## Decision Outcome

Play and Level Editor use one **branched outer-rail topology**, not two boxes.

- The title region owns the exterior top and side rails and the true top corner
  atoms. It does not paint a bottom box rail.
- One outer-role structural divider occupies the lower of the former two rail
  positions. It is simultaneously the title region's bottom boundary and the
  controls region's top boundary.
- The controls region owns its left/right/bottom exterior runs but does not paint
  a top box rail. Its true bottom corners retain outer corner atoms.
- Authored outer divider-joint atoms cover every divider/vertical-rail junction,
  including the downward control-panel branch. Ordinary corner atoms must not be
  used at an internal branch.
- This topology is a shared shell primitive generated from the installed outer
  role and `dividers.outer`; consumers may not reproduce it with offsets or two
  overlapping complete frames.

At responsive widths where controls no longer sit directly below the title's
right edge, the shell does not claim a false branch at the desktop coordinate.

## Consequences

- The seam reads as one rail with a T-junction instead of two stacked bars.
- Chrome Lab remains the owner-operated instrument for rail, corner, divider, and
  joint geometry.
- A future topology editor may generalize branch placement, but the shared runtime
  primitive is required now; a local Play-only drawing is not acceptable.

## More Information

- Supersedes [ADR-0099](0099-title-bar-and-control-panels-form-one-outer-rail.md).
- Extends [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md) and
  [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md).
