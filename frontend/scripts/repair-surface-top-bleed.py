#!/usr/bin/env python3
"""Repair committed surface tiles where the edge image bleeds into the top diamond.

Historical surface tiles were composited before build-surface-tiles.py sealed affine
projection misses at the diamond boundary. Those misses leave a few pixels of the
underlying Blender edge visible on the playable top. This migration updates the
already-committed combined and top images without doing a full surface rebuild.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.normpath(os.path.join(HERE, '..', 'public', 'assets', 'tiles'))
SURFACE = os.path.join(TILES, 'surface')
PIXEL = os.path.join(TILES, 'pixel')

W, H = 96, 180
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
FAMILIES = ('grass', 'dirt', 'stone', 'pebble', 'sand', 'water')
VARIANTS = range(8)
EDGE_DISTANCE = 2


def parse_args(argv):
    families = []
    dry_run = False
    for arg in argv:
        if arg == '--dry-run':
            dry_run = True
        elif arg == '--all':
            families = list(FAMILIES)
        elif arg in FAMILIES:
            families.append(arg)
        else:
            raise SystemExit(f'Unknown argument: {arg}')
    if not families:
        raise SystemExit(f'Usage: python scripts/repair-surface-top-bleed.py [--dry-run] (--all|{"|".join(FAMILIES)})')
    return (families, dry_run)


def diamond_mask():
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).polygon([APEX, RIGHT, FRONT, LEFT], fill=255)
    return np.array(mask) > 0


DIA = diamond_mask()


def near_diamond_edge(x, y):
    for dy in range(-EDGE_DISTANCE, EDGE_DISTANCE + 1):
        ny = y + dy
        if ny < 0 or ny >= H:
            return True
        for dx in range(-EDGE_DISTANCE, EDGE_DISTANCE + 1):
            nx = x + dx
            if nx < 0 or nx >= W:
                return True
            if not DIA[ny, nx]:
                return True
    return False


def read_rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def write_rgba(path, arr):
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(path)


def repair_array(arr, edge):
    repaired = arr.copy()
    remaining = np.zeros((H, W), dtype=bool)

    for y in range(H):
        for x in range(W):
            if not DIA[y, x] or not near_diamond_edge(x, y):
                continue
            transparent_hole = arr[y, x, 3] == 0
            edge_bleed = edge[y, x, 3] > 0 and np.array_equal(arr[y, x], edge[y, x])
            if transparent_hole or edge_bleed:
                remaining[y, x] = True

    total = int(remaining.sum())
    if total == 0:
        return repaired, 0, 0

    for _ in range(W + H):
        if not remaining.any():
            break
        next_arr = repaired.copy()
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
                    if nx < 0 or nx >= W:
                        continue
                    if DIA[ny, nx] and not remaining[ny, nx] and repaired[ny, nx, 3] > 0:
                        samples.append(repaired[ny, nx, :3])
            if samples:
                next_arr[y, x, :3] = np.rint(np.mean(samples, axis=0)).astype(np.uint8)
                next_arr[y, x, 3] = 255
                next_remaining[y, x] = False
                changed = True
        repaired = next_arr
        remaining = next_remaining
        if not changed:
            break

    return repaired, total - int(remaining.sum()), int(remaining.sum())


def repair_file(path, edge, dry_run):
    arr = read_rgba(path)
    repaired, fixed, unresolved = repair_array(arr, edge)
    if fixed and not dry_run:
        write_rgba(path, repaired)
    return fixed, unresolved


def main():
    families, dry_run = parse_args(sys.argv[1:])
    total_fixed = 0
    total_unresolved = 0
    touched = 0

    for family in families:
        edge = read_rgba(os.path.join(PIXEL, f'{family}-codexfilter.png'))
        for variant in VARIANTS:
            for suffix in ('', '-top'):
                path = os.path.join(SURFACE, f'{family}-{variant}{suffix}.png')
                fixed, unresolved = repair_file(path, edge, dry_run)
                total_fixed += fixed
                total_unresolved += unresolved
                if fixed:
                    touched += 1
                    print(f'{os.path.basename(path)}: fixed {fixed}, unresolved {unresolved}')

    mode = 'would repair' if dry_run else 'repaired'
    print(f'{mode} {total_fixed} pixels across {touched} files; unresolved {total_unresolved}')
    if total_unresolved:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
