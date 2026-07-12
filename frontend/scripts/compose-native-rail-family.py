#!/usr/bin/env python
"""Compose native chrome rail families from generated source parts.

This follows the ADR-0066 title-bar pattern: generated orientation-specific
strap atoms are source art, and this script manufactures final native rail
members from them without runtime scaling or cross-attempt pairing.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image

FRONTEND = Path(__file__).resolve().parent.parent
REPO = FRONTEND.parent
TITLEBAR = FRONTEND / "public" / "assets" / "ui" / "titlebar"
OUT_ROOT = FRONTEND / "public" / "assets" / "ui" / "chrome-candidates" / "native-rails-v1"


def load_titlebar(name):
    return Image.open(TITLEBAR / name).convert("RGBA")


def seam(im, axis, period):
    """Find the least-visible repeat seam along an axis for the requested period."""
    pixels = np.asarray(im).astype(float)
    length = pixels.shape[axis]
    if axis == 1:
        score = lambda i: np.abs(pixels[:, i, :] - pixels[:, i + period, :]).mean()
    else:
        score = lambda i: np.abs(pixels[i, :, :] - pixels[i + period, :, :]).mean()
    return min(range(0, length - period), key=score)


def write_report(family_id, provider, native_thickness, accepted):
    out_dir = OUT_ROOT / family_id
    report = {
        "id": family_id,
        "provider": provider,
        "role": "outer",
        "fit": "repeat",
        "nativeThickness": native_thickness,
        "sourceSheet": "/assets/ui/titlebar/atom-strap-h.png + atom-strap-v.png",
        "extraction": "adr-0066-generated-strap-composition-1:1",
        "accepted": accepted,
        "rejected": [],
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n")


def save_member(family_id, file, image, orientation):
    out_dir = OUT_ROOT / family_id
    out_dir.mkdir(parents=True, exist_ok=True)
    image.save(out_dir / file)
    return {
        "file": file,
        "sourceBounds": {"x": 0, "y": 0, "w": image.width, "h": image.height},
        "src": f"/assets/ui/chrome-candidates/native-rails-v1/{family_id}/{file}",
        "orientation": orientation,
        "width": image.width,
        "height": image.height,
        "seam": None,
    }


def compose_strap_only(family_id="outer-forged-strap-native-v1", thickness=12, period=24):
    horizontal_source = load_titlebar("atom-strap-h.png")
    horizontal_source = horizontal_source.resize(
        (round(horizontal_source.width * thickness / horizontal_source.height), thickness),
        Image.LANCZOS,
    )
    horizontal_x = seam(horizontal_source, 1, period)
    horizontal = horizontal_source.crop((horizontal_x, 0, horizontal_x + period, thickness))

    vertical_source = load_titlebar("atom-strap-v.png")
    vertical_source = vertical_source.resize(
        (thickness, round(vertical_source.height * thickness / vertical_source.width)),
        Image.LANCZOS,
    )
    vertical_y = seam(vertical_source, 0, period)
    vertical = vertical_source.crop((0, vertical_y, thickness, vertical_y + period))

    accepted = [
        save_member(family_id, "strap-horizontal.png", horizontal, "horizontal"),
        save_member(family_id, "strap-vertical.png", vertical, "vertical"),
    ]
    write_report(family_id, "titlebar-generated-strap-atoms", thickness, accepted)
    print(f"{family_id}: composed {horizontal.size} and {vertical.size}")


if __name__ == "__main__":
    compose_strap_only()
