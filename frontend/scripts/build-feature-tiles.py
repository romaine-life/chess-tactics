#!/usr/bin/env python3
"""Bake the linear-FEATURE overlay sets (roads + rivers) — 16 transparent tiles per
material, one per 4-bit connection mask — into
public/assets/tiles/feature/<kind>-<material>-<mask>.png (+ a square -thumb.png).

Per ADR-0040 (own the geometry, generate the material): the connection FOOTPRINT
(which stubs the ribbon has, where they meet the shared seam) is computed here so
pieces always tessellate; the painted SURFACE is a GENERATED top-down material
(docs/art/pixellab-runs/surfaces/<fam>/) projected into the iso top-diamond and
masked to the ribbon — the same surface-swap shape as the base tiles
(build-surface-tiles.py). NO hardcoded fill colours.
  - ROADS: body = a road surface; casing = a darker TONE of that same body (as the
    base tiles tone their side faces).
  - RIVERS: body = the water surface; casing = a separate generated BANK material
    (earth), so the ribbon reads as water between two banks.

Geometry pinned to the canonical iso frame (matches build-surface-tiles.py and the
.tileset-generated-board-tile / boardProjection contract):
  frame 96x180; top diamond APEX(48,41) RIGHT(96,68) FRONT(48,95) LEFT(0,68)
  centre (48,68); edge midpoints  N(72,54.5) E(72,81.5) S(24,81.5) W(24,54.5)
Bit order N,E,S,W = 1,2,4,8, matching featureAutotile.FEATURE_DIRS.

Each material is its own 16-mask set; all cells of one KIND connect regardless of
material (rivers connect to rivers, roads to roads). Add a row to FEATURES to add a
selectable material; the editor reads the same lists (ROAD_MATERIALS / RIVER_MATERIALS).

Usage (from frontend/):  python scripts/build-feature-tiles.py    (bakes everything)
"""
import math
import os
import numpy as np
from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
RAW = os.path.normpath(os.path.join(ROOT, '..', 'docs', 'art', 'pixellab-runs', 'surfaces'))
OUT = os.path.join(ROOT, 'public', 'assets', 'tiles', 'feature')

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
CENTER = (48.0, 68.0)
EDGE = {1: (72.0, 54.5), 2: (72.0, 81.5), 4: (24.0, 81.5), 8: (24.0, 54.5)}
BITS = (1, 2, 4, 8)

SS = 4   # supersample for clean diagonals, then box-filter down.
PX = 2   # final pixel-art chunk (NEAREST), to sit with the pixelated base tiles.
EXT = 4  # px each connected stub runs PAST the seam, so neighbours overlap.
BODY_W = 22.0           # default body width (screen px)
ROAD_CASING_W = BODY_W + 6   # 3px casing band each side (road)
RIVER_CASING_W = BODY_W + 10  # 5px bank band each side (river reads as water + banks)
CASING_TONE = 0.55     # road casing = this fraction of the body material's brightness


def _end(bit):
    e = EDGE[bit]
    dx, dy = e[0] - CENTER[0], e[1] - CENTER[1]
    length = math.hypot(dx, dy) or 1.0
    return ((e[0] + dx / length * EXT) * SS, (e[1] + dy / length * EXT) * SS)


def _quad(draw, p0, p1, half):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length * half, dx / length * half
    draw.polygon(
        [(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)],
        fill=255,
    )


def ribbon_alpha(conns, half, hub, node_r):
    """The ribbon SHAPE (single channel, supersampled) for a width/hub/node — pure
    computed geometry, the footprint half of ADR-0040."""
    img = Image.new('L', (W * SS, H * SS), 0)
    d = ImageDraw.Draw(img)
    c = (CENTER[0] * SS, CENTER[1] * SS)
    if not conns:
        d.ellipse([c[0] - node_r * SS, c[1] - node_r * SS, c[0] + node_r * SS, c[1] + node_r * SS], fill=255)
        return img
    for bit in conns:
        _quad(d, c, _end(bit), half * SS)
    d.ellipse([c[0] - hub * SS, c[1] - hub * SS, c[0] + hub * SS, c[1] + hub * SS], fill=255)
    return img


def _flatten_opaque(raw):
    """Force the generated material fully opaque so ONLY the ribbon shape decides
    transparency. Some generated surfaces (e.g. stone) carry scattered transparent
    pixels; left alone they'd punch holes in the ribbon. Fill those with the material's
    own mean colour (not an invented colour) and set alpha 255."""
    arr = np.array(raw.convert('RGBA'))
    opaque = arr[:, :, 3] >= 250
    if opaque.any() and not opaque.all():
        arr[~opaque, :3] = arr[opaque][:, :3].mean(0)
    arr[:, :, 3] = 255
    return Image.fromarray(arr, 'RGBA')


