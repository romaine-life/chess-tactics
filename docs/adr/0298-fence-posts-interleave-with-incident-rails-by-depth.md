---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[Board render contract](../board-render-contract.md)"
---

# ADR-0298: Fence posts interleave with incident rails by depth

## Context

The shared board renderer gave every fence post a positive half-depth bias over its nearest
incident rail. That made each post paint in front of every connected rail, including the far
endpoint—such as the north-east/right endpoint of an E rail—where the fixed isometric projection
requires the rail to cross in front of the post. The result looked like a post pasted over a
continuous fence rather than a rail joined through real posts.

## Decision

- A fence post uses the canonical vertex contact depth halfway between the farther and nearer
  incident rail-owner bands.
- For either canonical rail direction, the far endpoint post paints first, then the rail, then the
  near endpoint post.
- A junction uses the same vertex rule. Incident rails in farther owner bands paint behind the
  post, and incident rails in nearer owner bands paint in front of it.
- The shared `fencePostZIndex` function owns this relationship. Gameplay, the Level Editor,
  Studio and candidate review, previews, thumbnails, and pre-drawn occlusion geometry must not
  introduce consumer-specific post ordering.

## Consequences

- Continuous rails visibly pass the far post instead of being cut off by an unconditional cap.
- Near posts still cover the rail endpoint that is physically in front of them.
- Mixed-direction junctions gain one coherent painter order without splitting or masking the
  generated rail and post sprites.
- Historical fence-art run records remain immutable provenance; their former positive-bias note
  no longer defines runtime behavior.

## More Information

- [Board render contract](../board-render-contract.md)
- [Shared scene depth policy](../../packages/board-render/src/render/sceneDepth.ts)
