---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)"
---

# ADR-0420: The Fivefold Gambit Codex is the default Run card back

## Context

ADR-0419 established one universal live-media card back and deliberately left its promotion as a
separate owner decision. Card Layout mounted two interpretations of each of three base concepts,
then a second king-bearing factor set. The owner selected **The Fivefold Gambit** and specifically
its Codex rendering.

The selected image is the exact 1060×1484 review candidate with SHA-256
`fa0cc826b10e5b7ea87eddc63494f7bea2a6bcc424d4500e76f603d1edfd3938`. Its five occult powers
surround a chessboard contest, making the arcane structure answer to the game's play language.

## Decision

- Promote those exact reviewed Codex pixels byte-for-byte to
  `ui/run/card-back/standard.png`; no crop, resize, spatial resampling, redraw, or packaged fallback
  participates in acceptance.
- The stable runtime slot is the current universal default consumed by the shared `RunCardBack`
  object. Card faces, card types, and deployment scenes do not choose their own local backs.
- The PixelLab Fivefold Gambit and every other study candidate remain non-runtime review history.
  They are neither compatibility fallbacks nor alternate active pointers.
- This decision establishes the default back, not permanent player-level uniqueness. A future
  player-selectable card-back system may let players choose among separately accepted backs without
  changing the exact pixels or provenance accepted here.
- Prompt provenance remains in `docs/art/run-card-back-prompts-v2.json`; media bytes and the active
  pointer remain live-storage-backed under ADR-0085.

## Consequences

- Face-down deployment cards now have an accepted runtime identity rather than an unavailable
  review-only placeholder.
- Runtime rendering stays behind one semantic slot, so later customization can change selection
  authority without duplicating card-back presentation code.
- Replacing the default requires another reviewed candidate and live-media pointer promotion; Git
  history alone cannot change the artwork.

## More Information

- [ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [Run card-back prompt provenance](../art/run-card-back-prompts-v2.json)
