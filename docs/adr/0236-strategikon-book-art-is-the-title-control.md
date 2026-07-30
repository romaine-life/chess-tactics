---
status: superseded by ADR-0237
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0237](0237-strategikon-book-aligns-to-the-controls-content-boundary.md)"
supersedes:
  - "[ADR-0233](0233-strategikon-uses-a-divider-safe-book-control.md)"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
---

# ADR-0236: Strategikon book art is the title control

## Context

ADR-0233 removed the visible Strategikon label but retained a square inner
button frame around the book. This still reads as a miniature panel control
rather than the rare title-band navigation mark intended by the owner, and the
frame determines the placement instead of the book's own pixels.

## Decision

- The installed open-codex art is itself the Strategikon navigation control.
  It has no button background, border, frame, or shadow.
- The book is sized so its actual pixel-art mark has the same visual scale as
  the **Controls** title copy.
- The book's right inset mirrors the title copy's left inset from the
  corresponding outer border. Its complete art and hit target remain above the
  riveted title divider.
- Keyboard focus may add the required accessibility outline, and hover/open
  state may brighten the art; neither state introduces a button frame.
- ADR-0233's state-specific accessible names and hover explanations remain
  required.

## Consequences

- The title band contains one title and one peer navigation mark instead of a
  title plus a nested button.
- Alignment is governed by the shared title inset, so the two sides cannot
  drift independently.
