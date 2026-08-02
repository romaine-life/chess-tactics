---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0353](0353-battlefield-view-state-is-instance-owned-and-camera-ready-before-reveal.md)'s rule that scene activation gates unit arrivals, which gated their staging as well as their motion"
refines:
  - "[ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)"
  - "[ADR-0351](0351-unit-arrival-choreography-follows-newly-visible-unit-identity.md)"
---

# ADR-0356: A unit awaiting its entrance is staged off the board

## Context and Problem Statement

Starting a battle drew the board with the whole army already standing at its final seats. The
army then vanished, and only then played ADR-0045's staggered drop-in. Three states, in the wrong
order, for something that is supposed to read as one arrival.

The cause was a boundary, not a timing bug. ADR-0353 established that scene activation gates
unit-arrival motion, and the compositor implemented that by creating arrival plans only once
activated: an un-planned unit painted at its seat, fully opaque. But a scene is **revealed during
its entrance and activated when that entrance completes**. Between those two moments the
battlefield is on screen and un-activated, so it had no plans, so it painted the seated army.
Activation then created the plans and every unit snapped off the board to begin arriving.

The window is a race between the board finishing its own preparation and the scene finishing its
entrance, so it appeared and disappeared with machine speed and asset warmth. On a warm campaign
entry it was consistently ~800ms of seated army followed by a full re-entry.

## Decision Drivers

- ADR-0353 already requires that a destination's first visible frame be the frame it intends.
  That was applied to the camera; units are subject to the same claim.
- Activation is the right gate for arrival *motion*: input, clocks, opponent behavior and the
  entrance beat all belong to a committed scene.
- Activation is the wrong gate for arrival *staging*, because reveal happens strictly before it.
- "This unit has no plan" and "this unit has not arrived yet" must not be the same state.
- ADR-0351's identity ledger must keep working: a mounted battlefield introduces later units
  without replaying the units already standing on it.

## Decision Outcome

Chosen: **a unit's entrance is staged when the unit is admitted to the board, and released when
the battlefield is activated. A staged unit is painted off the board, never at its seat.**

- An arrival plan carries a null `startMs` while staged. `arrivalOffset` answers with the
  off-board pose for a staged plan, the seated pose only for a unit with no plan at all
  (scenery, and units whose arrival has already finished), and the animated pose for a released
  plan.
- A battlefield reports its entrance lifecycle as `pending` or `active`, not as an
  active/inactive flag. `pending` is a battlefield that will play an entrance and has not been
  activated for it — the state in which it prepares and is revealed. It stages arrivals.
- Activation releases every staged plan at once, so the wave still begins on the committed scene
  with ADR-0045's `ARRIVAL_BASE_MS` beat.
- Admission to ADR-0351's visible-identity ledger no longer depends on activation, so a unit
  introduced during preparation is one arrival, not a re-arrival at commit.
- Staged plans drive no animation frames. Releasing them is a state change that schedules its
  own repaint.
- The board publishes `data-arrival-state` as `none | staged | entering`, because "staged before
  commit" is required and "entering before commit" is forbidden, and a single `data-arriving`
  flag cannot say which one it saw.

## Consequences

- Good: the first visible frame of a battlefield is terrain and scenery, and the army arrives
  into it — one event, in order.
- Good: activation keeps gating the motion, so ADR-0353's separation of preparation from
  activation is preserved rather than traded away.
- Good: the reveal no longer races the entrance. The ordering is the same on a cold first load
  and a warm repeat entry.
- Cost: a battlefield that is never activated would hold its units off the board. Nothing in the
  app leaves a mounted battlefield un-activated, and the lifecycle type makes the claim explicit
  rather than incidental.

## Verification

- `npm run verify:unit-arrival -- <campaign-or-run-url> --click <selector>` records the live
  entrance and fails on either symptom: a battlefield revealed with unstaged units, or a board
  region that resolves and then disagrees with its own settled composition.
- The same gate reproduces the defect on the pre-fix build (~800ms revealed-and-seated) and
  reports 0ms after, on both a campaign level and a Run battle.
- `npm run e2e:run-deployment` proves Deployment placement arrivals, promotion, and the
  automatic wave still follow ADR-0350/0351/0352 under staging.
- Unit tests pin the three poses of `arrivalOffset`: staged, unplanned, and released.
