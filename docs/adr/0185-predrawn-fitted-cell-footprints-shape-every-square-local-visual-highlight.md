---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
---

# ADR-0185: Pre-drawn fitted cell footprints shape every square-local visual highlight

## Context

ADR-0179 introduced a fitted quadrilateral for each playable cell on a
pre-drawn board because generated art may draw a visible cell edge differently
from the canonical isometric diamond. It deliberately applied that fitted shape
only to cyan legal-move paint.

That narrow rendering scope makes other cell-local highlights spill over the
same painted cliff, fence, or irregular edge that the owner already corrected.
The correction describes where visual paint belongs on this particular
background; it should not depend on which color or interaction state happens to
request that paint. At the same time, generated-art variations must never become
gameplay geometry or change what cell an interaction addresses.

## Decision

### One fitted shape governs every square-local visual highlight

On a schema-version-3 pre-drawn surface, the fitted quadrilateral for a playable
cell is the paint silhouette or clip for every visual treatment whose meaning is
"highlight this cell." Cyan move paint remains the calibration preview in the
fitting workspace, but it is representative of the shared cell-visual
footprint, not its exclusive runtime consumer.

Runtime square-local visual states include, whenever that state is rendered on
the cell plane:

- legal or candidate moves, attacks, threats or danger, and blocked or
  unavailable destinations;
- premoves;
- selected and focused cells;
- pointer, keyboard, drag, and drop hover or destination feedback; and
- promotion choices or targets.

Level Editor square-local visuals likewise use the fitted footprint, including
zone and tactical paint, cell-plane rings, region or area paint, hover feedback,
and placement or drop previews. A renderer may choose a fill, outline, ring,
texture, animation, or color for a state, but the portion authored as
cell-local paint follows the same fitted quadrilateral.

Visuals that are not cell-local paint do not acquire this clip merely because
they refer to a cell. Units, pieces, object outlines, path arrows, labels, and
other independently shaped presentation retain their own geometry.

### Canonical cells remain the sole logical geometry

The fitted footprint is never an interaction target or rules input. The
complete canonical cell remains authoritative for:

- pointer and keyboard hit targets;
- cell selection identity and move selection;
- legal movement, pathfinding, and route membership;
- occupancy, placement validity, and blocking;
- zone, region, objective, and promotion membership;
- board addressing and solver state; and
- canonical grid lines, fence or barrier hints, and other topology guides.

The renderer first resolves the canonical cell and logical state exactly as
before, then uses that cell's fitted footprint only to shape square-local paint.
No state may be added, removed, or redirected because a painted pixel lies
inside or outside the fitted quadrilateral.

### Existing persisted names remain the compatibility contract

This decision broadens rendering semantics without changing persisted data. The
existing `predrawn-move-highlight-profile-v1`,
`cell-diamond-10000-v1`, `moveHighlightProfile`, and
`move_highlight_profile_*` names remain valid compatibility vocabulary in Level
content, APIs, events, database columns, and hashes. The established sparse
canonicalization, digest, warp binding, attempt draft, embedded Level snapshot,
occlusion gate, and editor history remain unchanged.

No database or content migration is required. Existing schema-version-3 fitted
profiles immediately govern every square-local visual highlight. Historical
schema-version-2 surfaces continue to mean the complete canonical diamond for
every cell and therefore retain their prior appearance for every such
highlight.

This partially supersedes only ADR-0179's cyan-only rendering scope. ADR-0179's
profile topology, persistence, fitting instrument, installation, compatibility,
and logical-geometry decisions remain in force.

## Consequences

- One owner-authored correction consistently contains all cell-local paint
  against irregular generated artwork.
- Different interaction colors and editor tools no longer disagree about the
  visible shape of the same cell.
- Gameplay and authoring logic remain independent of generated-art
  irregularities.
- Compatibility names are less general than their expanded rendering role, but
  preserving them avoids a destructive or cosmetic-only migration.

## Verification

Contract-complete implementation proves that:

- runtime move, attack, threat, blocked, premove, selection, focus, hover, drop,
  and promotion cell paint uses the fitted quadrilateral;
- Level Editor zone, tactical, ring, region, hover, and placement-preview cell
  paint uses the same quadrilateral;
- fills, outlines, rings, and animated square-local treatments cannot paint
  outside the fitted footprint;
- hit testing, selection and movement decisions, pathfinding, occupancy,
  placement validity, zone membership, grid and fence hints, and solver results
  are byte-for-byte or behaviorally unchanged by a custom footprint;
- schema-version-3 content round-trips through the existing profile and field
  names with no migration; and
- schema-version-2 surfaces use full diamonds for every square-local visual
  highlight.
