---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0475](0475-run-preparation-actions-follow-their-decision-content.md)"
  - "[ADR-0556](0556-run-preparation-chooses-in-a-tab-column-of-one-line-rows.md)"
---

# ADR-0567: Start New Run is one box of cells, and its one disclosure reserves its space

## Context

Start New Run's detail column was **four separate boxes** stacked with the live vista showing
through the gaps between them: the Ataraxia picker in its own box, the replacement warning in
another, the Start Run verb in a third, and the collapsed Options disclosure in a fourth. Each was
correct on its own terms — every one of them a `SectionBox`, every one wearing the structural
marble [ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md) gives a field that
holds other people's controls.

Together they drew ONE control as four unrelated things that happened to be stacked. Preparing a
Run is a single act — choose the rung, read what it costs you, press the verb, and (almost never)
change the rules it is bound to — and the only thing separating those steps was empty space with a
night sky in it. A gap is what this kit puts between things that are not related. A **rail** is what
it puts between parts of one thing, and the rail exists precisely so a boundary can be laid and
capped from a topology that owns both sides of it
([ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)).

Two more things followed from being four boxes rather than one:

- **The Options box was itself the disclosure.** `SectionBox`'s decision — the box's frame is the
  button's edge, so the whole slab is pressable and no second frame is drawn inside the first — is
  right for a named group that IS a box. It has nothing to say about a section that is a cell of
  something bigger, where the frame belongs to the box around all of it.
- **Opening Options grew the column.** The box's own bottom edge moved and everything in the
  column re-seated. [ADR-0475](0475-run-preparation-actions-follow-their-decision-content.md)
  already forced Options below the verb to keep that growth from shoving Start Run down the screen;
  that is a seating rule working around a layout that moves, rather than a layout that does not.

## Decision

**Start New Run's detail column is ONE divided box, and everything in it is a cell of that box.**

- The column mounts a single `DividedInnerChromeBox` (`.run-prep-box`) wearing the structural
  marble. Ataraxia, the replacement warning, the verb and Options are `ChromeDividedGridRow`
  cells of it. **Every separation between them is a rail the box lays and caps from its own grid
  lines** — nothing in this column draws a rule, and nothing shows the page through between the
  parts.
- **Rails stand exactly where the gaps stood, and nowhere else.** Options' name and its choices are
  two halves of one cell, not two things, so no rail divides them.
- The box takes **no padding**; each cell takes `--ds-inset`. A rail has to reach the frame on both
  sides, and box padding would hold every one of them short of it.
- **A cell INSERTS its controls; it is not itself the control.** The Ataraxia dropdown and the
  Start Run verb stay registered units seated inside their cells, wearing the oak that says a
  surface takes a click. The replacement warning inserts nothing and is therefore bare marble —
  which is now what tells you it cannot be pressed, in a column where its neighbours both hold
  wood.
- **Options opens from a SQUARE KEY** — the registered `inner-tool-square`, seated where the
  chevron used to hang, carrying the shared chevron glyph inside it. A cell has no frame to be the
  button; making the cell pressable would put a press on a region whose boundary belongs to
  something bigger. The key is labelled BY the cell's name (`aria-labelledby`), so the screen never
  says Options twice and pressing it changes nothing but `aria-expanded`.
- **Options' choices hold their space whether they are showing or not.** The cell is the same
  height open and closed; opening it fills a space that was already there, and nothing above or
  below it moves. The space is reserved by keeping the choices LAID OUT and hiding only their paint
  (`visibility: hidden` on `.run-rules-content[data-open="false"]`), so what is reserved is exactly
  what they need and cannot drift from a number written in the stylesheet. `visibility` also keeps
  a closed section out of the tab order and the accessibility tree, so it is no more reachable than
  it was when it was `display: none`.
- **`SectionBox` is unchanged.** It still owns the named-group box for Settings groups and the War
  editor's Battles, and there the box still IS the disclosure. This ADR does not retire that shape;
  it says Run preparation is not one of them.

## Consequences

- The column is taller at rest, because the reserved space is always there. That is the trade the
  reservation buys: measured live, the box is **607px in both states** and the choices are 258px in
  both — the disclosure moves nothing at all.
- [ADR-0475](0475-run-preparation-actions-follow-their-decision-content.md)'s seating still holds
  and Options still sits below the verb, but now for the reason that survives: the defaults are the
  game, and a section almost nobody opens must not stand between the Ataraxia choice and the verb
  as though it were a step in setup. The growth argument is gone with the growth.
- `AtaraxiaSelector`'s `framed` prop is now `named`: neither branch draws a frame any more, and
  what actually varies is whether the picker states its own name or the row around it does (the War
  editor's Ataraxia row already supplies one).
- The armed replacement pair — Keep Run / Abandon and Start — stays a two-up actions row inside
  ONE cell rather than becoming two columns of the box. The box's columns are box-wide, and a
  second column declared for one transient row would rule a line through every cell above it.
- A cell that must be pressable in future gets a key, not a pressable slab. `SectionBoxMember.press`
  (the row-as-button) remains available to boxes whose members genuinely are verbs; it is not the
  shape for a named cell holding controls.
- Verified on the live route rather than by reading the source: a real mouse click on the square key
  toggles the section, and `elementFromPoint` at the key's centre resolves to the key — the first
  attempt at this check clicked before the scene director settled and hit the transition layer, so
  the check waits for `data-scene-phase="current"`.
