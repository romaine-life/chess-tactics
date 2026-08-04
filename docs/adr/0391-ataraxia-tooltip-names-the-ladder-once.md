---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0390](0390-ataraxia-tooltip-is-a-compact-cumulative-rule-list.md)'s selected-tier heading and 24px numeral seat"
refines:
  - 0363-the-ataraxia-ladder-is-an-enchiridion-reference-section.md
  - 0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md
---

# ADR-0391: Ataraxia tooltip names the ladder once

## Context

ADR-0390 initially headed the tooltip with the selected tier's full identity and then
opened the cumulative list with that tier's numbered row. At tier zero this read as
**Ataraxia 0** over **0 Standard rules.** The first modifier mark was also large enough
to compete with the text instead of indexing it.

## Decision

- The tooltip heading is always **Ataraxia**. Historical tier titles do not appear in
  this compact title-bar summary; they remain in the Ataraxia Enchiridion reference.
- The cumulative rows alone carry the tier numerals, so the ladder name and selected
  numeral are each stated once.
- A row's carved numeral uses a 14px square seat with the typed fallback at the same
  measure. It is an inline index beside the modifier text, not a second title mark.
- The accessible label mirrors this anatomy: **Ataraxia**, followed by each active
  numeral and effect, without repeating the ladder name or historical title per row.

## Consequences

- Tier zero reads **Ataraxia** over a small `0` beside **Standard rules.**
- Later tiers add compact modifier rows without making the tooltip heading longer.

## More Information

- [ADR-0363](0363-the-ataraxia-ladder-is-an-enchiridion-reference-section.md)
- [ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)
- [ADR-0390](0390-ataraxia-tooltip-is-a-compact-cumulative-rule-list.md)
