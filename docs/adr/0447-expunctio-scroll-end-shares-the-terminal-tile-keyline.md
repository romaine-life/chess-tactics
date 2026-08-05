---
status: superseded by ADR-0448
date: 2026-08-05
deciders: owner (Nelson) + Codex
superseded_by: 0448-expunctio-scrollbar-keys-to-the-terminal-frame-rail.md
refines:
  - "[ADR-0030](0030-scrollbars-never-vanish.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
---

# ADR-0447: Expunctio scroll end shares the terminal tile keyline

## Context

Expunctio uses the canonical always-present drawn scrollbar, but its scroll
content retained a trailing block inset after the last gallery row. At the end
of the scroll range, that empty strip made the scrollbar continue visibly below
the final tiles even though both structures belonged to the same gallery.

The inset did not provide separation between peers or protect clipped artwork;
it created a second, conflicting bottom edge.

## Decision

- The final Expunctio tile frame and the shared drawn scrollbar terminate on one
  bottom keyline at the end of the gallery.
- Expunctio's scroll content retains its small opening inset but has no trailing
  block-end inset.
- The canonical `KitScroll` rail remains always present and owns overflow. This
  decision changes only the gallery content geometry, not scrollbar rendering or
  behavior.

## Consequences

- The last panel no longer floats above the scrollbar endpoint when the player
  reaches the bottom of the gallery.
- The opening breathing room remains intact, and longer galleries continue to
  scroll through the same shared primitive without a screen-specific scrollbar.
