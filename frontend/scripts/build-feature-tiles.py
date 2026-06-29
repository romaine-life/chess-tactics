#!/usr/bin/env python3
"""Bake the linear-FEATURE overlay sets (roads + rivers) — 16 transparent tiles per
material, one per 4-bit connection mask — into
public/assets/tiles/feature/<kind>-<material>-<mask>.png (+ a square -thumb.png).

Per ADR-0040 (own the geometry, generate the material): the connection FOOTPRINT is
ours (so pieces always tessellate), the painted SURFACE is GENERATED art. NO code-drawn
fills.

ROADS — the production method (authored + seamless):
  A code-drawn road MAP (all connection cases, on a grid) is the GUIDE; codex repaints
  it in ONE pass as authored pixel-art dirt (committed source:
  docs/art/codex-runs/roads/<mat>-network.png). We slice each case cell out of that one
  drawing, EDGE-HEAL it (force the road to cross every tile edge at one canonical centred
  band, and force non-connected edges to clean grass) so reused tiles meet seamlessly,
  rotate the base cases to cover all 16 masks, and project into the iso diamond. Organic
  interior, seam-clean edges. (See docs/art/codex-runs/roads/<mat>-base-guide.png for the
  guide layout; regenerate the network via codex img2img over that guide.)

RIVERS — interim (projected material, not yet redone with the codex-heal method; the
  river editor layer is also pending re-port onto LevelEditor.tsx after main's refactor):
  water body + a generated dirt BANK projected into the ribbon.

Geometry pinned to the canonical iso frame (matches build-surface-tiles.py and the
.tileset-generated-board-tile / boardProjection contract):
  frame 96x180; top diamond APEX(48,41) RIGHT(96,68) FRONT(48,95) LEFT(0,68)
  centre (48,68); edge midpoints  N(72,54.5) E(72,81.5) S(24,81.5) W(24,54.5)
Bit order N,E,S,W = 1,2,4,8, matching featureAutotile.FEATURE_DIRS.

Usage (from frontend/):  python scripts/build-feature-tiles.py
"""
import math
import os
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
RAW = os.path.normpath(os.path.join(ROOT, '..', 'docs', 'art', 'pixellab-runs', 'surfaces'))
CODEX = os.path.normpath(os.path.join(ROOT, '..', 'docs', 'art', 'codex-runs', 'roads'))
OUT = os.path.join(ROOT, 'public', 'assets', 'tiles', 'feature')

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
EDGE = {1: (72.0, 54.5), 2: (72.0, 81.5), 4: (24.0, 81.5), 8: (24.0, 54.5)}
BITS = (1, 2, 4, 8)
SS = 4
PX = 2
EXT = 4
DIA = Image.new('L', (W, H), 0)
ImageDraw.Draw(DIA).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
CLIP = DIA.filter(ImageFilter.MaxFilter(7))  # dilated clip → road overlaps the seam


def project_square(im):
    """Affine-map a top-down SQUARE tile onto the iso top-diamond (NEAREST), clipped to
    the dilated diamond so connected stubs overlap the seam."""
    s = im.size[0]
    dst = np.array([APEX, RIGHT, LEFT], float)
    src = np.array([(0, 0), (s, 0), (0, s)], float)
    M = np.column_stack([dst, np.ones(3)])
    cx = np.linalg.solve(M, src[:, 0])
    cy = np.linalg.solve(M, src[:, 1])
    pr = im.transform((W, H), Image.AFFINE, (cx[0], cx[1], cx[2], cy[0], cy[1], cy[2]), resample=Image.NEAREST)
    pr.putalpha(ImageChops.multiply(pr.split()[3], CLIP))
    return pr


# ---- ROADS: code-guide → codex repaint → slice → edge-heal → rotate → project --------
T = 96            # base cell size in the repaint grid
HEAL_W = 40.0     # canonical road width at a tile edge
HEAL_M = 16.0     # heal depth (how far in the edge normalisation blends)
# Base-case cells in the guide layout (docs/art/codex-runs/roads/<mat>-base-guide.png),
# grid 7x5, with each cell's grid-space connection mask (N=1,E=2,S=4,W=8).
ROAD_GRID = (7, 5)
ROAD_CASES = {'end': ((3, 0), 4), 'straight': ((3, 1), 5), 'corner': ((1, 2), 6), 'T': ((2, 2), 14), 'cross': ((3, 2), 15)}


def _rotcw(mask, k):
    out = 0
    for p in range(4):
        if mask & (1 << p):
            out |= 1 << ((p + k) % 4)
    return out


