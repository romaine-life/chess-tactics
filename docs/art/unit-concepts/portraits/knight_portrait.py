"""Render the 8-direction fur knight (accepted look) from the carved Staunton OBJ.

Run with:  blender --background --python render_knight_fur.py

Produces frontend/public/assets/units/knight/blender-render-fur/<direction>.png at the
true-isometric contract angle (45 yaw / 35.264 elevation / orthographic, fixed camera,
piece rotated per direction). The wood-grain diffuse is dropped and replaced with a
procedural navy "hint of fur" coat (smooth muzzle, fur only on the coat — not the
pedestal base or the sculpted mane). See docs/blender-projection-contract.md.

Orientation gotchas this script handles (each cost an iteration to find):
  - obj_import bakes an axis-conversion rotation -> transform_apply immediately.
  - stand: longest bbox axis -> Z; flip 180 if the wider (base) end is on top.
  - facing: the farthest head protrusion is the CREST (back), not the muzzle -> point
    it to +Y so the muzzle faces -Y (game-south, numpad-1). Verify with a render.
  - bake the centering translation so the turntable pivots on the vertical axis.
"""
import bpy, sys, math, mathutils, os, numpy as np
from pathlib import Path

# args after '--': PALETTE OUTDIR
_a = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else ["navy-blue", ""]
PALETTE = _a[0]; OUTFILE = _a[1]; HERO_YAW = float(_a[2]) if len(_a) > 2 else 30.0
# (dark, mid, flat) fur tones + body metallic per palette. Navy is the original look;
# the others remap navy's dark->light gradient to the team hue.
PALETTES = {
    "navy-blue": ((0.018, 0.040, 0.090), (0.110, 0.200, 0.320), (0.055, 0.105, 0.205), 0.0),
    "crimson":   ((0.075, 0.012, 0.014), (0.340, 0.050, 0.050), (0.200, 0.030, 0.032), 0.0),
    "emerald":   ((0.012, 0.055, 0.028), (0.070, 0.300, 0.160), (0.035, 0.170, 0.095), 0.0),
    "golden":    ((0.100, 0.065, 0.012), (0.450, 0.320, 0.070), (0.280, 0.190, 0.040), 0.4),
}
P_DARK, P_MID, P_FLAT, P_METAL = PALETTES[PALETTE]

ROOT = Path(__file__).resolve().parents[4]  # repo root (docs/art/unit-concepts/portraits/..)
OBJ = str(ROOT / "docs/art/unit-concepts/source-assets/knight/wooden-chess-knight-side-b/12936_Wooden_Chess_Knight_Side_B_V2_l3.obj")
os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(c):
        if b.users == 0: c.remove(b)
bpy.ops.wm.obj_import(filepath=OBJ)
ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
kn = bpy.context.view_layer.objects.active; kn.name = "knight"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def coords():
    n = len(kn.data.vertices); a = np.empty(n * 3); kn.data.vertices.foreach_get("co", a); return a.reshape(-1, 3)

co = coords(); up = int(np.argmax(co.max(0) - co.min(0)))
if up == 0: kn.rotation_euler = (0, math.radians(-90), 0)
elif up == 1: kn.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(rotation=True)
co = coords(); zr = co[:, 2].max() - co[:, 2].min()
top = co[co[:, 2] > co[:, 2].max() - 0.2 * zr]; bot = co[co[:, 2] < co[:, 2].min() + 0.2 * zr]
spread = lambda p: np.sqrt(((p[:, :2] - p[:, :2].mean(0)) ** 2).sum(1)).mean()
if spread(top) > spread(bot):
    kn.rotation_euler = (math.radians(180), 0, 0); bpy.ops.object.transform_apply(rotation=True)
co = coords(); zmin, zmax = co[:, 2].min(), co[:, 2].max(); cen = co[:, :2].mean(0)
head = co[co[:, 2] > zmin + 0.58 * (zmax - zmin)]; hr = np.linalg.norm(head[:, :2] - cen, axis=1)
muz = head[hr > np.percentile(hr, 88)]; mdir = (muz[:, :2] - cen).mean(0)
ang = math.atan2(mdir[1], mdir[0])
kn.rotation_euler = (0, 0, (math.pi / 2) - ang); bpy.ops.object.transform_apply(rotation=True)
co = coords(); mn = co.min(0); mx = co.max(0); s = 2.0 / (mx[2] - mn[2])
kn.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
co = coords(); mn = co.min(0); mx = co.max(0)
kn.location = (-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])
bpy.ops.object.transform_apply(location=True)

