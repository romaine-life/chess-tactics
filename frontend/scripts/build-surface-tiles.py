#!/usr/bin/env python3
"""Build surface-tile candidates from explicitly fetched live-media inputs.

NOTE (ADR-0039): the board now renders tiles as LAYERED top/side. After this script,
`split-tiles.py` derives <fam>-<n>-top.png / -side.png from each combined tile here; the
board composes those halves, while this combined PNG stays the split source and the
catalog/inspector image. Re-run split-tiles.py whenever this output changes.

Pipeline per tile (see scripts/TILE_PIPELINE.md for the full flow incl. generation):
  1. take a curated flat top-down generated surface
  2. PROJECT it into the exact iso top-diamond        (square -> rhombus affine, NEAREST)
  3. COMPOSITE over the Blender-derived edge
  4. PALETTE-TIE the side faces to a darker tone of    (the approved seam treatment)
     that tile's own top so top + side read as one material

Inputs and outputs must live in a temporary workspace. Upload each exact output
with live-media-admin-client.mjs; this algorithm does not publish or promote.
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)

# Which raw pool index (tile_<i>.png) becomes production variant 0..7, per family.
# Curated by eye from the 16-variation pools (dropped near-black / empty / one-off
# surfaces). The user is the judge of this map — see TILE_PIPELINE.md.
CURATION_MAP = {
    'grass':  [0, 1, 2, 3, 5, 6, 8, 9],
    'dirt':   [0, 3, 5, 6, 10, 11, 12, 13],
    'stone':  [0, 1, 2, 3, 8, 9, 10, 11],
    'pebble': [0, 1, 2, 4, 5, 8, 9, 13],
    'sand':   [0, 1, 4, 6, 7, 8, 10, 13],
    'water':  [4, 5, 6, 7, 12, 13, 14, 15],
}

def diamond_mask():
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return np.array(m) > 0
DIA = diamond_mask()

def seal_projected_top(top):
    """Fill affine edge misses inside the diamond from neighbouring surface pixels.

    PIL's affine transform samples outside the square source on a few boundary pixels
    even though our authored diamond mask includes those pixels. If they remain
    transparent, the dark Blender edge bleeds through the playable surface after
    compositing. The top surface is meant to occupy the whole diamond, so copy colour
    from nearby projected pixels and keep the hard pixel-art alpha.
    """
    arr = np.array(top).copy()
    remaining = DIA & (arr[:, :, 3] == 0)
    if not remaining.any():
        return top

    for _ in range(W + H):
        if not remaining.any():
            break
        next_arr = arr.copy()
        next_remaining = remaining.copy()
        changed = False
        ys, xs = np.where(remaining)
        for y, x in zip(ys, xs):
            samples = []
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= H:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if dx == 0 and dy == 0:
                        continue
                    if nx < 0 or nx >= W:
                        continue
                    if DIA[ny, nx] and arr[ny, nx, 3] > 0:
                        samples.append(arr[ny, nx, :3])
            if samples:
                next_arr[y, x, :3] = np.rint(np.mean(samples, axis=0)).astype(np.uint8)
                next_arr[y, x, 3] = 255
                next_remaining[y, x] = False
                changed = True
        arr = next_arr
        remaining = next_remaining
        if not changed:
            break

    return Image.fromarray(arr, 'RGBA')

def project_into_diamond(surface):
    """square top-down surface -> our iso top-diamond (affine, NEAREST, masked)."""
    surface = surface.convert('RGBA'); S = surface.size[0]
    dst = np.array([APEX, RIGHT, LEFT], float); src = np.array([(0, 0), (S, 0), (0, S)], float)
    M = np.column_stack([dst, np.ones(3)])
    coeffs = (*np.linalg.solve(M, src[:, 0]), *np.linalg.solve(M, src[:, 1]))
    coeffs = (coeffs[0], coeffs[1], coeffs[2], coeffs[3], coeffs[4], coeffs[5])
    proj = surface.transform((W, H), Image.AFFINE, coeffs, resample=Image.NEAREST)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(proj, (0, 0), Image.fromarray((DIA * 255).astype(np.uint8)))
    return seal_projected_top(out)

def build_tile(edge, side, raw_path):
    proj = project_into_diamond(Image.open(raw_path))
    parr = np.array(proj); top = DIA & (parr[:, :, 3] > 20)
    top_rgb = parr[top][:, :3].mean(0); tint = top_rgb / max(top_rgb.max(), 1)
    tile = edge.copy(); tile.alpha_composite(proj)
    a = np.array(tile).astype(float)
    luma = a[side][:, :3] @ np.array([0.299, 0.587, 0.114])
    a[side, :3] = np.clip(luma[:, None] * tint[None, :] * 1.04, 0, 255)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', required=True, type=Path, help='Fetched raw pools arranged as <family>/tile_<index>.png')
    parser.add_argument('--edge-dir', required=True, type=Path, help='Fetched Blender-derived <family>-codexfilter.png edges')
    parser.add_argument('--out-dir', required=True, type=Path, help='Temporary candidate output directory')
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for fam, pool in CURATION_MAP.items():
        edge = Image.open(args.edge_dir / f'{fam}-codexfilter.png').convert('RGBA')
        side = (np.array(edge)[:, :, 3] > 20) & ~DIA
        for n, idx in enumerate(pool):
            build_tile(edge, side, args.raw_dir / fam / f'tile_{idx}.png').save(args.out_dir / f'{fam}-{n}.png')
            count += 1
    print(f'wrote {count} candidate tiles to {args.out_dir}; upload them through the live-media admin workflow')

if __name__ == '__main__':
    main()
