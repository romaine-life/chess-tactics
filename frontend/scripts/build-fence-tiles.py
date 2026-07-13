"""Bake edge-fence sprites from generated/source art and deterministic geometry.

ADR-0040 draws the boundary used here: code owns the exact isometric rail masks,
placement, and vertex anchors; generated/source images own every visible material
pixel.  This script therefore never assigns a gameplay-sprite RGB color.  It uses
alpha-only geometry masks to project the documented wood/stone sources into the
canonical 96x180 fence frame, and seats generated post cutouts on the same
anchor.

STATUS: calibration candidate only. This script spatially resizes its
material and post sources, so ADR-0075 forbids treating its output as accepted
production art. Keep it for footprint/anchor review until the sources are
regenerated at their required pixels and the resize stages are removed.

Inputs are fetched into an explicit source bundle; outputs and proofs are written
to explicit temporary directories and then uploaded through the live-media admin
workflow. This script never publishes or promotes.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


OUT_DIR: Path
PROOF_DIR: Path
RUNTIME_TILE: Path
MATERIAL_INPUTS: dict[str, Path]
POST_INPUTS: dict[str, Path]

FRAME_W = 96
FRAME_H = 180
ANCHOR_X = 48
ANCHOR_Y = 68
APEX = (48, 41)
RIGHT = (96, 68)
FRONT = (48, 95)
LEFT = (0, 68)
EDGES = {
    2: (RIGHT, FRONT),
    4: (FRONT, LEFT),
}
RAIL_HEIGHT = {
    "wood": 16,
    "stone": 14,
}
POST_MAX_SIZE = {
    "wood": (12, 28),
    "stone": (18, 24),
}


def lerp(a: tuple[int, int], b: tuple[int, int], t: float) -> tuple[int, int]:
    return (round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t))


def lift(point: tuple[int, int], pixels: float) -> tuple[int, int]:
    return (point[0], round(point[1] - pixels))


def center_square(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def prepare_material(path: Path) -> Image.Image:
    """Normalize art into a small repeatable pixel texture without inventing RGB."""
    source = center_square(Image.open(path).convert("RGB"))
    # The photoscan needs a low-fi reduction; the PixelLab wood source benefits from
    # the same fixed sampling density. Adaptive quantization only selects colors that
    # are already represented by the source art.
    source = source.resize((48, 48), Image.Resampling.LANCZOS)
    source = source.quantize(colors=40, method=Image.Quantize.MEDIANCUT).convert("RGB")
    return source


def texture_fill(material: Image.Image, shade: float) -> Image.Image:
    tiled = Image.new("RGB", (FRAME_W, FRAME_H))
    for y in range(0, FRAME_H, material.height):
        for x in range(0, FRAME_W, material.width):
            tiled.paste(material, (x, y))
    if shade != 1:
        tiled = ImageEnhance.Brightness(tiled).enhance(shade)
    fill = tiled.convert("RGBA")
    fill.putalpha(255)
    return fill


def apply_mask(canvas: Image.Image, material: Image.Image, mask: Image.Image, shade: float = 1) -> None:
    canvas.alpha_composite(Image.composite(texture_fill(material, shade), Image.new("RGBA", canvas.size), mask))


def line_mask(points: list[tuple[int, int]], width: int) -> Image.Image:
    mask = Image.new("L", (FRAME_W, FRAME_H), 0)
    ImageDraw.Draw(mask).line(points, fill=255, width=width)
    return mask


def polygon_mask(points: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", (FRAME_W, FRAME_H), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def draw_wood_edge(
    canvas: Image.Image,
    p0: tuple[int, int],
    p1: tuple[int, int],
    material: Image.Image,
    shade: float,
) -> None:
    height = RAIL_HEIGHT["wood"]
    posts = [lerp(p0, p1, index / 6) for index in range(7)]
    rails = [
        [lift(p0, height * 0.78), lift(p1, height * 0.78)],
        [lift(p0, height * 0.38), lift(p1, height * 0.38)],
    ]

    # Dark material underlays provide edge separation; the RGB still comes from
    # the generated wood source, just as the accepted wall bake shades its faces.
    for base in posts:
        apply_mask(canvas, material, line_mask([base, lift(base, height)], 4), shade * 0.48)
    for rail in rails:
        apply_mask(canvas, material, line_mask(rail, 4), shade * 0.48)

    for base in posts:
        apply_mask(canvas, material, line_mask([base, lift(base, height)], 2), shade)
        apply_mask(canvas, material, line_mask([lift(base, height), lift(base, height + 2)], 2), shade * 1.14)
    for rail in rails:
        apply_mask(canvas, material, line_mask(rail, 2), shade * 1.04)


def draw_stone_edge(
    canvas: Image.Image,
    p0: tuple[int, int],
    p1: tuple[int, int],
    material: Image.Image,
    shade: float,
) -> None:
    height = RAIL_HEIGHT["stone"]
    top0 = lift(p0, height)
    top1 = lift(p1, height)
    apply_mask(canvas, material, polygon_mask([p0, p1, top1, top0]), shade)
    apply_mask(canvas, material, line_mask([top0, top1], 3), shade * 1.18)
    apply_mask(canvas, material, line_mask([p0, p1], 2), shade * 0.48)


def bake_rail(material_name: str, mask: int, material: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    # S is farther from the viewer and therefore bakes first/darker. This is a
    # projection treatment, not a hand-authored palette.
    for bit, shade in ((4, 0.82), (2, 1.0)):
        if not mask & bit:
            continue
        p0, p1 = EDGES[bit]
        if material_name == "wood":
            draw_wood_edge(canvas, p0, p1, material, shade)
        else:
            draw_stone_edge(canvas, p0, p1, material, shade)
    return canvas


def harden_generated_cutout(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    source = image.convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("generated post source is empty")
    source = source.crop(bbox)
    scale = min(max_width / source.width, max_height / source.height)
    size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
    source = source.resize(size, Image.Resampling.LANCZOS)

    alpha = source.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    colors = source.convert("RGB").quantize(colors=48, method=Image.Quantize.MEDIANCUT).convert("RGB")
    colors.putalpha(alpha)
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("generated post vanished during low-fi preparation")
    return colors.crop(bbox)


def bake_post(material_name: str) -> Image.Image:
    max_width, max_height = POST_MAX_SIZE[material_name]
    cutout = harden_generated_cutout(Image.open(POST_INPUTS[material_name]), max_width, max_height)
    frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    x = ANCHOR_X - cutout.width // 2
    y = ANCHOR_Y - cutout.height + 1
    frame.alpha_composite(cutout, (x, y))
    return frame


def cropped_square(image: Image.Image, padding: int = 8) -> Image.Image:
    bbox = image.getbbox()
    if not bbox:
        raise RuntimeError("cannot create a thumbnail from an empty image")
    crop = image.crop(bbox)
    side = max(crop.size) + padding
    thumb = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    thumb.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return thumb


def fence_thumb(rail: Image.Image, post: Image.Image) -> Image.Image:
    # Give the V-shaped rail enough horizontal gutter for both post frames.
    stage = Image.new("RGBA", (FRAME_W * 2, FRAME_H), (0, 0, 0, 0))
    stage.alpha_composite(rail, (48, 0))
    stage.alpha_composite(post, (0, 0))
    stage.alpha_composite(post, (96, 0))
    return cropped_square(stage, padding=10)


def assert_runtime_asset(path: Path, *, anchored: bool = False) -> None:
    image = Image.open(path).convert("RGBA")
    if image.size != (FRAME_W, FRAME_H):
        raise RuntimeError(f"{path.name} is {image.size}, expected {(FRAME_W, FRAME_H)}")
    alpha = image.getchannel("A")
    if not alpha.getbbox():
        raise RuntimeError(f"{path.name} is empty")
    alpha_values = {value for _, value in alpha.getcolors(maxcolors=256) or []}
    if alpha_values - {0, 255}:
        raise RuntimeError(f"{path.name} has soft alpha; runtime fence sprites require hard alpha")
    if anchored:
        bbox = alpha.getbbox()
        if bbox[3] - 1 != ANCHOR_Y:
            raise RuntimeError(f"{path.name} ends at y={bbox[3] - 1}, expected anchor y={ANCHOR_Y}")


def runtime_proof(material_name: str, rail: Image.Image, post: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (300, 230), (12, 18, 24, 255))
    tile = Image.open(RUNTIME_TILE).convert("RGBA")
    anchor = (150, 120)
    canvas.alpha_composite(tile, (anchor[0] - ANCHOR_X, anchor[1] - ANCHOR_Y))
    canvas.alpha_composite(rail, (anchor[0] - ANCHOR_X, anchor[1] - ANCHOR_Y))
    for endpoint_x in (anchor[0] - 48, anchor[0] + 48):
        canvas.alpha_composite(post, (endpoint_x - ANCHOR_X, anchor[1] - ANCHOR_Y))
    ImageDraw.Draw(canvas).text((12, 10), f"{material_name}: generated vertex posts", fill=(230, 242, 255, 255))
    return canvas


def write_contact_sheet(proofs: dict[str, Image.Image]) -> None:
    cell_w, cell_h = 300, 230
    sheet = Image.new("RGBA", (cell_w * len(proofs), cell_h), (10, 16, 22, 255))
    for index, proof in enumerate(proofs.values()):
        sheet.alpha_composite(proof, (index * cell_w, 0))
    sheet.save(PROOF_DIR / "fence-bake-contact-sheet.png")


def main() -> None:
    global OUT_DIR, PROOF_DIR, RUNTIME_TILE, MATERIAL_INPUTS, POST_INPUTS
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path, help='Temporary bundle containing wood-material.png, stone-material.png, wood-post.png, stone-post.png, runtime-tile.png')
    parser.add_argument('--out-dir', required=True, type=Path, help='Temporary candidate output directory')
    parser.add_argument('--proof-dir', required=True, type=Path, help='Temporary supplementary proof directory')
    args = parser.parse_args()
    source_dir = args.source_dir.resolve()
    OUT_DIR = args.out_dir.resolve()
    PROOF_DIR = args.proof_dir.resolve()
    RUNTIME_TILE = source_dir / 'runtime-tile.png'
    MATERIAL_INPUTS = {'wood': source_dir / 'wood-material.png', 'stone': source_dir / 'stone-material.png'}
    POST_INPUTS = {'wood': source_dir / 'wood-post.png', 'stone': source_dir / 'stone-post.png'}
    missing = [path for path in [*MATERIAL_INPUTS.values(), *POST_INPUTS.values(), RUNTIME_TILE] if not path.exists()]
    if missing:
        raise FileNotFoundError("missing fence source art:\n  " + "\n  ".join(str(path) for path in missing))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    proofs: dict[str, Image.Image] = {}

    for material_name, material_path in MATERIAL_INPUTS.items():
        material = prepare_material(material_path)
        rails = {mask: bake_rail(material_name, mask, material) for mask in (2, 4, 6)}
        post = bake_post(material_name)

        for mask, rail in rails.items():
            path = OUT_DIR / f"fence-{material_name}-{mask}.png"
            rail.save(path)
            assert_runtime_asset(path)

        post_path = OUT_DIR / f"fence-{material_name}-post.png"
        post.save(post_path)
        assert_runtime_asset(post_path, anchored=True)
        cropped_square(post, padding=8).save(OUT_DIR / f"fence-{material_name}-post-thumb.png")
        fence_thumb(rails[6], post).save(OUT_DIR / f"fence-{material_name}-thumb.png")

        proof = runtime_proof(material_name, rails[6], post)
        proof.save(PROOF_DIR / f"fence-{material_name}-runtime-proof.png")
        proofs[material_name] = proof

    write_contact_sheet(proofs)
    print(f"baked generated/source fence rails + posts -> {OUT_DIR}")
    print(f"wrote fence review proofs -> {PROOF_DIR}")


if __name__ == "__main__":
    main()
