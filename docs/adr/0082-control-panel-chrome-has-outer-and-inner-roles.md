---
status: "accepted; divider ownership clause superseded by ADR-0092"
date: 2026-07-06
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0092](0092-dividers-inherit-their-host-chrome-role.md)"
---

# ADR-0082: Control-panel chrome has outer and inner roles

## Context and Problem Statement

The Level Editor control panel was built quickly so the chrome could be seen on a
real surface. That was the right discovery path, but it left several house-style
chrome boxes choosing their own local frame sources and frame widths: the outer
rail, buttons, selects, toggles, text-field chrome, status wells, portrait wells,
service-record panels, and event overlay all had nearby but different atom/chrome
paths and pixel values.

That makes the system hard to reason about. The problem is not that every box
needs the same layout size. The problem is that every box invented its own chrome
family hook.

## Decision Drivers

- Chrome decisions must be visible and art-directed, not guessed by code.
- A component should choose a semantic chrome role, not a rail source or thickness.
- The current Skirmish HUD top tabs are the precedent for small inner controls.
- The Level Editor rail and its divider are the precedent for the current outer
  control-panel shell.
- This is an alignment pass; the art and exact role values may be revisited.

## Decision Outcome

Chosen: **house-style control-panel chrome has exactly two box roles: `outer` and
`inner`**.

`outer` is for the main control-panel shell and shell-like overlays. `inner` is
for controls and sub-boxes inside that shell: buttons, selects, toggles, input
chrome, and status/text wells that use the shared atom/chrome vocabulary.

The role values are eye-tuned constants, not a ratio. Today the Level Editor uses:

- `--le-chrome-outer-rail-w: 12px`
- `--le-chrome-inner-rail-w: 7px`

Fill is part of the role contract too. A chrome role owns whether its box is
transparent, tint-filled, or filled by a shared surface texture with an optional
tint overlay. Components may choose `outer` or `inner`, and they may choose their
layout dimensions/placement, but they may not paint a separate local box
background to compensate for the chrome.

For `outer`, fill material is painted by a dedicated role-owned fill layer inside
the panel, not by the root element background. The layer is seated in the
role-owned Fill Box and may be nudged from Chrome Lab (`fillBoxLeft`,
`fillBoxRight`, `fillBoxTop`, `fillBoxBottom`) without changing frame, atom, or
content-box geometry.

`outer` also owns one contents boundary. Its effective inset is the role's direct
`contentPadding` value; rail thickness is not added to it. The shared contents
wrapper applies that inset once, so ordinary headings, controls, sections, and
scroll content align automatically instead of recreating clearance through
consumer-specific margins or padding. Nested `inner` controls continue to own
their internal component padding; the outer inset does not compound recursively.
The inset also does not replace a toolbar or grid's own item gap: it moves the
content boundary as a whole, while each consumer still controls spacing between
its neighboring buttons. The live Level Editor controls, Rules/events overlay,
and Skirmish HUD all instantiate this same wrapper contract.

Elements that intentionally belong to a different box must declare that role as
an explicit structural exception. The panel title fill bleeds to the fill box,
while section dividers bleed back through the contents inset to tee into the
outer rail. Those exceptions do not create their own spacing constants.

The shared Skirmish/Level Editor control-panel surface also exposes role-owned
source variables:

- `--skirmish-chrome-outer-panel-image` / `--skirmish-chrome-outer-line-image`
- `--skirmish-chrome-inner-control-image`
- `--skirmish-chrome-inner-control-active-image`
- `--skirmish-chrome-inner-control-danger-image`
- `--skirmish-chrome-inner-line-image` and its semantic tone twins

Those values can change when the art changes, but the components may not set
their own bespoke chrome sources or rail thicknesses. A new chrome source/size means a new
role decision, not a local pixel override.

Section dividers are not a third box role. A divider is tied to its host `outer`
frame by the ADR-0063 divider contract and uses that host's generated reach/frame
variables. Its rail source and rendered thickness always match the outer role;
its reach derives from the outer Contents Box.

Rail fit modes are literal across both axes. `tile` repeats horizontal and
vertical edges; `stretch` stretches horizontal and vertical edges. The renderer
must not silently convert a selected mode into a mixed `repeat stretch` mode to
compensate for an unsuitable source asset. A source that cannot honor its
selected mode must be rejected or replaced visibly.

This applies only to house-style atom/chrome boxes. It does not apply to raw CSS
grouping blocks, palette swatches, fill surfaces without a frame, or self-framed
icon sprites unless those sprites are later promoted into the shared chrome
system.

The Level Editor action toolbar is the first such promotion: the old framed icon
tiles were replaced by glyph-only icons inside `inner` role buttons, so tuning the
inner rail changes those tool/history buttons too.

Chrome art enters those roles through the documented extraction pipeline, not by
cropping generated sheets directly from component code. Generated sheets are
source art only. Their crop boxes, target atom sizes, rail thickness, transforms,
and output prefixes live in named specs under
`frontend/config/chrome-family-extraction/`, and the resulting atoms are then
registered in the normal nine-slice registry before they are visible in viewers
or promoted to a live role.

Accepted control-panel chrome units must also be visible in the Studio audit
surface. The unit inventory lives in `frontend/src/ui/chromeUnitRegistry.ts`;
Chrome Lab maps that registry into catalog cards, and the audit viewer renders
one specimen per unit with only the dimensional freedom that unit actually
supports. Components may inherit from `outer`/`inner`, but they may not introduce
a new house-chrome unit shape without adding it to the registry, where it becomes
click-reachable and inspectable.

The inner square family is intentionally one chain, not a set of near-identical
siblings. `Inner square` is the base primitive; `Inner tool square` is the
concrete square control used by tool/history/icon controls; `Inner plus key` and
`Inner minus key` inherit from that concrete square. The Level Editor exposes one
square size token, `--le-inner-square`, so the old subtle split between control
square and tool square sizes cannot drift back in through local CSS.

## Consequences

- Good: the Level Editor control panel now has one named outer size and one named
  inner size; the old `8px`/`10px`/`12px`/`14px` drift and scattered
  `panel.png`/`mode-button.png`/`button-neutral.png`/`field-input.png`/`panel-line.png`
  references are no longer component choices inside the focused control panel.
- Good: the dressing-room work can expose roles instead of a pile of unrelated
  component knobs.
- Good: generated art can be inspected at exact candidate dimensions without
  making extraction a hidden one-off implementation detail.
- Good: accepted chrome units are now auditable as a visible inventory instead
  of being discovered by hunting through CSS.
- Good: inner square controls now share one inherited square primitive instead
  of maintaining visually subtle control/tool square siblings.
- Good: every ordinary outer-panel child now inherits one inspectable contents
  boundary, while title fills and dividers remain named full-bleed structures.
- Cost: some controls will visually shift while the inner role is tuned. That is
  acceptable; the point is to make the tuning centralized and inspectable.

## More Information

- Builds on [ADR-0081](0081-empty-control-panel-frames-are-overlays-not-layout-borders.md):
  the outer rail remains an overlay-only transparent frame.
- Builds on [ADR-0063](0063-section-dividers-are-a-1d-bar-primitive-teeing-into-the-rail.md):
  dividers are repeatable bar primitives tied to a host frame, not bespoke box
  chrome.
- Related: [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
  (shared primitive over parallel implementation).
- Amended by [ADR-0083](0083-chrome-frame-geometry-is-derived-not-authored-state.md):
  rendered rail thickness is authored, generated frame geometry is derived, and
  Fill Box and Contents Box remain independent.
- Divider ownership is superseded by
  [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md): structural
  dividers now inherit either their outer or inner host role.
