---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
extends:
  - "[ADR-0560](0560-main-menu-marks-share-one-ink-box-and-one-centre.md)"
refines:
  - "[ADR-0026](0026-ui-kit-icon-canvas.md)"
---

# ADR-0586: The Battle command card wears a mark on every key

## Context and Problem Statement

The Controls tab's command card is a 3x5 grid of physical key positions — Q-W-E-R-T /
A-S-D-F-G / Z-X-C-V-B — and every occupied cell was a key cap over two lines of small
type. Ten commands, twenty words, one letter each, all in the same colour at the same
size. Nothing in the card told the eye which button was which; a player found "Opp.
attacks" by reading, every time, and reading is what a command card exists to stop.

Nelson, looking at it: *"can we try to get some icons for these nav buttons?"*

Two things had to be settled before any mark could be drawn.

**What the four overlay keys are marks OF.** Q/A and W/S are the same two ideas twice —
attacks and moves — for opposite sides. The game already draws those exact verbs:
`ui/kit/icons/game/attack.png` and `.../move.png` are the marks the board's own action
family uses, and the board already says which side is which in red and blue, the same
relationship `ui/skirmish/icon-rook-blue.png` and `icon-rook-red.png` state. So four of
the ten are not new drawings at all.

**What size a mark is.** The seat draws the whole 64x64 canvas at a fixed size and lets
the asset's transparent padding decide how large the mark reads (ADR-0026). The generator
output made that visible immediately: the broom filled 61 of 64 pixels and the move
arrows filled 37, so seated together the broom would have read two-thirds larger than its
neighbour with nothing pointing at the cause. ADR-0560 already found this on the main-menu
rail, where five marks stack in a column.

## Decision

**Every command wears a mark, and the ten marks are one fitted set.**

- `SkirmishShortcutIcon` is the seat, one per command, in the family `RunActionIcon`
  established: one `app-ui` media role per variant, an `installedUiMediaIfPresent` lookup so
  a command whose art decision does not exist yet keeps a **reserved** empty seat rather
  than failing closed (ADR-0318), and a `src` prop that exists only so a review surface can
  hand it a candidate. `GridAction.icon` is **required**, so a new binding cannot be added
  to the card without deciding what it looks like.
- The ten slots are `ui/kit/icons/shortcuts/<command>.png` and they join
  `MAIN_MENU_MARK_FITTED_SLOTS`. That list is not "the main menu" — its own comment says it
  is every mark drawn into a fitted seat, which is why the gear, War and Levels are already
  in it. A 3x5 grid of equal buttons is a denser size comparison than any column, so the
  card belongs there for a stronger reason than the rail did. Each mark is therefore
  contract-checked at 64x64 with `inkHeight: 52` and even ink dimensions, and fitted by
  `frontend/scripts/pack-menu-icons.mjs --box 52` — the same transform, so the card and the
  rail are one size language rather than two.
- **The four board-verb marks take their own slots and stay one drawing.** `player-attacks`
  and `player-moves` are the installed `attack` and `move` marks refitted to this card's ink
  box; `enemy-attacks` and `enemy-moves` are those same two drawings under a deterministic
  hue transform that moves only the blue-through-cyan band, so gold hilts, stone and outline
  are untouched and the pair is one sword in two liveries. A separate slot is not a second
  drawing — it is the only way a shared ink box can be a property of the card without
  refitting the board's own marks underneath it.
- **The key carries the mark and the cap, and nothing else.** The labels went with the
  marks, in the same turn: ten of them at `--ds-text-xs` were the wall of type the marks
  replaced, and keeping both would have been the reading problem with a picture stapled to
  it. What the label said is not lost — it is the tip's TITLE, above the sentence the tip
  already carried. The key is 60.9px instead of 95.3px, and the card 199px instead of 302px.
  A corner-seated cap was tried and is 13px shorter again; it is rejected because at 42px
  wide this card has no free corner, so the letter landed on the grid lattice, on the
  cursor's brackets and on both magnifier lenses — and a card whose premise is that its
  letters are physical key positions cannot have letters that are hard to read.
- **The tip is the shared `Tooltip`, not a native `title`.** With the label gone the tip is
  the only text, so it has to be the one that appears immediately, survives a scrolling
  panel and answers to keyboard focus (ADR-0059) rather than the native attribute that
  truncates and vanishes. `Tooltip` gains `triggerIsInteractive` for it: a trigger that is
  itself a control takes neither the wrapper's `tabIndex` (two stops on one control) nor
  the `aria-hidden` an ornamental trigger gets (which would hide the control outright).
  Focus still raises the tip, because React's focus events bubble from the control inside.
- **The card is COMPOSED in review, not picked as a finished set.**
  `/studio?commandCardMarkReview=1` mounts the real card — the same button primitive, the
  same leaf surface, the same 26px seat — and arms a candidate into it on press. Each
  command's candidates were generated independently, so the best Grid and the best Deselect
  are not the same option number, and a set-at-a-time review would force a weak mark to be
  taken to get a strong one. Install is one act: approval of those exact bytes, acceptance
  into the ten slots, and the one `app-ui` drawable edit binding each slot to its role.

## Consequences

- The card gets SHORTER, not taller: a 28px mark costs less height than the two lines of
  type it replaced, so the Controls tab reclaims 90px.
- A mark carries recognition after the first read, not before it, and the card is now
  unreadable cold without hovering. That is the accepted cost: the labels were being read
  every time precisely because ten of them cancel each other out, and the tip answers the
  first read once. If a mark turns out not to earn its key, the answer is a better mark.
- Adding a shortcut now requires a mark. That is deliberate: the empty F/G/C/V/B cells are
  advertised as open slots, and an eleventh command wearing nothing would restate the
  reading problem in one cell.
- The new roles are added to the `app-ui` drawable's media map and **not** to
  `requiredRoles`, so an uninstalled command reserves its seat instead of failing the whole
  UI closed.
- Ten new live-media slots exist. Adding a slot is additive and reversible by retiring it;
  nothing is active until the owner installs the card.
