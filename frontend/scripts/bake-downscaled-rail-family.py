#!/usr/bin/env python
"""Bake a previously accepted rich chrome source into final-size rail assets.

This is an explicit production bake: a larger source can be downsampled once to
the intended rail thickness, then the app renders the baked result at 100%.
The bake is recorded in the report instead of being hidden in runtime CSS/canvas
scaling.
"""
from pathlib import Path
import json

from PIL import Image

FRONTEND = Path(__file__).resolve().parent.parent
OUT_ROOT = FRONTEND / "public" / "assets" / "ui" / "chrome-candidates" / "native-rails-v1"


def bake_family(
    family_id="outer-v3-01-baked-12px-v1",
    source_rel="public/assets/ui/chrome-candidates/exploded/outer-rails-v3/candidate-01.png",
    thickness=12,
):
    source_path = FRONTEND / source_rel
    source = Image.open(source_path).convert("RGBA")
    scale = thickness / source.height
    baked_width = max(1, round(source.width * scale))
    horizontal = source.resize((baked_width, thickness), Image.Resampling.LANCZOS)
    vertical = horizontal.transpose(Image.Transpose.ROTATE_90)

    out_dir = OUT_ROOT / family_id
    out_dir.mkdir(parents=True, exist_ok=True)
    horizontal.save(out_dir / "rail-horizontal.png")
    vertical.save(out_dir / "rail-vertical.png")

    accepted = [
        {
            "file": "rail-horizontal.png",
            "sourceBounds": {"x": 0, "y": 0, "w": source.width, "h": source.height},
            "src": f"/assets/ui/chrome-candidates/native-rails-v1/{family_id}/rail-horizontal.png",
            "orientation": "horizontal",
            "width": horizontal.width,
            "height": horizontal.height,
            "seam": None,
        },
        {
            "file": "rail-vertical.png",
            "sourceBounds": {"x": 0, "y": 0, "w": source.width, "h": source.height},
            "src": f"/assets/ui/chrome-candidates/native-rails-v1/{family_id}/rail-vertical.png",
            "orientation": "vertical",
            "width": vertical.width,
            "height": vertical.height,
            "seam": None,
        },
    ]
    report = {
        "id": family_id,
        "provider": "controlled-production-downscale",
        "role": "outer",
        "fit": "repeat",
        "nativeThickness": thickness,
        "sourceSheet": f"/{source_rel.replace(chr(92), '/')}",
        "extraction": "lanczos-downscale-once-to-final-rail-thickness",
        "sourceSize": {"width": source.width, "height": source.height},
        "scale": scale,
        "resampled": True,
        "resampleMethod": "lanczos",
        "accepted": accepted,
        "rejected": [],
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{family_id}: baked {source.size} -> {horizontal.size} and {vertical.size}")


if __name__ == "__main__":
    bake_family()
