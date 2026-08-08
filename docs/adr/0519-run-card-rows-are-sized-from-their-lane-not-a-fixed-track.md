---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0516](0516-the-run-opens-with-a-formation-card-grant-on-a-band-deep-enough-to-turn.md)"
  - "[ADR-0507](0507-card-gold-divider-fitting-is-a-studio-viewer.md)"
---

# ADR-0519: Run card rows are sized from their lane, not from a fixed track

## Context

The Bona Vacantia grant and the Sectio are card screens: the whole screen exists so one card can be
chosen from three (four at a Quartermaster Sectio). Both rows laid out through one shared CSS
ladder — `repeat(auto-fit, minmax(196px, 236px))` — which has two problems, and neither of them is
"the number 236 is wrong".

**The rule never saw the lane it was in.** `auto-fit` sizes tracks from how many `196px` columns
*could* fit the lane and only then collapses the empty ones, so the three real cards rendered at
208px in a 1066px lane: the phantom tracks took the width. Card size therefore depended on a
number of columns nobody had asked for, and the row filled a fifth of a screen whose only content
it was.

**The rule never saw the lane's height either.** Nothing capped a card against the space above and
below it, so the ladder's only defence at a small window was to wrap — into a 3-row column inside a
lane that clips. At 740x430 the third card was already off-screen before this change.

Card size is also exactly the kind of number that is decided by looking, not by reasoning: it wants
a slider and a live surface, the way the gold-tier divider's coin got one in
[ADR-0507](0507-card-gold-divider-fitting-is-a-studio-viewer.md).

## Decision

**A live Run card row measures the lane it was given and prints the largest 5:7 face that fits it
in both axes, up to a tuned maximum.** One shared `RunCardRow` owns that for both screens:

```
card width = floor(min(maxWidth, (lane width - gutters) / cards, lane height x heightFill x 5/7))
```

There is no minimum width and no wrapping. A row that cannot be big is small; it is never clipped
and never dealt across two lines, because a dealt card the player cannot see is worse than a small
one.

**The three numbers are Git-owned and tuned in the Studio.** `frontend/src/ui/runCardRowSizing.json`
carries `maxWidth`, `heightFill` and `gap`; Studio → **Card Size** mounts the real row inside a box
the exact size of the Run's card lane at each verified window, and **Save runtime defaults** writes
that file through `PUT /api/studio/run-card-row-sizing/defaults` — the same shape as ADR-0507's
route: named dev harness only, loopback only, admin-gated, no client-supplied path, no live-media
bytes and no database state. Reset returns to the committed baseline (ADR-0057) and Copy hands over
the JSON.

**The shipped baseline is `maxWidth: 360`, `heightFill: 90`, `gap: 16`** — 344x482 cards at
1440x900, against 208x291 before.

**The Sectio's lane now stretches like the grant's.** Its card section takes the workspace's
leftover height so the row has a real box to measure; a shopkey section underneath keeps its own
natural height. A band wrap frames the row itself and keeps its existing flex lane and its own
window-derived fit — it is excluded, not converted.

The shared `.run-card-grid` ladder stays exactly as it was. It is the pre-measurement fallback, the
layout anywhere `ResizeObserver` is absent, and the review surfaces' own rule; the live rows
override it with measured tracks.

## Consequences

- Both card screens read as card screens. A card is 1.65x wider at 1440x900, and three
  cards fit unclipped at 740x430 for the first time.
- Card size is now a property of the room, not of a CSS constant: a wider Controls rail or a new
  workspace inset changes the cards without anyone editing a track size.
- The row's box must be a real box. A future host that mounts `RunCardRow` in an auto-height lane
  gets the fallback ladder, not a measured fit — which is visible, not silent, because the row
  stops filling.
- One more Studio instrument writes to the checkout. Like the divider's, it exists only under
  `devctl` and never touches production data.
