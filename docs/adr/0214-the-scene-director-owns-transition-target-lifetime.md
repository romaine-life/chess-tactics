---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0205
  - ADR-0211
---

# ADR-0214: The scene director owns transition-target lifetime

## Context

The scene director could enter its authored `exiting` phase while React independently
destroyed the outgoing scene boundary because pending destination identity changed its
key. CSS still declared a fade, but there was no surviving visual object to animate.
Persistent-host transitions also encoded menu, Play, and Settings targets through
separate selectors, so the same transition language depended on route-specific CSS.

At the other extreme, treating every control response as a scene would make tabs,
toggles, selected units, overlays, steppers, and other immediate local feedback feel
unnecessarily heavy.

## Decision

The transition harness owns the lifetime of every navigationally replaceable drawn
region.

- A replaceable region declares one canonical `SceneTransitionTarget`, identified by
  its authored scene host and a rendering mode (`self` or layout-preserving `contents`).
- The director selects exactly one active target for a navigation generation. Shared
  exit, preparation, inertness, painted acknowledgement, entrance, and failure logic
  operate on that target without host-specific CSS.
- Pending route intent may not change the mounted target's React identity. The
  committed outgoing target remains the same DOM object throughout exit. React may
  replace it only after the director commits the destination while the target is
  hidden.
- Navigational drawing is transition-managed by default under ADR-0211: a click that
  replaces an authored scene slot must use the director.
- Component-local interaction remains immediate by default: tabs, toggles, sliders,
  selections, board overlays, inspectors, dialogs, and gameplay commands do not enter
  the scene lifecycle unless they replace an authored navigable drawn region.
- A control panel may contain both kinds. Its local tabs remain immediate; an explicit
  navigation control inside it still requests a scene transition.

## Consequences

“Fade this outgoing UI” now means one target lifecycle regardless of whether the target
is the complete scene, a menu destination, a Play destination, or a Settings panel.
Adding another persistent host requires declaring a target, not adding phase-specific
selectors.

The gameplay HUD remains responsive for local inspection and commands. Its tab strip is
an explicitly marked immediate-local scope and cannot silently become scene navigation.
Rendered verification must prove both sides: outgoing target identity survives and
fades during navigation, while local HUD tab changes leave the scene generation and
phase unchanged.
