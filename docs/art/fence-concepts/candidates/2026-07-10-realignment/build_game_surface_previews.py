"""Build the second fence-review batch without touching accepted stone-rail pixels.

PixelLab inputs are only mirrored, translated, and transparently padded. Codex
inputs are high-resolution design references and are explicitly resampled into
calibration-only previews; those shown PNGs can never be promoted under ADR-0076.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / "frontend").is_dir())
OUT = (
    ROOT
    / "frontend"
    / "public"
    / "assets"
    / "tiles"
    / "feature"
    / "candidates"
    / "2026-07-10-realignment"
)
FRAME = (96, 180)
PIXELLAB_WOOD_MATERIAL = (
    ROOT / "docs" / "art" / "wall-concepts" / "materials" / "pixellab" / "wood-palisade.png"
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.convert("RGBA").getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("candidate has no visible pixels")
    return bbox


def alpha_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    return rgba.crop(alpha_bbox(rgba))


def frame(subject: Image.Image, x: int, y: int) -> Image.Image:
    result = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    result.alpha_composite(subject.convert("RGBA"), (x, y))
    return result


def component_x_runs(image: Image.Image) -> list[tuple[int, int]]:
    alpha = image.convert("RGBA").getchannel("A")
    occupied = [alpha.crop((x, 0, x + 1, alpha.height)).getbbox() is not None for x in range(alpha.width)]
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for x, visible in enumerate(occupied + [False]):
        if visible and start is None:
            start = x
        elif not visible and start is not None:
            if x - start > 3:
                runs.append((start, x))
            start = None
    return runs


def write_codex(
    prefix: str,
    sheet_name: str,
    rail_size: tuple[int, int],
    post_size: tuple[int, int],
) -> None:
    """Create honest calibration previews from regenerated Codex design sheets."""
    sheet = Image.open(HERE / "codex" / sheet_name).convert("RGBA")
    runs = component_x_runs(sheet)
    if len(runs) != 2:
        raise ValueError(f"expected rail/post components in {sheet_name}, got {runs}")
    rail = alpha_crop(sheet.crop((runs[0][0], 0, runs[0][1], sheet.height)))
    post = alpha_crop(sheet.crop((runs[1][0], 0, runs[1][1], sheet.height)))

    # Calibration only: the deliberate non-uniform rail resize settles the exact
    # 48x27 board pitch for the next native generation brief. Never promote it.
    rail_preview = rail.resize(rail_size, Image.Resampling.LANCZOS)
    post_preview = post.resize(post_size, Image.Resampling.LANCZOS)
    frame(rail_preview, 48, 96 - rail_preview.height).save(OUT / f"{prefix}-rail-e.png")
    frame(ImageOps.mirror(rail_preview), 0, 96 - rail_preview.height).save(OUT / f"{prefix}-rail-s.png")
    frame(post_preview, 48 - post_preview.width // 2, 69 - post_preview.height).save(OUT / f"{prefix}-post.png")


def write_pixellab_rail(prefix: str, source_name: str) -> None:
    """Seat a native PixelLab rail without changing any visible source pixel."""
    rail = Image.open(HERE / "pixellab" / source_name).convert("RGBA")
    bbox = alpha_bbox(rail)
    if bbox[2] - bbox[0] != 48:
        raise ValueError(f"{source_name} must span exactly 48 opaque columns, got {bbox}")
    frame(rail, 48 - bbox[0], 96 - bbox[3]).save(OUT / f"{prefix}-rail-e.png")
    mirrored = ImageOps.mirror(rail)
    mirrored_bbox = alpha_bbox(mirrored)
    frame(mirrored, -mirrored_bbox[0], 96 - mirrored_bbox[3]).save(OUT / f"{prefix}-rail-s.png")


def write_pixellab_post(prefix: str, source_name: str) -> None:
    """Seat a native PixelLab post without scaling it."""
    post = Image.open(HERE / "pixellab" / source_name).convert("RGBA")
    bbox = alpha_bbox(post)
    center_x = (bbox[0] + bbox[2]) // 2
    frame(post, 48 - center_x, 69 - bbox[3]).save(OUT / f"{prefix}-post.png")


def lerp(a: tuple[int, int], b: tuple[int, int], t: float) -> tuple[int, int]:
    return (round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t))


def native_material_fill(material: Image.Image, shade: float) -> Image.Image:
    """Tile generated pixels 1:1; only deterministic orientation shading changes RGB."""
    tiled = Image.new("RGB", FRAME)
    for y in range(0, FRAME[1], material.height):
        for x in range(0, FRAME[0], material.width):
            tiled.paste(material, (x, y))
    if shade != 1:
        tiled = ImageEnhance.Brightness(tiled).enhance(shade)
    return tiled.convert("RGBA")


def line_mask(points: list[tuple[int, int]], width: int) -> Image.Image:
    mask = Image.new("L", FRAME, 0)
    ImageDraw.Draw(mask).line(points, fill=255, width=width)
    return mask


def apply_material_mask(
    canvas: Image.Image,
    material: Image.Image,
    mask: Image.Image,
    shade: float,
) -> None:
    transparent = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    canvas.alpha_composite(Image.composite(native_material_fill(material, shade), transparent, mask))


def write_pixellab_material_wood(prefix: str) -> None:
    """ADR-0040 rail: owned canonical geometry, PixelLab-authored material pixels."""
    material = Image.open(PIXELLAB_WOOD_MATERIAL).convert("RGB")
    rail_e = Image.new("RGBA", FRAME, (0, 0, 0, 0))

    # The two-pixel inset keeps the four-pixel underlay inside the exact right
    # half-frame while its visual axis follows the canonical 48x27 board edge.
    front = (50, 95)
    right = (95, 68)
    height = 16
    bases = [lerp(front, right, index / 6) for index in range(7)]
    rails = [
        [(front[0], front[1] - round(height * 0.78)), (right[0], right[1] - round(height * 0.78))],
        [(front[0], front[1] - round(height * 0.38)), (right[0], right[1] - round(height * 0.38))],
    ]
    for base in bases:
        apply_material_mask(
            rail_e,
            material,
            line_mask([base, (base[0], base[1] - height)], 4),
            0.48,
        )
    for rail in rails:
        apply_material_mask(rail_e, material, line_mask(rail, 4), 0.48)
    for base in bases:
        apply_material_mask(
            rail_e,
            material,
            line_mask([base, (base[0], base[1] - height)], 2),
            1.0,
        )
        apply_material_mask(
            rail_e,
            material,
            line_mask([(base[0], base[1] - height), (base[0], base[1] - height - 2)], 2),
            1.14,
        )
    for rail in rails:
        apply_material_mask(rail_e, material, line_mask(rail, 2), 1.04)

    rail_e.save(OUT / f"{prefix}-rail-e.png")
    ImageOps.mirror(rail_e).save(OUT / f"{prefix}-rail-s.png")


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_codex("codex-wood-canonical-r2", "wood-kit-canonical-alpha.png", (48, 46), (10, 28))
    write_codex("codex-stone-canonical-r2", "stone-kit-canonical-alpha.png", (48, 35), (12, 18))

    # Added after PixelLab review-frame selection. The accepted stone rail stays
    # at the frozen 2026-07-10 paths and is intentionally never rebuilt here.
    write_pixellab_material_wood("pixellab-wood-canonical-r2")
    write_pixellab_post(
        "pixellab-wood-canonical-r2",
        "../../2026-07-10/pixellab/wood-post-32x32.png",
    )


if __name__ == "__main__":
    build()
