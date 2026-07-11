"""Build the 2026-07-10 fence candidate review sheet.

The sheet is documentation, not a runtime-art bake. Native assets are shown both
at 1x and enlarged with nearest-neighbour sampling for pixel inspection. Codex
concept sheets are reduced only inside this explicitly non-production proof.
Source candidate files are never rewritten.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
OUT = HERE / "fence-native-candidate-contact-sheet.png"
WIDTH = 1800
HEIGHT = 1060

BG = "#0b1118"
PANEL = "#121b25"
BORDER = "#2a3a4b"
TEXT = "#e7edf3"
MUTED = "#93a5b7"
PASS = "#58d68d"
MISS = "#f3b35b"
CAL = "#72b7ff"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


TITLE = font(34, True)
PANEL_TITLE = font(22, True)
BODY = font(17)
SMALL = font(14)
SMALL_BOLD = font(14, True)


def alpha_composite_at(base: Image.Image, art: Image.Image, xy: tuple[int, int]) -> None:
    base.alpha_composite(art.convert("RGBA"), dest=xy)


def crop_subject(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"no opaque pixels in {path}")
    return image.crop(bbox)


def nearest(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str, status: str, color: str) -> None:
    draw.rounded_rectangle(box, radius=18, fill=PANEL, outline=BORDER, width=2)
    x1, y1, _, _ = box
    draw.text((x1 + 22, y1 + 18), title, fill=TEXT, font=PANEL_TITLE)
    status_width = draw.textbbox((0, 0), status, font=SMALL_BOLD)[2]
    draw.text((box[2] - status_width - 22, y1 + 23), status, fill=color, font=SMALL_BOLD)


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, color: str = MUTED, bold: bool = False) -> None:
    draw.text(xy, text, fill=color, font=SMALL_BOLD if bold else SMALL)


def build() -> None:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((40, 26), "Fence art candidate bake-off — actual native pixels preserved", fill=TEXT, font=TITLE)
    draw.text(
        (42, 69),
        "Blender and PixelLab outputs are untouched sources. Enlarged views use nearest-neighbour only for this proof; Codex remains calibration-only.",
        fill=MUTED,
        font=BODY,
    )

    blender_box = (40, 112, 600, 548)
    wood_box = (620, 112, 1180, 548)
    stone_box = (1200, 112, 1760, 548)
    codex_wood_box = (40, 570, 890, 982)
    codex_stone_box = (910, 570, 1760, 982)

    panel(draw, blender_box, "Blender · stone", "NATIVE PASS", PASS)
    blender = HERE / "blender-stone"
    e_path = blender / "stone-rail-e-native-96x180.png"
    s_path = blender / "stone-rail-s-native-96x180.png"
    p_path = blender / "stone-terminal-post-native-96x180.png"
    e_crop = nearest(crop_subject(e_path), 4)
    s_crop = nearest(crop_subject(s_path), 4)
    p_crop = nearest(crop_subject(p_path), 5)
    alpha_composite_at(canvas, e_crop, (62, 178))
    alpha_composite_at(canvas, s_crop, (268, 178))
    alpha_composite_at(canvas, p_crop, (486, 190))
    label(draw, (62, 340), "E 48×39", PASS, True)
    label(draw, (268, 340), "S 48×39", PASS, True)
    label(draw, (486, 316), "post 18×24", PASS, True)
    label(draw, (62, 374), "Original 96×180 frames at actual 1×:")
    for index, path in enumerate((e_path, s_path, p_path)):
        alpha_composite_at(canvas, Image.open(path).convert("RGBA"), (80 + index * 150, 360))

    panel(draw, wood_box, "PixelLab · wood", "NATIVE MISSES", MISS)
    pixellab = HERE / "pixellab"
    wood_rail = Image.open(pixellab / "wood-rail-48x32.png").convert("RGBA")
    wood_post = Image.open(pixellab / "wood-post-32x32.png").convert("RGBA")
    alpha_composite_at(canvas, nearest(wood_rail, 7), (650, 180))
    alpha_composite_at(canvas, nearest(wood_post, 7), (995, 180))
    label(draw, (650, 414), "rail v1 bbox 40×25 — target span missed", MISS, True)
    label(draw, (995, 414), "post v1 12×28 — 2 px too wide", MISS, True)
    label(draw, (650, 447), "Actual 1×:")
    alpha_composite_at(canvas, wood_rail, (735, 444))
    alpha_composite_at(canvas, wood_post, (805, 444))
    label(draw, (650, 492), "v2s retained in the archive; neither improved contract fit.")

    panel(draw, stone_box, "PixelLab · stone", "POST PASS / RAIL MISS", MISS)
    stone_rail = Image.open(pixellab / "stone-rail-48x32-v2.png").convert("RGBA")
    stone_post = Image.open(pixellab / "stone-post-32x32.png").convert("RGBA")
    alpha_composite_at(canvas, nearest(stone_rail, 7), (1230, 180))
    alpha_composite_at(canvas, nearest(stone_post, 7), (1575, 180))
    label(draw, (1230, 414), "rail v2 bbox 42×26 — span still short", MISS, True)
    label(draw, (1575, 414), "post 18×24 — exact", PASS, True)
    label(draw, (1230, 447), "Actual 1×:")
    alpha_composite_at(canvas, stone_rail, (1315, 444))
    alpha_composite_at(canvas, stone_post, (1385, 444))
    label(draw, (1230, 492), "No resize correction: failed rail remains a candidate, not production.")

    panel(draw, codex_wood_box, "Codex · wood kit", "CALIBRATION ONLY", CAL)
    codex = HERE / "codex"
    wood_concept = contain(Image.open(codex / "wood-kit-alpha.png").convert("RGBA"), (790, 275))
    alpha_composite_at(canvas, wood_concept, (70, 635))
    label(draw, (68, 918), "1536×1024 concept sheet · target brief: rail 48 px / 16 px feature height; post 10×28", CAL, True)
    label(draw, (68, 947), "Must be regenerated through a native PixelLab or Blender lane before promotion.")

    panel(draw, codex_stone_box, "Codex · stone kit", "CALIBRATION ONLY", CAL)
    stone_concept = contain(Image.open(codex / "stone-kit-alpha.png").convert("RGBA"), (790, 275))
    alpha_composite_at(canvas, stone_concept, (940, 635))
    label(draw, (938, 918), "1774×887 concept sheet · target brief: rail 48 px / 14 px feature height; post 18×24", CAL, True)
    label(draw, (938, 947), "Design reference only; its large pixels are never resized into accepted runtime art.")

    draw.line((40, 1007, 1760, 1007), fill=BORDER, width=1)
    draw.text((40, 1021), "Green = mechanically native candidate · amber = native generation that missed the footprint · blue = labeled calibration reference", fill=MUTED, font=SMALL)
    canvas.convert("RGB").save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    build()
