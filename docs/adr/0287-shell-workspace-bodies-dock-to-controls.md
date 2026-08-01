---
status: superseded by ADR-0288
date: 2026-08-01
deciders: owner (Nelson) + Codex
superseded_by: ADR-0288
supersedes:
  - ADR-0279
---

# ADR-0287: Shell workspace bodies dock to Controls

## Context and Problem Statement

`ShellWorkspace` standardized the outer-role surface fill but left each consumer
to place its visible body, frame, content inset, and scrollbar. Run Army and
Strategikon therefore used the same nominal workspace primitive while stopping
their visible content at different consumer-authored gaps before Controls. The
source guards verified the shared wrapper and background edge, so both defects
passed despite violating the same visible boundary.

ADR-0279 also mirrored the main-menu start inset at Strategikon's inline end.
That put deliberate empty space between its primary body and Controls, which is
the opposite of the shell ownership established by ADR-0144, ADR-0237, and
ADR-0240.

## Decision Drivers

- The left shell workspace and Controls have one stable, shell-owned boundary.
- Every replacement workspace must solve that boundary through one reusable
  composition rather than route, state, or workflow selectors.
- A background reaching Controls is not sufficient when the primary visible
  body or its scrollbar still stops inside an unrelated perimeter.
- Battle's scenic breathing room must not change the workspace allocation or
  the mounted board's camera fit.

## Considered Options

- Keep the fill-only wrapper and remove end padding independently in each
  consumer.
- Make an edge-attached body part of the shared shell-workspace composition and
  migrate every consumer.

## Decision Outcome

Chosen: **make an edge-attached body part of the shared shell-workspace
composition**, because the Controls-facing boundary is shell behavior, not
workflow styling.

- `ShellWorkspace` owns the complete left host and its continuous outer-role
  fill. `ShellWorkspaceBody` is the reusable content-body composition inside it.
- The body always reaches the Controls boundary: its logical inline-end inset is
  zero. Its block and inline-start insets are shared variables selected by the
  host family, never consumer-authored inline-end padding or negative offsets.
- Primary frames and drawn scroll rails stretch through that body to Controls.
  Text, controls, cards, and other subordinate content may keep breathing room
  inside their own semantic containers; that internal spacing does not move the
  body boundary.
- Strategikon, Level Editor Events/Rules, Level Artwork, and every
  `RunWorkspace` destination compose `ShellWorkspaceBody`. A direct
  `ShellWorkspace` consumer without that body is a contract violation.
- ADR-0279's main-menu inline-start and block alignment remains the source for
  Strategikon and Events/Rules. Its mirrored inline-end clause is retired; the
  Controls-facing end is attached instead.
- The shell grid itself has no board-to-Controls column gap. Only the ordinary
  Battle field owns a scenic inline-end gutter inside its stable allocation, so
  opening or closing a workspace cannot resize or refit the board.
- A rendered geometry gate compares the shell-workspace body and Controls
  boundary on live routes. Source checks remain useful for composition
  inventory, but cannot certify this visual invariant by themselves.

### Consequences

- Good: Run Shop, Run Army/Relics, Strategikon, and Level Editor replacement
  workspaces inherit one repeatable Controls-edge rule.
- Good: content-start tuning remains available without recreating a right-side
  shell gap.
- Good: adding a new workspace requires composing the shared body rather than
  discovering another padding convention.
- Cost: ADR-0279's symmetric content perimeter is no longer available for these
  shell-hosted workspaces; symmetry inside a subordinate panel must be authored
  within that panel.

## More Information

- Supersedes [ADR-0279](0279-main-menu-insets-govern-full-workspace-content.md).
- Extends [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md),
  [ADR-0237](0237-run-destinations-fill-the-shell-workspace.md), and
  [ADR-0240](0240-run-self-inspection-owns-the-left-shell-workspace.md).
- Enforces [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
- Consolidated in [the UI kit standard](../ui-kit-standard.md).
