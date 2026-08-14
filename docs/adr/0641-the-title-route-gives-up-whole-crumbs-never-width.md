---
status: accepted
date: 2026-08-13
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0409](0409-the-title-route-is-a-clickable-breadcrumb.md)"
  - "[ADR-0023](0023-app-title-bar-layout-and-controls.md)"
---

# ADR-0641: The title route gives up whole crumbs, never width

## Context

The persistent screen-name line is a breadcrumb — `Run › Battle › Strategikon › Chartulary` —
and it had no answer for a brand column narrower than itself. `.brand-lockup-route` and
`.title-route-segments` were `min-width: 0` flex rows and `.title-route-button` carried
`min-inline-size: 0`, so under pressure every crumb AND every separator gave up a share of
itself at once. Measured at 1440 on that route: the trail wants 258px and the column offers it
191px, and the line rendered as `RUN › BATTLESTRATEGIKONCHARTUL` — each word overflowing its own
shrunken box and painting across the separator beside it, the tail cut mid-word. Even the base
`Run` crumb was drawn 18.7px wide against the 24px its word needs.

This was not a regression from any one change. The phone band at `@media (max-width: 620px)`
already answers the same pressure by dropping `.brand-lockup-route` outright — *"a three-level
trail is not a phone affordance anyway"* — and desktop simply had nothing.

Three answers were available: shed whole segments, ellipsize crumbs into their own boxes, or
clip. The measurements rule two of them out. Truncation degrades continuously and keeps every
ancestor clickable, which is the better fit for ADR-0409, and it was built first — at 1440 it
reads `RUN › BATTLE › S… › CHARTULARY`, which is fine. It cannot reach 1280. There the Run's
centre status takes 796px of the bar and both `1fr` outer tracks fall to 226px, leaving the
trail 115px; the last crumb (80px) plus the two separators bracketing an elided middle (23px
each) already want 126px. No amount of narrowing the ancestors gets the place you are onto that
screen, because the separators are not the part that shrinks. Clipping alone lands the cut on
the last crumb, which is the one word the trail exists to say.

## Decision

- A crumb is never narrower than its own word. `.title-route-button` is `flex: none`, and so
  are the separators and the `::before` mark between the screen name and the trail. Overflow is
  answered by choosing what to DROP, never by letting the words collide.
- What drops is whole crumbs, each with the separator that follows it, replaced by one ellipsis
  carrying its own trailing separator. The order is fixed: the middle first and shallowest-first,
  so the ancestor nearest your position is the last name to survive; then the screen the route
  names; never the segment you are on.
- `TitleRoute` measures and applies this itself, on mount, on resize, on a `ResizeObserver` over
  its own box, and once fonts settle — the trigger set `FittedTabLabel` already established.
  Every pass puts the WHOLE trail back before measuring, because the brand lockup is
  `justify-self: start` and shrink-wraps to what is rendered: measured while crumbs are shed it
  reports the shed width back as the space available, and a widened window could never return a
  name.
- The ellipsis is chrome, not a name. It wears the separator colour, it is `aria-hidden`, and it
  is not a NavButton: a shed ancestor is no longer named, so under ADR-0409 there is no canonical
  address for it to be. Shed crumbs are `hidden`, so they leave the accessibility tree with the
  pixels — the route announces exactly what it offers.
- `.brand-lockup-route` and `.title-route-segments` are `overflow: hidden`. That is the last
  resort once nothing is left to shed, and it is also what renders before the first measurement:
  a clip, never a collision.

## Consequences

- Measured on `Run › Battle › Strategikon › Chartulary`: 1920 and 1600 show the whole trail,
  1440 shows `RUN › BATTLE › … › CHARTULARY`, 1280 and 1100 show `RUN › … › CHARTULARY`. A
  sweep down those widths and back up lands on the same reading at the same width in both
  directions, and nothing clips at any of them.
- ADR-0409's promise that every named ancestor is reachable is kept only for ancestors that are
  still named. A shed one is reached from the base crumb, which is the last to go.
- The bar's own allocation is untouched and remains the real constraint: at 1280 a Run gives its
  centre status 796px and its two navigation anchors 226px each. The phone band inverts that
  (`auto minmax(0, 1fr) auto`) on exactly the argument that would apply here; extending it to
  desktop moves the centred status off centre and is a separate decision.
- `check-titlebar-geometry.mjs` read a rect off a missing region and crashed before its first
  assertion on every route whose centre slot is absent or empty — every menu screen, and the Run
  Strategikon route this decision is about. It tolerates a missing region now, so the gate can
  actually run where the trail gets longest.
- No gameplay, save-shape, RunSaveVersion, database-schema or media change.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
