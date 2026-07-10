"""Promote portrait masters to team palettes.

Recolors the navy codex-stone portrait masters into the production team palettes using a
selective color-band strategy:
shift only the navy stone band, preserve warm accents (king's gold crown, rook gate wood).
Black/white are value ramps so the portraits keep sculptural detail.

In:  frontend/public/assets/portrait-candidates/codex-stone/<piece>/navy-blue.png
Out: frontend/public/assets/portrait-candidates/codex-stone/<piece>/<palette>.png

Also writes black/white smooth preview masters to:
  frontend/public/assets/portrait-editor/<piece>/<palette>.png
and crops those to the superseded-but-catalogued reference portraits at:
  frontend/public/assets/units/<piece>/portrait/<palette>.png
"""
import colorsys
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve()
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
PUBLIC = ROOT / "frontend" / "public"
BASE = PUBLIC / "assets" / "portrait-candidates" / "codex-stone"
EDITOR = PUBLIC / "assets" / "portrait-editor"
UNITS = PUBLIC / "assets" / "units"
CROPS = ROOT / "frontend" / "src" / "art" / "portraitCrops.json"
PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"]
# palette -> spec. Hue specs shift the navy stone band; ramp specs remap that band's
# image-local lightness range into a curated neutral ramp.
PALETTES = {
    "crimson": ("hue", 350, 1.06, 0.94),
    "golden": ("hue", 43, 1.05, 1.06),
    "emerald": ("hue", 150, 0.98, 1.0),
    "black": ("ramp", (7, 9, 12), (96, 107, 113), 0.82),
    "white": ("ramp", (105, 105, 96), (241, 235, 214), 1.08),
}
BAND_LO, BAND_HI, SAT_MIN = 170, 285, 0.08  # navy/blue stone band; warm accents fall outside


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
    if spec[0] == "hue":
        _mode, hue, ss, ls = spec
        return recolor_hue(im, hue, ss, ls)
    if spec[0] == "ramp":
        _mode, low, high, gamma = spec
        return recolor_ramp(im, low, high, gamma)
    raise ValueError(f"unknown palette mode {spec[0]}")


def crop_reference(im, crop, final=512):
    w, h = im.size
    side = crop["s"] * w
    left = crop["cx"] * w - side / 2
    top = crop["cy"] * h - side / 2
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    box = (round(left), round(top), round(left + side), round(top + side))
    return im.crop(box).resize((final, final), Image.LANCZOS)


def save_if_changed(im, path):
    if path.exists():
        old = Image.open(path).convert("RGBA")
        if old.size == im.size and old.tobytes() == im.tobytes():
            return False
    im.save(path)
    return True


n = 0
w = 0
for piece in PIECES:
    navy = Image.open(BASE / piece / "navy-blue.png").convert("RGBA")
    for pal, spec in PALETTES.items():
        n += 1
        if save_if_changed(apply_palette(navy.copy(), spec), BASE / piece / f"{pal}.png"):
            w += 1
    print("recolored codex-stone", piece)

crops = json.load(open(CROPS, encoding="utf-8"))
for piece in PIECES:
    navy = Image.open(EDITOR / piece / "navy-blue.png").convert("RGBA")
    for pal in ["black", "white"]:
        im = apply_palette(navy.copy(), PALETTES[pal])
        n += 1
        if save_if_changed(im, EDITOR / piece / f"{pal}.png"):
            w += 1
        out = UNITS / piece / "portrait" / f"{pal}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        n += 1
        if save_if_changed(crop_reference(im, crops[piece]), out):
            w += 1
    print("recolored portrait-editor", piece)

print(f"DONE — checked {n} palette portraits, wrote {w}")
