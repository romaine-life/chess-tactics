---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)'s neutral initial state, direct figure selection, and stationary high-contrast mark"
partially_supersedes:
  - "[ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)'s separate Sell Units destination"
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s Alienatio destination, route, scene, workspace, filters, DOM/CSS family, and review-screen identity"
  - "[ADR-0432](0432-aliene-is-the-alienatio-action-verb.md)'s Alienatio destination, route, scene, workspace, filter, DOM/CSS family, and review-media identity"
  - "[ADR-0462](0462-transition-choreography-is-derived-from-scene-ownership.md)'s enumeration of Alienatio as a separate Sectio workspace"
refines:
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
  - "[ADR-0427](0427-run-unit-controls-are-keyboard-and-touch-operable.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0445](0445-card-companions-align-to-painted-frame-keylines.md)"
  - "[ADR-0446](0446-expunctio-tiles-use-shell-surface-and-oak-actions.md)"
---

# ADR-0482: Expunctio owns card-aware Alienatio

## Context

The standalone Alienatio workspace presented a second unit-by-unit ledger beside the
Prosopography. Although it made individual sale available, it did not make a unit's owning card
legible. A hover preview could expose that card, but would retain the redundant destination and
would not give keyboard and touch users an equivalent way to establish exact identity among
multiple visually identical units.

Expunctio already presents every held card as a complete canonical face and already explains the
different consequence of removing that card. It is therefore the surface where the relationship
between an individual unit, its owning card, and the card-removal price is directly useful.

## Decision

- Expunctio is the one Sectio workspace for both card removal and card-aware unit Alienatio. The
  separate Alienatio destination, route query, scene/workspace selection, filters, screen-art
  review identity, and DOM/CSS family are retired end to end. A historical `view=alienatio`
  address is no longer recognized and receives no compatibility redirect.
- Every current card tile offers a shared cycle control for the units still attached to that
  card. The selected unit is identified by its stable Run name and piece type, exposes its traits
  and exact Alienatio return, and offers the immediate **Aliene** command.
- The selected unit's matching occurrence is marked on the complete canonical card face. The
  selection is a presentation projection only: card order, persisted nullable seats, unit
  identity, and the Alienatio transaction remain model-owned.
- Cycling is the primary selection mechanism. It provides a deterministic identity when a card
  contains repeated piece types and gives pointer, keyboard, and touch users the same complete
  operation. Hover-only disclosure and bare sprite clicking are not alternate authorities.
- Prosopography remains the detailed unit ledger and profile surface. Its Sectio-only profile
  **Aliene** action remains available; it does not become another card gallery.
- **Alienatio** remains the domain operation noun, return calculation, model transition, reset
  behavior, and persistence boundary. **Aliene** remains its player-facing command. No Run-save
  or database migration is required because the transaction and stored vocabulary do not change.

## Consequences

- A player deciding between liquidating one unit and athetizing its card sees both choices in the
  same card-first context, including the effect of Alienatio on the later Expunctio fee.
- The Run no longer spends a title-bar destination on a unit list already supplied in richer form
  by the Prosopography.
- Deployment and Expunctio share one projection from persisted card seats to canonical face
  occurrences, so repeated and shuffled pieces cannot be highlighted or omitted inconsistently.
- Historical migrations and persisted Alienatio records remain intact; only the retired live UI
  path is deleted.

## More Information

- [Game concept](../game-concept.md)
- [Shared UI primitives](../shared-ui-primitives.md)
- [ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)
- [ADR-0442](0442-expunctio-is-a-card-first-gallery.md)
