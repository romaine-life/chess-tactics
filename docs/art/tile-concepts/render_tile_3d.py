import bpy, math, mathutils, sys, os, glob
import numpy as np
# args: MODE OUTFILE BASECOLOR [PACKDIR] [SEED] [SIDEBASE]
# BASE textures the top face (the terrain's identity); SIDE textures the block body /
# vertical cliff (the geologic substrate beneath). They differ when the surface layer
# (grass, pebbles, water) is not what the earth is made of — grass/pebble sit on soil,
# water sits in a rock basin. For dirt/stone/sand the body IS the identity, so SIDE
# defaults to BASE.
a = sys.argv[sys.argv.index("--") + 1:]
MODE, OUT, BASE = a[0], a[1], a[2]
PACK = a[3] if len(a) > 3 and a[3] != "-" else None
SEED = int(a[4]) if len(a) > 4 else 0
SIDE = a[5] if len(a) > 5 and a[5] != "-" else BASE

for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.images, bpy.data.textures):
    for b in list(c):
        if getattr(b, 'users', 0) == 0:
            c.remove(b)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

def findmap(*keywords):
    # Search BASE's own dir first, then the whole pack, for an image whose name contains
    # one of the keywords; prefer the candidate sharing the longest prefix with BASE's name
    # (so ground_close_04_basecolor -> ground_close_04_normal, not rostlinka_07_normal).
    bname = os.path.splitext(os.path.basename(BASE))[0].lower()
    dirs = [os.path.dirname(BASE)] + ([PACK] if PACK else [])
    cands = []
    for d in dirs:
        for f in glob.glob(os.path.join(d, "**", "*"), recursive=True):
            fn = os.path.basename(f).lower()
            if not fn.endswith((".png", ".jpg", ".jpeg")):
                continue
            if os.path.abspath(f) == os.path.abspath(BASE):
                continue
            if any(k.lower() in fn for k in keywords):
                cands.append(f)
    if not cands:
        return None
    def prefix_score(c):
        fn = os.path.splitext(os.path.basename(c))[0].lower()
        k = 0
        for x, y in zip(bname, fn):
            if x == y:
                k += 1
            else:
                break
        return k
    cands.sort(key=prefix_score, reverse=True)
    return cands[0]

def loadimg(p, noncolor=False):
    i = bpy.data.images.load(p)
    if noncolor:
        i.colorspace_settings.name = 'Non-Color'
    return i

