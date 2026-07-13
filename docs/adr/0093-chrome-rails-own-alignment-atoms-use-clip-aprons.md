---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0093: Chrome rails own alignment; atoms use clip aprons

## Context and Problem Statement

The Level Editor aligned inner controls by the outside edge of their corner
atoms. Runtime CSS converted atom tuning into left and right "footprint" padding,
so an 8px atom overhang moved the actual rail 8px away from the outer Contents
Box line. Chrome Lab therefore appeared internally consistent while the live
editor's boxes did not share the editor's layout grid.

That padding also hid a clipping defect. The main control-column scrollport and
the HouseSelect menu scrollport clip horizontally. Moving the rail back to the
Contents Box without changing those clip boundaries cuts off the atom. Making a
vertical scroller `overflow-x: visible` is not a solution: CSS promotes that axis
to scrolling and can restore the unwanted horizontal scrollbar.

## Decision Drivers

- The visible rail is the stable geometric edge of a box.
- Atom art must remain independently tunable and out of normal flow.
- Chrome tuning must not move control, heading, title, or section alignment.
- Vertical scrollports must preserve complete atom and divider-joint paint
  without acquiring horizontal scrolling.
- Live consumers and Chrome Lab/audit consumers must share the same rule.

## Decision Outcome

Chosen: **the rail edge is the alignment edge; atoms are paint-only overhang**.

An outer or inner box participates in layout through its CSS border box and rail.
Sibling alignment, Contents Box placement, widths, margins, and panel-title
alignment use that rail edge. Corner atoms remain absolute overlays. Their size
and per-side offsets never become a second layout footprint and never move the
host rail.

Every clipping ancestor that directly contains atom-painted chrome owns a
transparent **clip apron**. A clip apron expands the clipping box by the actual
painted overhang and adds equal compensating content padding, so the rail stays
at the same coordinate. Vertical scrollports keep `overflow-x: hidden`; they do
not expose a native horizontal scrollbar. A custom scrollbar moves into the
expanded apron when necessary so it remains outside the painted atom.

Nested divided boxes budget for both kinds of paint. Their apron reaches through
the host rail and uses the greater of the corner-atom overhang and the divider
joint's overhang on each side. Viewport-positioned chrome also clamps its box
using live left, right, top, and bottom overhang values rather than a hard-coded
assumption about current atom tuning.

A composite control may reserve named local collision clearance where an atom
would otherwise cover adjacent text or another interactive child. That
clearance is internal to the composite; it cannot move the host rail or redefine
the shared alignment edge.

The first enforced consumers are the fixed Controls header, the main Level
Editor control-column scrollport, the Events master/detail scrollports, the
Chrome Unit audit consumer, and the divided HouseSelect menu.

## Consequences

- Good: inner rails, headings, and the outer Contents Box now share one readable
  alignment line.
- Good: atom tuning remains visual and cannot silently reflow the editor.
- Good: scrollports preserve complete corner and divider-joint paint without a
  horizontal scrollbar.
- Good: future Chrome Lab atom adjustments propagate their paint budget to live
  dropdown viewport placement.
- Cost: every new clipping ancestor that directly hosts chrome must compose the
  shared clip-apron rule or provide an equivalent measured apron.
- Constraint: an element's own `overflow: visible` is insufficient when an
  ancestor scrollport still clips it.

## More Information

- Refines [ADR-0081](0081-empty-control-panel-frames-are-overlays-not-layout-borders.md),
  [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md),
  [ADR-0083](0083-chrome-frame-geometry-is-derived-not-authored-state.md), and
  [ADR-0084](0084-accepted-chrome-rails-are-native-size-directional-families.md).
- Extends [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md) with the
  clipping contract for inner divider joints.
- The source guards live in
  `frontend/scripts/check-empty-panel-frame-overlay.mjs` and the focused chrome
  runtime/hierarchy tests.
