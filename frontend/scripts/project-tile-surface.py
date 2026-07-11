#!/usr/bin/env python3
"""Project a flat top-down square material into an explicit TOP layer.

This standalone curation helper writes only the canonical 96x180 top diamond. Side
layers are authored and built independently; this tool never reads or emits a combined
tile.

Top-diamond vertices in our 96x180 tile space:
    apex (48,41)  right (96,68)  front-tip (48,95)  left (0,68)

A square -> rhombus map is AFFINE, so 3 corner correspondences fix it. We solve
the dest->source affine and let PIL sample with NEAREST (pixel-art safe).
"""
import argparse
import numpy as np
from PIL import Image, ImageDraw

APEX = (48, 41); RIGHT = (96, 68); FRONT = (48, 95); LEFT = (0, 68)
CANVAS = (96, 180)


def solve_inverse_affine(S):
    """Return PIL AFFINE coeffs (a,b,c,d,e,f) mapping OUTPUT(dest)->INPUT(source).
    Source square corners TL(0,0) TR(S,0) BL(0,S) map to apex/right/left."""
    # dest points and matching source points
    dst = np.array([APEX, RIGHT, LEFT], dtype=float)      # (x,y)
    src = np.array([(0, 0), (S, 0), (0, S)], dtype=float)  # (x,y)
    # Solve source = A*dest + t  (what PIL AFFINE wants: input from output coords)
    # Build [dx dy 1] -> sx and -> sy
    M = np.column_stack([dst, np.ones(3)])  # 3x3
    a, b, c = np.linalg.solve(M, src[:, 0])
    d, e, f = np.linalg.solve(M, src[:, 1])
    return (a, b, c, d, e, f)


def diamond_mask():
    m = Image.new('L', CANVAS, 0)
    ImageDraw.Draw(m).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return m


def project(surface):
    surface = surface.convert('RGBA')
    S = surface.size[0]
    coeffs = solve_inverse_affine(S)
    proj = surface.transform(CANVAS, Image.AFFINE, coeffs, resample=Image.NEAREST)
    # clip to the diamond (kill anything bleeding outside the rhombus)
    m = diamond_mask()
    out = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    out.paste(proj, (0, 0), m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('surface')
    ap.add_argument('out_top')
    args = ap.parse_args()

    surface = Image.open(args.surface).convert('RGBA')
    top = project(surface)
    top.save(args.out_top)
    print('wrote top layer', args.out_top, 'src', args.surface, surface.size)


if __name__ == '__main__':
    main()
