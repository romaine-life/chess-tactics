"""Measure the Staunton template's structure (proportions) + render a profile.

    blender --background --python knight_template_inspect.py
"""

import bpy
from mathutils import Vector
from pathlib import Path

HERE = Path(__file__).resolve().parent
FBX = HERE / "knight-template" / "staunton-src" / "source" / "Knight.fbx"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=str(FBX))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
size = mx - mn
center = (mn + mx) / 2
print("TPL_OBJECTS", [o.name for o in meshes], "verts", sum(len(o.data.vertices) for o in meshes))
print("TPL_SIZE", tuple(round(v, 4) for v in size))
print("TPL_MIN", tuple(round(v, 4) for v in mn))
print("TPL_MAX", tuple(round(v, 4) for v in mx))
# tallest axis = up; the two smaller give footprint
print("TPL_ASPECT height/maxfoot =", round(max(size) / sorted(size)[1], 3))

world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.1
bpy.ops.object.light_add(type="SUN", location=(2, -3, 6))
bpy.context.object.data.energy = 3.2

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 500
scene.render.resolution_y = 760
scene.render.film_transparent = True
reach = max(size)


def shot(name, dir_vec):
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.location = center + dir_vec.normalized() * reach * 2.2
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = reach * 1.15
    scene.render.filepath = str(HERE / "knight-template" / f"tpl-{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


shot("side", Vector((1, 0, 0)))
shot("front", Vector((0, -1, 0)))
print("TEMPLATE_INSPECT_DONE")
