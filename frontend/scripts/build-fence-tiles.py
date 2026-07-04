"""Bake placeholder EDGE-FENCE sprites: a low rail standing on a tile's E (SE) and/or S (SW)
diamond side. Each cell draws only its OWN E/S edges (see featureAutotile.resolveFenceOverlays),
so the baked masks are 2 (E), 4 (S) and 6 (E+S). The frame is the same 96x180 geometry as the
road/river feature tiles (diamond apex y41, equator y68), so the sprite seats over the tile with
no offset. Two materials: wood (picket) and stone (low wall).

This is deliberately SIMPLE placeholder art — a richer, art-directed rail is a separate ticket.
Run: python build-fence-tiles.py   (writes into ../public/assets/tiles/feature/)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "assets", "tiles", "feature")
W, H = 96, 180
# Contact-diamond vertices in the frame (must match projectionContract / build-feature-tiles.py).
APEX, RIGHT, FRONT, LEFT = (48, 41), (96, 68), (48, 95), (0, 68)
RAIL_H = 16  # fence height above the tile edge, in px (projects straight up on screen = -y)

# edge bit -> the two diamond-side endpoints the fence stands on (the shared tile boundary).
EDGES = {
    2: (RIGHT, FRONT),  # E / SE (lower-right)
    4: (FRONT, LEFT),   # S / SW (lower-left)
}
PALETTES = {
    "wood":  {"post": (122, 84, 46), "rail": (152, 106, 60), "cap": (198, 152, 98), "dark": (70, 46, 22)},
    "stone": {"post": (104, 106, 112), "rail": (124, 126, 132), "cap": (166, 168, 176), "dark": (58, 60, 66)},
}


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def up(p):
    return (p[0], p[1] - RAIL_H)


def draw_edge(d, p0, p1, pal, material):
    if material == "stone":
        # A solid low wall: the quad between the edge and its raised copy, capped bright + based dark.
        d.polygon([p0, p1, up(p1), up(p0)], fill=pal["rail"] + (255,))
        d.line([up(p0), up(p1)], fill=pal["cap"] + (255,), width=3)
        d.line([p0, p1], fill=pal["dark"] + (255,), width=2)
    else:
        # A wooden picket: vertical posts + a top and mid rail.
        n = 5
        for i in range(n + 1):
            base = lerp(p0, p1, i / n)
            d.line([base, up(base)], fill=pal["post"] + (255,), width=3)
        mid0 = (p0[0], p0[1] - RAIL_H * 0.45)
        mid1 = (p1[0], p1[1] - RAIL_H * 0.45)
        d.line([up(p0), up(p1)], fill=pal["cap"] + (255,), width=3)
        d.line([mid0, mid1], fill=pal["rail"] + (255,), width=3)
        d.line([p0, p1], fill=pal["dark"] + (255,), width=1)


def bake(material, mask):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pal = PALETTES[material]
    # Draw S (back-left) before E (front-right) so overlaps read front-correct at the FRONT vertex.
    for bit in (4, 2):
        if mask & bit:
            draw_edge(d, *EDGES[bit], pal, material)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for material in PALETTES:
        for mask in (2, 4, 6):
            bake(material, mask).save(os.path.join(OUT, f"fence-{material}-{mask}.png"))
        # Square preview icon: crop the E+S frame to content, centre it on a padded square.
        full = bake(material, 6)
        crop = full.crop(full.getbbox())
        s = max(crop.size) + 8
        thumb = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        thumb.paste(crop, ((s - crop.width) // 2, (s - crop.height) // 2))
        thumb.save(os.path.join(OUT, f"fence-{material}-thumb.png"))
    print("baked fence tiles ->", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
