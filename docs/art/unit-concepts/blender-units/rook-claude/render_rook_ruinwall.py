"""Render the accepted Ruinwall rook at the eight production facings.

Run through scripts/generate-unit-art.py. The assembled Blender source is the
accepted Ruinwall model, not one of the retired rook experiments.

The canonical pipeline fetches the private blend into a temporary directory and
supplies UNIT_ART_BLEND, UNIT_ART_OUTPUT_DIR, and frame dimensions. Blender
writes that exact delivery raster without a resize stage.
"""

import math
import os
from pathlib import Path

import bpy
import mathutils
from bpy_extras.object_utils import world_to_camera_view


BLEND = os.environ.get("UNIT_ART_BLEND")
output = os.environ.get("UNIT_ART_OUTPUT_DIR")
if not BLEND or not output:
    raise RuntimeError("run through generate-unit-art.py; private rook source and output are required")
OUT = Path(output)
FRAME_WIDTH = int(os.environ["UNIT_ART_FRAME_WIDTH"])
FRAME_HEIGHT = int(os.environ["UNIT_ART_FRAME_HEIGHT"])
if not (1 <= FRAME_WIDTH <= 4096 and 1 <= FRAME_HEIGHT <= 4096):
    raise RuntimeError("UNIT_ART_FRAME_WIDTH/HEIGHT must be between 1 and 4096")
OUT.mkdir(parents=True, exist_ok=True)

DIRECTIONS = {
    "south": 0,
    "south-east": 45,
    "east": 90,
    "north-east": 135,
    "north": 180,
    "north-west": -135,
    "west": -90,
    "south-west": -45,
}

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
rig = bpy.data.objects.get("rook")
if rig is None:
    raise RuntimeError("accepted Ruinwall source is missing its 'rook' turntable rig")
if scene.camera is None:
    raise RuntimeError("accepted Ruinwall source is missing its calibrated camera")

scene.render.engine = "CYCLES"
scene.cycles.samples = 110
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = FRAME_WIDTH
scene.render.resolution_y = FRAME_HEIGHT
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)

rig.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
anchor = world_to_camera_view(scene, scene.camera, mathutils.Vector((0, 0, 0)))
print("ANCHOR  unitAnchorX=%.3f%%  unitAnchorY=%.3f%%" % (anchor.x * 100, (1 - anchor.y) * 100))
print("ROOK_RUINWALL_DONE ->", os.fspath(OUT))
