---
status: "accepted"
date: 2026-07-03
deciders: Nelson, Claude
---

# ADR-0057: Every Studio tuning surface ships Reset-to-committed-baseline

Back-fills a standing decision into the ADR system (per
[ADR-0001](0001-use-adrs-for-decisions.md)'s migration rule): every dev/Studio
surface that lets you *tune* values must ship a **Reset** control that restores
the **committed baseline**, and it is wired as part of building the surface — not
after the owner asks for it (again).

## Context and Problem Statement

The owner repeatedly had to re-request a Reset affordance on tuning surfaces
(dressing rooms, calibration benches, the labs). Shipping a tuner without one
forces a reload — or worse, leaves no way back to the shipped look after
experimenting — and it kept landing in review as a same-shaped miss.

Two failure modes to name:
- **No reset at all** — the tuner can wander but not return.
- **"Reset" that zeroes out** — clearing fields to 0/empty is NOT a reset; it
  destroys the shipped values instead of restoring them.

## Decision Outcome

Chosen: **every Studio tuning surface ships a Reset-to-committed-baseline
control, wired before the surface ships.**

1. **Reset restores the committed baseline** — the values the surface *ships*
   with (the live/baked configuration), so an untouched-then-reset panel is
   pixel-/behaviour-identical to production. Zero-out ≠ reset.

2. **The baseline is derived, never hand-copied.** Reset reads from the same
   source of truth the surface renders from (the shipped constants / baked
   config), so it cannot drift from what actually ships. A hand-pasted "defaults"
   literal that duplicates the baseline is the anti-pattern — it silently rots.

3. **It is part of building the surface.** A tuner without Reset is incomplete,
   like a page with no way back. The builder wires it and verifies it; it is
   never deferred to a follow-up or surfaced to the owner as a request.

### Consequences

- Good: a tuning surface missing Reset (or shipping a destructive zero-out) is a
  named ADR violation caught in review; the owner stops re-asking.
- Cost: each surface must expose its baseline in a form Reset can read from —
  cheap when the baseline already lives in one constant, a small refactor when it
  was inlined.

## More Information

- Related: [ADR-0029](0029-catalog-category-requirements.md) (Studio catalog
  contract), [ADR-0054](0054-nine-slice-editor-is-the-devs-calibration-bench.md)
  (the dev calibrates in the tool; agents build the tool + its invariants),
  [ADR-0058](0058-every-route-is-click-reachable.md) (the sibling "reachability is
  the builder's job, not the owner's" rule for navigation). Worked examples: the
  Main-Menu tuner's "Reset to defaults", the Campaign-Editor dressing room's
  "Reset all", the Game Lab's config Reset.
