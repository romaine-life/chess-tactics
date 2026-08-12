---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0510](0510-enchiridion-cards-filters-rarity-on-structural-teal.md)"
  - "[ADR-0555](0555-the-controls-panel-wears-the-leaf-material-and-a-portrait-keeps-its-scene.md)"
  - "[ADR-0557](0557-a-result-screen-wears-the-leaf-material-and-the-field-excludes-it.md)"
---

# ADR-0636: The Strategikon's four sections adopt the material hierarchy

## Context and Problem Statement

ADR-0433 gave the game one material rule — cool stone marble is the STRUCTURAL field, `hybrid-wood-oak`
is the LEAF — and rolls it out one destination at a time. The Strategikon was never a destination, and
it is the reference workspace a player opens mid-Battle, so it is read against the Run screens that
have adopted.

Measured on the live route, three of its four sections said nothing about what could be pressed. In
the **Lipsanotheca**, the Rows/Grouped browse tabs, every lipsanon row, every grouped icon seat and the
record box beside them wore the same flat inner field: the whole section was one undifferentiated
layer. In the **Prosopography**, the three roster dropdowns were oak but the row that groups them was
not a field at all — three triggers standing on the vista — and every ledger row, which IS the control
that opens a unit, wore the field while the box containing them wore nothing. In the **Enchiridion**,
the section rail was oak (it is an `ApparatusRailColumn`, which conformed already) and every record box
under it — unit, terrain, manubium, Ataraxia tier, rule exceptions, empty state — was flat. Only the
**Chartulary** partly conformed, through the filter row ADR-0510 had already fixed; its own
**This Combat** control did not.

Two layout faults were invisible under the flat field and become walls the moment a surface has grain,
which is the ADR-0557 `Finish Run` shape:

- The Chartulary put THREE children into `.enchiridion-card-gallery-layout`, which declares one row for
  its filter field and one flexible row for the gallery. **This Combat** therefore took the gallery's
  own track — stretching the full lane — and pushed the cards into an implicit row the layout clips.
- The no-Run notice was the only child in the flexible row of `.enchiridion-panel-unframed`, so it
  stretched to the entire pane.

## Decision Drivers

- The Enchiridion's sections and the army roster are the SAME components in two transports each (the
  main-menu Enchiridion and the Strategikon; the Run's Army view and the Prosopography). A destination
  fixed at one host only would make one screen wear two materials depending on how it was reached —
  the half-adopted family ADR-0557 names.
- ADR-0555 put `inner-list-row` in the structural class because *"a row's actions are the leaves, not
  the row"* — which is about a row that HOSTS actions. A browse row and a ledger row host none: the row
  is the only control there is.
- ADR-0433 forbids a repeated leaf collection restarting its wood at the same origin, and ADR-0063
  forbids deriving that phase from DOM position.

## Decision Outcome

Chosen: **the reference frame and the roster declare the hierarchy, so both transports of each get it.**

- `ReferenceSectionFrame` — the one frame every reference panel wears in both transports — carries
  `data-chrome-leaf-surface`. Every registered leaf inside all six Enchiridion sections and the
  Chartulary wears the oak from that one attribute, including controls a later section only borrows.
  Declaring it on the FRAME rather than on the Strategikon host is what keeps the main menu and the
  Strategikon agreeing.
- Every record box in those sections names the marble through `CHROME_STRUCTURAL_FILL_ROLE`: unit and
  manubium cards, terrain rows, rule exceptions, Ataraxia tiers, the lipsanon group and detail, every
  empty state, the no-Run notices, the army ledger grid, the unit-profile stat table, and the roster
  filter row — which becomes one structural field like the Cards gallery's, rather than three triggers
  on the vista.
- **A row that IS the control wears the oak.** Army ledger rows and lipsanon browse rows (both) name
  the leaf surface at their call site and phase it with `leafSurfacePhase(index)` from the index the
  renderer's own data already has. This does not reclassify `inner-list-row`, which stays structural
  for the dropdown option rows ADR-0433 keeps teal inside the popup field that hosts them. It is the
  same shape `SectionBox`'s `press` member already ships: the row is the button, pressable edge to
  edge, wearing the leaf oak.
- **EXCEPTION — in the grouped Lipsana case the RELIC is the clickable surface**, so its trigger
  wears no seat, no frame and no material, and the press is answered by the art lighting up. This is
  the material exception ADR-0433 asks a destination to record, and it is the owner's call: *"the
  relics are the clickable surface in this case."* It is also not new — ADR-0253/ADR-0254 had already
  decided these are direct selection buttons, visually unframed inside the group's own owned surface,
  and the surface-contract gate has carried an approved frameless-reset entry for this exact selector
  since. Painting them was overriding a standing decision, and two wrong answers went by before that
  was noticed, both settled in pixels rather than argued: given the oak by hand the seats came out as
  **bare plank rectangles with no frame at all** (zeroing a control's `border` removes a border-image
  frame, and that CSS zeroes it to make room for the icon), and rebuilding them as the kit's
  registered `inner-asset-swatch` fixed the frame while still being wrong — a seat under each relic
  makes the case **a box of buttons holding pictures of relics** rather than a case of relics. The
  rule this leaves behind is the useful part: where a control's whole body is its own art, that art IS
  the surface, and giving it a material puts a control *around* a thing instead of making the thing
  the control. The named **Rows** view is where a lipsanon reads as chrome and takes the oak; the
  grouped view is the objects.
- **This Combat moves INTO the filter field** as an optional typed `scope` seat, because it is a
  filter. That removes the third child that was taking the gallery's flexible track, so the stretch
  and the clipped gallery are one fix, and the field declares its extra track only when the seat is
  filled. The no-Run notice takes the size its copy needs at the lane width its sibling boxes use.
- **The unit inspection box keeps its scene and takes NO fill** (ADR-0555). It is a window onto a
  rendered board; marble there put stone around a landscape. What it wants is a scene backdrop, which
  is art rather than a fill role, and is not this record's business.

## Consequences

- All four sections now say what can be pressed before any copy or state styling is read, and they say
  it identically whether they are reached from the main menu or from inside a Battle.
- Two stretch faults that the flat field had been hiding are fixed at their cause rather than papered
  over with an alignment override.
- No media, no runtime bytes, no gameplay, no RunSaveVersion, no save-shape and no database change: the
  implementation consumes the already installed named surfaces through the shared policy module.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
