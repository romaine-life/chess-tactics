#!/usr/bin/env python3
"""Build the five frayed SIDE masks used by the rich-edge generators.

The input is an explicit production side layer (never a combined tile). The output is a
build source under ``docs/art/tile-concepts/edge-masks`` rather than a public runtime
asset: numbered rich/mural side layers are what the board actually draws.

Native 96x180, grafted 1:1. The top diamond remains alpha-zero throughout.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SURF = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'surface'
EDGE_MASKS = ROOT / 'docs' / 'art' / 'tile-concepts' / 'edge-masks'
W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
FAMILIES = ('grass', 'dirt', 'stone', 'pebble', 'sand')
SEED = {'grass': 7, 'dirt': 11, 'stone': 13, 'pebble': 17, 'sand': 19}


def diamond_mask():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return np.array(m) > 0


DIA = diamond_mask()


def smooth(x, k=6):
    ker = np.ones(k) / k
    return np.convolve(np.pad(x, k, mode='edge'), ker, mode='same')[k:-k]


def build_edge(fam):
    src = SURF / f'{fam}-0-side.png'
    out = EDGE_MASKS / f'{fam}-edge-side.png'
    rng = np.random.default_rng(SEED.get(fam, 1))
    alpha = np.array(Image.open(src).convert('RGBA'))[:, :, 3].astype(float)
    side = (alpha > 20) & ~DIA
    ys = np.where(side)[0]
    Btop, Bbot = int(ys.min()), int(ys.max())

    # Fray the bottom silhouette: per-column carve depth from smoothed noise + notches.
    # This script owns geometry only. Generated slabs supply every visible RGB value later.
    base = smooth(rng.random(W), 7)
    base = (base - base.min()) / max(1e-6, (base.max() - base.min()))
    depth = (3 + base * 13).astype(int)
    for _ in range(3):
        c = int(rng.integers(8, W - 8))
        depth[max(0, c - 2):c + 3] += int(rng.integers(6, 13))

    alpha_out = alpha.copy()
    for x in range(W):
        col = np.where(side[:, x])[0]
        if col.size == 0:
            continue
        b = int(col.max())
        d = int(min(depth[x], col.size - 2))
        if d > 0:
            alpha_out[b - d + 1:b + 1, x] = 0
        # occasional rubble fleck hanging just below the torn edge
        if rng.random() < 0.16:
            for k in range(int(rng.integers(1, 3))):
                ry = (b - d) + 2 + k + int(rng.integers(0, 3))
                if 0 <= ry < H:
                    alpha_out[ry, x] = 210

    mask = np.zeros((H, W, 4), dtype=np.uint8)
    mask[:, :, 3] = np.clip(alpha_out, 0, 255).astype(np.uint8)
    EDGE_MASKS.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask, 'RGBA').save(out)
    print(f'wrote {out}  (side y {Btop}..{Bbot})')


if __name__ == '__main__':
    import sys
    fams = sys.argv[1:] or FAMILIES
    for fam in fams:
        if fam not in FAMILIES:
            raise SystemExit(f'unknown edge family: {fam}')
        build_edge(fam)
