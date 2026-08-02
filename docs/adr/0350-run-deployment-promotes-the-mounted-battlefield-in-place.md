---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s separate authored Deployment and Battle scene lifecycle"
  - "[ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)'s placement of the completed formation only in an incoming Battle presentation"
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s overlapping Deployment/Battle scenes and activation-owned arrival motion"
partially_superseded_by:
  - "[ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)'s per-new-unit arrival rule"
---

# ADR-0350: Run Deployment promotes the mounted battlefield in place

## Context and Problem Statement

Deployment and Battle were described as one continuous battlefield but implemented as separate
director scenes, session stores, and `SkirmishBoard` component trees. Committing the final
Disciplined unit therefore reconstructed the match, replayed unit arrival, and reacquired the
board even though the player had already placed pieces on that exact battlefield. The visible
result could discard or appear to move the chosen placement and made Battle start read as a new
board spawning over Deployment.

## Decision Drivers

- A committed placement must remain at the exact square the player chose.
- A board already visible and ready has no reason to reacquire or repaint its static scene.
- A unit already standing on the board must not disappear and arrive again.
- The persisted Deployment/Battle domain boundary remains necessary for saving choices and
  gating combat behavior.
- Phase-specific Controls may change without replacing the battlefield presentation.

## Considered Options

- Keep separate scenes and make their independently reconstructed pixels more closely match.
- Retain only camera state while remounting the board and match store.
- Treat Deployment and its Battle as one mounted battlefield activity whose domain mode changes
  in place.

## Decision Outcome

Chosen: **Deployment and its Battle are one mounted battlefield activity**, because visual
continuity requires identity continuity, not two reconstructions tuned to look similar.

- The pair shares one director manifest identity, Run presentation-slot identity, readiness
  signature, `SkirmishStoreProvider`, `SkirmishSession`, `SkirmishBoard`, compositor tree, and
  camera identity for the Run id and Battle index.
- Deployment remains a persisted Run phase. Its final required choice is first persisted and
  presented as Deployment state; the readiness action then advances the document to Battle.
- During that phase promotion, the final Deployment position remains the board's render source
  while the same mounted session store is synchronously prepared for live Battle before paint.
  Releasing the Deployment adapter changes board state, not board ownership.
- Piece identity and coordinates for already placed Disciplined units are preserved exactly.
  The deterministic remaining friendly formation and unresolved opponents join that same board;
  the entire position is not reconstructed as a second visible surface.
- A Deployment continuation suppresses initial unit-arrival motion and landing audio. Those
  effects remain valid when entering a Battle directly on a fresh mount or reload, but they may
  not replay for units the player has already seen on this mounted board.
- Controls, selection input, clocks, opponent behavior, and other combat-only systems remain
  gated by the Run phase. Because the battlefield scene is already active, the Battle domain
  transition—not a second director scene activation—opens those systems.
- Leaving the battlefield activity for Shop, Victory, another Battle index, or another workspace
  retains the ordinary authored scene lifecycle.

### Consequences

- Good: the player's exact placement visibly survives Battle start.
- Good: placed units do not respawn, and terrain does not blank, refit, or redraw at phase change.
- Good: camera continuity follows naturally from one owner instead of coordination between two
  overlapping owners.
- Cost: the Battle session supports a pre-combat presentation adapter and an in-place promotion
  path in addition to direct Battle entry.
- Cost: scene and readiness identities must encode battlefield activity rather than the persisted
  Deployment/Battle phase label.

## Pros and Cons of the Options

### Separate scenes tuned to match

- Good: keeps the prior director model unchanged.
- Bad: still remounts the board and store, so matching pixels cannot guarantee identity,
  placement, animation, or asset-lifecycle continuity.

### Retained camera only

- Good: avoids the most obvious zoom snap.
- Bad: preserves only one symptom while pieces, compositor state, and readiness still restart.

### One mounted battlefield activity

- Good: makes the implementation match the player's model and gives every visible object one
  continuous owner.
- Bad: phase behavior must be gated inside the retained session.

## More Information

- [Game concept](../game-concept.md)
- [UI Kit Standard](../ui-kit-standard.md)
- [Board render contract](../board-render-contract.md)
- [ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)
- [ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)
- [ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)
