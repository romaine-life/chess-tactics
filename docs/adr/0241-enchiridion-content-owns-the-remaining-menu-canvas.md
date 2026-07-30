---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0240](0240-relic-reference-selection-owns-one-description.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0241: Enchiridion content owns the remaining menu canvas

## Context

The main-menu Enchiridion preserved the menu's nominal 572px action-column cap
after its section rail. That cap was invisible, but it still clipped the
two-column relic browser while leaving usable scenic canvas empty to the right.
Sizing the overall workspace to the viewport did not solve the defect because
the inner content column remained capped.

The owner chose to remove that invisible content column rather than compress
the relic list and selected record into it.

## Decision

- The main-menu rail and Enchiridion section rail retain their canonical width,
  indentation, and alignment language.
- After those two rail anchors, Enchiridion content consumes the remaining
  visible main-menu canvas through the standard right-side gutter.
- `--col-action-w` is not a maximum width for Enchiridion content. It remains
  the action-column width for ordinary main-menu destinations.
- The relic browser uses its existing side-by-side layout when the resulting
  content pane is wide enough and its existing stacked responsive layout when
  it is not.
- The Battle-hosted Strategikon composition is unchanged. It continues to size
  Enchiridion against the Battle pane rather than the main-menu canvas.
- ADR-0240's tooltip decision remains in force: relic-reference entries are
  direct selection buttons and the selected record is the sole visible
  description authority.

## Consequences

- Relic details no longer clip against an invisible action-column boundary.
- Wider menu viewports contribute useful reference space instead of empty
  scenery beside cramped content.
- Other menu destinations keep their established fixed tab/action column
  system.
