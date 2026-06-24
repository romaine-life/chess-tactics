"""Crop hi-res masters to the final 512 HUD portraits using crops.json.

Usage: python _crop_finals.py <masters_dir> <out_units_dir> <crops.json>
Masters are named <piece>_<palette>.png; crop is a square at normalised
centre (cx, cy) with side s; result is resized to 512x512.
"""
import json, os, sys
from PIL import Image

MASTERS, OUT, CROPS = sys.argv[1], sys.argv[2], sys.argv[3]
PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"]
PALETTES = ["navy-blue", "crimson", "golden", "emerald"]
FINAL = 512

crops = json.load(open(CROPS))["crops"]
for piece in PIECES:
    c = crops[piece]
    cx, cy, s = c["cx"], c["cy"], c["s"]
    for pal in PALETTES:
        im = Image.open(os.path.join(MASTERS, f"{piece}_{pal}.png")).convert("RGBA")
        W, H = im.size
        side = s * W
        left = cx * W - side / 2
        top = cy * H - side / 2
        # keep the square inside the master
        left = max(0, min(left, W - side))
        top = max(0, min(top, H - side))
        box = (round(left), round(top), round(left + side), round(top + side))
        out = im.crop(box).resize((FINAL, FINAL), Image.LANCZOS)
        dst = os.path.join(OUT, piece, "portrait", f"{pal}.png")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        out.save(dst)
    print(f"baked {piece}")
