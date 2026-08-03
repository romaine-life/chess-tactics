---
status: accepted
date: 2026-08-02
deciders: Nelson, Codex
refines:
  - "[ADR-0042](0042-title-bar-is-an-invariant-screens-add-slots.md)"
  - "[ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)"
  - "[ADR-0316](0316-plagued-icon-candidates-are-reviewed-in-context.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
---

# ADR-0365: A Run names its phase as route and its repeatable ideas as icons

## Context and Problem Statement

The Run title bar said everything in words. Three chips carried the War name over
`Ataraxia 0`, the gold, and `Conflict 1 · Battle 3/3` over `Shop`. Two problems
sat on top of each other:

- **The phase was filed as a footnote.** `Shop` is where you ARE in the Run — the
  same kind of fact as `Run`, `Settings` or `Level Editor`, which the shell already
  states as the screen-name line beneath the wordmark. Hanging it off the progress
  chip made the Run's position the smallest text on the bar and spent a chip line
  on it.
- **Every repeatable idea was a word.** Ataraxia, Conflict and Battle recur on
  every Run screen, at every Battle, for the life of the game. The bar had no
  visual vocabulary for them, while unit abilities and card properties already
  own native icons (ADR-0318).

## Decision

**The screen-name line is a route, and a screen may name its own position in it.**
`TitleBarConfig.routeSlot` renders one bounded portal after the screen name;
`<TitleBarSlot region="route">` fills it. The Run screen puts its phase there, so
the line reads `Run › Shop`. This is the same shape as the existing center/stud
regions — the screen keeps the state in its own component, the shell owns the
placement, and a screen may only ADD (ADR-0042/0104). It is orientation copy, never
a control; typed controls still go through `TitleBarControlContribution`.

The phase is document state, not address, so the shell cannot read it out of the
URL — which is exactly why it is contributed rather than derived in
`titleBarConfig`. While the portal is empty the line is the plain screen name it
has always been, chevron and spacing included.

**Ataraxia, Conflict and Battle each own a typed 64×64 icon role.** Their closed
semantic slots are `ui/kit/icons/run/{ataraxia,conflict,battle}.png`, runtime
component `run-progress-icon`, variant equal to the idea. The runtime never
substitutes one for another and never borrows a unit-ability or card-property
glyph for a Run position.

**One chip, and measures with no box.** The Run bar carries exactly one framed
chip: the identity it cannot draw — the War's name over the authored name of the
Battle you are at. Everything else is a **measure**, an icon and its number
sitting bare on the bar: Ataraxia tier, gold, Conflict, Battle. They are the same
kind of fact, so they read as one row of marks rather than a row of little boxes,
and a measure never gets a frame of its own.

Ataraxia is written as its symbol and its tier — the word is gone, and the tier's
name stays on hover rather than spending bar width. Because the measures are
compact marks and the named chip is the wide element, the chip is what sheds
first at compact widths, not the position.

A measure has no frame between it and the bar's painted wall, so its mark needs a
stroke to hold its silhouette — and **the stroke belongs to the artwork**. The
palette-forced generation dropped the black keyline the accepted ui-kit icons all
carry, so each candidate is post-processed by `scripts/bake-icon-stroke.mjs`: a
2px **outer** stroke in `#05080c`, grown from the sprite's own alpha. Outer, not
inner — an inner stroke only eats the sprite's mass, which against a mid-dark wall
reads as less, not more. The pass is deterministic pixel logic over pixels the
generator placed, so it lives in git while its output lives in blob storage, and
it neither resamples nor grows past the native 64×64 canvas.

A CSS drop-shadow ring was tried first and removed. It worked, but it is a soft
shadow standing in for a stroke the asset should carry — the wrong layer
(ADR-0011). Only the measure's NUMBER keeps a text shadow, which is ordinary type
treatment.

**A mark's raster is its art, not a frame.** The same bake trims every mark to its
occupied pixels and pads it to the square that bounds them. A 64×64 canvas filled
by anywhere from 20 to 62 pixels draws at wildly different scales and carries that
much invisible padding, which is what makes a row of marks look unevenly spaced.
Trimmed, one seat size draws every mark the same and the only spacing left is the
gap the row asks for — so the seat needs no per-icon compensating transform, and
the two that existed are gone.

The `run-progress-icon` and `run-resource-icon` families therefore accept a square
raster from 16×16 through 64×64 whose runtime frame equals its own side, rather
than exactly 64×64. Historical full-frame rasters stay valid: they are the case
where the ink already filled the frame. The established unit-ability and
card-property icons keep their exact 64×64 contract.

**The gold coin is the fourth mark in that row**, so it takes the same stroke and
the same trim. It is a shared production asset: those exact bytes are what every
surface that draws gold now draws.

**A mark is a symbol standing in for a word, so it names itself.** Every measure
is a shared `Tooltip` trigger — the game's own framed popup, on hover and on
keyboard focus — carrying the idea's name and what it means. Never a native
`title=""`, which is a browser convention rather than a game one (ADR-0052).

Two fixes in the shared primitive fell out of being its first title-bar consumer,
and both are general:

- A portalled popup now carries `chrome-family-surface` on its positioner. Chrome
  units only paint inside a chrome-family scope, and a popup that escapes to
  `<body>` — as any title-bar tooltip must, the bar living outside every screen's
  `<main>` — was rendering as unframed floating text.
- A trigger inside the persistent title bar anchors its popup below the WHOLE BAR
  rather than below itself. The bar is taller than the mark it frames and paints
  over what sits under it, so "below the trigger" put the tip's first line behind
  the chrome.

**A seat is reserved before its icon decision exists.** `installedUiMediaIfPresent`
returns null instead of failing closed, and the seat keeps its geometry, so
installing an icon later cannot move the label beside it. Required chrome keeps
using `installedUiMedia` and still fails closed.

**Selection is one owner act on the real seat.** `/studio?runProgressIconReview=1`
mounts every candidate in the SAME measure row the live bar paints
(`RunTitleBarChips`, shared by both — ADR-0059) plus its native 64×64 pixels.
**Use for &lt;idea&gt;** records owner approval of those exact bytes, accepts the
version into its slot, and binds the slot to its `app-ui` media role. The binding
must follow acceptance: the public drawable catalog refuses a role bound to a slot
with no accepted version, so a role bound early would 503 the whole catalog.

## Consequences

- The Run's position reads at the top-left with the rest of the app's orientation
  copy, and the bar's numbers are a row of marks rather than a sentence in boxes.
- Another screen whose position is state rather than address can name it the same
  way without inventing a status chip for it.
- Until an icon is installed the bar shows a reserved empty seat. That is the
  visible, honest state of an open art decision, not a fallback glyph.
- The three icons are one more closed `run-progress-icon` family; adding a fourth
  Run idea is a slot entry, a role, and a review option.
