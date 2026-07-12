"""Bake true-isometric edge wall sprites from generated/source materials.

Walls draw on a cell's N(1) and W(8) back edges. The runtime tile diamond owns
the geometry: every wall bottom must land exactly on the shipped tile's back
edge pixels. Generated/source tools own only the material images that get
projected into that deterministic footprint.

Run from the repo root or frontend/:

  python frontend/scripts/build-wall-tiles.py

Default material inputs:

  docs/art/wall-concepts/materials/source/stone-photoscan.png
  docs/art/wall-concepts/materials/codex/brick-img2img.png
  docs/art/wall-concepts/materials/pixellab/mossy-stone.png
  docs/art/wall-concepts/materials/pixellab/dark-basalt.png
  docs/art/wall-concepts/materials/pixellab/wood-palisade.png

Outputs:

  frontend/public/assets/tiles/feature/wall-<material>-{1,8,9}.png  (128x336, anchor 64,192)
  frontend/public/assets/tiles/feature/wall-<material>-thumb.png
  docs/art/wall-concepts/proofs/wall-<material>-proof.png
  docs/art/wall-concepts/proofs/wall-<material>-runtime-seat-proof.png
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import os
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "frontend" / "public" / "assets" / "tiles" / "feature"
WALL_DOCS = ROOT / "docs" / "art" / "wall-concepts"
MATERIAL_DIR = WALL_DOCS / "materials"
PROOF_DIR = WALL_DOCS / "proofs"
DEFAULT_ZIP = "photoscanned-old-stone-wall-2x4m.zip"
TILE_REFERENCE = ROOT / "docs" / "art" / "pixellab-runs" / "surfaces" / "grass" / "tile_0.png"
RUNTIME_TILE_REFERENCE = ROOT / "frontend" / "public" / "assets" / "tiles" / "surface" / "grass-0.png"
TILE_ANCHOR_X = 48
TILE_ANCHOR_Y = 69
TILE_STEP_X = 48
TILE_STEP_Y = 28


@dataclass(frozen=True)
class WallBakeGeometry:
    prefix: str
    frame_w: int
    frame_h: int
    anchor_x: int
    anchor_y: int
    wall_height: int
    base_apex: tuple[int, int]
    base_left: tuple[int, int]
    base_right: tuple[int, int]


# Every wall uses the full-height geometry required by an exact 1:1 full-body mirror.
# The board-space base and 144px below-anchor tail are unchanged from the retired short
# geometry; the single canonical frame supplies 96px more upward headroom.
WALL_GEOMETRY = WallBakeGeometry(
    prefix="wall",
    frame_w=128,
    frame_h=336,
    anchor_x=64,
    anchor_y=192,
    wall_height=160,
    base_apex=(64, 164),
    base_left=(16, 191),
    base_right=(112, 191),
)

MATERIAL_INPUTS = {
    "stone": MATERIAL_DIR / "source" / "stone-photoscan.png",
    "brick": MATERIAL_DIR / "codex" / "brick-img2img.png",
    "mossy": MATERIAL_DIR / "pixellab" / "mossy-stone.png",
    "basalt": MATERIAL_DIR / "pixellab" / "dark-basalt.png",
    "palisade": MATERIAL_DIR / "pixellab" / "wood-palisade.png",
}


def candidate_zips() -> list[Path]:
    return [
        ROOT / "walls" / DEFAULT_ZIP,
        ROOT.parent / "chess-tactics" / "walls" / DEFAULT_ZIP,
    ]


def resolve_zip(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if not p.exists():
            raise FileNotFoundError(f"wall source zip not found: {p}")
        return p
    for p in candidate_zips():
        if p.exists():
            return p
    tried = "\n  ".join(str(p) for p in candidate_zips())
    raise FileNotFoundError(f"could not find {DEFAULT_ZIP}; tried:\n  {tried}")


def extract_photoscan_textures(zip_path: Path, work: Path) -> tuple[Path, Path | None]:
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as z:
        infos = [
            info for info in z.infolist()
            if not info.is_dir() and info.filename.lower().endswith((".png", ".jpg", ".jpeg"))
        ]
        if not infos:
            raise FileNotFoundError(f"no image textures found in {zip_path}")
        # The photoscanned pack contains two same-named images: albedo, then normal.
        infos.sort(key=lambda info: (0 if "photoscannedstonewall01_final_photoscanned" in info.filename.lower() else 1, info.filename))
        for idx, info in enumerate(infos[:2], start=1):
            suffix = Path(info.filename).suffix or ".png"
            out = work / f"photoscanned-wall-{idx}{suffix}"
            with z.open(info) as src, out.open("wb") as dst:
                dst.write(src.read())
            extracted.append(out)
    albedo = extracted[0]
    normal = extracted[1] if len(extracted) > 1 else None
    return albedo, normal


def prepare_texture(src: Path, dst: Path, max_side: int = 1024) -> Path:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    # Material textures are projected into a small wall face; center-crop avoids a
    # huge photoscan panorama stretching into muddy vertical bands.
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    if side > max_side:
        img = img.resize((max_side, max_side), Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst)
    return dst


def source_materials_ready() -> bool:
    stone = MATERIAL_INPUTS["stone"]
    normal = MATERIAL_DIR / "source" / "stone-photoscan-normal.png"
    return stone.exists() and normal.exists()


def ensure_source_materials(source_zip: Path | None) -> None:
    if source_materials_ready():
        return
    if source_zip is None:
        raise FileNotFoundError("prepared stone material is missing and no photoscan source zip was resolved")
    stone = MATERIAL_INPUTS["stone"]
    normal = MATERIAL_DIR / "source" / "stone-photoscan-normal.png"
    with tempfile.TemporaryDirectory(prefix="chess-tactics-wall-src-") as td:
        raw_albedo, raw_normal = extract_photoscan_textures(source_zip, Path(td))
        prepare_texture(raw_albedo, stone)
        if raw_normal:
            prepare_texture(raw_normal, normal)


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


def wall_sprite_name(geometry: WallBakeGeometry, material: str, mask: int) -> str:
    return f"{geometry.prefix}-{material}-{mask}.png"


def wall_thumb_name(geometry: WallBakeGeometry, material: str) -> str:
    return f"{geometry.prefix}-{material}-thumb.png"


def write_thumb(out_dir: Path, material: str, geometry: WallBakeGeometry) -> None:
    full = Image.open(out_dir / wall_sprite_name(geometry, material, 9)).convert("RGBA")
    bbox = full.getbbox()
    if not bbox:
        raise RuntimeError(f"wall bake produced an empty sprite for {material}")
    crop = full.crop(bbox)
    size = max(crop.size) + 10
    thumb = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    thumb.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2), crop)
    thumb.save(out_dir / wall_thumb_name(geometry, material))


def postprocess_sprites(out_dir: Path, material: str, geometry: WallBakeGeometry) -> None:
    for mask in (1, 8, 9):
        name = wall_sprite_name(geometry, material, mask)
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


def assert_wall_geometry(out_dir: Path, material: str, geometry: WallBakeGeometry) -> None:
    north = Image.open(out_dir / wall_sprite_name(geometry, material, 1)).convert("RGBA").getchannel("A")
    west = Image.open(out_dir / wall_sprite_name(geometry, material, 8)).convert("RGBA").getchannel("A")
    corner = Image.open(out_dir / wall_sprite_name(geometry, material, 9)).convert("RGBA").getchannel("A")
    expected = {
        "north-apex-row": (opaque_run(north, geometry.base_apex[1]), (geometry.base_apex[0], geometry.base_right[0])),
        "north-end": (opaque_run(north, geometry.base_right[1]), (geometry.base_right[0], geometry.base_right[0])),
        "west-apex-row": (opaque_run(west, geometry.base_apex[1]), (geometry.base_left[0], geometry.base_apex[0])),
        "west-end": (opaque_run(west, geometry.base_left[1]), (geometry.base_left[0], geometry.base_left[0])),
        "corner-apex-row": (opaque_run(corner, geometry.base_apex[1]), (geometry.base_left[0], geometry.base_right[0])),
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


def paint_wall_face(
    canvas: Image.Image,
    material: Image.Image,
    bottom_start: tuple[int, int],
    bottom_end: tuple[int, int],
    shade: float,
    wall_height: int,
) -> None:
    p0x, p0y = bottom_start
    ux, uy = bottom_end[0] - p0x, bottom_end[1] - p0y
    vx, vy = 0, -wall_height
    det = ux * vy - uy * vx
    if det == 0:
        raise ValueError("wall face basis collapsed")
    min_x = max(0, min(p0x, bottom_end[0]) - 1)
    max_x = min(canvas.width - 1, max(p0x, bottom_end[0]) + 1)
    min_y = max(0, min(p0y, bottom_end[1]) - wall_height - 1)
    max_y = min(canvas.height - 1, max(p0y, bottom_end[1]) + 1)
    px = canvas.load()
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            dx, dy = x - p0x, y - p0y
            s = (dx * vy - dy * vx) / det
            t = (ux * dy - uy * dx) / det
            if 0 <= s <= 1 and 0 <= t <= 1:
                px[x, y] = sample_material(material, max(0, min(1, s)), max(0, min(1, t)), shade)


def bake_wall_sprite(material_path: Path, mask: int, geometry: WallBakeGeometry) -> Image.Image:
    material = Image.open(material_path).convert("RGBA").resize((96, 96), Image.Resampling.NEAREST)
    sprite = Image.new("RGBA", (geometry.frame_w, geometry.frame_h), (0, 0, 0, 0))
    if mask & 8:
        paint_wall_face(sprite, material, geometry.base_left, geometry.base_apex, 0.78, geometry.wall_height)
    if mask & 1:
        paint_wall_face(sprite, material, geometry.base_apex, geometry.base_right, 1.08, geometry.wall_height)
    return sprite


def bake_wall_sprites(out_dir: Path, material: str, material_path: Path, geometry: WallBakeGeometry) -> None:
    for mask in (1, 8, 9):
        bake_wall_sprite(material_path, mask, geometry).save(out_dir / wall_sprite_name(geometry, material, mask))


def compose_runtime_seat_proof(
    out_dir: Path,
    material: str,
    geometry: WallBakeGeometry,
    draw_guides: bool,
) -> Image.Image:
    tile = Image.open(RUNTIME_TILE_REFERENCE).convert("RGBA")
    wall = Image.open(out_dir / wall_sprite_name(geometry, material, 9)).convert("RGBA")
    origin = (130, 160)
    canvas = Image.new("RGBA", (260, 300), (12, 18, 24, 255))
    canvas.alpha_composite(tile, (origin[0] - TILE_ANCHOR_X, origin[1] - TILE_ANCHOR_Y))
    canvas.alpha_composite(wall, (origin[0] - geometry.anchor_x, origin[1] - geometry.anchor_y))
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


def write_runtime_seat_proof(
    out_dir: Path,
    proof_dir: Path,
    material: str,
    geometry: WallBakeGeometry,
) -> None:
    compose_runtime_seat_proof(out_dir, material, geometry, draw_guides=False).save(
        proof_dir / f"{geometry.prefix}-{material}-proof.png"
    )
    compose_runtime_seat_proof(out_dir, material, geometry, draw_guides=True).save(
        proof_dir / f"{geometry.prefix}-{material}-runtime-seat-proof.png"
    )


def write_contact_sheet(
    out_dir: Path,
    proof_dir: Path,
    materials: list[str],
    geometry: WallBakeGeometry,
) -> None:
    cell_w = 220
    cell_h = 408
    sheet = Image.new("RGBA", (cell_w * len(materials), cell_h), (10, 16, 22, 255))
    draw = ImageDraw.Draw(sheet)
    for idx, material in enumerate(materials):
        x0 = idx * cell_w
        wall = Image.open(out_dir / wall_sprite_name(geometry, material, 9)).convert("RGBA")
        proof = Image.open(proof_dir / f"{geometry.prefix}-{material}-runtime-seat-proof.png").convert("RGBA")
        sheet.alpha_composite(wall, (x0 + (cell_w - wall.width) // 2, 28))
        proof_small = proof.resize((156, 180), Image.Resampling.NEAREST)
        proof_y = 218
        sheet.alpha_composite(proof_small, (x0 + (cell_w - proof_small.width) // 2, proof_y))
        draw.text((x0 + 12, 8), material, fill=(230, 242, 255, 255))
    sheet.save(WALL_DOCS / "wall-bake-contact-sheet.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-zip", help="Path to photoscanned-old-stone-wall-2x4m.zip")
    parser.add_argument("--blender", help="Deprecated; ignored. Wall fit is baked from the runtime tile diamond.")
    parser.add_argument("--out", default=str(OUT_DIR), help="Output asset directory")
    parser.add_argument("--proofs", default=str(PROOF_DIR), help="Output proof directory")
    parser.add_argument("--materials", help="Comma-separated material ids to bake; default: all existing inputs")
    args = parser.parse_args()

    source_zip = resolve_zip(args.source_zip) if args.source_zip or not source_materials_ready() else None
    ensure_source_materials(source_zip)
    material_names = selected_materials(args.materials)

    out_dir = Path(args.out)
    proof_dir = Path(args.proofs)
    out_dir.mkdir(parents=True, exist_ok=True)
    proof_dir.mkdir(parents=True, exist_ok=True)

    for material in material_names:
        bake_wall_sprites(out_dir, material, MATERIAL_INPUTS[material], WALL_GEOMETRY)
        postprocess_sprites(out_dir, material, WALL_GEOMETRY)
        assert_wall_geometry(out_dir, material, WALL_GEOMETRY)
        write_thumb(out_dir, material, WALL_GEOMETRY)
        write_runtime_seat_proof(out_dir, proof_dir, material, WALL_GEOMETRY)
    write_contact_sheet(out_dir, proof_dir, material_names, WALL_GEOMETRY)
    print(f"baked canonical full-height wall tiles ({', '.join(material_names)}) -> {out_dir}")
    print(f"wrote wall proof renders -> {proof_dir}")


if __name__ == "__main__":
    main()
