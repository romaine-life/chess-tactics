#!/usr/bin/env bash
# Render all 24 piece portraits (6 pieces x 4 palettes) into
# frontend/public/assets/units/<piece>/portrait/<palette>.png
#
# This is the driver that reproduces the portrait set. Run from anywhere:
#   BLENDER="/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" \
#     bash docs/art/unit-concepts/portraits/render_all.sh
#
# Framing: full figure with a small floor margin so the base is never sliced
# (the HUD anchors object-position:center bottom). Defaults Tz=0.49 span=1.24;
# the rook's wide keep base needs more floor room -> Tz=0.42 span=1.50.
#
# Body colours (linear RGB) for the "navy stone" body material per palette:
#   navy-blue is the canonical base (pieces_claude.py); crimson/golden/emerald
#   were recovered by per-channel calibration against the navy renders (the
#   original ad-hoc commands were never committed). golden swaps gold accents
#   to dark iron; the others keep the gold accents.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"           # repo root
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.1/blender.exe}"
RENDER="$HERE/portrait_render.py"
KNIGHT="$HERE/knight_portrait.py"
BU="$ROOT/docs/art/unit-concepts/blender-units"
OUT="$ROOT/frontend/public/assets/units"
YAW=30

# piece -> blend (the ornamented "production" pieces used in the shipped portraits:
# helmeted pawn, ornate mitre, badass keep, beaded tiara, gold crown -- NOT the
# plainer claude-pieces lathe set).
declare -A BLEND=(
  [pawn]="$ROOT/docs/art/archive/units/pawn/pawn_helmet.blend"
  [bishop]="$BU/bishop-mitre/bishop_mitre.blend"
  [rook]="$BU/rook-badass-keep/rook_badass_keep.blend"
  [queen]="$BU/queen-tiara/queen_tiara.blend"
  [king]="$BU/king-crown/king_crown.blend"
)
# palette -> "R G B ACCENT"
declare -A PAL=(
  [navy-blue]="0.045 0.10 0.16 keep"
  [crimson]="0.2925 0.0483 0.0509 keep"
  [golden]="0.566 0.392 0.088 iron"
  [emerald]="0.0332 0.1570 0.0808 keep"
)
# optional body metallic per palette (golden is a polished metal; others matte stone)
declare -A METAL=(
  [golden]="0.6 0.30"
)

render_piece() {  # piece palette
  local piece="$1" pal="$2"
  local tz=0.49 span=1.24
  if [ "$piece" = "rook" ]; then tz=0.42; span=1.50; fi
  PORTRAIT_TZ=$tz PORTRAIT_SPAN=$span "$BLENDER" -b --python "$RENDER" -- \
    "${BLEND[$piece]}" "$OUT/$piece/portrait/$pal.png" $pal ${PAL[$pal]} $YAW ${METAL[$pal]:-} >/dev/null 2>&1
}

for piece in pawn bishop rook queen king; do
  for pal in navy-blue crimson golden emerald; do
    echo "rendering $piece / $pal"
    render_piece "$piece" "$pal" &
  done
  wait
done

# Knight (procedural fur, self-contained palettes in knight_portrait.py)
for pal in navy-blue crimson golden emerald; do
  echo "rendering knight / $pal"
  "$BLENDER" -b --python "$KNIGHT" -- "$pal" "$OUT/knight/portrait/$pal.png" $YAW >/dev/null 2>&1 &
done
wait

echo "all portraits rendered -> $OUT/<piece>/portrait/<palette>.png"
