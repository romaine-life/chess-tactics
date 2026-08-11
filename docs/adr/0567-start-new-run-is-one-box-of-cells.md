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
- The box takes **no padding**. A rail has to reach the frame on both sides, and box padding would
  hold every one of them short of it.
- **A cell that IS a control takes no inset either: the control fills the whole area between the
  rails, and the wood reaches them.** This is what INSERTED means here. A registered control seated
  inside a cell brings its own 9-slice frame, which draws a second rail a few pixels inside the
  box's own and leaves its wood as a plaque floating on a strip of marble belonging to nothing — a
  box in a box. So:
  - Start Run is the ROW: `ChromeDividedGridRow as="button"` wearing `section-box-member-verb`,
    the frameless reset the kit already owns for a verb whose edge is its box's frame.
  - Every picker is **seated** (`HouseSelect seated`): no registered unit, since `inner-dropdown`
    IS the frame; the oak filling the cell; the shared stepper chevron rather than the frame's own.
  - The plate is **30px**, not the 38px of a framed control. A framed button's 9-slice eats a
    rail's width a side, so about 24px of it is oak; a cell painting the full 38 would read half
    again as heavy as every framed control on the screen.
- **One WOOD height through the whole box, measured in oak rather than in boxes.** The square key
  that opens Options is the only framed control here, and a frame is measured in what it eats: at
  a plate-sized 30px box its 9-slice rails take 7px a side and leave **16px** of oak against the
  30px a frameless plate paints, so matching their BOXES made the key read half the size of the
  bars above it. Its box is therefore one plate plus its own two rails (44px), which paints one
  plate of oak. This is `.ce-preview-box`'s lesson from the other direction — there a frameless
  cell was shrunk to the oak a framed button paints. The size is set on `--le-inner-square`, the
  token the registered unit already reads; that token is scoped to the Level Editor's screen and
  never reached the menu shell, where the unit fell back to 38px.
- **The inset is measured to the OAK.** A framed control's rails live inside it, so the key seats
  itself one rail shallower and its wood starts exactly as far from the cell's edge as the title's
  text does. That also makes **one name-cell seat** come out the same either way — a 44px key with
  9px above and below is the same 62px as a line of text with 16px — which matters because
  Ataraxia's cell holds only text, and left to itself it stood shorter than Options and put the two
  titles at different heights in what is meant to be the same treatment.
- **A cell that CARRIES something** — a name, a sentence — takes `--ds-inset` and wears the box's
  marble. The replacement warning is one of these, and being bare marble is now what tells you it
  cannot be pressed, in a column where the cells either side of it are solid wood.
- **Options opens from a SQUARE KEY** — the registered `inner-tool-square`, seated where the
  chevron used to hang, carrying the shared chevron glyph inside it. A cell has no frame to be the
  button; making the cell pressable would put a press on a region whose boundary belongs to
  something bigger. The key is labelled BY the cell's name (`aria-labelledby`), so the screen never
  says Options twice and pressing it changes nothing but `aria-expanded`. The key keeps its own
  frame: it is a control standing ON a marble cell, not one filling a cell. **It centres its mark**
  — `.stepper-glyph` is an inline-block, so a square that leaves it to default block layout hangs
  it on a text baseline, which is what put the chevron in the corner of this key by 2.5px. The
  shared mark itself is untouched: captured at 8x and measured off the painted pixels, a turned
  chevron sits 0.19 CSS px off the centre of its own glyph box, below what the rasterizer can place
  at 1x. When a turned chevron looks off-centre, look at its HOST.
- **Options' cells are always there, empty when closed.** They are the same cells at the same
  heights open and closed; opening the section paints compartments that were already there, and
  nothing above or below moves. The space is reserved by keeping the choices LAID OUT and hiding
  only their paint (`visibility: hidden` on `.run-rules-cell[data-open="false"]`), so what is
  reserved is exactly what they need and cannot drift from a number written in the stylesheet.
  `visibility` also keeps a closed section out of the tab order and the accessibility tree, so it
  is no more reachable than it was when it was `display: none`. **The rails go with the paint**:
  closed, the section is reserved SPACE rather than compartments, so the box's rails stop at the
  Options name row — a rail divides two things, and there is nothing down there to divide yet. The
  boundary is matched by ADJACENCY
  (`.chrome-divided-grid__row-boundary:has(+ .run-rules-cell[data-open="false"])`) rather than by a
  class the row carries, so the grid stays the only thing deciding where a rail IS and the section
  only says when one is showing.
- **Each rule states its own name.** The section's two group headings ("Formations", "Pricing")
  are gone: three rules do not need grouping, and each is now one marble cell naming the rule and
  what the current answer does, followed by its picker's plate. On screen they were three
  unlabelled pickers under one word — the names existed only as `aria-label`s. This is not
  decoration: as separate cells the old shape cost nine compartments and ran the box off the
  bottom of the column.
- **Only a DIRECT child of the box is a row it lays a rail around.** A component returning several
  rows is one child, so its rows would land with no rails between them. Ataraxia and the rule
  options therefore contribute ARRAYS of cells (`ataraxiaPrepCells`, `useRunRulesCells`) rather
  than rendering as components — `Children.toArray` flattens arrays, and the box's topology sees
  every row. A fragment would not do: the box sees one child through it.
- **`SectionBox` is unchanged.** It still owns the named-group box for Settings groups and the War
  editor's Battles, and there the box still IS the disclosure. This ADR does not retire that shape;
  it says Run preparation is not one of them.

## Consequences

- The column is taller at rest, because the reserved space is always there. That is the trade the
  reservation buys: measured live, the box is **575px in both states** — the disclosure moves
  nothing at all, and every control hit-tests to itself at 30px of oak.
- [ADR-0475](0475-run-preparation-actions-follow-their-decision-content.md)'s seating still holds
  and Options still sits below the verb, but now for the reason that survives: the defaults are the
  game, and a section almost nobody opens must not stand between the Ataraxia choice and the verb
  as though it were a step in setup. The growth argument is gone with the growth.
- `AtaraxiaSelector` splits: the component is now only the bare picker for a row that already names
  it (the War editor's War group), and `ataraxiaPrepCells` is the box's pair of cells. The `framed`
  prop is gone rather than renamed — neither shape draws a frame, so it was describing nothing.
- The armed replacement pair — Keep Run / Abandon and Start — is the one verb SPLITTING into two
  compartments of the same row. The box declares its second column only while that question is
  open; every other cell spans, which is what makes the box suppress its full-height rail and let
  the armed row carry the one vertical segment itself, capped at both ends by the tees the boundary
  layer places where it meets the rows above and below. Stacking them was tried first, on the
  mistaken belief that box-wide columns would rule a line down every cell above — they do not, and
  the split is what the control had before this ADR and what reads as one question with two
  answers.
- `HouseSelect` gains `seated`, and a seated trigger is the one picker in the app that names no
  registered unit. That is the point rather than an exception to be regretted: `inner-dropdown` IS
  the 9-slice frame, and a cell whose edges are the box's rails has no room for one. Every
  free-standing picker still wears the unit, and `levelEditorChromeHierarchy` pins both forks.
- Verified on the live route rather than by reading the source: the box measures 575px in both
  states, every control's centre hit-tests to itself, a closed Options cell hit-tests to nothing
  (which is `visibility` doing its job), and a real click on a seated picker opens its menu. The
  first attempt at this check clicked before the scene director settled and hit the transition
  layer, so the check waits for `data-scene-phase="current"`.
