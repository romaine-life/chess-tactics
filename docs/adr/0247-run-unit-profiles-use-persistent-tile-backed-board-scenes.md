---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
extends:
  - 0073-unit-art-is-live-storage-backed-content.md
  - 0225-run-bundle-cards-show-every-board-unit.md
refines:
  - 0230-run-shops-separate-buying-army-inspection-and-selling.md
---

# ADR-0247: Run unit profiles use persistent tile-backed board scenes

## Context

The Run Army ledger legitimately uses the canonical portrait treatment to scan
many units quickly. Its clicked unit profile reused that renderer in a much
larger square. The authored bust crop was consequently enlarged far beyond its
intended role and looked like a broken-resolution avatar.

The requested profile is not a larger portrait. It is an inspection of the
actual game piece standing in the game world. The repository already has one
canonical read-only board renderer, live board-unit identities, live terrain
surfaces, and seeded ground-cover composition.

## Decision

A clicked Run Army unit renders as a one-cell board scene.

- The scene uses the canonical `StudioReadOnlyBoard` composition and the same
  stable unit family, player palette, facing, seating, and live sprite used by
  gameplay.
- The portrait renderer remains in the compact Army ledger but is absent from
  the clicked profile.
- Every `RunArmyUnit` receives an unsigned `inspectionSeed` in the transaction
  that adds it to the army. Initial units receive their seed when the Run is
  created; draft and shop units receive it when acquired.
- Run format 4 requires that seed. Older Runs upgrade deterministically from
  their Run seed and stable unit identity without resetting progress or names.
- The renderer sorts installed live terrain surfaces by stable semantic id,
  uses the unit seed to choose one walkable surface, and uses the same seeded
  plan to choose no, sparse, or filled grass cover.
- The Run persists only the seed. Terrain, ground-cover, and unit pixels remain
  live-storage-backed and resolve through their canonical catalogs; the Run
  never stores a blob URL, media hash, or accepted pointer.
- The scene is non-interactive inspection. It does not create a tactical board
  address or mutate the current Battle.

## Consequences

- Enlarging or locally cropping portrait art cannot return in the unit profile.
- Each unit keeps a stable visual place across phases, resets, and cross-device
  resume while accepted live art can still update normally.
- Tile choice, grass distribution, sprite seating, and rendering remain
  deterministic and independently testable.
- Future unit-profile consumers can reuse the same scene without inventing
  another unit-on-tile compositor.

## More Information

- Extends [ADR-0073](0073-unit-art-is-live-storage-backed-content.md).
- Extends [ADR-0225](0225-run-bundle-cards-show-every-board-unit.md).
- Refines [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md).
