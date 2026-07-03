#!/usr/bin/env python3
"""Bake an animated overlay sheet for a region of the main-menu background scene.

Sibling of build-water-anim.py (ADR-0048), adapted from tiles to the menu scene:
the scene is a fully OPAQUE painting, so there is no authored alpha silhouette
to lock against. Instead the lock is a MOTION MASK computed from the frames
themselves:

  1. crop the static region straight from the shipped scene PNG (so the
     overlay can never drift from the art it sits on);
  2. mask = pixels that are water-bright in the static art AND meaningfully
     change in at least one generated frame — eroded away from the crop edges
     (no seams by construction) and despeckled (no lone flickering pixels);
  3. each output frame keeps generated RGB only inside the mask and is fully
     TRANSPARENT outside it, so the untouched scene shows through and any
     global tint drift in a generated frame cannot leak onto rocks or trees;
  4. frame 0 is forced to the static art inside the mask, so the loop wraps
     onto exactly the shipped scene;
  5. frames are assembled left-to-right into one horizontal sheet.

Usage:
  python scripts/build-scene-anim.py <runDir> --rect X,Y,W,H --out <name>
      [--zones "x,y,w,h;x,y,w,h"] [--frames 8] [--edge 6] [--diff 26] [--bright 64]

--zones (crop-relative rects) limits where motion is allowed at all. The
generator drifts low-contrast areas it was told to hold still (night sky, mist)
just enough to breach the diff threshold; zoning the mask to the actual water
columns is more robust than chasing per-region thresholds.

<runDir> holds PixelLab v3 frames as v0/<i>.png (i=0..frames-1 used).
Output: frontend/public/assets/ui/main-menu/scene-anim/<name>.png
Region + frame data must match SCENE_ANIMS in src/ui/sceneBackdrop.tsx.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
SCENE_PATH = SCRIPT_DIR.parent / "public" / "assets" / "ui" / "main-menu" / "background-scene-v1.png"
OUT_DIR = SCRIPT_DIR.parent / "public" / "assets" / "ui" / "main-menu" / "scene-anim"


def build_mask(static: Image.Image, frames: list[Image.Image], w: int, h: int,
               edge: int, diff_thresh: int, bright_thresh: int,
               zones: list[tuple[int, int, int, int]]) -> list[list[bool]]:
    static_px = static.load()
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if zones and not any(zx <= x < zx + zw and zy <= y < zy + zh for zx, zy, zw, zh in zones):
                continue
            sr, sg, sb = static_px[x, y][:3]
            # Water in the night scene is pale moonlit blue: noticeably brighter
            # than the basalt/trees around it. Dark pixels never animate.
            # (Color can NOT separate water from sky gaps here — measured r/b is
            # identical for both — so the structural-drift guard below does it.)
            if max(sr, sg, sb) < bright_thresh:
                continue
            # Structural-drift guard: real water motion sparkles AROUND its
            # static brightness; when the generator instead REPAINTS a bright
            # area dark in (almost) every frame — e.g. extending the treeline
            # over a sky gap — that's drift, not motion, and it would flash
            # once per loop when frame 0 restores the true art. Exclude pixels
            # whose median generated brightness collapses vs the static art.
            gen_lum = sorted(max(f.load()[x, y][:3]) for f in frames)
            if gen_lum[len(gen_lum) // 2] < 0.55 * max(sr, sg, sb):
                continue
            for frame in frames:
                fr, fg, fb = frame.load()[x, y][:3]
                if max(abs(fr - sr), abs(fg - sg), abs(fb - sb)) > diff_thresh:
                    mask[y][x] = True
                    break

    # Edge guard: the overlay must meet the untouched scene with identical
    # pixels, so nothing may move within `edge` px of the crop border.
    for y in range(h):
        for x in range(w):
            if x < edge or y < edge or x >= w - edge or y >= h - edge:
                mask[y][x] = False

    # Despeckle: a moving pixel needs moving neighbours (>=3 of 8), otherwise
    # it reads as single-pixel flicker on a rock, not water.
    for _ in range(2):
        cleaned = [[False] * w for _ in range(h)]
        for y in range(h):
            for x in range(w):
                if not mask[y][x]:
                    continue
                n = sum(
                    1
                    for dy in (-1, 0, 1)
                    for dx in (-1, 0, 1)
                    if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h and mask[y + dy][x + dx]
                )
                cleaned[y][x] = n >= 3
        mask = cleaned
    return mask


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--rect", required=True, help="X,Y,W,H crop in scene pixels")
    parser.add_argument("--out", required=True, help="output sheet name (no extension)")
    parser.add_argument("--zones", default="", help="crop-relative x,y,w,h rects (';'-separated) where motion is allowed")
    parser.add_argument("--skip", default="", help="comma-separated source frame indices to drop (generator fumbles: a frame whose exposure gain is an outlier has usually lost its streak texture — amplifying it doesn't help, dropping it does)")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--edge", type=int, default=6)
    parser.add_argument("--diff", type=int, default=26)
    parser.add_argument("--bright", type=int, default=64)
    args = parser.parse_args()

    x0, y0, w, h = (int(v) for v in args.rect.split(","))
    static = Image.open(SCENE_PATH).convert("RGBA").crop((x0, y0, x0 + w, y0 + h))

    skip = {int(v) for v in args.skip.split(",") if v}
    frames: list[Image.Image] = []
    for i in range(args.frames):
        if i in skip:
            continue
        frame = Image.open(args.run_dir / "v0" / f"{i}.png").convert("RGBA")
        if frame.size != (w, h):
            sys.exit(f"frame {i} is {frame.size}, expected {(w, h)} — refusing to rescale pixel art")
        frames.append(frame)

    n = len(frames)  # frames actually baked (source count minus --skip)
    zones = [tuple(int(v) for v in z.split(",")) for z in args.zones.split(";") if z]
    mask = build_mask(static, frames[1:], w, h, args.edge, args.diff, args.bright, zones)
    moving = sum(1 for row in mask for v in row if v)
    print(f"mask: {moving} moving px ({moving * 100 // (w * h)}% of crop)")

    static_px = static.load()

    # Color-stats lock (per-channel Reinhard transfer): the sheet pins frame 0
    # to the SHIPPED art, but the generator restyles the water (richer, bluer,
    # and with a slow gain swell across the run) — so the one authentic frame
    # reads as a pale flash once per loop, which the eye reports as a wrap
    # jolt. Matching every generated frame's masked mean AND spread per channel
    # to the static art keeps the motion but makes the static frame the family
    # look instead of the outlier. (Replaces the earlier mean-luminance-only
    # exposure lock, which left the color-character snap in place.)
    def masked_stats(px) -> list[tuple[float, float]]:
        stats = []
        for c in range(3):
            vals = [px[x, y][c] for y in range(h) for x in range(w) if mask[y][x]]
            mean = sum(vals) / max(len(vals), 1)
            var = sum((v - mean) ** 2 for v in vals) / max(len(vals), 1)
            stats.append((mean, var ** 0.5))
        return stats

    target = masked_stats(static_px)

    sheet = Image.new("RGBA", (w * n, h), (0, 0, 0, 0))
    report = []
    for i in range(n):
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        out_px = out.load()
        frame_px = frames[i].load()
        if i > 0:
            src = masked_stats(frame_px)
            # clamp the spread gain so a flat/noisy frame can't be blown up
            xfer = [
                (sm, tm, max(0.6, min(1.6, (ts / ss) if ss else 1.0)))
                for (sm, ss), (tm, ts) in zip(src, target)
            ]
        changed = 0
        for y in range(h):
            for x in range(w):
                if not mask[y][x]:
                    continue
                if i == 0:
                    out_px[x, y] = static_px[x, y]  # loop wraps onto the shipped art
                else:
                    fr, fg, fb = (
                        max(0, min(255, round((frame_px[x, y][c] - xfer[c][0]) * xfer[c][2] + xfer[c][1])))
                        for c in range(3)
                    )
                    out_px[x, y] = (fr, fg, fb, 255)
                    if (fr, fg, fb) != static_px[x, y][:3]:
                        changed += 1
        sheet.paste(out, (w * i, 0))
        report.append(f"{changed * 100 // max(moving, 1)}%")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{args.out}.png"
    sheet.save(out_path, optimize=True)
    print(f"{out_path.name}: {sheet.size[0]}x{sheet.size[1]}, moved-vs-static per frame: {' '.join(report)}")


if __name__ == "__main__":
    main()
