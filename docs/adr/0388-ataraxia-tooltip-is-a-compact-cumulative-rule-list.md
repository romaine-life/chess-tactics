---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md)'s baseline literal-impact copy"
  - "[ADR-0370](0370-a-tooltip-defines-the-mechanics-it-names.md)'s no-opt-out rule for the Ataraxia title-bar tooltip"
refines:
  - 0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md
  - 0363-the-ataraxia-ladder-is-an-enchiridion-reference-section.md
  - 0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md
partially_superseded_by:
  - "[ADR-0389](0389-ataraxia-tooltip-names-the-ladder-once.md)'s heading and numeral size"
---

# ADR-0388: Ataraxia tooltip is a compact cumulative rule list

## Context

The tier-zero Ataraxia effect named every Run card property. ADR-0370 consequently
expanded the title-bar tooltip into the Ataraxia pane plus three mechanic-definition
panes, filling most of the viewport before the tooltip had to carry even one cumulative
Ataraxia condition.

Ataraxia is a stacking ladder (ADR-0268). As more tiers are installed, its title-bar
tooltip needs the vertical budget for the active conditions themselves, in the compact
scan of a cumulative difficulty list, rather than for reference definitions of every
mechanic those conditions happen to name.

## Decision

- The Run title-bar tooltip keeps the selected tier's full label and historical title as
  its heading.
- Its body lists every installed tier from zero through the selected tier, in ascending
  order. Each row reads its effect from `ATARAXIA_BY_TIER`; the tooltip authors no second
  copy of a tier's rule.
- Each row uses that tier's canonical carved numeral from `ataraxiaNumeralArtUrl`, shrunk
  to a 24px text-row seat. The typed numeral keeps the same seat when the live-media set
  is unavailable.
- Tier zero's canonical effect is **Standard rules.** This replaces the longer baseline
  explanation everywhere that reads the model, including preparation and the
  Enchiridion, so the tooltip does not need a presentation-only paraphrase.
- This cumulative Ataraxia list is the one closed exception to ADR-0370's automatic
  mechanic-definition panes. Its effects remain plain prose inside this tooltip; the
  Enchiridion remains the complete reference for the named mechanics.
- The trigger's accessible label names the selected tier and reads the same cumulative
  tier/effect sequence as the visible body.

## Consequences

- Ataraxia 0 is one short row: its `0` mark beside **Standard rules.**
- Installing another tier grows the tooltip by one predictable row without another UI
  edit, and every prior condition remains visible because the list follows the same
  `ATARAXIA_TIERS` order that applies the ladder.
- Ataraxia effects no longer summon separate glossary panes from the title bar. Players
  can use the Ataraxia or mechanic sections of the Enchiridion for the full reference.

## More Information

- [ADR-0268](0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md)
- [ADR-0363](0363-the-ataraxia-ladder-is-an-enchiridion-reference-section.md)
- [ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)
- [ADR-0370](0370-a-tooltip-defines-the-mechanics-it-names.md)
