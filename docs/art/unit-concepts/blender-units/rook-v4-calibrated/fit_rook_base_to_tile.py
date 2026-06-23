"""Fit the rook model's ground footprint to the canonical tile square.

This is intentionally a Blender-side asset correction, not a CSS/app anchor
patch. The accepted rook had a centered anchor, but its modeled foundation was
1.28 Blender units wide, so the visible base did not correspond to the tile
footprint the app was using.

Run from repo root:
    blender --background docs/art/unit-concepts/blender-units/rook-v4-calibrated/rook-v4-calibrated.blend --python docs/art/unit-concepts/blender-units/rook-v4-calibrated/fit_rook_base_to_tile.py
"""

import bpy
from mathutils import Vector

SOURCE_BASE_NAME = "wide rough foundation slab"
TARGET_BASE_SIZE = 1.0


def object_world_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    mins = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maxs = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return mins, maxs


base = bpy.data.objects.get(SOURCE_BASE_NAME)
if base is None:
    raise RuntimeError(f"Expected base object named {SOURCE_BASE_NAME!r}")

bpy.context.view_layer.update()
mins, maxs = object_world_bounds(base)
current_size = max(maxs.x - mins.x, maxs.y - mins.y)
scale_factor = TARGET_BASE_SIZE / current_size

for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    obj.location.x *= scale_factor
    obj.location.y *= scale_factor
    obj.scale.x *= scale_factor
    obj.scale.y *= scale_factor

bpy.context.view_layer.update()
new_mins, new_maxs = object_world_bounds(base)
print(
    "ROOK_BASE_FIT "
    f"from={current_size:.6f} "
    f"to={max(new_maxs.x - new_mins.x, new_maxs.y - new_mins.y):.6f} "
    f"factor={scale_factor:.6f}"
)

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
