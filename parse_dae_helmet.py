import bpy, os, math, mathutils, numpy as np
import xml.etree.ElementTree as ET
DAE = os.path.join(os.environ["TEMP"], "helmet_extract", "source", "model", "model", "model.dae")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"

root = ET.parse(DAE).getroot()
def tg(e): return e.tag.split('}')[-1]
def kids(e, name): return [c for c in e if tg(c) == name]
def deep(name): return [c for c in root.iter() if tg(c) == name]

verts, faces = [], []
for geom in deep("geometry"):
    ms = kids(geom, "mesh")
    if not ms: continue
    mesh = ms[0]
    sources = {}
    for src in kids(mesh, "source"):
        fa = kids(src, "float_array")
        if fa and fa[0].text:
            sources["#" + src.get("id")] = [float(x) for x in fa[0].text.split()]
    posmap = {}
    for v in kids(mesh, "vertices"):
        for inp in kids(v, "input"):
            if inp.get("semantic") == "POSITION":
                posmap["#" + v.get("id")] = inp.get("source")
    for prim in kids(mesh, "triangles") + kids(mesh, "polylist"):
        inputs = kids(prim, "input")
        stride = 0; voff = 0; vsrc = None
        for inp in inputs:
            off = int(inp.get("offset", 0)); stride = max(stride, off + 1)
            if inp.get("semantic") == "VERTEX":
                voff = off; vsrc = inp.get("source")
        possrc = posmap.get(vsrc, vsrc)
        pos = sources.get(possrc)
        if pos is None: continue
        base = len(verts)
        for i in range(len(pos) // 3):
            verts.append((pos[3*i], pos[3*i+1], pos[3*i+2]))
        pe = kids(prim, "p")
        if tg(prim) == "polylist":
            vcounts = [int(x) for x in kids(prim, "vcount")[0].text.split()]
            idx = [int(x) for x in pe[0].text.split()]; cur = 0
            for vc in vcounts:
                f = [base + idx[(cur+j)*stride + voff] for j in range(vc)]; cur += vc
                for t in range(1, len(f)-1): faces.append((f[0], f[t], f[t+1]))
        else:
            for p in pe:
                idx = [int(x) for x in p.text.split()]
                for t in range(len(idx) // (stride*3)):
                    faces.append(tuple(base + idx[(3*t+j)*stride + voff] for j in range(3)))
print("parsed helmet: %d verts, %d faces" % (len(verts), len(faces)))

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
me = bpy.data.meshes.new("helmet"); me.from_pydata(verts, [], faces); me.update()
h = bpy.data.objects.new("helmet", me); bpy.context.collection.objects.link(h)
bpy.context.view_layer.objects.active = h; h.select_set(True)
n=len(me.vertices); a=np.empty(n*3); me.vertices.foreach_get("co",a); co=a.reshape(-1,3)
dims=co.max(0)-co.min(0); ctr=(co.max(0)+co.min(0))/2
print("helmet dims x=%.3f y=%.3f z=%.3f" % tuple(dims))
h.location=(-ctr[0],-ctr[1],-ctr[2]); sc=2.0/max(dims); h.scale=(sc,sc,sc)
bpy.ops.object.transform_apply(location=True, scale=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("flat"); m.use_nodes=True
m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(0.3,0.45,0.7,1)
me.materials.append(m)
bpy.ops.object.light_add(type="SUN",location=(2,-3,4)); bpy.context.object.data.energy=4
s=bpy.context.scene; s.render.engine="BLENDER_EEVEE"; s.render.film_transparent=True
s.render.resolution_x=s.render.resolution_y=320
def cam(loc,rot,name):
    bpy.ops.object.camera_add(location=loc,rotation=rot); c=bpy.context.object
    c.data.type="ORTHO"; c.data.ortho_scale=2.6; s.camera=c
    s.render.filepath=os.path.join(OUT,name); bpy.ops.render.render(write_still=True)
cam((0,-4,0),(math.radians(90),0,0),"helmet_FRONT")
cam((0,0,5),(0,0,0),"helmet_TOP")
cam((4,0,0),(math.radians(90),0,math.radians(90)),"helmet_SIDE")
print("done helmet inspect")
