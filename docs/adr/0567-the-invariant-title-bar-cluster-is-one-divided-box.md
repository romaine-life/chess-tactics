---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)"
  - "[ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0044](0044-persistent-mute-control-in-the-trailing-cluster.md)"
---

# ADR-0567: The invariant title-bar cluster is one divided box

## Context

The persistent trailing cluster — music, the Settings gear, the account control — was three
separately framed `inner-box` units in a flex row with `--titlebar-control-gap` between them.
Each glyph therefore sat inside its own 9-slice frame, and between one glyph and the next the bar
showed **three edges**: the right rail of one frame, a strip of the bar itself, and the left rail
of the next. Three marks of separation to say one thing.

The owner named it directly: *"these top right buttons should be a 'divider box', so the space
between them is a bit too much divider to me."*

The kit already has the object he asked for.
[ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)'s `DividedInnerChromeBox` is one
frame whose members are compartments, with a single rail on every internal boundary and a junction
atom wherever that rail meets the frame — all derived from the box's own grid lines. The Run Army
ledger, the campaign picker's option list, `SectionBox` and the level-preview column are all built
from it. The title bar was the one collection of peers in the app still drawing its separation by
stamping a frame around each member.

## Decision

**The invariant trailing cluster is ONE divided box, and each of its members is a compartment of
it rather than a control standing inside one.**

- **The columns ARE the members.** `HeaderAccountCluster` builds its seats as a list and derives
  `columns` from that list, so the rail between the music seat and the gear is the box's own column
  line. A bar without the gear declares two columns and has one rail — never an empty compartment
  where the third used to be.
- **A seat is not a registered chrome unit.** The unit is what brings the frame, and the box has
  already drawn one around all three. `TitleBarButtonPrimitive` gains `seated`, which renders a
  plain button carrying `.titlebar-control--seat` instead of `chromeUnitClassNames('inner-box')`.
  The leaf oak and its phase stay, because a trigger wears the oak wherever it sits
  ([ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)); only the frame goes.
- **A compartment is exactly the opening the framed button used to give its glyph.**
  `--titlebar-control-seat` is `--titlebar-control-size` minus two inner rails — 38px against the
  52px square — so a seat and a framed control present the same square to the same icon. The box's
  outer height then derives back to the canonical 52px without any title-bar box stating a height,
  and the cluster comes out 128px wide where three framed squares and two gaps were 172px.
- **The music seat is a real cell, not a boxless wrapper.** `.cluster-bgm-slot` was
  `display: contents` so an unmounted button cost no width in the flex row. As a declared column it
  has to exist from the first frame — before `bgm.js` re-homes its button into it — or every member
  after it sits one column to the left until it lands.
- **Route contributions are deliberately NOT in this box.** They keep their own frames before the
  persistent divider. That divider is what separates what a screen adds from what the app always
  carries ([ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)), and folding the
  two groups into one box would erase the distinction. The owner chose this scope explicitly over
  the alternatives of one box for everything, or a second divided box for the contributions.

### The music button's three states move onto one axis

[ADR-0044](0044-persistent-mute-control-in-the-trailing-cluster.md) gave the control two axes: a
kit **active-frame swap** for "music is playing somewhere" and a **dimmed icon** for "this tab is
silent". A follower tab read them both at once — lit frame, dim glyph — which is what made
"playing in another tab" distinguishable from "nothing is playing".

A compartment has no frame of its own to light. So the icon carries all of it, in three steps:
bright = playing here, half-lit (`is-othertab`, opacity .72 / grayscale .25) = playing in another
tab, flat grey (`is-muted`, opacity .4 / grayscale .7) = nothing is playing. Collapsing the middle
step back into `is-muted` would make a follower tab pixel-identical to silence again, which is the
distinction ADR-0044 added.

The one state genuinely lost is the sign-in button's lit frame while signed out. It keeps a
full-opacity glyph and its own door icon; nothing else in the cluster used `active`.

### The reset is registered, and the gates moved with the object

`.titlebar-control.titlebar-control--seat` clears `background`, `border`, `border-radius` and
`box-shadow`. Two classes deep on purpose: the shell's `button.active` base is (0,1,1) and would
otherwise repaint a lit seat with its own gradient and shadow — exactly the raw surface the
installed frame exists to own. It is registered in `check-ui-surface-contract.mjs`'s approved
frameless resets beside `.section-box-member-verb`, which is the same category: the box's frame is
the control's edge, so the declarations REMOVE native button chrome and paint nothing.

`verify:titlebar` measured every persistent control against the lane. It now measures the **box**
there — divider-to-cluster and cluster-to-viewport-edge are the canonical gap, and the box shares a
top and bottom with the contributed controls — and measures the **seats** against the box: every
seat shares the box's top and bottom, no seat escapes it, and **no seat may carry a
`data-chrome-unit`**, which is the rendered-DOM statement of "no frame inside the frame".
`check-titlebar-actions.mjs` holds `bgm.js` to the seat class, refuses a chrome unit on it, and
requires the cluster to be a divided box whose columns come from its seat list.

## Consequences

- One rail between two glyphs instead of two rails and a strip of bar; the cluster is 44px
  narrower and the top-right reads as one object rather than three.
- Adding or removing a cluster member is a change to one list. The box recomputes its columns,
  rails and junction caps; nothing places a divider.
- The cluster can no longer light a single member's frame. Any future per-member state in here has
  to be carried by the glyph or by the seat's installed surface, not by a frame swap.
- Route-contributed controls still show the doubled edge between two adjacent buttons — the Studio
  contributes three. That is the accepted consequence of the chosen scope, and the fix if it is
  ever wanted is a second divided box on the other side of the persistent divider, not folding them
  into this one.

## More Information

- **Box:** `frontend/src/ui/shared/HeaderAccountCluster.tsx`; primitive
  `frontend/src/ui/shared/ChromeDividedGrid.tsx`.
- **Seat form:** `TitleBarButtonPrimitive`'s `seated` in
  `frontend/src/ui/shell/TitleBarControls.tsx`; `.titlebar-control--seat` in `src/style.css`.
- **Outside React:** `frontend/src/bgm.js` builds the music seat.
- **Gates:** `frontend/scripts/check-titlebar-geometry.mjs` (`npm run verify:titlebar`),
  `frontend/scripts/check-titlebar-actions.mjs`, `frontend/scripts/check-ui-surface-contract.mjs`.
- **Related:** ADR-0242 (the divided-grid topology), ADR-0104 (typed contributions and the
  persistent divider), ADR-0433 (leaf oak over structural field), ADR-0044 (the music control),
  ADR-0036/ADR-0023 (the cluster's membership), ADR-0063 (rails tee into their host).
