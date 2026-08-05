---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0441](0441-aftermath-uses-an-out-in-dissolve.md)"
partially_supersedes:
  - "[ADR-0437](0437-run-phases-retire-before-their-successors-reveal.md)'s retire-before-reveal presentation"
refines:
  - "[ADR-0043](0043-ui-motion-system.md)"
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0435](0435-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
  - "[ADR-0438](0438-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0444: Aftermath crossfades directly without a homepage floor

## Context

The won-board/aftermath boundary used the sequential out-in dissolve adopted by ADR-0441.
The outgoing scene faded completely before the prepared incoming scene began fading in. At that
fully transparent midpoint, the application-wide homepage backdrop became visible even though
neither the source nor destination was a Main Menu scene. The result was two disconnected fades
with an unrelated menu scene between them, rather than a transition to the requested next scene.

The homepage backdrop was also mounted as a universal visual floor. That made a valid menu scene
resource function as an accidental fallback for every transparent or incomplete non-menu frame.
It obscured transition defects and spent rendering work on artwork that a Run did not own.

## Decision

- Entering or leaving `aftermath`, including its `battle-review` workspace, uses one direct
  crossfade between two complete scenes. Once the successor has acknowledged a drawable frame,
  the exact outgoing scene fades from 1 to 0 while the complete incoming scene fades from 0 to 1
  over the same `--ds-duration-fade` interval.
- There is no fully transparent midpoint and no fallback scene between those scene owners. Their
  complete viewport and Controls presentations may overlap during the dissolve; that overlap is
  the visual definition of a direct scene-to-scene crossfade.
- The outgoing scene remains its exact committed snapshot while the destination prepares hidden
  and inert. Preparing or entering the destination cannot mutate the outgoing board, Victory
  acknowledgement, action, units, or Controls.
- The persistent homepage backdrop is a Main Menu scene resource, not an application-wide floor.
  It is mounted and drawn only while the current scene or prepared destination declares the
  `homepage` background. A transition back to the Main Menu may therefore prepare the backdrop
  before entrance, while a Run-to-Run transition does not create or reveal it.
- Unmatched routes may still resolve to the explicit Main Menu route. That route resolution does
  not authorize rendering Main Menu artwork underneath known non-homepage scenes.
- The direct crossfade supersedes ADR-0441 and partially supersedes ADR-0437's sequential
  retire-before-reveal presentation. Their stable outgoing snapshot, hidden destination
  preparation, director ownership, and immediate domain-commit requirements remain in force.

## Consequences

- Rewards and Back transition directly between the visible won board and its aftermath report.
- No Main Menu frame can appear between two Run scenes, and the homepage artwork is not rendered
  merely in case another scene becomes transparent.
- Both complete Controls panels can be partially visible during the brief crossfade. They remain
  inert according to scene ownership, so visual continuity does not create parallel authority.
- Ordinary Run phase and full-scene transitions continue to use the same no-blank direct
  crossfade rather than a feature-specific timing branch.
