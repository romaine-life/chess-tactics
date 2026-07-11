# Tile Ruleset

This document is the durable contract for board terrain assets. It defines what a tile is, how tiles connect, and how generated boards report gaps.

## Core Terms

| Term | Rule |
| --- | --- |
| Family | A terrain material group such as Grass, Stone, or Water. Families are the top-level socket identity for board generation. |
| Base tile | A tile whose north, east, south, and west edges all socket to the same family. Base tiles fill same-family regions. |
| Transition tile | A pair-aware tile whose four edges include two families. Transition tiles are the only legal way for one family to meet another family. |
| Edge socket | The family declared for one tile edge. Edge order is always north, east, south, west. |
| Legal board generation | A board placement process that only places tiles whose edge sockets match their placed neighbors. |
| Missing art | A legal socket slot that has no production asset yet. Missing art is a coverage gap, not an illegal board rule. |

## Geometry Contract

All terrain tiles must use the canonical board footprint:

- Top diamond width: `96px`
- Top diamond height: `55.426px`
- Side height: `86px`
- Grid step X: `48px`
- Grid step Y: `27px`
- Edge angle: `30deg`

Source of truth:

- `packages/board-render/src/art/tileTemplate.ts`
- `packages/board-render/src/art/projectionContract.ts`
- `frontend/scripts/build-surface-tiles.py`

## Asset Layer Contract

Production 1x1 terrain follows [ADR-0075](adr/0075-tile-assets-are-explicit-layers.md).

- A base tile has an explicit `topSrc` and `sideSrc` at the native 96x180 frame.
- Animated water may add an explicit `topAnimSrc`; animation never changes the side.
- A perimeter/mural/story asset may be side-only and must not declare a fake top path.
- A base top and side occupy disjoint hard-alpha pixels and are composed at the same
  origin. Side-only perimeter/mural/story art may use the approved translucent rubble
  shadow, but no side asset may paint into the top-owned region.
- Combined top+side PNGs, virtual path stems, suffix-derived paths, and combined fallbacks
  are not production representations.
- Stable gameplay tile IDs are independent of image paths and remain the values persisted
  by levels and maps.

## Base Tiles

Base tiles are family-local.

- A Grass base tile has `N=Grass`, `E=Grass`, `S=Grass`, `W=Grass`.
- A Stone base tile has `N=Stone`, `E=Stone`, `S=Stone`, `W=Stone`.
- A Water base tile has `N=Water`, `E=Water`, `S=Water`, `W=Water`.
- A base tile must never directly socket to another family.
- Visual variants are allowed, but they must keep the same footprint and socket identity.

## Transition Tiles

Transition tiles are pair-local.

- Supported pair examples: Grass-Stone, Grass-Water, Stone-Water.
- A transition tile declares one terrain pair and one four-edge socket mask.
- Mask order is `N E S W`.
- Mixed masks `0001` through `1110` are transition slots.
- Pure masks `0000` and `1111` are not transition slots; they belong to base terrain.
- Each pair has `14` valid transition slots.

For a Grass-Stone transition, the mask records which edges use the secondary family for that pair. The UI must show the resolved edge sockets, not only the mask.

## Placement and transition-aware generation

Level Editor placement is intentionally permissive: this socket model does not reject a
user's click. Save-time validation may report illegal joins later. Transition-aware
generation is a separate future consumer of the same socket data.

The target generation rules are:

Generated boards must be socket-aware.

- A placed tile's north edge must match the south edge of the tile above it.
- A placed tile's west edge must match the east edge of the tile to its left.
- The same rule applies for east and south neighbors when those neighbors exist.
- Once accepted transition art exists, mixed-family generation must use it at family
  boundaries. The current no-transition catalog renders a hard boundary instead of
  inventing art.
- If no produced tile exists for a legal socket requirement, the board may show a missing-art placeholder.
- The board should report missing-art counts separately from illegal socket counts.

Board generation is healthy when missing tiles mean "we need art for this legal slot," not "the algorithm placed an impossible edge."

## Coverage Checklist

Use this checklist when adding or reviewing a terrain family or pair.

- [ ] Every base family has at least one accepted base tile.
- [ ] Base tile variants preserve the canonical footprint.
- [ ] Base tile variants socket only to their own family.
- [ ] Every supported transition pair lists all `14` mixed socket masks.
- [ ] Each transition slot has either accepted art or an explicit missing-art placeholder.
- [ ] Generated boards report missing art separately from illegal sockets.
- [ ] Mixed boards only place legal socket matches.

## Implementation Pointers

- Socket contract: `frontend/src/core/tileSockets.ts`
- Board generation: `frontend/src/core/tileBoardGenerator.ts`
- Coverage diagnostics: `frontend/src/core/tileCoverage.ts`
- Studio surface: `frontend/src/ui/TilePreview.tsx`
