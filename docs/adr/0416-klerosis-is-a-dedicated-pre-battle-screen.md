---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s whole-Deployment battlefield scope"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)'s battlefield mount before the Klerosis information boundary"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s immediate Deploy all/Step through choice on the dealt-card presentation"
refines:
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0386](0386-shops-offer-read-only-intelligence-on-the-upcoming-battle.md)"
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
---

# ADR-0416: Klerosis is a dedicated pre-Battle screen

## Context

Klerosis was first presented as a transparent modal over the Deployment battlefield. That
composition treated three opening-Conflict cards as though they were the permanent spatial
limit even though every later Conflict can add another dealt card. It also mounted the board
before the player had acknowledged the deal and mixed two distinct decisions on one surface:
which cards and units this combat received, and how quickly those units should be placed.

The recently added Shop **View Battle** destination demonstrated the correct full-Run workspace
boundary, but its reconnaissance content remains Sectio-only. Klerosis needs the same durable
workspace capability, not reuse of the Shop's Battle Preview screen.

## Decision

- Klerosis is a dedicated full Run workspace before the battlefield. It is not a board overlay,
  and no Deployment board is mounted behind it.
- The cards deal visibly in their exact persisted order into a wrapping, vertically scrollable
  field with no three-card layout assumption. The already-resolved Deploying and Unavailable
  rosters appear on the same screen.
- Klerosis offers one consequential action: **Confirm**. **Deploy all** and **Step through** do
  not appear on this screen.
- Confirm persists the existing `deployment.stage` boundary from `klerosis` to
  `primogeniture` without selecting `deployment.mode`. No new Run phase, save version, or
  database migration is introduced.
- The confirmed state requests a director-owned scene transition into the canonical mounted
  battlefield. Deployment Controls then asks for **Deploy all** or **Step through** before any
  unit placement reveals new information.
- Only confirmed Deployment and Battle share the continuous battlefield scene identity.
  Reloading an unconfirmed deal returns to the Klerosis workspace; reloading a confirmed deal
  returns to the battlefield.
- The workspace enters through the canonical `RunForm`, so the title, Controls surface,
  lipsanon strip, and Run-wide Strategikon remain structural. Klerosis reuses
  `RunSceneViewport`; it does not reuse `RunBattlePreview` or create another shell.

## Consequences

- Later Conflicts can display growing deals without compressing them into the board viewport.
- The deal and placement pace are separate, legible decisions with one information boundary.
- The battlefield lifecycle still remains continuous from confirmed Deployment through Battle.
- Scene identity, rather than a presentation test or local conditional, prevents Klerosis from
  being mounted as a battlefield overlay again.

## More Information

- [Game concept](../game-concept.md)
- [Shared UI primitives](../shared-ui-primitives.md)
- [ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)
- [ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)