def project_material(raw):
    """Tile the 64x64 generated material 3x3 and affine-map the CENTRE tile onto the
    iso top-diamond at supersample, so the sheared plane covers the ribbon (incl. the
    EXT overrun past the seam) with no holes. Same affine as build-surface-tiles.py."""
    raw = _flatten_opaque(raw)
    s = raw.size[0]
    tiled = Image.new('RGBA', (s * 3, s * 3))
    for ix in range(3):
        for iy in range(3):
            tiled.paste(raw, (ix * s, iy * s))
    dst = np.array([(APEX[0] * SS, APEX[1] * SS), (RIGHT[0] * SS, RIGHT[1] * SS), (LEFT[0] * SS, LEFT[1] * SS)], float)
    src = np.array([(s, s), (2 * s, s), (s, 2 * s)], float)  # centre tile corners
    M = np.column_stack([dst, np.ones(3)])
    cx = np.linalg.solve(M, src[:, 0])
    cy = np.linalg.solve(M, src[:, 1])
    coeffs = (cx[0], cx[1], cx[2], cy[0], cy[1], cy[2])
    return tiled.transform((W * SS, H * SS), Image.AFFINE, coeffs, resample=Image.NEAREST)


def _toned(mat, frac):
    a = np.array(mat).astype(float)
    a[:, :, :3] *= frac
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def _masked(mat, alpha):
    out = mat.copy()
    out.putalpha(ImageChops.multiply(mat.getchannel('A'), alpha))
    return out


def build(mask, body_mat, casing_mat, casing_w):
    conns = [b for b in BITS if mask & b]
    body = ribbon_alpha(conns, BODY_W / 2, BODY_W / 2, BODY_W / 2 + 3)
    casing = ribbon_alpha(conns, casing_w / 2, casing_w / 2, BODY_W / 2 + 6)
    casing_only = ImageChops.subtract(casing, body)  # the edge band (road casing / river bank)
    out = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    out.alpha_composite(_masked(casing_mat, casing_only))  # edge band first
    out.alpha_composite(_masked(body_mat, body))           # body over it
    tile = out.resize((W, H), Image.LANCZOS)
    if PX > 1:
        tile = tile.resize((W // PX, H // PX), Image.NEAREST).resize((W, H), Image.NEAREST)
    return tile


def build_thumb(body_mat, casing_mat, casing_w):
    """A square, pre-CENTERED preview icon (the cross piece cropped to its art +
    padded square), so plain object-fit:contain centres it in any editor box."""
    cross = build(15, body_mat, casing_mat, casing_w)
    alpha = np.array(cross)[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0:
        return cross
    crop = cross.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    side = max(crop.size) + 8
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    return square


# kind, material name, body surface (fam, var), bank surface or None (None ⇒ a toned
# body, the road casing). Keep in sync with featureAutotile ROAD_MATERIALS/RIVER_MATERIALS.
FEATURES = [
    ('road', 'dirt', ('dirt', '0'), None),
    ('road', 'stone', ('stone', '0'), None),
    ('road', 'pebble', ('pebble', '0'), None),
    ('river', 'water', ('water', '0'), ('dirt', '0')),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for stale in os.listdir(OUT):  # drop previous feature tiles so renames don't linger
        if stale.endswith('.png') and (stale.startswith('road-') or stale.startswith('river-')):
            os.remove(os.path.join(OUT, stale))
    total = 0
    for kind, name, (bf, bv), bank in FEATURES:
        body_mat = project_material(Image.open(f'{RAW}/{bf}/tile_{bv}.png'))
        casing_w = RIVER_CASING_W if kind == 'river' else ROAD_CASING_W
        casing_mat = project_material(Image.open(f'{RAW}/{bank[0]}/tile_{bank[1]}.png')) if bank else _toned(body_mat, CASING_TONE)
        for mask in range(16):
            build(mask, body_mat, casing_mat, casing_w).save(f'{OUT}/{kind}-{name}-{mask}.png')
            total += 1
        build_thumb(body_mat, casing_mat, casing_w).save(f'{OUT}/{kind}-{name}-thumb.png')
    print(f'wrote {total} feature overlays + {len(FEATURES)} thumbs to {OUT}')


if __name__ == '__main__':
    main()
