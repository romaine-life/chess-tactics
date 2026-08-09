---
status: "accepted; partially supersedes ADR-0030's always-visible rail and reserved gutter"
date: 2026-08-08
deciders: Nelson, Claude
---

# ADR-0534: A scroll rail is drawn only when there is something to scroll

[ADR-0030](0030-scrollbars-never-vanish.md) decided that the drawn rail is **always**
present — bare groove when empty, reserved inline gutter either way, "the frame never
moves." This revisits the empty case only.

## Context and Problem Statement

The Editor rail's **Workspace** list holds two rows. It cannot scroll, so ADR-0030's bare
groove stood beside it for its whole height, and the 18px it reserved pushed both rows
short of the right edge — while the pinned **New Level / Import / Save** verbs directly
beneath them, which are outside the scroll pane, ran the full width. The owner read that
as the rows being smushed by a bar that does nothing, and asked for the rail to stay
hidden until it is needed.

ADR-0030's evidence (NN/g, Baymard) is about scrollable content whose scrollbar is hidden
or auto-hidden — a user missing content that is really there. It says nothing about a pane
with nothing to scroll, which is the only case at issue here. Clause 2 of that ADR already
calls a thumb with nothing to scroll a *false affordance*; a groove with nothing to scroll
is the same promise made more quietly, and it is charged 18px of row width for it.

## Decision Outcome

Chosen: **an idle pane draws no rail and reserves no gutter.**

1. **The rail is drawn exactly when the content overflows.** No overflow, no groove — and
   the inline strip it reserved goes back to the rows, which then run the full width of
   their pane. Overflow restores both together. ADR-0030 clauses 2, 4 and 5 stand
   unchanged: the thumb is still overflow-only, the rail is still drawn DOM (so it still
   screenshots), and it is still the same carved grip.

2. **One token carries the reservation.** `<KitScroll>` marks its wrapper
   `data-kit-scroll-rail="reserved" | "collapsed"`; the collapsed state stops the paint and
   zeroes `--kit-scroll-gutter`. A consumer declares what it wants as
   `--kit-scroll-gutter-size` and **reserves its space from `--kit-scroll-gutter`** — never
   from a literal, or its rows keep standing clear of a rail that is no longer there.
   Settings' separate 24px region and the Level Editor palette's overhang-aware padding are
   both expressed that way. A clearance split across two elements — the Editor rail's 18px
   of groove plus a 6px breath padded onto the list *inside* the scroll pane — is declared
   as one 24px gutter on the wrapper instead, because half a reservation collapsing is worse
   than none: the rows come back six pixels short of the verbs pinned beneath them.

3. **A framed gutter is exempt — the frame still never moves.** Where the gutter is a
   declared grid column with drawn dividers and junctions on its sides
   (`.chrome-divided-grid__scroll`, so the Run army ledger), the rail is a member of that
   frame rather than a bar floating beside the rows. Collapsing it would leave an empty
   framed strip and move every junction on the boundary, so those rails stay drawn when
   idle. ADR-0030 clause 3 continues to govern framed gutters.

4. **The rail element stays mounted, hidden by `visibility`.** Per ADR-0448 the thumb's
   track is the rail's *rendered* height, so unmounting it would leave nothing to measure
   and the rail could never come back. It is hidden, not removed.

5. **Width-sensitive content latches to the drawn rail.** Collapsing the gutter widens the
   content, and content whose height grows with its width — an image grid, an aspect-ratio
   card lane — can overflow at the wider measure and fit again at the narrower one. Left
   alone that ping-pongs forever. A horizontal gutter cannot change the viewport's height,
   so an unchanged `clientHeight` identifies one settling episode; after two flips inside
   it, `resolveKitScrollGutter` latches to the drawn rail — ADR-0030's always-on state,
   which is stable under both widths — until the pane is resized or its content changes.

### Consequences

- Good: a pane that cannot scroll looks like a pane that cannot scroll, and spends none of
  its width saying so. The Editor rail's rows now line up with the verbs beneath them.
- Cost: adding enough content to cross the overflow threshold reflows the pane by the
  gutter width — the reflow ADR-0030 clause 3 was written to prevent. Accepted for
  unframed panes: the frames that carry drawn dividers are exempt above, so no drawn line
  moves.
- Cost: the decision is measured, so it costs a settling pass on first layout and a latch
  for pathological content. Bounded at three flips per episode and covered by
  `KitScroll.test.ts`.

## More Information

- The policy this revises: [ADR-0030](0030-scrollbars-never-vanish.md).
- Rail-derived thumb geometry, unchanged: [ADR-0448](0448-expunctio-scrollbar-keys-to-the-terminal-frame-rail.md).
- Implementation: `resolveKitScrollGutter` in `frontend/src/ui/KitScroll.tsx`; the
  `--kit-scroll-gutter` / `--kit-scroll-gutter-size` pair and the
  `[data-kit-scroll-rail='collapsed']` rules in `frontend/src/style.css`.
