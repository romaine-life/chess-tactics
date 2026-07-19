---
status: "superseded by ADR-0120"
date: 2026-07-14
deciders: Nelson, Codex
partially_supersedes: "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md)"
superseded_by: "[ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md)"
---

# ADR-0119: Pre-drawn generation is tested without prior candidates

## Context

ADR-0109 allowed accepted art and prior candidates as appearance-only references.
That creates a circular pipeline: a successful result depends on already having a
successful result, so a generation pass cannot demonstrate that canonical level
inputs are sufficient on their own. Even a reference denied geometry authority
can visually pull composition, perimeter, or unwanted artifacts into the result.

## Decision

The default pre-drawn generation test runs in isolation from prior generated
whole-level candidates. Its only image input is the canonical unit-free,
ground-cover-free, top-surfaces-only render of the target level. That image owns
the visible materials, projection, roads, barriers, props, and layout. The
serialized level packet owns exact semantics, and text owns the requested
full-scene finish and atmosphere.

Prior candidates, accepted whole-level plates, beauty renders, and unrelated
boards are not passed as style, material, composition, or atmosphere references.
An explicitly named comparative experiment may test an additional reference,
but it is not evidence that the isolated pipeline works and its result remains a
separate review branch.

## Consequences

- A successful pass demonstrates a reproducible canonical-input pipeline.
- Failed style or atmosphere is actionable prompt feedback rather than hidden
  dependence on a lucky earlier image.
- Geometry receives one coherent visual authority instead of competing images.
