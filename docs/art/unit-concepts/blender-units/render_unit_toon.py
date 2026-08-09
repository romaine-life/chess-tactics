"""Cel-shaded native render for any unit whose accents are named materials.

The king needs its own renderer because its crown carries a painted region mask
rather than separate materials. Every other piece separates cleanly by material
name, so one script covers them: `navy stone` is the team-coloured body, `tiara
gold` is an accent, and the rook's `gate wood` / `gate iron` are its own.

Same contract as the canonical pipeline — UNIT_ART_BLEND, UNIT_ART_OUTPUT_DIR and
exact frame dimensions in, one delivery raster per direction out, no resize stage.
Shading is banded diffuse through a CONSTANT ColorRamp and the silhouette is a
drawn inverted hull; see `king-crown/render_king_crown_toon.py` for why each of
those is the way it is, including the two settings that are easy to lose:
Blender's 1.5px reconstruction filter, and emission sockets being linear.

Env: UNIT_ART_TOON_PALETTE, UNIT_ART_TOON_BANDS, UNIT_ART_TOON_OUTLINE_PX.
"""
import bpy, os, math, mathutils
from bpy_extras.object_utils import world_to_camera_view

BLEND = os.environ.get("UNIT_ART_BLEND")
OUT = os.environ.get("UNIT_ART_OUTPUT_DIR")
if not BLEND or not OUT:
    raise RuntimeError("run with UNIT_ART_BLEND and UNIT_ART_OUTPUT_DIR set")
FRAME_WIDTH = int(os.environ["UNIT_ART_FRAME_WIDTH"])
FRAME_HEIGHT = int(os.environ["UNIT_ART_FRAME_HEIGHT"])
BANDS = int(os.environ.get("UNIT_ART_TOON_BANDS", "3"))
OUTLINE_PX = float(os.environ.get("UNIT_ART_TOON_OUTLINE_PX", "1"))
PALETTE = os.environ.get("UNIT_ART_TOON_PALETTE", "navy-blue")
# Key strength, per piece. A silhouette like the rook's is mostly its own recesses:
# the same key that models a smooth pawn leaves it sitting in its darkest band and
# the crenellations stop reading. Raising the key is what separates them again.
SUN = float(os.environ.get("UNIT_ART_TOON_SUN", "4"))
# Cel shading is a STYLE choice and it is off by default. Rendering natively at the
# delivery size is not: it is the fix, and it is wanted whichever style is on top.
# With TOON=0 the source materials are kept as authored -- the shipped look -- and
# only the team colour is applied, so a native render replaces a downscaled one
# without changing how the piece reads.
TOON = os.environ.get("UNIT_ART_TOON", "0") == "1"
# Fill, as a fraction of what the source lit it with. Nearly killing the fill is
# right for a smooth piece -- it is what gives the terminator somewhere to fall --
# but a piece that is mostly recesses needs the fill back or its interior never
# leaves the darkest band.
FILL = float(os.environ.get("UNIT_ART_TOON_FILL", "0.12"))
os.makedirs(OUT, exist_ok=True)


def srgb(hex_string):
    value = hex_string.lstrip("#")
    out = []
    for index in (0, 2, 4):
        channel = int(value[index:index + 2], 16) / 255
        out.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# Only the body recolours per team. Accents hold still so a piece stays the same
# object whichever side owns it -- except gold on the golden body, which would
# vanish, so that one pair swaps to iron.
STONE_PALETTES = {
    "navy-blue": ("#102030", "#204060", "#406090"),
    "crimson":   ("#300f14", "#6a1f2a", "#9e4552"),
    "golden":    ("#33280c", "#7a6118", "#c2a24a"),
    "emerald":   ("#0f2a1c", "#1f5a3c", "#46916a"),
    "black":     ("#101214", "#262a30", "#4a525c"),
    "white":     ("#4a505a", "#8e97a3", "#d8dee6"),
}
if PALETTE not in STONE_PALETTES:
    raise RuntimeError(f"unknown palette {PALETTE}")
GOLD = ("#3a2408", "#8a6a1e", "#d8b45a")
IRON = ("#14161a", "#3a4048", "#6e7782")
WOOD = ("#2a1a0e", "#5c3a1e", "#8f6338")

ROLES = {
    "stone": STONE_PALETTES[PALETTE],
    "gold": IRON if PALETTE == "golden" else GOLD,
    "iron": IRON,
    "wood": WOOD,
}
# Where the terminators fall, overridable per piece. A silhouette built from
# vertical walls -- the rook -- presents most of its surface at a low N.L to a
# high key, so the default stops leave nearly all of it in the darkest band and the
# masonry stops reading. Lowering them is what puts its walls in the mid tone.
BAND_STOPS = {2: (0.42,), 3: (0.30, 0.62)}
_stops = os.environ.get("UNIT_ART_TOON_STOPS")
if _stops:
    BAND_STOPS[3] = tuple(float(v) for v in _stops.split(","))


def role_for(material_name):
    lowered = material_name.lower()
    for key in ("gold", "tiara", "iron", "wood"):
        if key in lowered:
            return "gold" if key in ("gold", "tiara") else key
    return "stone"


