---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0202](0202-play-uses-one-fixed-design-resolution.md)"
  - "[ADR-0226](0226-play-expands-before-ultrawide-wings.md)"
partially_supersedes:
  - "[ADR-0203](0203-ordinary-board-previews-match-the-play-pane.md)'s 195:124 ratio and 390×248 raster (its one-shared-shape rule survives at 4:3)"
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)'s 195:124 ratio (its ViewPane one-shared-shape mechanism survives at 4:3)"
restores:
  - "[ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)'s shared 4:3 board viewport as the canonical window"
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)'s live-viewport camera authority for Play"
---

# ADR-0259: The live Play composition is the authority; derived views conform

## Context and Problem Statement

The Battle screen's composition — the real-pixel title bar, the
`clamp(300px, 24vw, 360px)` HUD rail, and the playfield with its largest-4:3
drawable board frame — was deliberately sized and owner-accepted. ADR-0202 and
ADR-0226 then froze Play into a 1920×1080 design canvas, scaled the replaceable
scene to the browser, and pinned the HUD at 360 design pixels, so that
thumbnails and previews could match one stable reference (ADR-0203/0204).

That inverted the real authority relationship. The owner's accepted Battle
composition was resized and rescaled to serve its own derivatives, and because
ADR-0213's persistent title bar stays in viewport pixels while the scene
scaled, one screen carried chrome at two different rendered scales: the HUD's
kit rails no longer matched the title bar's, and the title bar's control-branch
junction (positioned from the pre-canvas `--skirmish-rail-w`) no longer landed
on the HUD's left rail at any viewport where the canvas scale differed from 1.

The problem the canvas tried to solve is real: the app displayed boards through
three different windows (Play's frame, 4:3 interactive viewports, 3:2
thumbnails). But the board's shape is the least changeable of the three, and
derivatives can conform to it trivially — a thumbnail changes its raster height
and nothing else.

## Decision

- **Play is composed in real viewport pixels.** The whole-scene design-canvas
  transform (`installPlayCanvas`, `--skirmish-canvas-*`, `is-play-canvas`,
  ultrawide wings) is removed. The HUD rail returns to the shared real-pixel
  `--skirmish-rail-w` every consumer — the screen grid and the title-bar
  junction rules — reads at the same scope, so panel chrome and title-bar
  chrome render at one scale and the control-branch junction sits on the HUD's
  left rail by construction.
- **The live gameplay board keeps its accepted frame**: the largest 4:3
  drawable viewport inside the playfield (restored `.skirmish-board-frame`
  rules), with the board art bleeding full-screen behind the floating chrome.
  Camera measurement, accepted-art coverage, and input use that framed pane
  (ADR-0201). The bleed selectors reach only the Play board's own stage;
  seated board previews inside Run workspaces keep their clip.
- **Every derived board view speaks the board's language: one canonical 4:3
  window.** `BOARD_PREVIEW_ASPECT` is 4:3 and the shared ViewPane seat,
  selected-level preview, and thumbnail boxes all resolve it from the one
  `--board-view-aspect` declaration. ADR-0203/0204's single-shared-shape rule
  survives; only the ratio authority moves from a frozen Play canvas to the
  board's own 4:3 frame.
- **Thumbnails conform by height change only.** The compact delivery raster
  returns to its 288px width and takes the canonical height: **288×216**.
  `BOARD_PREVIEW_FRAMING_REVISION` and the backend renderer revision are
  bumped so every cached derivative regenerates; framing-revision-keyed reads
  repair stale rasters without touching accepted board artwork.
- Browser dimensions size the composition through ordinary CSS layout, exactly
  as before the canvas: no letterboxing, no scene transform, no design-pixel
  indirection.

## Consequences

- The owner's accepted Battle composition — panel size, frame weight,
  resolution — is back, and chrome consistency between the persistent title
  bar and the scene panels is structural rather than scale-dependent.
- Board views still share one window shape app-wide; the "three sizes" problem
  stays solved, in the board's own 4:3 terms.
- All cached thumbnails regenerate once at 288×216.
- Fixed-canvas affordances (deterministic design-pixel composition,
  letterboxed scaling, ultrawide wings) are given up; any future need for them
  must not resize the accepted live composition to serve derivatives.
