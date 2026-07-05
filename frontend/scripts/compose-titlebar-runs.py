#!/usr/bin/env python
"""Compose the title-bar rule TILESET from forged atoms (ADR-0063).

The two runs share ONE rivet atom, used UPRIGHT (never rotated), so the horizontal band and the
vertical wall carry identical rivets — while each run's STRAP is the iron lit for its orientation
(horizontal ledge = bright top edge; vertical wall = symmetric left-right). That is how the kit is
consistent AND orientation-correctly lit at once. The square joint gets the same rivet on its
corners, so every rivet in the bar is the same object.

The atoms are forged by scripts/forge-titlebar-wall.mjs (codex img2img, method-verified against
the rollout, chroma-keyed + low-fi — ADR-0011/0013/0014). THIS step is pure image assembly
(atom-assembly, ADR-0012); it draws nothing.

    python scripts/compose-titlebar-runs.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

TB = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'ui' / 'titlebar'
PITCH, THICK, RIVET = 16, 14, 12   # rivet spacing, rule thickness, run-rivet diameter
SQ, RSQ, INSET = 30, 8, 3          # square size, corner-rivet diameter, corner inset

def load(name):
    return Image.open(TB / name).convert('RGBA')

def rivet(diameter):
    return load('atom-rivet.png').resize((diameter, diameter), Image.LANCZOS)

def seam(im, axis, P):
    """Offset of the least-visible tiling seam along `axis` for period P (min wrap diff)."""
    a = np.asarray(im).astype(float)
    n = a.shape[axis]
    key = (lambda i: np.abs(a[:, i, :] - a[:, i + P, :]).mean()) if axis == 1 \
        else (lambda i: np.abs(a[i, :, :] - a[i + P, :, :]).mean())
    return min(range(0, n - P), key=key)

# E-W run: horizontal LEDGE strap + shared rivet, tiles x -> band-forged.png
sh = load('atom-strap-h.png')
sh = sh.resize((round(sh.width * THICK / sh.height), THICK), Image.LANCZOS)
ew = sh.crop((seam(sh, 1, PITCH), 0, seam(sh, 1, PITCH) + PITCH, THICK))
ew.alpha_composite(rivet(RIVET), ((PITCH - RIVET) // 2, (THICK - RIVET) // 2))
ew.save(TB / 'band-forged.png')

# N-S run: symmetric vertical strap + the SAME rivet, tiles y -> rail-forged.png
sv = load('atom-strap-v.png')
sv = sv.resize((THICK, round(sv.height * THICK / sv.width)), Image.LANCZOS)
ns = sv.crop((0, seam(sv, 0, PITCH), THICK, seam(sv, 0, PITCH) + PITCH))
ns.alpha_composite(rivet(RIVET), ((THICK - RIVET) // 2, (PITCH - RIVET) // 2))
ns.save(TB / 'rail-forged.png')

# Square intersection joint: plain plate + the SAME rivet on each corner -> joint-square-forged.png
plate = load('atom-square-plate.png').resize((SQ, SQ), Image.LANCZOS)
rr = rivet(RSQ)
for cx, cy in [(INSET, INSET), (SQ - INSET - RSQ, INSET), (INSET, SQ - INSET - RSQ), (SQ - INSET - RSQ, SQ - INSET - RSQ)]:
    plate.alpha_composite(rr, (cx, cy))
plate.save(TB / 'joint-square-forged.png')

print('composed  band-forged', ew.size, ' rail-forged', ns.size, ' joint-square-forged', plate.size)