def _case_for(mask):
    pc = bin(mask).count('1')
    if pc == 0:
        return None
    name = 'end' if pc == 1 else ('straight' if mask in (5, 10) else 'corner') if pc == 2 else 'T' if pc == 3 else 'cross'
    bm = ROAD_CASES[name][1]
    for k in range(4):
        if _rotcw(bm, k) == mask:
            return name, k
    raise SystemExit(f'no rotation maps {name}({bm}) -> {mask}')


def _canonical_ribbon(mask):
    """The consistent-width ribbon SHAPE (centre -> each connected edge midpoint) the road
    is CLAMPED to, so the variable-width codex road can't bulge in the middle / pinch at
    seams. Square space, slightly wider than HEAL_W so organic edge nibbles survive inside."""
    img = Image.new('L', (T, T), 0); d = ImageDraw.Draw(img); c = (T / 2, T / 2)
    mids = {1: (T / 2, 0), 2: (T, T / 2), 4: (T / 2, T), 8: (0, T / 2)}
    half = (HEAL_W + 6) / 2
    for bit, (mx, my) in mids.items():
        if mask & bit:
            dx, dy = mx - c[0], my - c[1]; L = math.hypot(dx, dy) or 1.0; nx, ny = -dy / L * half, dx / L * half
            ex, ey = mx + dx / L * 4, my + dy / L * 4  # run a touch past the edge
            d.polygon([(c[0] + nx, c[1] + ny), (ex + nx, ey + ny), (ex - nx, ey - ny), (c[0] - nx, c[1] - ny)], fill=255)
    d.ellipse([c[0] - half, c[1] - half, c[0] + half, c[1] + half], fill=255)
    return np.array(img) > 0


def _heal(arr, mask):
    """Normalise a sliced road cell so it tessellates: clamp the road to a consistent-width
    ribbon (no bulge), force every connected edge to cross at one canonical centred band,
    and fade non-connected edges to grass. Interior keeps codex texture + organic narrowing."""
    R, G, B = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    a = (~((G > R + 6) & (G > B - 4) & (G > 90))).astype(float)  # road = NOT dithered grass
    a *= _canonical_ribbon(mask)                                  # CLAMP: road can't exceed the ribbon
    ys, xs = np.mgrid[0:T, 0:T]
    edges = {1: (ys, xs), 4: (T - 1 - ys, xs), 2: (T - 1 - xs, ys), 8: (xs, ys)}  # bit:(depth, perp)
    for bit, (d, perp) in edges.items():
        near = d < HEAL_M
        w = np.clip((HEAL_M - d) / HEAL_M, 0, 1)
        if mask & bit:
            canon = (np.abs(perp - T / 2) <= HEAL_W / 2).astype(float)
            a = np.where(near, a * (1 - w) + canon * w, a)
        else:
            a = np.where(near, a * (d / HEAL_M), a)
    a = np.clip(a, 0, 1)
    green = (G > R + 6) & (G > B - 4) & (G > 90)
    rb = arr.copy()
    need = (a > 0.4) & green  # road-alpha pixels that are still grass-coloured → fill road colour
    if ((a > 0.4) & ~green).any():
        med = np.median(arr[(a > 0.4) & ~green][:, :3], axis=0)
        rb[need, 0], rb[need, 1], rb[need, 2] = med[0], med[1], med[2]
    return Image.fromarray(np.dstack([rb[:, :, 0], rb[:, :, 1], rb[:, :, 2], a * 255]).astype(np.uint8), 'RGBA')


