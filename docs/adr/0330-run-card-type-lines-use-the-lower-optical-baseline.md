---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0285](0285-run-card-type-lines-use-one-optically-centered-baseline.md)'s exact 0.65cqw vertical offset"
---

# ADR-0330: Run card type lines use the lower optical baseline

## Context

The accepted white frame exposed that the shared type line still sat visibly
high in its strip. This is a shared alignment issue, not a qualifier-specific
one.

## Decision

Every ordinary and qualified Run-card type line keeps the shared `5.3cqw` size
and `1.35cqw` horizontal offset, while the shared vertical offset becomes
`1.2cqw`. No type or frame receives a private positioning branch.

## Consequences

**Units** and all qualified type lines sit on one optically centered baseline.
