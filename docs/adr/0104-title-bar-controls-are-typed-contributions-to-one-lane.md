---
status: "accepted"
date: 2026-07-18
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0042
  - ADR-0101
---

# ADR-0104: Title-bar controls are typed contributions to one lane

## Context

ADR-0042 made the persistent title bar invariant and allowed screens to add
content through portal slots. ADR-0101 later required title-bar buttons to use a
canonical registered primitive. Those decisions standardized the bar and each
button, but left the relationship between buttons under caller-controlled JSX.

The actions slot and persistent account cluster consequently acquired different
layout parents. During the ADR-0100 rail migration, the persistent cluster gained
an explicit divider-bounded lane while action-slot buttons remained in the older
padded grid. Identical 52px buttons then rendered with different bottom
clearances: persistent controls had 4px while the Level Editor Back control had
0px. Both paths passed the existing source-structure checks.

## Decision

The persistent title bar owns one control lane with this fixed topology:

`contributed controls · persistent divider · music · settings · account`

The lane owns vertical alignment, control height, inter-control gaps, equal
divider clearances, and viewport-edge clearance. The divider is a real lane
child/track. Screens cannot create its surrounding DOM or apply layout classes,
styles, margins, padding, or alternate wrappers.

Screens contribute controls through a closed TypeScript description API. A
description declares intent such as navigation or activation, presentation such
as label/return/icon, accessible text, and behavior. The title-bar renderer alone
turns those descriptions into the registered inner-box button primitive. The
arbitrary `TitleBarSlot region="actions"`, `TitleBarActions`, and routed-screen
access to button primitives are retired end to end.

The center status region and bottom stud remain separate typed/owned facilities:
they are not ordinary controls adjacent to the persistent divider and do not
participate in this lane.

Repository enforcement rejects the retired action slot, routed imports of the
private button primitives, direct title-bar control markup, and local title-bar
placement CSS. A rendered geometry check measures the real application and
requires contributed and persistent controls to share a bottom coordinate while
the divider and viewport-edge clearances equal the one lane-gap token.

## Consequences

- Adding a routed title-bar action is a typed data contribution with no CSS work.
- A control cannot be registered successfully while choosing a different layout
  parent; button ownership and placement ownership are enforced together.
- Stateful screens retain their callbacks and route-local state because typed
  descriptions may carry activation functions and are portaled into the one
  App-owned lane.
- The persistent music/account implementations remain App-owned internals. They
  consume the same lane but are not exposed as caller-extensible markup.
- Changing the control-lane relationship is a shared title-bar decision and
  cannot be patched on one route.

## More Information

- Supersedes ADR-0042's arbitrary `actionsSlot` mechanism and ADR-0101's routed
  caller access to the canonical button primitive; their invariant-title-bar and
  registered-inner-role decisions remain accepted.
- Fulfills ADR-0100's requirement that the shell topology be shared rather than
  reproduced with offsets.
