#!/usr/bin/env python3
"""Build the PRODUCTION surface-swap tiles: composite the projected PixelLab top
onto the Blender-derived codexfilter edge, then PALETTE-TIE the side faces to a
darker tone of that tile's own top (so top and side read as one material — the
approved seam treatment). Writes public/assets/tiles/surface/<fam>-<n>.png.

Inputs (all in-repo):
  edge: public/assets/tiles/pixel/<fam>-codexfilter.png   (perfect iso geometry)
  top : public/assets/tiles/surface-lab/<fam>-proj-<n>.png (flat PixelLab surface
        already projected into the top diamond by project-tile-surface.py)

Reproducible: re-run to regenerate the whole production set from committed sources.
"""
import os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.normpath(os.path.join(HERE, '..', 'public', 'assets', 'tiles'))
OUT = os.path.join(TILES, 'surface')
W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
FAMILIES = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water']
N = 8

def diamond_mask():
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return np.array(m) > 0
dia = diamond_mask()

count = 0
for fam in FAMILIES:
    edge = Image.open(f'{TILES}/pixel/{fam}-codexfilter.png').convert('RGBA')
    side = (np.array(edge)[:, :, 3] > 20) & ~dia
    for n in range(N):
        proj = Image.open(f'{TILES}/surface-lab/{fam}-proj-{n}.png').convert('RGBA')
        parr = np.array(proj)
        topmask = dia & (parr[:, :, 3] > 20)
        if topmask.sum() == 0:
            continue
        top_rgb = parr[topmask][:, :3].mean(0)
        tint = top_rgb / max(top_rgb.max(), 1)

        tile = edge.copy(); tile.alpha_composite(proj)
        a = np.array(tile).astype(float)
        luma = a[side][:, :3] @ np.array([0.299, 0.587, 0.114])
        a[side, :3] = np.clip(luma[:, None] * tint[None, :] * 1.04, 0, 255)
        Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').save(f'{OUT}/{fam}-{n}.png')
        count += 1
print(f'wrote {count} production tiles to {OUT}')
