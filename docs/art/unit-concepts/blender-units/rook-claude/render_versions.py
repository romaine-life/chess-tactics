"""Reconstruct every milestone of Claude's rook and save each as its own PNG +
.blend so the progression can be scrolled and any version reopened as a fallback.

Run with:
    blender --background --python render_versions.py

The earlier iterations were overwritten during live work; this rebuilds them
faithfully from the known code evolution. Output -> versions/vN-<label>.(png|blend)

  v1  first pass            (EEVEE) rich navy, stacked 4-tier base, merlon top
  v2  simple base           (EEVEE) base collapsed to plinth + cap
  v3  overhang top           (EEVEE) cantilevered battlement box, 4 walls
  v4  open sides             (EEVEE) side notches open (gate + rear wall only)
  v5  carved stone          (Cycles) boolean one-mass, AO/edge wear, subtle seams
  v6  masonry + varied dmg  (Cycles) running-bond ashlar, 4 per-pillar failures
  v7  rough rock, one shear (Cycles) single shear + layered rock displacement
"""

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / "versions"
OUT.mkdir(parents=True, exist_ok=True)

# Walk up to the worktree root (the dir that holds frontend/) so 8-direction
# sprites can be written straight into the catalog's candidate folders.
ROOT = HERE
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
FRONTEND_ROOK = ROOT / ".unit-art-output" / "rook"

# Board-calibrated camera (true-isometric projection contract).
BOARD_TARGET = Vector((0, 0, 0.92))
BOARD_DISTANCE = 5.0
BOARD_ELEVATION_DEGREES = 35.264389682754654
BOARD_ORTHO = 3.05
DIRECTIONS = {
    "north": 180, "north-east": 135, "east": 90, "south-east": 45,
    "south": 0, "south-west": -45, "west": -90, "north-west": -135,
}


def setup_board_camera(ortho=BOARD_ORTHO):
    bpy.ops.object.camera_add(location=(0, 0, 0))
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
    cam.data.ortho_scale = ortho
    return cam


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.textures, bpy.data.worlds):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def set_material(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)


