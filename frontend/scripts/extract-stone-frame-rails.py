#!/usr/bin/env python
"""Extract long rail candidates from generated full-frame stone boxes.

The source art is a sheet of complete homogeneous frames. Chrome Lab still
composes boxes from rails plus optional atom overlays, so this script treats each
full frame as the authoritative art source and extracts its top rail as a long
horizontal candidate. Atoms may later cover the rendered corners.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable

from PIL import Image


FRONTEND = Path(__file__).resolve().parent.parent
SOURCE_REL = "public/assets/ui/chrome-candidates/codex-stone-frames-v1/stone-base-frames-sheet.png"
OUT_ROOT = FRONTEND / "public" / "assets" / "ui" / "chrome-candidates" / "exploded"
OUT_DIR = OUT_ROOT / "stone-base-frames-v1"
MANIFEST_PATH = FRONTEND / "src" / "ui" / "chromeCandidateManifest.json"


@dataclass(frozen=True)
class FrameSpec:
    role: str
    label: str
    # Approximate crop in source-sheet coordinates. The generated image is stable
    # enough that these regions isolate each box while the local threshold below
    # tightens the rail art to the actual painted pixels.
    box: tuple[int, int, int, int]


FRAME_SPECS = [
    FrameSpec("outer", "Outer stone base frame 01", (24, 110, 520, 520)),
    FrameSpec("outer", "Outer stone base frame 02", (560, 110, 925, 520)),
    FrameSpec("outer", "Outer stone base frame 03", (960, 110, 1500, 520)),
    FrameSpec("inner", "Inner stone base frame 01", (24, 615, 525, 890)),
    FrameSpec("inner", "Inner stone base frame 02", (555, 615, 925, 890)),
    FrameSpec("inner", "Inner stone base frame 03", (960, 615, 1500, 890)),
]


def is_frame_pixel(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a < 16:
      return False
    # The sheet background is dark blue/black; frame stone is cool grey.
    return max(r, g, b) > 70 and (r + g + b) > 190


def tight_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    pix = image.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(image.height):
        for x in range(image.width):
            if is_frame_pixel(pix[x, y]):
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError("no frame pixels found")
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def trim_to_content(image: Image.Image) -> Image.Image:
    return image.crop(tight_bbox(image))


def rail_from_frame(frame: Image.Image) -> Image.Image:
    left, top, right, bottom = tight_bbox(frame)
    frame = frame.crop((left, top, right, bottom))
    pix = frame.load()
    row_counts = []
    center_x0 = max(0, int(frame.width * 0.22))
    center_x1 = min(frame.width, int(frame.width * 0.78))
    center_width = max(1, center_x1 - center_x0)
    for y in range(frame.height):
        count = 0
        for x in range(center_x0, center_x1):
            if is_frame_pixel(pix[x, y]):
                count += 1
        row_counts.append(count)

    threshold = max(12, int(center_width * 0.28))
    rows = [index for index, count in enumerate(row_counts) if count >= threshold]
    if not rows:
        raise ValueError("no top rail rows found")

    # Use the first continuous band of strong rows. It includes the plain corner
    # turn material; the runtime rail-underlap and atoms can cover the ends.
    start = rows[0]
    end = start + 1
    rows_set = set(rows)
    while end in rows_set:
        end += 1
    pad = 3
    y0 = max(0, start - pad)
    y1 = min(frame.height, end + pad)
    rail = frame.crop((0, y0, frame.width, y1))
    return trim_to_content(rail)


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text())


def candidate_record(
    spec: FrameSpec,
    index: int,
    rel_file: str,
    rail: Image.Image,
    crop: tuple[int, int, int, int],
    component_count: int,
) -> dict:
    number = f"{index + 1:02d}"
    return {
        "id": f"stone-base-frames-v1-{number}",
        "label": spec.label,
        "role": spec.role,
        "kind": "rail-long",
        "src": f"/assets/ui/chrome-candidates/exploded/{rel_file}",
        "width": rail.width,
        "height": rail.height,
        "sourceSheetId": "stone-base-frames-v1",
        "sourceSheetLabel": "Stone base frames v1",
        "sourceSheetPath": f"/{SOURCE_REL.removeprefix('public/')}",
        "componentIndex": index,
        "componentCount": component_count,
        "crop": {"x": crop[0], "y": crop[1], "w": crop[2] - crop[0], "h": crop[3] - crop[1]},
        "recommended": index == 0,
    }


def without_sheet(sources: Iterable[dict]) -> list[dict]:
    return [source for source in sources if source.get("sourceSheetId") != "stone-base-frames-v1"]


def main() -> None:
    source = Image.open(FRONTEND / SOURCE_REL).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    for index, spec in enumerate(FRAME_SPECS):
        crop = spec.box
        frame = source.crop(crop)
        rail = rail_from_frame(frame)
        number = f"{index + 1:02d}"
        rel_file = f"stone-base-frames-v1/candidate-{number}.png"
        write_png(OUT_ROOT / rel_file, rail)
        records.append(candidate_record(spec, index, rel_file, rail, crop, len(FRAME_SPECS)))
        print(f"{records[-1]['id']}: {rail.width}x{rail.height}")

    manifest = load_manifest()
    manifest["sources"] = [*without_sheet(manifest["sources"]), *records]
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
