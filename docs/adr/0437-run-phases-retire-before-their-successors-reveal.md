---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0441](0441-aftermath-uses-an-out-in-dissolve.md)"
  - "[ADR-0444](0444-aftermath-crossfades-directly-without-a-homepage-floor.md)"
  - "[ADR-0445](0445-transition-choreography-is-derived-from-scene-ownership.md)"
refines:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
  - "[ADR-0435](0435-a-won-run-battle-pauses-on-its-visible-board-before-rewards.md)"
---

# ADR-0437: Run phases retire before their successors reveal

## Context

Run phase transitions rendered the complete outgoing and incoming scenes together under a
crossfade. When **Rewards >** committed the persisted aftermath, the report and its Controls
content therefore began appearing while the won Battle was still on screen. These were two
different phases and two different Controls states, not one coherent transitional composition.

The outgoing Battle also received a newly assembled presentation object whenever the outer scene
rendered. Its setup effect treated that wrapper identity as a Battle change. Because the match was
terminal, it started a fresh skirmish during the fade, removing **Victory**, **Rewards >**, and the
terminal Controls state before the Battle scene had retired.

## Decision

- A full Run phase change prepares its successor invisibly while the complete outgoing phase
  remains the only visible scene. The outgoing scene fades as one unit; the successor reveals only
  when that same transition boundary completes and the director commits it.
- There is no frame in which two Run phases' Controls panels or workspaces are visible together.
  The incoming phase may paint and measure while hidden, but that preparation cannot contribute
  interactive or visible presentation.
- The retiring Run scene projects its committed snapshot. A Battle's setup depends only on stable
  Battle identity inputs—level, activity, seed, and whether Deployment owns the surface—not on the
  identity of a presentation wrapper or live Run-store document.
- Same-phase workspace changes continue using their narrower viewport crossfade. Their phase and
  Controls state are shared, so retaining the surrounding Run shell remains correct.
- Domain transitions still commit and persist immediately. This decision governs how the scene
  director presents that already-committed state, not when gameplay or accounting occurs.

## Consequences

- Clicking **Rewards >** leaves the exact won Battle—including Victory, its action, and current
  Controls state—intact through the outgoing fade. The aftermath then appears as one complete scene.
- Full Run phase transitions do not blend unrelated workspaces or Controls states. Workspace-only
  navigation keeps the established retained-shell behavior.
- No persistence format, migration, reward accounting, or Battle rule changes are required.
