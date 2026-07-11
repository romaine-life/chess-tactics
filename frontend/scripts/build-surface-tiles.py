#!/usr/bin/env python3
"""Build the production TOP and SIDE terrain layers from committed sources.

Each terrain variant is emitted directly as two independent 96x180 frames:

  public/assets/tiles/surface/<family>-<variant>-top.png
  public/assets/tiles/surface/<family>-<variant>-side.png

No combined tile is produced. Flat PixelLab material sources own the top pixels;
the family side template owns the side pixels. The two layers are alpha-disjoint
and the board draws SIDE first, then TOP.

This migration is deliberately pixel-preserving. The accepted grass tops include
the later boundary sealing pass; the other five families retain their accepted
unsealed projection. Changing that curation is an art change, not pipeline cleanup.
Use ``--check`` to compare a rebuild with the committed runtime layers. A mismatch
is refused by default; ``--accept-art-change`` is the explicit review escape hatch.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "docs" / "art" / "pixellab-runs" / "surfaces"
SIDE_TEMPLATES = ROOT / "docs" / "art" / "tile-concepts" / "side-templates"
TOP_UNDERLAYS = ROOT / "docs" / "art" / "tile-concepts" / "top-underlays"
OUT = ROOT / "frontend" / "public" / "assets" / "tiles" / "surface"

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)

# Which raw pool index (tile_<i>.png) becomes production variant 0..7, per family.
# Curated by eye from the 16-variation pools. The owner is the judge of this map.
CURATION_MAP = {
    "grass": [0, 1, 2, 3, 5, 6, 8, 9],
    "dirt": [0, 3, 5, 6, 10, 11, 12, 13],
    "stone": [0, 1, 2, 3, 8, 9, 10, 11],
    "pebble": [0, 1, 2, 4, 5, 8, 9, 13],
    "sand": [0, 1, 4, 6, 7, 8, 10, 13],
    "water": [4, 5, 6, 7, 12, 13, 14, 15],
}

# Commit #455 sealed grass's affine boundary misses but intentionally did not
# regenerate the other accepted families. Keep that reviewed state explicit so a
# structural rebuild cannot silently normalize (and therefore change) their art.
SEALED_TOP_FAMILIES = frozenset({"grass"})

def diamond_mask() -> np.ndarray:
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return np.array(mask) > 0


DIA = diamond_mask()


def seal_projected_top(top: Image.Image) -> Image.Image:
    """Fill affine boundary misses from neighbouring generated top pixels."""
    arr = np.array(top).copy()
    remaining = DIA & (arr[:, :, 3] == 0)
    for _ in range(W + H):
        if not remaining.any():
            break
        next_arr = arr.copy()
        next_remaining = remaining.copy()
        changed = False
        ys, xs = np.where(remaining)
        for y, x in zip(ys, xs):
            samples = []
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= H:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if dx == 0 and dy == 0:
                        continue
                    if 0 <= nx < W and DIA[ny, nx] and arr[ny, nx, 3] > 0:
                        samples.append(arr[ny, nx, :3])
            if samples:
                next_arr[y, x, :3] = np.rint(np.mean(samples, axis=0)).astype(np.uint8)
                next_arr[y, x, 3] = 255
                next_remaining[y, x] = False
                changed = True
        arr = next_arr
        remaining = next_remaining
        if not changed:
            break
    if remaining.any():
        raise RuntimeError(f"could not seal {int(remaining.sum())} top pixels")
    return Image.fromarray(arr, "RGBA")


def project_into_diamond(surface: Image.Image) -> Image.Image:
    """Project a square top-down surface into the canonical diamond, unsealed."""
    surface = surface.convert("RGBA")
    source_size = surface.size[0]
    dst = np.array([APEX, RIGHT, LEFT], float)
    src = np.array([(0, 0), (source_size, 0), (0, source_size)], float)
    matrix = np.column_stack([dst, np.ones(3)])
    coeffs = (*np.linalg.solve(matrix, src[:, 0]), *np.linalg.solve(matrix, src[:, 1]))
    coeffs = (coeffs[0], coeffs[1], coeffs[2], coeffs[3], coeffs[4], coeffs[5])
    projected = surface.transform((W, H), Image.AFFINE, coeffs, resample=Image.NEAREST)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(projected, (0, 0), Image.fromarray((DIA * 255).astype(np.uint8)))
    return out


def load_base_sources(family: str) -> Image.Image:
    """Compose explicit side and top-underlay sources in memory.

    Alpha is the ownership contract. Both sources retain transparent RGB from the
    accepted art so the rebuild is fully deterministic, but the side has no visible
    diamond pixels and the underlay has no visible pixels outside the diamond.
    """
    side_path = SIDE_TEMPLATES / f"{family}-side.png"
    underlay_path = TOP_UNDERLAYS / f"{family}-top-underlay.png"
    side = Image.open(side_path).convert("RGBA")
    underlay = Image.open(underlay_path).convert("RGBA")
    for path, image in ((side_path, side), (underlay_path, underlay)):
        if image.size != (W, H):
            raise ValueError(f"{path} is {image.size}; expected {(W, H)}")

    side_arr = np.array(side)
    underlay_arr = np.array(underlay)
    if np.any(side_arr[DIA, 3] != 0):
        raise ValueError(f"{side_path} owns visible pixels inside the top diamond")
    if np.any(underlay_arr[~DIA, 3] != 0):
        raise ValueError(f"{underlay_path} owns visible pixels outside the top diamond")
    for path, arr in ((side_path, side_arr), (underlay_path, underlay_arr)):
        if not set(np.unique(arr[:, :, 3])).issubset({0, 255}):
            raise ValueError(f"{path} must use hard alpha only")

    frame = side_arr.copy()
    frame[DIA] = underlay_arr[DIA]
    return Image.fromarray(frame, "RGBA")


def build_layers(family: str, raw_path: Path) -> tuple[Image.Image, Image.Image]:
    """Return (top, side) without creating a combined production artifact."""
    underlay = load_base_sources(family)
    underlay_arr = np.array(underlay)
    side_mask = (underlay_arr[:, :, 3] > 20) & ~DIA

    projected = project_into_diamond(Image.open(raw_path))
    projected_arr = np.array(projected)
    material_mask = DIA & (projected_arr[:, :, 3] > 20)
    top_rgb = projected_arr[material_mask][:, :3].mean(0)
    tint = top_rgb / max(top_rgb.max(), 1)

    # Compose only in memory to preserve the accepted transparent RGB and seam
    # pixels. The only files emitted below are explicit top and side layers.
    frame = underlay.copy()
    frame.alpha_composite(projected)
    rgba = np.array(frame).astype(float)
    luma = rgba[side_mask][:, :3] @ np.array([0.299, 0.587, 0.114])
    rgba[side_mask, :3] = np.clip(luma[:, None] * tint[None, :] * 1.04, 0, 255)
    rgba = np.clip(rgba, 0, 255).astype(np.uint8)

    top = rgba.copy()
    top[~DIA, 3] = 0
    if family in SEALED_TOP_FAMILIES:
        sealed = np.array(seal_projected_top(projected))
        top[DIA] = sealed[DIA]

    side = rgba.copy()
    side[DIA, 3] = 0
    return Image.fromarray(top, "RGBA"), Image.fromarray(side, "RGBA")


def pixel_difference(expected: Image.Image, path: Path) -> tuple[int, int] | None:
    if not path.exists():
        return None
    actual = np.array(Image.open(path).convert("RGBA"))
    wanted = np.array(expected)
    if actual.shape != wanted.shape:
        return int(np.prod(wanted.shape)), int(np.abs(np.array(actual.shape) - np.array(wanted.shape)).sum())
    changed = int(np.any(actual != wanted, axis=2).sum())
    delta = int(np.abs(actual.astype(int) - wanted.astype(int)).sum())
    return changed, delta


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare generated pixels with committed layers; write nothing")
    parser.add_argument(
        "--accept-art-change",
        action="store_true",
        help="allow a reviewed pixel change to replace existing runtime layers",
    )
    args = parser.parse_args()
    if args.check and args.accept_art_change:
        parser.error("--check and --accept-art-change are mutually exclusive")
    return args


def main() -> None:
    args = parse_args()
    generated: list[tuple[Path, Image.Image]] = []
    for family, pool in CURATION_MAP.items():
        for variant, source_index in enumerate(pool):
            top, side = build_layers(family, RAW / family / f"tile_{source_index}.png")
            generated.extend(
                [
                    (OUT / f"{family}-{variant}-top.png", top),
                    (OUT / f"{family}-{variant}-side.png", side),
                ]
            )

    mismatches = []
    for path, image in generated:
        diff = pixel_difference(image, path)
        if diff is None:
            mismatches.append(f"MISSING {path.name}")
        elif diff != (0, 0):
            mismatches.append(f"CHANGED {path.name}: {diff[0]} pixels, RGBA delta {diff[1]}")

    if args.check:
        if mismatches:
            print("\n".join(mismatches))
            raise SystemExit(f"pixel regression: {len(mismatches)} layer(s) differ")
        print(f"verified {len(generated)} runtime layers pixel-for-pixel")
        return

    if mismatches and not args.accept_art_change:
        print("\n".join(mismatches))
        raise SystemExit(
            "refusing to rewrite accepted tile art; review the diff, then rerun "
            "with --accept-art-change"
        )

    OUT.mkdir(parents=True, exist_ok=True)
    for path, image in generated:
        image.save(path)
    print(f"wrote {len(generated)} explicit top/side layers to {OUT}")


if __name__ == "__main__":
    main()
