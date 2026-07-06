"""Normalize generated wall-decor sprites into runtime assets and proof sheets.

Input source sprites are transparent PNGs from forge-wall-decor.mjs:

  docs/art/wall-art-concepts/codex/<id>-alpha.png

Outputs:

  frontend/public/assets/wall-decor/<id>.png
  frontend/public/assets/wall-decor/<id>-west.png
  frontend/public/assets/wall-decor/<id>-north.png
  frontend/public/assets/wall-decor/manifest.json
  frontend/src/ui/design/wallDecorManifest.json
  docs/art/wall-art-concepts/wall-decor-contact-sheet.png
  docs/art/wall-art-concepts/proofs/wall-decor-runtime-proof.png
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "art" / "wall-art-concepts"
SRC_DIR = DOCS / "codex"
PROOF_DIR = DOCS / "proofs"
OUT_DIR = ROOT / "frontend" / "public" / "assets" / "wall-decor"
UI_MANIFEST = ROOT / "frontend" / "src" / "ui" / "design" / "wallDecorManifest.json"
WALL_SAMPLE = ROOT / "frontend" / "public" / "assets" / "tiles" / "feature" / "wall-stone-9.png"

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
    src = SRC_DIR / f"{asset['id']}-alpha.png"
    if not src.exists():
        raise FileNotFoundError(f"missing generated source: {src}")
    img = Image.open(src).convert("RGBA")
    crop = img.crop(alpha_bbox(img))
    fitted = crop.resize(fit_size(crop.size, asset["fit"]), Image.Resampling.LANCZOS)
    frame_w, frame_h = asset["frame"]
    out = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    out.alpha_composite(fitted, ((frame_w - fitted.width) // 2, (frame_h - fitted.height) // 2))
    return out


def project_to_wall_face(src: Image.Image, asset: dict, face: str) -> tuple[Image.Image, tuple[int, int]]:
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
    mount_x, mount_y = asset["mount"]
    local_mount_x = mount_x / frame_w * target_w
    local_mount_y = mount_y / frame_h * target_h
    mapped_mount_x = local_mount_x
    mapped_mount_y = local_mount_x * slope + local_mount_y
    anchor = (
        round(mapped_mount_x - min_x - bbox[0]),
        round(mapped_mount_y - min_y - bbox[1]),
    )
    return crop, anchor


def draw_checker(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    step = 8
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            c = (18, 27, 38, 255) if ((x // step + y // step) % 2 == 0) else (10, 16, 24, 255)
            draw.rectangle((x, y, min(x + step - 1, x1), min(y + step - 1, y1)), fill=c)


def write_contact_sheet(rendered: dict[str, dict[str, object]]) -> None:
    cell_w, cell_h = 210, 280
    sheet = Image.new("RGBA", (cell_w * len(ASSETS), cell_h), (10, 16, 22, 255))
    draw = ImageDraw.Draw(sheet)
    wall = Image.open(WALL_SAMPLE).convert("RGBA")
    for index, asset in enumerate(ASSETS):
        x0 = index * cell_w
        draw.text((x0 + 10, 8), asset["label"], fill=(230, 242, 255, 255))
        checker = (x0 + 24, 30, x0 + 186, 132)
        draw_checker(draw, checker)
        sprite = rendered[asset["id"]]["source"]
        assert isinstance(sprite, Image.Image)
        sheet.alpha_composite(sprite, (x0 + 66 - sprite.width // 2, 82 - sprite.height // 2))
        west = rendered[asset["id"]]["west"]
        west_anchor = rendered[asset["id"]]["west_anchor"]
        assert isinstance(west, Image.Image)
        assert isinstance(west_anchor, tuple)
        sheet.alpha_composite(west, (x0 + 150 - west_anchor[0], 78 - west_anchor[1]))

        wall_small = wall.resize((96, 180), Image.Resampling.NEAREST)
        sheet.alpha_composite(wall_small, (x0 + 57, 78))
        west_target = tuple(round(v * 0.75) for v in asset["west_target"])
        sheet.alpha_composite(west, (x0 + 57 + west_target[0] - west_anchor[0], 78 + west_target[1] - west_anchor[1]))
        draw.text((x0 + 10, 256), f"{asset['kind']} / {asset['badge']}", fill=(125, 170, 200, 255))
    sheet.save(DOCS / "wall-decor-contact-sheet.png")


def write_runtime_proof(rendered: dict[str, dict[str, object]]) -> None:
    wall = Image.open(WALL_SAMPLE).convert("RGBA")
    canvas = Image.new("RGBA", (560, 360), (12, 18, 24, 255))
    placements = [(20, 34), (154, 34), (288, 34), (422, 34)]
    for asset, (x, y) in zip(ASSETS, placements):
        canvas.alpha_composite(wall, (x, 24))
        west = rendered[asset["id"]]["west"]
        north = rendered[asset["id"]]["north"]
        west_anchor = rendered[asset["id"]]["west_anchor"]
        north_anchor = rendered[asset["id"]]["north_anchor"]
        assert isinstance(west, Image.Image) and isinstance(north, Image.Image)
        assert isinstance(west_anchor, tuple) and isinstance(north_anchor, tuple)
        canvas.alpha_composite(west, (x + asset["west_target"][0] - west_anchor[0], 24 + asset["west_target"][1] - west_anchor[1]))
        canvas.alpha_composite(north, (x + asset["north_target"][0] - north_anchor[0], 24 + asset["north_target"][1] - north_anchor[1]))
    PROOF_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PROOF_DIR / "wall-decor-runtime-proof.png")


def write_manifest(rendered: dict[str, dict[str, object]]) -> None:
    manifest = {
        "generatedBy": "frontend/scripts/build-wall-decor.py",
        "source": "docs/art/wall-art-concepts/codex/<id>-alpha.png",
        "imageRendering": "pixelated",
        "assets": [
            {
                "id": asset["id"],
                "label": asset["label"],
                "kind": asset["kind"],
                "badge": asset["badge"],
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
                    },
                    "north": {
                        "src": f"/assets/wall-decor/{asset['id']}-north.png",
                        "width": rendered[asset["id"]]["north"].width,
                        "height": rendered[asset["id"]]["north"].height,
                        "mountX": rendered[asset["id"]]["north_anchor"][0],
                        "mountY": rendered[asset["id"]]["north_anchor"][1],
                        "previewX": asset["north_target"][0],
                        "previewY": asset["north_target"][1],
                    },
                },
                "method": "Codex img2img + chroma-key alpha + deterministic frame normalization",
                "notes": asset["notes"],
            }
            for asset in ASSETS
        ],
    }
    manifest_json = json.dumps(manifest, indent=2) + "\n"
    (OUT_DIR / "manifest.json").write_text(manifest_json, encoding="utf-8")
    UI_MANIFEST.write_text(manifest_json, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rendered: dict[str, dict[str, object]] = {}
    for asset in ASSETS:
        source = normalize(asset)
        west, west_anchor = project_to_wall_face(source, asset, "west")
        north, north_anchor = project_to_wall_face(source, asset, "north")
        source.save(OUT_DIR / f"{asset['id']}.png")
        west.save(OUT_DIR / f"{asset['id']}-west.png")
        north.save(OUT_DIR / f"{asset['id']}-north.png")
        rendered[asset["id"]] = {
            "source": source,
            "west": west,
            "north": north,
            "west_anchor": west_anchor,
            "north_anchor": north_anchor,
        }
    write_manifest(rendered)
    write_contact_sheet(rendered)
    write_runtime_proof(rendered)
    print(f"built wall decor ({', '.join(asset['id'] for asset in ASSETS)}) -> {OUT_DIR}")


if __name__ == "__main__":
    main()
