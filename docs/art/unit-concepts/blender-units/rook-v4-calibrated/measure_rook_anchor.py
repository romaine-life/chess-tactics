"""Measure the rook's exact app anchor from the Blender projection camera.

Run from repo root:
    blender --background docs/art/unit-concepts/blender-units/rook-v4-calibrated/rook-v4-calibrated.blend --python docs/art/unit-concepts/blender-units/rook-v4-calibrated/measure_rook_anchor.py
"""

import math

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

BOARD_TARGET = Vector((0, 0, 0.92))
BOARD_DISTANCE = 5.0
BOARD_ELEVATION_DEGREES = 35.264389682754654
BOARD_ORTHO = 3.05


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


def scene_mesh_bounds():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
    return mins, maxs


cam = setup_projection_camera()
rook = bpy.data.objects.get("rook_v2")
if rook is None:
    raise RuntimeError("Expected parent empty named 'rook_v2'")

mins, maxs = scene_mesh_bounds()
bpy.context.view_layer.update()

points = {
    "world_origin": Vector((0, 0, 0)),
    "bounds_bottom_center": Vector(((mins.x + maxs.x) / 2, (mins.y + maxs.y) / 2, mins.z)),
    "bounds_xy_center_z0": Vector(((mins.x + maxs.x) / 2, (mins.y + maxs.y) / 2, 0)),
    "rook_origin": rook.matrix_world.translation,
}

print(f"ROOK_BOUNDS min={tuple(mins)} max={tuple(maxs)} center={tuple((mins + maxs) / 2)}")
for label, point in points.items():
    v = world_to_camera_view(bpy.context.scene, cam, point)
    print(f"ANCHOR {label} point={tuple(point)} unitAnchorX={v.x * 100:.3f}% unitAnchorY={(1 - v.y) * 100:.3f}%")
