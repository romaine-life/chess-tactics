"""Claude's chess-piece set -- turned (lathe) pieces in the rook's navy stone.

Run with:
    blender --background --python pieces_claude.py            # all turned pieces
    blender --background --python pieces_claude.py -- bishop   # one piece

Track 1 (this file): king / queen / bishop / pawn are surfaces of revolution --
a traced silhouette profile revolved with the Screw modifier, plus each piece's
signature feature, finished with the same carved-stone material + lighting +
camera as the rook so the set reads as one family. The knight (organic horse
head) is handled separately.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE
OUT.mkdir(parents=True, exist_ok=True)

# Walk up to the worktree root (holds frontend/) for catalog sprite output.
ROOT = HERE
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
FRONTEND_UNITS = ROOT / ".unit-art-output"

# Board-calibrated camera (same angle as the production rook / tile view).
BOARD_DISTANCE = 5.0
BOARD_ELEVATION_DEGREES = 44.1
DIRECTIONS = {
    "north": 180, "north-east": 135, "east": 90, "south-east": 45,
    "south": 0, "south-west": -45, "west": -90, "north-west": -135,
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.textures, bpy.data.worlds):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def lathe(name, profile, material, segments=72, smooth=2):
    """Revolve a (radius, z) profile around Z into a turned solid."""
    verts = [(r, 0.0, z) for (r, z) in profile]
    edges = [(i, i + 1) for i in range(len(verts) - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    screw = obj.modifiers.new("screw", "SCREW")
    screw.angle = 2 * math.pi
    screw.steps = segments
    screw.render_steps = segments
    screw.use_merge_vertices = True
    screw.merge_threshold = 0.0005
    screw.axis = "Z"
    bpy.ops.object.modifier_apply(modifier="screw")
    # weld the 0/360 seam and unify normals so the turned body has no seam line
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0009)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # smooth the turned facets (applied so later booleans cut a clean mesh)
    if smooth:
        sub = obj.modifiers.new("smooth", "SUBSURF")
        sub.levels = sub.render_levels = smooth
        bpy.ops.object.modifier_apply(modifier="smooth")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def boolean(target, cutter, op="DIFFERENCE"):
    mod = target.modifiers.new("bool", "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def box(name, loc, size, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler = rot
    return o


def stone_box(name, loc, size, material, rot=(0, 0, 0)):
    o = box(name, loc, size, rot)
    o.data.materials.append(material)
    return o


def cone(name, loc, r, depth, material, verts=20):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0.0,
                                    depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def sphere(name, loc, r, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def rough_surface(obj, strength=0.012):
    """Light rock displacement so turned faces aren't glassy, matching the rook."""
    sub = obj.modifiers.new("disp_sub", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = sub.render_levels = 2
    big = bpy.data.textures.new("rock_big", type="CLOUDS")
    big.noise_scale = 0.40
    big.noise_depth = 3
    d1 = obj.modifiers.new("disp_big", "DISPLACE")
    d1.texture = big
    d1.texture_coords = "OBJECT"
    d1.strength = strength
    fine = bpy.data.textures.new("rock_fine", type="STUCCI")
    fine.noise_scale = 0.14
    fine.stucci_type = "WALL_OUT"
    d2 = obj.modifiers.new("disp_fine", "DISPLACE")
    d2.texture = fine
    d2.texture_coords = "OBJECT"
    d2.strength = strength * 0.7


# ---------------------------------------------------------------------------
# carved navy stone (same shader family as the rook)
# ---------------------------------------------------------------------------

def castle_stone(name, base, light, crevice, noise_scale=4.5, bump_strength=0.4):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.9
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

    # vertical grime streaks
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (3.0, 3.0, 0.35)
    snoise = nt.nodes.new("ShaderNodeTexNoise")
    snoise.inputs["Scale"].default_value = 3.5
    sramp = nt.nodes.new("ShaderNodeValToRGB")
    sramp.color_ramp.elements[0].position = 0.42
    sramp.color_ramp.elements[1].position = 0.62
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], snoise.inputs["Vector"])
    nt.links.new(snoise.outputs["Fac"], sramp.inputs["Fac"])
    streak = nt.nodes.new("ShaderNodeMixRGB")
    streak.inputs["Color2"].default_value = (*crevice, 1)
    nt.links.new(weather.outputs["Color"], streak.inputs["Color1"])
    nt.links.new(sramp.outputs["Color"], streak.inputs["Fac"])

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
    nt.links.new(streak.outputs["Color"], cavity.inputs["Color1"])
    nt.links.new(ao_gain.outputs["Value"], cavity.inputs["Fac"])

    bevel = nt.nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = 0.04
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bevel.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    edge = nt.nodes.new("ShaderNodeValToRGB")
    edge.color_ramp.elements[0].position = 0.6
    edge.color_ramp.elements[0].color = (1, 1, 1, 1)
    edge.color_ramp.elements[1].position = 0.985
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
    nt.links.new(relief.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def stone():
    return castle_stone("navy stone", (0.045, 0.10, 0.16), (0.26, 0.38, 0.50),
                        (0.020, 0.050, 0.085), noise_scale=5.0, bump_strength=0.55)


# ---------------------------------------------------------------------------
# pieces
# ---------------------------------------------------------------------------

def build_bishop():
    m = stone()
    # silhouette: narrow fluted foot -> slim stem -> flared collar -> ovoid head -> ball
    profile = [
        (0.00, 0.00), (0.46, 0.00), (0.46, 0.05), (0.39, 0.075), (0.41, 0.10),
        (0.31, 0.15), (0.33, 0.175), (0.255, 0.225), (0.235, 0.30),
        (0.165, 0.46), (0.140, 0.78), (0.135, 1.06), (0.145, 1.14),
        (0.215, 1.21), (0.245, 1.245), (0.235, 1.28), (0.160, 1.35),
        (0.135, 1.42), (0.205, 1.52), (0.255, 1.64), (0.255, 1.73),
        (0.205, 1.84), (0.135, 1.94), (0.082, 2.01),
        (0.068, 2.04), (0.115, 2.08), (0.10, 2.125), (0.0, 2.16),
    ]
    body = lathe("bishop", profile, m, smooth=2)
    # diagonal mitre slit across the front of the head (cut before roughening)
    slit = box("slit", (0.0, -0.18, 1.62), (0.44, 0.32, 0.085), rot=(0, math.radians(35), 0))
    boolean(body, slit, "DIFFERENCE")
    rough_surface(body, 0.013)
    return body, 2.16


def build_king():
    m = stone()
    profile = [
        (0.00, 0.00), (0.50, 0.00), (0.50, 0.05), (0.42, 0.075), (0.44, 0.10),
        (0.34, 0.15), (0.36, 0.175), (0.27, 0.225), (0.245, 0.30),
        (0.205, 0.50), (0.185, 0.82), (0.18, 1.12), (0.195, 1.34),
        (0.235, 1.46), (0.255, 1.52), (0.21, 1.60), (0.165, 1.68),
        (0.20, 1.76), (0.28, 1.90), (0.295, 1.99), (0.235, 2.08),
        (0.165, 2.16), (0.115, 2.23), (0.085, 2.28), (0.0, 2.31),
    ]
    body = lathe("king", profile, m, smooth=2)
    rough_surface(body, 0.013)
    # classic structural cross finial (the king's chess cue)
    stone_box("king_cross_v", (0, 0, 2.47), (0.06, 0.06, 0.30), m)
    stone_box("king_cross_h", (0, 0, 2.50), (0.20, 0.06, 0.06), m)
    return body, 2.64


def build_queen():
    m = stone()
    profile = [
        (0.00, 0.00), (0.46, 0.00), (0.46, 0.05), (0.39, 0.075), (0.41, 0.10),
        (0.31, 0.15), (0.33, 0.175), (0.25, 0.225), (0.225, 0.30),
        (0.185, 0.50), (0.165, 0.82), (0.16, 1.06), (0.175, 1.22),
        (0.215, 1.32), (0.235, 1.38), (0.185, 1.46), (0.15, 1.54),
        (0.19, 1.62), (0.25, 1.74), (0.26, 1.84), (0.205, 1.90),
        (0.12, 1.94), (0.0, 1.96),
    ]
    body = lathe("queen", profile, m, smooth=2)
    rough_surface(body, 0.013)
    # carved tiara crest: a coronet of points + small center finial
    n = 6
    for i in range(n):
        a = 2 * math.pi * i / n
        cone(f"queen_point_{i}", (0.205 * math.cos(a), 0.205 * math.sin(a), 1.99),
             0.065, 0.22, m)
    sphere("queen_finial", (0, 0, 1.95), 0.075, m)
    return body, 2.12


def build_pawn():
    m = stone()
    base_profile = [
        (0.00, 0.00), (0.42, 0.00), (0.42, 0.05), (0.35, 0.075), (0.37, 0.10),
        (0.28, 0.145), (0.30, 0.17), (0.225, 0.22), (0.205, 0.29),
        (0.175, 0.42), (0.165, 0.56), (0.20, 0.66), (0.245, 0.74), (0.255, 0.80),
        (0.21, 0.86), (0.15, 0.92),
    ]
    body = lathe("pawn", base_profile, m, smooth=2)
    # great-helm shell unioned on the collar
    helm_profile = [
        (0.00, 0.92), (0.17, 0.92), (0.215, 0.98), (0.23, 1.08), (0.23, 1.28),
        (0.225, 1.38), (0.19, 1.46), (0.12, 1.51), (0.0, 1.53),
    ]
    helm = lathe("pawn_helm", helm_profile, m, smooth=2)
    boolean(body, helm, "UNION")
    # cross visor: horizontal eye slit + vertical slit
    boolean(body, box("pawn_eye", (0, -0.26, 1.22), (0.30, 0.18, 0.05)), "DIFFERENCE")
    boolean(body, box("pawn_vert", (0, -0.26, 1.16), (0.05, 0.18, 0.28)), "DIFFERENCE")
    rough_surface(body, 0.010)
    return body, 1.55


PIECES = {
    "bishop": build_bishop,
    "king": build_king,
    "queen": build_queen,
    "pawn": build_pawn,
}


# ---------------------------------------------------------------------------
# scene rig + render
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


def setup_board_camera(target_z, ortho):
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    target = Vector((0, 0, target_z))
    elev = math.radians(BOARD_ELEVATION_DEGREES)
    horizontal = math.cos(elev) * BOARD_DISTANCE
    comp = horizontal / math.sqrt(2)
    cam.location = (target.x + comp, target.y - comp, target.z + math.sin(elev) * BOARD_DISTANCE)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho
    return cam


def setup_render():
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.samples = 150
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    s.cycles.device = "CPU"
    s.cycles.samples = 120
    s.render.resolution_x = s.render.resolution_y = 512
    s.render.film_transparent = True
    s.view_settings.view_transform = "Standard"


def assemble(name):
    """Build the piece and parent every mesh to a pivot so it rotates as one."""
    clear_scene()
    setup_world()
    setup_lighting()
    _, height = PIECES[name]()
    pivot = bpy.data.objects.new(f"{name}_pivot", None)
    bpy.context.collection.objects.link(pivot)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.parent is None:
            obj.parent = pivot
    return pivot, height


def render_preview(name):
    """Single south render to the gallery folder — fast validation, no catalog writes."""
    pivot, height = assemble(name)
    setup_board_camera(height * 0.5, height * 1.4)
    setup_render()
    bpy.context.scene.render.filepath = str(OUT / f"{name}-preview.png")
    bpy.ops.render.render(write_still=True)
    print(f"PREVIEW_DONE {name}")


def render_piece(name):
    pivot, height = assemble(name)
    setup_board_camera(height * 0.5, height * 1.4)
    setup_render()
    out = FRONTEND_UNITS / name / "candidate-claude"
    out.mkdir(parents=True, exist_ok=True)
    for direction, angle in DIRECTIONS.items():
        pivot.rotation_euler[2] = math.radians(angle)
        bpy.context.scene.render.filepath = str(out / f"{direction}.png")
        bpy.ops.render.render(write_still=True)
    pivot.rotation_euler[2] = 0
    bpy.context.scene.render.filepath = str(OUT / f"{name}-south.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{name}.blend"))
    print(f"PIECE_DONE {name} -> {out}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    preview = "preview" in argv
    targets = [t for t in argv if t in PIECES] or list(PIECES)
    for t in targets:
        render_preview(t) if preview else render_piece(t)
    print("PIECES_DONE")
