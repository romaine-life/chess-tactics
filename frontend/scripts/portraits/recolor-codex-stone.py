"""Recolor fetched navy portrait masters into team-palette candidates.

The reusable color-band algorithm has no publication authority. Sources must be
fetched from live media, outputs must be beneath the OS temporary directory, and
the caller uploads any desired result as a backend candidate.
"""
import argparse
import colorsys
import json
import tempfile
from pathlib import Path
from PIL import Image

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
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        old = Image.open(path).convert("RGBA")
        if old.size == im.size and old.tobytes() == im.tobytes():
            return False
    im.save(path)
    return True


def require_temp_dir(path):
    resolved = path.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        resolved.relative_to(temp_root)
    except ValueError as error:
        raise ValueError(f"--out-dir must be beneath the OS temporary directory {temp_root}: {resolved}") from error
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True,
                        help="Fetched sources laid out as <piece>/navy-blue.png")
    parser.add_argument("--out-dir", type=Path, required=True,
                        help="Temporary output root")
    parser.add_argument("--smooth-source-dir", type=Path,
                        help="Optional fetched smooth masters for neutral black/white recolors")
    parser.add_argument("--crop-config", type=Path,
                        help="Optional deterministic crop JSON; required with --smooth-source-dir")
    return parser.parse_args()


def main():
    args = parse_args()
    if bool(args.smooth_source_dir) != bool(args.crop_config):
        raise ValueError("--smooth-source-dir and --crop-config must be supplied together")
    source_dir = args.source_dir.resolve()
    out_dir = require_temp_dir(args.out_dir)
    checked = 0
    written = 0

    for piece in PIECES:
        source = source_dir / piece / "navy-blue.png"
        if not source.is_file():
            raise FileNotFoundError(f"missing fetched navy master: {source}")
        navy = Image.open(source).convert("RGBA")
        for palette, spec in PALETTES.items():
            checked += 1
            if save_if_changed(apply_palette(navy.copy(), spec), out_dir / "recolored" / piece / f"{palette}.png"):
                written += 1
        print("recolored", piece)

    if args.smooth_source_dir:
        with args.crop_config.open(encoding="utf-8") as handle:
            crops = json.load(handle)
        smooth_dir = args.smooth_source_dir.resolve()
        for piece in PIECES:
            source = smooth_dir / piece / "navy-blue.png"
            if not source.is_file():
                raise FileNotFoundError(f"missing fetched smooth navy master: {source}")
            navy = Image.open(source).convert("RGBA")
            for palette in ["black", "white"]:
                image = apply_palette(navy.copy(), PALETTES[palette])
                checked += 1
                if save_if_changed(image, out_dir / "smooth" / piece / f"{palette}.png"):
                    written += 1
                checked += 1
                if save_if_changed(crop_reference(image, crops[piece]), out_dir / "cropped" / piece / f"{palette}.png"):
                    written += 1
            print("recolored smooth source", piece)

    print(f"DONE — checked {checked} palette candidates, wrote {written} beneath {out_dir}")
    print("Upload selected files with scripts/live-media-admin-client.mjs upload-candidate.")


if __name__ == "__main__":
    main()
