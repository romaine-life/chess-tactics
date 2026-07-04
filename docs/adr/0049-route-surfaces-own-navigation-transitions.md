---
status: "accepted"
date: 2026-07-02
deciders: Nelson, Codex
---

# ADR-0049: Route surfaces own navigation transitions

Refines [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md). ADR-0046
defined the transition primitives: heavy routes use the route veil; light art routes fade
their chrome root while the shared background and rain stay continuous. This ADR makes the
route's **surface type** the code-level contract that chooses between those primitives, and
keeps the raw entrance hook private to shell wrappers.

## Context and Problem Statement

The skirmish entry changed from "start a random live board" to "show a saved-map picker."
That made `/skirmish` a menu-family light art route: no level has been chosen yet, so it
must keep the main-menu scene and fade only its picker chrome. The first implementation
removed `/skirmish` from the board veil, but because route behavior lived in ad-hoc sets
inside `App.tsx`, the picker was not explicitly enrolled in the light-art entrance fade.
The result was technically no board fade, but visually a snap-in menu. The fix is not "try
to remember another hook"; it is making the shell own the fade.

## Decision Drivers

- New menu-family routes must not be able to skip the shared entrance fade by accident.
- Leaf screens should choose route/chrome shells, not import transition hooks directly.
- The main-menu background and ambience rain must stay continuous across light art routes.
- Board routes must still be allowed to hide costly composition behind the route veil and
  board-art readiness gate.
- The distinction must be testable without launching the browser.

## Considered Options

- Keep local route sets in `App.tsx`.
- Add a route wrapper that fades every light route.
- Add an explicit route-surface registry plus shell wrappers and a check script.

## Decision Outcome

Chosen: **explicit route-surface registry**, implemented in
`frontend/src/ui/routeSurfaces.ts`, backed by shell-level chrome wrappers.

Routes are classified by rendered surface, not by historical path name:

- `heavy-board`: live board play. Uses the route veil and the board-art readiness gate.
  Today this is `/play`.
- `heavy-editor`: costly editor surfaces. Uses the route veil but not the board-art gate.
  Today this is `/edit` and `/level-editor`.
- `light-art`: menu-family screens over the shared main-menu scene and ambience rain.
  These must not use the route veil; their owned chrome root must render through
  `ArtRouteChrome` or `LightArtRouteShell`.
- `light-plain`: lightweight screens that do not need the art-background contract.

`/skirmish` is explicitly `light-art`: it is a map picker until the player chooses a map
or random board. Only `/play` is the board-art route.

The raw `useScreenEntrance()` hook is not a screen API. It is owned by
`ArtRouteChrome`; screens and route components use that wrapper (or the fuller
`LightArtRouteShell`) so "include the fade" is the default shape. A check script,
`frontend/scripts/check-light-art-chrome.mjs`, fails if an ambience route imports the
background without the wrapper or if a screen imports `useScreenEntrance()` directly.

### Consequences

- Good: route transition behavior is now declared in one pure module and unit-tested;
  changing a path from board to menu-family requires changing its surface classification.
- Good: the skirmish picker uses the same chrome entrance primitive as the other menu
  screens while the background/rain stay stable.
- Good: `npm run check` now catches the exact omission class that caused the picker snap.
- Cost: adding a new route has one more required decision: what surface does it render?
- Guardrail: new menu-family screens need both `light-art` classification and an
  `ArtRouteChrome`/`LightArtRouteShell` chrome root. A whole-screen wrapper remains
  rejected because it would fade the shared ambience backdrop, violating ADR-0046.

## Pros and Cons of the Options

### Keep local route sets in `App.tsx`

- Good: smallest code change.
- Bad: repeats the bug's shape. A route can be removed from the veil without being added to
  the light-art fade contract, and tests have no pure place to assert the intended class.

### Add a route wrapper that fades every light route

- Good: centralizes the fade.
- Bad: violates ADR-0046. A route wrapper would fade the whole screen, including the
  persistent menu background and ambience layer, which must stay continuous.

### Add an explicit route-surface registry plus shell wrappers

- Good: one classification drives veil behavior, board-art gating, and testable route
  expectations.
- Good: preserves ADR-0046's chrome-root-only fade model.
- Good: keeps `useScreenEntrance()` out of leaf components; the wrapper makes "include the
  fade" easier than omitting it.
- Bad: screens with multiple chrome roots need multiple wrapper instances.

## More Information

- Code: `frontend/src/ui/routeSurfaces.ts`,
  `frontend/src/ui/routeSurfaces.test.ts`, `frontend/src/ui/App.tsx`,
  `frontend/src/ui/shell/ArtRouteChrome.tsx`,
  `frontend/src/ui/shell/LightArtRouteShell.tsx`,
  `frontend/scripts/check-light-art-chrome.mjs`.
- First consumer fixed by this ADR: `SkirmishMapPicker` in
  `frontend/src/ui/SkirmishMapPicker.tsx`.
- Extended by [ADR-0063](0063-homepage-backdrop-is-one-continuous-instance.md): the shared menu
  scene + rain become one owned, re-parented instance (`HomepageBackdrop`) instead of a per-screen
  pair, so the "continuous backdrop" this ADR relies on is true for the scene, not just the rain.
- Builds on: [ADR-0043](0043-ui-motion-system.md),
  [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md).
