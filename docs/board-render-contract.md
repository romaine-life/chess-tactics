# Board render contract (fixed-camera isometric sprites)

## Camera
The skirmish board is a **fixed isometric** view — the camera does **not** rotate, tilt,
or free-orbit (locked for the time being). This is the load-bearing decision: because the
viewing angle never changes, the board is a **2D sprite compositor**, not a runtime 3D
engine. Every tile, unit, rock, and portrait is a 3D model **pre-rendered in Blender to a
flat PNG** at the one true-isometric angle, then laid out isometrically in the DOM
(`frontend/src/render/iso.ts`, `BoardLabBoard.tsx`). Pre-rendered sprites are *optimal*
here, not a compromise — they capture full 3D (relief, self-shadow, protruding geometry)
from the only angle the player will ever see, at zero runtime cost.

If the camera ever needs to move, this contract is void and the board must become a
real-time 3D scene (and the units re-authored as meshes).

## The grid is logical, not a visual cage
A cell is a **gameplay address** (which square a piece occupies; what tessellates with
what). The **art anchored to that cell may spill out of it.** This is already true of
units — a king sprite towers far above its tile; a rook keep is a whole fortress. Tiles
get the same freedom: surfaces can be **bumpy** and **doodads can protrude** (grass tufts
standing up, loose pebbles, mossy stones). It is not rule-breaking; it is the standard
isometric-tilemap technique (Unity supports taller-than-cell tiles overlaying neighbors,
plus props/trees/elevated ground).

### The three real constraints
1. **Consistent contact footprint.** The *ground plane* where a tile meets its neighbors
   and where a unit stands is the same clean diamond on every tile (the 96×140 calibration
   — diamond ~96px wide, equator ~y27). Bumps and doodads live **above** that plane; they
   never move the contact edge. This keeps tiles tessellating and units seated.
2. **Back-to-front draw order** (painter's, by distance to camera) — already done for
   units; protrusions ride it so nearer things overlap farther things.
3. **Don't bury gameplay.** Doodads stay low/sparse enough not to hide a unit or make a
   cell ambiguous. Tall props (trees) would need per-object dynamic sorting — out of scope
   for now.

## Tiles, concretely
Tiles are 3D-rendered sprites (same pipeline as units), NOT flat textures painted on a
block. Use the packs' full content: **displacement/height maps** for real surface relief,
**normal maps** for micro-detail, and the **3D models / alpha grass cards** for protruding
doodads. Source packs ship all of these; rendering only the base-color flat was the bug
this contract corrects.

### Exposed faces and abrupt cuts

Per [ADR-0083](adr/0083-exposed-terrain-faces-own-independent-edge-treatments.md),
side topology is face-level. The fixed camera sees logical south and east: south
is exposed when `(x, y + 1)` is void, and east when `(x + 1, y)` is void. The
canonical 96x180 side frame stores south in columns `0..47` and east in columns
`48..95`; a compositor draws only the exposed half. A per-face override may
select a different material for a mural, story feature, transition treatment,
or explicit waterfall. An override never makes an interior face visible.

`packages/board-render/src/render/terrainSides.ts` is the shared topology,
material-fallback, and source-half authority. Gameplay, Studio/editor views,
client bakes, and server thumbnails must consume it rather than inventing local
exposure rules.

Abruptness comes from occupancy; treatment comes from live media. Ordinary Water
at a map cut uses generated native pixels for a thin meniscus over dark
substrate. A waterfall is an explicit connected feature, not the fallback for
every Water/void boundary.

The runtime's two-pixel top dilation is seam-repair geometry. It is clipped to
the union of occupied logical diamonds, including holes, and must never paint a
top-color apron outside the map. A visible lip or cap is authored side media,
not generic renderer padding.

## Composed terrain and macrotiles

The runtime board is one composed terrain canvas, but its source data remains layered:

1. Exposed 1x1 tile sides.
2. Exactly one terrain top for every playable cell: either its 1x1 top sprite or the clipped
   portion of a macrotile from `EditorBoard.macroTiles` that owns the cell.
3. Road and river feature overlays.
4. Optional grid, cover, doodads, props, units, and tactical overlays.

A macrotile never changes movement, collision, terrain family, or cell addressing. Its catalog
entry declares a rectangular footprint and one board-space PNG. A placement may also declare
row-major `breaks`: footprint cells where the ordinary 1x1 top is exposed and the macrotile image
is clipped away. Generate may place a macrotile only when every footprint cell belongs to the same
generated section and terrain family. Macrotiles may touch but cannot overlap, including across
their broken cells. Painting or erasing a 1x1 terrain cell adds that cell to the placement's break
mask instead of discarding the whole composite. Resizing still rejects placements that no longer
fit. The logical cells remain available to movement, selection, roads, cover, and objects whether
their tops come from the composite or the underlying 1x1 terrain.

Generated media owns the top-down material idea, not board geometry. Source and
candidate bytes are private live-media records. Deterministic projection code runs
in a temporary workspace, projects a candidate into the canonical 96×54 cell
plane, seals projection misses, and requires every pixel in the projected
footprint to be opaque before uploading the result to its semantic macrotile
slot. There is no alpha apron and no repository bake path.

Whole placements suppress every underlying 1×1 top; broken placements use the
same canonical cell diamonds as a clip mask so only the requested 1×1 tops
return. The editor, play route, read-only viewers, and server thumbnails consume
the same persisted placements, break masks, and live catalog revision. Water
joins only after macrotiles can animate in lockstep with its terrain family, so a
larger tile never turns a living water field into a frozen slab.

The typed terrain projection declares a matrix rather than a hand-maintained
static manifest. Grass, dirt, stone, pebble, and sand each provide curated motifs
at `2×2`, `2×3`, `3×3`, `4×3`, and `4×4`; catalog metadata expands that matrix
into stable semantic slots. Generate cycles through the footprint sizes that fit
a region and uses each motif before repeating it, so adding catalog depth
produces visible board variety instead of repeatedly selecting the largest tile.
Each Generate terrain row owns its own composite-coverage and breakup controls. Coverage sets the
target share of that generated section drawn from macrotiles; breakup is a seeded per-cell chance
to expose the socket-solved 1x1 terrain beneath each accepted placement. The Tile palette exposes
the same catalog by footprint for direct authoring, and direct 1x1 paint uses the same break-mask
path as generated breakup.
