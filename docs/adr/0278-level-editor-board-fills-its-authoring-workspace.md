---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0204](0204-all-board-viewing-panes-match-play.md)'s main Level Editor clause"
  - "[ADR-0259](0259-the-live-play-composition-is-the-authority-derived-views-conform.md)'s main Level Editor clause"
restores:
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)'s actual-owning-viewport rule for the main Level Editor"
---

# ADR-0278: Level Editor board fills its authoring workspace

## Context and Problem Statement

The shared `ViewPane` gives ordinary board previews one canonical 4:3 window.
ADR-0204 applied that seat to the main Level Editor as well. The editor already
owns a complete authoring workspace beside its fixed control rail, however, so
the nested seat turns part of that workspace into surplus area and clips the
editable board before the workspace boundary. The same level does not exhibit
the regression in Run because its full-canvas board opts out of the nested seat.

The cross-surface camera policy remains valuable, but a fixed preview window is
not the same thing as the full canvas in which an owner authors a level.

## Decision

The main Level Editor board uses the complete allocation supplied by its
`.skirmish-board-frame` as its one viewport. Camera measurement, clipping,
pointer input, visible-area scenic fill, accepted-art coverage, and reset
framing all use that same rectangle.

The editor selects the shared `ViewPane`'s existing `fill` mode; it does not
introduce a bespoke board renderer or a Level-Editor-only camera calculation.
The fixed 4:3 seat remains the default for ordinary previews, replay and solver
boards, Gym and Game Lab boards, Studio board viewers, and thumbnails. Play
retains its separately owned 4:3 frame and existing `fill` selection.

## Consequences

- The editable canvas reaches the Level Editor workspace boundary without a
  hidden fixed-aspect inset or an early clip.
- Viewport-derived editing actions use every pixel the editor visibly provides.
- The same shared `ViewPane`, camera policy, and board renderer remain in use.
- The main Level Editor may show a different literal viewport shape from a 4:3
  preview; Play/Test remains the authority for judging the gameplay crop.
