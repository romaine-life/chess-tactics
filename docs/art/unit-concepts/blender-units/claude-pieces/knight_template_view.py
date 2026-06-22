"""View / preview the ready-made chess-knight template (CC-BY, Poly by Google).

    blender --background --python knight_template_view.py   # render preview.png
    blender --python knight_template_view.py                # open GUI
"""

import bpy
from mathutils import Vector
from pathlib import Path

HERE = Path(__file__).resolve().parent
GLB = HERE / "knight-template" / "chess-knight-template.glb"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=str(GLB))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
center = (mn + mx) / 2
reach = max(mx - mn)

world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.1
bpy.ops.object.light_add(type="SUN", location=(2, -3, 6))
bpy.context.object.data.energy = 3.2

bpy.ops.object.camera_add()
cam = bpy.context.object
bpy.context.scene.camera = cam
cam.location = center + Vector((1, -1.4, 0.5)).normalized() * reach * 2.2
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

if bpy.app.background:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 700
    scene.render.film_transparent = True
    scene.render.filepath = str(HERE / "knight-template" / "preview.png")
    bpy.ops.render.render(write_still=True)
else:
    try:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.region_3d.view_perspective = "CAMERA"
                        space.shading.type = "MATERIAL"
    except Exception as exc:
        print("viewport setup skipped:", exc)

print("TEMPLATE_READY")
