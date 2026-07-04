"""Bake the production stone-bridge sprites from the rendered V/H spans.

render_stone_span.py rendered a continuous span (one flat stone panel instanced at the cell pitch)
per axis, plus a TILE-REFERENCE marker pass (magenta cubes on the z=0 game-tile plane). Here we:
  - calibrate scale from the marker step (downscale so the per-cell step == the board step 48,-27.7),
  - SEAT the deck against the tile: the z=0 markers ARE the tile surface, so anchoring them to the
    sprite's tile-equator makes the deck's width + height MEASURED against a real tile (deck comes out
    exactly 1.00 tiles wide, seated at tile level) instead of an eyeballed squash + anchor,
  - slice ONE interior cell = the tiling middle tile. Because every panel is identical and placed at
    the exact pitch, the middle tiles by construction.

The kit panel is a self-contained balustraded slab (corner posts at every cell join), so for v1 a
run reads as a continuous balustrade and the deck simply ends at the terminal — thru/cap/single share
the middle art (kept as distinct files so the autotile keying + a future distinct end-parapet can drop
in without touching the engine). Writes public/assets/tiles/feature/bridge-stone-<key>.png + -thumb.
"""
import os, sys, json
import numpy as np
from PIL import Image

# Paths derive from this script's location (tools/blender/bridge/) so the pipeline is repo-relative,
# not stranded on one machine. SP = the render output dir (default ./out beside this script); pass a
# different one as argv[1]. FEAT = the shipped feature-sprite dir the bake installs into.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
SP = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "out")
FEAT = os.path.join(ROOT, "frontend", "public", "assets", "tiles", "feature")
W, H = 96, 180
EQUATOR = 68                                          # the game tile's diamond centre in the 96x180 frame
# The z=0 markers ARE the game-tile surface, so they seat at the tile equator by default — the deck's
# height above/below the tile is then whatever the mesh really is (measured, not eyeballed). A nudge
# stays available for taste, but 68 = "tile marker on the tile equator".
ANCHOR_Y = int(os.environ.get("ANCHOR_Y", str(EQUATOR)))
MIDCELL = int(os.environ.get("MIDCELL", "3"))

KEYS = {"v": ["v-thru", "v-capN", "v-capS", "v-single"],
        "h": ["h-thru", "h-capE", "h-capW", "h-single"]}


def marker_centroids(mark):
    R, G, B, A = mark[:, :, 0], mark[:, :, 1], mark[:, :, 2], mark[:, :, 3]
    mg = (R > 170) & (B > 170) & (G < 130) & (A > 120)
    ys, xs = np.where(mg)
    pts = np.stack([xs, ys], 1).astype(float)
    pts = pts[np.argsort(pts[:, 0])]
    gaps = np.where(np.diff(pts[:, 0]) > 12)[0]
    groups = [g for g in np.split(pts, gaps + 1) if len(g) > 20]
    cents = np.array([g.mean(0) for g in groups])
    return cents[np.argsort(cents[:, 0])]


def slice_axis(axis):
    span = Image.open(f"{SP}/stone-{axis}-span.png").convert("RGBA")
    mark = np.array(Image.open(f"{SP}/stone-{axis}-markers.png").convert("RGBA"))
    cents = marker_centroids(mark)
    S = np.diff(cents, axis=0).mean(0)
    f = 48.0 / S[0]
    print(f"[{axis}] cells={len(cents)} step={np.round(S,1)} slope={S[1]/S[0]:+.3f} f={f:.4f} finalstep={np.round(S*f,1)}")
    small = span.resize((round(span.width * f), round(span.height * f)), Image.LANCZOS)
    mc = cents[MIDCELL] * f
    left = int(round(mc[0] - 48))
    top = int(round(mc[1] - ANCHOR_Y))
    tile = small.crop((left, top, left + W, top + H))
    # Measure the sliced deck AGAINST the tile: alpha bbox in the 96-wide (= one tile) frame, with the
    # tile equator at y=EQUATOR. deck-width in tiles, and how far the deck rises above / drops below.
    a = np.array(tile)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs):
        print(f"[{axis}] deck WIDTH = {xs.max()-xs.min()+1}px = {(xs.max()-xs.min()+1)/96:.2f} tiles ; "
              f"rises {EQUATOR-ys.min()}px above the tile, drops {ys.max()-EQUATOR}px below")
    return tile


def main():
    os.makedirs(FEAT, exist_ok=True)
    mids = {}
    for axis in ("v", "h"):
        mid = slice_axis(axis)
        mids[axis] = mid
        for key in KEYS[axis]:
            mid.save(f"{FEAT}/bridge-stone-{key}.png")
            print("  wrote", f"bridge-stone-{key}.png")
    # thumb: square crop of the v-thru alpha bbox
    a = np.array(mids["v"])[:, :, 3]
    ys, xs = np.where(a > 10)
    crop = mids["v"].crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    side = max(crop.size) + 8
    thumb = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    thumb.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    thumb.save(f"{FEAT}/bridge-stone-thumb.png")
    print("  wrote bridge-stone-thumb.png", thumb.size)


if __name__ == "__main__":
    main()
