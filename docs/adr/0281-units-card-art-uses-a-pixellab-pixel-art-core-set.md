---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - 0085-runtime-assets-are-live-storage-backed.md
  - 0280-unit-card-art-uses-dedicated-database-prompt-plans.md
partially_supersedes:
  - 0280-unit-card-art-uses-dedicated-database-prompt-plans.md
---

# ADR-0281: Units-card art uses a PixelLab pixel-art core set

## Context

The first Units-card illustrations pursued painterly historical realism and a
per-card device for making every eye line unreadable. Owner review rejected the
entire pass, including Parish Militia: it did not read as indie-game art, its
historical activities often displaced the chess-unit identities, and the
repeated eye-concealment devices became conspicuous rather than mysterious.

A PixelLab exploration established a replacement direction. Its clustered
pixels, compact silhouettes, irregular print-like color, and wider variation in
staging feel authored for the game. The owner approved that direction and the
resulting batch, then authorized completion and direct runtime wiring.

## Decision

The 49 stable core **Units** compositions form one PixelLab illustration set.

- Every illustration is a native 400×280 opaque PNG generated with PixelLab
  PixFlux.
- The composition's human unit roles and readable equipment control the image.
  Historical anchors supply setting, weather, structures, work, and residue;
  they must not replace the granted units with generic lore-scene figures.
- Pawns read as equally ranked armed foot levies, Knights as mounted light
  cavalry, Bishops as field clerics or teachers, Rooks as heavy fortress
  wardens, and the Queen as a practical sovereign-administrator.
- Human faces and eyes may appear naturally. The v1 requirement to conceal,
  omit, shadow, cover, or turn away every eye is retired and must not be replaced
  with another global concealment rule.
- Literal chess pieces, card chrome, text, UI, magic, heroic-fantasy poster
  treatment, photorealism, and smooth digital painting remain excluded.

Each card owns a semantic live-media slot:
`ui/run/card-art/<canonical-card-id>/illustration.png`. Its candidate stores the
card composition, base chess value, historical anchor, PixelLab job id, unit
identity direction, scene direction, prompt, prompt SHA-256, and whether the
surviving tool input is exact or reconstructed. The first accepted exploration
images remain valid set members; their missing original tool text is disclosed
as reconstructed rather than falsely claimed as exact.

The complete 49-card set is one atomic acceptance group. The routable Studio
**Card Prompts** catalog mounts every candidate's exact native bytes and is the
game-owned review surface. Runtime draft, shop, Enchiridion, and card-layout
surfaces resolve those accepted semantic slots; there is no packaged image
fallback or second preview-only art path.

## Consequences

- All core cards gain illustrations together, so a run cannot mix accepted art
  with blank or rejected cards.
- Later replacement of any member requires a new complete-group review unless a
  future ADR deliberately changes the set's acceptance granularity.
- The v1 database records remain non-runtime provenance. They are not accepted
  pointers, style references, or fallbacks.
- Card names, ledgers, modifiers, and historical anti-story remain independent
  of the illustration bytes and can evolve without renaming generated variants.

## More Information

- [ADR-0280](0280-unit-card-art-uses-dedicated-database-prompt-plans.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [Lore and anti-story](../lore-anti-story.md)
