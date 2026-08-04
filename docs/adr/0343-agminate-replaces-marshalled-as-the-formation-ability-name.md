---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)'s Marshalled working name"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)'s Marshalled ability name"
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)'s Hieratic/Marshalled pair name"
  - "[ADR-0340](0340-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)'s Marshalled fitting label"
---

# ADR-0343: Agminate replaces Marshalled as the formation-ability name

## Context

**Marshalled** accurately described the role-aware automatic-deployment
behavior but was ordinary language beside deliberately obscure names such as
Hieratic, Concinnous, and Cacochymic. The owner selected **Agminate**, an
obsolete adjective for things gathered or clustered together, derived from the
Latin *agmen* for a moving body or army, as the more suitable formation-state
name.

The owner had already saved the Hieratic/state icon candidate choices and
shared fitting. Those immutable media versions live under a source slot coined
with the former name. Renaming that storage locator during fitting would make
the saved selection unavailable without completing the deferred paired-icon
production cutover.

## Decision

- **Agminate** is the canonical player-facing name for the role-aware unit
  ability formerly called Marshalled. Its King, Rook, and Bishop deployment
  behavior is unchanged.
- Lipsanon text, ability references, filters, tooltips, accessible names,
  Enchiridion content, and Card Icon Fitting use Agminate immediately.
- The existing icon candidates and owner-saved fitting remain selected. This
  vocabulary decision does not request regenerated pixels or a new fitting.
- The persisted runtime value `marshalled` and live-media source slot
  `ui/kit/icons/game/marshalled.png` remain non-presentational storage
  identities until ADR-0339's deferred atomic paired-icon production cutover.
  That transaction must migrate persisted values, installed configuration, and
  the media locator together; no player-facing surface may expose the retired
  word meanwhile.
- The canonical causal/state pair is **Hieratic / Agminate**.

## Consequences

The saved draft survives unchanged, the public vocabulary becomes suitably
formal, and the behavior continues to have one stable storage identity until a
coordinated production migration can retire it without orphaning documents or
media.