m = bpy.data.materials.new("knight fur"); m.use_nodes = True
kn.data.materials.clear(); kn.data.materials.append(m)
nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = P_METAL
tc = nt.nodes.new("ShaderNodeTexCoord")
mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (4.0, 4.0, 26.0)
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 7.0; noise.inputs["Detail"].default_value = 8.0
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (*P_DARK, 1)
ramp.color_ramp.elements[1].position = 0.72; ramp.color_ramp.elements[1].color = (*P_MID, 1)
L(tc.outputs["Object"], mp.inputs["Vector"]); L(mp.outputs["Vector"], noise.inputs["Vector"]); L(noise.outputs["Fac"], ramp.inputs["Fac"])
sep = nt.nodes.new("ShaderNodeSeparateXYZ"); L(tc.outputs["Generated"], sep.inputs["Vector"])
def mr(inp, lo, hi):
    n = nt.nodes.new("ShaderNodeMapRange"); n.inputs["From Min"].default_value = lo; n.inputs["From Max"].default_value = hi
    n.clamp = True; L(inp, n.inputs["Value"]); return n.outputs["Result"]
def m2(op, a, b):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = op; L(a, n.inputs[0]); L(b, n.inputs[1]); return n.outputs["Value"]
def sub1(a):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = "SUBTRACT"; n.inputs[0].default_value = 1.0; L(a, n.inputs[1]); return n.outputs["Value"]
Y = sep.outputs["Y"]; Z = sep.outputs["Z"]
baseOff = mr(Z, 0.36, 0.44)
mane = m2("MULTIPLY", mr(Y, 0.55, 0.66), m2("MULTIPLY", mr(Z, 0.48, 0.56), mr(Z, 0.95, 0.86)))
muzzle = m2("MULTIPLY", mr(Y, 0.44, 0.32), mr(Z, 0.58, 0.66))
ears = mr(Z, 0.88, 0.93)
fur = m2("MAXIMUM", m2("MULTIPLY", baseOff, m2("MULTIPLY", sub1(mane), sub1(muzzle))), ears)
flat = nt.nodes.new("ShaderNodeRGB"); flat.outputs[0].default_value = (*P_FLAT, 1)
cmix = nt.nodes.new("ShaderNodeMixRGB"); L(ramp.outputs["Color"], cmix.inputs["Color1"]); L(flat.outputs[0], cmix.inputs["Color2"])
L(sub1(fur), cmix.inputs["Fac"]); L(cmix.outputs["Color"], bsdf.inputs["Base Color"])
bs = nt.nodes.new("ShaderNodeMath"); bs.operation = "MULTIPLY"; bs.inputs[1].default_value = 0.18; L(fur, bs.inputs[0])
bump = nt.nodes.new("ShaderNodeBump"); L(bs.outputs["Value"], bump.inputs["Strength"]); L(noise.outputs["Fac"], bump.inputs["Height"]); L(bump.outputs["Normal"], bsdf.inputs["Normal"])
L(bsdf.outputs["BSDF"], out.inputs["Surface"])

w = bpy.data.worlds.new("W"); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value = (0.02, 0.03, 0.05, 1); bg.inputs["Strength"].default_value = 0.35
bpy.ops.object.light_add(type="SUN", location=(-3, -4, 8)); k = bpy.context.object
k.rotation_euler = (math.radians(50), 0, math.radians(-38)); k.data.energy = 3.0; k.data.color = (0.85, 0.92, 1.0)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 3)); bpy.context.object.data.energy = 130; bpy.context.object.data.size = 6; bpy.context.object.data.color = (0.7, 0.78, 1.0)
bpy.ops.object.light_add(type="AREA", location=(-2, 4, 4.5)); bpy.context.object.data.energy = 80; bpy.context.object.data.size = 4; bpy.context.object.data.color = (0.55, 0.7, 1.0)

import numpy as np
pts=[(kn.matrix_world @ v.co) for v in kn.data.vertices]
P=np.array([[p.x,p.y,p.z] for p in pts]); topZ=float(P[:,2].max())
_TZ=float(os.environ.get("PORTRAIT_TZ","0.62")); _SP=float(os.environ.get("PORTRAIT_SPAN","0.96"))
Tz=_TZ*topZ; span=_SP*topZ; LENS=55.0; SENSOR=36.0  # bust: upper body fills frame, base off-bottom
vfov=2*math.atan((SENSOR/2)/LENS); D=(span/2)/math.tan(vfov/2)
E=math.radians(10.0); A=math.radians(HERO_YAW)
bpy.ops.object.camera_add(); cam=bpy.context.object; bpy.context.scene.camera=cam
cam.location=(D*math.cos(E)*math.sin(A), -D*math.cos(E)*math.cos(A), Tz+D*math.sin(E))
T=mathutils.Vector((0,0,Tz)); cam.rotation_euler=(T-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="PERSP"; cam.data.lens=LENS; cam.data.sensor_width=SENSOR
s2=bpy.context.scene
s2.render.engine="CYCLES"; s2.cycles.samples=64; s2.cycles.use_denoising=True
s2.view_settings.view_transform="Standard"
s2.render.resolution_x=s2.render.resolution_y=512; s2.render.film_transparent=True
s2.render.image_settings.file_format="PNG"; s2.render.filepath=OUTFILE
bpy.ops.render.render(write_still=True)
print("KNIGHT_PORTRAIT_DONE topZ=%.2f ->" % topZ, OUTFILE)
