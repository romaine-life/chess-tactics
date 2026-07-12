"""Normalize generated wall-decor sprites into runtime assets and proof sheets.

Input source sprites are transparent PNGs from forge-wall-decor.mjs:

  docs/art/wall-art-concepts/codex/<id>-alpha.png

Outputs:

  frontend/public/assets/wall-decor/<id>.png
  frontend/public/assets/wall-decor/<id>-west.png
  frontend/public/assets/wall-decor/<id>-north.png
  frontend/public/assets/wall-decor/<mirror-id>-west-glass.png
  frontend/public/assets/wall-decor/<mirror-id>-north-glass.png
  frontend/public/assets/wall-decor/manifest.json
  packages/board-render/src/ui/design/wallDecorManifest.json
  docs/art/wall-art-concepts/wall-decor-contact-sheet.png
  docs/art/wall-art-concepts/proofs/wall-decor-runtime-proof.png
  docs/art/wall-art-concepts/proofs/mirror-wall-material-proof.png
  docs/art/wall-art-concepts/proofs/mirror-layer-split-proof.png
  docs/art/wall-art-concepts/proofs/mirror-full-unit-fit-proof.png
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "art" / "wall-art-concepts"
SRC_DIR = DOCS / "codex"
PROOF_DIR = DOCS / "proofs"
OUT_DIR = ROOT / "frontend" / "public" / "assets" / "wall-decor"
PACKAGE_MANIFEST = ROOT / "packages" / "board-render" / "src" / "ui" / "design" / "wallDecorManifest.json"
WALL_MATERIALS = ("stone", "brick", "mossy", "basalt", "palisade")
PROOF_REFLECTION_UNIT = DOCS / "proof-inputs" / "accepted-rook-navy-north-east-c396999a.png"
PROOF_PHYSICAL_UNITS = {
    # These semantic facings both select the limiting north-east source before the runtime's
    # required horizontal mirror flip: west SE -> reflected SW; north NW -> reflected SW.
    "west": DOCS / "proof-inputs" / "accepted-rook-navy-south-east-bbeeef7e.png",
    "north": DOCS / "proof-inputs" / "accepted-rook-navy-north-west-f73fc4a0.png",
}
PROOF_INPUT_SHA256 = {
    PROOF_REFLECTION_UNIT: "c396999a1cec31c94311548d47e662f61634132b82b8acb59e287cfc012e8356",
    PROOF_PHYSICAL_UNITS["west"]: "bbeeef7ea117a79e897ce3ec3d10ab51c887839e83c6a15ce877b32775a09ee0",
    PROOF_PHYSICAL_UNITS["north"]: "f73fc4a08bb05269c4aacaa0675ec8f0fe70515361589055ea668978aac69e5b",
}
# Accepted live-catalog audit, revision 842. The west raster remains the largest visible
# 37x53 silhouette, establishing the aperture's general 73.8125px sloped-band minimum. The
# north-east raster is the exact lower-clearance limiter at the runtime-reflected floor anchor.
PROOF_UNIT_DRAW_SIZE = (57, 67)
PROOF_REFLECTION_VISIBLE_BOUNDS = (15, 7, 42, 55)
PROOF_UNIT_REQUIRED_BAND_HEIGHT = 53 + 37 * 27 / 48
PROOF_UNIT_SEAT_SIZE = (72, 86)
PROOF_UNIT_NATIVE_SCALE = 0.73
PROOF_UNIT_CONTACT_ANCHOR = (0.5, 0.80241)
PROOF_SUBJECT_GRID = (1, 1)
PROOF_GROUNDED_SLOT_Y = 72
GRID_STEP = (48, 27)
# Wall-art slots retain their established 128x240 coordinate datum so making the
# canonical visual wall taller does not move existing authored decor in world space.
WALL_ART_SLOT_ANCHOR = (64, 96)
WALL_FRAME = (128, 336)
WALL_ANCHOR = (64, 192)
WALL_FLOOR_SEAM_OFFSET_Y = -28
SUPPORT_VERTICAL_EXTENT = 512

ASSETS = [
    {
        "id": "banner-tattered",
        "label": "Tattered Banner",
        "kind": "banner",
        "badge": "cloth",
        "frame": (72, 96),
        "fit": (58, 84),
        "surface": (44, 84),
        "mount": (36, 10),
        "west_target": (42, 24),
        "north_target": (84, 24),
        "notes": "Faded hanging banner for stone perimeter walls.",
    },
    {
        "id": "relief-pawn",
        "label": "Pawn Relief",
        "kind": "relief",
        "badge": "stone",
        "frame": (72, 72),
        "fit": (58, 58),
        "surface": (44, 44),
        "mount": (36, 36),
        "west_target": (42, 42),
        "north_target": (84, 42),
        "notes": "Carved pawn plaque for quiet chess-themed wall dressing.",
    },
    {
        "id": "relief-rook",
        "label": "Rook Relief",
        "kind": "relief",
        "badge": "stone",
        "frame": (72, 72),
        "fit": (58, 58),
        "surface": (44, 44),
        "mount": (36, 36),
        "west_target": (42, 42),
        "north_target": (84, 42),
        "notes": "Carved rook plaque for quiet chess-themed wall dressing.",
    },
    {
        "id": "lantern-brass",
        "label": "Brass Lantern",
        "kind": "lantern",
        "badge": "metal",
        "frame": (56, 80),
        "fit": (42, 70),
        "surface": (30, 66),
        "mount": (28, 8),
        "west_target": (42, 28),
        "north_target": (84, 28),
        "notes": "Unlit brass wall bracket with soot-darkened cap.",
    },
    {
        "id": "mirror-keep",
        "label": "Keep Mirror",
        "kind": "mirror",
        "badge": "iron",
        "mirror_coverage": "authored-crop",
        "frame": (72, 88),
        "fit": (58, 74),
        "surface": (44, 60),
        "mount": (36, 44),
        "west_target": (42, 44),
        "north_target": (84, 44),
        "glass_aperture": ((0.30, 0.19), (0.70, 0.19), (0.70, 0.81), (0.30, 0.81)),
        "notes": "Austere riveted iron mirror with a live planar reflection aperture.",
    },
    {
        "id": "mirror-court-oval",
        "label": "Court Oval",
        "kind": "mirror",
        "badge": "brass",
        "mirror_coverage": "authored-crop",
        "frame": (72, 88),
        "fit": (58, 74),
        "surface": (42, 58),
        "mount": (36, 44),
        "west_target": (42, 44),
        "north_target": (84, 44),
        "glass_aperture": (
            (0.50, 0.29), (0.58, 0.31), (0.64, 0.37), (0.68, 0.48),
            (0.69, 0.60), (0.66, 0.72), (0.59, 0.80), (0.50, 0.83),
            (0.41, 0.80), (0.34, 0.72), (0.31, 0.60), (0.32, 0.48),
            (0.36, 0.37), (0.42, 0.31),
        ),
        "notes": "Tarnished oval court mirror with a live planar reflection aperture.",
    },
    {
        "id": "mirror-chapel-glass",
        "label": "Chapel Glass",
        "kind": "mirror",
        "badge": "stone",
        "mirror_coverage": "authored-crop",
        "frame": (72, 96),
        "fit": (58, 84),
        "surface": (44, 68),
        "mount": (36, 48),
        "west_target": (42, 46),
        "north_target": (84, 46),
        "glass_aperture": (
            (0.50, 0.19), (0.60, 0.27), (0.66, 0.39), (0.66, 0.80),
            (0.34, 0.80), (0.34, 0.39), (0.40, 0.27),
        ),
        "notes": "Pointed stone-arch mirror with a live planar reflection aperture.",
    },
    {
        "id": "mirror-witch-eye",
        "label": "Witch's Eye",
        "kind": "mirror",
        "badge": "convex",
        "mirror_coverage": "authored-crop",
        "frame": (72, 72),
        "fit": (58, 58),
        "surface": (42, 42),
        "mount": (36, 36),
        "west_target": (42, 42),
        "north_target": (84, 42),
        "glass_aperture": (
            (0.50, 0.25), (0.60, 0.27), (0.68, 0.33), (0.74, 0.42),
            (0.76, 0.52), (0.74, 0.62), (0.68, 0.71), (0.60, 0.77),
            (0.50, 0.79), (0.40, 0.77), (0.32, 0.71), (0.26, 0.62),
            (0.24, 0.52), (0.26, 0.42), (0.32, 0.33), (0.40, 0.27),
        ),
        "notes": "Small black mirror with a live convex reflection aperture.",
    },
    {
        "id": "mirror-grand-gallery",
        "source": "mirror-grand-gallery-grounded-wide-alpha.png",
        "label": "Grand Gallery Mirror",
        "kind": "mirror",
        "badge": "three-wall",
        "mirror_coverage": "full-body",
        "span": 3,
        "frame": (216, 252),
        "fit": (204, 238),
        # The generated alpha bbox is 0.859:1 and the 144x168 authored surface is 0.857:1,
        # keeping deformation below 0.3% while adding 74px above the prior 94px surface.
        "surface": (144, 168),
        # Keep the generated bottom rail 30px below the mount datum. The taller source grows
        # upward from that fixed lower assembly; it is never centered around the old mount.
        "mount": (108, 215),
        # The wall-art placement is anchored to the first occupied wall segment.
        # West spans advance down-left (opposite source +u); north advances down-right.
        # One-sixth of the width lands the first segment center inside a 3-wall object.
        "face_mounts": {"west": (180, 215), "north": (36, 215)},
        # Runtime slots stay in the stable 128x240 wall-art coordinate datum. y=72 seats the
        # lower rail at the projected wall/floor datum so every physical-silhouette grid-axis
        # crossing reaches glass. The canonical wall supplies all required headroom above it.
        "west_target": (42, 72),
        "north_target": (84, 72),
        "full_unit_aperture": True,
        "glass_aperture": (
            (0.05, 0.04), (0.95, 0.04), (0.95, 0.96), (0.05, 0.96),
        ),
        "method": "Codex built-in image_gen precise-object edit + chroma-key alpha + deterministic projection + aperture layer split",
        "notes": "One continuous full-height three-wall gallery mirror sized for every accepted 1x unit silhouette on the canonical full-height wall.",
    },
]


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("empty alpha sprite")
    return bbox


def fit_size(size: tuple[int, int], fit: tuple[int, int]) -> tuple[int, int]:
    w, h = size
    fw, fh = fit
    scale = min(fw / w, fh / h)
    return max(1, round(w * scale)), max(1, round(h * scale))


def normalize(asset: dict) -> Image.Image:
    src = SRC_DIR / asset.get("source", f"{asset['id']}-alpha.png")
    if not src.exists():
        raise FileNotFoundError(f"missing generated source: {src}")
    img = Image.open(src).convert("RGBA")
    crop = img.crop(alpha_bbox(img))
    fitted = crop.resize(fit_size(crop.size, asset["fit"]), Image.Resampling.LANCZOS)
    frame_w, frame_h = asset["frame"]
    out = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    out.alpha_composite(fitted, ((frame_w - fitted.width) // 2, (frame_h - fitted.height) // 2))
    return out


def wall_sample_path(asset: dict, material: str = "stone") -> Path:
    return ROOT / "frontend" / "public" / "assets" / "tiles" / "feature" / f"wall-{material}-9.png"


def wall_local_target(asset: dict, face: str) -> tuple[int, int]:
    """Convert a stable runtime slot target into the canonical wall image's local frame.

    Slots retain the retired short frame's 128x240 coordinate datum. The canonical wall has the
    same board anchor with extra headroom above it, so proofs translate by the anchor delta while
    authored slot coordinates and manifests remain stable.
    """
    x, y = asset[f"{face}_target"]
    return (
        x + WALL_ANCHOR[0] - WALL_ART_SLOT_ANCHOR[0],
        y + WALL_ANCHOR[1] - WALL_ART_SLOT_ANCHOR[1],
    )


def wall_support_segments(
    face: str,
    target_grid: tuple[int, int],
    span: int,
) -> list[dict[str, tuple[float, float] | list[tuple[float, float]]]]:
    """Repeat the runtime's bounded wall-face partition for deterministic proofs.

    The lower edge is the generated wall's projected wall/floor seam. First and last
    segments keep the renderer's half-cell tangent overhang for the outer frame.
    """
    tangent = (-GRID_STEP[0], GRID_STEP[1]) if face == "west" else GRID_STEP
    segments: list[dict[str, tuple[float, float] | list[tuple[float, float]]]] = []
    for index in range(span):
        anchor = (
            (target_grid[0], target_grid[1] + index)
            if face == "west"
            else (target_grid[0] + index, target_grid[1])
        )
        seat = project_grid_point(anchor)
        start = (float(seat[0]), float(seat[1] + WALL_FLOOR_SEAM_OFFSET_Y))
        end = (start[0] + tangent[0], start[1] + tangent[1])
        if index == 0:
            start = (start[0] - tangent[0] / 2, start[1] - tangent[1] / 2)
        if index == span - 1:
            end = (end[0] + tangent[0] / 2, end[1] + tangent[1] / 2)
        segments.append({
            "start": start,
            "end": end,
            "polygon": [
                (start[0], start[1] - SUPPORT_VERTICAL_EXTENT),
                (end[0], end[1] - SUPPORT_VERTICAL_EXTENT),
                end,
                start,
            ],
        })
    return segments


def point_in_convex_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    sign = 0
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        cross = (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0])
        if abs(cross) < 1e-9:
            continue
        next_sign = 1 if cross > 0 else -1
        if sign == 0:
            sign = next_sign
        elif sign != next_sign:
            return False
    return True


def wall_support_mask(
    size: tuple[int, int],
    image_origin: tuple[float, float],
    segments: list[dict[str, tuple[float, float] | list[tuple[float, float]]]],
) -> Image.Image:
    """Rasterize the wall support at destination pixel centers, matching canvas clipping."""
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    polygons = [segment["polygon"] for segment in segments]
    for y in range(size[1]):
        for x in range(size[0]):
            destination = (image_origin[0] + x + 0.5, image_origin[1] + y + 0.5)
            if any(point_in_convex_polygon(destination, polygon) for polygon in polygons):
                pixels[x, y] = 255
    return mask


def apply_alpha_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    masked = image.copy()
    masked.putalpha(ImageChops.multiply(masked.getchannel("A"), mask))
    return masked


def supported_wall_proof_layer(
    asset: dict,
    face: str,
    image: Image.Image,
    face_anchor: tuple[int, int],
) -> Image.Image:
    """Apply the runtime wall-face support to an image placed in a proof wall frame."""
    if asset["kind"] != "mirror":
        return image
    translated_segments = []
    for segment in wall_support_segments(face, (0, 0), asset.get("span", 1)):
        translated_segments.append({
            key: (
                [(point[0] + WALL_ANCHOR[0], point[1] + WALL_ANCHOR[1]) for point in value]
                if key == "polygon"
                else (value[0] + WALL_ANCHOR[0], value[1] + WALL_ANCHOR[1])
            )
            for key, value in segment.items()
        })
    target = wall_local_target(asset, face)
    image_origin = (target[0] - face_anchor[0], target[1] - face_anchor[1])
    return apply_alpha_mask(image, wall_support_mask(image.size, image_origin, translated_segments))


def aperture_points(image: Image.Image, aperture: list[float]) -> list[tuple[int, int]]:
    return [
        (round(aperture[i] * (image.width - 1)), round(aperture[i + 1] * (image.height - 1)))
        for i in range(0, len(aperture), 2)
    ]


def aperture_edge_height(image: Image.Image, aperture: list[float]) -> float:
    points = aperture_points(image, aperture)
    if len(points) != 4:
        raise RuntimeError("full-unit aperture proof requires one four-corner opening")
    return min(abs(points[3][1] - points[0][1]), abs(points[2][1] - points[1][1]))


def assert_full_unit_aperture(asset: dict, face: str, image: Image.Image, aperture: list[float] | None) -> None:
    if not asset.get("full_unit_aperture"):
        return
    if not aperture:
        raise RuntimeError(f"{asset['id']} {face} is missing its full-unit aperture")
    available = aperture_edge_height(image, aperture)
    if available < PROOF_UNIT_REQUIRED_BAND_HEIGHT:
        raise RuntimeError(
            f"{asset['id']} {face} aperture edge is {available:.2f}px, "
            f"below accepted visible-unit requirement {PROOF_UNIT_REQUIRED_BAND_HEIGHT:.2f}px"
        )


def project_to_wall_face(
    src: Image.Image,
    asset: dict,
    face: str,
) -> tuple[Image.Image, tuple[int, int], list[float] | None]:
    """Project a front-facing sprite onto one vertical isometric wall face.

    The wall bake uses the runtime diamond back edges:
      west face slope  = (16,95) -> (64,68)
      north face slope = (64,68) -> (112,95)

    This deterministic projection changes where pixels land, not what the
    generated sprite looks like.
    """
    target_w, target_h = asset["surface"]
    slope = -27 / 48 if face == "west" else 27 / 48
    src = src.resize((target_w, target_h), Image.Resampling.LANCZOS)

    ux, uy = target_w, target_w * slope
    vx, vy = 0, target_h
    vertices = [(0, 0), (ux, uy), (vx, vy), (ux + vx, uy + vy)]
    min_x = int(min(x for x, _ in vertices)) - 1
    min_y = int(min(y for _, y in vertices)) - 1
    max_x = int(max(x for x, _ in vertices)) + 2
    max_y = int(max(y for _, y in vertices)) + 2
    projected = Image.new("RGBA", (max_x - min_x, max_y - min_y), (0, 0, 0, 0))
    px = projected.load()
    spx = src.load()
    det = ux * vy - uy * vx
    for y in range(projected.height):
        for x in range(projected.width):
            rx = x + min_x
            ry = y + min_y
            s = (rx * vy - ry * vx) / det
            t = (ux * ry - uy * rx) / det
            if 0 <= s < 1 and 0 <= t < 1:
                sx = max(0, min(src.width - 1, int(s * src.width)))
                sy = max(0, min(src.height - 1, int(t * src.height)))
                px[x, y] = spx[sx, sy]

    bbox = projected.getbbox()
    if not bbox:
        raise RuntimeError(f"projected empty sprite for {asset['id']} {face}")
    crop = projected.crop(bbox)
    frame_w, frame_h = asset["frame"]
    mount_x, mount_y = asset.get("face_mounts", {}).get(face, asset["mount"])
    local_mount_x = mount_x / frame_w * target_w
    local_mount_y = mount_y / frame_h * target_h
    mapped_mount_x = local_mount_x
    mapped_mount_y = local_mount_x * slope + local_mount_y
    anchor = (
        round(mapped_mount_x - min_x - bbox[0]),
        round(mapped_mount_y - min_y - bbox[1]),
    )

    aperture = None
    if asset.get("glass_aperture"):
        aperture = []
        for u, v in asset["glass_aperture"]:
            mapped_x = u * target_w
            mapped_y = u * target_w * slope + v * target_h
            normalized_x = (mapped_x - min_x - bbox[0]) / crop.width
            normalized_y = (mapped_y - min_y - bbox[1]) / crop.height
            aperture.extend((round(max(0, min(1, normalized_x)), 6), round(max(0, min(1, normalized_y)), 6)))
    return crop, anchor, aperture


def split_mirror_face(src: Image.Image, aperture: list[float]) -> tuple[Image.Image, Image.Image]:
    """Split one projected mirror into frame foreground and generated glass underlay."""
    if len(aperture) < 6 or len(aperture) % 2:
        raise RuntimeError("mirror aperture must contain at least three normalized points")
    points = [
        (round(aperture[i] * (src.width - 1)), round(aperture[i + 1] * (src.height - 1)))
        for i in range(0, len(aperture), 2)
    ]
    mask = Image.new("L", src.size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    inverse = Image.eval(mask, lambda value: 255 - value)
    glass = Image.new("RGBA", src.size, (0, 0, 0, 0))
    glass.paste(src, (0, 0), mask)
    frame = Image.new("RGBA", src.size, (0, 0, 0, 0))
    frame.paste(src, (0, 0), inverse)
    return frame, glass


def draw_checker(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    step = 8
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            c = (18, 27, 38, 255) if ((x // step + y // step) % 2 == 0) else (10, 16, 24, 255)
            draw.rectangle((x, y, min(x + step - 1, x1), min(y + step - 1, y1)), fill=c)


def write_contact_sheet(rendered: dict[str, dict[str, object]]) -> None:
    cell_w, cell_h = 480, 380
    columns = min(3, len(ASSETS))
    rows = (len(ASSETS) + columns - 1) // columns
    sheet = Image.new("RGBA", (cell_w * columns, cell_h * rows), (10, 16, 22, 255))
    draw = ImageDraw.Draw(sheet)
    for index, asset in enumerate(ASSETS):
        wall = Image.open(wall_sample_path(asset)).convert("RGBA")
        x0 = (index % columns) * cell_w
        y0 = (index // columns) * cell_h
        draw.text((x0 + 10, y0 + 8), asset["label"], fill=(230, 242, 255, 255))
        checker = (x0 + 8, y0 + 30, x0 + cell_w - 8, y0 + 132)
        draw_checker(draw, checker)
        sprite = rendered[asset["id"]]["source"]
        assert isinstance(sprite, Image.Image)
        sheet.alpha_composite(sprite, (x0 + 115 - sprite.width // 2, y0 + 82 - sprite.height // 2))
        west = rendered[asset["id"]]["west"]
        west_anchor = rendered[asset["id"]]["west_anchor"]
        assert isinstance(west, Image.Image)
        assert isinstance(west_anchor, tuple)
        sheet.alpha_composite(west, (x0 + 430 - west_anchor[0], y0 + 108 - west_anchor[1]))

        wall_small_h = round(wall.height * 0.75)
        wall_small = wall.resize((96, wall_small_h), Image.Resampling.NEAREST)
        sheet.alpha_composite(wall_small, (x0 + 238, y0 + 88))
        west_target = tuple(round(v * 0.75) for v in wall_local_target(asset, "west"))
        sheet.alpha_composite(west, (x0 + 238 + west_target[0] - west_anchor[0], y0 + 88 + west_target[1] - west_anchor[1]))
        draw.text((x0 + 10, y0 + 356), f"{asset['kind']} / {asset['badge']}", fill=(125, 170, 200, 255))
    sheet.save(DOCS / "wall-decor-contact-sheet.png")


def write_runtime_proof(rendered: dict[str, dict[str, object]]) -> None:
    columns = min(3, len(ASSETS))
    rows = (len(ASSETS) + columns - 1) // columns
    cell_w = 330
    cell_h = 350
    canvas = Image.new("RGBA", (24 + columns * cell_w, 24 + rows * cell_h), (12, 18, 24, 255))
    for index, asset in enumerate(ASSETS):
        wall = Image.open(wall_sample_path(asset)).convert("RGBA")
        x = 20 + (index % columns) * cell_w + 82
        y = 14 + (index // columns) * cell_h
        canvas.alpha_composite(wall, (x, y))
        west = rendered[asset["id"]]["west"]
        north = rendered[asset["id"]]["north"]
        west_anchor = rendered[asset["id"]]["west_anchor"]
        north_anchor = rendered[asset["id"]]["north_anchor"]
        assert isinstance(west, Image.Image) and isinstance(north, Image.Image)
        assert isinstance(west_anchor, tuple) and isinstance(north_anchor, tuple)
        west_target = wall_local_target(asset, "west")
        north_target = wall_local_target(asset, "north")
        west_on_wall = supported_wall_proof_layer(asset, "west", west, west_anchor)
        north_on_wall = supported_wall_proof_layer(asset, "north", north, north_anchor)
        canvas.alpha_composite(west_on_wall, (x + west_target[0] - west_anchor[0], y + west_target[1] - west_anchor[1]))
        canvas.alpha_composite(north_on_wall, (x + north_target[0] - north_anchor[0], y + north_target[1] - north_anchor[1]))
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PROOF_DIR / "wall-decor-runtime-proof.png")


def write_mirror_material_proof(rendered: dict[str, dict[str, object]]) -> None:
    mirrors = [asset for asset in ASSETS if asset["kind"] == "mirror"]
    left, top = 110, 24
    cell_w, cell_h = 330, 350
    canvas = Image.new("RGBA", (left + cell_w * len(WALL_MATERIALS), top + cell_h * len(mirrors)), (12, 18, 24, 255))
    draw = ImageDraw.Draw(canvas)
    for column, material in enumerate(WALL_MATERIALS):
        draw.text((left + column * cell_w + 8, 7), material, fill=(180, 205, 225, 255))
    for row, asset in enumerate(mirrors):
        y = top + row * cell_h
        draw.text((6, y + 108), asset["label"], fill=(220, 235, 245, 255))
        west = rendered[asset["id"]]["west"]
        north = rendered[asset["id"]]["north"]
        west_anchor = rendered[asset["id"]]["west_anchor"]
        north_anchor = rendered[asset["id"]]["north_anchor"]
        assert isinstance(west, Image.Image) and isinstance(north, Image.Image)
        assert isinstance(west_anchor, tuple) and isinstance(north_anchor, tuple)
        for column, material in enumerate(WALL_MATERIALS):
            wall = Image.open(wall_sample_path(asset, material)).convert("RGBA")
            x = left + column * cell_w + 82
            canvas.alpha_composite(wall, (x, y))
            west_target = wall_local_target(asset, "west")
            north_target = wall_local_target(asset, "north")
            west_on_wall = supported_wall_proof_layer(asset, "west", west, west_anchor)
            north_on_wall = supported_wall_proof_layer(asset, "north", north, north_anchor)
            canvas.alpha_composite(west_on_wall, (x + west_target[0] - west_anchor[0], y + west_target[1] - west_anchor[1]))
            canvas.alpha_composite(north_on_wall, (x + north_target[0] - north_anchor[0], y + north_target[1] - north_anchor[1]))
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PROOF_DIR / "mirror-wall-material-proof.png")


def write_mirror_layer_proof(rendered: dict[str, dict[str, object]]) -> None:
    mirrors = [asset for asset in ASSETS if asset["kind"] == "mirror"]
    label_w, panel_w, row_h, top = 100, 180, 160, 28
    canvas = Image.new("RGBA", (label_w + panel_w * 3, top + row_h * len(mirrors)), (10, 16, 22, 255))
    draw = ImageDraw.Draw(canvas)
    for column, label in enumerate(("frame foreground", "glass underlay", "recombined")):
        draw.text((label_w + column * panel_w + 12, 8), label, fill=(180, 205, 225, 255))
    for row, asset in enumerate(mirrors):
        y0 = top + row * row_h
        draw.text((8, y0 + 72), asset["label"], fill=(220, 235, 245, 255))
        frame = rendered[asset["id"]]["west_frame"]
        glass = rendered[asset["id"]]["west_glass"]
        full = rendered[asset["id"]]["west"]
        assert isinstance(frame, Image.Image) and isinstance(glass, Image.Image) and isinstance(full, Image.Image)
        for column, image in enumerate((frame, glass, full)):
            x0 = label_w + column * panel_w
            draw_checker(draw, (x0 + 6, y0 + 6, x0 + panel_w - 7, y0 + row_h - 7))
            scale = max(1, min(3, (panel_w - 20) // image.width, (row_h - 20) // image.height))
            preview = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
            canvas.alpha_composite(preview, (x0 + (panel_w - preview.width) // 2, y0 + (row_h - preview.height) // 2))
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PROOF_DIR / "mirror-layer-split-proof.png")


def project_grid_point(point: tuple[int, int]) -> tuple[int, int]:
    x, y = point
    return ((x - y) * GRID_STEP[0], (x + y) * GRID_STEP[1])


def proof_unit_local_offset() -> tuple[float, float]:
    seat_w = PROOF_UNIT_SEAT_SIZE[0] * PROOF_UNIT_NATIVE_SCALE
    seat_h = PROOF_UNIT_SEAT_SIZE[1] * PROOF_UNIT_NATIVE_SCALE
    return (
        -PROOF_UNIT_CONTACT_ANCHOR[0] * seat_w + (seat_w - PROOF_UNIT_DRAW_SIZE[0]) / 2,
        -PROOF_UNIT_CONTACT_ANCHOR[1] * seat_h + (seat_h - PROOF_UNIT_DRAW_SIZE[1]) / 2,
    )


def load_pinned_proof_unit(path: Path, expected_bbox: tuple[int, int, int, int] | None = None) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"missing immutable accepted-unit proof input: {path}")
    actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_hash != PROOF_INPUT_SHA256[path]:
        raise RuntimeError(f"accepted-unit proof input hash drifted: {path}")
    unit = Image.open(path).convert("RGBA")
    if unit.size != PROOF_UNIT_DRAW_SIZE:
        raise RuntimeError(f"accepted-unit proof input size drifted: {path}")
    if expected_bbox and unit.getchannel("A").getbbox() != expected_bbox:
        raise RuntimeError(f"accepted-unit proof input visible bounds drifted: {path}")
    return unit


def exact_gallery_geometry(
    asset: dict,
    rendered: dict[str, object],
    face: str,
    reflected: Image.Image,
) -> dict[str, object]:
    """Reproduce the runtime's fixed grid reflection and slot transform without fitting."""
    full = rendered[face]
    aperture = rendered[f"{face}_aperture"]
    face_anchor = rendered[f"{face}_anchor"]
    assert isinstance(full, Image.Image) and isinstance(aperture, list) and isinstance(face_anchor, tuple)

    slot_x, slot_y = asset[f"{face}_target"]
    if slot_y != PROOF_GROUNDED_SLOT_Y:
        raise RuntimeError(
            f"gallery {face} slot y={slot_y} moved off grounded baseline {PROOF_GROUNDED_SLOT_Y}"
        )
    target_grid = (0, 1) if face == "west" else (1, 0)
    target_seat = project_grid_point(target_grid)
    face_origin = (
        target_seat[0] - WALL_ART_SLOT_ANCHOR[0] + slot_x - face_anchor[0],
        target_seat[1] - WALL_ART_SLOT_ANCHOR[1] + slot_y - face_anchor[1],
    )
    first_wall_origin = (
        target_seat[0] - WALL_ANCHOR[0],
        target_seat[1] - WALL_ANCHOR[1],
    )
    wall_origins: list[tuple[int, int]] = []
    for index in range(asset["span"]):
        grid = (target_grid[0], target_grid[1] + index) if face == "west" else (target_grid[0] + index, target_grid[1])
        seat = project_grid_point(grid)
        wall_origins.append((
            seat[0] - WALL_ANCHOR[0] - first_wall_origin[0],
            seat[1] - WALL_ANCHOR[1] - first_wall_origin[1],
        ))

    local_left, local_top = proof_unit_local_offset()
    physical_seat = project_grid_point(PROOF_SUBJECT_GRID)
    physical_origin = (
        physical_seat[0] + local_left - first_wall_origin[0],
        physical_seat[1] + local_top - first_wall_origin[1],
    )
    reflected_grid = (-1 - PROOF_SUBJECT_GRID[0], PROOF_SUBJECT_GRID[1]) if face == "west" else (PROOF_SUBJECT_GRID[0], -1 - PROOF_SUBJECT_GRID[1])
    reflected_seat = project_grid_point(reflected_grid)
    reflected_origin = (
        reflected_seat[0] - local_left - PROOF_UNIT_DRAW_SIZE[0] - first_wall_origin[0],
        reflected_seat[1] + local_top - first_wall_origin[1],
    )
    face_local_origin = (
        face_origin[0] - first_wall_origin[0],
        face_origin[1] - first_wall_origin[1],
    )
    reflected_face_origin = (
        reflected_origin[0] - face_local_origin[0],
        reflected_origin[1] - face_local_origin[1],
    )

    aperture_mask = Image.new("L", full.size, 0)
    ImageDraw.Draw(aperture_mask).polygon(aperture_points(full, aperture), fill=255)
    support_segments = wall_support_segments(face, target_grid, asset["span"])
    support_mask = wall_support_mask(full.size, face_origin, support_segments)
    supported_aperture_mask = ImageChops.multiply(aperture_mask, support_mask)
    reflection_layer = Image.new("RGBA", full.size, (0, 0, 0, 0))
    proof_draw_origin = (round(reflected_face_origin[0]), round(reflected_face_origin[1]))
    reflection_layer.alpha_composite(reflected, proof_draw_origin)
    unclipped_alpha = reflection_layer.getchannel("A")
    clipped_alpha = ImageChops.multiply(unclipped_alpha, supported_aperture_mask)
    if sum(clipped_alpha.tobytes()) != sum(unclipped_alpha.tobytes()):
        raise RuntimeError(
            f"gallery {face} exact reflected anchor {reflected_face_origin} clips the limiting "
            "accepted raster at its authored aperture or bounded wall support"
        )
    reflection_layer.putalpha(clipped_alpha)

    wall_bounds = (
        min(x for x, _ in wall_origins),
        min(y for _, y in wall_origins),
        max(x + WALL_FRAME[0] for x, _ in wall_origins),
        max(y + WALL_FRAME[1] for _, y in wall_origins),
    )
    face_bbox = alpha_bbox(full)
    placed_face_bbox = (
        face_local_origin[0] + face_bbox[0],
        face_local_origin[1] + face_bbox[1],
        face_local_origin[0] + face_bbox[2],
        face_local_origin[1] + face_bbox[3],
    )
    if not (
        wall_bounds[0] <= placed_face_bbox[0]
        and wall_bounds[1] <= placed_face_bbox[1]
        and placed_face_bbox[2] <= wall_bounds[2]
        and placed_face_bbox[3] <= wall_bounds[3]
    ):
        raise RuntimeError(f"gallery {face} frame {placed_face_bbox} escapes canonical wall assembly {wall_bounds}")

    return {
        "target_grid": target_grid,
        "wall_origins": wall_origins,
        "face_local_origin": face_local_origin,
        "physical_origin": physical_origin,
        "physical_seat": (
            physical_seat[0] - first_wall_origin[0],
            physical_seat[1] - first_wall_origin[1],
        ),
        "reflected_grid": reflected_grid,
        "reflected_origin": reflected_origin,
        "reflected_seat": (
            reflected_seat[0] - first_wall_origin[0],
            reflected_seat[1] - first_wall_origin[1],
        ),
        "reflected_face_origin": reflected_face_origin,
        "reflection_layer": reflection_layer,
        "support_mask": support_mask,
        "support_seams": [
            (
                (segment["start"][0] - first_wall_origin[0], segment["start"][1] - first_wall_origin[1]),
                (segment["end"][0] - first_wall_origin[0], segment["end"][1] - first_wall_origin[1]),
            )
            for segment in support_segments
        ],
        "face_top_headroom": face_local_origin[1],
    }


