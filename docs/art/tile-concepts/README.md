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
