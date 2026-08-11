---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)"
  - "[ADR-0569](0569-the-invariant-title-bar-cluster-is-one-divided-box.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
---

# ADR-0570: A pad of keys is one divided box

## Context

[ADR-0569](0569-the-invariant-title-bar-cluster-is-one-divided-box.md) settled the title bar's
trailing cluster: three glyphs that belong together are one framed box with a rail between them,
not three framed boxes with a strip of bar between each pair. The owner named the remaining
instances of the same shape immediately: *"there's two 9 way controls that i know of, those should
be converted into the 'divider' 'inserted button' approach."*

Both live in the Level Editor's Unit panel, and both are 3×3 pads of direction keys:

- **Facing** — the 8-way compass with a rotate key in the middle (`FacingCompass`, shared with
  Placed Art, Forest sections and three Studio surfaces).
- **Default facing** — the popover the small `N` trigger opens, the same eight directions around a
  hollow centre.

Each was a CSS grid of nine `inner-tool-square` units with a 4px gap, so a 38px square gave its
letter a 24px opening and spent the other 14px on its own frame — and between one letter and the
next the panel showed **five things**: a frame rail, a strip of panel, another frame rail, twice
over. Nine frames and twelve gaps to say one control. The popover added a second offence on top:
its own hand-drawn panel (`background`, `border`, `border-radius`, `box-shadow`) floating in front
of chrome the kit already knows how to draw.

## Decision

**A pad of keys is ONE divided box, and each key is a compartment of it.**

`ChromeSeatGrid` (`src/ui/shared/ChromeSeatGrid.tsx`) is that object: a `DividedInnerChromeBox` of
R×C equal compartments, with the seats declared as **data, in rows**. A caller that could pass its
own markup could author the space between two keys, and a hand-placed rail cannot know where it
meets the frame — the same reason `ChromeVerbRow` takes verbs rather than children.

- **A seat is not a registered chrome unit.** The unit is what brings the frame, and the box drew
  one around all nine. A seat is a plain button on `.chrome-seat`, which removes the shell's native
  button chrome and paints nothing; the leaf oak still arrives, named on the seat itself and phased
  by its place in the data ([ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)).
  Registered in `check-ui-surface-contract.mjs` beside `.section-box-member-verb` and
  `.titlebar-control--seat`, which is the same category.
- **A compartment is exactly the opening the framed square used to give its glyph** — the tool
  square minus its own two inner rails, 38 − 14 = **24px**, declared once as `--chrome-seat-opening`
  and never restated by a consumer. The letters are untouched and the compass goes 122px → **100px**.
- **The rail-overlap rule is stated ONCE, for both axes.** `chromeDividedSeatAxis` in
  `ChromeDividedGrid.tsx` returns the tracks AND the insets: a track adds one half-rail per internal
  side, and the seat gives the same amount back so its glyph centres in what can be SEEN rather than
  in the cell. ADR-0569 derived the two halves separately — tracks in TSX, insets in CSS — and
  shipped compartments of 34.5 / 31 / 34.5 against a 38 height. `HeaderAccountCluster` now asks the
  same function, so there is one implementation of a rule that has already been got wrong once.
  All nine openings measure **24×24** on a **100×100** box, in the editor and in the Studio.
- **The hollow centre is a real cell.** The default-facing menu sets a default rather than turning
  a selected unit, so it has nothing to rotate — but the compartment stays, showing the box's own
  field, because dropping it would move the three southern directions one column left.
- **The state a key carries is its GLYPH.** A compartment has no frame to light. Nothing was lost:
  `.unit-facing-cell.is-active` declared a lit background that the installed leaf surface had been
  painting over for as long as both existed, so the brighter letter was already the only difference
  on screen. It is now the only one declared.
- **The popover keeps a positioning wrapper.** `.le-direction-menu` is a bare positioned div around
  the pad. A divided grid positions itself `relative` for its own rail layer, and the registry's
  inner-box rule restates that from a runtime stylesheet at a specificity a class on the box does
  not reliably beat — proven by the pad rendering `position: relative` and hanging off the wrong
  edge. The float belongs to the thing that floats, not to the chrome.

