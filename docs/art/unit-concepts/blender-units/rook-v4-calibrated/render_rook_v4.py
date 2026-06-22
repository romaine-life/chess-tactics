"""Render the accepted rook v4 Blender unit with the project projection contract.

Run from repo root:
    blender --background docs/art/unit-concepts/blender-units/rook-v4-calibrated/rook-v4-calibrated.blend --python docs/art/unit-concepts/blender-units/rook-v4-calibrated/render_rook_v4.py
"""

import math
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent

OUT = ROOT / "frontend" / "public" / "assets" / "units" / "rook" / "blender-render-v4-calibrated"
OUT.mkdir(parents=True, exist_ok=True)

BOARD_TARGET = Vector((0, 0, 0.92))
BOARD_DISTANCE = 5.0
BOARD_ELEVATION_DEGREES = 35.264389682754654
BOARD_ORTHO = 3.05

DIRECTIONS = {
    "north": 180,
    "north-east": 135,
    "east": 90,
    "south-east": 45,
    "south": 0,
    "south-west": -45,
    "west": -90,
    "north-west": -135,
}


def setup_projection_camera():
    cam = bpy.context.scene.camera or bpy.data.objects.get("rook direction camera")
    if cam is None:
        bpy.ops.object.camera_add()
        cam = bpy.context.object
        bpy.context.scene.camera = cam
    elev = math.radians(BOARD_ELEVATION_DEGREES)
    horizontal = math.cos(elev) * BOARD_DISTANCE
    comp = horizontal / math.sqrt(2)
    cam.location = (
        BOARD_TARGET.x + comp,
        BOARD_TARGET.y - comp,
        BOARD_TARGET.z + math.sin(elev) * BOARD_DISTANCE,
    )
    cam.rotation_euler = (BOARD_TARGET - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = BOARD_ORTHO
    return cam


def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 64
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


setup_projection_camera()
setup_render()

rook = bpy.data.objects.get("rook_v2")
if rook is None:
    raise RuntimeError("Expected parent empty named 'rook_v2'")

for direction, angle in DIRECTIONS.items():
    rook.rotation_euler[2] = math.radians(angle)
    bpy.context.scene.render.filepath = str(OUT / f"{direction}.png")
    bpy.ops.render.render(write_still=True)
    print(f"ROOK_RENDERED {direction} -> {OUT / f'{direction}.png'}")

bpy.context.view_layer.update()
anchor = world_to_camera_view(bpy.context.scene, bpy.context.scene.camera, Vector((0, 0, 0)))
print("ANCHOR unitAnchorX=%.3f%% unitAnchorY=%.3f%%" % (anchor.x * 100, (1 - anchor.y) * 100))
print(f"ROOK_OUT={OUT}")
