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

Known limit: the king's gold and red velvet are ONE material, separated by vertex
colours inside it, which the compositor cannot see. The velvet therefore lands on the
dark end of the gold ramp rather than staying red; splitting that mesh into two
materials would fix it.
"""
import bpy, os, math, mathutils

SPRITE = 51; BLOCK = 7
BODY = [(0.00000,"#0d1526"),(0.05139,"#172a4a"),(0.09918,"#223866"),(0.15729,"#2f4a83"),(0.28899,"#415f9c")]
# Gold for the crown. Same shape as the body ramp -- dark stop first, positions on the
# render's linear luminance, not on PNG-measured values.
GOLD = [(0.00000,"#2a1c06"),(0.05139,"#5c4310"),(0.09918,"#8a6a1e"),(0.15729,"#b8933a"),(0.28899,"#e2c268")]
ACCENT_INDEX = 2

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
    m.pass_index = ACCENT_INDEX if ("crown" in n or "tiara" in n or "gold" in n) else 1

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
gold = make_ramp(GOLD)

# ID Mask turns "this pixel's material index == ACCENT_INDEX" into a mask, which then
# chooses between the two palettes. Anti-aliasing off: a fractional mask would blend
# gold into navy and produce colours in neither palette.
idm = tree.nodes.new("CompositorNodeIDMask")
# Blender 5 moved these off the node onto its input sockets.
idm.inputs["Index"].default_value = ACCENT_INDEX
if "Anti-Alias" in idm.inputs:
    idm.inputs["Anti-Alias"].default_value = False
tree.links.new(rl.outputs["Material Index"], idm.inputs["ID value"])

mix = tree.nodes.new("ShaderNodeMix"); mix.data_type="RGBA"
rgba_in=[s for s in mix.inputs if s.type=="RGBA"]
tree.links.new(idm.outputs["Alpha"], mix.inputs["Factor"])
tree.links.new(body.outputs["Color"], rgba_in[0])
tree.links.new(gold.outputs["Color"], rgba_in[1])
rgba_out=[s for s in mix.outputs if s.type=="RGBA"][0]

sep = tree.nodes.new("CompositorNodeSeparateColor")
seta = tree.nodes.new("CompositorNodeSetAlpha")
tree.links.new(feeder, sep.inputs[0])
tree.links.new(rgba_out, seta.inputs["Image"])
tree.links.new(sep.outputs.get("Alpha") or sep.outputs[-1], seta.inputs["Alpha"])
for l in list(sink.links): tree.links.remove(l)
tree.links.new(seta.outputs["Image"], sink)

# Label the two ramps so they are tellable apart in the node editor -- otherwise
# they are two identical-looking ColorRamps and it is a coin flip which is which.
body.label = "BODY palette"
gold.label = "CROWN palette"
body.location = (200, 220); gold.location = (200, -60)
idm.location = (0, -320); mix.location = (460, 80)
sep.location = (200, -320); seta.location = (700, 80)

scene.render.filepath = os.environ["OUT"]
bpy.ops.render.render(write_still=True)
if os.environ.get("LAB_OUT"):
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["LAB_OUT"])
    print("LAB_SAVED", os.environ["LAB_OUT"])
print("ACCENT_DONE", [(m.name, m.pass_index) for m in bpy.data.materials])
