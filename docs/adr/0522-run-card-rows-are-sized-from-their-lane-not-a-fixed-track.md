---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0516](0516-the-run-opens-with-a-formation-card-grant-on-a-band-deep-enough-to-turn.md)"
  - "[ADR-0507](0507-card-gold-divider-fitting-is-a-studio-viewer.md)"
  - "[ADR-0029](0029-catalog-category-requirements.md)"
---

# ADR-0522: Run card rows are sized from their lane, not from a fixed track

## Context

The Bona Vacantia grant and the Sectio are card screens: the whole screen exists so one card can be
chosen from three (four at a Quartermaster Sectio). Both rows laid out through one shared CSS
ladder — `repeat(auto-fit, minmax(196px, 236px))` — which has two problems, and neither of them is
"the number 236 is wrong".

**The rule never saw the lane it was in.** `auto-fit` sizes tracks from how many `196px` columns
*could* fit the lane and only then collapses the empty ones, so the three real cards rendered at
208px in a 1054px lane: the phantom tracks took the width. Card size therefore depended on a
number of columns nobody had asked for, and the row filled a fifth of a screen whose only content
it was.

**The rule never saw the lane's height either.** Nothing capped a card against the space above and
below it, so the ladder's only defence at a small window was to wrap — into a 3-row column inside a
lane that clips. At 740x430 the third card was already off-screen before this change.

Card size is also exactly the kind of number that is decided by looking, not by reasoning. Two
things follow from that, and the first attempt at this ADR got both wrong:

- **A knob that scales a number which is already slack does nothing.** A px maximum and a
  percentage-of-height only move the cards when they happen to be the binding constraint; on an
  ordinary window the lane width binds, and both controls sit dead under the hand.
- **A card mounted in a bare bounded box is not a card on a screen.** Reviewing a row inside a
  neutral rectangle answers a question nobody asked. The Pages catalog (ADR-0029) settled the right
  shape already: iframe the real route at live window size and drive it.

## Decision

**A live Run card row measures the lane it was given and prints the tuned share of the largest 5:7
face that fits it in both axes.** One shared `RunCardRow` owns that for both screens:

```
fits       = min((lane width - gutters) / cards, lane height x 5/7)
card width = floor(min(ceiling, fits x size%))
```

`size` is the knob, and it is the knob precisely because what it scales is whatever the room
allows — it moves the cards at every point of its travel, on every window. `ceiling` is a px guard
for windows large enough that a full-size row would be absurd; on an ordinary window the lane binds
first and it does nothing, which is what a ceiling is for. The row reports which of the three it
answered to in `data-run-card-bound-by`, so a dead-looking control can be read rather than guessed.

There is no minimum width and no wrapping. A row that cannot be big is small; it is never clipped
and never dealt across two lines, because a dealt card the player cannot see is worse than a small
one.

**The numbers are Git-owned and tuned against the real screens.** `frontend/src/ui/runCardRowSizing.json`
carries `size`, `maxWidth` and `gap`. Studio → **Card Size** is a Pages-shaped dressing room: it
iframes the actual `/run` route — Bona Vacantia or Sectio, selected in the controls — at live window
size scaled by the Viewer zoom, and auditions a draft by injecting `--run-card-size`,
`--run-card-max-width` and `--run-card-gap` into that document through the shared
`useInjectedStyle` handshake. `RunCardRow` reads those properties off itself, so a slider moves the
cards on the screen they ship to, and the readout is scraped back out of the previewed row rather
than recomputed beside it. Opening the instrument crafts the account's active Run onto the previewed
state, which is what a disposable Run is for.

**Save runtime defaults** writes that one file through `PUT /api/studio/run-card-row-sizing/defaults`
— the same shape as ADR-0507's route: named dev harness only, loopback only, admin-gated, no
client-supplied path, no live-media bytes and no database state. Reset returns to the committed
baseline (ADR-0057) and Copy hands over the JSON. Nothing in the shipped app sets the audition
properties.

**The shipped baseline is `size: 100`, `maxWidth: 560`, `gap: 16`** — 340x476 cards at 1440x900,
against 208x291 before.

**The Sectio's lane now stretches like the grant's.** Its card section takes the workspace's
leftover height so the row has a real box to measure; a shopkey section underneath keeps its own
natural height. A band wrap frames the row itself and keeps its existing flex lane and its own
window-derived fit — it is excluded, not converted.

The shared `.run-card-grid` ladder stays exactly as it was. It is the pre-measurement fallback, the
layout anywhere `ResizeObserver` is absent, and the review surfaces' own rule; the live rows
override it with measured tracks.

## Consequences

- Both card screens read as card screens. A card is 1.63x wider at 1440x900, and three cards fit
  unclipped at 740x430 for the first time.
- Card size is now a property of the room, not of a CSS constant: a wider Controls rail or a new
  workspace inset changes the cards without anyone editing a track size.
- The row's box must be a real box. A future host that mounts `RunCardRow` in an auto-height lane
  gets the fallback ladder, not a measured fit — which is visible, not silent, because the row stops
  filling.
- `RunCardRow` re-reads its computed properties whenever a stylesheet enters or changes in the
  document head. Unchanged numbers cost one computed-style read and no render, so ordinary head
  churn is free; the cost buys an audition channel with no runtime seam of its own.
- One more Studio instrument writes to the checkout, and one more crafts a Run when opened. Both
  exist only under `devctl` and neither touches production data.
