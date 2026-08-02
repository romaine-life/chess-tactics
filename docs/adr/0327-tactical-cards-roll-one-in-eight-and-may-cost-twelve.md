---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0326](0326-tactical-cards-grant-discipline-at-one-half-eligible-prevalence.md)"
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)'s single-digit limit for affected shop offers"
partially_superseded_by:
  - "[ADR-0328](0328-tactical-targets-are-chosen-at-acquisition-and-use-the-discipline-icon.md)'s acquisition-time target"
---

# ADR-0327: Tactical cards roll one in eight and may cost twelve

## Context

The intended rule is a simple property roll when a card is drawn, not a roll on
a price-filtered subset. Discipline retains its established three-gold value.

## Decision

Every shop-card draw has a seeded one-in-eight chance to become Tactical,
regardless of core value. Tactical resolves before Pestiferous so its probability
remains a literal 12.5% at every Ataraxia tier; one card still has at most one
qualifier. Discipline adds three gold, so Tactical prices may reach twelve.
Opening Shop cards remain standard. Card Layout exposes the denominator and a
twelve-gold specimen.

## Consequences

All 49 core identities are eligible. Three independent offers have about a 33%
chance to contain at least one Tactical card. Pestiferous prevalence is slightly
lower when Tactical takes precedence.
