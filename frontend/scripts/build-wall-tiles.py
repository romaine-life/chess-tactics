"""Bake true-isometric edge wall sprites from generated/source materials.

Walls draw on a cell's N(1) and W(8) back edges. The runtime tile diamond owns
the geometry: every wall bottom must land exactly on the shipped tile's back
edge pixels. Generated/source tools own only the material images that get
projected into that deterministic footprint.

Fetch material and runtime-tile inputs into a temporary bundle and pass explicit
output/proof directories. Upload exact results through the live-media admin
workflow; this algorithm does not publish or promote.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


RUNTIME_TILE_REFERENCE: Path
WALL_FRAME_W = 128
WALL_FRAME_H = 336
WALL_ANCHOR_X = 64
WALL_ANCHOR_Y = 192
TILE_ANCHOR_X = 48
TILE_ANCHOR_Y = 69
TILE_STEP_X = 48
TILE_STEP_Y = 28
WALL_HEIGHT = 160
WALL_BASE_APEX = (64, 164)
WALL_BASE_LEFT = (16, 191)
WALL_BASE_RIGHT = (112, 191)

MATERIAL_INPUTS: dict[str, Path]


def selected_materials(raw: str | None) -> list[str]:
    if raw:
        names = [part.strip() for part in raw.split(",") if part.strip()]
    else:
        names = list(MATERIAL_INPUTS)
    unknown = [name for name in names if name not in MATERIAL_INPUTS]
    if unknown:
        raise ValueError(f"unknown wall material(s): {', '.join(unknown)}")
    existing = [name for name in names if MATERIAL_INPUTS[name].exists()]
    missing = [name for name in names if not MATERIAL_INPUTS[name].exists()]
    for name in missing:
        print(f"skip {name}: missing material {MATERIAL_INPUTS[name]}")
    if not existing:
        raise FileNotFoundError("no selected wall material images exist")
    return existing


def write_thumb(out_dir: Path, material: str) -> None:
    full = Image.open(out_dir / f"wall-{material}-9.png").convert("RGBA")
    bbox = full.getbbox()
    if not bbox:
        raise RuntimeError(f"wall bake produced an empty sprite for {material}")
    crop = full.crop(bbox)
    size = max(crop.size) + 10
    thumb = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    thumb.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2), crop)
    thumb.save(out_dir / f"wall-{material}-thumb.png")


def postprocess_sprites(out_dir: Path, material: str) -> None:
    for mask in (1, 8, 9):
        name = f"wall-{material}-{mask}.png"
        img = Image.open(out_dir / name).convert("RGBA")
        alpha = img.getchannel("A")
        rgb = Image.new("RGBA", img.size, (0, 0, 0, 0))
        lifted = ImageEnhance.Contrast(ImageEnhance.Brightness(img.convert("RGB")).enhance(1.28)).enhance(1.08)
        rgb.paste(lifted, (0, 0), alpha)
        rgb.putalpha(alpha)
        rgb.save(out_dir / name)


def opaque_run(alpha: Image.Image, y: int) -> tuple[int, int] | None:
    xs = [x for x in range(alpha.width) if alpha.getpixel((x, y)) > 20]
    return (min(xs), max(xs)) if xs else None


def assert_wall_geometry(out_dir: Path, material: str) -> None:
    north = Image.open(out_dir / f"wall-{material}-1.png").convert("RGBA").getchannel("A")
    west = Image.open(out_dir / f"wall-{material}-8.png").convert("RGBA").getchannel("A")
    corner = Image.open(out_dir / f"wall-{material}-9.png").convert("RGBA").getchannel("A")
    expected = {
        "north-apex-row": (opaque_run(north, WALL_BASE_APEX[1]), (WALL_BASE_APEX[0], WALL_BASE_RIGHT[0])),
        "north-end": (opaque_run(north, WALL_BASE_RIGHT[1]), (WALL_BASE_RIGHT[0], WALL_BASE_RIGHT[0])),
        "west-apex-row": (opaque_run(west, WALL_BASE_APEX[1]), (WALL_BASE_LEFT[0], WALL_BASE_APEX[0])),
        "west-end": (opaque_run(west, WALL_BASE_LEFT[1]), (WALL_BASE_LEFT[0], WALL_BASE_LEFT[0])),
        "corner-apex-row": (opaque_run(corner, WALL_BASE_APEX[1]), (WALL_BASE_LEFT[0], WALL_BASE_RIGHT[0])),
    }
    for label, (actual, want) in expected.items():
        if actual != want:
            raise RuntimeError(f"{material} {label} has opaque run {actual}, expected {want}")


def clamp_channel(value: float) -> int:
    return max(0, min(255, int(round(value))))


def sample_material(material: Image.Image, u: float, v: float, shade: float) -> tuple[int, int, int, int]:
    w, h = material.size
    x = max(0, min(w - 1, int(round(u * (w - 1)))))
    y = max(0, min(h - 1, int(round((1 - v) * (h - 1)))))
    r, g, b, a = material.getpixel((x, y))
    if a < 8:
        return (0, 0, 0, 0)
    return (clamp_channel(r * shade), clamp_channel(g * shade), clamp_channel(b * shade), 255)


def paint_wall_face(canvas: Image.Image, material: Image.Image, bottom_start: tuple[int, int], bottom_end: tuple[int, int], shade: float) -> None:
    p0x, p0y = bottom_start
    ux, uy = bottom_end[0] - p0x, bottom_end[1] - p0y
    vx, vy = 0, -WALL_HEIGHT
    det = ux * vy - uy * vx
    if det == 0:
        raise ValueError("wall face basis collapsed")
    min_x = max(0, min(p0x, bottom_end[0]) - 1)
    max_x = min(canvas.width - 1, max(p0x, bottom_end[0]) + 1)
    min_y = max(0, min(p0y, bottom_end[1]) - WALL_HEIGHT - 1)
    max_y = min(canvas.height - 1, max(p0y, bottom_end[1]) + 1)
    px = canvas.load()
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            dx, dy = x - p0x, y - p0y
            s = (dx * vy - dy * vx) / det
            t = (ux * dy - uy * dx) / det
            if 0 <= s <= 1 and 0 <= t <= 1:
                px[x, y] = sample_material(material, max(0, min(1, s)), max(0, min(1, t)), shade)


def bake_wall_sprite(material_path: Path, mask: int) -> Image.Image:
    material = Image.open(material_path).convert("RGBA").resize((96, 96), Image.Resampling.NEAREST)
    sprite = Image.new("RGBA", (WALL_FRAME_W, WALL_FRAME_H), (0, 0, 0, 0))
    if mask & 8:
        paint_wall_face(sprite, material, WALL_BASE_LEFT, WALL_BASE_APEX, 0.78)
    if mask & 1:
        paint_wall_face(sprite, material, WALL_BASE_APEX, WALL_BASE_RIGHT, 1.08)
    return sprite


def bake_wall_sprites(out_dir: Path, material: str, material_path: Path) -> None:
    for mask in (1, 8, 9):
        bake_wall_sprite(material_path, mask).save(out_dir / f"wall-{material}-{mask}.png")


def compose_runtime_seat_proof(out_dir: Path, material: str, draw_guides: bool) -> Image.Image:
    tile = Image.open(RUNTIME_TILE_REFERENCE).convert("RGBA")
    wall = Image.open(out_dir / f"wall-{material}-9.png").convert("RGBA")
    origin = (130, 220)
    canvas = Image.new("RGBA", (260, 400), (12, 18, 24, 255))
    canvas.alpha_composite(tile, (origin[0] - TILE_ANCHOR_X, origin[1] - TILE_ANCHOR_Y))
    canvas.alpha_composite(wall, (origin[0] - WALL_ANCHOR_X, origin[1] - WALL_ANCHOR_Y))
    if draw_guides:
        draw = ImageDraw.Draw(canvas)
        apex = (origin[0], origin[1] - TILE_STEP_Y)
        right = (origin[0] + TILE_STEP_X, origin[1])
        front = (origin[0], origin[1] + TILE_STEP_Y)
        left = (origin[0] - TILE_STEP_X, origin[1])
        draw.line([apex, right, front, left, apex], fill=(83, 231, 255, 210), width=1)
        draw.line([apex, right], fill=(255, 70, 70, 255), width=2)
        draw.line([apex, left], fill=(255, 70, 70, 255), width=2)
        draw.ellipse([origin[0] - 2, origin[1] - 2, origin[0] + 2, origin[1] + 2], fill=(255, 238, 74, 255))
    return canvas


def write_runtime_seat_proof(out_dir: Path, proof_dir: Path, material: str) -> None:
    compose_runtime_seat_proof(out_dir, material, draw_guides=False).save(proof_dir / f"wall-{material}-proof.png")
    compose_runtime_seat_proof(out_dir, material, draw_guides=True).save(proof_dir / f"wall-{material}-runtime-seat-proof.png")


def write_contact_sheet(out_dir: Path, proof_dir: Path, materials: list[str]) -> None:
    cell_w, cell_h = 220, 500
    sheet = Image.new("RGBA", (cell_w * len(materials), cell_h), (10, 16, 22, 255))
    draw = ImageDraw.Draw(sheet)
    for idx, material in enumerate(materials):
        x0 = idx * cell_w
        wall = Image.open(out_dir / f"wall-{material}-9.png").convert("RGBA")
        proof = Image.open(proof_dir / f"wall-{material}-runtime-seat-proof.png").convert("RGBA")
        sheet.alpha_composite(wall, (x0 + (cell_w - wall.width) // 2, 28))
        proof_small = proof.resize((156, 240), Image.Resampling.NEAREST)
        sheet.alpha_composite(proof_small, (x0 + (cell_w - proof_small.width) // 2, 250))
        draw.text((x0 + 12, 8), material, fill=(230, 242, 255, 255))
    sheet.save(proof_dir / "wall-bake-contact-sheet.png")


def main() -> None:
    global MATERIAL_INPUTS, RUNTIME_TILE_REFERENCE
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path, help="Temporary bundle with stone.png, brick.png, mossy.png, basalt.png, palisade.png, runtime-tile.png")
    parser.add_argument("--out", required=True, type=Path, help="Temporary candidate output directory")
    parser.add_argument("--proofs", required=True, type=Path, help="Temporary supplementary proof directory")
    parser.add_argument("--materials", help="Comma-separated material ids to bake; default: all existing inputs")
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    MATERIAL_INPUTS = {name: source_dir / f"{name}.png" for name in ("stone", "brick", "mossy", "basalt", "palisade")}
    RUNTIME_TILE_REFERENCE = source_dir / "runtime-tile.png"
    material_names = selected_materials(args.materials)

    out_dir = args.out.resolve()
    proof_dir = args.proofs.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    proof_dir.mkdir(parents=True, exist_ok=True)

    for material in material_names:
        bake_wall_sprites(out_dir, material, MATERIAL_INPUTS[material])
        postprocess_sprites(out_dir, material)
        assert_wall_geometry(out_dir, material)
        write_thumb(out_dir, material)
        write_runtime_seat_proof(out_dir, proof_dir, material)
    write_contact_sheet(out_dir, proof_dir, material_names)
    print(f"baked wall tiles ({', '.join(material_names)}) -> {out_dir}")
    print(f"wrote wall proof renders -> {proof_dir}")


if __name__ == "__main__":
    main()
