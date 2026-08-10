"""Build a Blender file for tuning a unit's BODY and ACCENT palettes separately.

A single ColorRamp maps by brightness alone, so it cannot tell stone from gold: the
king's crown came out navy because it happened to be bright, not because anything
decided it should. Measured, the accented pieces had zero warm pixels.

The fix is Blender's own Material Index pass. Each material carries a Pass Index, an
ID Mask node turns "index == N" into a mask, and two ColorRamps run in parallel with
the mask choosing between them per pixel. Body index 1, crown 2. That took the king
from 0% warm pixels to 32.5%.

Mask anti-aliasing is off deliberately: a fractional mask blends the two palettes and
produces colours belonging to neither.

  blender --background --python build_accent_filter_lab.py
  env: SRC (piece blend), BTP (BlenderToPixels.blend), OUT (render), LAB_OUT (blend)

Accents chain: each is a Pass Index and the palette that index wears, so any number
of them stack. The king runs three -- navy body, gold crown, red velvet -- after
`split_crown_materials.py` divides the crown mesh on its own region map.
"""
import bpy, os, math, mathutils

SPRITE = 51; BLOCK = 7
BODY = [(0.00000,"#0d1526"),(0.05139,"#172a4a"),(0.09918,"#223866"),(0.15729,"#2f4a83"),(0.28899,"#415f9c")]
# Gold for the crown. Same shape as the body ramp -- dark stop first, positions on the
# render's linear luminance, not on PNG-measured values.
GOLD = [(0.00000,"#2a1c06"),(0.05139,"#5c4310"),(0.09918,"#8a6a1e"),(0.15729,"#b8933a"),(0.28899,"#e2c268")]
VELVET = [(0.00000,"#2a0709"),(0.05139,"#5a1013"),(0.09918,"#8a1c1c"),(0.15729,"#b03028"),(0.28899,"#d4544a")]
# Each accent is a material Pass Index and the palette that index should wear. Masks
# chain in order, so a later one paints over an earlier one where they overlap.
ACCENTS = [(2, "CROWN gold", GOLD), (3, "CROWN velvet", VELVET)]
masks = []

def srgb(h):
    v=h.lstrip("#"); out=[]
    for i in (0,2,4):
        c=int(v[i:i+2],16)/255
        out.append(c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4)
    return out

bpy.ops.wm.open_mainfile(filepath=os.environ["BTP"])
scene = bpy.context.scene
existing = {o.name for o in bpy.data.objects}
with bpy.data.libraries.load(os.environ["SRC"], link=False) as (src, dst):
    dst.objects = list(src.objects)
added = [o for o in bpy.data.objects if o.name not in existing]
meshes = [o for o in added if o.type=="MESH"]
for o in added:
    if o.type in {"MESH","EMPTY"}: scene.collection.objects.link(o)
for o in bpy.data.objects:
    if o.name in existing and o.type=="MESH": o.hide_render = o.hide_viewport = True

# Body 1, crown 2. This is the split the compositor masks on.
for m in bpy.data.materials:
    n = m.name.lower()
    if "velvet" in n:
        m.pass_index = 3
    elif "crown" in n or "tiara" in n or "gold" in n:
        m.pass_index = 2
    else:
        m.pass_index = 1

lows=[min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in meshes if o.data.vertices]
if lows:
    drop=min(lows)
    for o in added:
        if o.parent is None: o.location.z -= drop
rig = next((o for o in added if o.type=="EMPTY"), None)
if rig is None:
    rig = bpy.data.objects.new("filter_rig", None); scene.collection.objects.link(rig)
    for o in meshes:
        if o.parent is None:
            o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

