---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s automatic Chartulary-to-Controls deal, bottom-right card pile, and Deploy all/Step through mode boundary"
refines:
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
  - "[ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md)"
partially_superseded_by:
  - "[ADR-0434](0434-full-deploy-is-one-placement-wave-and-one-discard.md)'s one-wave Full deploy boundary"
  - "[ADR-0435](0435-deployment-transport-may-own-deal-and-attention-is-serial.md)'s pre-Deal transport availability"
---

# ADR-0422: Deployment deals a visible deck before transport begins

## Context

ADR-0419 made card order the source of Deployment order, but its presentation began with only the
combat cards and moved them automatically from the Chartulary into a small Controls pile. The
player therefore could not see that Deployment was partitioning one held deck into the cards this
combat would use and the cards being put away. A fast entrance also made a three-card deal read as
one stack teleport rather than three deliberate draws.

The old Deploy all and Step through pair also mixed two different concerns. It used a one-time
mode choice to stand in for ordinary transport controls, then required extra controls to advance
individual units. Deployment is an ordered persisted process and needs pause, play, one-step, and
finish semantics that all operate on that same process.

## Decision

- A newly prepared Deployment persists an **awaiting deal** boundary. The empty battlefield mounts
  with the complete held deck face down in the middle of its workspace and one **Deal** action
  beneath it. No card identity or future unit is revealed by this presentation.
- Deal partitions that already-persisted deck order. Each combat card travels separately and at a
  deliberate cadence into a counted pile at the upper-left of Controls, making a small deal read as
  one, two, three. The undealt remainder travels into the measured Chartulary destination as one
  counted face-down stack; it does not spend time animating every irrelevant card individually.
- The deal is one scene-owned transaction. Deployment controls remain present at their final
  geometry but unavailable until both branches settle. Reload resumes from the last persisted
  information boundary and never rerolls the deck or exposes a face.
- The deal action includes a device-local **Deal automatically** setting. Enabling it is a durable
  preference for this browser across Runs; Settings > Gameplay owns the same setting and can turn
  it off. The Deployment checkbox and Settings read and write one shared application-settings
  owner rather than independent storage conventions.
- After the deal, the Controls card pile is the most prominent control object and remains at the
  upper-left. Its transport sits directly beneath it. Abandon Run is anchored at the bottom.
- Deployment has one persisted transport state: **paused**, **playing**, or **full deploy**. Pause
  lets the current atomic reveal, placement arrival, or discard settle and prevents the next one;
  Play repeatedly advances the same ordinary one-unit sequence; Next advances exactly one stable
  step and remains paused; Full deploy resolves everything remaining at the fastest supported pace.
- Any Adlected placement or later required decision stops automatic transport and leaves the exact
  unit and legal input visible. Resolving the decision does not silently resume a previously active
  transport; the player chooses how to continue.
- Card reveal, stable left-to-right unit-seat order, information locks, placement resolution,
  settlement, discard, and battlefield promotion remain the one sequence established by ADR-0419.
  Transport controls change pace, never order or outcome.
- A Deployment button is not rendered while the primary Deployment workspace is already visible.
  If an inspection workspace needs a return, that workspace alone contributes a contextual
  **Return to Deployment** action.
- RunSaveVersion advances losslessly. A predecessor already in Deployment returns to the nearest
  honest paused boundary without changing its committed deal, reveal, placements, or discard
  progress. Account-backed Runs receive the same append-only database migration as browser saves.

## Consequences

- The deck is visibly the object being divided for combat before its cards become the objects that
  drive placement.
- A player can learn the flow through ordinary transport controls without committing to a special
  expert mode, while Full deploy remains the fast path and still cannot skip required input.
- Presentation timing projects persisted workflow state; neither a late button mount nor a local
  timer is allowed to invent a Deployment boundary.
- The shared Gameplay preference is reusable by every Deployment entry without making Run saves
  device-dependent.

## More Information

- [ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)
- [ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md)
- [Shared UI primitive registry](../shared-ui-primitives.md)
