"""Mount the dated fence candidates into 96x180 review-only game frames.

Outputs are served by the Studio's Fences map surface. Blender sources are copied
byte-for-byte. PixelLab sources are only mirrored/translated/padded. Codex sheets
are explicitly downscaled calibration previews and can never be promoted from
this directory.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / "frontend").is_dir())
OUT = ROOT / "frontend" / "public" / "assets" / "tiles" / "feature" / "candidates" / "2026-07-10"
FRAME = (96, 180)


def alpha_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("candidate has no visible subject")
    return rgba.crop(bbox)


def frame(subject: Image.Image, x: int, y: int) -> Image.Image:
    result = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    result.alpha_composite(subject.convert("RGBA"), (x, y))
    return result


def write_pixellab(prefix: str, rail_name: str, post_name: str) -> None:
    source = HERE / "pixellab"
    rail_canvas = Image.open(source / rail_name).convert("RGBA")
    post_canvas = Image.open(source / post_name).convert("RGBA")
    rail_bbox = rail_canvas.getchannel("A").getbbox()
    post_bbox = post_canvas.getchannel("A").getbbox()
    if rail_bbox is None or post_bbox is None:
        raise ValueError(prefix)

    # Seat the native PixelLab rail at the canonical fence baseline. Its short
    # span remains visibly short: translation does not disguise the contract miss.
    e_x = 48 - rail_bbox[0]
    e_y = 96 - rail_bbox[3]
    e_frame = frame(rail_canvas, e_x, e_y)

    mirrored = ImageOps.mirror(rail_canvas)
    mirrored_bbox = mirrored.getchannel("A").getbbox()
    assert mirrored_bbox is not None
    s_x = -mirrored_bbox[0]
    s_y = 96 - mirrored_bbox[3]
    s_frame = frame(mirrored, s_x, s_y)

    # The post canvas remains 32x32. Seat its last visible row at anchor y=68.
    post_x = 48 - 16
    post_y = 69 - post_bbox[3]
    post_frame = frame(post_canvas, post_x, post_y)

    e_frame.save(OUT / f"{prefix}-rail-e.png")
    s_frame.save(OUT / f"{prefix}-rail-s.png")
    post_frame.save(OUT / f"{prefix}-post.png")


def fit(subject: Image.Image, max_width: int, max_height: int) -> Image.Image:
    ratio = min(max_width / subject.width, max_height / subject.height)
    return subject.resize(
        (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio))),
        Image.Resampling.LANCZOS,
    )


def write_codex(prefix: str, sheet_name: str, split_x: int, post_size: tuple[int, int]) -> None:
    sheet = Image.open(HERE / "codex" / sheet_name).convert("RGBA")
    rail = alpha_crop(sheet.crop((0, 0, split_x, sheet.height)))
    post = alpha_crop(sheet.crop((split_x, 0, sheet.width, sheet.height)))

    # ADR-0076 calibration only: these previews deliberately demonstrate the
    # tuned footprint on a map. The manifest forbids promoting their resized pixels.
    rail_preview = fit(rail, 48, 39)
    post_preview = fit(post, *post_size)
    frame(rail_preview, 48, 96 - rail_preview.height).save(OUT / f"{prefix}-rail-e.png")
    frame(ImageOps.mirror(rail_preview), 0, 96 - rail_preview.height).save(OUT / f"{prefix}-rail-s.png")
    frame(post_preview, 48 - post_preview.width // 2, 69 - post_preview.height).save(OUT / f"{prefix}-post.png")


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    blender = HERE / "blender-stone"
    shutil.copy2(blender / "stone-rail-e-native-96x180.png", OUT / "blender-stone-rail-e.png")
    shutil.copy2(blender / "stone-rail-s-native-96x180.png", OUT / "blender-stone-rail-s.png")
    shutil.copy2(blender / "stone-terminal-post-native-96x180.png", OUT / "blender-stone-post.png")

    write_pixellab("pixellab-wood", "wood-rail-48x32.png", "wood-post-32x32.png")
    write_pixellab("pixellab-stone", "stone-rail-48x32-v2.png", "stone-post-32x32.png")
    write_codex("codex-wood", "wood-kit-alpha.png", 1100, (10, 28))
    write_codex("codex-stone", "stone-kit-alpha.png", 1050, (18, 24))
    print(OUT)


if __name__ == "__main__":
    build()