def toon_material(material):
    colors = [srgb(value) for value in ROLES[role_for(material.name)]]
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = tree.nodes.new("ShaderNodeShaderToRGB")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    emission = tree.nodes.new("ShaderNodeEmission")

    chosen = colors[-BANDS:] if BANDS < len(colors) else colors
    stops = BAND_STOPS.get(len(chosen), tuple(i / len(chosen) for i in range(1, len(chosen))))
    elements = ramp.color_ramp.elements
    while len(elements) > 1:
        elements.remove(elements[-1])
    ramp.color_ramp.interpolation = "CONSTANT"
    elements[0].position = 0.0
    elements[0].color = (*chosen[0], 1)
    for index in range(1, len(chosen)):
        elements.new(stops[index - 1]).color = (*chosen[index], 1)

    tree.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    tree.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])


bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene

# Not every source ships a rig; the rook is modelled in place. Parent the meshes to
# an empty at the origin so one rotation drives every direction.
rig = bpy.data.objects.get("rig")
if rig is None:
    rig = bpy.data.objects.new("rig", None)
    scene.collection.objects.link(rig)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.parent = rig
            obj.matrix_parent_inverse = rig.matrix_world.inverted()

def palette_material(material):
    """Keep the authored PBR surface, recolour the team-coloured band only.

    EEVEE rather than Cycles, because the frames are small: a path tracer given a
    51px frame has too few pixels to converge and its denoiser smears, which is the
    reason these pieces were downscaled from 512 in the first place. Rasterising
    sidesteps that entirely and keeps the render native.
    """
    if not material.use_nodes or not material.node_tree:
        return
    # navy-blue IS the authored colour of these sources, so touching it can only move
    # the piece away from the look being preserved. Recolour the other teams from it.
    if PALETTE == "navy-blue":
        return
    if role_for(material.name) != "stone":
        return
    base = srgb(ROLES["stone"][1])
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED" and "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = (*base, 1)


for material in bpy.data.materials:
    if TOON:
        toon_material(material)
    else:
        palette_material(material)

# The ink line is part of the cel-shaded style, so it rides with it.
if TOON:
    ink = bpy.data.materials.new("toon_ink")
    ink.use_nodes = True
    ink_tree = ink.node_tree
    ink_tree.nodes.clear()
    ink_out = ink_tree.nodes.new("ShaderNodeOutputMaterial")
    ink_emit = ink_tree.nodes.new("ShaderNodeEmission")
    ink_emit.inputs["Color"].default_value = (*srgb("#0a0d14"), 1)
    ink_tree.links.new(ink_emit.outputs["Emission"], ink_out.inputs["Surface"])
    ink.use_backface_culling = True

    camera = scene.camera
    world_per_px = (camera.data.ortho_scale * max(1.0, FRAME_HEIGHT / FRAME_WIDTH)) / FRAME_HEIGHT
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        obj.data.materials.append(ink)
        shell = obj.modifiers.new("toon_ink_hull", "SOLIDIFY")
        shell.thickness = OUTLINE_PX * world_per_px
        shell.offset = 1.0
        shell.use_rim = False
        shell.use_flip_normals = True
        shell.material_offset = len(obj.data.materials) - 1
        shell.material_offset_rim = len(obj.data.materials) - 1

# Only the banded look needs one dominant key; the authored lighting IS the shipped
# look, so a native render must not touch it.
if TOON:
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        if obj.data.type == "SUN":
            obj.data.energy = SUN
        else:
            obj.data.energy *= FILL

# EEVEE only for the banded look, where Shader to RGB requires it. The shipped look
# is path-traced, and its depth comes from GI and contact shadow that a rasteriser
# does not compute -- rendering it in EEVEE reads flat however the lights are set.
#
# Path-tracing a 51px frame was the ORIGINAL complaint, but the fault was 48 samples,
# not the engine: at ~3k pixels a frame, converging costs seconds. Sample properly
# and the native render is the downscale-from-512 without the downscale.
scene.render.engine = "BLENDER_EEVEE" if TOON else "CYCLES"
if not TOON:
    scene.cycles.samples = 1024
    scene.cycles.use_denoising = False
scene.eevee.taa_render_samples = 64
# A narrow reconstruction filter keeps a drawn ink line hard, which is what the
# banded look needs. The shipped look is the opposite: it wants each delivery pixel
# to be a proper average of the geometry behind it -- that averaging is exactly what
# the old downscale-from-512 was providing, and dropping to 0.5 here threw it away
# and made the native render read flat.
scene.render.filter_size = 0.5 if TOON else 1.5
if TOON:
    scene.eevee.taa_render_samples = 64
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = FRAME_WIDTH
scene.render.resolution_y = FRAME_HEIGHT
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)

rig.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
v = world_to_camera_view(scene, scene.camera, mathutils.Vector((0, 0, 0)))
print("ANCHOR unitAnchorX=%.5f unitAnchorY=%.5f" % (v.x, 1 - v.y))
print("UNIT_TOON_DONE %s palette=%s %dx%d" % (OUT, PALETTE, FRAME_WIDTH, FRAME_HEIGHT))
