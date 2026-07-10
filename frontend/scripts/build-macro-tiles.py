#!/usr/bin/env python3
"""Bake top-down material art into opaque multi-cell isometric terrain tiles.

Source art owns texture only. This script owns the board geometry, crops sources to the
footprint aspect ratio, ties each source to its production terrain palette, projects it into
the canonical 96x54 cell plane, and seals every pixel in the owned top footprint. A macrotile
replaces its covered 1x1 tops at runtime, so transparency inside the footprint is invalid.
"""
from __future__ import annotations

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'packages' / 'board-render' / 'src' / 'art' / 'macroTiles.json'
SOURCE_DIR = ROOT / 'docs' / 'art' / 'pixellab-runs' / 'macro-tiles'
OUTPUT_DIR = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'macro-tiles'
SURFACE_DIR = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'surface'

STEP_X = 48
STEP_Y = 27
CELL_WIDTH = STEP_X * 2
CELL_HEIGHT = STEP_Y * 2
REFERENCE_APEX = (48, 41)
REFERENCE_RIGHT = (96, 68)
REFERENCE_FRONT = (48, 95)
REFERENCE_LEFT = (0, 68)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('ids', nargs='*', help='Optional macrotile ids; defaults to every manifest asset.')
    parser.add_argument('--check', action='store_true', help='Validate inputs and geometry without writing outputs.')
    return parser.parse_args()


def load_assets(ids: list[str]) -> list[dict]:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    footprints = manifest.get('footprints', [])
    assets = []
    for family in manifest.get('families', []):
        family_id = family['id']
        for footprint in footprints:
            columns = int(footprint['columns'])
            rows = int(footprint['rows'])
            for variant in family.get('variants', []):
                tile_id = f"{family_id}-{variant['id']}-{columns}x{rows}"
                assets.append({
                    'id': tile_id,
                    'family': family_id,
                    'columns': columns,
                    'rows': rows,
                    'source': variant['source'],
                    'paletteMatch': family.get('paletteMatch', 0.8),
                })
    assets.extend(manifest.get('extras', []))
    asset_ids = [asset.get('id') for asset in assets]
    if len(asset_ids) != len(set(asset_ids)):
        raise SystemExit('Macrotile manifest expands to duplicate asset ids.')
    if ids:
        wanted = set(ids)
        assets = [asset for asset in assets if asset.get('id') in wanted]
        missing = wanted - {asset.get('id') for asset in assets}
        if missing:
            raise SystemExit(f'Unknown macrotile ids: {", ".join(sorted(missing))}')
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


@lru_cache(maxsize=None)
def production_palette(family: str) -> np.ndarray:
    reference_paths = sorted(SURFACE_DIR.glob(f'{family}-[0-9]-top.png'))
    if not reference_paths:
        raise SystemExit(f'{family}: no production top tiles found for palette matching.')
    mask = Image.new('L', (CELL_WIDTH, 180), 0)
    ImageDraw.Draw(mask).polygon(
        [REFERENCE_APEX, REFERENCE_RIGHT, REFERENCE_FRONT, REFERENCE_LEFT],
        fill=255,
    )
    inside = np.array(mask) > 0
    samples = []
    for path in reference_paths:
        with Image.open(path) as reference_image:
            reference = np.array(reference_image.convert('RGBA'))
        if reference.shape[:2] != inside.shape:
            raise SystemExit(f'{path.relative_to(ROOT)}: unexpected production tile dimensions.')
        samples.append(reference[:, :, :3][inside & (reference[:, :, 3] > 0)])
    return np.concatenate(samples, axis=0)


def tie_to_production_palette(source: Image.Image, family: str, strength: float) -> Image.Image:
    if strength <= 0:
        return source
    if strength > 1:
        raise SystemExit(f'{family}: paletteMatch must be between 0 and 1.')
    arr = np.array(source).copy()
    opaque = arr[:, :, 3] > 0
    source_median = np.median(arr[:, :, :3][opaque], axis=0)
    reference_median = np.median(production_palette(family), axis=0)
    shift = (reference_median - source_median) * strength
    arr[:, :, :3] = np.clip(arr[:, :, :3].astype(np.float32) + shift, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def macro_tile_mask(columns: int, rows: int) -> Image.Image:
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
    mask = macro_tile_mask(columns, rows)
    output = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    output.paste(transformed, (0, 0), mask)
    return seal_mask(output, mask)


def validate_owned_top(image: Image.Image, columns: int, rows: int, tile_id: str) -> Image.Image:
    alpha = np.array(image)[:, :, 3]
    inside = np.array(macro_tile_mask(columns, rows)) > 0
    missing = inside & (alpha != 255)
    spill = ~inside & (alpha != 0)
    if missing.any() or spill.any():
        raise SystemExit(
            f'{tile_id}: invalid owned top ({int(missing.sum())} non-opaque interior pixels, '
            f'{int(spill.sum())} exterior pixels).'
        )
    return image


def main() -> None:
    args = parse_args()
    assets = load_assets(args.ids)
    if not assets:
        raise SystemExit('No macrotile assets selected.')
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for asset in assets:
        tile_id = asset['id']
        columns = int(asset['columns'])
        rows = int(asset['rows'])
        palette_match = float(asset.get('paletteMatch', 0.8))
        if columns < 2 or rows < 2:
            raise SystemExit(f'{tile_id}: macrotiles must span at least 2x2 cells.')
        source_path = SOURCE_DIR / f"{asset.get('source', tile_id)}.png"
        if not source_path.exists():
            raise SystemExit(f'{tile_id}: missing source {source_path.relative_to(ROOT)}')
        with Image.open(source_path) as source_image:
            cropped = crop_to_footprint(source_image, columns, rows)
            palette_tied = tie_to_production_palette(cropped, asset['family'], palette_match)
            baked = validate_owned_top(project(palette_tied, columns, rows), columns, rows, tile_id)
        expected = ((columns + rows) * STEP_X, (columns + rows) * STEP_Y)
        if baked.size != expected:
            raise SystemExit(f'{tile_id}: expected {expected}, got {baked.size}')
        output_path = OUTPUT_DIR / f'{tile_id}.png'
        if args.check:
            if not output_path.exists():
                raise SystemExit(f'{tile_id}: missing committed output {output_path.relative_to(ROOT)}')
            with Image.open(output_path) as committed_image:
                committed = committed_image.convert('RGBA')
            if committed.size != baked.size or not np.array_equal(np.array(committed), np.array(baked)):
                raise SystemExit(f'{tile_id}: committed output is stale; run npm run assets:build:macro-tiles')
        else:
            baked.save(output_path, optimize=True)
        mode = 'checked' if args.check else 'wrote'
        print(f'{mode} {output_path.relative_to(ROOT)} ({baked.width}x{baked.height})')


if __name__ == '__main__':
    main()