`FacingCompass` is shared, so this reaches every surface that mounts it: the Level Editor's Unit,
Placed Art and Forest facing pads, `TilePreview`, `UnitArtLab` and `SourceArtTurntableStudio`.

### A filled divided box was painting its rows over its own vertical rails

The first build of this shipped with the horizontal rails visible and the vertical ones **not** —
the seats' wood ran straight through where each column line should be. The owner saw it in the
handed-over capture; the agent looked at the same pixels and read a lattice into the junction studs
that were still landing at the crossings. Sampling the scanline settled it: at the two column
lines the luma stayed in the wood's range, where the frame's ink signature appeared at both edges.

`.inner-chrome-box.has-chrome-surface-fill > :not(.inner-chrome-box-fill)` lifts every non-fill
child to `position: relative; z-index: 1` so content clears the fill. It out-specifies the divided
grid's own rules and hit both of its layers:

- `.chrome-divided-grid__fixed-rails` lost its `z-index: 2` and tied with the rows layer, which
  then won on DOM order — so the seats painted over every vertical rail.
- `.chrome-divided-grid__rows` gained a z-index, which makes it a **stacking context**, trapping the
  row boundaries' junction atoms (z-index 3) inside it. The grid's own rule says this in as many
  words — *"deliberately NO z-index … trapping them under a level-1 parent buries every four-way
  crossing under the rail it is supposed to cap"* — and the lift defeated it from outside.

Both are exempted now, beside the `position: absolute` exemption that was already there. Nothing
had caught it because **no consumer had this combination before**: a surface fill, more than one
column, and no row spanning every column. `SectionBox` declares one column, so it has no vertical
rails; `LevelPreviewColumn` has a spanning name row, which suppresses the fixed layer in favour of
per-row segments; the title-bar cluster has vertical rails and paints them correctly because it
takes no fill at all. This pad is the first box to need all three at once, and the primitive was
wrong for it.

## Consequences

- One rail between two keys instead of two rails and a strip of panel, twelve times over. The pad
  reads as one object and is 18% smaller without its letters changing size.
- Six raw-paint entries leave `ui-surface-debt-baseline.json` — `.unit-facing-cell` and its two
  states, `.le-direction-menu`, `.le-direction-cell` and its empty variant — and none arrive.
- A pad can no longer light one key's frame. Any future per-key state has to be carried by the
  glyph or by the seat's installed surface, as in ADR-0569.
- `ChromeSeatGrid` is now the answer for any grid of small controls that belong together. Anything
  building one as N framed buttons in a CSS grid is rebuilding what this replaced.
- Any filled divided box with vertical rails now draws them. Nothing else in the app had the
  combination that exposed the bug, so nothing else changes — but a future consumer that would have
  hit it silently gets a working box instead.
- The seat's focus ring is inset (`outline-offset: -2px`), because the shell's +2px offset lands on
  the rails a key shares with its neighbours and outlines the keys around it.
- `--chrome-seat-opening` falls back to 38px/7px outside `.level-editor-screen`, so the Studio pads
  are the same object at the same size rather than the old 138px diagram.

## More Information

- **Primitive:** `frontend/src/ui/shared/ChromeSeatGrid.tsx`; geometry
  `chromeDividedSeatAxis` in `frontend/src/ui/shared/ChromeDividedGrid.tsx`; `.chrome-seat` and
  `.chrome-seat-grid` in `src/style.css`.
- **Consumers:** `FacingCompass` in `frontend/src/ui/studioBoard.tsx`; `DirectionPopover` in
  `frontend/src/ui/LevelEditor.tsx`; `HeaderAccountCluster` for the axis only.
- **Gates:** `frontend/scripts/check-ui-surface-contract.mjs` (the frameless reset),
  `frontend/scripts/check-titlebar-actions.mjs` (the cluster still derives its columns from its
  seat list), `npm run verify:titlebar` (the title bar's openings are unchanged at 38×38),
  `levelEditorChromeHierarchy.test.ts` (neither pad frames its keys or states its own sizes).
- **Related:** ADR-0242 (the divided-grid topology), ADR-0569 (the cluster, and the rail-overlap
  rule this generalizes), ADR-0433 (leaf oak over structural field), ADR-0063 (rails tee into
  their host), ADR-0059 (one shared implementation, never a bespoke parallel).
