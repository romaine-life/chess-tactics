import bpy, os, math, mathutils, numpy as np
import xml.etree.ElementTree as ET
DAE = os.path.join(os.environ["TEMP"], "helmet_extract", "source", "model", "model", "model.dae")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"

# --- tunables ---
WIDTH_FACTOR = 3.0    # helmet width / ball radius
Z_OFFSET     = 0.04   # helmet center z relative to ball center (up = dome clears)

scene = bpy.context.scene
pawn = next(o for o in scene.objects if o.name == "pawn")

# ball head: top region, max horizontal radius
n=len(pawn.data.vertices); a=np.empty(n*3); pawn.data.vertices.foreach_get("co",a); pc=a.reshape(-1,3)
top = pc[pc[:,2] > 1.42]
rr = np.sqrt(top[:,0]**2 + top[:,1]**2)
ball_r = rr.max(); ball_cz = top[rr > np.percentile(rr,90), 2].mean()
print("ball: radius=%.3f center_z=%.3f" % (ball_r, ball_cz))

# parse helmet
root = ET.parse(DAE).getroot()
def tg(e): return e.tag.split('}')[-1]
def kids(e,name): return [c for c in e if tg(c)==name]
def deep(name): return [c for c in root.iter() if tg(c)==name]
verts, faces = [], []
for geom in deep("geometry"):
    ms=kids(geom,"mesh")
    if not ms: continue
    mesh=ms[0]; sources={}
    for src in kids(mesh,"source"):
        fa=kids(src,"float_array")
        if fa and fa[0].text: sources["#"+src.get("id")]=[float(x) for x in fa[0].text.split()]
    posmap={}
    for v in kids(mesh,"vertices"):
        for inp in kids(v,"input"):
            if inp.get("semantic")=="POSITION": posmap["#"+v.get("id")]=inp.get("source")
    for prim in kids(mesh,"triangles")+kids(mesh,"polylist"):
        inputs=kids(prim,"input"); stride=0; voff=0; vsrc=None
        for inp in inputs:
            off=int(inp.get("offset",0)); stride=max(stride,off+1)
            if inp.get("semantic")=="VERTEX": voff=off; vsrc=inp.get("source")
        pos=sources.get(posmap.get(vsrc,vsrc))
        if pos is None: continue
        base=len(verts)
        for i in range(len(pos)//3): verts.append((pos[3*i],pos[3*i+1],pos[3*i+2]))
        for p in kids(prim,"p"):
            idx=[int(x) for x in p.text.split()]
            if tg(prim)=="polylist":
                vcounts=[int(x) for x in kids(prim,"vcount")[0].text.split()]; cur=0
                for vc in vcounts:
                    f=[base+idx[(cur+j)*stride+voff] for j in range(vc)]; cur+=vc
                    for t in range(1,len(f)-1): faces.append((f[0],f[t],f[t+1]))
            else:
                for t in range(len(idx)//(stride*3)):
                    faces.append(tuple(base+idx[(3*t+j)*stride+voff] for j in range(3)))
me=bpy.data.meshes.new("helmet"); me.from_pydata(verts,[],faces); me.update()
h=bpy.data.objects.new("helmet",me); scene.collection.objects.link(h)
bpy.context.view_layer.objects.active=h; h.select_set(True)
# orient: +90 about X (dome up, face -Y), then center + scale to ball, position on ball
h.rotation_euler=(math.radians(90),0,0); bpy.ops.object.transform_apply(rotation=True)
def hco():
    a=np.empty(len(me.vertices)*3); me.vertices.foreach_get("co",a); return a.reshape(-1,3)
c=hco(); mn=c.min(0); mx=c.max(0); ctr=(mn+mx)/2
hw=max(mx[0]-mn[0], mx[1]-mn[1])
s=(WIDTH_FACTOR*ball_r)/hw
h.location=(-ctr[0]*s, -ctr[1]*s, 0); h.scale=(s,s,s)
bpy.ops.object.transform_apply(location=True, scale=True)
c=hco(); hc=(c.min(0)+c.max(0))/2
h.location=(-hc[0], -hc[1], ball_cz + Z_OFFSET - hc[2])
bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
mat=bpy.data.materials.new("navy stone"); mat.use_nodes=True
b=mat.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value=(0.035,0.075,0.140,1); b.inputs["Roughness"].default_value=0.82
me.materials.append(mat)
scene.render.filepath=os.path.join(OUT,"pawn_helmet_south")
bpy.ops.render.render(write_still=True)
# front view (numpad 1) to verify the visor faces game-south
bpy.ops.object.camera_add(location=(0,-5,1.0)); fc=bpy.context.object
fc.rotation_euler=(mathutils.Vector((0,0,1.0))-fc.location).to_track_quat("-Z","Y").to_euler()
fc.data.type="ORTHO"; fc.data.ortho_scale=2.7; scene.camera=fc
scene.render.filepath=os.path.join(OUT,"pawn_helmet_front")
bpy.ops.render.render(write_still=True)
print("rendered south + front")
