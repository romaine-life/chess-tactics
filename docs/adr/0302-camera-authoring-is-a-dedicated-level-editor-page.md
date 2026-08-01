---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0303](0303-camera-page-preserves-explicit-view-and-edit-modes.md)"
partially_supersedes:
  - "[ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)'s Board-page Camera-boundary instrument clause"
refines:
  - "[ADR-0278](0278-level-editor-board-fills-its-authoring-workspace.md)"
---

# ADR-0302: Camera authoring is a dedicated Level Editor page

## Context

ADR-0301 placed Camera-boundary visibility, edit mode, snap presets, and the Snap action inside the
Board page. That made an independent level-authoring concern compete with board dimensions, scenic
terrain, level settings, zoom, tactical overlays, and grid controls. The owner requested a new
Camera destination in the editor's existing main page dropdown instead of more controls in Board.

## Decision

Camera is a peer, URL-addressable Level Editor page in the canonical layer dropdown. Its route is
`layer=camera`. Board contains no camera-boundary display dropdown, snap preset, Snap action, or
camera readout.

Entering Camera frames and displays the resolved persistent boundary. A writing session receives
the direct box, edge, and corner handles; an observation-only session sees the same boundary without
mutation controls. Leaving Camera hides the authoring overlay. The Camera page owns the resolved
origin and size readout plus the Balanced, Proportional, and Fixed preset dropdown and explicit Snap
action defined by ADR-0301.

Camera is a non-painting editor page. The ordinary select, brush, erase, and placed-object move tools
are unavailable there; interaction belongs to the camera-boundary handles. The page remains
available for both ordinary and pre-drawn levels because it changes camera intent rather than baked
environment pixels.

ADR-0301's boundary geometry, default policies, persistence, gameplay zoom/pan enforcement, opening
frame invariant, and pre-drawn artwork intersection remain unchanged.

## Consequences

- Board returns to board-owned controls only.
- Camera authoring is discoverable alongside the editor's other first-class pages and has a stable
  copyable URL.
- The boundary is automatically visible where it can be edited, so a second display-mode dropdown
  is unnecessary.
- Review sessions can inspect the exact boundary without taking the editor lease.

## More Information

- [ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)
- [Board render contract](../board-render-contract.md)
