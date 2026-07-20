---
status: "accepted; top-surfaces-only exclusion partially superseded by ADR-0141"
date: 2026-07-14
deciders: Nelson, Codex
supersedes: "[ADR-0119](0119-predrawn-generation-is-tested-without-prior-candidates.md)"
partially_superseded_by: "[ADR-0141](0141-predrawn-generation-references-preserve-explicit-subterrain.md)"
---

# ADR-0120: The canonical top-only image owns pre-drawn appearance

## Context

ADR-0119 made the canonical grass-free top-only render the only image input but
still assigned finish and atmosphere to text. In practice, naming a biome or
describing its palette, lighting, materials, and surface variation introduces a
second appearance authority. It can override what the canonical export actually
shows and makes the supposedly isolated pipeline depend on agent-written art
interpretation.

## Decision

The canonical unit-free, ground-cover-free, top-surfaces-only render owns both
visible geometry and appearance for an isolated pre-drawn generation run. The
model derives environment, materials, palette, lighting, texture language,
boundary vocabulary, and finish from that image.

Text owns only deterministic semantics and transformation requirements: exact
topology, projection, coordinates, roads, blocking edges, footprints, playable
perimeter, output frame, overscan, continuity, and prohibited inventions. It
does not name a biome or prescribe an independent palette, lighting scheme,
material treatment, terrain-detail list, atmosphere, or visual style.

The generated request artifact is checked for this authority split before it is
shown for approval or sent to a model.

## Consequences

- The isolated pipeline tests whether the model can extrapolate the canonical
  art instead of following an agent's interpretation of it.
- A change to the top-only export can intentionally change appearance without a
  parallel prompt rewrite.
- Text can still demand a continuous full-frame result and prevent geometry
  errors without becoming an art reference.
