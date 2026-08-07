---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0353](0353-battlefield-view-state-is-instance-owned-and-camera-ready-before-reveal.md)"
---

# ADR-0501: Play surfaces load with the board grid enabled

## Context

Play battlefields already render a canonical grid overlay and expose Grid and Clear all controls,
but each new battlefield initialized the overlay as hidden. The grid is useful orientation on every
play surface, and players need one durable place to choose whether a newly loaded board shows it.

## Decision

Every newly mounted play battlefield seeds its instance-owned grid overlay from one device-local
**Board grid** preference. That preference is owned by the shared application-settings store and is
exposed under Settings > Gameplay. Its installed default is enabled; an older settings blob without
the field also normalizes to enabled.

The existing in-battle Grid and Clear all controls remain temporary view controls for the current
mounted battlefield. They do not rewrite the saved preference. A distinct battlefield mount reads
the Gameplay setting again. This applies to standalone and Run play surfaces through their shared
battlefield view-store provider; editor and Studio inspection grids retain their own policies.

## Consequences

- The tactical cell structure is visible on first paint without requiring a HUD action.
- Players can opt out once in Settings and have later play surfaces load without the grid.
- Temporary in-battle inspection choices do not silently change the player's saved default.
- One normalized settings field and one battlefield initializer serve every play entry path.

## More Information

- [Board render contract](../board-render-contract.md)
- [Shared UI primitive registry](../shared-ui-primitives.md)
- [ADR-0353](0353-battlefield-view-state-is-instance-owned-and-camera-ready-before-reveal.md)
