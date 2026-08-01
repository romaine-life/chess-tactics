---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
extends:
  - 0136-loading-is-manifest-driven-and-frame-acknowledged.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0314: Run card presentations promote atomically

## Context

Selecting card records changes the card's title, cost, type line, ledger, flavor,
frame, and illustration in one React update, but browser image loading completes
later. Moving through Enchiridion records quickly can therefore show a new card's
text over the previous card's illustration. The same shared face also serves the
opening draft, shop, review, and Card Layout surfaces, so a host-local delay would
leave the underlying renderer defect intact.

## Decision

- `RunCardFace` treats card content, frame, illustration, and unit sprites as one
  presentation generation.
- The first presentation participates in its owning surface's existing reveal
  boundary. For an in-place change, the last complete card remains visible while
  the requested card is mounted as an inert, hidden layer.
- The requested layer must settle its actual DOM image consumers. Frame and
  illustration images decode successfully before acknowledgement; unit sprites
  acknowledge through their existing measured image consumers. After those
  acknowledgements and two browser paint opportunities, the complete requested
  layer replaces the previous one in one React commit.
- A newer request cancels an older pending generation. Late load, error, or paint
  acknowledgement from a superseded card can never promote it.
- Image failure settles the requested generation and continues through the
  existing explicit image-error callback rather than retaining an unrelated old
  card as a silent fallback.

## Consequences

- Card art can no longer lag behind the title, price, type, contents, or flavor
  while a player moves through records.
- Warm-cache changes remain effectively immediate; cold changes retain a complete
  previous card instead of exposing a mixed card.
- Atomic behavior belongs to the canonical shared face and therefore applies to
  every runtime and reference host without copied loading logic.
