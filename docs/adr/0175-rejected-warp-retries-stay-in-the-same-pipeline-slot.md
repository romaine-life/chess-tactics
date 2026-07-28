---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)'s requirement that every different committed warp use another slot"
  - "[ADR-0170](0170-derived-board-inspection-is-a-full-workspace-revision-gate.md)'s Tweak grid in new attempt workflow"
refines:
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
---

# ADR-0175: Rejected warp retries stay in the same pipeline slot

## Context

A Board Art pipeline slot represents one chosen Raw Pipeline Source and the
deterministic work performed on it. Treating every rejected grid fit as another
slot made the slot list represent incidental retries instead of the owner's
actual source-art choices. Full-size inspection exposed the bad result but then
offered only **Tweak grid in new attempt**, leaving no way to return the current
slot to grid fitting.

The warped pixels are immutable, but immutability does not require a rejected
artifact to remain the current result of its slot.

## Decision

### One slot may retry its current warped stage

Before an occlusion-ready result exists, the owner may choose **Discard warped
board and adjust grid** from full-size inspection or **Discard warped board**
from the selected warped-artifact detail.

The fenced backend transaction:

1. locks the exact active attempt and compares both its row revision and current
   warped-version id with the owner's request;
2. proves that the warp is neither published nor selected by a working or
   canonical Level and that no occlusion-ready child is attached;
3. archives the exact warped version without changing or deleting its pixels,
   hashes, operation, provenance, or retained Blob;
4. clears only the attempt's current warped-stage pointer and increments its
   revision; and
5. records the version archive and attempt-stage discard as auditable events.

The attempt id, Raw Pipeline Source id, Generation Reference provenance, and
slot position remain unchanged. The UI returns that same slot to its Raw
Pipeline Source, preloads the rejected warp's direct saved registration, and
opens the full grid editor. The next generate action creates the slot's new
current warped artifact. A discarded artifact remains retained history but is
not shown as one of the slot's current three stages.

The action is an exact compare-and-swap, not a generic version delete. Stale
requests, cross-document ids, missing write authority, a different current
warp, published or selected artwork, and an attached occlusion result fail
without changing either the attempt or the artifact. The UI shows the concrete
reason; it never leaves an inert disabled control unexplained.

### Retry identity remains safe

Creation retries for an interrupted upload continue to resolve the exact
already-attached draft. After a stage discard, a new generation intent receives
a fresh stable attempt-stage revision in its idempotency identity, so generating
the same deterministic registration again cannot collide with the archived
artifact. The stage revision used by an in-flight draft is persisted with that
draft and reused when its upload resumes.

The new `stage-discarded` audit action is introduced only by the next append-only
database migration. An already-applied migration is never edited to add it.

## Consequences

- The owner can inspect, reject, refine, and regenerate a grid fit without
  manufacturing another slot or reselecting the same raw art.
- Slots correspond to source-art pipeline choices; rejected deterministic
  iterations remain retained audit history.
- Immutable art and Blob retention remain unchanged.
- Occlusion must be absent before the warped stage can be discarded. A future
  downstream retry instrument must explicitly discard its dependent suffix.

## Verification

Contract-complete implementation proves that:

- discarding returns the same attempt and raw ids with a null warped pointer,
  while the exact prior warp is archived and byte/hash unchanged;
- the rejected registration opens in that same slot's grid editor;
- a revised warp and an exact-same-registration warp can each attach after
  discard without breaking interrupted-upload replay;
- stale revision/id, selected, published, downstream-occupied, cross-document,
  and unfenced requests leave all rows unchanged; and
- the full-size inspector and ordinary warped-artifact detail both expose the
  action and visible failure state.
