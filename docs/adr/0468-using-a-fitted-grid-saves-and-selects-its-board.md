---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0178](0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md)"
  - "[ADR-0467](0467-first-time-grid-fitting-starts-from-the-game-grid.md)"
---

# ADR-0468: Using a fitted grid saves and selects its board

## Context

The pipeline previously treated **Use this grid** as temporary component state.
Closing and reopening the workspace lost that placement, while selecting the raw
board ignored it and used the original generation-frame bounds. A second
**Create corrected copy** action was required to make the fitted placement real.
This made a completed owner decision look saved when it was not.

A versioned Level surface cannot carry the grid registration as a hidden runtime
transform: ADR-0158 requires the deterministic transform to be materialized once
as an immutable raster child. The owner should not need to understand or operate
that storage step separately.

## Decision

The grid fitter's final action is **Use fitted board**. It submits the exact
displayed registration, deterministically creates or resumes its immutable
corrected-raster child, and selects that child on the fenced working copy when
its content is ready. There is no separate ordinary **Create corrected copy**
step. Occlusion remains a later optional action.

Before submission, the browser records the exact registration under the exact
raw-version content URL as recovery state. The durable corrected version remains
the installation authority and records the registration in its immutable
operation. Reopening the raw fitter loads the newest durable registration first
and the exact-source recovery record only when no durable registration exists.
A failed create can therefore resume without silently returning to the seed.
When a corrected board must be retained—especially published history—**Refit
board** starts a new slot from its exact raw parent and restores the corrected
version's durable registration before opening the fitter. It never mutates the
retained board.

**Use unchanged board** remains available, but explicitly means the original raw
pixels at their original viewing-pane placement; it does not claim to apply a
fitted grid. Runtime continues to place versioned rasters only by their immutable
world bounds and never interprets registration data.

## Consequences

- A grid the owner finishes is no longer disposable screen state.
- The board shown after fitting uses the exact submitted placement.
- The immutable transform still happens once, but it is an implementation step
  of the owner's single action rather than another workflow gate.
- Raw unchanged selection and fitted selection now have distinct, honest
  meanings.
- A retained corrected board can be revised without reconstructing its previous
  placement.

## Verification

- **Use fitted board** submits the currently displayed registration, creates or
  resumes the corrected child, and selects that child on the working copy.
- Reopening the fitter restores the durable registration or exact-source recovery
  registration rather than reseeding.
- **Use unchanged board** does not consume a fitted registration.
- **Refit board** opens a new slot over the raw parent with the corrected
  version's exact durable registration.
- No versioned runtime renderer reads or applies registration data.
