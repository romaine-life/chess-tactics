---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0256](0256-individual-relics-are-routable-from-the-main-menu-enchiridion.md)"
  - "[ADR-0198](0198-run-relic-icons-are-installed-live-art-and-persistently-visible.md)"
  - "[ADR-0060](0060-playing-never-requires-sign-in.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0261: Relic addresses unfurl with their installed icon and effect

## Context

ADR-0256 made each relic reference shareable at
`/enchiridion/relics/<relic-id>`, but the server-side social metadata path still
treated those addresses as generic Chess Tactics pages. Discord, Slack, and
other link-preview crawlers therefore showed the branded default card instead
of identifying the linked relic.

Relic identity and effect wording lived in the Run model, while backend Run
validation retained a second handwritten id list. Adding another backend-only
description table for unfurls would create a third authority and allow shared
links to drift from the game.

## Decision

- An exact known `/enchiridion/relics/<relic-id>` address receives server-side
  Open Graph and Twitter metadata without JavaScript or authentication.
- The card title is the relic name and the card description is its complete
  current effect wording.
- The card image is the exact immutable `icon` media bound by the one active
  `kind='run-relic'` drawable whose `behavior.relicId` matches the address. It is
  declared as its native 64×64 PNG and uses the compact square Twitter card.
- Missing, ambiguous, non-PNG, or non-native targeted artwork never substitutes
  the generic brand image. The existing resilient SPA fallback may still serve
  the application shell without injected metadata.
- Unknown relic ids retain ADR-0256's generic/default-selection behavior; the
  address does not pretend to identify a relic that is not in the registry.
- The DOM-free relic registry is shared by browser Run code, backend Run
  validation, route resolution, and unfurl metadata. No parallel backend id or
  description registry is allowed.

## Consequences

- Pasting a valid relic link shows the relic's approved pixels, name, and full
  effect before the recipient opens the game.
- Crawlers use the same public live-media read contract as anonymous players.
- Relic additions or wording changes have one canonical registry and cannot
  silently omit backend validation or social metadata.
