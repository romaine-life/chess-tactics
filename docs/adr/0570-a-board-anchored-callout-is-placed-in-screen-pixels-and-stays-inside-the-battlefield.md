---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)"
  - "[ADR-0559](0559-a-promotion-asks-as-the-move-is-played-not-as-it-lands.md)"
---

# ADR-0570: A board-anchored callout is placed in screen pixels, and stays inside the battlefield

## Context and Problem Statement

The owner: *"the promotion dialog gets cut off by the control panel sometimes."* The screenshot
showed **PAWN PROMOTING / Choose what this P…** sliced down its right edge by the Controls panel,
with two of the four replacement choices behind it.

ADR-0504 put the question on the board because the board is what caused it: a zero-size anchor
seated on the promotion square, inheriting the camera's pan and zoom, with the callout applying
the inverse zoom so its controls stay one legible screen size. That is still right. But the
battlefield is a free-panned canvas that deliberately **bleeds behind** the title bar and the
Controls panel — the whole point of dropping the overflow clip on the board's own containers —
so anything anchored to a square inherits that bleed and can be drawn under opaque chrome.

Two separate faults put it there.

**The stylesheet had quietly taken the placement away.** The callout said `position: absolute`
and placed itself with `right`/`left`/`top` relative to the anchor. It also wears the registered
inner chrome frame, and `.inner-chrome-box.has-chrome-surface-fill` sets `position: relative` —
later in the file, at equal specificity, so it wins. The insets therefore stopped being offsets
from the seat and became nudges from a *flow* position, and that flow box is 296 **board** units
wide, not 296 screen pixels. So the callout's distance from its Pawn scaled with the camera:
measured on the live board, a promotion whose seat sat at x=860 opened a box spanning 827→1123
while the panel began at 973. `is-left` and `is-right` barely differed — both landed to the right
of the Pawn, 72px apart. Zooming in threw it further right, which is the *sometimes*.

**Nothing kept it on screen.** Even placed correctly, the side was chosen by the sign of the
seat's board-space `left` — "toward the board's middle". Once the camera has panned or zoomed,
the board's middle is not the screen's middle, so the rule could aim the callout at the panel
with complete confidence.

## Decision

**The callout's offset from its Pawn is stated in screen pixels past the inverse scale, and the
resulting box is kept inside the battlefield region.**

- **Placement rides the `transform`, not insets.** `scale(1/zoom) translate(dx, dy)` with
  `transform-origin: top left`: the scale happens about the element's static position — the
  anchor on the promotion square — and the translate that follows is in the already-descaled
  space, so `dx`/`dy` are exact screen pixels at every zoom. `position` is removed from the
  callout's rule entirely, because a translate from a static position lands identically whether
  the box computes to static, relative or absolute. The trap that caused this cannot be re-armed
  by a stylesheet the component cannot see.
- **The side is chosen from the room the SCREEN has**, not the board: the callout opens toward
  whichever side of the seat has more of the battlefield on it, and flips if its 296px box will
  not fit there.
- **The battlefield region is `.skirmish-field`** — everything the board owns up to the Controls
  divider, which is exactly the box the chrome does not cover. The callout is slid back inside it
  on both axes, and a region smaller than the callout pins it to the near edge rather than pushing
  its heading and first choice out past the far one. A callout overlapping its own square beats a
  legible one nobody can click.
- The geometry — 72px clear of the Pawn, rising 156px above the seat — is unchanged. It was
  always meant to be screen pixels; now it is.

### Consequences

- Good: the question is answerable wherever the Pawn promotes, at any zoom, at any pan, and at
  the narrow responsive widths where the board region is barely wider than the callout.
- Good: the placement is a pure function of three rects, so the flip and both clamps are unit
  tested rather than eyeballed.
- Cost: the placement is measured in a layout effect on every render while the picker is open —
  two `getBoundingClientRect` calls — because the seat travels across the screen whenever the
  camera moves and a pan is not a prop of this component. An unchanged placement re-renders
  nothing.
- Cost: on a cramped viewport the callout may cover the square it is asking about. That is the
  deliberate last resort, and it is the only case where it overlaps at all.

## More Information

Reproduced end to end on the live board — a real click promoting at the east corner — before and
after: `827→1123` against a panel at `973`, then `492→788`. `promotionPickerPlacement` in
[`frontend/src/ui/PawnPromotionPicker.tsx`](../../frontend/src/ui/PawnPromotionPicker.tsx) is the
whole rule.
