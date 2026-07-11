#!/usr/bin/env bash
# Bake the final HUD portraits from the Portrait Editor crops.
#
# 1. Render each unit full-body ("master") at high res, using the per-piece
#    framing in crops.json (matches the editor masters).
# 2. Crop each master by the editor crop (cx, cy, s) and resize to 512 -> the
#    shipped portrait at frontend/public/assets/units/<piece>/portrait/<pal>.png.
#
# Run:  BLENDER="/c/.../blender.exe" bash docs/art/unit-concepts/portraits/bake_finals.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.1/blender.exe}"
RENDER="$HERE/portrait_render.py"; KNIGHT="$HERE/knight_portrait.py"
BU="$ROOT/docs/art/unit-concepts/blender-units"
OUT="$ROOT/frontend/public/assets/units"
TMP="$HERE/_master_hires"; RES=1536; YAW=30
mkdir -p "$TMP"

declare -A BLEND=(
  [pawn]="$BU/pawn-helmet/pawn_helmet.blend"
  [bishop]="$BU/bishop-mitre/bishop_mitre.blend"
  [rook]="$BU/rook-claude/units/rook-ruinwall/model.blend"  # accepted ruinwall keep (NOT the retired badass-keep)
  [queen]="$BU/queen-tiara/queen_tiara.blend"
  [king]="$BU/king-crown/king_crown.blend"
)
pal_args(){ case $1 in
  navy-blue) echo "0.045 0.10 0.16 keep";;
  crimson)   echo "0.2925 0.0483 0.0509 keep";;
  golden)    echo "0.566 0.392 0.088 iron 0.6 0.30";;
  emerald)   echo "0.0332 0.1570 0.0808 keep";; esac; }
fram(){ case $1 in rook) echo "0.50 1.15";; *) echo "0.50 1.45";; esac; }  # rook=ruinwall (squat keep) needs a tighter span than the old tall tower

for piece in pawn bishop rook queen king; do
  read tz sp < <(fram "$piece")
  for pal in navy-blue crimson golden emerald; do
    PORTRAIT_TZ=$tz PORTRAIT_SPAN=$sp PORTRAIT_RES=$RES "$BLENDER" -b --python "$RENDER" -- \
      "${BLEND[$piece]}" "$TMP/${piece}_${pal}.png" $pal $(pal_args "$pal") $YAW >/dev/null 2>&1 &
  done
  wait
  echo "master rendered: $piece"
done
for pal in navy-blue crimson golden emerald; do
  PORTRAIT_TZ=0.50 PORTRAIT_SPAN=1.45 PORTRAIT_RES=$RES "$BLENDER" -b --python "$KNIGHT" -- \
    "$pal" "$TMP/knight_${pal}.png" $YAW >/dev/null 2>&1 &
done
wait; echo "master rendered: knight"

python "$HERE/_crop_finals.py" "$TMP" "$OUT" "$HERE/crops.json"
rm -rf "$TMP"
echo "baked finals -> $OUT/<piece>/portrait/<palette>.png"
