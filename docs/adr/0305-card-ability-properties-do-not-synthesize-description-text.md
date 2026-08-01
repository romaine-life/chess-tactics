---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)'s automatic Tactical card-text requirement"
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)'s automatic lower-box ability explanation"
  - "[ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)'s automatic literal behavior prose"
extends:
  - 0270-run-card-ledgers-adapt-density-and-preserve-flavor.md
  - 0283-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0305: Card ability properties do not synthesize description text

## Context

The Run-card projection detected an affected card property and manufactured a
literal explanation sentence for the lower box. The Contents Box density study
also inserted a synthetic Disciplined sentence solely to imitate that behavior.
Both cases spent physical-card space repeating an ability that will be explained
through a future tooltip, reference, or other inspection system.

The problem is the automatic property-to-description mapping, not the shared
card face's ability to render deliberately authored content.

## Decision

Detecting a card type, unit ability, or modifier does **not** synthesize
description prose on the card face.

- `RunBundleCard` may inspect `cardType` to select the affected frame and type-line
  qualifier. That inspection does not add an explanatory `rules` string.
- Card Layout density specimens model ledger density without fabricated ability
  sentences.
- `RunCardFaceContent.rules` remains a generic optional content slot. This
  decision neither removes that capability nor decides whether a future
  independently authored non-ability card uses it.
- The future tooltip/reference/inspection system for ability definitions is
  deliberately deferred. This decision does not invent it.

Pestiferous, Tactical, Disciplined, and other mechanics retain their existing
gameplay semantics. Only the automatic description projection is removed.

## Consequences

- Ability-bearing cards no longer lose Contents Box space merely because the
  runtime detected an ability property.
- The shared face remains a composable renderer instead of encoding a blanket
  prohibition against future authored card content.
- Ability explanation still requires the later dedicated interaction system.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)
- [ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)
- [ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)
- [ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)
- [ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)
