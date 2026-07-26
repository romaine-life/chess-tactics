---
status: "accepted"
date: 2026-07-24
deciders: Nelson, Codex
partially_supersedes: "[ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md) isolated native-frame review clause"
---

# ADR-0151: Source-art review requires interactive board placement

## Context and Problem Statement

ADR-0150 supplied complete eight-direction candidate groups, but its Studio
instrument presented eight isolated native-size frames. That surface could
prove that files existed and decoded; it could not prove the owner could place,
scale, move, or rotate the artwork in board context. Requiring acceptance
before the Level Editor could use those frames made the approval decision
depend on the very interaction that approval was withholding.

## Decision Outcome

Source-art candidate review uses an interactive game-board proof before
acceptance:

- the exact selected private candidate for the current direction is mounted
  transiently over `BoardLabBoard`, without installing it or writing a
  candidate id, URL, or hash into board content;
- the proof uses the same floating-artwork model as the Level Editor: a free
  projected-scene pixel center, per-instance scale, and one of the canonical
  eight rendered directions;
- the candidate has a dotted image-bounds selection box, supports direct drag,
  and exposes slider-plus-number controls for X, Y, and Scale plus the shared
  eight-way facing compass;
- all eight exact candidate rasters must decode at their native 512×512
  dimensions and each direction must mount successfully on the board before
  Studio can record owner review;
- review evidence records the exact candidate and slot snapshots, the shared
  board renderer, all mounted directions, and the tested placement transform;
  old isolated-frame evidence does not satisfy this proof; and
- atomic acceptance and drawable installation remain separate transactions
  after the board-context review.

The candidate overlay exists only inside the authenticated review instrument.
It does not mutate the public drawable catalog. After installation, the same
stable source-art identity becomes available through the ordinary Level Editor
Artwork shelf and its persistent floating-artwork controls.

## Consequences

- The owner can test placement and eight-way rotation before deciding whether
  the candidate should become installed artwork.
- Review no longer asks acceptance to stand in for interaction testing.
- Private candidate media remains outside runtime content and public catalogs.
- Native raster validation remains mandatory but is no longer mistaken for the
  owner-facing review surface.

## More Information

- Partially supersedes the isolated native-frame proof clause of
  [ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md).
- Reuses the free-transform semantics of
  [ADR-0147](0147-floating-artwork-uses-projected-scene-pixels.md) and
  [ADR-0148](0148-floating-artwork-uses-dedicated-placement-and-explicit-selection.md).
- Refines the game-owned instrument requirement of
  [ADR-0071](0071-the-deliverable-is-the-instrument.md).
