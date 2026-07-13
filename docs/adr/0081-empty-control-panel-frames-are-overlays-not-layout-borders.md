---
status: "accepted"
date: 2026-07-06
deciders: Nelson, Codex
---

# ADR-0081: Empty control-panel frames are overlays, not layout borders

## Context and Problem Statement

The level editor control rail had its `panel.png` fill removed so the rail could be
an empty framed box. Dropping `fill` made the center transparent, but the rail still
used a `14px` CSS `border-image` on the panel element. That border consumed layout
space, so the rail's children began inside a 14px moat. With no explicit fill, the
moat showed the page behind it as an arbitrary dark color, reading like accidental
padding or a mystery background.

That is the wrong model. If a box needs color, the color must come from an explicit
fill layer. If it has no fill, transparency should expose the app behind the box all
the way to the frame.

## Decision Drivers

- Empty shells must stay visually honest: no accidental color from a layout border.
- A frame is ornament, not content padding, unless the element itself is the control.
- Missing fill should be visible as transparency so the needed fill can be designed
  deliberately.
- Preserve ADR-0032/0033: the rail remains kit chrome, not a raw CSS box.

## Considered Options

- Keep using `border-image` without `fill` on the rail element.
- Add a transparent-interior frame as an absolute overlay.
- Reintroduce a panel fill to hide the moat.

## Decision Outcome

Chosen: **empty outer control-panel frames render as absolute overlays with zero
layout border**.

For an outer shell whose job is only to hold controls, the element itself must not
reserve frame width with `border`/`border-image`, and its frameless children must
not recreate that same moat with inherited panel padding. The frame is drawn by an
absolutely positioned child or pseudo-element (`inset: 0`, `pointer-events: none`)
over the content, using the transparent-interior line frame
`/assets/ui/explore/frames/panel-line.png`, never the filled `panel.png`. Dropping
the `fill` keyword from `panel.png` is not sufficient: its edge slices still contain
opaque navy pixels that read as mystery padding.

The shell keeps `padding: 0`, and frameless sections inside it also keep
`padding: 0`; any content inset must come from an explicit child surface or a named
spacing rule, never from the frame. A transparent frame may still define a
**fill box** and a **contents box**. In the Level Editor rail,
the four `--le-outer-fill-box-*` values position the explicit fill layer, while
`--le-control-content-inset` positions controls inside the ornament. Those values
are layout-only and transparent; they must not carry a background. They are direct
authored boundaries and do not scale from the rail source slice or rendered rail
thickness. ADR-0083 defines this separation and supersedes the earlier generated
fill-handoff calculation.

If the box should be colored, add an explicit fill layer/background for that box. If
there is no fill, the inside and edge-adjacent areas are transparent by design.

This does not ban `border-image` layout on actual controls or drawn text boxes. A
button, select, input, chip, or text well may still use a kit border because that
element is the object being drawn; ADR-0055 still governs its content inset.

### Consequences

- Good: transparent rails no longer produce a fake colored moat; frame and fill are
  separate concepts; missing fill is obvious.
- Good: title-strip and future fills can land on the frame's fill box rather than
  the outer frame footprint.
- Cost: empty framed shells need an overlay pseudo-element. If controls need frame
  clearance, add a named contents-box rule; do not add rail-wide padding or hidden
  fill.

## More Information

- Refines [ADR-0033](0033-board-plus-control-panel-layout.md): the right-side control
  panel is still one kit-framed object, but transparent variants draw the frame as an
  overlay.
- Related: [ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md) (transparent
  frame + explicit surface), [ADR-0055](0055-drawn-text-boxes-inset-content-by-the-role-token.md)
  (content inset belongs to drawn text boxes, not frameless shells).
- Amended by [ADR-0083](0083-chrome-frame-geometry-is-derived-not-authored-state.md):
  generated frame geometry is derived; Fill Box and Contents Box are direct,
  independent authored boundaries.
