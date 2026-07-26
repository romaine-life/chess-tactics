---
status: "accepted"
date: 2026-07-20
deciders: Nelson, Codex
refines: "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md), [ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md), and [ADR-0125](0125-predrawn-preparation-self-validates-before-generation.md)"
---

# ADR-0156: Named pre-drawn candidate refinements are separate non-isolated branches

## Context

The isolated pre-drawn generation pipeline deliberately proves that the
canonical authored-surface image and semantic packet are sufficient inputs.
Owner review can nevertheless find one localized miss in an otherwise useful
candidate, such as visible coplanar tile boundaries or omitted source-authored
scenery. Regenerating the whole scene discards accepted composition and finish,
while passing a prior candidate back without explicit provenance can make that
candidate compete with canonical geometry and falsely look like isolated-pipeline
evidence.

The historical ADR-0119 mentioned a comparative experiment, but ADR-0120
superseded that record. A durable refinement instrument therefore needs a current
authority and lineage contract of its own.

## Decision

The default isolated generation path remains unchanged: canonical Image 1 owns
geometry and appearance, and the semantic packet owns exact authored meaning.

Only after owner review identifies a localized miss may the shared preflight
build a named comparative refinement. That request has this authority order:

1. Canonical Image 1 remains geometry and source-appearance authority.
2. The isolated parent's semantic packet is copied byte-for-byte and remains
   exact topology and gameplay authority.
3. The exact owner-reviewed prior candidate becomes subordinate Image 2 and the
   edit target. It supplies pixels to preserve but cannot override Image 1 or
   the packet.
4. Text names one allowlisted localized operation and may authorize changes only
   in that operation's narrow region. Exact prompt prose remains mutable under
   ADR-0109.

The preflight fails closed unless it verifies the complete isolated parent,
including its prompt, packet, one canonical reference, manifest, run identity,
viewport, dimensions, source role, and hashes. It also verifies Image 2's bytes
and compatible canvas, refuses parent overwrite, and writes a unique review
branch whose manifest records the parent lineage, operation, both image hashes,
and `isolatedPipelineEvidence: false`.

A comparative result never counts as evidence for the isolated pipeline and
never inherits the parent's review or acceptance. It remains a distinct
candidate and requires fresh owner review on the game-owned surface before any
promotion.

## Consequences

- Localized model failures can be repaired without asking the model to
  regenerate an already successful scene.
- Canonical geometry and semantics remain above the candidate being edited.
- Every candidate-assisted retry is auditable and cannot be confused with an
  isolated result.
- Adding a new refinement kind requires a bounded operation in the shared
  preflight and its validation tests; an ad hoc chat-only edit is not a durable
  pipeline path.
