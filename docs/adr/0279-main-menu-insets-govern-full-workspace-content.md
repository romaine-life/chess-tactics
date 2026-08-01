---
status: superseded by ADR-0295
date: 2026-07-31
deciders: owner (Nelson) + Codex
superseded_by: ADR-0295
refines:
  - "[ADR-0031](0031-ui-spacing-system.md)"
  - "[ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)"
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0254](0254-enchiridion-content-owns-the-remaining-menu-canvas.md)"
---

# ADR-0279: Main-menu insets govern full-workspace content

## Context and Problem Statement

The main menu already establishes the visible column-start grammar used by its
rail and destination content: a fixed frame inset plus responsive block and
inline rail padding. Strategikon copied only the responsive rail padding and
added an unrelated board gap, so its apparent alignment was close but not
equal. The Level Editor Events/Rules workspace instead inherited the generated
outer-panel content inset. Neither surface defined what its opposite edges
should do.

These are full-page instruments rather than nested panels. They need one
perimeter rule that aligns with the application's existing navigation grammar
without turning their host-owned background fill into a smaller framed island.

## Decision

The main menu's responsive column-start geometry is the authority for the
content perimeter of Strategikon and the Level Editor Events/Rules workspace.
It is exposed as shared derived tokens:

- the main-menu frame inset plus responsive inline rail padding defines the
  inline content inset;
- the main-menu frame inset plus responsive block rail padding defines the
  block content inset;
- the inline start inset is mirrored at inline end, and the block start inset
  is mirrored at block end.

Strategikon's outer rail and content start on those exact main-menu coordinates.
Its content mirrors the coordinates at the Controls boundary and bottom edge.
The Events/Rules workspace uses the same two-axis perimeter instead of the
generated outer-panel content inset.

This perimeter belongs to content only. Each workspace's shell-owned surface
fill remains edge-to-edge, Strategikon still abuts the Controls shell with no
layout gap, and neither workspace adds an outer frame or new rail. The rule does
not automatically retune other `ShellWorkspace` consumers whose spacing is
governed by their own workflow contracts.

## Consequences

- Strategikon rail placement is exactly aligned with the main menu rather than
  being a visually similar copy.
- Prosopography, Lipsanotheca, and Strategikon Enchiridion share one symmetric
  outer content perimeter.
- Victory Rules and Other Events use that same symmetric perimeter.
- Responsive or tuner-driven changes to the main-menu inset propagate to both
  full-page instruments through shared tokens.
- Background material continues beneath the perimeter to every host boundary,
  including the Controls rail.
