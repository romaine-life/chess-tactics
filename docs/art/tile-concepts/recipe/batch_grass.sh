#!/bin/bash
BL="/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"
EX="$TEMP/tiles_ex"
U="D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/frontend/public/assets/tiles/textured"
S="D:/repos/chess-tactics/.claude/worktrees/fervent-bhaskara-15a39d/docs/art/tile-concepts/render_tile_3d.py"
SOIL="$EX/simple-grass-chunks/textures/ground_close_04_basecolor.jpeg"
r(){ "$BL" -b --python "$S" -- grass "$U/$1.png" "$EX/$2" "$3" "$4" "$SOIL" >/dev/null 2>&1 && echo "  $1 ok" || echo "  $1 FAIL"; }
r grass-a "grass/textures/Tile_1_0.jpg" grass 1
r grass-b "grass/textures/Tile_2_0.jpg" grass 2
r grass-c "grass/textures/Tile_3_0.jpg" grass 3
r grass-d "grass/textures/Tile_1_1.jpg" grass 4
r grass-e "grass/textures/Tile_2_1.jpg" grass 5
r grass-f "grass/textures/Tile_3_1.jpg" grass 6
r grass-g "grass-02/textures/2023-11-27T110445Z.png" grass-02 7
echo GRASS_DONE
