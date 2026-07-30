---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0202](0202-play-uses-one-fixed-design-resolution.md)'s fixed-width and wide-letterbox clauses"
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)'s exact-aspect Play clause"
refines:
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)"
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
---

# ADR-0226: Play expands before ultrawide wings

## Context

ADR-0202 stabilized Play by uniformly containing one 1920×1080 canvas. A
2560×1440 monitor used through ordinary browser chrome exposes a roughly
2560×1310 content rectangle, however. Containing 16:9 inside that 1.95:1
rectangle produced about 116 black pixels on each side and withheld that width
from the battlefield even though the layout could use it without moving or
resizing the existing title and HUD chrome.

Play still needs a bound on true ultrawide monitors. Expanding the tactical
composition without limit would create excessive peripheral world, make
accepted pre-drawn coverage more demanding, and separate critical UI from the
board.

## Decision

- Play retains a **1920×1080 reference design**, an 88px title bar, and a 360px
  adjoining HUD. The 1560×992 board pane is the reference composition rather
  than a fixed runtime size.
- At browser-content aspects from the 16:9 reference through **2.1:1**, Play
  keeps its authored vertical scale and grows the design canvas horizontally to
  fill the browser. All added width goes to the live board pane. The title and
  HUD keep their existing design dimensions.
- Above 2.1:1, the Play canvas caps at **2268×1080**, remains centered, and the
  application shell owns equal left and right ultrawide wings. Wings contain no
  critical controls or board input.
- The owner's ordinary 2560×1310 Play viewport is approximately 1.95:1 and
  therefore has no wings. A true 3440×1310 or 32:9 viewport receives wings.
- The live Play stage measures, clips, accepts input, and enforces accepted-art
  coverage against its complete expanded rectangle. Its automatic opening and
  Reset camera use a centered 195:124 reference safe area inside wider stages,
  so ordinary added width reveals lateral world without enlarging or cropping
  the canonical board composition. Accepted-art safety may still raise the
  floor when the selected immutable art cannot cover the complete live stage.
- Viewports narrower than the 1920×1080 reference aspect retain ADR-0202's
  existing contain behavior. Narrow-layout redesign is outside this decision.
- Fixed previews, thumbnails, and non-Play board viewers retain ADR-0204's
  195:124 pane. Compact derivatives remain 390×248 and their framing revision
  does not change.

## Consequences

- The owner's normal Play resolution uses the complete browser width.
- The board's established opening scale and screen position remain stable while
  the HUD moves to the actual right edge.
- True ultrawide monitors receive intentional, symmetric wings instead of an
  unbounded tactical viewport.
- Thumbnail bytes and non-Play viewer geometry do not churn for a Play-only
  layout correction.
