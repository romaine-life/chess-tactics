---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0447](0447-expunctio-scroll-end-shares-the-terminal-tile-keyline.md)"
refines:
  - "[ADR-0030](0030-scrollbars-never-vanish.md)"
  - "[ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
---

# ADR-0448: Expunctio scrollbar keys to the terminal frame rail

## Context

ADR-0447 correctly required one readable bottom keyline, but incorrectly treated
the terminal frame's corner atom as that keyline and constrained the correction
to scroll-content geometry. The inner frame is composite paint: its straight
bottom rail ends at the border box while its absolute corner atom continues
through a measured clip apron. At maximum scroll, the apron therefore places
the straight rail above the scrollport edge.

`KitScroll` independently drew its rail across the complete native viewport and
calculated thumb size and travel from that viewport height. Insetting only the
drawn rail would align its paint but leave the thumb calculations targeting the
old, longer track.

## Decision

- The terminal tile's straight bottom frame rail is the authoritative Expunctio
  bottom keyline. The corner atom remains paint-only ornament and may continue
  below it through its measured clip apron.
- Expunctio insets the drawn scrollbar's block end by the live inner-frame
  bottom-atom overhang. The scrollbar therefore terminates at the straight rail,
  not at the corner atom's tip or the scrollport boundary.
- `KitScroll` computes thumb height, position, and drag travel from the rendered
  drawn rail's actual height. Native viewport height continues to own scroll
  extent and the visible-content ratio.
- Verification at maximum scroll compares the live terminal frame border with
  the live rail and thumb endpoints in both one- and two-column layouts. A
  derived ornament endpoint is not an alignment measurement.

## Consequences

- The terminal frame and scrollbar present one horizontal stopping line while
  retaining the complete corner ornament below it.
- Contract-owned scrollbar insets no longer corrupt thumb sizing, terminal
  position, or drag mapping in `KitScroll` consumers.
- Expunctio continues to use the canonical scrollbar and live chrome geometry;
  it does not acquire a screen-specific pixel nudge or a parallel scroll control.
