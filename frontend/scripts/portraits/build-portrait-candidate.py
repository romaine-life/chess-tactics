"""Build one portrait candidate from explicitly fetched live-media sources.

This retains the reusable portrait treatment algorithms but owns no source or
accepted asset path. It writes one file beneath the OS temporary directory; the
caller then uploads that file with ``live-media-admin-client.mjs upload-candidate``.

Examples::

  python build-portrait-candidate.py pawn filter2 \
    --smooth C:/Temp/pawn-navy.png --out C:/Temp/pawn-filter2.png

  python build-portrait-candidate.py pawn codex-stone \
    --smooth C:/Temp/pawn-navy.png --style-anchor C:/Temp/pawn-board.png \
    --out C:/Temp/pawn-codex-stone.png
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image


PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"]
CANVAS = 768
FILTER_PARAMS = {"filter2": (150, 24), "filter3": (100, 16)}


def load_rgba(path):
    return Image.open(path).convert("RGBA")


def pixel_filter(im, logical, ncolors):
    """Pixelate and palette-quantize opaque pixels while preserving alpha."""
    rgb = im.convert("RGB")
    small = rgb.resize((logical, logical), Image.NEAREST)
    small = small.quantize(colors=ncolors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
    pix = small.resize((CANVAS, CANVAS), Image.NEAREST)
    out = pix.convert("RGBA")
    alpha = im.split()[3].resize((logical, logical), Image.NEAREST).point(lambda value: 255 if value >= 128 else 0)
    out.putalpha(alpha.resize((CANVAS, CANVAS), Image.NEAREST))
    return out


def normalize_to_ref(candidate, ref_bbox):
    """Normalize a candidate's opaque bounds to the fetched smooth master."""
    candidate_bbox = candidate.split()[3].getbbox()
    if not candidate_bbox:
        return candidate
    content = candidate.crop(candidate_bbox)
    rx0, ry0, rx1, ry1 = ref_bbox
    ref_height = ry1 - ry0
    scale = ref_height / content.height
    new_width = max(1, round(content.width * scale))
    content = content.resize((new_width, ref_height), Image.LANCZOS)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ref_center_x = (rx0 + rx1) // 2
    out.alpha_composite(content, (ref_center_x - new_width // 2, ry0))
    return out


def resolve_codex():
    configured = os.environ.get("CODEX_BIN")
    if configured and os.path.exists(configured):
        return configured
    found = sorted(
        glob.glob(os.path.expanduser(r"~/AppData/Local/OpenAI/Codex/bin/*/codex.exe")),
        key=os.path.getmtime,
    )
    return found[-1] if found else None


def codex_restyle(piece, style, structure, anchor):
    """Generate a chroma-keyed RGBA restyle from two fetched source images."""
    codex = resolve_codex()
    if not codex:
        raise RuntimeError("Codex CLI not found")
    generated_images = Path.home() / ".codex" / "generated_images"
    remove_chroma = Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"
    if not remove_chroma.is_file():
        raise FileNotFoundError(f"missing imagegen chroma-key helper: {remove_chroma}")

    if style == "stone":
        style_desc = (
            "a carved navy-blue STONE body with a clean limited palette (~16-24 colors), crisp blocky "
            "pixel clusters, hand-placed dithering and a dark readable outline. PRESERVE the original "
            "warm and metallic accents from image 1 exactly where they are: gold remains gold, red "
            "velvet remains red, and jewels keep their colour; only the plain body is navy stone."
        )
    else:
        style_desc = (
            "an ornate pixel-art PORTRAIT with a clean limited palette (~24-32 colors), crisp pixel "
            "clusters, an ivory carved body, gold trim, deep navy accents, and a dark readable outline."
        )

    prompt = f"""You are given two images.

IMAGE 1 is a full-body 3D render of a chess {piece}. Use its exact shape, pose,
proportions, scale, framing and position. IMAGE 2 is a style reference only.

Produce the same {piece} from image 1 as 2D pixel art in this style: {style_desc}
Do not crop, re-pose, re-center, zoom, or resize it. No text, UI, or shadow.
Render on a flat #ff00ff background; do not use magenta inside the piece. Produce
exactly one image with image_generation and do not write or move files."""

    with tempfile.TemporaryDirectory(prefix=f"portrait-{piece}-{style}-") as work_name:
        work = Path(work_name)
        completed = subprocess.run(
            [codex, "exec", "--json", "-s", "workspace-write", "--skip-git-repo-check",
             "-C", str(work), "-i", str(structure), "-i", str(anchor)],
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=900,
        )
        match = re.search(r'"thread_id":"([0-9a-f-]+)"', completed.stdout + completed.stderr)
        if not match:
            raise RuntimeError("Codex image generation returned no thread id\n" + (completed.stdout + completed.stderr)[-1200:])
        thread_dir = generated_images / match.group(1)
        images = []
        for _ in range(40):
            images = sorted(thread_dir.glob("ig_*.png"), key=lambda path: path.stat().st_mtime)
            if images:
                break
            time.sleep(2)
        if not images:
            raise RuntimeError(f"no generated image in {thread_dir}")
        raw = images[-1]
        for _ in range(40):
            try:
                with Image.open(raw) as image:
                    image.load()
                break
            except Exception:
                time.sleep(0.4)
        else:
            raise RuntimeError(f"generated image never became decodable: {raw}")
        keyed = work / "keyed.png"
        subprocess.run(
            [sys.executable, str(remove_chroma), "--input", str(raw), "--out", str(keyed),
             "--auto-key", "border", "--soft-matte", "--transparent-threshold", "12",
             "--opaque-threshold", "220", "--despill"],
            check=True,
        )
        return load_rgba(keyed)


def require_temp_output(path):
    resolved = path.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        resolved.relative_to(temp_root)
    except ValueError as error:
        raise ValueError(f"--out must be beneath the OS temporary directory {temp_root}: {resolved}") from error
    return resolved


def build(args):
    smooth = load_rgba(args.smooth)
    if smooth.size != (CANVAS, CANVAS):
        raise ValueError(f"smooth master must be {CANVAS}x{CANVAS}, got {smooth.size}")
    ref_bbox = smooth.split()[3].getbbox()
    if not ref_bbox:
        raise ValueError("smooth master has no opaque portrait pixels")

    if args.method in FILTER_PARAMS:
        logical, ncolors = FILTER_PARAMS[args.method]
        candidate = pixel_filter(smooth, logical, ncolors)
    elif args.method in ("codex-stone", "codex-concept"):
        if not args.style_anchor:
            raise ValueError(f"{args.method} requires --style-anchor fetched from live media")
        style = "stone" if args.method == "codex-stone" else "concept"
        candidate = normalize_to_ref(codex_restyle(args.piece, style, args.smooth, args.style_anchor), ref_bbox)
    elif args.method == "codexfilter":
        if not args.codex_stone_source:
            raise ValueError("codexfilter requires --codex-stone-source fetched from live media")
        logical, ncolors = FILTER_PARAMS["filter2"]
        candidate = pixel_filter(load_rgba(args.codex_stone_source), logical, ncolors)
    else:
        raise ValueError(f"unknown method {args.method}")

    out = require_temp_output(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    candidate.save(out)
    print(f"OK {args.piece} {args.method} -> {out} bbox={candidate.split()[3].getbbox()} ref={ref_bbox}")
    print("Upload this file with scripts/live-media-admin-client.mjs upload-candidate.")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("piece", choices=PIECES)
    parser.add_argument("method", choices=[*FILTER_PARAMS, "codex-stone", "codex-concept", "codexfilter"])
    parser.add_argument("--smooth", type=Path, required=True, help="Fetched 768x768 smooth portrait master")
    parser.add_argument("--style-anchor", type=Path, help="Fetched board-stone or concept style reference")
    parser.add_argument("--codex-stone-source", type=Path, help="Fetched codex-stone master for codexfilter")
    parser.add_argument("--out", type=Path, required=True, help="Candidate PNG beneath the OS temporary directory")
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
