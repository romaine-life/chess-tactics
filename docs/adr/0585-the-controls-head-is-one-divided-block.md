---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0569](0569-the-invariant-title-bar-cluster-is-one-divided-box.md)"
---

# ADR-0585: The Controls head is one divided block, on the panel's own marble

## Context

The Controls panel's name band was the last unpressable wooden surface in the app. ADR-0433 makes
the oak the material of things that can be pressed — a box wears the marble, every trigger inside
it wears the oak — so a wooden **CONTROLS** plate promised a control and was not one. Under it sat
a bolted forged strip, baked into the title element as its own `background` layer. That strip was
an earlier iteration's private section rule, written before this panel had section breaks at all,
and by now it was the only line in the app drawn that way: everywhere else a section break is a
`ChromeDivider`, capped where it meets the frame.

The five HUD tabs beneath it were five framed kit buttons standing in a flex row, each drawing its
own edge, with gaps of bare panel between them.

## Decision

**The band paints nothing.** It declares no surface at all, so the panel's own installed marble
runs through it unbroken. A second surface layer could not do that — it would restart the stone at
the band's own origin and seam against the body below — which is why the answer is "no paint"
rather than "paint marble instead of oak".

**The head is one divided block**, laid by `ShellControlsPanel`: a row that is the name, spanning
every column, and a strip of compartments under it. The line between them is that block's own row
boundary, and the caps where the strip's verticals cross it are the block's junctions. The block's
foot row closes it against the panel body. Its inline edges are the panel's frame rails, so its
rails tee into them exactly as the break under a fixed dock does.

**A tab is a compartment, not a button in a row.** The rails on either side are already its edges,
so it paints no frame and wears the leaf oak — the same seat `.section-box-member-verb`,
`.titlebar-control--seat` and `.chrome-seat` occupy. Which one is current is carried by the mark
inside it (grayscale + brightness), because a frameless compartment has no frame to light; this is
the axis the title bar's music seat already uses.

Two consequences follow from having no strip. A head given ordinary `titleContent` instead of
`titleSections` — the Level Editor's layer picker — closes with the panel's ordinary
`ChromeDivider` and no foot: a single control is a control, not a compartment, and ruling a second
line under it would divide a strip with nothing on the other side.

`DividedInnerChromeBox` gains **`hostFrame`**. `framed` was answering two questions with one
boolean — whether the grid DRAWS a boundary, and whether one is THERE. `framed={false}` is right
for a workspace floating inside shell chrome and wrong for a block whose inline edges are the
host's rails: without it those rails stop dead a rail-width short of a frame they visibly run into.
Naming the host's role also chooses the material, because these rails are continuous with the
host's chrome rather than internal to a box. It governs the INLINE boundary only; a host frame says
nothing about what the host stacked above or below the block.

## Consequences

The name re-centres in a field that got 10px taller when the bolted strip came off, and the
Strategikon marks now ride that same seat rather than being pinned to the top of it — pinned, they
stopped tracking the name the moment the field changed height, which is exactly what this change
did.

Measured against the app bar, that centring is the house seating and not a departure from it. The
bar's brand lockup sits low in its field (copy at 13.2/3.2 slack in a 60px field, the mark hanging
2px past the rule) because 54px of lockup in a 60px field has almost no slack to spend — not
because a header is bottom-set. The rule the bar actually demonstrates is that the header's content
fills the field between the frame above it and the rule below it. A bottom-set variant was built
and looked at: it crowds the name and the marks into the rail.

`.skirmish-hud-tabs` is gone, and with it every declaration about tab width, gap and frame — the
block owns all of it. The retired oak is removed from the surface-debt baseline rather than
re-registered.

Both guards that pinned the old shape now pin the new one: `check-empty-panel-frame-overlay.mjs`
requires the sections to be DECLARED to the panel and forbids a `ChromeButton` wearing
`skirmish-hud-tab`, and the full-bleed exception covers the head as well as the header.
