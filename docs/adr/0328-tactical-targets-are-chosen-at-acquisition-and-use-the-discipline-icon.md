---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0327](0327-tactical-cards-roll-one-in-eight-and-may-cost-twelve.md)'s offer-time target"
partially_superseded_by:
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)'s dedicated Discipline icon"
extends:
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)"
---

# ADR-0328: Tactical targets are chosen at acquisition and use the Discipline icon

## Context

The unit that receives Discipline is intentionally random at acquisition. A
multi-unit offer therefore cannot truthfully reveal a target before purchase.

## Decision

A Tactical offer persists its type and seed but no target index. Purchase makes
one seeded uniform choice among the newly created units, grants that unit
Discipline, and persists its exact unit id. A multi-unit offer shows no ability
marker. A one-unit offer shows the canonical forged-shield Discipline icon
because its outcome is forced. Compact card state uses the shared ability-icon
vocabulary instead of spelling out the ability or synthesizing rules prose.

## Consequences

The acquisition result is uncertain but reload-stable. Owned state, not a later
reroll, remains authoritative.
