"""Render the 8-direction helmeted pawn (accepted look).

Run with:  blender --background --python render_pawn_helmet.py

A classic Staunton pawn wearing a medieval archer's helmet (COLLADA parsed by
hand since Blender 5.x has no
COLLADA importer). Both navy-styled, rendered at the true-isometric contract
angle (45 yaw / 35.264 elevation / ortho). The pawn body is symmetric; the helmet
visor gives each direction a real facing (visor -> game-south at yaw 0).
The canonical pipeline fetches both private source records into a temporary
directory and supplies their paths, UNIT_ART_OUTPUT_DIR, and frame dimensions so Blender's
first raster is already the delivery frame. This renderer never resizes a frame.
"""
import bpy, os, math, mathutils, numpy as np
import xml.etree.ElementTree as ET
from bpy_extras.object_utils import world_to_camera_view

STL = os.environ.get("UNIT_ART_PAWN_STL"); DAE = os.environ.get("UNIT_ART_PAWN_DAE")
OUT = os.environ.get("UNIT_ART_OUTPUT_DIR")
if not STL or not DAE or not OUT:
    raise RuntimeError("run through generate-unit-art.py; private pawn sources and output are required")
FRAME_WIDTH = int(os.environ["UNIT_ART_FRAME_WIDTH"])
FRAME_HEIGHT = int(os.environ["UNIT_ART_FRAME_HEIGHT"])
if not (1 <= FRAME_WIDTH <= 4096 and 1 <= FRAME_HEIGHT <= 4096):
    raise RuntimeError("UNIT_ART_FRAME_WIDTH/HEIGHT must be between 1 and 4096")
os.makedirs(OUT, exist_ok=True)
WIDTH_FACTOR = 3.0; Z_OFFSET = 0.04

def clear():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for b in list(c):
            if b.users == 0: c.remove(b)

def navy(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.035, 0.075, 0.140, 1); b.inputs["Roughness"].default_value = 0.82
    return m

clear()
# --- pawn: import + orient + normalize (base z=0, centered, height 2) ---
try: bpy.ops.wm.stl_import(filepath=STL)
except Exception: bpy.ops.import_mesh.stl(filepath=STL)
pawn = next(o for o in bpy.context.scene.objects if o.type == "MESH"); pawn.name = "pawn"
bpy.context.view_layer.objects.active = pawn; pawn.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def pco():
    a = np.empty(len(pawn.data.vertices)*3); pawn.data.vertices.foreach_get("co", a); return a.reshape(-1, 3)
co = pco(); up = int(np.argmax(co.max(0)-co.min(0)))
if up == 0: pawn.rotation_euler = (0, math.radians(-90), 0)
elif up == 1: pawn.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(rotation=True)
co = pco(); zr = co[:,2].max()-co[:,2].min()
spread = lambda p: np.sqrt(((p[:,:2]-p[:,:2].mean(0))**2).sum(1)).mean()
if spread(co[co[:,2] > co[:,2].max()-0.2*zr]) > spread(co[co[:,2] < co[:,2].min()+0.2*zr]):
    pawn.rotation_euler = (math.radians(180), 0, 0); bpy.ops.object.transform_apply(rotation=True)
co = pco(); mn = co.min(0); mx = co.max(0); s = 2.0/(mx[2]-mn[2])
pawn.scale = (s,s,s); bpy.ops.object.transform_apply(scale=True)
co = pco(); mn = co.min(0); mx = co.max(0)
pawn.location = (-(mn[0]+mx[0])/2, -(mn[1]+mx[1])/2, -mn[2]); bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
pawn.data.materials.append(navy("navy stone"))

# ball head (top region max radius) for helmet placement
co = pco(); top = co[co[:,2] > 1.42]; rr = np.sqrt(top[:,0]**2 + top[:,1]**2)
ball_r = rr.max(); ball_cz = top[rr > np.percentile(rr, 90), 2].mean()

