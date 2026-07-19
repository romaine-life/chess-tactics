---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
---

# ADR-0116: Registered pre-drawn candidates activate the locked editor

## Context

The pre-drawn editor lock originally depended only on a persisted live-media
surface declaration. A development candidate could therefore be registered in
the calibration instrument but disappear when that instrument closed, leaving
the same level looking like an ordinary editable tiled board. Requiring media
acceptance before testing the real editor would reverse the intended review
order.

## Decision

A valid saved source registration plus an allowed same-origin development
candidate activates pre-drawn mode in the real Level Editor even when the board
does not yet have an accepted live-media surface. The registered candidate is
rendered as the one complete plate under the live grid. The editor disables
tile, generation, path, prop, fence, wall, wall-art, and dimension authoring and
rejects any equivalent mutation that bypasses those controls. Units, rules,
zones, doodads, and animated ground cover remain additive editable layers.
`DONE` removes the picker-open route flag so refresh returns to that locked
editor rather than reopening calibration.

The temporary review plate uses source-frame dimensions only in memory. Its
temporary source and synthetic review slot are never written into `EditorBoard`,
the working copy, a canonical level, or the runtime live-media catalog. Accepted
runtime art still requires the existing live-media promotion transaction.

## Consequences

- Closing calibration now lands directly in an honest pre-drawn board editor.
- Hidden shortcuts, stale route state, undo, and redo cannot mutate baked-art
  geometry while the registered review is active.
- Candidate review remains possible before acceptance without creating a second
  persistence or media path.
