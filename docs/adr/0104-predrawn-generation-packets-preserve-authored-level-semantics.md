---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0104: Pre-drawn generation packets preserve authored level semantics

## Context

A whole-board painting can give a campaign level the continuity and environmental
richness that a collection of independent tiles does not. Image-only prompts,
however, repeatedly caused the generator to reinterpret the authored level: it
compressed an elongated board into a symmetric diamond, expanded one-tile
landmarks, invented elevation, guessed a new perimeter from scenery, and changed
road or barrier geometry.

The strongest exploratory result came from separating three kinds of authority.
An exact projected grid described where gameplay cells exist, a coordinate and
edge dump described what those cells mean, and art references described how the
scene should look. The generator retained discretion over the continuous
painting without receiving discretion over the level design.

## Decision

Every whole-level pre-drawn generation request uses one authored-level packet
with this authority order:

1. A unit-free projected grid and exact outer perimeter own spatial geometry.
2. A canonical semantic dump owns board dimensions, coordinate convention,
   projected axis directions, terrain roles, road connectivity, fixed
   footprints, blocking shared edges, exits, and perimeter edges.
3. The authored material/layout reference owns the intended visual identity of
   level content but cannot override the first two layers.
4. Accepted art and prior candidates are appearance references only. They never
   become geometry authority.

The prompt states that boundary location is fixed while boundary appearance is
creative. The model may choose one coherent in-world boundary treatment and may
paint a continuous environment beyond it, but it may not infer a smaller board,
move the perimeter to a texture transition, or use roads, walls, props, or
vegetation as replacement boundary evidence.

Cell contents and edge contents are distinct. A house or boulder declares an
exact cell footprint and gameplay role. A fence or wall declares a shared edge
and the crossing behavior of that edge; it does not implicitly consume either
neighboring cell. Roads are expressed as connectivity, not merely a list of
road-like textures. Border cells are reinforced by enumerating the actual outer
edges, including intentional road thresholds.

Numeric angles and dimensions reinforce the contract, but the exact visual grid
remains the spatial authority because an image generator is not a CAD solver.
The packet forbids baked units, labels, grid lines, invented roads or blockers,
expanded footprints, and unstated gameplay height. The requested output remains
one continuous full-scene painting rather than separately generated base and
doodad layers.

The required packet fields and prompt wording live in the mutable
[`predrawn-board-generation.md`](../art/predrawn-board-generation.md) recipe.
That file may evolve as owner feedback accumulates; this ADR freezes the
authority split, not a particular prose revision. Exact prompts are retained as
text provenance. Candidate and accepted image bytes remain live-storage-backed
under ADR-0085 and are not committed to Git.

Generation does not make a candidate production-ready. Candidate review still
uses the real game surface, live grid, and owner-picked registration governed by
ADR-0100 through ADR-0103. The canonical level remains gameplay-authoritative.

## Consequences

- Future passes can repeat and amend a known prompt structure without depending
  on chat history.
- The model receives freedom where it is useful—continuous material, scenery,
  atmosphere, and boundary treatment—without being asked to redesign the level.
- A complete packet can eventually be exported mechanically from canonical
  level data; until then, manually assembled packets must be checked against the
  serialized level before generation.
- Textual detail improves adherence but does not guarantee pixel-exact geometry;
  live-grid review remains mandatory and exposes residual drift honestly.
