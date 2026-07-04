# Stone bridge tile pipeline

Bakes the 8 straight-bridge sprites (`frontend/public/assets/tiles/feature/bridge-stone-*.png`) from
a real 3D kit mesh — the same "render a 3D model at the board's true-iso angle, then slice" idea as the
unit sprites, adapted so a multi-cell span **tiles seamlessly by construction** and is **measured
against a real game tile**.

## Why it's built this way

- **Render-continuous-then-slice.** We instance ONE flat deck panel N times along the run axis at
  exactly the cell pitch, so the copies abut into one continuous span, then slice a 96×180 window per
  cell. Because every panel is identical and placed at the exact pitch, the interior (`thru`) tile
  tiles against itself with zero seam-matching by hand. (An AI restyle can't do this — it warps the
  iso angle, which is what broke the earlier wooden attempt.)
- **Tile reference (measured, not eyeballed).** The render drops a magenta marker on the **z=0 game-
  tile plane** at each cell, plus a green full-tile grid sanity pass (`*-onTiles.png`). The bake
  calibrates scale from the marker step (→ the board step 48,−27.7) and **seats the deck by anchoring
  those tile-surface markers to the sprite's tile-equator** — so the deck comes out a measured tile
  width (currently exactly 1.00 tiles) at a measured height, instead of a hand-picked squash + anchor.
- **Per-axis.** H and V are separate renders (the sun is fixed in world space — a horizontal deck must
  be re-lit, not mirrored).

## Source

`source/tileable.obj` (+ `.mtl`, `bridges_d3.png`) — piece `b4`, a flat cobblestone deck panel with
baluster railings + corner posts, from the Sketchfab **tileable bridge pack**
(`bridges/tileable-bridge-pack.zip`, gitignored). It's legacy FBX 6.1 ASCII, which Blender can't
import, so `fbx61_to_obj.py` converts it to the OBJ committed here.

## Run

```sh
BLENDER=".../blender.exe"; OUT=tools/blender/bridge/out; mkdir -p "$OUT"
for ax in v h; do
  PIECE=5 CELLS=6 RES=2200 SQUASH=0.48 AXIS=$ax \
    "$BLENDER" --background --python tools/blender/bridge/render_stone_span.py -- \
    tools/blender/bridge/source/tileable.obj "$OUT" stone-$ax
done
python tools/blender/bridge/bake_stone_bridges.py "$OUT"   # installs bridge-stone-*.png + prints the measured deck width
```

Env knobs: `PIECE` (mesh index), `CELLS`, `RES`, `SQUASH` (run-axis re-proportion), `AXIS` (v|h) on the
render; `ANCHOR_Y` (seating nudge, default = tile equator), `MIDCELL` on the bake.

## Consumed by

`bridge-stone-<v|h>-<thru|capN/S|capE/W|single>.png` → `art/tileset.featureFrameSrc`. Runtime seating
(scale + offset) is tuned in the Studio **Bridge tuner** and stored in `frontend/src/core/bridgeTune.json`;
a per-cell paint-order bump (`core/bridgeTune.BRIDGE_CELL_Z_BUMP`) keeps the overhanging near-rail from
being chopped by the tiles in front. Today `thru`/`cap`/`single` share the panel art (a terminal just
ends the balustrade) — a distinct end-parapet is the main open follow-up.
