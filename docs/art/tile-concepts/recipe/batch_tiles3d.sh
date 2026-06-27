#!/bin/bash
BL="/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"
EX="$TEMP/tiles_ex"
U="D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/frontend/public/assets/tiles/textured"
S="$TEMP/tile3d.py"
r(){ # name mode base_rel pack_name seed
  "$BL" -b --python "$S" -- "$2" "$U/$1.png" "$EX/$3" "${4:--}" "${5:-0}" >/dev/null 2>&1 && echo "  $1 ok" || echo "  $1 FAIL"
}
echo "== grass =="
r grass-a grass "grass/textures/Tile_1_0.jpg" "grass" 1
r grass-b grass "grass/textures/Tile_2_0.jpg" "grass" 2
r grass-c grass "grass/textures/Tile_3_0.jpg" "grass" 3
r grass-d grass "grass/textures/Tile_1_1.jpg" "grass" 4
r grass-e grass "grass/textures/Tile_2_1.jpg" "grass" 5
r grass-f grass "grass/textures/Tile_3_1.jpg" "grass" 6
r grass-g grass "grass-02/textures/2023-11-27T110445Z.png" "grass-02" 7
echo "== dirt =="
r dirt-a ground "simple-grass-chunks/textures/ground_close_04_basecolor.jpeg" "simple-grass-chunks"
r dirt-b ground "simple-grass-chunks/textures/rostlinka_07_ground_albedo.jpeg" "simple-grass-chunks"
r dirt-c ground "simple-grass-chunks/textures/rostlinka_07c_diffuse.jpeg" "simple-grass-chunks"
r dirt-d ground "simple-grass-chunks/textures/rostlinka12_2k_difuse.jpeg" "simple-grass-chunks"
echo "== stone =="
r stone-a ground "grey-stone-tile-texture/textures/Grey_stone_tile_texture__photographed_in_g.jpeg" "grey-stone-tile-texture"
r stone-b ground "old-stone-tile-with-displacement/textures/TiledMat_Base_Color.png" "old-stone-tile-with-displacement"
r stone-c ground "overgrown-stone-tiles-tile-texture/textures/OvergrownStoneTiles_basecolor.jpg" "overgrown-stone-tiles-tile-texture"
echo "== pebble =="
r pebble-a pebble "tilable-pabbles-with-mossy-1-3d-model-free/textures/1781700678456_0.png" "tilable-pabbles-with-mossy-1-3d-model-free"
echo "== sand =="
r sand-a ground "sand-at-sunset-beach/textures/texture0.jpeg" "sand-at-sunset-beach"
echo "== water =="
r water-a water "forgotten-sanctuary-lake/textures/Image_0_2.jpeg" "forgotten-sanctuary-lake"
r water-b water "stream/textures/Hurst - Stream.jpeg" "stream"
echo "ALL_TILES3D_DONE"
