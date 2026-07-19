---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
refines: "[ADR-0071](0071-the-deliverable-is-the-instrument.md), [ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md), and [ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md)"
---

# ADR-0125: Pre-drawn preparation self-validates before generation

## Context

The board-driven pre-drawn preparation instrument derives its semantic packet
and top-only reference mechanically from the canonical saved level. Its checks
are objective: dimensions, coordinate coverage, graph and edge completeness,
cross-layer agreement, reference capture readiness, prompt authority, and
content hashes either pass or fail.

The first implementation nevertheless stopped after those checks at
`awaiting-owner-approval`. That made the owner inspect deterministic extraction
work that contains no taste decision and conflated mechanical validation with
the visual judgment required for a non-deterministic generated candidate. It
also worked against ADR-0071's division of labor: mechanics belong in the
instrument, while actual art judgment belongs with the owner.

## Decision

Pre-drawn preparation is a fail-closed, self-validating stage. It exports the
canonical level definition and canonical top-only reference, materializes the
exact prompt, packet, reference manifest, and request manifest, and performs all
deterministic validation before reporting success.

A successfully prepared request has status `ready-for-generation`. Preparation
does not require an owner approval checkpoint and may feed the generation stage
without one. The artifacts remain inspectable for audit and debugging, but
inspection is optional rather than a per-level gate. The preparation command
itself still does not call an image model.

Any change to the level revision, reference bytes, prompt, model, parameters, or
semantic packet creates and validates a new request. Missing, contradictory, or
unhashable input fails preparation; it must never be relabeled ready by a manual
override.

The first mandatory owner judgment begins only after an actual generated art
candidate exists. That candidate must be mounted in the game-owned review and
registration surface before it can be accepted or promoted. Mechanical
preparation success is not artistic acceptance.

## Consequences

- Adding a level does not burden the owner with checking dimensions, grids,
  exports, or prompt assembly that the canonical pipeline can prove itself.
- `ready-for-generation` has one narrow meaning: deterministic request
  preparation passed. It makes no claim about the quality or acceptability of a
  future image.
- Prompt, packet, reference, and hash artifacts remain available when a
  generated candidate exposes a pipeline defect.
- Owner time is reserved for the first stage that genuinely needs judgment: the
  generated candidate on the real game surface.
