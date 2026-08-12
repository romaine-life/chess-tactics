---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0569](0569-the-invariant-title-bar-cluster-is-one-divided-box.md)"
---

# ADR-0587: The Controls head is one divided block, on the panel's own marble

## Context

The Controls panel's name band was the last unpressable wooden surface in the app. ADR-0433 makes
the oak the material of things that can be pressed — a box wears the marble, every trigger inside
it wears the oak — so a wooden **CONTROLS** plate promised a control and was not one. Under it sat
a bolted forged strip, baked into the title element as its own `background` layer. That strip was
an earlier iteration's private section rule, written before this panel had section breaks at all,
and by now it was the only line in the app drawn that way.

The five HUD tabs beneath it were five framed kit buttons standing in a flex row, each drawing its
own edge, with gaps of bare panel between them — the same "three edges to say one thing" that
ADR-0569 had already removed from the title bar's trailing cluster.

## Decision

**The band paints nothing.** It declares no surface at all, so the panel's own installed marble
runs through it unbroken. A second surface layer could not do that — it would restart the stone at
the band's own origin and seam against the body below — which is why the answer is "no paint"
rather than "paint marble instead of oak".

**The head is one divided block**, laid by `ShellControlsPanel` and built exactly like the title
bar's invariant cluster: **inner-box chrome**, one rail on every internal boundary, and each member
a COMPARTMENT of the block rather than a control standing inside one. A row that is the name spans
every column; a strip of compartments sits under it; a foot row closes the block against the panel
body. The line under the name is that block's own row boundary, and the caps where the strip's
verticals cross it are the block's junctions.

The first attempt drew all of that at the OUTER role — the panel's own 24px section rail and its
32px junction studs. It was the right structure at the wrong weight, and the owner said so: *"im
not picturing those huge frames being the ones we use. the divider and frames should belong to the
'inner box' class."* The reference he had given for the strip was the settings / music / avatar
cluster, which is that class.

**The block is unframed on its inline axis.** It runs the full width of the panel, so its left and
right edges are the panel's OWN side rails; drawing a second pair a rail-width inside them would
put a strip of marble between two frames. The rails that reach those edges simply run under them,
which is also why the block stays below the panel's frame in the paint order rather than above it.

**A compartment is not a registered chrome unit.** The unit is what brings the frame, and the block
has already drawn every edge this thing has. A pressable compartment wears the leaf oak, because a
trigger wears the oak wherever it sits (ADR-0433); one that merely holds other people's controls
stays the block's own field, so those controls read against marble like every other framed control
in the panel. Which compartment is CURRENT is carried by the mark inside it (grayscale +
brightness), because a frameless compartment has no frame to light — the axis the title bar's music
seat already uses.

**Equal tracks do not give equal compartments** (ADR-0569), and here TWO different things are
taken off a cell. A rail is drawn ON a grid line and covers half its width from the cell on each
side, so a middle compartment pays that twice and an outer one once. And the panel's own FRAME sits
on top of the block's outer edges, because the block runs edge to edge so its rails can reach that
frame — which is by far the bigger bite, and the one that showed: the first compartment painted
**42px** of visible oak beside 64px ones, measured off a real capture rather than off the box
rects, which all read a tidy 63.52.

So the opening is the share of the strip left over once BOTH have had their width, and each track
adds back exactly what is taken from it. The cover is measured from the rail the panel actually
draws (`--shell-controls-frame-cover-start/end`), so the viewport edge — where `chrome-rails-offscreen`
draws no rail at all — states zero rather than assuming symmetry. The matching insets come from the
same `chromeDividedSeatAxis` call rather than from a positional CSS rule beside it: the row's last
child is the grid's own rail layer, so `:last-child` is not the last seat.

All five compartments then paint the same width, verified on a scanline through a real capture:
60/60/60/60/60 device pixels at 1440, with each mark's centre on its opening's centre. Residual
±1px appears at widths where the Controls column is fractional, which is the browser's own
device-pixel rounding of a lane that does not divide evenly.

**Both head shapes are the same block.** A head given ordinary content instead of sections — the
Level Editor's layer picker — is that block with a single column, so the rule under its name is the
same row boundary at the same weight. It has no foot, because a foot rail exists to terminate the
verticals BETWEEN compartments and a single column has none; a second line under one control would
divide a strip with nothing on the other side of it.

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

The head comes out 104.7px against the 105.7px the framed row cost, so the block is free.

`.skirmish-hud-tabs` is gone, and with it every declaration about tab width, gap and frame — the
block owns all of it. The retired oak is removed from the surface-debt baseline rather than
re-registered. `DividedInnerChromeBox` is untouched: the shape this needed was already in it.

Both guards that pinned the old shape now pin the new one: `check-empty-panel-frame-overlay.mjs`
requires the sections to be DECLARED to the panel, requires the compartment to be a bare seat
carrying the leaf material rather than a registered unit, and forbids a `ChromeButton` wearing
`skirmish-hud-tab`; the full-bleed exception covers the head as well as the header.
