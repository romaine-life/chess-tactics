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
Output: an explicit temporary candidate directory; upload the exact sheet through
the live-media admin workflow.
Region + frame data must match SCENE_ANIMS in src/ui/sceneBackdrop.tsx.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

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
            if not frames:
                # Static-only masking (scroll mode without a run dir): zones +
                # brightness + the despeckle/edge passes below decide alone.
                mask[y][x] = True
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


def bake_scroll(static: Image.Image, mask: list[list[bool]], w: int, h: int,
                s: int, n: int, out_path) -> None:
    """Bake a seamless-by-construction scroll loop from the static art itself.

    The pixel-art canon (saint11 / SadfaceRL / Aseprite shift-wrap; same math
    as engine UV panning): every frame is the SAME art translated down a
    constant s px with wraparound inside the water, so the wrap step is the
    identical operation to every interior step — frame n is bit-identical to
    frame 0 and a loop seam is impossible, not merely unlikely. Falls in
    pixel art are per-column streaks, so the scroll runs per column:

    per masked vertical run (contiguous masked rows of one column):
      - period P = the largest divisor of s*n that fits the run (so the run's
        cycle closes exactly at n frames); runs shorter than 6 px stay static;
      - the run's own top P rows become the tile; its junction is hidden by
        crossfading the first few tile rows toward the art that CONTINUES the
        run below the tile (or toward the tile's own tail when the run is
        exactly one period long);
      - frame i paints tile row ((j - s*i) mod P) at run row j (downward
        flow), tiled over the whole run;
      - the run's top/bottom few rows fade toward the static art so the
        scroll never hard-cuts against non-animated pixels.

    Only the art's own water pixels are rearranged — palette and character
    are automatically the scene's own (no color transfer needed).
    """
    static_px = static.load()
    total = s * n
    periods = sorted((p for p in range(6, total + 1) if total % p == 0), reverse=True)

    # Collect per-column contiguous masked runs.
    runs: list[tuple[int, int, int]] = []  # (x, rowStart, length)
    for x in range(w):
        y = 0
        while y < h:
            if mask[y][x]:
                a = y
                while y < h and mask[y][x]:
                    y += 1
                runs.append((x, a, y - a))
            else:
                y += 1

    scrolled = static_frames = 0
    # Precompute per-run tiles (list of RGB rows) and metadata.
    baked_runs = []
    for x, a, length in runs:
        period = next((p for p in periods if p <= length), 0)
        if not period:
            static_frames += 1
            continue
        scrolled += 1
        tile = [static_px[x, a + r][:3] for r in range(period)]
        kj = min(4, period // 3)
        for r in range(kj):
            # Junction blend: tile row r must follow tile row period-1 as the
            # scroll wraps. Prefer the art that actually continues the run
            # below the tile; fall back to the tile's own tail.
            below = a + period + r
            other = static_px[x, below][:3] if below < a + length else tile[period - kj + r]
            u = (r + 1) / (kj + 1)
            tile[r] = tuple(round(u * tc + (1 - u) * oc) for tc, oc in zip(tile[r], other))
        baked_runs.append((x, a, length, period, tile))

    sheet = Image.new("RGBA", (w * n, h), (0, 0, 0, 0))
    for i in range(n):
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        out_px = out.load()
        for x, a, length, period, tile in baked_runs:
            k_edge = min(4, length // 4)
            for j in range(length):
                src = tile[(j - s * i) % period]
                edge = min(j, length - 1 - j)
                if edge < k_edge:
                    # fade toward the static art at run ends (spatially fixed
                    # weights — identical construction every frame, so the
                    # loop closure is unaffected)
                    t = (edge + 1) / (k_edge + 1)
                    st = static_px[x, a + j][:3]
                    src = tuple(round(t * sc + (1 - t) * stc) for sc, stc in zip(src, st))
                out_px[x, a + j] = (*src, 255)
        sheet.paste(out, (w * i, 0))

    sheet.save(out_path, optimize=True)
    per = {}
    for _, _, _, p, _ in baked_runs:
        per[p] = per.get(p, 0) + 1
    print(f"scroll bake: {scrolled} runs scrolled ({static_frames} too short, left static), "
          f"s={s}px/frame, n={n}, periods {sorted(per.items(), reverse=True)}")
    print(f"{out_path.name}: {sheet.size[0]}x{sheet.size[1]} — frame {n} == frame 0 by construction")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dir", type=Path, nargs="?", default=None,
                        help="PixelLab frames (v0/<i>.png) for AI-frame mode and frame-diff masking. Optional in --scroll mode: without it the mask comes from the static art alone (zones ∧ brightness ∧ despeckle) — no generation involved.")
    parser.add_argument("--rect", required=True, help="X,Y,W,H crop in scene pixels")
    parser.add_argument("--scene", required=True, type=Path, help="Fetched active scene image")
    parser.add_argument("--out-dir", required=True, type=Path, help="Temporary candidate output directory")
    parser.add_argument("--out", required=True, help="output sheet name (no extension)")
    parser.add_argument("--zones", default="", help="crop-relative x,y,w,h rects (';'-separated) where motion is allowed")
    parser.add_argument("--skip", default="", help="comma-separated source frame indices to drop (generator fumbles: a frame whose exposure gain is an outlier has usually lost its streak texture — amplifying it doesn't help, dropping it does)")
    parser.add_argument("--scroll", type=int, default=0, metavar="S", help="SEAMLESS-BY-CONSTRUCTION mode: ignore generated frame content and bake N frames that cyclically scroll the STATIC art's own masked water pixels downward S px/frame (per-column runs, period a divisor of S*N — so frame N is bit-identical to frame 0 and the wrap step is the same translation as every other step). Generated frames are still used to derive the motion mask.")
    parser.add_argument("--out-frames", type=int, default=12, help="frame count for --scroll mode (12 = steps(12); divisors of S*12 give per-run periods)")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--edge", type=int, default=6)
    parser.add_argument("--diff", type=int, default=26)
    parser.add_argument("--bright", type=int, default=64)
    args = parser.parse_args()
    output_dir = args.out_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    x0, y0, w, h = (int(v) for v in args.rect.split(","))
    static = Image.open(args.scene).convert("RGBA").crop((x0, y0, x0 + w, y0 + h))

    skip = {int(v) for v in args.skip.split(",") if v}
    frames: list[Image.Image] = []
    if args.run_dir is None:
        if not args.scroll:
            sys.exit("run_dir is required unless --scroll is set (only scroll mode can mask from static art alone)")
    else:
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
    if args.scroll:
        bake_scroll(static, mask, w, h, args.scroll, args.out_frames, output_dir / f"{args.out}.png")
        return
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

    out_path = output_dir / f"{args.out}.png"
    sheet.save(out_path, optimize=True)
    print(f"{out_path.name}: {sheet.size[0]}x{sheet.size[1]}, moved-vs-static per frame: {' '.join(report)}")


if __name__ == "__main__":
    main()
