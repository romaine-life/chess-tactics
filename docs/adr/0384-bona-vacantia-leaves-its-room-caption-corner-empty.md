---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - ADR-0366
  - ADR-0368
  - ADR-0383
---

# ADR-0384: Bona Vacantia leaves its room-caption corner empty

## Context

The Bona Vacantia scene repeated its location in the workspace's upper-left corner
with a heading and the sentence “Nobody is here to hand these over. Take one.” The
persistent title bar already names the route as `Run › Bona Vacantia`, while the
workspace copy covered authored room art and treated prose as a substitute for a
future visual expression of the room.

## Decision

The Bona Vacantia mat scene has no visible workspace heading, instruction, caption,
or placeholder in the room's upper-left corner. The persistent title bar is the sole
textual location label. The scene retains an accessible landmark name that describes
its actionable contents without painting another room label.

The empty corner is an intentional composition, not a missing-copy fallback. A future
artistic depiction of the room belongs in the authored scene-art system and requires
a separate accepted decision; feature code must not fill the space with explanatory
prose in the meantime.

## Consequences

- The mat and its three interactive lipsana remain the only visible decision content.
- Tests reject restoration of the retired heading, sentence, or caption class.
- The title bar continues to orient the player without duplicating the location over
  the scene artwork.
