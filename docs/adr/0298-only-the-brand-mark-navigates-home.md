---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - ADR-0023
  - ADR-0052
---

# ADR-0298: Only the brand mark navigates home

## Context and Problem Statement

The persistent title bar rendered the complete brand lockup as one `NavButton`.
Because that button was also the first item in a flexible title-bar grid track,
normal grid stretching made almost the complete bar leading area navigate to the
main menu. At a 1280px viewport, the visible shield was about 51px wide while
the invisible home target was 1028px wide.

The title and screen name are orientation copy. Empty title-bar material is
chrome. Neither was intended to behave as a broad home-navigation surface.

## Decision Outcome

Chosen: **only the visible Chess Tactics shield is the main-menu control**.

- `BrandLockup` keeps one inert layout wrapper containing the shield and the
  title/screen-name copy.
- The shield alone is a `NavButton` to `/`, retaining ADR-0052's game-control
  semantics and destination warming without exposing hyperlink affordances.
- `Chess Tactics`, the screen name, transition status, and unused title-bar area
  are outside that button and remain inert.
- The lockup layout shrink-wraps at the leading edge. A rendered title-bar gate
  requires the home button's border box to match the shield's border box and not
  overlap the copy.

### Consequences

- Good: clicking blank title-bar material or its orientation copy cannot discard
  the current route by returning to the main menu.
- Good: the visible shield remains a consistent, accessible home control.
- Good: the runtime geometry guard catches both accidental wrapper expansion and
  future grid stretching.
- Cost: the title and screen-name copy no longer increase the home control's hit
  target; the shield itself remains 40–54px across the responsive range.

## More Information

- Partially supersedes [ADR-0023](0023-app-title-bar-layout-and-controls.md)'s
  reference to the complete brand lockup as the home link; the invariant brand
  placement and title-bar layout remain unchanged.
- Partially supersedes [ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)
  only as to which part of the lockup is the `NavButton`; its button-based
  navigation decision remains in force.
- Components: `frontend/src/ui/shared/BrandLockup.tsx`,
  `frontend/src/style.css`, and `frontend/scripts/check-titlebar-geometry.mjs`.
