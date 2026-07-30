---
status: superseded by ADR-0237
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0237](0237-run-destinations-fill-the-shell-workspace.md)"
---

# ADR-0236: Run opening draft fills the shell workspace

## Context and Problem Statement

The first Run opening draft was implemented as a titled outer panel inside the
Skirmish shell's left playfield. The parent added a gutter and the child added
another exterior frame, leaving an uncovered band around a top-level gameplay
destination and making the draft look like a window inside the Run screen.

This repeats the ownership mistake retired for Level Editor Events by ADR-0144.
The Run shell already owns the title bar, complete left playfield, and right
Controls rail. The opening draft is replacement content for that playfield, not
a second window.

## Decision Outcome

The Run opening draft fills the shell-owned left playfield from the title
divider to the bottom edge and from the left edge to the Controls divider.

- The outer-role material reaches every edge through the shared fill-only
  `ShellWorkspace` primitive.
- Content spacing is padding inside that continuous surface; it does not expose
  an empty parent gutter.
- The draft does not instantiate `OuterChromeBox`, register an `outer-panel`
  consumer, or draw another title frame, rails, or corner atoms.
- The draft heading is ordinary workspace content. The selectable bundle cards
  remain registered inner-chrome controls.
- The shared primitive is workflow-neutral and is also the canonical
  implementation for the Level Editor shell workspaces governed by ADR-0144.

Other Run layouts may still compose local panels when they genuinely contain
multiple subordinate surfaces. A single top-level destination must not be
wrapped in an outer panel merely to give the destination a background.

## Consequences

- The opening draft reads as the Run's current main mode and consumes the whole
  available playfield.
- The title bar, draft, and Controls rail cannot expose an accidental shell gap.
- A source-structure regression guard rejects restoring the `run-draft`
  outer-panel consumer or its padded wrapper.
- Level Editor and Run now share one discoverable full-pane primitive rather
  than maintaining parallel implementations.

## More Information

- Refines [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md).
- Generalizes the shell-workspace ownership model established by
  [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md).
- Implements the reuse requirement in
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