def pbr_top(base, normal=None, rough=None, ao=None, metallic=0.0, roughval=0.9):
    m = bpy.data.materials.new("top"); m.use_nodes = True; nt = m.node_tree; b = nt.nodes.get("Principled BSDF")
    b.inputs["Metallic"].default_value = metallic
    bc = nt.nodes.new("ShaderNodeTexImage"); bc.image = loadimg(base)
    if ao:
        aoi = nt.nodes.new("ShaderNodeTexImage"); aoi.image = loadimg(ao, True)
        mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 0.8
        nt.links.new(bc.outputs["Color"], mix.inputs[1]); nt.links.new(aoi.outputs["Color"], mix.inputs[2]); nt.links.new(mix.outputs["Color"], b.inputs["Base Color"])
    else:
        nt.links.new(bc.outputs["Color"], b.inputs["Base Color"])
    if rough:
        ri = nt.nodes.new("ShaderNodeTexImage"); ri.image = loadimg(rough, True); nt.links.new(ri.outputs["Color"], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = roughval
    if normal:
        ni = nt.nodes.new("ShaderNodeTexImage"); ni.image = loadimg(normal, True)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(ni.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m

def side_mat(base):
    m = bpy.data.materials.new("side"); m.use_nodes = True; nt = m.node_tree; b = nt.nodes.get("Principled BSDF"); b.inputs["Roughness"].default_value = 0.92
    bc = nt.nodes.new("ShaderNodeTexImage"); bc.image = loadimg(base)
    mx = nt.nodes.new("ShaderNodeMixRGB"); mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1; mx.inputs[2].default_value = (0.3, 0.32, 0.4, 1)
    nt.links.new(bc.outputs["Color"], mx.inputs[1]); nt.links.new(mx.outputs["Color"], b.inputs["Base Color"])
    return m

# base block, top surface at z=0
bpy.ops.mesh.primitive_cube_add(size=1.0); blk = bpy.context.object; blk.scale = (0.5, 0.5, 0.79); bpy.ops.object.transform_apply(scale=True)
for v in blk.data.vertices:
    v.co.z -= max(vv.co.z for vv in blk.data.vertices)
bpy.ops.object.shade_smooth()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')

def add_top_relief(strength, image_disp=None):
    sub = blk.modifiers.new("sub", 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = 6; sub.render_levels = 6
    vg = blk.vertex_groups.new(name="top"); vg.add([v.index for v in blk.data.vertices if v.co.z > -0.02], 1.0, 'REPLACE')
    if image_disp:
        tex = bpy.data.textures.new("d", "IMAGE"); tex.image = loadimg(image_disp, True)
        d = blk.modifiers.new("disp", "DISPLACE"); d.texture = tex; d.texture_coords = 'UV'; d.strength = strength; d.mid_level = 0.5; d.vertex_group = "top"
    else:
        tex = bpy.data.textures.new("n", "CLOUDS"); tex.noise_scale = 0.08
        d = blk.modifiers.new("disp", "DISPLACE"); d.texture = tex; d.strength = strength; d.vertex_group = "top"

if MODE in ("ground", "water"):
    nrm = findmap("normal", "nrm"); rgh = findmap("roughness", "rough", "rgh"); ao = findmap("ambientocclusion", "occlusion", "oclusion", "_ao", "mixed_ao")
    disp = findmap("displacement", "height", "disp")
    if MODE == "water":
        # reflective ripple water: glossy, low roughness, normal ripples, slight blue tint
        m = pbr_top(BASE, nrm, None, None, metallic=0.0, roughval=0.12)
        b = m.node_tree.nodes.get("Principled BSDF"); b.inputs["IOR"].default_value = 1.33
        blk.data.materials.append(m); blk.data.materials.append(side_mat(SIDE))
        add_top_relief(0.02)
    else:
        add_top_relief(0.22 if disp else 0.05, disp)
        blk.data.materials.append(pbr_top(BASE, nrm, rgh, ao)); blk.data.materials.append(side_mat(SIDE))
    for p in blk.data.polygons:
        p.material_index = 0 if p.normal.z > 0.5 else 1

elif MODE == "pebble":
    blk.data.materials.append(side_mat(SIDE))
    for p in blk.data.polygons:
        p.material_index = 0
    g = glob.glob(os.path.join(PACK, "**", "*.glb"), recursive=True)[0]
    bpy.ops.import_scene.gltf(filepath=g)
    ps = [o for o in bpy.context.scene.objects if o.type == "MESH" and o != blk]
    for o in ps:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1:
        bpy.ops.object.join()
    pob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    c = np.array([v.co for v in pob.data.vertices]); dims = c.max(0) - c.min(0)
    s = 0.95 / max(dims[0], dims[1]); pob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
    c = np.array([v.co for v in pob.data.vertices]); pob.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min()); bpy.ops.object.transform_apply(location=True)
    bpy.ops.object.shade_smooth()

elif MODE == "grass":
    # grassy ground (BASE) + standing 3D blades scattered on top (seeded variation)
    nrm = findmap("normal", "nrm")
    blk.data.materials.append(pbr_top(BASE, nrm)); blk.data.materials.append(side_mat(SIDE))
    for p in blk.data.polygons:
        p.material_index = 0 if p.normal.z > 0.5 else 1
    EX = os.path.join(os.environ["TEMP"], "tiles_ex")
    OBJ = glob.glob(os.path.join(EX, "grass-02", "inner", "*.obj"))[0]; GTEX = glob.glob(os.path.join(EX, "grass-02", "inner", "2023*.png"))[0]
    bpy.ops.wm.obj_import(filepath=OBJ)
    gs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o != blk]
    for o in gs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = gs[0]
    if len(gs) > 1:
        bpy.ops.object.join()
    g = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    g.rotation_euler = (math.radians(90), 0, 0); bpy.ops.object.transform_apply(rotation=True)
    c = np.array([v.co for v in g.data.vertices]); s = 0.12 / (c[:, 2].max() - c[:, 2].min()); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
    c = np.array([v.co for v in g.data.vertices]); g.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min()); bpy.ops.object.transform_apply(location=True)
    gm = bpy.data.materials.new("grass"); gm.use_nodes = True; nt = gm.node_tree; b = nt.nodes.get("Principled BSDF"); b.inputs["Roughness"].default_value = 0.9
    tg = nt.nodes.new("ShaderNodeTexImage"); tg.image = loadimg(GTEX); nt.links.new(tg.outputs["Color"], b.inputs["Base Color"])
    agt = nt.nodes.new("ShaderNodeMath"); agt.operation = "GREATER_THAN"; agt.inputs[1].default_value = 0.35
    nt.links.new(tg.outputs["Alpha"], agt.inputs[0]); nt.links.new(agt.outputs["Value"], b.inputs["Alpha"])
    g.data.materials.clear(); g.data.materials.append(gm)
    # seeded scatter — deterministic per variant (no Math.random; index-based).
    # Short blades (0.12 world) tufted densely across the top read as a mown lawn,
    # not standing bushes; keep height variance tight so nothing spikes up.
    n = 22
    for i in range(n):
        h = (i * 2654435761 + SEED * 40503) & 0xffffffff
        x = ((h % 1000) / 1000.0 - 0.5) * 0.46
        y = (((h >> 10) % 1000) / 1000.0 - 0.5) * 0.46
        rot = ((h >> 5) % 360) * math.pi / 180.0
        scv = 0.8 + 0.4 * (((h >> 16) % 100) / 100.0)
        d = g if i == 0 else g.copy()
        if i > 0:
            d.data = g.data.copy(); bpy.context.collection.objects.link(d)
        d.location = (x, y, 0); d.rotation_euler = (0, 0, rot); d.scale = (scv, scv, scv)

# scene + calibrated iso cam (96x180)
sc = bpy.context.scene; w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.03, 0.04, 0.06, 1); w.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
bpy.ops.object.light_add(type="SUN"); k = bpy.context.object; k.rotation_euler = (math.radians(48), math.radians(8), math.radians(-42)); k.data.energy = 3.8; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 3)); bpy.context.object.data.energy = 80; bpy.context.object.data.size = 7; bpy.context.object.data.color = (.7, .78, 1)
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2); TZ = -0.18
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + TZ); cam.rotation_euler = (mathutils.Vector((0, 0, TZ)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.31
sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"; sc.render.resolution_x = 96; sc.render.resolution_y = 180; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("TILE3D_DONE", MODE, os.path.basename(OUT))
