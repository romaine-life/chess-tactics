---
status: superseded
date: 2026-08-05
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0444](0444-aftermath-crossfades-directly-without-a-homepage-floor.md)"
partially_supersedes:
  - "[ADR-0437](0437-run-phases-retire-before-their-successors-reveal.md)'s all-Run-phase scope"
refines:
  - "[ADR-0043](0043-ui-motion-system.md)"
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0435](0435-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
  - "[ADR-0438](0438-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0441: Aftermath uses an out-in dissolve

## Context

The first implementation of ADR-0437 applied one retire-then-reveal mode to every Run phase
replacement. Its outgoing phase faded normally, but its incoming phase used `step-end`: the
successor remained invisible and then appeared as a cut. Applying a sequential fade to that same
global mode corrected the cut, but introduced a fully transparent midpoint into ordinary
Sectio-to-Deployment transitions. That violated the established no-blank-frame transition gate
and changed unrelated Run choreography.

The reported presentation defect is narrower. The won Battle and its aftermath report are two
deliberately separate review surfaces whose Controls and actions must not appear or mutate in
parallel. That boundary includes Back to the exact won board and Rewards back to the same report.

## Decision

- A transition which enters or leaves `aftermath`, including its `battle-review` workspace, uses
  one complete out-in dissolve. The exact outgoing scene fades from 1 to 0 over
  `--ds-duration-fade`; only after that leg finishes does the complete prepared successor fade
  from 0 to 1 over the same tokenized duration.
- The scene director owns both legs as one measured transition. The incoming delay is one
  `--ds-duration-fade`, so duration plus delay is 700ms with the current 350ms fade token.
- There is no visible overlap between the won-board and report presentations. The outgoing
  Victory action and Controls remain an exact snapshot through their fade; the incoming scene is
  painted but inert and invisible until its own leg begins.
- The fully transparent crossover is an intentional fade-through point for this review boundary,
  not a loading or incomplete scene. It does not generalize to ordinary navigation.
- Other Run phase changes retain the scene director's atomic crossfade and its no-blank-frame
  contract. The broad all-Run-phase scope of ADR-0437 is therefore partially superseded.
- The lightweight Victory acknowledgement itself uses the shared 350ms opacity-only entrance.
  It has no translate component or raw timing, and it remains active when the operating system's
  movement-reduction preference disables CSS keyframe animations.

## Consequences

- Rewards no longer cuts to the report or exposes its Controls while the Battle is still visible.
- Back and the returning Rewards action use the same reversible visual grammar.
- Deployment and other ordinary Run transitions keep their existing continuous crossfade and
  transition-gate coverage.
- The complete Rewards handoff lasts two fade legs; changing the one shared fade token retimes
  both without feature-local milliseconds.
