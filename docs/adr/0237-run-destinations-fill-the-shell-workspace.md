---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0306](0306-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s removal of Opening draft as a destination"
---

# ADR-0237: Run destinations fill the shell workspace

## Context and Problem Statement

ADR-0236 removed the exposed parent gutter and duplicate outer frame from the
Run opening draft. It was too narrow: Deployment, Shop, Victory, Army, unit
profiles, Sell Units, and transient Run states still used the abandoned
`run-workspace` gutter plus a top-level `OuterChromeBox`. The next destination
therefore restored the same empty band immediately after the compliant draft.

The Skirmish shell already owns the complete left playfield and the right
Controls rail. A player-facing Run destination replaces the playfield; it is
not a subordinate window within that playfield. Screen-by-screen exceptions
make that ownership rule unreliable and allow a local fix to leave adjacent Run
states in direct violation.

## Decision Outcome

Every player-facing, non-Battle Run destination fills the shell-owned left
playfield through one shared `RunWorkspace`, which composes the workflow-neutral
`ShellWorkspace` primitive:

- Opening draft, Deployment and its preview, Shop and Loot Shop, Victory, Army
  ledger, full-pane unit profile, Sell Units, loading, and no-active-Run states
  all use the same edge-to-edge workspace.
- The outer-role material reaches every playfield edge. Content gutters,
  two-column layouts, scrolling, and the relic inventory reservation live
  inside that continuous surface and never expose the parent behind it.
- A destination does not instantiate `OuterChromeBox`, register an
  `outer-panel` consumer, or draw another title frame merely to acquire a
  background. Destination headings are ordinary workspace content.
- The Battle destination remains the authored board surface. Opening Army over
  Battle replaces the left playfield with the same full-pane Run workspace
  without changing Battle lifetime.
- Subordinate cards, rows, buttons, dropdowns, tooltips, and statistics may use
  registered inner chrome. Run controls use the canonical shared control
  primitives rather than raw browser checkboxes or selects.
- Run layout spacing, including internal padding and relic offsets, resolves
  through the design-system spacing roles and scale governed by ADR-0031.
- Source-structure guards enumerate the Run destinations and reject both
  top-level outer-panel consumers and a return of parent workspace padding.

Developer-only review surfaces are not player-facing Run destinations and keep
their separately governed review composition.

## Consequences

- Moving from one Run phase or Run view to the next cannot reveal a different
  shell ownership model or an empty perimeter band.
- Army and unit profiles satisfy ADR-0230's full-pane requirement.
- The Run-specific wrapper makes the invariant discoverable and keeps
  route/state components from rebuilding the fill composition independently.
- Adding a new Run destination requires using the shared workspace and updating
  the destination inventory in its regression guard.

## More Information

- Supersedes [ADR-0236](0236-run-opening-draft-fills-the-shell-workspace.md).
- Generalizes the shell-workspace ownership model established by
  [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md).
- Enforces the shared-primitive rule in
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
- Enforces the Run Army/profile requirements in
  [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md).
- Uses the spacing contract in [ADR-0031](0031-ui-spacing-system.md).
