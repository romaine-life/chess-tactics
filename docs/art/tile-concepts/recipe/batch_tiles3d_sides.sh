#!/bin/bash
# Re-render only the terrains whose vertical sides should NOT carry the surface identity.
# Per-terrain geology: grass/pebble sit on SOIL; water sits in a ROCK basin.
# dirt/stone/sand already render side=base (their body IS their identity) -> untouched.
BL="/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"
EX="$TEMP/tiles_ex"
U="D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/frontend/public/assets/tiles/textured"
S="D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/docs/art/tile-concepts/render_tile_3d.py"
SOIL="$EX/simple-grass-chunks/textures/ground_close_04_basecolor.jpeg"
ROCK="$EX/grey-stone-tile-texture/textures/Grey_stone_tile_texture__photographed_in_g.jpeg"
r(){ # name mode base_rel pack_name seed sidebase
  "$BL" -b --python "$S" -- "$2" "$U/$1.png" "$EX/$3" "${4:--}" "${5:-0}" "${6:--}" >/dev/null 2>&1 && echo "  $1 ok" || echo "  $1 FAIL"
}
echo "== grass (soil sides) =="
r grass-a grass "grass/textures/Tile_1_0.jpg" "grass" 1 "$SOIL"
r grass-b grass "grass/textures/Tile_2_0.jpg" "grass" 2 "$SOIL"
r grass-c grass "grass/textures/Tile_3_0.jpg" "grass" 3 "$SOIL"
r grass-d grass "grass/textures/Tile_1_1.jpg" "grass" 4 "$SOIL"
r grass-e grass "grass/textures/Tile_2_1.jpg" "grass" 5 "$SOIL"
r grass-f grass "grass/textures/Tile_3_1.jpg" "grass" 6 "$SOIL"
r grass-g grass "grass-02/textures/2023-11-27T110445Z.png" "grass-02" 7 "$SOIL"
echo "== pebble (soil sides) =="
r pebble-a pebble "tilable-pabbles-with-mossy-1-3d-model-free/textures/1781700678456_0.png" "tilable-pabbles-with-mossy-1-3d-model-free" 0 "$SOIL"
echo "== water (rock basin sides) =="
r water-a water "forgotten-sanctuary-lake/textures/Image_0_2.jpeg" "forgotten-sanctuary-lake" 0 "$ROCK"
r water-b water "stream/textures/Hurst - Stream.jpeg" "stream" 0 "$ROCK"
echo "SIDES_DONE"
