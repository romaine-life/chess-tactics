#!/usr/bin/env python3
"""Build the rich, VARIED cliff edge tiles (ADR-0039 side layer).

Per family, produces V edge variants — each a distinct rich cliff material projected onto
the frayed silhouette (so a long board edge is rich AND non-repeating):
  <fam>-edge-<v>.png        combined tile (rich side + the family's base top) — for the catalog
  <fam>-edge-<v>-side.png   the rich side layer the board actually composes (ADR-0039)
  <fam>-edge-<v>-top.png    the family base top (board keeps the cell's own top; here for parity)

Variants come from the 2 codex material slabs + a mirror = 3 distinct faces. The frayed
silhouette (alpha of <fam>-edge-side.png) is shared per family for now; only the alpha is
used as the mask, so the rich material fills the exact torn shape.
"""
import os
import importlib.util
import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
FAMILIES = ['grass', 'dirt', 'stone', 'sand', 'pebble']

# import rich_side() from the hyphenated module
_spec = importlib.util.spec_from_file_location('pts', os.path.join(HERE, 'project-tile-side.py'))
pts = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(pts)


def build(fam, surface_dir, material_dir, output_dir):
    mask = np.array(Image.open(surface_dir / f'{fam}-edge-side.png').convert('RGBA'))
    base_top = Image.open(surface_dir / f'{fam}-0-top.png').convert('RGBA')
    slab0 = Image.open(material_dir / f'{fam}-side-slab-0.png').convert('RGBA')
    slab1 = Image.open(material_dir / f'{fam}-side-slab-1.png').convert('RGBA')
    materials = [slab0, slab1, ImageOps.mirror(slab0)]  # 3 distinct faces
    for v, mat in enumerate(materials):
        side_img = Image.fromarray(pts.rich_side(mat, mask), 'RGBA')
        side_img.save(output_dir / f'{fam}-edge-{v}-side.png')
        base_top.save(output_dir / f'{fam}-edge-{v}-top.png')
        comb = Image.new('RGBA', (96, 180), (0, 0, 0, 0))
        comb.alpha_composite(side_img)   # side under
        comb.alpha_composite(base_top)   # top over
        comb.save(output_dir / f'{fam}-edge-{v}.png')
    print(f'{fam}: wrote {len(materials)} edge variants')


def main():
    parser = argparse.ArgumentParser(description='Project rich edge candidates in a temporary workspace.')
    parser.add_argument('--surface-dir', required=True, type=Path)
    parser.add_argument('--material-dir', required=True, type=Path)
    parser.add_argument('--out-dir', required=True, type=Path, help='Upload outputs with live-media-admin-client.mjs')
    parser.add_argument('families', nargs='*', default=FAMILIES)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for family in args.families:
        build(family, args.surface_dir, args.material_dir, args.out_dir)


if __name__ == '__main__':
    main()
