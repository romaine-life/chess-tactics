---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)"
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)"
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
  - "[ADR-0435](0435-expunctio-is-a-card-first-gallery.md)"
---

# ADR-0436: Athetize is the card action within Expunctio

## Context

**Expunctio** correctly names Sectio's third movement and its addressable workspace, but the
first player surface also used that noun as the imperative on every card. The interface therefore
gave the containing operation and the act performed on one record the same grammatical form.

The familiar English verb *expunge* makes the action immediately ordinary, while *expunct* remains
a transparent derivative of the same familiar word. Neither matches the deliberately unfamiliar,
learned register established by card-property vocabulary such as Pestiferous, Concinnous, Legatine,
Hieratic, and Praecipuus. That vocabulary is taught through context and reference copy rather than
being required to explain itself at first sight.

In textual criticism, *athetize* means to reject or mark a passage as spurious. It therefore gives
the card-level action its own transitive verb while retaining Expunctio for the broader act of
striking a record from the Chartulary.

## Decision

- **Expunctio** remains the canonical noun for the movement, workspace, route, fee, model
  transition, persisted transaction, and reset boundary.
- **Athetize** is the player-facing verb on an eligible card's action. After the transaction, that
  card's disabled action reads **Athetized this visit**.
- The workspace's literal introductory sentence continues to explain that the action strikes one
  card from the Chartulary and takes every attached unit. The unfamiliar verb is intentional and
  does not replace consequence-complete rules copy.
- Internal Expunctio and `expunctedCard` identifiers remain truthful operation and persistence
  vocabulary. No Run document or database migration follows from this presentation change.

## Consequences

- The containing screen and the card action no longer reuse one noun as both location and command.
- Athetize joins the game's learned vocabulary without depending on the familiar *expunge* family.
- Expunctio fees, navigation, reset behavior, and saved transaction state remain unchanged.

## More Information

- [Merriam-Webster: athetize](https://www.merriam-webster.com/dictionary/athetize)
