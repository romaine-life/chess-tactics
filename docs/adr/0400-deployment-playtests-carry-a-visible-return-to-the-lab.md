---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)'s browser-Back-only return"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)"
---

# ADR-0400: Deployment playtests carry a visible return to the lab

## Context

ADR-0399 made Deployment Lab launch the actual Run flow, but relied on browser Back to return.
That leaves no explicit completion action in the product, does not tell the owner where Back goes,
and can lose the route relationship after a reload or direct handoff of the Run URL. The owner must
be able to finish testing either Deployment or the resulting Battle and deliberately return to the
same configured lab case.

The Run shell already owns a validated `returnTo` route and a typed title-bar return contribution.
Adding a second Deployment-only navigation surface would duplicate that shared playtest contract.

## Decision

- Starting **Player flow** carries the exact URL-addressed Deployment Lab configuration into the
  Run URL as its validated `returnTo` target.
- Run presents the existing typed title-bar return action throughout the real Deployment and Battle
  phases. For this target its visible label is **Back to Deployment Lab**, and its title identifies
  the configured lab case.
- The return target is route state, not transient component or browser-history state. Reloading or
  sharing the launched Run URL therefore retains the control and its destination.
- Activating the control uses ordinary app navigation and restores the same Studio viewer URL,
  including all deployment inputs encoded in its query and fragment.
- Browser Back remains available as normal browser behavior, but it is no longer the only product
  affordance for completing a Deployment Lab playtest.

## Consequences

- The owner can run a case through Deployment into live Battle and return without knowing or
  reconstructing the Studio address.
- Deployment and Battle do not own parallel Back implementations; both inherit one persistent Run
  shell contribution.
- A playtest URL is self-contained enough to preserve the test-loop destination across reloads.

## More Information

- [ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)
- [ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)
