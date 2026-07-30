---
status: superseded by ADR-0225
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0219: Run piece bundles are portrait cards with a live gold icon

## Context

The first Run shop represented a piece bundle as a framed prose label, a second
line spelling out its price in gold, and a separate Buy button. The boxes were
technically usable but did not read as game cards or make the chess contents
recognizable at a glance. The owner also rejected spelling out “gold” where a
dedicated resource icon and live number can communicate the same state.

## Decision

- Opening hands and shop piece bundles use one shared visual bundle card.
  The complete registered inner-chrome card is the hit target.
- A card composes the canonical installed player-palette unit portraits. It
  shows one portrait for each distinct piece type and a live `×N` badge when
  that type repeats. Bundle prose remains in the accessible action name rather
  than becoming the primary visual presentation.
- A shop card places one live gold amount in its footer: the installed gold
  resource icon followed by the live numeric price. Purchased and disabled
  states remain native control state on the same card.
- Compact Run currency readouts use the icon plus a live number. Explanatory
  sentences and relic rules may still name gold where prose is necessary.
- The selected gold art is PixelLab option 2, a native transparent 64×64 coin
  stack. It is accepted through the typed `run-resource-icon` live-media
  projection at `ui/run/resources/gold.png`.
- One active `kind='run-resource'` drawable record with
  `behavior.resourceId='gold'` binds its `icon` role to that accepted slot.
  Runtime code queries that record and shows an explicit unavailable-art state
  if it is absent; there is no generated, textual, or packaged fallback.
- Candidate review may pin an exact live-media hash in the Run URL. That browser
  state is review-only and never becomes an installed pointer or a Git-owned
  candidate hash.

## Consequences

- Bundle identity is recognized through chess art before it is read as text.
- Any unique bundle multiset remains compact because duplicate pieces collapse
  to quantity badges.
- Currency values stay dynamic and accessible while the visual surface avoids
  repetitive “gold” labels.
- The card frame, unit portraits, and resource icon retain their existing
  database and shared-primitive ownership.
