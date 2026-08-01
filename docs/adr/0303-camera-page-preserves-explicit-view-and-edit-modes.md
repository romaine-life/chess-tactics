---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)'s automatic writer-edit and unnecessary-mode-control clauses"
---

# ADR-0303: Camera page preserves explicit View and Edit modes

## Context

Moving Camera authoring out of Board correctly established a dedicated Camera page, but the first
pass removed the explicit Edit choice and made handles appear automatically only for the active
writer. That preserved the underlying mutation code while taking away a legible capability and made
the observation-only screenshot look as though camera editing no longer existed.

Moving a capability between editor pages does not authorize removing or obscuring it. Read-only
state must explain why a mutation is unavailable without erasing the control from the interface.

## Decision

The dedicated Camera page owns an explicit house dropdown with **View boundary** and **Edit
boundary** modes. A writing session defaults to Edit. View leaves the persistent boundary visible
without mutation handles. Edit exposes one direct move surface covering the complete box interior
and eight edge/corner resize handles; every control retains its keyboard operation.

An observation-only session resolves the selector to View and shows Edit as disabled. Supporting
copy names the missing editor lease. Gaining the writer lease restores the user's previous mode
intent; the capability is not deleted or conditionally omitted.

Snap remains an explicit authoring action on the Camera page. A successful writer Snap selects Edit,
frames the resulting boundary, and participates in the same undo and persistence path as direct
manipulation.

ADR-0302's dedicated `layer=camera` page, Board-page cleanup, and route behavior remain unchanged.
ADR-0301's camera geometry, presets, persistence, and runtime enforcement remain unchanged.

## Consequences

- Camera mutation remains discoverable even while temporarily unavailable.
- View and Edit are deliberate author choices rather than an implicit consequence of lease state.
- Moving the box no longer depends on finding a small label-sized drag target.
- Future page restructuring must preserve the explicit capability or record another decision.

## More Information

- [ADR-0302](0302-camera-authoring-is-a-dedicated-level-editor-page.md)
- [ADR-0301](0301-levels-own-an-authored-camera-coverage-boundary.md)
- [Board render contract](../board-render-contract.md)