def bake_road(material, total):
    rep = Image.open(f'{CODEX}/{material}-network.png').convert('RGBA').resize((ROAD_GRID[0] * T, ROAD_GRID[1] * T))
    cells = {name: np.array(rep.crop((cx * T, cy * T, cx * T + T, cy * T + T))).astype(float) for name, ((cx, cy), _m) in ROAD_CASES.items()}
    healed = {name: _heal(cells[name], ROAD_CASES[name][1]) for name in ROAD_CASES}
    pieces = {}
    for mask in range(16):
        cf = _case_for(mask)
        if cf is None:  # isolated: a small road node from the cross centre
            base = healed['cross']; node = Image.new('RGBA', (T, T), (0, 0, 0, 0))
            node.paste(base.crop((T // 2 - 22, T // 2 - 22, T // 2 + 22, T // 2 + 22)), (T // 2 - 22, T // 2 - 22))
            sq = node
        else:
            name, k = cf; sq = healed[name].rotate(-90 * k, expand=False)
        project_square(sq).save(f'{OUT}/road-{material}-{mask}.png'); pieces[mask] = sq; total[0] += 1
    # thumb: the cross, cropped to its art + squared (object-fit:contain centres it)
    cross = project_square(healed['cross']); al = np.array(cross)[:, :, 3]; yy, xx = np.where(al > 10)
    crop = cross.crop((int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1))
    side = max(crop.size) + 8; thumb = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    thumb.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    thumb.save(f'{OUT}/road-{material}-thumb.png')


# ---- RIVERS (interim projected material): water body + generated dirt bank -------------
BODY_W = 22.0
RIVER_CASING_W = BODY_W + 10
CASING_TONE = 0.55


def _end(bit):
    e = EDGE[bit]; dx, dy = e[0] - 48.0, e[1] - 68.0; L = math.hypot(dx, dy) or 1.0
    return ((e[0] + dx / L * EXT) * SS, (e[1] + dy / L * EXT) * SS)


def _quad(draw, p0, p1, half):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L * half, dx / L * half
    draw.polygon([(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)], fill=255)


def _ribbon_alpha(conns, half, hub, node_r):
    img = Image.new('L', (W * SS, H * SS), 0); d = ImageDraw.Draw(img); c = (48.0 * SS, 68.0 * SS)
    if not conns:
        d.ellipse([c[0] - node_r * SS, c[1] - node_r * SS, c[0] + node_r * SS, c[1] + node_r * SS], fill=255); return img
    for bit in conns:
        _quad(d, c, _end(bit), half * SS)
    d.ellipse([c[0] - hub * SS, c[1] - hub * SS, c[0] + hub * SS, c[1] + hub * SS], fill=255); return img


def _flatten_opaque(raw):
    arr = np.array(raw.convert('RGBA')); op = arr[:, :, 3] >= 250
    if op.any() and not op.all():
        arr[~op, :3] = arr[op][:, :3].mean(0)
    arr[:, :, 3] = 255; return Image.fromarray(arr, 'RGBA')


def _project_material(raw):
    raw = _flatten_opaque(raw); s = raw.size[0]; tiled = Image.new('RGBA', (s * 3, s * 3))
    for ix in range(3):
        for iy in range(3):
            tiled.paste(raw, (ix * s, iy * s))
    dst = np.array([(APEX[0] * SS, APEX[1] * SS), (RIGHT[0] * SS, RIGHT[1] * SS), (LEFT[0] * SS, LEFT[1] * SS)], float)
    src = np.array([(s, s), (2 * s, s), (s, 2 * s)], float)
    M = np.column_stack([dst, np.ones(3)]); cx = np.linalg.solve(M, src[:, 0]); cy = np.linalg.solve(M, src[:, 1])
    return tiled.transform((W * SS, H * SS), Image.AFFINE, (cx[0], cx[1], cx[2], cy[0], cy[1], cy[2]), resample=Image.NEAREST)


def _toned(mat, frac):
    a = np.array(mat).astype(float); a[:, :, :3] *= frac; return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def _masked(mat, alpha):
    out = mat.copy(); out.putalpha(ImageChops.multiply(mat.getchannel('A'), alpha)); return out


def _river_build(mask, body_mat, casing_mat):
    conns = [b for b in BITS if mask & b]
    body = _ribbon_alpha(conns, BODY_W / 2, BODY_W / 2, BODY_W / 2 + 3)
    casing = _ribbon_alpha(conns, RIVER_CASING_W / 2, RIVER_CASING_W / 2, BODY_W / 2 + 6)
    out = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    out.alpha_composite(_masked(casing_mat, ImageChops.subtract(casing, body)))
    out.alpha_composite(_masked(body_mat, body))
    tile = out.resize((W, H), Image.LANCZOS)
    return tile.resize((W // PX, H // PX), Image.NEAREST).resize((W, H), Image.NEAREST) if PX > 1 else tile


def bake_river(material, body, bank, total):
    body_mat = _project_material(Image.open(f'{RAW}/{body[0]}/tile_{body[1]}.png'))
    casing_mat = _project_material(Image.open(f'{RAW}/{bank[0]}/tile_{bank[1]}.png'))
    for mask in range(16):
        _river_build(mask, body_mat, casing_mat).save(f'{OUT}/river-{material}-{mask}.png'); total[0] += 1
    cross = _river_build(15, body_mat, casing_mat); al = np.array(cross)[:, :, 3]; yy, xx = np.where(al > 10)
    crop = cross.crop((int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1))
    side = max(crop.size) + 8; thumb = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    thumb.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2)); thumb.save(f'{OUT}/river-{material}-thumb.png')


def main():
    os.makedirs(OUT, exist_ok=True)
    for stale in os.listdir(OUT):
        if stale.endswith('.png') and (stale.startswith('road-') or stale.startswith('river-')):
            os.remove(os.path.join(OUT, stale))
    total = [0]
    bake_road('dirt', total)               # authored, codex-heal (production)
    bake_river('water', ('water', '0'), ('dirt', '0'), total)  # interim, projected
    print(f'wrote {total[0]} feature overlays (road: dirt [codex-heal]; river: water [interim]) to {OUT}')


if __name__ == '__main__':
    main()
