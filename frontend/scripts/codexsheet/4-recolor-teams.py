"""Codex Sheet pipeline · step 4 — team-palette recolor (the production swap).

Selectively shift the navy STONE (blue hue band) of the navy masters to each team palette
while PRESERVING warm accents (gold crowns, gate wood, jewels) — matching the existing
team convention (crimson king keeps its gold crown). Black/white are value ramps so the
units keep sculptural detail instead of flattening to pure monochrome. Writes the shipped
game sprites.

Source: frontend/public/assets/units-pixel/codexsheet/<piece>/navy-blue (step 3 masters)
Output: frontend/public/assets/units/<piece>/<palette>/<dir>.png  (the live game roster)
Run with 'test' to preview king crimson only (no overwrite).
"""
import sys, os, colorsys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve()
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
SRC = ROOT / "frontend" / "public" / "assets" / "units-pixel" / "codexsheet"
DST = ROOT / "frontend" / "public" / "assets" / "units"
PIECES = ["pawn", "rook", "knight", "bishop", "queen", "king"]
DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
# palette -> spec. Hue specs shift the navy stone band; ramp specs remap that band's
# image-local lightness range into a curated neutral ramp.
PALETTES = {
    "navy-blue": ("copy",),
    "crimson": ("hue", 350, 1.06, 0.94),
    "golden": ("hue", 43, 1.05, 1.06),
    "emerald": ("hue", 150, 0.98, 1.0),
    "black": ("ramp", (7, 9, 12), (96, 107, 113), 0.82),
    "white": ("ramp", (105, 105, 96), (241, 235, 214), 1.08),
}
# navy/blue stone hue band; warm accents (gold ~43, red ~0, orange ~30) fall outside and are kept.
BAND_LO, BAND_HI, SAT_MIN = 170, 285, 0.08

def in_band(r, g, b):
    hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return (BAND_LO <= hh * 360 <= BAND_HI and ss > SAT_MIN), hh, ll, ss

def clamp01(v):
    return max(0.0, min(1.0, v))

def percentile(values, q):
    if not values:
        return 0.0
    values = sorted(values)
    pos = (len(values) - 1) * q
    lo = int(pos)
    hi = min(len(values) - 1, lo + 1)
    frac = pos - lo
    return values[lo] * (1 - frac) + values[hi] * frac

def lerp_color(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def recolor_hue(im, hue, sat_scale, light_scale):
    im = im.convert("RGBA"); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            selected, _hh, ll, ss = in_band(r, g, b)
            if selected:
                nr, ng, nb = colorsys.hls_to_rgb(hue / 360, min(1, ll * light_scale), min(1, ss * sat_scale))
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im

def recolor_ramp(im, low, high, gamma):
    im = im.convert("RGBA"); px = im.load(); w, h = im.size
    lights = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            selected, _hh, ll, _ss = in_band(r, g, b)
            if selected:
                lights.append(ll)
    lo = percentile(lights, 0.04)
    hi = percentile(lights, 0.96)
    if hi - lo < 0.01:
        hi = lo + 0.01
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            selected, _hh, ll, _ss = in_band(r, g, b)
            if selected:
                t = clamp01((ll - lo) / (hi - lo)) ** gamma
                nr, ng, nb = lerp_color(low, high, t)
                px[x, y] = (nr, ng, nb, a)
    return im

def apply_palette(im, spec):
    if spec[0] == "copy":
        return im
    if spec[0] == "hue":
        _mode, hue, ss, ls = spec
        return recolor_hue(im, hue, ss, ls)
    if spec[0] == "ramp":
        _mode, low, high, gamma = spec
        return recolor_ramp(im, low, high, gamma)
    raise ValueError(f"unknown palette mode {spec[0]}")

def src(piece, d):
    return SRC / piece / "navy-blue" / f"{d}.png"

def save_if_changed(im, path):
    if path.exists():
        old = Image.open(path).convert("RGBA")
        if old.size == im.size and old.tobytes() == im.tobytes():
            return False
    im.save(path)
    return True

if len(sys.argv) > 1 and sys.argv[1] == "test":
    out = ROOT / "docs" / "art" / "unit-concepts" / "codex-sheets" / "king-crimson-test.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    apply_palette(Image.open(src("king", "south")).convert("RGBA"), PALETTES["crimson"]).save(out)
    print("WROTE", out); sys.exit(0)

n = 0
w = 0
for piece in PIECES:
    for pal, spec in PALETTES.items():
        d_out = DST / piece / pal
        d_out.mkdir(parents=True, exist_ok=True)
        for d in DIRS:
            im = Image.open(src(piece, d)).convert("RGBA")
            n += 1
            if save_if_changed(apply_palette(im, spec), d_out / f"{d}.png"):
                w += 1
    print("recolored", piece)
print(f"DONE — checked {n} sprites, wrote {w} into frontend/public/assets/units")
