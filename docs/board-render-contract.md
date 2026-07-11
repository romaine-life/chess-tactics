# Board render contract (fixed-camera isometric sprites)

## Camera
The skirmish board is a **fixed isometric** view — the camera does **not** rotate, tilt,
or free-orbit (locked for the time being). This is the load-bearing decision: because the
viewing angle never changes, the board is a **2D raster compositor**, not a runtime 3D
engine. Terrain is composed by `frontend/src/render/BoardTerrainLayer.tsx` on a canvas;
objects and interaction layers use the shared board projection and painter order. All
registered art lands on the same integer-aligned isometric frame.

The raster sources are asset-type specific. Some units and props are Blender renders;
terrain tops use generated flat material projected into code-owned geometry; cliff sides,
murals, and story features use their own generated/source pipelines. The contract is the
fixed projection, native pixels, explicit source registry, and draw order — not one tool
for every kind of art.

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
   and where a unit stands is the same clean diamond on every tile: 96px wide by 54px high
   inside a 96x180 layer frame, with vertices `(48,41) (96,68) (48,95) (0,68)`.
   Bumps and doodads live **above** that plane; they
   never move the contact edge. This keeps tiles tessellating and units seated.
2. **Back-to-front draw order** (painter's, by distance to camera) — already done for
   units; protrusions ride it so nearer things overlap farther things.
3. **Don't bury gameplay.** Doodads stay low/sparse enough not to hide a unit or make a
   cell ambiguous. Tall props (trees) would need per-object dynamic sorting — out of scope
   for now.

## Terrain, concretely

Production 1x1 terrain is not one pre-rendered cube. Code owns the canonical diamond,
side masks, frame placement, and compositing geometry; generated art owns the visible
material, per ADR-0040. `frontend/scripts/build-surface-tiles.py` projects curated
top-down material into the top region and combines source art only in memory to preserve
the accepted seam. It writes independent top and side layers, never a flattened runtime
sprite. No runtime code paints replacement RGB, rescales pixel art fractionally, or
guesses a sibling layer from a filename.

### The stored asset is layered

Per [ADR-0075](adr/0075-tile-assets-are-explicit-layers.md), a production 1x1 terrain
record names its files directly:

- `topSrc`: the 96x180 walkable diamond layer;
- `sideSrc`: the 96x180 exposed cliff/body layer;
- optional `topAnimSrc`: a horizontal sheet of 96x180 top frames.

There is no committed top+side sprite, virtual basename, or runtime filename
substitution. Base tiles register top and side. Perimeter murals and story features are
side-only records. Browser boards and server thumbnails compose the same registered
layers, side first and top second, at the same integer frame origin.

Macrotiles are not combined 1x1 tiles: each is one intentionally larger TOP image whose
footprint covers several logical cells. Roads, rivers, fences, and walls remain independent
feature/object layers.

## Composed terrain and macrotiles

The runtime board is one composed terrain canvas, but its registered source data remains layered:

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

PixelLab owns the top-down material idea, not board geometry. Raw sources live in
`docs/art/pixellab-runs/macro-tiles/`; `frontend/scripts/build-macro-tiles.py` crops and
projects them into the canonical 96x54 cell plane. The bake seals projection misses and requires
every pixel in the projected footprint to be opaque, then gives each source a controlled palette
tie to its production terrain family. There is no alpha apron. Whole placements suppress every
underlying 1x1 top; broken placements use the same canonical cell diamonds as a clip mask so only
the requested 1x1 tops return. The editor, play route, read-only viewers, and server thumbnail plan
all consume the same persisted placements, break masks, and catalog. The static
macrotile catalog intentionally omits water: water joins only after macrotiles can animate in
lockstep with the terrain family, so a larger tile never turns a living water field into a frozen
slab.

The static catalog is a declared matrix, not a hand-maintained flat list. Grass, dirt, stone,
pebble, and sand each provide four curated material motifs at `2x2`, `2x3`, `3x3`, `4x3`, and
`4x4`; the runtime and bake expand that matrix into concrete asset IDs. Generate cycles through
the footprint sizes that fit a region and uses each motif before repeating it, so adding catalog
depth produces visible board variety instead of repeatedly selecting the largest available tile.
Each Generate terrain row owns its own composite-coverage and breakup controls. Coverage sets the
target share of that generated section drawn from macrotiles; breakup is a seeded per-cell chance
to expose the socket-solved 1x1 terrain beneath each accepted placement. The Tile palette exposes
the same catalog by footprint for direct authoring, and direct 1x1 paint uses the same break-mask
path as generated breakup.
