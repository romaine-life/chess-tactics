---
status: "accepted; immediate-write/no-save-action clause superseded by ADR-0108"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0135](0135-predrawn-registration-is-owner-picked-source-geometry.md)"
partially_superseded_by: "[ADR-0108](0108-predrawn-registration-is-local-first-and-explicitly-saved.md)"
---

# ADR-0107: Pre-drawn registration has no unsaved dialog state

## Context

ADR-0135 required an owner-operated source-corner picker but specified a separate
Apply action. That left a newly picked point only in React dialog state until a
second gesture committed it. A tab reconnect, refresh, or inspection could then
reconstruct the picker from the unchanged URL and lose the owner's selection.
The UI could also report an apparently successful no-op while the durable review
handoff still contained the old coordinates.

The development review URL is already the authority for temporary registration.
Keeping a second, unsaved registration inside the dialog adds failure modes and
no useful authoring capability.

## Decision

Every complete corner edit writes through to the development review URL
immediately. A source-image click, a keyboard nudge, and restoring the points
that opened the picker each serialize `(source width, source height, N, E, S, W)`
to `predrawnCorners` with history replacement and enable the live grid.

The picker has no Apply or Cancel transaction. Its final action only closes the
instrument. The footer explicitly distinguishes the untouched opening state from
a point already saved to the review URL. Reconnecting or refreshing the route
must reconstruct the latest owner-picked coordinates.

This changes only the temporary development handoff. It still does not write
registration into saved level content or accept a runtime plate.

## Consequences

- An owner-picked point survives tab handoff, inspection, refresh, and editor/play
  round trips without a second commit gesture.
- The URL and the visible picker cannot silently disagree about the current
  registration.
- Closing the picker is safe because there is no pending registration to lose.
- Reset is an explicit durable edit back to the coordinates present when the
  picker opened.