# --- helmet: hand-parse COLLADA (positions + triangles), build, orient, fit ---
root = ET.parse(DAE).getroot()
tg = lambda e: e.tag.split('}')[-1]
kids = lambda e, name: [c for c in e if tg(c) == name]
deep = lambda name: [c for c in root.iter() if tg(c) == name]
verts, faces = [], []
for geom in deep("geometry"):
    ms = kids(geom, "mesh")
    if not ms: continue
    mesh = ms[0]; sources = {}
    for src in kids(mesh, "source"):
        fa = kids(src, "float_array")
        if fa and fa[0].text: sources["#"+src.get("id")] = [float(x) for x in fa[0].text.split()]
    posmap = {}
    for v in kids(mesh, "vertices"):
        for inp in kids(v, "input"):
            if inp.get("semantic") == "POSITION": posmap["#"+v.get("id")] = inp.get("source")
    for prim in kids(mesh, "triangles") + kids(mesh, "polylist"):
        stride = 0; voff = 0; vsrc = None
        for inp in kids(prim, "input"):
            off = int(inp.get("offset", 0)); stride = max(stride, off+1)
            if inp.get("semantic") == "VERTEX": voff = off; vsrc = inp.get("source")
        pos = sources.get(posmap.get(vsrc, vsrc))
        if pos is None: continue
        base = len(verts)
        for i in range(len(pos)//3): verts.append((pos[3*i], pos[3*i+1], pos[3*i+2]))
        for p in kids(prim, "p"):
            idx = [int(x) for x in p.text.split()]
            if tg(prim) == "polylist":
                vcounts = [int(x) for x in kids(prim, "vcount")[0].text.split()]; cur = 0
                for vc in vcounts:
                    f = [base+idx[(cur+j)*stride+voff] for j in range(vc)]; cur += vc
                    for t in range(1, len(f)-1): faces.append((f[0], f[t], f[t+1]))
            else:
                for t in range(len(idx)//(stride*3)):
                    faces.append(tuple(base+idx[(3*t+j)*stride+voff] for j in range(3)))
hme = bpy.data.meshes.new("helmet"); hme.from_pydata(verts, [], faces); hme.update()
h = bpy.data.objects.new("helmet", hme); bpy.context.collection.objects.link(h)
bpy.context.view_layer.objects.active = h; h.select_set(True)
h.rotation_euler = (math.radians(90), 0, 0); bpy.ops.object.transform_apply(rotation=True)  # dome up, visor -Y
def hco():
    a = np.empty(len(hme.vertices)*3); hme.vertices.foreach_get("co", a); return a.reshape(-1, 3)
c = hco(); mn = c.min(0); mx = c.max(0); ctr = (mn+mx)/2; hw = max(mx[0]-mn[0], mx[1]-mn[1])
sc = (WIDTH_FACTOR*ball_r)/hw
h.location = (-ctr[0]*sc, -ctr[1]*sc, 0); h.scale = (sc, sc, sc); bpy.ops.object.transform_apply(location=True, scale=True)
c = hco(); hc = (c.min(0)+c.max(0))/2; h.location = (-hc[0], -hc[1], ball_cz+Z_OFFSET-hc[2]); bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth(); hme.materials.append(navy("navy stone"))

# --- lighting + contract camera ---
w = bpy.data.worlds.new("W"); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.02,0.03,0.05,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN", location=(-3,-4,8)); k=bpy.context.object
k.rotation_euler=(math.radians(50),0,math.radians(-38)); k.data.energy=3.0; k.data.color=(0.85,0.92,1.0)
bpy.ops.object.light_add(type="AREA", location=(3.5,-3,3)); bpy.context.object.data.energy=130; bpy.context.object.data.size=6; bpy.context.object.data.color=(0.7,0.78,1.0)
bpy.ops.object.light_add(type="AREA", location=(-2,4,4.5)); bpy.context.object.data.energy=80; bpy.context.object.data.size=4; bpy.context.object.data.color=(0.55,0.7,1.0)
s = bpy.context.scene
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; s.camera=cam
cam.location=(comp,-comp,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7
s.render.engine="CYCLES"; s.cycles.samples=48; s.cycles.use_denoising=True
s.view_settings.view_transform="Standard"
s.render.resolution_x=FRAME_WIDTH; s.render.resolution_y=FRAME_HEIGHT; s.render.resolution_percentage=100
s.render.film_transparent=True; s.render.image_settings.file_format="PNG"; s.render.image_settings.color_mode="RGBA"

# rig (parent both), 8-direction turntable
rig = bpy.data.objects.new("rig", None); s.collection.objects.link(rig)
for o in (pawn, h):
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
DIRECTIONS = {"south":0,"south-west":-45,"west":-90,"north-west":-135,"north":180,"north-east":135,"east":90,"south-east":45}
for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    s.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print("rendered", name)
rig.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
v = world_to_camera_view(s, cam, mathutils.Vector((0, 0, 0)))
print("ANCHOR  unitAnchorX=%.3f%%  unitAnchorY=%.3f%%" % (v.x*100, (1-v.y)*100))
print("PAWN_HELMET_DONE ->", OUT)
