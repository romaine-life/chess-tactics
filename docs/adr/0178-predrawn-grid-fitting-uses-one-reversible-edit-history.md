---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md)"
  - "[ADR-0113](0113-predrawn-calibration-can-snap-to-the-canonical-grid-shape.md)"
  - "[ADR-0114](0114-predrawn-calibration-keeps-an-independent-pinned-boundary.md)"
  - "[ADR-0171](0171-local-predrawn-grid-correction-uses-a-shared-vertex-mesh.md)"
---

# ADR-0178: Pre-drawn grid fitting uses one reversible edit history

## Context

The pre-drawn grid fitter combines coarse corners, row and column guides,
refit dimensions, an independent painted-boundary reference, and sparse local
mesh corrections. A history containing only local mesh offsets leaves the
owner unable to reverse most visible adjustments while generic Undo and Redo
controls imply that the complete instrument is reversible.

Grid fitting is meticulous, exploratory work. The owner must be able to compare
and retreat from any valid calibration adjustment without reconstructing the
prior geometry manually.

## Decision

The grid-fitting workspace owns one bounded, session-local Undo/Redo history
for the complete pending calibration. Each snapshot contains the exact working
corners, optional pinned-boundary corners, refit column and row counts, column
and row guides, and sparse shared-mesh overrides.

History covers:

- coarse corner placement, drag, and keyboard nudge;
- whole-grid drag and keyboard nudge;
- row and column guide drag and keyboard nudge;
- refit dimension changes;
- Snap ideal grid and Reset spacing;
- pin/update, clear, drag, and keyboard nudge of the boundary reference;
- local shared-node drag and keyboard nudge;
- reset of one local corner, one tile, or all local refinements; and
- Restore opening calibration.

One completed drag is one history step. Each successful discrete action,
keyboard nudge, or accepted dimension change is one step. Compound actions
restore atomically: dimension plus rebuilt guides, both axes of spacing, and
snap geometry plus both guide arrays never fragment into separate steps.
Invalid, constrained, and exact no-op actions create no entry.

Undo restores the exact previous snapshot and moves the displaced current
snapshot to Redo. Redo restores the exact next snapshot. A new calibration
mutation after Undo clears Redo. Switching between Coarse grid and Local cells
does not clear history.

Pan, zoom, mode changes, cell/control selection, feedback, Save, handoff copy,
and closing are not calibration mutations and do not create history. Saving or
deriving consumes the exact currently displayed calibration; the transient
history itself is not persisted and does not become artifact lineage.

The workspace keeps plainly labeled Undo and Redo controls visible in both edit
modes. Their enabled state is determined only by the corresponding stack.

## Consequences

- Every authored grid adjustment can be reversed through one predictable
  control pair.
- Coarse and local work can be interleaved without discarding earlier history.
- Full snapshots cost more memory than mesh-only history, so the stack remains
  bounded to 100 entries.
- View navigation and selection remain lightweight and do not pollute
  calibration history.

## Verification

- Pure snapshot tests change every calibration field, undo them in exact reverse
  order, redo them forward, and prove deep-clone isolation.
- Compound-operation tests prove atomic restoration for whole-grid movement,
  dimension changes, spacing reset, snap, local reset, and opening restore.
- Wiring tests cover every mutation class, one entry per completed drag, no
  entry for rejected/no-op changes, redo invalidation, and the 100-entry bound.
- Live observation verifies that coarse and local edits enable Undo, Undo
  enables Redo, and the displayed grid round-trips without acquiring the
  owner's writer lease.
