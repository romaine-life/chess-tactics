---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s single mixed queue instead of separate waves"
partially_supersedes:
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s immediate phase commit before the final placement presentation settles"
  - "[ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)'s allowance for a final Discipline arrival and Battle additions to overlap"
---

# ADR-0352: Final Discipline arrival precedes the automatic deployment wave

## Context and Problem Statement

Per-unit arrival tracking restored the correct entry motion without remounting the battlefield,
but the final Disciplined unit and the automatically resolved formation entered in one overlapping
cycle. The click therefore read less like the player's last deliberate placement and more like the
first member of the automatic wave.

The two events have different authors and should remain legible: first the player's final placement,
then the game's automatic deployment.

## Decision Drivers

- Every Disciplined placement, including the last one, should read as its own player action.
- Automatic deployment should read as a separate response after manual deployment is complete.
- The player should not need another confirmation.
- The sequence must use the compositor's actual animation completion, not a duplicated screen timer.
- Separating the waves must not remount, hide, or redraw the battlefield.

## Decision Outcome

Chosen: **the final manual arrival completes during Deployment before Battle promotion introduces
the automatic wave.**

- A placement click persists the chosen square and records that unit id as the pending manual
  arrival.
- The mounted compositor reports its active arrival ids. The Run remains in Deployment until the
  pending id has been observed and the complete manual arrival cycle has settled.
- Settlement automatically commits the ready Deployment document; there is no confirmation step.
- Battle promotion then introduces unresolved friendly and enemy units as a new side-aware arrival
  wave. Previously placed Disciplined ids remain excluded by the mounted unit-identity ledger.
- Non-placement Deployment choices retain immediate ready-state advancement because they have no
  manual unit arrival to finish.
- The board, canvases, camera, provider, and scene identity remain continuous across both waves.

This is a narrow sequencing exception to ADR-0045's general rule that entry motion does not gate
play. Run Deployment is already a pre-combat interaction phase, and the owner-selected ordering
requires Battle activation to follow the final manual landing rather than overlap it.

### Consequences

- Good: the last player choice and the automatic formation read as two authored beats.
- Good: automatic Battle entry remains hands-free.
- Good: no duration constant is duplicated above the compositor.
- Cost: Battle activation waits for the bounded final manual entry cycle.

## More Information

- [ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)
- [ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)
- [ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)
- [Game concept](../game-concept.md)
