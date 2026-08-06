---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
---

# ADR-0491: Camera boundary can adopt the current editor view

## Context

Camera authors can resize the persistent boundary directly or replace it with a level-derived
preset. Neither path supports the natural composition workflow of zooming and panning the
unconstrained editor canvas until it shows the desired player area and then keeping that rectangle.
The full-interior drag control also inherited an opaque button fill, hiding the artwork that authors
need to compose against.

## Decision

The dedicated Camera page adds an explicit **Set from view** action. It converts the complete
measured editor viewport from its current zoom and pan into one world-space rectangle, then sends
that rectangle through the existing camera-boundary normalization, undo, autosave, and persistence
path. The action does not reframe the editor after capture, and it leaves a writing session in Edit
mode so the resulting outline and handles remain immediately adjustable.

The canonical opening board frame remains mandatory. If the visible rectangle excludes any of it,
normalization expands the captured boundary just enough to retain that frame and reports the
adjustment. Read-only sessions show the action disabled.

The full-box move control is an input surface only. It must remain visually transparent; the
boundary outline, label, focus treatment, and resize handles provide its authored presentation.
The main editor camera remains unconstrained, and runtime camera coverage continues to use the
intersection of the persisted boundary and accepted artwork exactly as established by ADR-0301.

## Consequences

- Authors can define camera room by composing the view directly instead of translating it into
  numeric handles or a preset.
- The captured boundary is exact for the measured editor viewport, except for the standing opening
  frame invariant.
- Editing the boundary no longer obscures the artwork being judged.

## More Information

- [ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)
- [ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)
- [ADR-0303](0303-camera-page-preserves-explicit-view-and-edit-modes.md)
- [Board render contract](../board-render-contract.md)
