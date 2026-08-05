---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md) seed-interaction clause"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
---

# ADR-0468: Placement generators randomize unless fixed seed is enabled

## Context

Saved Forest and Town instances persisted a seed and exposed it as an ordinary Placement setting.
Generate reused that value, so asking for another arrangement required the author to change the seed
and then press Generate. That made an implementation detail a mandatory part of the normal creative
loop. Other generation instruments already establish the expected direction: Generate chooses fresh
randomness, while deterministic replay is a deliberate inspection or reproduction mode.

## Decision

- Forest and Town Generate choose and persist a fresh seed on every press by default. The chosen seed
  must differ from the instance's immediately previous seed even if the random sample collides.
- A shared **Fixed seed** toggle is the sole opt-in to deterministic replay. Its numeric seed and
  randomize-seed controls remain hidden while the toggle is off.
- With Fixed seed enabled, Generate reuses the visible value exactly. Turning it off resumes a fresh
  seed on the next Generate action.
- The seed stored on a saved instance is the seed that produced its latest generated output. Changing
  the automatic seed and replacing owned Scene Art happen in the same committed board edit.
- Newly created instances and previously authored instances without the optional fixed-seed flag use
  automatic mode. The optional flag therefore needs neither a Level-format edge nor a database
  migration.
- Recipe presets, area selection, density and placement settings, and the explicit Generate boundary
  are unchanged.

## Consequences

- Generate and Regenerate are the normal variation controls; authors no longer manage a seed to see
  another result.
- Exact reproduction remains available, visible, persisted, and auditable when deliberately enabled.
- Forest and Town cannot drift into different seed interaction models because they use the same seed
  resolver and control surface.

## More Information

- [Studio control architecture](../studio-control-architecture.md#saved-placement-generators)
- [ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)