def draw_cross(draw: ImageDraw.ImageDraw, point: tuple[float, float], fill: tuple[int, int, int, int]) -> None:
    x, y = round(point[0]), round(point[1])
    draw.line((x - 3, y, x + 3, y), fill=fill, width=1)
    draw.line((x, y - 3, x, y + 3), fill=fill, width=1)


def write_full_unit_fit_proof(rendered: dict[str, dict[str, object]]) -> None:
    reflected = load_pinned_proof_unit(PROOF_REFLECTION_UNIT, PROOF_REFLECTION_VISIBLE_BOUNDS).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    physical_units = {face: load_pinned_proof_unit(path) for face, path in PROOF_PHYSICAL_UNITS.items()}
    asset = next(asset for asset in ASSETS if asset["id"] == "mirror-grand-gallery")
    gallery = rendered[asset["id"]]
    panel_w, panel_h = 420, 380
    canvas = Image.new("RGBA", (panel_w * 2, panel_h), (10, 16, 22, 255))
    draw = ImageDraw.Draw(canvas)
    directions = {"west": "physical SE; reflected SW via NE + flip", "north": "physical NW; reflected SW via NE + flip"}

    for column, face in enumerate(("west", "north")):
        x0 = column * panel_w
        full = gallery[face]
        frame = gallery[f"{face}_frame"]
        glass = gallery[f"{face}_glass"]
        aperture = gallery[f"{face}_aperture"]
        assert isinstance(full, Image.Image) and isinstance(frame, Image.Image) and isinstance(glass, Image.Image)
        assert isinstance(aperture, list)
        geometry = exact_gallery_geometry(asset, gallery, face, reflected)
        wall_origins = geometry["wall_origins"]
        face_origin = geometry["face_local_origin"]
        physical_origin = geometry["physical_origin"]
        reflected_origin = geometry["reflected_origin"]
        assert isinstance(wall_origins, list) and isinstance(face_origin, tuple)
        assert isinstance(physical_origin, tuple) and isinstance(reflected_origin, tuple)

        min_x = min(
            min(x for x, _ in wall_origins),
            face_origin[0],
            physical_origin[0],
            reflected_origin[0],
        )
        max_x = max(
            max(x + WALL_FRAME[0] for x, _ in wall_origins),
            face_origin[0] + full.width,
            physical_origin[0] + PROOF_UNIT_DRAW_SIZE[0],
            reflected_origin[0] + PROOF_UNIT_DRAW_SIZE[0],
        )
        shift = (round(x0 + panel_w / 2 - (min_x + max_x) / 2), 22)
        wall_path = ROOT / "frontend" / "public" / "assets" / "tiles" / "feature" / f"wall-stone-{'8' if face == 'west' else '1'}.png"
        wall = Image.open(wall_path).convert("RGBA")
        if wall.size != WALL_FRAME:
            raise RuntimeError(f"canonical wall proof input has size {wall.size}, expected {WALL_FRAME}")
        for wall_x, wall_y in wall_origins:
            canvas.alpha_composite(wall, (shift[0] + wall_x, shift[1] + wall_y))
            draw.line(
                (shift[0] + wall_x, shift[1] + wall_y, shift[0] + wall_x + WALL_FRAME[0] - 1, shift[1] + wall_y),
                fill=(96, 125, 146, 190),
                width=1,
            )

        draw_face_origin = (shift[0] + face_origin[0], shift[1] + face_origin[1])
        support_mask = geometry["support_mask"]
        assert isinstance(support_mask, Image.Image)
        canvas.alpha_composite(apply_alpha_mask(glass, support_mask), draw_face_origin)
        reflection_layer = geometry["reflection_layer"]
        assert isinstance(reflection_layer, Image.Image)
        canvas.alpha_composite(reflection_layer, draw_face_origin)
        canvas.alpha_composite(apply_alpha_mask(frame, support_mask), draw_face_origin)
        physical_draw_origin = (shift[0] + round(physical_origin[0]), shift[1] + round(physical_origin[1]))
        canvas.alpha_composite(physical_units[face], physical_draw_origin)

        aperture_overlay = Image.new("RGBA", full.size, (0, 0, 0, 0))
        local_points = aperture_points(full, aperture)
        ImageDraw.Draw(aperture_overlay).line(local_points + [local_points[0]], fill=(83, 231, 255, 255), width=1)
        aperture_overlay.putalpha(ImageChops.multiply(aperture_overlay.getchannel("A"), support_mask))
        canvas.alpha_composite(aperture_overlay, draw_face_origin)
        support_seams = geometry["support_seams"]
        assert isinstance(support_seams, list)
        for seam_start, seam_end in support_seams:
            draw.line(
                (
                    shift[0] + seam_start[0], shift[1] + seam_start[1],
                    shift[0] + seam_end[0], shift[1] + seam_end[1],
                ),
                fill=(83, 231, 255, 255),
                width=1,
            )
        draw.rectangle(
            (*physical_draw_origin, physical_draw_origin[0] + PROOF_UNIT_DRAW_SIZE[0] - 1, physical_draw_origin[1] + PROOF_UNIT_DRAW_SIZE[1] - 1),
            outline=(255, 216, 72, 255),
            width=1,
        )
        reflected_draw_origin = (shift[0] + round(reflected_origin[0]), shift[1] + round(reflected_origin[1]))
        draw.rectangle(
            (*reflected_draw_origin, reflected_draw_origin[0] + PROOF_UNIT_DRAW_SIZE[0] - 1, reflected_draw_origin[1] + PROOF_UNIT_DRAW_SIZE[1] - 1),
            outline=(193, 131, 255, 255),
            width=1,
        )
        physical_seat = geometry["physical_seat"]
        reflected_seat = geometry["reflected_seat"]
        assert isinstance(physical_seat, tuple) and isinstance(reflected_seat, tuple)
        draw_cross(draw, (shift[0] + physical_seat[0], shift[1] + physical_seat[1]), (255, 216, 72, 255))
        draw_cross(draw, (shift[0] + reflected_seat[0], shift[1] + reflected_seat[1]), (193, 131, 255, 255))

        reflected_face_origin = geometry["reflected_face_origin"]
        assert isinstance(reflected_face_origin, tuple)
        draw.text((x0 + 8, 5), f"{face}: grounded grid reflection at slot y={PROOF_GROUNDED_SLOT_Y}", fill=(220, 235, 245, 255))
        draw.text((x0 + 8, 332), directions[face], fill=(180, 205, 225, 255))
        draw.text(
            (x0 + 8, 347),
            f"limiting 57x67 NE draw at face ({reflected_face_origin[0]:.3f},{reflected_face_origin[1]:.3f}); alpha preserved",
            fill=(125, 190, 210, 255),
        )
        draw.text(
            (x0 + 8, 362),
            f"wall-face mask ends frame/glass/reflection at cyan floor seam; top +{geometry['face_top_headroom']}px",
            fill=(125, 170, 200, 255),
        )
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PROOF_DIR / "mirror-full-unit-fit-proof.png")


