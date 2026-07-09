#!/usr/bin/env python3
"""Bake top-down material art into exact multi-cell isometric surface patches.

Source art owns texture only. This script owns the board geometry, crops sources to the
footprint aspect ratio, projects them into the canonical 96x54 cell plane, seals projection
holes, and applies a pixel-art dither apron where the patch blends into the 1x1 terrain bed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'packages' / 'board-render' / 'src' / 'art' / 'surfacePatches.json'
SOURCE_DIR = ROOT / 'docs' / 'art' / 'pixellab-runs' / 'surface-patches'
OUTPUT_DIR = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'surface-patches'

STEP_X = 48
STEP_Y = 27
CELL_WIDTH = STEP_X * 2
CELL_HEIGHT = STEP_Y * 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('ids', nargs='*', help='Optional patch ids; defaults to every manifest asset.')
    parser.add_argument('--check', action='store_true', help='Validate inputs and geometry without writing outputs.')
    return parser.parse_args()


def load_assets(ids: list[str]) -> list[dict]:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assets = manifest.get('assets', [])
    if ids:
        wanted = set(ids)
        assets = [asset for asset in assets if asset.get('id') in wanted]
        missing = wanted - {asset.get('id') for asset in assets}
        if missing:
            raise SystemExit(f'Unknown surface patch ids: {", ".join(sorted(missing))}')
    return assets


def crop_to_footprint(source: Image.Image, columns: int, rows: int) -> Image.Image:
    image = source.convert('RGBA')
    source_ratio = image.width / image.height
    target_ratio = columns / rows
    if source_ratio > target_ratio:
        width = max(1, round(image.height * target_ratio))
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif source_ratio < target_ratio:
        height = max(1, round(image.width / target_ratio))
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    alpha = np.array(image)[:, :, 3]
    if np.any(alpha != 255):
        raise SystemExit('Source crop must be fully opaque; transparent shape art is not a surface texture.')
    return image


def patch_mask(columns: int, rows: int) -> Image.Image:
    width = (columns + rows) * STEP_X
    height = (columns + rows) * STEP_Y
    points = [
        (rows * STEP_X, 0),
        ((rows + columns) * STEP_X, columns * STEP_Y),
        (columns * STEP_X, (columns + rows) * STEP_Y),
        (0, rows * STEP_Y),
    ]
    mask = Image.new('L', (width, height), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def seal_mask(projected: Image.Image, mask: Image.Image) -> Image.Image:
    arr = np.array(projected).copy()
    inside = np.array(mask) > 0
    remaining = inside & (arr[:, :, 3] == 0)
    for _ in range(arr.shape[0] + arr.shape[1]):
        if not remaining.any():
            break
        previous = arr.copy()
        next_remaining = remaining.copy()
        changed = False
        ys, xs = np.where(remaining)
        for y, x in zip(ys, xs):
            samples = []
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= arr.shape[0]:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if (dx == 0 and dy == 0) or nx < 0 or nx >= arr.shape[1]:
                        continue
                    if inside[ny, nx] and previous[ny, nx, 3] > 0:
                        samples.append(previous[ny, nx, :3])
            if samples:
                arr[y, x, :3] = np.rint(np.mean(samples, axis=0)).astype(np.uint8)
                arr[y, x, 3] = 255
                next_remaining[y, x] = False
                changed = True
        remaining = next_remaining
        if not changed:
            break
    if remaining.any():
        raise SystemExit(f'Projection left {int(remaining.sum())} unresolved footprint pixels.')
    return Image.fromarray(arr, 'RGBA')


def project(source: Image.Image, columns: int, rows: int) -> Image.Image:
    width = (columns + rows) * STEP_X
    height = (columns + rows) * STEP_Y
    sx = (source.width - 1) / columns
    sy = (source.height - 1) / rows
    coefficients = (
        sx / CELL_WIDTH,
        sx / CELL_HEIGHT,
        -sx * rows / 2,
        -sy / CELL_WIDTH,
        sy / CELL_HEIGHT,
        sy * rows / 2,
    )
    transformed = source.transform((width, height), Image.AFFINE, coefficients, resample=Image.NEAREST)
    mask = patch_mask(columns, rows)
    output = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    output.paste(transformed, (0, 0), mask)
    return seal_mask(output, mask)


def apply_edge_blend(image: Image.Image, columns: int, rows: int, blend_cells: float) -> Image.Image:
    if blend_cells <= 0:
        return image
    arr = np.array(image).copy()
    for y in range(arr.shape[0]):
        for x in range(arr.shape[1]):
            if arr[y, x, 3] == 0:
                continue
            # Invert the isometric projection at the pixel centre. u/v are source-plane
            # coordinates measured in board cells, so the apron has the same physical width
            # on every footprint shape.
            u = ((x + 0.5) - rows * STEP_X) / CELL_WIDTH + (y + 0.5) / CELL_HEIGHT
            v = -((x + 0.5) - rows * STEP_X) / CELL_WIDTH + (y + 0.5) / CELL_HEIGHT
            edge = min(u, v, columns - u, rows - v)
            coverage = max(0.0, min(1.0, edge / blend_cells))
            coverage = coverage * coverage * (3.0 - 2.0 * coverage)
            # Keep the transition pixel-art legible: sixteen stable opacity steps avoid a
            # blurry filter while blending much more quietly than binary stipple.
            arr[y, x, 3] = round(round(coverage * 15.0) * 255.0 / 15.0)
    return Image.fromarray(arr, 'RGBA')


def main() -> None:
    args = parse_args()
    assets = load_assets(args.ids)
    if not assets:
        raise SystemExit('No surface patch assets selected.')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for asset in assets:
        patch_id = asset['id']
        columns = int(asset['columns'])
        rows = int(asset['rows'])
        edge_blend_cells = float(asset.get('edgeBlendCells', 0.65))
        if columns < 2 or rows < 2:
            raise SystemExit(f'{patch_id}: surface patches must span at least 2x2 cells.')
        source_path = SOURCE_DIR / f'{patch_id}.png'
        if not source_path.exists():
            raise SystemExit(f'{patch_id}: missing source {source_path.relative_to(ROOT)}')
        with Image.open(source_path) as source_image:
            cropped = crop_to_footprint(source_image, columns, rows)
            baked = apply_edge_blend(project(cropped, columns, rows), columns, rows, edge_blend_cells)
        expected = ((columns + rows) * STEP_X, (columns + rows) * STEP_Y)
        if baked.size != expected:
            raise SystemExit(f'{patch_id}: expected {expected}, got {baked.size}')
        output_path = OUTPUT_DIR / f'{patch_id}.png'
        if args.check:
            if not output_path.exists():
                raise SystemExit(f'{patch_id}: missing committed output {output_path.relative_to(ROOT)}')
            with Image.open(output_path) as committed_image:
                committed = committed_image.convert('RGBA')
            if committed.size != baked.size or not np.array_equal(np.array(committed), np.array(baked)):
                raise SystemExit(f'{patch_id}: committed output is stale; run npm run assets:build:surface-patches')
        else:
            baked.save(output_path, optimize=True)
        mode = 'checked' if args.check else 'wrote'
        print(f'{mode} {output_path.relative_to(ROOT)} ({baked.width}x{baked.height})')


if __name__ == '__main__':
    main()
