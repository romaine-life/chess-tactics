"""Render one unit through the approved pixel filter at a chosen sprite size.

The subject is appended into Blender To Pixels' demo scene so its compositor stays
exactly as its author left it, the camera is put on the game's true-isometric
contract, and the knobs come from `pixel_filter_recipe.py` -- the values Nelson tuned
by eye and which were read back out of the saved file rather than transcribed.

The sizing rule is the part worth understanding. One Pixelate block is one art pixel,
so the frame is rendered at `sprite_size * block` and the blocks are collapsed to
single pixels afterwards. Rendering at the sprite's own resolution instead leaves the
filter operating on a handful of pixels: measured at 64px that collapsed the piece to
three colours and one palette stop, where the block method holds four stops and ~83%
palette coverage all the way down to 51.

  blender --background --python render_pixel_filtered_unit.py
  env: UNIT_ART_BLEND, BTP_BLEND, UNIT_ART_OUTPUT_DIR, UNIT_ART_SPRITE_PX
       optional UNIT_ART_TOON_PALETTE (default navy-blue), UNIT_ART_DIRECTIONS
"""
import bpy, os, math, mathutils

SOURCE = os.environ["UNIT_ART_BLEND"]
BTP = os.environ["BTP_BLEND"]
OUT = os.environ["UNIT_ART_OUTPUT_DIR"]
SPRITE = int(os.environ.get("UNIT_ART_SPRITE_PX", "51"))
BLOCK = 7
os.makedirs(OUT, exist_ok=True)

# Sampled from the shipped sprites; the ramp positions are LINEAR, which is where a
# palette placed from PNG-measured percentiles goes wrong -- sRGB 0.35 is linear 0.10,
# so such stops sit above nearly every pixel and collapse the piece onto one colour.
RAMP = [
    (0.00000, "#0d1526"),
    (0.05139, "#172a4a"),
    (0.09918, "#223866"),
    (0.15729, "#2f4a83"),
    (0.28899, "#415f9c"),
]


def srgb(h):
    v = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(v[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


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
for obj in bpy.data.objects:
    if obj.name in existing and obj.type == "MESH":
        obj.hide_render = True
        obj.hide_viewport = True

lows = [min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in meshes if o.data.vertices]
if lows:
    drop = min(lows)
    for obj in added:
        if obj.parent is None:
            obj.location.z -= drop

# Not every source ships a rig; the rook is modelled in place.
rig = next((o for o in added if o.type == "EMPTY" and o.name.startswith("rig")), None)
if rig is None:
    rig = bpy.data.objects.new("filter_rig", None)
    scene.collection.objects.link(rig)
    for obj in meshes:
        if obj.parent is None:
            obj.parent = rig
            obj.matrix_parent_inverse = rig.matrix_world.inverted()

ELEV = math.radians(35.264389682754654)
DIST = 5.0
comp = math.cos(ELEV) * DIST / math.sqrt(2)
cam = scene.camera or next(o for o in bpy.data.objects if o.type == "CAMERA")
scene.camera = cam
cam.parent = None
cam.location = (comp, -comp, 1.0 + math.sin(ELEV) * DIST)
cam.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - mathutils.Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2.7

scene.render.engine = "CYCLES"
scene.cycles.samples = 256
scene.render.filter_size = 0.01
scene.view_settings.view_transform = "Standard"
scene.render.film_transparent = True
scene.render.use_compositing = True
scene.render.resolution_x = scene.render.resolution_y = SPRITE * BLOCK
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

tree = scene.compositing_node_group
pix = next(n for n in tree.nodes if n.bl_idname == "CompositorNodePixelate")
next(s for s in pix.inputs if s.name == "Size").default_value = BLOCK
outline = next((n for n in tree.nodes if n.bl_idname == "CompositorNodeGroup"
                and n.node_tree and n.node_tree.name.startswith("Outline")), None)
if outline:
    outline.inputs["Fine Adjust"].default_value = 1.0
    outline.inputs["Sensitivity"].default_value = 5.0
    # This colour never reaches the output -- the ramp downstream remaps it -- but it
    # sets the LUMINANCE the outline hands the ramp, and so which stop the stroke
    # lands on. Leaving it at the addon default put the outline on a mid tone and cut
    # the dark coverage from 33% of the piece to 11%.
    outline.inputs["Color"].default_value = (*srgb("#181818"), 1)

# Palette: a CONSTANT ramp after Pixelate, with alpha split off and restored -- a
# ramp reads one value and would otherwise return the piece as an opaque square.
out_node = next(n for n in tree.nodes if n.bl_idname == "NodeGroupOutput")
sink = out_node.inputs[0]
feeder = sink.links[0].from_socket if sink.is_linked else None
if feeder is not None and not any(n.bl_idname == "ShaderNodeValToRGB" for n in tree.nodes):
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    sep = tree.nodes.new("CompositorNodeSeparateColor")
    seta = tree.nodes.new("CompositorNodeSetAlpha")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, els[0].color = RAMP[0][0], (*srgb(RAMP[0][1]), 1)
    for pos, hexv in RAMP[1:]:
        els.new(pos).color = (*srgb(hexv), 1)
    tree.links.new(feeder, ramp.inputs["Fac"])
    tree.links.new(feeder, sep.inputs[0])
    tree.links.new(ramp.outputs["Color"], seta.inputs["Image"])
    tree.links.new(sep.outputs.get("Alpha") or sep.outputs[-1], seta.inputs["Alpha"])
    for l in list(sink.links):
        tree.links.remove(l)
    tree.links.new(seta.outputs["Image"], sink)

DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
wanted = os.environ.get("UNIT_ART_DIRECTIONS", "south").split(",")
for name in wanted:
    rig.rotation_euler = (0, 0, math.radians(DIRECTIONS[name]))
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("FILTERED", name)
print("FILTERED_DONE", OUT, "render", SPRITE * BLOCK, "-> sprite", SPRITE)
