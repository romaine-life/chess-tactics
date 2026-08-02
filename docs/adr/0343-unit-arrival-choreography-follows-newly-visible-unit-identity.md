---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0342](0342-run-deployment-promotes-the-mounted-battlefield-in-place.md)'s blanket suppression of arrival choreography during Deployment-to-Battle continuation"
partially_superseded_by:
  - "[ADR-0344](0344-final-discipline-arrival-precedes-the-automatic-deployment-wave.md)'s sequential final-manual-then-automatic arrival rule"
---

# ADR-0343: Unit arrival choreography follows newly visible unit identity

## Context and Problem Statement

ADR-0342 correctly retained one mounted battlefield across Run Deployment and Battle, but its
implementation represented continuity with a board-wide `skipInitialArrival` switch. That switch
also disabled the established entry animation for a Disciplined unit when the player placed it and
for the unresolved formation when those units first joined the board at Battle start. The board no
longer respawned, but genuinely new units simply appeared.

The lifecycle boundary and the animation boundary are different: the battlefield stays mounted,
while individual units can still become visible for the first time.

## Decision Drivers

- A unit already visible during Deployment must not move, disappear, or replay its entrance.
- A unit first placed by the player should use the same physical entry treatment as any other unit
  entering the battlefield.
- Remaining friendly and opposing units introduced at Battle start should not pop into existence.
- Arrival choreography must not require remounting the board, rebuilding terrain, or changing the
  camera.
- Unit identity, not a persisted phase label, is the durable boundary for this presentation state.

## Decision Outcome

Chosen: **the retained board tracks which live unit identities it has already presented and applies
arrival choreography only to newly visible identities.**

- `SkirmishSceneLayer` owns a presentation-only ledger of visible unit ids for its mounted lifetime.
- When a non-neutral live unit id first appears, that unit receives the canonical ADR-0045
  materialize-and-drop animation at its already-resolved square.
- A Disciplined placement starts immediately because the click itself supplies the entry beat.
- At Battle promotion, the remaining friendly and opposing additions use the normal side-aware
  stagger. Disciplined units already in the ledger remain seated at their exact coordinates.
- Removing a unit retires it from the visible ledger, so an actual later reintroduction of that id is
  eligible for arrival again.
- The board, terrain canvases, session provider, `ViewPane`, and camera remain mounted throughout.
  Arrival is a change in per-unit presentation state, not a scene transition.
- Combat input and clocks remain phase-gated independently from arrival presentation. Deployment
  can therefore animate a placed unit without becoming a live Battle.

### Consequences

- Good: every genuinely new unit enters with the established game-world motion instead of popping.
- Good: already-placed units retain exact visual and domain identity through Battle start.
- Good: the continuity fix no longer disables a feature that belongs to units rather than scenes.
- Cost: the scene compositor retains a small mounted-lifetime id ledger and overlapping per-unit
  arrival plans instead of one board-wide Boolean.

## More Information

- [ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)
- [ADR-0342](0342-run-deployment-promotes-the-mounted-battlefield-in-place.md)
- [Game concept](../game-concept.md)
- [Board render contract](../board-render-contract.md)
