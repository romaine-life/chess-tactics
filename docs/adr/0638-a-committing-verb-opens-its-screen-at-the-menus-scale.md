---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
  - "[ADR-0475](0475-run-preparation-actions-follow-their-decision-content.md)"
  - "[ADR-0633](0633-a-menu-language-rail-tab-is-the-primitive-or-it-fails-the-build.md)"
---

# ADR-0638: A committing verb opens its screen, at the menu's own scale

## Context

Play's two Run destinations each end in one press. **Continue** resumes the Run in hand;
**New** begins one. Both columns put that press LAST and drew it in `--ds-text-xs`:

- Continue's card listed Battle, Army, Gold, Ataraxia and Deployment, then closed with a
  16px **Play**.
- New's box offered the Ataraxia rung, the replacement warning and the Options disclosure,
  then closed with a 16px **Start Run**.

Two things are wrong with that, and they compound.

**The press was the smallest thing on the screen.** The player arrived here by pressing
**PLAY** on the main menu — 32px, outlined, with a mark beside it — and then pressed
**CONTINUE** or **NEW** in the same lettering one rail over. The third press in that chain, the
one that actually starts the game, was drawn half the size of the two that led to it. Scale
had been running backwards down the funnel.

**Everything above it read as a form to fill in.** A column whose commitment sits at the bottom
puts its setup *between* the player and the press. New's defaults ARE the game — nobody should
have to answer the Ataraxia picker or open Options to start an ordinary Run — but stacked above
the verb they read as steps, which is exactly the reading ADR-0475's "a verb follows the facts
it completes" invites when the facts are settings rather than a receipt.

The owner's own framing named the fix: *the top is the most reliable control; these are listed
tabs, so the top makes the most sense.*

## Decision

**The verb that a screen exists for is that screen's FIRST row, and it is drawn at the main
menu's scale with a confirm mark.**

`ChromeVerb` gains `confirm`. It is a fact about the verb — this is the commitment — not a
style knob, and three things follow from it rather than from the caller:

- **The band belongs to the ROW, derived from whether a commitment is in it.** Declared per
  cell, a row could be handed one verb at the menu's scale and its neighbour at the card's, and
  arming New's replacement question (one verb splitting into **Keep Run** / **Abandon and
  Start**) would change the row's height under the cursor. Both answers take the band; only the
  one that commits takes the mark.
- **The measurements are the rail tab's own**, read out of `.settings-tab.main-menu-mode-tab`
  rather than chosen to match by eye: the same 61px seat, 40px mark slot, 44px drawn glyph,
  11px gap and `--menu-label-stroke-*` outline. A menu button and this button are the same act
  one screen apart, and two seats that agree by eye drift the first time either is retuned.
  Mark then word, filling the cell, and the label is the rail tabs' own `FittedTabLabel` — a
  band can be half a narrow column wide once the replacement question arms, and at 32px
  "Abandon and Start" overruns it. Ellipsis cut the verb mid-word; the menu's answer to a long
  label has always been to shrink it until it fits, and reusing that fitter is the same reuse
  the rest of this decision is about.
- **The mark is resolved by the row, never passed in.** "Confirm" is one fact across the whole
  app, so it is one drawing (ADR-0059) under one role, `ui-kit-icons-confirm-png`. A caller
  that could hand its own glyph could put a different one on the same act on the next screen —
  the drift `ApparatusRailTab.iconSrc` documents. The single seam is `confirmMarkSrc`, the
  review-only override `BattleLogMarks.forgedSrc` already established, which no play route
  passes (ADR-0058).

The two columns re-order around it. Continue's facts become the **receipt** under the button
that resumes: what you are about to walk back into, read after deciding to. New's Ataraxia
rung, replacement warning and Options sit under Start Run in that order, so the ordinary Run is
one press on the topmost control of the column and nothing else — and Options stays last, which
is what it was already for (its own note: *not a step between the Ataraxia choice and the
verb*).

**A band at the menu's scale makes its column a PEER of the rails beside it**, so Run's detail
column takes the tab width. It had been sized by `.menu-dest-preview` — 300px, "compact by
intent", authored for the Editor's peripheral board thumbnail and explicitly narrower than a tab
column — which it inherited only by borrowing the class. That is the wrong kind of column for
this: it opens with the press the screen exists for. Left 22px short of the two rails, the band
read as a rail tab that had failed to line up. At `--col-tab-w` all three columns come out
byte-identical, and the label track goes 178px to 200px — wider than the rail tab's own 188px —
so every label including "Abandon and Start" renders at the full 32px with the fitter idle.

**A row of a divided box is not a box, and the seat has to be paid out accordingly.** The row's
top edge is the box's own frame and its bottom edge is half the divider it shares with the row
beneath, so sizing it at 61px outright drew a 71.5px box and hung its divider 10.5px below the
bottom frame of the tab it lines up with. The content height is the seat minus the two edges the
row does not own, and the row gives the half-rail back as padding — which leaves the tab's own
47px interior, centred exactly where the tab centres its icon. Measured live: the divider now
occupies the identical band as the tab's bottom frame, to 0px on both edges.

**Mark and word are one group, centred on the button** — where a rail tab left-seats them,
because a tab is one of a stack whose marks line up down the rail and this is a single wide band
where a short word left-seated reads as a label that fell off the edge. The mark's COLUMN exists
only when there is a mark: the seat is NOT held open against a future install (the reading
ADR-0318 would suggest), because empty it pushes the word off the button's centre with nothing on
screen to explain it, and a group of one centres just as well. Installing the art moves the word
once, at install time — a content decision, not something a player watches happen. Four candidates are
uploaded to `ui/kit/icons/confirm.png` and the owner installs one from **Studio → Confirm
Mark**, which mounts each in the real band beside the shortest label a commitment takes
(`PLAY`) and the longest (`ABANDON AND START`) — a mark that only works next to one of them is
not the mark.

## Consequences

- Every future committing verb gets this for free by saying `confirm: true`, and cannot get it
  slightly differently.
- Installing the mark binds every confirm band at once, because there is one role. That is the
  point, and it means the decision is made once rather than per screen.
- Until an install happens the bands show label-only with the slot held open. That is the
  reserved state working, not a missing asset.
- No gameplay, save-shape, `RunSaveVersion` or database-schema change. `ui/kit/icons/confirm.png`
  is a NEW slot carrying candidates only; nothing existing is overwritten or re-pointed.
