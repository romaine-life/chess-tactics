---
status: superseded by ADR-0241
date: 2026-07-30
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0241](0241-enchiridion-content-owns-the-remaining-menu-canvas.md)"
supersedes:
  - "[ADR-0239](0239-relic-references-switch-between-rows-and-a-grouped-reliquary.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0217](0217-run-relic-icons-use-immediate-styled-tooltips.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0240: Relic reference selection owns one description

## Context

The Enchiridion relic browser already presents the selected relic's name,
effect, and history in a persistent record. Reusing the gameplay relic tooltip
there duplicated that same information. Because the tooltip wrapper retained
focus after a relic was selected, the selected tooltip could remain open while
another hover tooltip appeared.

The main-menu host also kept the reference workspace's nominal desktop column
width when the visible destination was narrower. That allowed the selected
record to extend beyond the right edge even though the record itself was
content-sized.

## Decision

- Rows and Grouped remain the two relic-reference views established by
  ADR-0239.
- Relics in this reference browser are direct selection buttons and never open
  hover, focus, active, or click tooltips. Their accessible names remain on the
  buttons.
- The selected relic record is the only visible authority for name, effect,
  and history in this workspace.
- The main-menu reference workspace is capped by the visible destination span.
  Its content column and selected record shrink within that host, while the
  canonical section-rail width, menu indentation, and Battle-pane composition
  remain unchanged.

## Consequences

- Selecting and then hovering relics cannot create overlapping duplicate
  descriptions.
- Rows retain their readable names and Grouped retains its artwork-first scan.
- The selected record remains fully visible in narrower desktop menu layouts
  without changing the Battle-hosted Strategikon layout.
