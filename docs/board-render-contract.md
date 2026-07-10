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

## Composed terrain and macrotiles

The runtime board is one composed terrain canvas, but its source data remains layered:

1. Exposed 1x1 tile sides.
2. Exactly one terrain top for every playable cell: either its 1x1 top sprite or an opaque
   macrotile from `EditorBoard.macroTiles` that owns the cell.
3. Road and river feature overlays.
4. Optional grid, cover, doodads, props, units, and tactical overlays.

A macrotile never changes movement, collision, terrain family, or cell addressing. Its catalog
entry declares a rectangular footprint and one board-space PNG. Generate may place it only when
every footprint cell belongs to the same generated section and terrain family. Macrotiles may
touch but cannot overlap. Painting or resizing the underlying board invalidates a placement that
no longer fits. The logical cells remain available to movement, selection, roads, cover, and
objects even though their individual top sprites are suppressed.

PixelLab owns the top-down material idea, not board geometry. Raw sources live in
`docs/art/pixellab-runs/macro-tiles/`; `frontend/scripts/build-macro-tiles.py` crops and
projects them into the canonical 96x54 cell plane. The bake seals projection misses and requires
every pixel in the projected footprint to be opaque, then gives each source a controlled palette
tie to its production terrain family. There is no alpha apron and no 1x1 top art underneath: the
macrotile is the terrain top for its whole footprint. The editor, play route, read-only viewers,
and server thumbnail plan all consume the same persisted placements and catalog. The static
macrotile catalog intentionally omits water: water joins only after macrotiles can animate in
lockstep with the terrain family, so a larger tile never turns a living water field into a frozen
slab.