def write_manifest(rendered: dict[str, dict[str, object]]) -> None:
    manifest = {
        "generatedBy": "frontend/scripts/build-wall-decor.py",
        "source": "docs/art/wall-art-concepts/codex/<id>-alpha.png",
        "sourceOverrides": {
            asset["id"]: f"docs/art/wall-art-concepts/codex/{asset['source']}"
            for asset in ASSETS if asset.get("source")
        },
        "imageRendering": "pixelated",
        "assets": [
            {
                "id": asset["id"],
                "label": asset["label"],
                "kind": asset["kind"],
                "badge": asset["badge"],
                **({"mirrorCoverage": asset["mirror_coverage"]} if asset["kind"] == "mirror" else {}),
                "src": f"/assets/wall-decor/{asset['id']}.png",
                "width": rendered[asset["id"]]["source"].width,
                "height": rendered[asset["id"]]["source"].height,
                "mountX": asset["mount"][0],
                "mountY": asset["mount"][1],
                "faces": {
                    "west": {
                        "src": f"/assets/wall-decor/{asset['id']}-west.png",
                        "width": rendered[asset["id"]]["west"].width,
                        "height": rendered[asset["id"]]["west"].height,
                        "mountX": rendered[asset["id"]]["west_anchor"][0],
                        "mountY": rendered[asset["id"]]["west_anchor"][1],
                        "previewX": asset["west_target"][0],
                        "previewY": asset["west_target"][1],
                        **({
                            "glassSrc": f"/assets/wall-decor/{asset['id']}-west-glass.png",
                            "aperture": rendered[asset["id"]]["west_aperture"],
                        } if asset["kind"] == "mirror" else {}),
                    },
                    "north": {
                        "src": f"/assets/wall-decor/{asset['id']}-north.png",
                        "width": rendered[asset["id"]]["north"].width,
                        "height": rendered[asset["id"]]["north"].height,
                        "mountX": rendered[asset["id"]]["north_anchor"][0],
                        "mountY": rendered[asset["id"]]["north_anchor"][1],
                        "previewX": asset["north_target"][0],
                        "previewY": asset["north_target"][1],
                        **({
                            "glassSrc": f"/assets/wall-decor/{asset['id']}-north-glass.png",
                            "aperture": rendered[asset["id"]]["north_aperture"],
                        } if asset["kind"] == "mirror" else {}),
                    },
                },
                "method": asset.get("method") or (
                    "Codex built-in image_gen img2img + chroma-key alpha + deterministic projection + aperture layer split"
                    if asset["kind"] == "mirror"
                    else "Codex built-in image_gen img2img + chroma-key alpha + deterministic frame normalization"
                ),
                "notes": asset["notes"],
            }
            for asset in ASSETS
        ],
    }
    manifest_json = json.dumps(manifest, indent=2) + "\n"
    (OUT_DIR / "manifest.json").write_text(manifest_json, encoding="utf-8")
    PACKAGE_MANIFEST.write_text(manifest_json, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rendered: dict[str, dict[str, object]] = {}
    for asset in ASSETS:
        source = normalize(asset)
        west, west_anchor, west_aperture = project_to_wall_face(source, asset, "west")
        north, north_anchor, north_aperture = project_to_wall_face(source, asset, "north")
        assert_full_unit_aperture(asset, "west", west, west_aperture)
        assert_full_unit_aperture(asset, "north", north, north_aperture)
        west_frame, west_glass = split_mirror_face(west, west_aperture) if west_aperture else (west, None)
        north_frame, north_glass = split_mirror_face(north, north_aperture) if north_aperture else (north, None)
        source.save(OUT_DIR / f"{asset['id']}.png")
        west_frame.save(OUT_DIR / f"{asset['id']}-west.png")
        north_frame.save(OUT_DIR / f"{asset['id']}-north.png")
        if west_glass and north_glass:
            west_glass.save(OUT_DIR / f"{asset['id']}-west-glass.png")
            north_glass.save(OUT_DIR / f"{asset['id']}-north-glass.png")
        rendered[asset["id"]] = {
            "source": source,
            "west": west,
            "north": north,
            "west_frame": west_frame,
            "north_frame": north_frame,
            "west_glass": west_glass,
            "north_glass": north_glass,
            "west_anchor": west_anchor,
            "north_anchor": north_anchor,
            "west_aperture": west_aperture,
            "north_aperture": north_aperture,
        }
    write_manifest(rendered)
    write_contact_sheet(rendered)
    write_runtime_proof(rendered)
    write_mirror_material_proof(rendered)
    write_mirror_layer_proof(rendered)
    write_full_unit_fit_proof(rendered)
    print(f"built wall decor ({', '.join(asset['id'] for asset in ASSETS)}) -> {OUT_DIR}")


if __name__ == "__main__":
    main()
