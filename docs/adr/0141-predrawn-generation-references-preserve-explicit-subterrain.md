---
status: "accepted; all-active-surface inclusion and capture-edge clause partially superseded by ADR-0142"
date: 2026-07-19
deciders: Nelson, Codex
partially_supersedes: "[ADR-0120](0120-canonical-top-only-image-owns-predrawn-appearance.md) top-surfaces-only exclusion"
refines: "[ADR-0105](0105-subterrain-is-an-opt-in-drawable-surface.md) and [ADR-0137](0137-subterrain-follows-the-visual-terrain-surface.md)"
partially_superseded_by: "[ADR-0142](0142-owner-authored-frame-defines-predrawn-generation-reference.md)"
---

# ADR-0141: Pre-drawn generation references preserve explicit Subterrain

## Context

ADR-0120 made a terrain-top-only render the sole visual authority for isolated
whole-level generation. That exclusion protected the projected grid from the
then-common decorative or tile-derived vertical skirt, which an image model could
reinterpret as an extra row, column, or gameplay-height tier.

ADR-0105 subsequently retired every derived and default terrain side. Subterrain
is now an independent opt-in drawable surface whose absence is authoritative.
ADR-0137 extended that explicit authoring right to exposed faces across the
complete playable-plus-scenic visual terrain surface. Blanket suppression in the
generation reference therefore removes owner-authored appearance together with
the retired generic skirts it was intended to exclude.

## Decision

The canonical pre-drawn generation reference contains terrain tops plus exactly
the explicitly persisted Subterrain placements that the shared terrain topology
resolves onto exposed south or east faces of the active visual terrain surface.

- A face without an explicit persisted placement remains empty. Tile identity,
  terrain family, adjacency, exposure, generation, and scenic fallback never
  synthesize a material, lip, cap, skirt, cliff, or attached side strip.
- An interior, unsupported, invalid, or inactive-surface placement does not render.
  Playable and scenic placements use the same shared exposure, occlusion, and
  painter-order rules.
- Visible Subterrain in the reference owns authored appearance and visible
  geometry only. It does not declare gameplay elevation, a height tier, a larger
  board envelope, or additional playable or semantic addresses.
- Generation prompts distinguish preserved explicit Subterrain from prohibited
  invention. They require the model to retain the authored exposed faces visible
  in the reference while forbidding every additional vertical skirt, cliff,
  attached strip, row, column, or implied gameplay height.
- Reference measurement, capture-edge validation, hashing, and preflight include
  the visible explicit Subterrain pixels. Changing those placements or their
  resolved visibility creates a new validated request under ADR-0125.

This partially supersedes ADR-0120 only where `top-surfaces-only` excluded
explicit Subterrain. ADR-0120's single-image appearance authority and its
ground-cover, unit, prior-candidate, and text-authority rules remain unchanged.

## Consequences

Owner-authored Subterrain now reaches the visual authority that generation is
required to extend. Unpainted faces remain honestly absent, and an authored side
cannot silently propagate into a generic board skirt or become gameplay height.
The reference and prompt stay mechanically derivable from canonical level data.
