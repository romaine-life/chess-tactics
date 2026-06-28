#!/usr/bin/env python
# Snap a PixelLab (or any) isometric tile to OUR canonical iso grid angle.
#
# Why: PixelLab generates isometric tiles at its own (and tile-to-tile inconsistent)
# diamond angle — measured ~32-34deg here — which fights our 30deg true-iso grid, so the
# top edges don't meet on the grid lines (visible seams). Blender-derived tiles already
# match; fresh-generated ones don't. This filter measures the tile's top-diamond edge angle
# and applies a vertical squash so the diamond lands on our grid, then seats the apex at the
# canonical y. The block gets a touch shorter; the TOP tessellates, which is the point.
#
#   python correct-iso-tile-angle.py --input raw.png --out tile.png
#     [--angle 29.2] [--apex-y 41] [--width 96] [--height 180]
#
# Measurement: apex = topmost opaque row; right vertex = topmost opaque pixel in the
# right-most column; edge angle = atan((rv - apex) / (rightcol - apex_x)).
import argparse, math
from PIL import Image
import numpy as np


def measure_top_edge(im):
    a = np.array(im.convert('RGBA'))[:, :, 3] > 40
    ys = np.where(a.any(axis=1))[0]
    top = int(ys.min())
    col = a.shape[1] - 2
    rv = int(np.where(a[:, col])[0].min())
    apex_x = float(np.where(a[top])[0].mean())
    run = col - apex_x
    drop = rv - top
    return top, apex_x, run, drop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--angle', type=float, default=29.2, help='target top-edge angle (deg) of OUR grid')
    ap.add_argument('--apex-y', type=int, default=41, help='canonical y of the diamond apex on the output canvas')
    ap.add_argument('--width', type=int, default=96)
    ap.add_argument('--height', type=int, default=180)
    a = ap.parse_args()

    im = Image.open(a.input).convert('RGBA')
    content = im.crop(im.getbbox())
    cw, ch = content.size
    # Normalize width to the canonical tile width first (no-op when already correct).
    if cw != a.width:
        ch = round(ch * a.width / cw)
        content = content.resize((a.width, ch), Image.NEAREST)
        cw = a.width

    top, apex_x, run, drop = measure_top_edge(content)
    target_drop = run * math.tan(math.radians(a.angle))
    k = target_drop / drop
    squashed = content.resize((cw, max(1, round(ch * k))), Image.NEAREST)

    canvas = Image.new('RGBA', (a.width, a.height), (0, 0, 0, 0))
    canvas.paste(squashed, ((a.width - cw) // 2, a.apex_y), squashed)
    canvas.save(a.out)

    # Re-measure for the log so the correction is auditable.
    _, ax2, run2, drop2 = measure_top_edge(canvas)
    print(f'{a.out}  k={k:.3f}  {math.degrees(math.atan(drop2 / run2)):.1f}deg (target {a.angle})')


main()
