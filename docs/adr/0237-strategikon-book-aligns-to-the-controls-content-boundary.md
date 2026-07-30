---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0236](0236-strategikon-book-art-is-the-title-control.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
---

# ADR-0237: Strategikon book aligns to the Controls content boundary

## Context

ADR-0236 aligned the book's visible right edge by mirroring the **Controls**
title copy's left inset. The owner clarified that the stronger relationship is
with the invisible content box respected by the Controls beneath the title.
The book is navigation for that panel, so its right edge should terminate on
the same boundary as the control row rather than derive its position from the
title typography.

## Decision

- The open-codex art remains the frameless Strategikon control, at the
  Controls-title pixel scale and entirely above the title divider.
- The book's visible right edge aligns with the right edge of the Controls
  content box used by the tab row and other panel controls.
- Positioning derives from the shared `--le-control-content-inset`. The
  installed book asset's transparent canvas edge is compensated inside that
  calculation so the visible pixels—not merely the image element—meet the
  boundary.
- Horizontal placement no longer derives from the title copy's inset.
- ADR-0236's hover, focus, and state-specific accessibility requirements remain
  in force.

## Consequences

- The book and the Controls beneath it share one stable right-hand alignment
  rail as the HUD or chrome geometry changes.
- Title typography may change independently without moving the Strategikon
  entry.
