#!/usr/bin/env python3
"""Bake the ROAD feature overlay set — 16 transparent tiles, one per 4-bit
connection mask — into public/assets/tiles/feature/road-<mask>.png.

A road is a LINEAR feature the level author draws across cells; each cell's art is
chosen by which of its 4 cardinal neighbours also carry a road (the connection
autotile, see frontend/src/core/featureAutotile.ts). Rather than hand-draw or
AI-generate 16 iso pieces, we OWN the geometry: every piece is ribbon stubs from
the tile centre to the relevant top-diamond edge midpoints, so adjacent tiles
always meet flush at the shared seam — the same "Blender owns geometry" principle
as the surface pipeline (build-surface-tiles.py). The overlay composites OVER any
base tile, so a road crosses grass or dirt unchanged.

Geometry is pinned to the canonical iso frame (must match build-surface-tiles.py
and the .tileset-generated-board-tile / boardProjection contract):

  frame 96x180; top diamond APEX(48,41) RIGHT(96,68) FRONT(48,95) LEFT(0,68)
  centre (48,68); edge midpoints  N(72,54.5) E(72,81.5) S(24,81.5) W(24,54.5)

Bit order N,E,S,W = 1,2,4,8, matching featureAutotile.FEATURE_DIRS. Re-runnable,
no scratch dir: `python scripts/build-road-tiles.py` (run from frontend/).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'public', 'assets', 'tiles', 'feature'))

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
CENTER = (48.0, 68.0)
# bit -> edge midpoint on the top diamond (N, E, S, W).
EDGE = {1: (72.0, 54.5), 2: (72.0, 81.5), 4: (24.0, 81.5), 8: (24.0, 54.5)}
BITS = (1, 2, 4, 8)

SS = 4  # supersample for clean diagonals, then box-filter back down.
PX = 2  # final pixel-art chunk (NEAREST), to sit with the pixelated base tiles.
EXT = 4  # px each connected stub runs PAST the seam, so neighbours overlap (no
         # grass sliver from independent per-tile pixel quantisation). Stubs only
         # ever point at a connected neighbour — which by definition has a road —
         # so the overrun can never paint onto a grass face.
DILATE = 5  # clip-mask grow (MaxFilter window) so the EXT overrun survives clipping.

# Earthy packed-dirt path. Dark casing, mid body, a worn lighter centre.
OUTLINE = (74, 58, 36, 255)
FILL = (156, 126, 78, 255)
HILITE = (192, 164, 106, 255)

ROAD_W = 22.0      # body width (screen px)
OUT_W = ROAD_W + 6 # casing width
HILITE_W = 7.0     # worn centre streak
HUB = ROAD_W / 2
HUB_OUT = OUT_W / 2
HUB_HI = HILITE_W / 2
NODE = ROAD_W / 2 + 3  # lone-cell marker radius


def _quad(draw, p0, p1, half, color):
    """Filled rectangle from p0 to p1 with the given half-width (butt ends)."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length * half, dx / length * half
    draw.polygon(
        [(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)],
        fill=color,
    )


def _disc(draw, c, r, color):
    draw.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=color)


def _end(bit):
    """Supersampled stub endpoint: the seam midpoint, pushed EXT px outward."""
    e = EDGE[bit]
    dx, dy = e[0] - CENTER[0], e[1] - CENTER[1]
    length = math.hypot(dx, dy) or 1.0
    return ((e[0] + dx / length * EXT) * SS, (e[1] + dy / length * EXT) * SS)


def _pass(draw, conns, center, half, hub, color, node_r):
    if not conns:
        _disc(draw, center, node_r, color)
        return
    for bit in conns:
        _quad(draw, center, _end(bit), half * SS, color)
    _disc(draw, center, hub * SS, color)


def diamond_mask():
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return m


def build(mask):
    conns = [b for b in BITS if mask & b]
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = (CENTER[0] * SS, CENTER[1] * SS)
    # casing -> body -> worn centre. Each layer's ends sit exactly on the seam
    # midpoints, so neighbouring tiles' ribbons meet flush with no seam bump.
    _pass(d, conns, c, HUB_OUT, HUB_OUT, OUTLINE, NODE + 3)
    _pass(d, conns, c, HUB, HUB, FILL, NODE)
    if conns:
        for bit in conns:
            _quad(d, c, _end(bit), HUB_HI * SS, HILITE)
        _disc(d, c, HUB_HI * SS, HILITE)
    else:
        _disc(d, c, NODE - 4, HILITE)

    tile = big.resize((W, H), Image.LANCZOS)
    # Clip to the top diamond (grown by DILATE) so a ribbon stays on the top face
    # but the EXT overrun toward connected neighbours survives to overlap the seam.
    clip = diamond_mask().filter(ImageFilter.MaxFilter(DILATE))
    tile.putalpha(Image.composite(tile.getchannel('A'), Image.new('L', (W, H), 0), clip))
    # Chunk to the pixel grid so it reads as pixel art beside the base tiles.
    if PX > 1:
        tile = tile.resize((W // PX, H // PX), Image.NEAREST).resize((W, H), Image.NEAREST)
    return tile


def main():
    os.makedirs(OUT, exist_ok=True)
    for mask in range(16):
        build(mask).save(f'{OUT}/road-{mask}.png')
    print(f'wrote 16 road overlays to {OUT}')


if __name__ == '__main__':
    main()
