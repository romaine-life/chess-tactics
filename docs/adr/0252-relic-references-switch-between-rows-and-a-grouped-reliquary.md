---
status: superseded by ADR-0253
date: 2026-07-30
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0253](0253-relic-reference-selection-owns-one-description.md)"
supersedes:
  - "[ADR-0251](0251-relic-references-use-an-artwork-first-reliquary.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0217](0217-run-relic-icons-use-immediate-styled-tooltips.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0252: Relic references switch between rows and a grouped reliquary

## Context

ADR-0251 corrected the original oversized relic rows by replacing them with
individually framed artwork swatches. The owner retained a preference for named
rows and clarified that a batch of artwork should not repeat a box around every
item: the grouped alternative should own one containing frame around an
otherwise invisible icon grid. Neither presentation should exclude the other.

## Decision

- The relic browser begins in **Rows** view and exposes one two-state tab control
  at the top of the relic-selection column: **Rows** and **Grouped**.
- Rows use the canonical `inner-list-row` primitive with a 48px relic icon and
  visible name. The corrected row geometry keeps both within the frame.
- Grouped view uses one canonical `InnerChromeBox` around the entire batch.
  Inside it, native 64×64 relic artwork occupies an invisible grid with no
  per-item box, background, border, or shadow.
- Hover, keyboard focus, and the active grouped relic may brighten the artwork
  without introducing another frame. Both views keep the shared styled
  name/effect tooltip and accessible label.
- Switching views preserves the selected relic and selected-record content.
  The record remains content-sized and shared by both hosts.

## Consequences

- Players may browse by readable names or scan the collection visually.
- The grouped view reads as one collection instead of twenty miniature panels.
- The row view remains useful without restoring the icon/frame collisions that
  prompted ADR-0251.
