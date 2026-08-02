---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)'s Plagued state name"
  - "[ADR-0267](0267-pestiferous-cards-lose-units-and-persist-when-empty.md)'s Plagued unit name"
  - "[ADR-0269](0269-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)'s Plagued unit name"
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)'s Plagued unit name"
  - "[ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)'s Plagued unit name"
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)'s Plagued player-facing terminology"
  - "[ADR-0312](0312-plagued-targets-use-a-live-icon-not-a-written-label.md)'s Plagued accessibility and explanatory terminology"
  - "[ADR-0317](0317-plagued-iconography-depicts-the-condition-not-a-chess-piece.md)'s Plagued icon-family name"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)'s Plagued Unit Ability name"
  - "[ADR-0338](0338-run-card-properties-and-unit-states-use-paired-icons.md)'s Pestiferous/Plagued pair name"
  - "[ADR-0339](0339-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)'s Plagued fitting label"
---

# ADR-0340: Cacochymic replaces Plagued as the Pestiferous unit-state name

## Context

**Plagued** communicates the mechanic but is ordinary, immediately familiar
language beside deliberately formal card vocabulary such as Pestiferous,
Concinnous, and Hieratic. The owner selected **Cacochymic**, an obsolete
humoral-medicine adjective for a body whose fluids—especially its blood—are
vitiated, as the more suitably obscure name for the afflicted unit state.

The owner has already saved the fitted poison icon. Its immutable media version
and the current Run document use identifiers coined under the old name; changing
those storage identities during visual fitting would orphan the exact saved
selection without completing the paired-icon production cutover.

## Decision

- **Cacochymic** is the canonical player-facing unit state bestowed by a
  **Pestiferous** card. UI labels, tooltips, accessible names, rules text,
  current contracts, and the fitting Studio no longer call that state Plagued.
- The existing icon pixels and owner-saved fitting remain selected. This is a
  vocabulary decision, not a request to regenerate or replace the poison icon.
- Current persisted field names, runtime enum values, and live-media source
  slots remain non-presentational storage identities until ADR-0338's deferred
  atomic paired-icon production cutover. That transaction must migrate them
  together with installed runtime configuration; no UI may expose the retired
  word in the interim.
- The adjective applies to the unit, while **Pestiferous** continues to name the
  causal card property. The canonical pair is therefore
  **Pestiferous / Cacochymic**.

## Consequences

The poison fitting survives unchanged while every player-facing surface uses
the owner's selected vocabulary. The deliberately opaque adjective is taught
through the same tooltip and Enchiridion mechanisms as the other paired icons.
