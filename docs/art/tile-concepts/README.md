# Textured terrain tiles

Board tiles rendered in Blender from real PBR texture packs, mapped onto an iso block
(textured top + darkened side) calibrated to the 96x140 board grid.

- `render_tile.py` — `blender -b --python render_tile.py -- <basecolor> <out> 1.02 0.79 -0.40`
  (the trailing numbers are ortho_scale / block z-scale / camera target-z, tuned so the
  diamond is 96px wide with the silhouette matching the board grid).
- Tiles live at `frontend/public/assets/units/../tiles/textured/<terrain>-<variant>.png`.
- Six terrains (grass, dirt, stone, pebble, sand, water) with variants; **hard edges** —
  no transition tiles, the socket solver falls back to each cell's family base at seams.

Source texture packs are license-pending (downloaded); raw zips not committed.

## 3D rebuild (render_tile_3d.py)
Tiles are now full 3D-feel sprites in a **96×180** frame (≈42px headroom above the contact
diamond for protrusion). Run: `blender -b --python render_tile_3d.py -- <mode> <out> <basecolor> [packdir] [seed]`
- **ground** — PBR (normal/AO/roughness auto-wired from packdir) + displacement relief (height map if present, else procedural noise). For dirt/stone/sand.
- **grass** — grassy base + scattered standing 3D grass blades (seeded per variant).
  **Superseded for the shipped tiles (2026-06-27):** those baked blades were "fake
  doodads" — a unit couldn't nest in flat painted grass and real doodads double-stacked.
  grass a–g are now rendered in **ground** mode (clean grass top + the `ground_close_04`
  soil body, no blade scatter); vegetation moves to placeable doodads (see
  [ADR-0015](../../adr/0015-doodads-frame-units-not-bury-them.md)). Recipe:
  `ground <out> <grass3 Tile_N_0.jpg> <grass3/textures> 0 <simple-grass-chunks/ground_close_04_basecolor.jpg>`;
  a/d/g=Tile_1, b/e=Tile_2, c/f=Tile_3.
- **pebble** — the pack's 3D pebble mesh on the block.
  **Superseded (2026-06-27):** same fix — pebble-a is now **ground** mode with the pebble
  pack's surface texture flat on top (`1781700678456_0.png`) + the `ground_close_04` soil body.
- **water** — glossy low-roughness reflective surface + ripple normals.

Calibration (96×180): ortho_scale 1.31, block z-scale 0.79, camera target-z −0.18 → diamond
96px wide, contact equator at y69. Board CSS anchors the equator (`translate(-48px,-69px)`,
height 180) so tiles tessellate and units seat exactly as the old flat tiles did.
