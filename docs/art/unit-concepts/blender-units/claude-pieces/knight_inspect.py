"""Import the armored-steed FBX and report geometry + render orientation previews.

Run: blender --background --python knight_inspect.py
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
FBX = (HERE / "knight-src" / "source"
       / "Meshy_AI_Armored_Steed_0130151745_texture_fbx"
       / "Meshy_AI_Armored_Steed_0130151745_texture.fbx")


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


clear()
bpy.ops.import_scene.fbx(filepath=str(FBX))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("OBJECTS", [o.name for o in meshes])
print("MESH_COUNT", len(meshes), "TOTAL_VERTS", sum(len(o.data.vertices) for o in meshes))

mn = Vector((1e18, 1e18, 1e18))
mx = Vector((-1e18, -1e18, -1e18))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
size = mx - mn
center = (mx + mn) / 2
print("BBOX_MIN", tuple(round(v, 3) for v in mn))
print("BBOX_MAX", tuple(round(v, 3) for v in mx))
print("SIZE", tuple(round(v, 3) for v in size))
print("CENTER", tuple(round(v, 3) for v in center))

world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.2
bpy.ops.object.light_add(type="SUN", location=(2, -2, 6))
bpy.context.object.data.energy = 3.5

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = 760
scene.render.film_transparent = True

reach = max(size) if max(size) > 0 else 1.0


def shot(name, dir_vec):
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.location = center + dir_vec.normalized() * reach * 2.2
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = reach * 1.25
    scene.render.filepath = str(HERE / f"knight-inspect-{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


shot("negY", Vector((0, -1, 0.05)))
shot("posX", Vector((1, 0, 0.05)))
shot("persp", Vector((1, -1, 0.55)))
shot("top", Vector((0, 0, 1)))
print("INSPECT_DONE")