E=math.radians(35.264389682754654); D=5.0; c=math.cos(E)*D/math.sqrt(2)
cam = scene.camera or next(o for o in bpy.data.objects if o.type=="CAMERA")
scene.camera=cam; cam.parent=None
cam.location=(c,-c,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-mathutils.Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7

vl = scene.view_layers[0]; vl.use_pass_material_index = True
scene.render.engine="CYCLES"; scene.cycles.samples=256
scene.render.filter_size=0.01; scene.view_settings.view_transform="Standard"
scene.render.film_transparent=True; scene.render.use_compositing=True
scene.render.resolution_x=scene.render.resolution_y=SPRITE*BLOCK
scene.render.image_settings.file_format="PNG"; scene.render.image_settings.color_mode="RGBA"

tree = scene.compositing_node_group
pix = next(n for n in tree.nodes if n.bl_idname=="CompositorNodePixelate")
next(s for s in pix.inputs if s.name=="Size").default_value = BLOCK
ol = next((n for n in tree.nodes if n.bl_idname=="CompositorNodeGroup" and n.node_tree and n.node_tree.name.startswith("Outline")), None)
if ol:
    ol.inputs["Fine Adjust"].default_value=1.0
    ol.inputs["Sensitivity"].default_value=5.0
    ol.inputs["Color"].default_value=(*srgb("#181818"),1)
    # Thickness lives INSIDE the group, on a Dilate/Erode node's Size socket -- not on
    # the group's own inputs, which is why reading the exposed sockets missed it and a
    # freshly built lab silently inherited the addon's -1 instead of the tuned 8.
    bt = next((x for x in ol.node_tree.nodes
               if (x.label or x.name).lower().startswith("border")), None)
    if bt is not None and "Size" in bt.inputs:
        bt.inputs["Size"].default_value = int(os.environ.get("OL_SIZE", "8"))
    if os.environ.get("NO_OUTLINE"):
        ol.mute = True

# Bypass the 8Mat Dither Combiner. It was harmless while every material sat at Pass
# Index 0 -- that routes to no slot -- but assigning indices 1 and 2 for the ID Mask
# switches it on, and its demo gradients run dark->navy->green->lime on slot 1 and red
# on slot 2. It then recolours the image before either of our ramps sees it, which is
# a lime body and a red crown. Route around it rather than fight its ramps.
comb = next((n for n in tree.nodes if n.bl_idname=="CompositorNodeGroup"
             and n.node_tree and n.node_tree.name.startswith("8Mat")), None)
if comb is not None and comb.inputs["Image"].is_linked and comb.outputs[0].is_linked:
    upstream = comb.inputs["Image"].links[0].from_socket
    for link in list(comb.outputs[0].links):
        target = link.to_socket
        tree.links.remove(link)
        tree.links.new(upstream, target)

rl = next(n for n in tree.nodes if n.bl_idname=="CompositorNodeRLayers")
out_node = next(n for n in tree.nodes if n.bl_idname=="NodeGroupOutput")
sink = out_node.inputs[0]
feeder = sink.links[0].from_socket

def make_ramp(stops):
    r = tree.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation="CONSTANT"
    els=r.color_ramp.elements
    while len(els)>1: els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*srgb(stops[0][1]),1)
    for pos,hx in stops[1:]: els.new(pos).color=(*srgb(hx),1)
    tree.links.new(feeder, r.inputs["Fac"])
    return r

body = make_ramp(BODY)
body.label = "BODY palette"
current = body.outputs["Color"]

