#!/usr/bin/env python3
"""Build the rich, varied runtime cliff SIDE layers.

Per family, produces V edge variants — each a distinct rich cliff material projected onto
the frayed silhouette (so a long board edge is rich AND non-repeating):
  <fam>-edge-<v>-side.png   the rich side layer the board actually composes (ADR-0075)

Variants come from the 2 codex material slabs + a mirror = 3 distinct faces. The frayed
silhouette comes from docs/art/tile-concepts/edge-masks; only its alpha is used. No top or
combined compatibility artifact is emitted.
"""
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SURF = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'surface'
EXPLORE = ROOT / 'frontend' / 'public' / 'assets' / 'tiles' / 'explore'
EDGE_MASKS = ROOT / 'docs' / 'art' / 'tile-concepts' / 'edge-masks'
FAMILIES = ['grass', 'dirt', 'stone', 'sand', 'pebble']

# import rich_side() from the hyphenated module
_spec = importlib.util.spec_from_file_location('pts', HERE / 'project-tile-side.py')
pts = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(pts)


def build(fam):
    mask = np.array(Image.open(EDGE_MASKS / f'{fam}-edge-side.png').convert('RGBA'))
    slab0 = Image.open(EXPLORE / f'{fam}-side-slab-0.png').convert('RGBA')
    slab1 = Image.open(EXPLORE / f'{fam}-side-slab-1.png').convert('RGBA')
    materials = [slab0, slab1, ImageOps.mirror(slab0)]  # 3 distinct faces
    SURF.mkdir(parents=True, exist_ok=True)
    for v, mat in enumerate(materials):
        side_img = Image.fromarray(pts.rich_side(mat, mask), 'RGBA')
        side_img.save(SURF / f'{fam}-edge-{v}-side.png')
    print(f'{fam}: wrote {len(materials)} side-only edge variants')


def main():
    import sys
    for fam in (sys.argv[1:] or FAMILIES):
        build(fam)


if __name__ == '__main__':
    main()
