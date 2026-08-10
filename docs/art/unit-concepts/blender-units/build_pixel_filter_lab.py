"""Put a real unit inside Blender To Pixels' own working demo scene.

The shipped units' look came from a Codex img2img restyle of all eight angles at
once. That cannot serve a zoom-rung ladder: it is one non-deterministic pass
producing one size, so re-running it per rung yields four subtly different looks.
A rung ladder needs a filter that can be re-run at any size and give the same
treatment back, which means a deterministic one -- hence turning knobs on a
compositor rather than prompting.

Why append the piece INTO the addon's scene rather than wire the effect into the
piece's blend: rebuilding that graph from outside produced a black frame. The
Outline group wants a depth range the transparent film does not give it, and
chasing that headlessly is the slow way to find knobs. The addon ships a scene
whose compositor its author already validated, so swapping the subject leaves the
only remaining variables the knobs themselves.

  blender --background --python build_pixel_filter_lab.py
  env: UNIT_ART_BLEND (piece source), BTP_BLEND (BlenderToPixels.blend), LAB_OUT

Whatever settings survive review can then be driven headlessly at every rung size,
which is the reason to do this in Blender at all rather than in an image editor.
"""
import bpy, os

SOURCE = os.environ["UNIT_ART_BLEND"]
BTP = os.environ["BTP_BLEND"]
OUT = os.environ["LAB_OUT"]

# Start from the addon's scene so its compositor, world and render settings are the
# ones its author validated.
bpy.ops.wm.open_mainfile(filepath=BTP)
scene = bpy.context.scene

existing = {o.name for o in bpy.data.objects}

with bpy.data.libraries.load(SOURCE, link=False) as (src, dst):
    dst.objects = list(src.objects)

added = [o for o in bpy.data.objects if o.name not in existing]
meshes = [o for o in added if o.type == "MESH"]
for obj in added:
    if obj.type in {"MESH", "EMPTY"}:
        scene.collection.objects.link(obj)

# The demo's own subject stays in the file but out of the way, so the scene can be
# put back to its reference state if the piece ever needs comparing against it.
for obj in bpy.data.objects:
    if obj.name in existing and obj.type == "MESH":
        obj.hide_render = True
        obj.hide_viewport = True

# Sit the piece on the origin so the framing the effect was tuned against still
# applies to it.
lows = [
    min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    for obj in meshes if obj.data.vertices
]
if lows:
    drop = min(lows)
    for obj in added:
        if obj.parent is None:
            obj.location.z -= drop

print("PIXEL_LAB_SUBJECTS", [o.name for o in meshes])
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("PIXEL_LAB_SAVED", OUT)