# ID Mask turns "this pixel's material index == ACCENT_INDEX" into a mask, which then
# chooses between the two palettes. Anti-aliasing off: a fractional mask would blend
# gold into navy and produce colours in neither palette.
# The mask is built at FULL resolution and only then put on the image's grid.
# Pixelate averages, and an index pass must never be averaged: a block straddling
# index 1 and 2 becomes 1.5, matches no mask exactly, and falls through to the body
# palette -- a one-pixel lip of the wrong colour around every accent. So ID Mask
# first, on exact integers, then pixelate the resulting 0/1 mask and re-threshold it
# back to hard edges.
for offset, (index, label, stops) in enumerate(ACCENTS):
    ramp = make_ramp(stops)
    ramp.label = label
    ramp.location = (200, -60 - offset * 300)
    idm = tree.nodes.new("CompositorNodeIDMask")
    idm.inputs["Index"].default_value = index
    if "Anti-Alias" in idm.inputs:
        # A fractional mask blends two palettes and yields colours in neither.
        idm.inputs["Anti-Alias"].default_value = False
    idm.location = (0, -320 - offset * 300)
    tree.links.new(rl.outputs["Material Index"], idm.inputs["ID value"])

    mask_pix = tree.nodes.new("CompositorNodePixelate")
    next(t for t in mask_pix.inputs if t.name == "Size").default_value = BLOCK
    mask_pix.location = (120, -400 - offset * 300)
    tree.links.new(idm.outputs["Alpha"], mask_pix.inputs[0])

    # Averaging a binary mask leaves fractions at the edges; a CONSTANT ramp with one
    # stop at the midpoint snaps them back so every block is fully one palette.
    hard = tree.nodes.new("ShaderNodeValToRGB")
    hard.color_ramp.interpolation = "CONSTANT"
    hels = hard.color_ramp.elements
    while len(hels) > 1:
        hels.remove(hels[-1])
    hels[0].position, hels[0].color = 0.0, (0, 0, 0, 1)
    # NOT 0.5. The alpha the render draws is antialiased at the silhouette; Material
    # Index is an integer pass sampled at pixel centres and is not. So the outermost
    # block of the crown is DRAWN but carries index 0, falls through to the body ramp,
    # and -- because gold is bright -- lands on the body's lightest stop. That is the
    # blue lip. A low cutoff claims any block containing ANY crown for the crown;
    # alpha still trims whatever reaches past the piece.
    hels.new(float(os.environ.get("ACCENT_THRESH", "0.06"))).color = (1, 1, 1, 1)
    hard.location = (300, -400 - offset * 300)
    tree.links.new(mask_pix.outputs[0], hard.inputs["Fac"])

    # Grow the mask by one pixel. On the crown's outer silhouette a block is part
    # accent and part BACKGROUND, and background carries material index 0 -- matching
    # no accent mask, so it fell through to the body palette and left a one-pixel lip
    # of navy around the crown. Dilating covers those edge blocks; alpha still trims
    # anything that reaches past the piece.
    grow = tree.nodes.new("CompositorNodeDilateErode")
    # The socket is Size, NOT Distance. Blender 5 moved this off the node property
    # like ID Mask's Index, and renamed it on the way -- so a "Distance" lookup finds
    # nothing, writes nothing, and leaves the dilate at 0 while looking correct. That
    # silently no-op'd every attempt to widen this mask, and is the same mistake that
    # hid the outline's Border Thickness. Assert instead of falling back: a missing
    # socket here is a broken graph, not a version to tolerate.
    grow.inputs["Size"].default_value = int(os.environ.get("ACCENT_GROW", "1"))
    grow.location = (420, -400 - offset * 300)
    tree.links.new(hard.outputs["Color"], grow.inputs[0])

    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (460 + offset * 220, 80)
    rgba_in = [s for s in mix.inputs if s.type == "RGBA"]
    tree.links.new(grow.outputs[0], mix.inputs["Factor"])
    tree.links.new(current, rgba_in[0])
    tree.links.new(ramp.outputs["Color"], rgba_in[1])
    current = [s for s in mix.outputs if s.type == "RGBA"][0]
    masks.append(grow.outputs[0])

if os.environ.get("DUMP_MASK"):
    # Show the FINAL accent mask as the image, so its silhouette can be compared
    # against the crown's own. Answers whether the lip is a short mask or geometry
    # that genuinely carries the body material.
    # CompositorNodeMixRGB is gone in Blender 5; shader Math works in the compositor.
    u = tree.nodes.new("ShaderNodeMath"); u.operation = "MAXIMUM"
    tree.links.new(masks[0], u.inputs[0]); tree.links.new(masks[1], u.inputs[1])
    for l in list(sink.links): tree.links.remove(l)
    tree.links.new(u.outputs[0], sink)
    scene.render.filepath = os.environ["OUT"]
    bpy.ops.render.render(write_still=True)
    raise SystemExit

sep = tree.nodes.new("CompositorNodeSeparateColor")
seta = tree.nodes.new("CompositorNodeSetAlpha")
tree.links.new(feeder, sep.inputs[0])
tree.links.new(current, seta.inputs["Image"])
tree.links.new(sep.outputs.get("Alpha") or sep.outputs[-1], seta.inputs["Alpha"])
for l in list(sink.links): tree.links.remove(l)
tree.links.new(seta.outputs["Image"], sink)

# Label the two ramps so they are tellable apart in the node editor -- otherwise
# they are two identical-looking ColorRamps and it is a coin flip which is which.
body.location = (200, 220)
sep.location = (200, -620)
seta.location = (940, 80)

# NOT stripping the addon's Introduction workspace here. bpy.data.workspaces has no
# .remove(), and batch_remove() on workspaces segfaults Blender 5.1 outright -- it
# took the builder down with it. Delete the tab in the UI instead (right-click the
# workspace tab, Delete, then save); it persists in the saved file from then on.
scene.render.filepath = os.environ["OUT"]
bpy.ops.render.render(write_still=True)
if os.environ.get("LAB_OUT"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["LAB_OUT"])
    print("LAB_SAVED", os.environ["LAB_OUT"])
print("ACCENT_DONE", [(m.name, m.pass_index) for m in bpy.data.materials])
