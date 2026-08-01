---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0096](0096-level-editor-scenic-terrain-apron-is-decoration-only.md)'s gameplay and thumbnail visibility clause"
refines:
  - "[ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)"
  - "[ADR-0137](0137-subterrain-follows-the-visual-terrain-surface.md)"
  - "[ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md)"
  - "[ADR-0189](0189-board-facing-views-open-on-playable-geometry.md)"
  - "[ADR-0191](0191-board-opening-frame-uses-the-playable-contact-surface.md)"
---

# ADR-0284: Board views render the complete authored visual scene

## Context

The authored board deliberately includes visual terrain and scene content beyond
the playable rectangle. Gameplay retained the complete board code but rebuilt
its visual scene from playable cells, so War and every other Skirmish-backed
play surface silently discarded that surrounding artwork. This confused a
gameplay boundary with a rendering boundary.

ADR-0096 called the original rectangular apron an editor/art-handoff mode and
said gameplay and thumbnails continued to render the authored board only. Later
decisions made off-grid terrain, Subterrain, features, barriers, Scene Art, and
live cover parts of one authored visual scene. The remaining gameplay exclusion
no longer reflects the intended product.

## Decision

- Every board view renders the complete persisted authored visual scene,
  including active rectangular and sparse scenic terrain, Subterrain, linear
  features, fences and posts, walls, live cover, Scene Art, and retained legacy
  off-grid doodads or props. This applies uniformly to War Battles, Campaign
  Battles, Skirmish/test play, previews, replays, analysis viewers, and derived
  thumbnails.
- The playable rectangle remains the sole authority for gameplay addresses,
  hit targets, units, zones, collision, movement, objectives, promotion, and
  solver state. Off-grid visual content is visible but never interactive or
  gameplay-authoritative.
- Board-facing cameras continue to open on the playable contact surface plus
  its canonical margin. Off-grid scene content neither recenters nor zooms out
  the opening composition, but it remains visible wherever it intersects the
  viewport and remains available through ordinary camera movement.
- Legacy composed boards and AI pre-drawn boards obey the same visibility
  principle. AI mode retains its existing suppression of environment channels
  already baked into the accepted plate while preserving the plate's complete
  surrounding scenery and the separately live channels authorized by its
  contracts.
- Consumers use the canonical complete visual-board render plan. A play mode
  may replace live units or other gameplay state without reconstructing a
  playable-only parallel scene.

## Consequences

- Deliberately authored surroundings are visible to players rather than only
  during authoring and generation review.
- War does not acquire a special rendering policy; it continues to reuse the
  shared gameplay renderer.
- The tactical board remains legible and stable because opening framing and
  input geometry remain playable-owned.
- Gameplay readiness and resource manifests must include off-grid visual
  dependencies that can paint in the live viewport.

## More Information

- [Board render contract](../board-render-contract.md)
- [ADR-0098](0098-authored-board-extends-beyond-playable-grid.md)
- [ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md)