def cube(name, location, scale, material, bevel_amount=0.03):
    """Beveled cube (classic EEVEE versions)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, material)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = bevel_amount
    mod.segments = 2
    mod.use_clamp_overlap = True
    mod.harden_normals = True
    obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    return obj


def solid(name, location, scale):
    """Plain cube (carved Cycles versions)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def join_objs(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def boolean(target, cutter, op):
    mod = target.modifiers.new("bool", "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def cut(rook, loc, size, rot=(0.0, 0.0, 0.0)):
    c = solid("cut", loc, size)
    c.rotation_euler = rot
    boolean(rook, c, "DIFFERENCE")


# ---------------------------------------------------------------------------
# materials -- EEVEE weathered (v1-v4)
# ---------------------------------------------------------------------------

def weathered_stone(name, base, highlight, grime, scale=5.0, contrast=0.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.9
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5 - contrast * 0.5
    ramp.color_ramp.elements[0].color = (*grime, 1)
    ramp.color_ramp.elements[1].position = 0.5 + contrast * 0.5
    ramp.color_ramp.elements[1].color = (*base, 1)
    noise2 = nt.nodes.new("ShaderNodeTexNoise")
    noise2.inputs["Scale"].default_value = scale * 3.2
    ramp2 = nt.nodes.new("ShaderNodeValToRGB")
    ramp2.color_ramp.elements[0].position = 0.62
    ramp2.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp2.color_ramp.elements[1].position = 0.78
    ramp2.color_ramp.elements[1].color = (*highlight, 1)
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "ADD"
    mix.inputs["Fac"].default_value = 0.5
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], noise2.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(noise2.outputs["Fac"], ramp2.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Color1"])
    nt.links.new(ramp2.outputs["Color"], mix.inputs["Color2"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def flat_mat(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    m.diffuse_color = (*color, 1)
    return m


# ---------------------------------------------------------------------------
# materials -- shared wood/iron + Cycles castle stone (v5-v7)
# ---------------------------------------------------------------------------

def plank_wood(name, base, dark):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.78
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 8.0
    wave.inputs["Distortion"].default_value = 1.6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def metal(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.45
    bsdf.inputs["Metallic"].default_value = 0.85
    m.diffuse_color = (*color, 1)
    return m


def castle_stone(name, base, light, crevice, rough=0.9, noise_scale=4.5,
                 streaks=True, bump_strength=0.42):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = rough
    coord = nt.nodes.new("ShaderNodeTexCoord")

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 8.0
    weather = nt.nodes.new("ShaderNodeValToRGB")
    weather.color_ramp.elements[0].position = 0.22
    weather.color_ramp.elements[0].color = (*crevice, 1)
    weather.color_ramp.elements[1].position = 0.80
    weather.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], weather.inputs["Fac"])
    color_src = weather

    if streaks:
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (3.0, 3.0, 0.35)
        snoise = nt.nodes.new("ShaderNodeTexNoise")
        snoise.inputs["Scale"].default_value = 3.5
        sramp = nt.nodes.new("ShaderNodeValToRGB")
        sramp.color_ramp.elements[0].position = 0.42
        sramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        sramp.color_ramp.elements[1].position = 0.62
        sramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], snoise.inputs["Vector"])
        nt.links.new(snoise.outputs["Fac"], sramp.inputs["Fac"])
        streak = nt.nodes.new("ShaderNodeMixRGB")
        streak.inputs["Color2"].default_value = (*crevice, 1)
        nt.links.new(weather.outputs["Color"], streak.inputs["Color1"])
        nt.links.new(sramp.outputs["Color"], streak.inputs["Fac"])
        color_src = streak

    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.06
    ao.samples = 8
    ao_inv = nt.nodes.new("ShaderNodeMath")
    ao_inv.operation = "SUBTRACT"
    ao_inv.inputs[0].default_value = 1.0
    nt.links.new(ao.outputs["AO"], ao_inv.inputs[1])
    ao_gain = nt.nodes.new("ShaderNodeMath")
    ao_gain.operation = "MULTIPLY"
    ao_gain.inputs[1].default_value = 0.5
    nt.links.new(ao_inv.outputs["Value"], ao_gain.inputs[0])
    cavity = nt.nodes.new("ShaderNodeMixRGB")
    cavity.inputs["Color2"].default_value = (*crevice, 1)
    nt.links.new(color_src.outputs["Color"], cavity.inputs["Color1"])
    nt.links.new(ao_gain.outputs["Value"], cavity.inputs["Fac"])

    bevel = nt.nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = 0.05
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bevel.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    edge = nt.nodes.new("ShaderNodeValToRGB")
    edge.color_ramp.elements[0].position = 0.55
    edge.color_ramp.elements[0].color = (1, 1, 1, 1)
    edge.color_ramp.elements[1].position = 0.97
    edge.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(dot.outputs["Value"], edge.inputs["Fac"])
    edge_mix = nt.nodes.new("ShaderNodeMixRGB")
    edge_mix.inputs["Color2"].default_value = (*light, 1)
    nt.links.new(cavity.outputs["Color"], edge_mix.inputs["Color1"])
    nt.links.new(edge.outputs["Color"], edge_mix.inputs["Fac"])
    nt.links.new(edge_mix.outputs["Color"], bsdf.inputs["Base Color"])

    voro = nt.nodes.new("ShaderNodeTexVoronoi")
    voro.inputs["Scale"].default_value = noise_scale * 2.2
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = noise_scale * 4.5
    relief = nt.nodes.new("ShaderNodeMath")
    relief.operation = "ADD"
    nt.links.new(coord.outputs["Object"], voro.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(voro.outputs["Distance"], relief.inputs[0])
    nt.links.new(fine.outputs["Fac"], relief.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.04
    nt.links.new(relief.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


# ---------------------------------------------------------------------------
# scene rig (shared)
# ---------------------------------------------------------------------------

def setup_world():
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.02, 0.03, 0.05, 1)
        bg.inputs["Strength"].default_value = 0.35


def setup_lighting():
    bpy.ops.object.light_add(type="SUN", location=(-3, -4, 8))
    key = bpy.context.object
    key.rotation_euler = (math.radians(50), 0, math.radians(-38))
    key.data.energy = 3.0
    key.data.angle = math.radians(3)
    key.data.color = (0.85, 0.92, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(3.5, -3.0, 3.0))
    bpy.context.object.data.energy = 130
    bpy.context.object.data.size = 6
    bpy.context.object.data.color = (0.7, 0.78, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(-2.0, 4.0, 4.5))
    bpy.context.object.data.energy = 80
    bpy.context.object.data.size = 4
    bpy.context.object.data.color = (0.55, 0.7, 1.0)


def setup_camera():
    bpy.ops.object.camera_add(location=(3.6, -3.6, 3.1))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    direction = Vector((0, 0, 0.95)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.9


def render_eevee():
    s = bpy.context.scene
    try:
        s.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        s.render.engine = "BLENDER_EEVEE"
    if hasattr(s, "eevee") and hasattr(s.eevee, "taa_render_samples"):
        s.eevee.taa_render_samples = 64
    s.view_settings.view_transform = "Standard"


def render_cycles():
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.samples = 140
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    s.cycles.device = "CPU"
    s.view_settings.view_transform = "Standard"


def common_render_settings(res=768):
    s = bpy.context.scene
    s.render.resolution_x = res
    s.render.resolution_y = res
    s.render.film_transparent = True


# ---------------------------------------------------------------------------
# v1-v4 : classic EEVEE builder
# ---------------------------------------------------------------------------

def classic(base="simple", top="overhang_open"):
    STONE = weathered_stone("navy stone", (0.030, 0.075, 0.130), (0.16, 0.26, 0.36), (0.012, 0.035, 0.065), 4.5, 0.6)
    CAP = weathered_stone("lit cap stone", (0.090, 0.180, 0.265), (0.24, 0.36, 0.46), (0.045, 0.10, 0.16), 5.5, 0.5)
    FLOOR = weathered_stone("courtyard stone", (0.055, 0.110, 0.165), (0.18, 0.28, 0.36), (0.025, 0.06, 0.10), 9.0, 0.55)
    EDGE = flat_mat("dark seam", (0.006, 0.018, 0.030))
    WOOD = plank_wood("gate wood", (0.28, 0.14, 0.055), (0.13, 0.06, 0.022))
    IRON = metal("gate iron", (0.06, 0.07, 0.085))
    p = []

    if base == "stacked":
        p.append(cube("plinth wide", (0, 0, 0.09), (1.34, 1.34, 0.18), CAP, 0.04))
        p.append(cube("plinth mid", (0, 0, 0.27), (1.16, 1.16, 0.16), STONE, 0.035))
        p.append(cube("plinth cap", (0, 0, 0.42), (0.98, 0.98, 0.13), CAP, 0.03))
        p.append(cube("shaft base course", (0, 0, 0.55), (0.86, 0.86, 0.14), STONE, 0.025))
        p.append(cube("shaft", (0, 0, 1.06), (0.80, 0.80, 0.94), STONE, 0.022))
    else:
        p.append(cube("plinth", (0, 0, 0.12), (1.32, 1.32, 0.24), CAP, 0.04))
        p.append(cube("base cap", (0, 0, 0.32), (1.02, 1.02, 0.16), STONE, 0.045))
        p.append(cube("shaft", (0, 0, 0.97), (0.82, 0.82, 1.14), STONE, 0.022))

    if top == "merlons":
        # stuck-on seams
        for z in (0.78, 1.04, 1.30):
            p.append(cube("front course seam", (0, -0.404, z), (0.78, 0.012, 0.02), EDGE, 0.001))
            p.append(cube("right course seam", (0.404, 0, z), (0.012, 0.78, 0.02), EDGE, 0.001))
        for x in (-0.26, 0.0, 0.26):
            p.append(cube("front vert seam", (x, -0.406, 1.04), (0.014, 0.014, 0.5), EDGE, 0.001))
        for y in (-0.26, 0.0, 0.26):
            p.append(cube("right vert seam", (0.406, y, 1.04), (0.014, 0.014, 0.5), EDGE, 0.001))
        p.append(cube("corbel belt", (0, 0, 1.55), (0.94, 0.94, 0.10), CAP, 0.022))
        p.append(cube("top slab", (0, 0, 1.63), (1.00, 1.00, 0.10), STONE, 0.02))
        p.append(cube("courtyard floor", (0, 0, 1.69), (0.66, 0.66, 0.05), FLOOR, 0.008))
        for o in (-0.22, 0.0, 0.22):
            p.append(cube("grout ns", (o, 0, 1.715), (0.018, 0.62, 0.018), EDGE, 0.001))
            p.append(cube("grout ew", (0, o, 1.715), (0.62, 0.018, 0.018), EDGE, 0.001))
        for cx, cy in [(-0.40, -0.40), (0.40, -0.40), (-0.40, 0.40), (0.40, 0.40)]:
            p.append(cube("corner merlon", (cx, cy, 1.90), (0.26, 0.26, 0.40), CAP, 0.018))
        for x in (-0.40, 0.40):
            p.append(cube("side merlon", (x, 0.0, 1.86), (0.22, 0.18, 0.30), CAP, 0.018))
        p.append(cube("rear merlon", (0.0, 0.40, 1.86), (0.20, 0.22, 0.30), CAP, 0.018))
        gate_top(p, EDGE, WOOD, IRON, gy=-0.40, wall_z=1.78, span=0.50, wall=0.42, classic=True)
    else:
        shaft_top = 1.54
        plat_h = 0.20
        p.append(cube("overhang platform", (0, 0, shaft_top + plat_h / 2), (1.16, 1.16, plat_h), CAP, 0.03))
        plat_top = shaft_top + plat_h
        p.append(cube("courtyard floor", (0, 0, plat_top + 0.03), (0.80, 0.80, 0.05), FLOOR, 0.008))
        for o in (-0.25, 0.0, 0.25):
            p.append(cube("grout ns", (o, 0, plat_top + 0.05), (0.016, 0.74, 0.016), EDGE, 0.001))
            p.append(cube("grout ew", (0, o, plat_top + 0.05), (0.74, 0.016, 0.016), EDGE, 0.001))
        corner, cb, wall = 0.47, 0.22, 0.30
        wall_z = plat_top + wall / 2
        for cx in (-corner, corner):
            for cy in (-corner, corner):
                p.append(cube("corner block", (cx, cy, plat_top + 0.24), (cb, cb, 0.48), CAP, 0.022))
        span = (corner - cb / 2) * 2
        p.append(cube("rear wall", (0, corner, wall_z), (span, 0.18, wall), STONE, 0.02))
        if top == "overhang_walls":
            p.append(cube("left wall", (-corner, 0, wall_z), (0.18, span, wall), STONE, 0.02))
            p.append(cube("right wall", (corner, 0, wall_z), (0.18, span, wall), STONE, 0.02))
        gate_top(p, EDGE, WOOD, IRON, gy=-corner, wall_z=wall_z, span=span, wall=wall, classic=True)

    g = bpy.data.objects.new("rook", None)
    bpy.context.collection.objects.link(g)
    for o in p:
        o.parent = g
    render_eevee()
    return g


def gate_top(p, EDGE, WOOD, IRON, gy, wall_z, span, wall, classic):
    p.append(cube("gate recess", (0, gy + 0.02, wall_z), (span, 0.10, wall + 0.02), WOOD, 0.004))
    p.append(cube("gate planks", (0, gy - 0.02, wall_z), (span - 0.02, 0.05, wall - 0.02), WOOD, 0.005))
    step = span / 5.0
    for i in range(5):
        px = -span / 2 + step * (i + 0.5)
        p.append(cube("plank gap", (px, gy - 0.05, wall_z), (0.01, 0.012, wall - 0.05), EDGE, 0.001))
    for bz in (wall_z - wall / 2 + 0.045, wall_z + wall / 2 - 0.045):
        p.append(cube("iron band", (0, gy - 0.055, bz), (span - 0.02, 0.014, 0.045), IRON, 0.002))
        for sx in (-0.18, -0.06, 0.06, 0.18):
            p.append(cube("stud", (sx, gy - 0.063, bz), (0.028, 0.012, 0.028), IRON, 0.004))


# ---------------------------------------------------------------------------
# v5-v7 : carved Cycles builder
# ---------------------------------------------------------------------------

def _hg(cutters, axis, plane, lo, hi, z, depth, gw):
    c = (lo + hi) / 2
    if axis == "x":
        cutters.append(solid("h", (c, plane, z), (hi - lo, depth * 2, gw)))
    else:
        cutters.append(solid("h", (plane, c, z), (depth * 2, hi - lo, gw)))


def _vg(cutters, axis, plane, t, z, h, depth, gw):
    if axis == "x":
        cutters.append(solid("v", (t, plane, z), (gw, depth * 2, h)))
    else:
        cutters.append(solid("v", (plane, t, z), (depth * 2, gw, h)))


def coursed_face(rook, axis, plane, lo, hi, z0, z1, block_w, course_h, seed,
                 depth=0.013, gw=0.015):
    rnd = random.Random(1000 + seed)
    n = max(1, round((z1 - z0) / course_h))
    zs = [z0 + (z1 - z0) * i / n for i in range(n + 1)]
    hl, vl = [], []
    for j, z in enumerate(zs):
        jz = z if j in (0, n) else z + rnd.uniform(-0.006, 0.006)
        _hg(hl, axis, plane, lo, hi, jz, depth, gw)
    for i in range(n):
        zc = (zs[i] + zs[i + 1]) / 2
        h = (zs[i + 1] - zs[i]) + gw
        x = lo + (block_w / 2 if i % 2 else 0.0)
        while x < hi - 0.04:
            if x > lo + 0.04:
                _vg(vl, axis, plane, x + rnd.uniform(-0.012, 0.012), zc, h, depth, gw)
            x += block_w
    if hl:
        boolean(rook, join_objs(hl, "h"), "DIFFERENCE")
    if vl:
        boolean(rook, join_objs(vl, "v"), "DIFFERENCE")


def damage_pillar(rook, px, py, top_z, half, style, seed):
    rnd = random.Random(seed)
    sx = 1.0 if px >= 0 else -1.0
    sy = 1.0 if py >= 0 else -1.0
    R = math.radians
    if style == "bite":
        cut(rook, (px + sx * 0.05, py + sy * 0.05, top_z + 0.01), (0.23, 0.23, 0.26),
            (R(rnd.uniform(22, 38)), R(rnd.uniform(22, 38)), R(rnd.uniform(0, 40))))
        cut(rook, (px - sx * 0.07, py - sy * 0.03, top_z - 0.03), (0.10, 0.10, 0.13), (R(28), R(22), R(15)))
    elif style == "shear":
        cut(rook, (px + sx * 0.13, py + sy * 0.13, top_z + 0.05), (0.32, 0.32, 0.32), (R(34 * sy), R(-34 * sx), R(20)))
    elif style == "crumble":
        for _ in range(7):
            s = rnd.uniform(0.045, 0.095)
            cut(rook, (px + rnd.uniform(-half, half), py + rnd.uniform(-half, half), top_z + rnd.uniform(-0.05, 0.03)),
                (s, s, s), (R(rnd.uniform(0, 180)), R(rnd.uniform(0, 180)), R(rnd.uniform(0, 180))))
    elif style == "split":
        cut(rook, (px + sx * 0.015, py + sy * half, top_z - 0.10), (0.04, 0.12, 0.34), (R(6), 0, R(7)))
        cut(rook, (px + sx * half, py + sy * 0.015, top_z - 0.10), (0.12, 0.04, 0.34), (0, R(6), R(7)))
        cut(rook, (px + sx * 0.08, py + sy * 0.08, top_z + 0.03), (0.15, 0.15, 0.12), (R(24), R(24), R(10)))


def carved(groove="bonded", damage="shear", displace="layered", streaks=True, bump=0.42):
    STONE = castle_stone("navy stone", (0.030, 0.072, 0.125), (0.20, 0.31, 0.42), (0.020, 0.048, 0.080),
                         noise_scale=4.0, streaks=streaks, bump_strength=bump)
    CAP = castle_stone("lit cap stone", (0.075, 0.160, 0.245), (0.30, 0.43, 0.55), (0.030, 0.075, 0.125),
                       noise_scale=5.0, streaks=streaks, bump_strength=bump)
    FLOOR = castle_stone("courtyard stone", (0.045, 0.095, 0.150), (0.16, 0.26, 0.35), (0.015, 0.040, 0.070),
                         noise_scale=8.0, streaks=streaks, bump_strength=bump)
    WOOD = plank_wood("gate wood", (0.30, 0.15, 0.06), (0.13, 0.06, 0.022))
    IRON = metal("gate iron", (0.05, 0.06, 0.075))
    EDGE_DARK = flat_mat("gate groove dark", (0.020, 0.012, 0.006))

    parts = []

    def stone(name, loc, scale, material):
        o = solid(name, loc, scale)
        set_material(o, material)
        parts.append(o)
        return o

    stone("plinth", (0, 0, 0.12), (1.32, 1.32, 0.24), CAP)
    stone("base cap", (0, 0, 0.32), (1.02, 1.02, 0.16), STONE)
    stone("shaft", (0, 0, 0.97), (0.82, 0.82, 1.14), STONE)
    shaft_top = 1.54
    plat_h = 0.20
    stone("overhang", (0, 0, shaft_top + plat_h / 2), (1.16, 1.16, plat_h), CAP)
    plat_top = shaft_top + plat_h
    corner, cb, wall = 0.47, 0.22, 0.30
    heights = {(-1, -1): 0.50, (1, -1): 0.46, (-1, 1): 0.52, (1, 1): 0.47}
    for (sx, sy), h in heights.items():
        stone("corner block", (sx * corner, sy * corner, plat_top + h / 2), (cb, cb, h), CAP)
    span = (corner - cb / 2) * 2
    stone("rear wall", (0, corner, plat_top + wall / 2), (span, 0.18, wall), STONE)

    rook = parts[0]
    rook.name = "rook_stone"
    for o in parts[1:]:
        boolean(rook, o, "UNION")

    # Carve masonry on ALL FOUR faces (front -Y, back +Y, right +X, left -X) so
    # the style reads from every rotation, not just the two south-facing sides.
    FACES = (("x", -0.41), ("x", 0.41), ("y", 0.41), ("y", -0.41))
    if groove == "subtle":
        cutters = []

        def hcut(axis, plane, z, lo, hi):
            if axis == "x":
                return solid("h", ((lo + hi) / 2, plane, z), (abs(hi - lo), 0.024, 0.018))
            return solid("h", (plane, (lo + hi) / 2, z), (0.024, abs(hi - lo), 0.018))

        def vcut(axis, plane, t, z):
            if axis == "x":
                return solid("v", (t, plane, z), (0.016, 0.024, 0.22))
            return solid("v", (plane, t, z), (0.024, 0.016, 0.22))

        for axis, plane in FACES:
            for z in (0.70, 0.97, 1.24, 1.51):
                cutters.append(hcut(axis, plane, z, -0.36, 0.36))
            for z, ts in [(0.835, (-0.18, 0.18)), (1.105, (-0.27, -0.09, 0.09, 0.27)), (1.375, (-0.18, 0.18))]:
                for t in ts:
                    cutters.append(vcut(axis, plane, t, z))
            cutters.append(hcut(axis, plane, 0.26, -0.46, 0.46))
        for c in cutters:
            boolean(rook, c, "DIFFERENCE")
    elif groove == "bonded":
        # (lo, hi, z0, z1, block_w, course_h, half-width) per stacked section
        sections = [
            (-0.40, 0.40, 0.56, 1.52, 0.225, 0.158, 0.41),  # shaft
            (-0.46, 0.46, 0.25, 0.39, 0.30, 0.16, 0.51),    # base cap
            (-0.60, 0.60, 0.04, 0.22, 0.40, 0.20, 0.66),    # plinth
            (-0.52, 0.52, 1.56, 1.72, 0.34, 0.18, 0.58),    # overhang
        ]
        seed = 0
        for lo, hi, z0, z1, bw, ch, half in sections:
            for axis, sign in (("x", -1), ("x", 1), ("y", 1), ("y", -1)):
                seed += 1
                coursed_face(rook, axis, sign * half, lo, hi, z0, z1, bw, ch, seed)

    if damage == "varied":
        styles = {(-1, -1): "shear", (1, -1): "bite", (1, 1): "crumble", (-1, 1): "split"}
        for (sx, sy), h in heights.items():
            damage_pillar(rook, sx * corner, sy * corner, plat_top + h, cb / 2, styles[(sx, sy)], 41 + sx * 3 + sy)
        rnd = random.Random(21)
        specs = [((0.41, -0.41, rnd.uniform(0.6, 1.45)), rnd.uniform(0.05, 0.09)) for _ in range(5)]
        specs += [((-0.55, -0.58, 1.72), 0.09), ((0.55, -0.58, 1.72), 0.08), ((0.58, 0.0, 1.64), 0.07),
                  ((-0.66, -0.66, 0.24), 0.10), ((0.66, -0.66, 0.24), 0.09),
                  ((-0.51, -0.51, 0.40), 0.07), ((0.51, -0.51, 0.40), 0.07)]
        crnd = random.Random(33)
        for (loc, size) in specs:
            cut(rook, loc, (size, size, size),
                (crnd.uniform(0, math.pi), crnd.uniform(0, math.pi), crnd.uniform(0, math.pi)))
    elif damage == "shear":
        damage_pillar(rook, -corner, -corner, plat_top + heights[(-1, -1)], cb / 2, "shear", 41)

    bev = rook.modifiers.new("bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 2
    bev.use_clamp_overlap = True
    bev.harden_normals = True
    if displace == "single":
        sub = rook.modifiers.new("sub", "SUBSURF")
        sub.subdivision_type = "SIMPLE"
        sub.levels = sub.render_levels = 2
        t = bpy.data.textures.new("worn", type="CLOUDS")
        t.noise_scale = 0.30
        d = rook.modifiers.new("disp", "DISPLACE")
        d.texture = t
        d.texture_coords = "OBJECT"
        d.strength = 0.014
    elif displace == "layered":
        sub = rook.modifiers.new("sub", "SUBSURF")
        sub.subdivision_type = "SIMPLE"
        sub.levels = sub.render_levels = 3
        big = bpy.data.textures.new("rock_big", type="CLOUDS")
        big.noise_scale = 0.45
        big.noise_depth = 3
        d1 = rook.modifiers.new("disp_big", "DISPLACE")
        d1.texture = big
        d1.texture_coords = "OBJECT"
        d1.strength = 0.026
        fine = bpy.data.textures.new("rock_fine", type="STUCCI")
        fine.noise_scale = 0.16
        fine.stucci_type = "WALL_OUT"
        d2 = rook.modifiers.new("disp_fine", "DISPLACE")
        d2.texture = fine
        d2.texture_coords = "OBJECT"
        d2.strength = 0.013
    rook.modifiers.new("wn", "WEIGHTED_NORMAL")

    pieces = [rook]

    def part(name, loc, scale, material):
        o = solid(name, loc, scale)
        set_material(o, material)
        b = o.modifiers.new("b", "BEVEL")
        b.width = 0.01
        b.segments = 2
        b.use_clamp_overlap = True
        pieces.append(o)

    wall_z = plat_top + wall / 2
    gy = -corner
    part("courtyard floor", (0, 0, plat_top + 0.03), (0.80, 0.80, 0.05), FLOOR)
    part("gate recess", (0, gy + 0.02, wall_z), (span, 0.10, wall + 0.02), WOOD)
    part("gate planks", (0, gy - 0.02, wall_z), (span - 0.02, 0.05, wall - 0.02), WOOD)
    for px in (-0.18, -0.09, 0.0, 0.09, 0.18):
        part("plank gap", (px, gy - 0.05, wall_z), (0.01, 0.012, wall - 0.05), EDGE_DARK)
    for bz in (wall_z - wall / 2 + 0.035, wall_z + wall / 2 - 0.035):
        part("iron band", (0, gy - 0.055, bz), (span - 0.01, 0.014, 0.042), IRON)
        for sx in (-0.18, -0.06, 0.06, 0.18):
            part("stud", (sx, gy - 0.063, bz), (0.028, 0.012, 0.028), IRON)

    g = bpy.data.objects.new("rook", None)
    bpy.context.collection.objects.link(g)
    for o in pieces:
        o.parent = g
    render_cycles()
    return g


# ---------------------------------------------------------------------------
# run all versions
# ---------------------------------------------------------------------------

VERSIONS = [
    ("v1-first-pass", "old-keep", classic, dict(base="stacked", top="merlons")),
    ("v2-simple-base", "sentinel", classic, dict(base="simple", top="merlons")),
    ("v3-overhang-top", "bastion", classic, dict(base="simple", top="overhang_walls")),
    ("v4-open-sides", "gatewatch", classic, dict(base="simple", top="overhang_open")),
    ("v5-carved-stone", "masonkeep", carved, dict(groove="subtle", damage="none", displace="none", streaks=False, bump=0.28)),
    ("v6-masonry-varied-damage", "breachhold", carved, dict(groove="bonded", damage="varied", displace="single", streaks=True, bump=0.28)),
    ("v7-rough-rock-one-shear", "ruinwall", carved, dict(groove="bonded", damage="shear", displace="layered", streaks=True, bump=0.42)),
]

import sys as _sys
_ONLY = _sys.argv[_sys.argv.index("--") + 1:] if "--" in _sys.argv else []

for label, slug, builder, kwargs in VERSIONS:
    if _ONLY and slug not in _ONLY and label not in _ONLY:
        continue
    clear_scene()
    setup_world()
    setup_lighting()
    setup_board_camera()
    group = builder(**kwargs)          # builds + sets engine; returns the rook group
    common_render_settings(512)
    if hasattr(bpy.context.scene, "cycles"):
        bpy.context.scene.cycles.samples = 110
    out = FRONTEND_ROOK / f"candidate-{slug}"
    out.mkdir(parents=True, exist_ok=True)
    for direction, angle in DIRECTIONS.items():       # rotate the piece, fixed camera
        group.rotation_euler[2] = math.radians(angle)
        bpy.context.scene.render.filepath = str(out / f"{direction}.png")
        bpy.ops.render.render(write_still=True)
    # keep a south snapshot + editable blend in the versions gallery
    group.rotation_euler[2] = 0
    bpy.context.scene.render.filepath = str(OUT / f"{label}.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{label}.blend"))
    print(f"VERSION_DONE {label} -> candidate-{slug} (8 dirs)")

print(f"FRONTEND_ROOK={FRONTEND_ROOK}")
print("ALL_VERSIONS_DONE")
