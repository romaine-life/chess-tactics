---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)'s in-place completed-formation presentation"
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s immediate Battle commit after the final required placement"
partially_supersedes:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s provisional formation recomputation during incomplete Discipline"
---

# ADR-0348: Discipline resolves before automatic deployment

## Context and Problem Statement

ADR-0346 made Discipline a direct battlefield choice but projected the complete
automatic friendly formation before that choice was finished. Every committed
Disciplined square then reran the deterministic formation around it. Ordinary
units consequently appeared to move when the player placed the first
Disciplined unit.

That presentation reverses the ability's causal order. Discipline exists to
place its named units before anything else is deployed; the ordinary formation
cannot already occupy visible squares while that earlier step is unresolved.

## Decision Drivers

- Discipline must visibly and mechanically precede ordinary deployment.
- One Disciplined placement must not move another committed Disciplined unit.
- Unresolved automatic placements are not battlefield state and should not be
  presented as though the player had already committed them.
- The final automatic formation remains deterministic and must continue to
  respect every committed exact placement.

## Decision Outcome

Chosen: **while any required Discipline placement remains unresolved, the
Deployment battlefield shows only committed Disciplined Run units.**

- At the start of Discipline, ordinary Run units and automatic
  deployment-created objects are absent from the battlefield.
- Committing one Disciplined unit adds that exact unit at that exact square.
  Other committed Disciplined units remain fixed.
- After the final Disciplined unit is committed, the deterministic automatic
  formation resolves around all committed squares and the remaining friendly
  units appear.
- Authored neutral battlefield obstacles remain visible. Opponents remain
  unresolved until Battle activation under ADR-0346.
- Deployment Controls report the count fixed during incomplete Discipline
  rather than counting hidden provisional placements as ready.

### Consequences

- Good: the battlefield now teaches Discipline's actual ordering.
- Good: the player's first exact placement no longer appears to shuffle units
  that should not have been placed yet.
- Good: multiple Disciplined units accumulate visibly without moving one
  another.
- Cost: the battlefield intentionally looks sparse until the last required
  Discipline placement is committed.

## More Information

- [ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)
- [Game concept](../game-concept.md)
