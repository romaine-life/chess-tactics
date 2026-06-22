"""Knight = the complete Staunton template restyled in our navy carved stone.

The template is one continuously-sculpted chess knight (head flows into the
turned body), which is the form a boolean graft can't produce. Here we just
recentre/scale it, swap in the set's stone material, and render it like the
other pieces.

    blender --background --python knight_from_template.py -- preview
    blender --background --python knight_from_template.py            # 8 dirs
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pieces_claude as P  # noqa: E402

FBX = HERE / "knight-template" / "staunton-src" / "source" / "Knight.fbx"
TARGET_H = 2.2
YAW = 0  # spin about Z to set which way the muzzle faces at 'south'


def knight_material():
    """Clean smooth navy stone with strong edge highlights + AO in the tier
    recesses, tuned to the accepted concept (no craggy mottling)."""
    base = (0.032, 0.075, 0.135)
    light = (0.27, 0.41, 0.56)
    deep = (0.010, 0.028, 0.058)
    m = bpy.data.materials.new("knight navy stone")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.76
    coord = nt.nodes.new("ShaderNodeTexCoord")

    noise = nt.nodes.new("ShaderNodeTexNoise")  # fine subtle speckle only
    noise.inputs["Scale"].default_value = 22.0
    noise.inputs["Detail"].default_value = 4.0
    nramp = nt.nodes.new("ShaderNodeValToRGB")
    nramp.color_ramp.elements[0].position = 0.35
    nramp.color_ramp.elements[0].color = (*[c * 0.82 for c in base], 1)
    nramp.color_ramp.elements[1].position = 0.65
    nramp.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], nramp.inputs["Fac"])

    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")  # darken tier recesses only
    ao.inputs["Distance"].default_value = 0.09
    ao.samples = 8
    aoinv = nt.nodes.new("ShaderNodeMath")
    aoinv.operation = "SUBTRACT"
    aoinv.inputs[0].default_value = 1.0
    nt.links.new(ao.outputs["AO"], aoinv.inputs[1])
    aog = nt.nodes.new("ShaderNodeMath")
    aog.operation = "MULTIPLY"
    aog.inputs[1].default_value = 0.45
    nt.links.new(aoinv.outputs["Value"], aog.inputs[0])
    aomix = nt.nodes.new("ShaderNodeMixRGB")
    aomix.inputs["Color2"].default_value = (*deep, 1)
    nt.links.new(nramp.outputs["Color"], aomix.inputs["Color1"])
    nt.links.new(aog.outputs["Value"], aomix.inputs["Fac"])

    bevel = nt.nodes.new("ShaderNodeBevel")  # lit edge highlight
    bevel.inputs["Radius"].default_value = 0.045
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bevel.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    eramp = nt.nodes.new("ShaderNodeValToRGB")
    eramp.color_ramp.elements[0].position = 0.5
    eramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    eramp.color_ramp.elements[1].position = 0.965
    eramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(dot.outputs["Value"], eramp.inputs["Fac"])
    emix = nt.nodes.new("ShaderNodeMixRGB")
    emix.inputs["Color2"].default_value = (*light, 1)
    nt.links.new(aomix.outputs["Color"], emix.inputs["Color1"])
    nt.links.new(eramp.outputs["Color"], emix.inputs["Fac"])
    nt.links.new(emix.outputs["Color"], bsdf.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.10
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def build_clean_base(material, base_top):
    # clean tiered turned base like the concept's stacked rings (smooth)
    profile = [
        (0.00, 0.00), (0.50, 0.00), (0.50, 0.05), (0.43, 0.085), (0.46, 0.12),
        (0.40, 0.17), (0.43, 0.205), (0.355, 0.255), (0.38, 0.29),
        (0.315, 0.34), (0.34, 0.375), (0.29, 0.43),
        (0.30, base_top - 0.04), (0.275, base_top),
    ]
    return P.lathe("knight_base", profile, material, smooth=2)


def data_bounds(md):
    vs = md.vertices
    xs = [v.co.x for v in vs]
    ys = [v.co.y for v in vs]
    zs = [v.co.z for v in vs]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def load_template():
    P.clear_scene()
    P.setup_world()
    P.setup_lighting()
    material = knight_material()  # clean navy stone tuned to the concept
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(FBX))
    meshes = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_basis = Matrix.Identity(4)
        o.data.transform(mw)
        o.data.update()
    knight = meshes[0]
    md = knight.data
    if YAW:
        md.transform(Euler((0, 0, math.radians(YAW)), "XYZ").to_matrix().to_4x4())
    mn, mx = data_bounds(md)
    md.transform(Matrix.Scale(TARGET_H / (mx.z - mn.z), 4))
    mn, mx = data_bounds(md)
    md.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
    md.update()
    md.materials.clear()
    md.materials.append(material)
    for p in md.polygons:
        p.use_smooth = True
    # Drop the template's rough sculpted base by deleting its verts (robust on a
    # non-solid sculpt where booleans fail), keeping the smooth head+neck.
    cut_z = 0.55
    bm = bmesh.new()
    bm.from_mesh(md)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut_z], context="VERTS")
    bm.to_mesh(md)
    bm.free()
    md.update()
    pivot = bpy.data.objects.new("knight_pivot", None)
    bpy.context.collection.objects.link(pivot)
    knight.parent = pivot
    # seat a clean tiered base so the neck opening plunges into its collar
    # (turned neck into turned collar reads continuous; same material)
    base = build_clean_base(material, cut_z + 0.12)
    base.parent = pivot
    return pivot


def render_preview():
    load_template()
    P.setup_board_camera(TARGET_H * 0.5, TARGET_H * 1.45)
    P.setup_render()
    bpy.context.scene.render.filepath = str(HERE / "knight-template-preview.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_DONE")


def render_catalog():
    pivot = load_template()
    P.setup_board_camera(TARGET_H * 0.5, TARGET_H * 1.45)
    P.setup_render()
    out = P.FRONTEND_UNITS / "knight" / "candidate-claude"
    out.mkdir(parents=True, exist_ok=True)
    for direction, angle in P.DIRECTIONS.items():
        pivot.rotation_euler[2] = math.radians(angle)
        bpy.context.scene.render.filepath = str(out / f"{direction}.png")
        bpy.ops.render.render(write_still=True)
    print("KNIGHT_DONE")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    render_preview() if "preview" in argv else render_catalog()
    print("KNIGHT_TEMPLATE_BUILD_DONE")
