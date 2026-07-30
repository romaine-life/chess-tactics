---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0226](0226-play-expands-before-ultrawide-wings.md)"
supersedes:
  - "[ADR-0203](0203-ordinary-board-previews-match-the-play-pane.md)'s ordinary-preview-only scope"
partially_supersedes:
  - "[ADR-0192](0192-interactive-board-viewports-share-a-four-by-three-shape.md)'s task-specific board-viewport exceptions"
  - "[ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)'s unchanged-other-surfaces clause"
refines:
  - "[ADR-0202](0202-play-uses-one-fixed-design-resolution.md)"
---

# ADR-0204: All board viewing panes match Play

## Context and Problem Statement

ADR-0202 made Play's 1560×992 board viewing pane stable, and ADR-0203 applied
its reduced 195:124 shape to ordinary level previews and thumbnails. Other live
board viewers still filled whatever rectangle their surrounding editor, replay,
solver, Gym, Game Lab, or Studio workspace happened to provide. The same board
therefore appeared through a hodgepodge of differently shaped windows.

Those workspaces need different surrounding UI layouts, but that does not
require the drawable board pane itself to change shape.

## Decision

Every surface whose rendered subject is a game board uses the Play board pane's
exact **1560:992**, reduced **195:124**, drawable aspect. This includes Play,
the Level Editor, selected-level previews, live read-only previews, replay and
solver boards, Gym and Game Lab boards, Studio board viewers, compact
thumbnails, and browser/server thumbnail bakes.

The shared `ViewPane` owns this rule for every `board` kind. It fits the largest
195:124 pane inside the surrounding workspace allocation; surplus space belongs
to the surrounding UI and is not part of the measured, clipped, or interactive
board viewport. The camera continues to contain the canonical playable contact
surface plus its five-percent margin in that exact pane.

Source media, model inputs, export artifacts, social cards, sprites, textures,
and other non-board assets retain the dimensions required by their formats.
Showing a board inside a generation-reference export does not turn that export
canvas into an application board viewport.

## Consequences

- Good: every application board view presents the same shaped window.
- Good: editor and analysis UI may still use different surrounding layouts.
- Good: new `ViewPane kind="board"` consumers inherit the invariant instead of
  choosing another ratio.
- Cost: a workspace whose allocation is not 195:124 gives its surplus area to
  adjacent or surrounding UI rather than stretching the board pane.

## More Information

- [Board render contract](../board-render-contract.md)
- [ADR-0201](0201-board-cameras-fit-the-actual-owning-viewport.md)
- [ADR-0202](0202-play-uses-one-fixed-design-resolution.md)
- [ADR-0203](0203-ordinary-board-previews-match-the-play-pane.md)
