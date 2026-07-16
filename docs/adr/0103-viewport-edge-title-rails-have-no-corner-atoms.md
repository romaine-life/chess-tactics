---
status: "accepted"
date: 2026-07-15
deciders: Nelson, Codex
---

# ADR-0103: Viewport-edge title rails have no corner atoms

## Context

ADR-0100 retained outer corner atoms at the title bar and control panel's true
exterior corners. A route-local `chromeCorners=off` comparison demonstrated the
preferred treatment, but keeping it as a query option meant navigation restored
the old corners. The title bar is shared application chrome, not route state.

## Decision

The persistent title bar always uses the cornerless viewport-edge treatment.
Horizontal and vertical exterior rails continue beyond the visible canvas; they
do not turn to follow the screen edge and carry no exterior corner atoms.
Internal rail intersections continue to use divider-junction atoms.

The shared `AppTitleBar` owns this behavior unconditionally. Query parameters,
routes, and screens cannot enable or disable it.

## Consequences

- Navigation preserves one title-bar treatment throughout the application.
- The `chromeCorners` review parameter and its preview-only class are retired.
- ADR-0100's exterior-corner clause is superseded; its branched topology and
  internal junction requirements remain accepted.
