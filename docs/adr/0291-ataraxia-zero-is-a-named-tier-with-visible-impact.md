---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md)'s No Ataraxia baseline identity"
  - "[ADR-0268](0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md)'s No Ataraxia baseline label"
  - "[ADR-0289](0289-run-preparation-is-control-first-and-ataraxia-uses-one-selector.md)'s rule that the baseline has no explanatory sentence"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)'s nonbaseline-only mechanic statement"
---

# ADR-0291: Ataraxia zero is a named tier with visible impact

## Context

The first Ataraxia selector called tier zero **No Ataraxia**, omitted a
subtitle, and hid its impact line. Higher tiers instead read as complete
entries: each has a numbered Ataraxia label, a flavor-bearing subtitle, and a
literal statement of its gameplay condition. The baseline consequently looked
like a placeholder rather than the first rung of the same ladder.

## Decision

- Tier zero is **Ataraxia 0 — The Untroubled Mind**.
- Its literal impact is **Standard Run rules. Shop cards are never
  Pestiferous.** This describes the actual tier-zero distinction without
  inventing an added modifier.
- Every installed Ataraxia tier presents the same anatomy: numbered label,
  subtitle, and visible impact statement. Tier zero does not receive a special
  rendering branch.
- Completing Ataraxia 0 unlocks Ataraxia I. The numeric persisted tier and all
  existing progression behavior remain unchanged.

## Consequences

- The starting choice reads as an intentional member of the ladder rather than
  the absence of a system.
- A player can compare the baseline and harder tiers using the same information
  structure.
- Existing Run documents remain compatible because only player-facing identity
  and presentation change; tier zero remains numeric value `0`.
