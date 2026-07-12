#!/usr/bin/env python3
"""Canonical board-unit raster source pipeline.

This is the only supported entry point for generating board-unit source frames.
Blender owns the model, camera, contact point, and all eight 45-degree facings.
It renders directly into the requested delivery frame. No generated frame is
cropped, resized, resampled, or passed through image generation.

The tool fetches private source media through the generic live-media admin
client into an OS temporary directory. The Unit Art Filter editor reads the raw
frames, applies a same-grid filter, and can upload the reviewed result as an
ordinary storage-backed candidate.

Examples:
  python scripts/generate-unit-art.py render pawn --target 51x61 --renderer-root <code-dir> --source-manifest <temp.json> --api-base http://localhost:3000
  python scripts/generate-unit-art.py render rook --target 57x67 --renderer-root <code-dir> --source-manifest <temp.json> --api-base http://localhost:3000 --force
  python scripts/generate-unit-art.py render all --handoff C:/path/unit-sizes.json --renderer-root <code-dir> --source-manifest <temp.json> --api-base http://localhost:3000
  python scripts/generate-unit-art.py verify pawn --target 51x61
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / ".unit-art-output" / "unit-art"

DIRECTIONS = [
    "south",
    "south-east",
    "east",
    "north-east",
    "north",
    "north-west",
    "west",
    "south-west",
]
DIRECTION_YAWS = {
    "south": 0,
    "south-east": 45,
    "east": 90,
    "north-east": 135,
    "north": 180,
    "north-west": -135,
    "west": -90,
    "south-west": -45,
}

PIECES: dict[str, dict[str, Any]] = {
    "pawn": {
        "label": "Pawn",
        "rendererName": "pawn-helmet/render_pawn_helmet.py",
        "anchor": (0.5, 0.80241),
    },
    "rook": {
        "label": "Rook",
        "rendererName": "rook-claude/render_rook_ruinwall.py",
        "anchor": (0.5, 0.80241),
    },
    "knight": {
        "label": "Knight",
        "rendererName": "knight-fur/render_knight_fur.py",
        "anchor": (0.5, 0.80241),
    },
    "bishop": {
        "label": "Bishop",
        "rendererName": "bishop-mitre/render_bishop_mitre.py",
        "anchor": (0.5, 0.80241),
    },
    "queen": {
        "label": "Queen",
        "rendererName": "queen-tiara/render_queen_tiara.py",
        "anchor": (0.5, 0.80241),
    },
    "king": {
        "label": "King",
        "rendererName": "king-crown/render_king_crown.py",
        "anchor": (0.5, 0.80241),
    },
}


def fail(message: str) -> None:
    raise SystemExit(message)


def parse_target(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+)[xX](\d+)", value.strip())
    if not match:
        fail(f"invalid target '{value}'; expected WIDTHxHEIGHT")
    width, height = int(match.group(1)), int(match.group(2))
    if not (1 <= width <= 4096 and 1 <= height <= 4096):
        fail("target dimensions must be between 1 and 4096")
    return width, height


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_handoff(path: Path) -> dict[str, tuple[int, int]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"could not read handoff {path}: {exc}")
    if raw.get("unitSizeDraft") not in (2, 3) or not isinstance(raw.get("units"), dict):
        fail("handoff must be a Unit Studio unitSizeDraft version 2 or 3 document")
    targets: dict[str, tuple[int, int]] = {}
    for piece, entry in raw["units"].items():
        if piece not in PIECES or not isinstance(entry, dict):
            continue
        native = entry.get("nativeTargetPx")
        if not isinstance(native, dict):
            fail(f"handoff is missing {piece}.nativeTargetPx")
        targets[piece] = parse_target(f"{native.get('w', 0)}x{native.get('h', 0)}")
    return targets


def read_source_manifest(path: Path) -> dict[str, list[dict[str, str]]]:
    """Read backend archive identities supplied outside the repository.

    Shape: {"schemaVersion": 1, "pieces": {"pawn": {"sources": [
      {"sourcePath": "<backend archival identity>", "name": "<local name>",
       "env": "<optional renderer variable>"}]}}}
    """
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"could not read source manifest {path}: {exc}")
    if raw.get("schemaVersion") != 1 or not isinstance(raw.get("pieces"), dict):
        fail("source manifest must be schemaVersion 1 with a pieces object")
    result: dict[str, list[dict[str, str]]] = {}
    for piece, entry in raw["pieces"].items():
        if piece not in PIECES or not isinstance(entry, dict) or not isinstance(entry.get("sources"), list):
            continue
        sources: list[dict[str, str]] = []
        for source in entry["sources"]:
            if not isinstance(source, dict):
                fail(f"invalid source manifest entry for {piece}")
            source_path = source.get("sourcePath")
            name = source.get("name")
            env = source.get("env")
            if not isinstance(source_path, str) or not source_path or not isinstance(name, str) or not name:
                fail(f"source entries for {piece} require sourcePath and name")
            if Path(name).name != name:
                fail(f"source entry name must be a basename for {piece}: {name}")
            if env is not None and (not isinstance(env, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]*", env)):
                fail(f"invalid source environment variable for {piece}: {env}")
            sources.append({"sourcePath": source_path, "name": name, **({"env": env} if env else {})})
        if not sources:
            fail(f"source manifest has no sources for {piece}")
        result[piece] = sources
    return result


def requested_targets(args: argparse.Namespace) -> list[tuple[str, tuple[int, int]]]:
    handoff = read_handoff(Path(args.handoff).resolve()) if args.handoff else {}
    selected = list(PIECES) if args.piece == "all" else [args.piece]
    result: list[tuple[str, tuple[int, int]]] = []
    for piece in selected:
        if piece in handoff:
            result.append((piece, handoff[piece]))
        elif args.target and args.piece != "all":
            result.append((piece, parse_target(args.target)))
        else:
            fail(f"no native target supplied for {piece}; use --target or --handoff")
    return result


def find_blender(explicit: str | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    if os.environ.get("BLENDER_BIN"):
        candidates.append(Path(os.environ["BLENDER_BIN"]))
    found = shutil.which("blender")
    if found:
        candidates.append(Path(found))
    candidates.extend(sorted(
        Path("C:/Program Files/Blender Foundation").glob("Blender */blender.exe"),
        reverse=True,
    ))
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    fail("Blender was not found; install Blender 5.x or set BLENDER_BIN")


def run_directory(piece: str, size: tuple[int, int]) -> Path:
    return OUTPUT_ROOT / piece / f"{size[0]}x{size[1]}"


def frame_stats(path: Path, expected_size: tuple[int, int]) -> dict[str, Any]:
    try:
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
    except OSError as exc:
        fail(f"could not read Blender frame {path}: {exc}")
    if image.size != expected_size:
        fail(
            f"{path} is {image.width}x{image.height}, expected "
            f"{expected_size[0]}x{expected_size[1]}; spatial resampling is forbidden"
        )
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        fail(f"{path} has no visible pixels")
    pixels = alpha.tobytes()
    return {
        "sha256": sha256(path),
        "width": image.width,
        "height": image.height,
        "opaquePixels": sum(value > 0 for value in pixels),
        "alphaBounds": {"x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1]},
    }


def validate_frames(directory: Path, expected_size: tuple[int, int]) -> dict[str, dict[str, Any]]:
    expected_names = {f"{direction}.png" for direction in DIRECTIONS}
    actual_names = {path.name for path in directory.glob("*.png")}
    missing = sorted(expected_names - actual_names)
    extras = sorted(actual_names - expected_names)
    if missing or extras:
        fail(f"invalid native frame set in {directory}; missing={missing}, extras={extras}")
    return {
        direction: frame_stats(directory / f"{direction}.png", expected_size)
        for direction in DIRECTIONS
    }


def existing_manifest(piece: str, size: tuple[int, int]) -> dict[str, Any] | None:
    manifest_path = run_directory(piece, size) / "render.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if (
        manifest.get("schemaVersion") != 3
        or manifest.get("piece") != piece
        or manifest.get("authoredRaster") != {"width": size[0], "height": size[1]}
        or manifest.get("deliveryRaster") != {"width": size[0], "height": size[1]}
        or manifest.get("spatialResampling") is not False
    ):
        return None
    return manifest


def fetch_sources(
    piece: str,
    source_directory: Path,
    api_base: str,
    cookie: str | None,
    renderer_root: Path,
    sources: list[dict[str, str]],
) -> tuple[Path, dict[str, str], list[dict[str, Any]]]:
    renderer = renderer_root / PIECES[piece]["rendererName"]
    if not renderer.is_file():
        fail(f"canonical Blender render algorithm is missing: {renderer}")
    node = os.environ.get("NODE_BIN") or shutil.which("node")
    client = ROOT / "frontend" / "scripts" / "live-media-admin-client.mjs"
    if not node or not client.is_file():
        fail("live-media source retrieval requires Node and frontend/scripts/live-media-admin-client.mjs")
    source_directory.mkdir(parents=True, exist_ok=True)
    source_environment = {"UNIT_ART_SOURCE_DIR": os.fspath(source_directory)}
    source_records: list[dict[str, Any]] = []
    for source in sources:
        destination = source_directory / source["name"]
        command = [
            node,
            os.fspath(client),
            "fetch-source",
            "--api-base",
            api_base,
            "--source-path",
            source["sourcePath"],
            "--domain",
            "unit-art",
            "--out",
            os.fspath(destination),
        ]
        if cookie:
            command.extend(["--cookie", cookie])
        completed = subprocess.run(
            command,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if completed.returncode:
            fail(f"could not fetch private Unit Art source {source['sourcePath']}:\n{completed.stdout}")
        if source.get("env"):
            source_environment[source["env"]] = os.fspath(destination)
        source_records.append({
            "sourcePath": source["sourcePath"],
            "sha256": sha256(destination),
            "byteLength": destination.stat().st_size,
        })
    return renderer, source_environment, source_records


def render(
    piece: str,
    size: tuple[int, int],
    blender: Path,
    force: bool,
    api_base: str,
    cookie: str | None,
    renderer_root: Path,
    sources: list[dict[str, str]],
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"unit-art-{piece}-sources-") as temporary:
        renderer, source_environment, source_records = fetch_sources(
            piece, Path(temporary), api_base, cookie, renderer_root, sources,
        )
        return render_with_sources(piece, size, blender, force, renderer, source_environment, source_records)


def render_with_sources(
    piece: str,
    size: tuple[int, int],
    blender: Path,
    force: bool,
    renderer: Path,
    source_environment: dict[str, str],
    source_records: list[dict[str, Any]],
) -> dict[str, Any]:
    directory = run_directory(piece, size)
    raw = directory / "raw"
    cached = existing_manifest(piece, size)
    if cached is not None and cached.get("sources") == source_records and not force:
        validate_frames(raw, size)
        print(f"NATIVE_RENDER_CACHED {piece} {size[0]}x{size[1]} -> {raw}")
        return cached

    resolved_raw = raw.resolve()
    resolved_output = OUTPUT_ROOT.resolve()
    if not resolved_raw.is_relative_to(resolved_output):
        fail(f"refusing to write outside {resolved_output}: {resolved_raw}")
    if raw.exists():
        shutil.rmtree(raw)
    raw.mkdir(parents=True, exist_ok=True)

    environment = {
        **os.environ,
        "UNIT_ART_OUTPUT_DIR": os.fspath(resolved_raw),
        "UNIT_ART_FRAME_WIDTH": str(size[0]),
        "UNIT_ART_FRAME_HEIGHT": str(size[1]),
        **source_environment,
    }
    command = [os.fspath(blender), "--background", "--python", os.fspath(renderer)]
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    printable = completed.stdout.encode("ascii", errors="replace").decode("ascii")
    print(printable)
    if completed.returncode:
        fail(f"Blender renderer failed for {piece} with exit code {completed.returncode}")
    if re.search(r"ERROR Image file .* does not exist", completed.stdout):
        fail(f"Blender renderer for {piece} used a missing external image")

    anchor_match = re.search(r"unitAnchorX=([0-9.]+)%\s+unitAnchorY=([0-9.]+)%", completed.stdout)
    if not anchor_match:
        fail(f"{piece} renderer did not report its projected contact anchor")
    anchor = (float(anchor_match.group(1)) / 100, float(anchor_match.group(2)) / 100)
    expected_anchor = PIECES[piece]["anchor"]
    if abs(anchor[0] - expected_anchor[0]) > 0.002 or abs(anchor[1] - expected_anchor[1]) > 0.002:
        fail(
            f"{piece} anchor drifted to ({anchor[0]:.5f}, {anchor[1]:.5f}); "
            f"expected ({expected_anchor[0]:.5f}, {expected_anchor[1]:.5f})"
        )

    frames = validate_frames(raw, size)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 3,
        "kind": "blender-native-raster",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "piece": piece,
        "renderer": os.fspath(renderer.relative_to(ROOT)).replace("\\", "/")
        if renderer.is_relative_to(ROOT) else os.fspath(renderer),
        "sources": source_records,
        "blenderExecutable": os.fspath(blender),
        "authoredRaster": {"width": size[0], "height": size[1]},
        "deliveryRaster": {"width": size[0], "height": size[1]},
        "spatialResampling": False,
        "directionYaws": DIRECTION_YAWS,
        "reviewOrder": DIRECTIONS,
        "anchor": {"x": anchor[0], "y": anchor[1]},
        "frames": frames,
        "renderLogTail": completed.stdout[-4000:],
    }
    manifest_path = directory / "render.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"NATIVE_RENDER_DONE {piece} {size[0]}x{size[1]} -> {raw}")
    print(f"NATIVE_RENDER_MANIFEST {manifest_path}")
    return manifest


def verify(piece: str, size: tuple[int, int]) -> dict[str, Any]:
    manifest = existing_manifest(piece, size)
    if manifest is None:
        fail(f"missing or invalid native render manifest for {piece} {size[0]}x{size[1]}")
    frames = validate_frames(run_directory(piece, size) / "raw", size)
    for direction, stats in frames.items():
        recorded = manifest.get("frames", {}).get(direction, {})
        if recorded.get("sha256") != stats["sha256"]:
            fail(f"native render changed after manifest creation: {piece}/{direction}")
    print(f"NATIVE_RENDER_VERIFIED {piece} {size[0]}x{size[1]}")
    return manifest


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("render", "verify"):
        command = commands.add_parser(name)
        command.add_argument("piece", choices=[*PIECES, "all"])
        command.add_argument("--target", help="Exact authored and delivery raster, WIDTHxHEIGHT")
        command.add_argument("--handoff", help="Unit Studio unitSizeDraft v2 JSON")
        if name == "render":
            command.add_argument("--blender", help="Path to Blender; otherwise auto-detected")
            command.add_argument("--renderer-root", required=True, help="Directory containing the Git-owned Blender renderer scripts")
            command.add_argument("--source-manifest", required=True, help="Temporary JSON of backend source identities and renderer environment bindings")
            command.add_argument("--api-base", default=os.environ.get("LIVE_MEDIA_API_BASE"), help="Backend origin containing the private source catalog (or LIVE_MEDIA_API_BASE)")
            command.add_argument("--cookie", default=os.environ.get("LIVE_MEDIA_COOKIE"), help="Authenticated admin Cookie header value (or LIVE_MEDIA_COOKIE)")
            command.add_argument("--force", action="store_true", help="Discard a valid cached raw render")
    return root


def main() -> None:
    args = parser().parse_args()
    targets = requested_targets(args)
    if args.command == "render" and not args.api_base:
        fail("render requires --api-base or LIVE_MEDIA_API_BASE so source media comes from the backend")
    blender = find_blender(args.blender) if args.command == "render" else None
    renderer_root = Path(args.renderer_root).resolve() if args.command == "render" else None
    sources_by_piece = read_source_manifest(Path(args.source_manifest).resolve()) if args.command == "render" else {}
    for piece, size in targets:
        if args.command == "render":
            assert blender is not None and renderer_root is not None
            if piece not in sources_by_piece:
                fail(f"source manifest has no entry for requested piece {piece}")
            render(
                piece, size, blender, args.force, args.api_base, args.cookie,
                renderer_root, sources_by_piece[piece],
            )
        else:
            verify(piece, size)


if __name__ == "__main__":
    main()
