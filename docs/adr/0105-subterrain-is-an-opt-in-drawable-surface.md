---
status: "accepted; playable-occupancy eligibility partially superseded by ADR-0137"
partially_superseded_by: "[ADR-0137](0137-subterrain-follows-the-visual-terrain-surface.md)"
date: 2026-07-18
deciders: Nelson, Codex
supersedes:
  - ADR-0087 material fallback
  - ADR-0039 tile-owned side layer
---

# ADR-0105: Subterrain is an opt-in drawable surface

## Context

Face-level composition separated south/east exposure, but the tile remained the default source of vertical pixels. Registries derived side paths from tile stems, generated boards assigned side-only murals as tile assets, and exact boards had no independent authored face channel.

## Decision

Subterrain is a first-class drawable system parallel to walls and fences.

- A tile owns only its horizontal walkable top, socket identity, and gameplay terrain.
- A board may explicitly place a Subterrain material on an exposed logical south or east face.
- Absence is the default. Terrain family, tile variant, adjacency, and generation never synthesize Subterrain.
- Occupancy determines face eligibility; it never selects material.
- Subterrain has its own editor layer, palette, paint, erase, persistence, hash, browser rendering, and server-thumbnail rendering.
- Repainting a tile does not mutate Subterrain. Invalid placements are removed at the persistence boundary.
- Runtime code consumes registered Subterrain sources directly and never derives them from a tile.
- The Subterrain palette and persisted IDs are projections of the database-owned drawable catalog. Git defines face behavior and geometry but contains no installed Subterrain roster, labels, defaults, or slot mapping.

## Migration

The implicit path is deleted. Existing boards receive no synthesized placements and open without Subterrain until an author opts in. Generated murals and story sides no longer run through the tile solver.

## Consequences

The same terrain top can have any Subterrain or none. Empty edges are honest rather than silently earth-filled.
