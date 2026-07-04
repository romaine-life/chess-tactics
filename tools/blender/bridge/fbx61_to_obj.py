"""Convert a legacy FBX 6.1 ASCII (old Blender exporter — modern importers reject it) to OBJ+MTL.
Extracts per-Model Vertices, PolygonVertexIndex (negative = polygon end), UV+UVIndex, and the
Lcl Translation/Rotation/Scaling, applies TRS, and writes one combined OBJ that Blender imports.
  python fbx61_to_obj.py <in.fbx> <out.obj> <texture.png>
"""
import sys, re, math

FBX, OUT, TEX = sys.argv[1], sys.argv[2], sys.argv[3]
txt = open(FBX, "r", encoding="utf-8", errors="replace").read()

NUM = re.compile(r'-?\d+\.?\d*(?:[eE]-?\d+)?')
END = re.compile(r'\n\s*(?:[A-Za-z_][\w ]*:|[}{])')

def grab(chunk, keyword):
    i = chunk.find(keyword)
    if i < 0:
        return []
    j = i + len(keyword)
    m = END.search(chunk, j)
    seg = chunk[j:(m.start() if m else len(chunk))]
    return [float(x) for x in NUM.findall(seg)]

def prop3(chunk, name):
    m = re.search(r'Property: "%s".*?,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)' % re.escape(name), chunk)
    return (float(m.group(1)), float(m.group(2)), float(m.group(3))) if m else None

def rot_matrix(rx, ry, rz):
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = [[1,0,0],[0,cx,-sx],[0,sx,cx]]
    Ry = [[cy,0,sy],[0,1,0],[-sy,0,cy]]
    Rz = [[cz,-sz,0],[sz,cz,0],[0,0,1]]
    def mul(A,B): return [[sum(A[i][k]*B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(Rz, mul(Ry, Rx))

# split into per-model chunks
parts = txt.split('Model: "Model::')
verts_out, uvs_out = [], []
objects = []  # (name, [tris]) so each FBX Model becomes its own OBJ object
voff = 1
uoff = 1
nmesh = 0
for p in parts[1:]:
    if '"Mesh"' not in p[:40]:
        continue
    chunk = p
    name = re.sub(r'[^A-Za-z0-9_]', '_', p[:p.index('"')]) or f"m{nmesh}"
    faces = []  # this Model's faces
    V = grab(chunk, "Vertices:")
    PI = [int(x) for x in grab(chunk, "PolygonVertexIndex:")]
    # "UV:" collides with "LayerElementUV:" — anchor to a line that starts with UV: then read its array.
    mm = re.search(r'(?m)^\s*UV:', chunk)
    if mm:
        e = END.search(chunk, mm.end()); seg = chunk[mm.end():(e.start() if e else len(chunk))]
        UV = [float(x) for x in NUM.findall(seg)]
    else:
        UV = []
    UVI = [int(x) for x in grab(chunk, "UVIndex:")]
    if not V or not PI:
        continue
    nmesh += 1
    T = prop3(chunk, "Lcl Translation") or (0,0,0)
    R = prop3(chunk, "Lcl Rotation") or (0,0,0)
    S = prop3(chunk, "Lcl Scaling") or (1,1,1)
    M = rot_matrix(*R)
    nv = len(V)//3
    local = []
    for k in range(nv):
        x,y,z = V[3*k]*S[0], V[3*k+1]*S[1], V[3*k+2]*S[2]
        wx = M[0][0]*x+M[0][1]*y+M[0][2]*z + T[0]
        wy = M[1][0]*x+M[1][1]*y+M[1][2]*z + T[1]
        wz = M[2][0]*x+M[2][1]*y+M[2][2]*z + T[2]
        local.append((wx,wy,wz))
        verts_out.append((wx,wy,wz))
    nuv = len(UV)//2
    for k in range(nuv):
        uvs_out.append((UV[2*k], UV[2*k+1]))
    # walk polygons
    poly = []
    pvi = 0  # polygon-vertex counter for UVIndex
    cur = []
    cur_uv = []
    for idx in PI:
        end = idx < 0
        vi = (~idx) if end else idx
        uv_ref = UVI[pvi] if pvi < len(UVI) else -1
        cur.append(voff + vi)
        cur_uv.append((uoff + uv_ref) if uv_ref >= 0 else None)
        pvi += 1
        if end:
            # fan triangulate
            for t in range(1, len(cur)-1):
                tri = [(cur[0],cur_uv[0]),(cur[t],cur_uv[t]),(cur[t+1],cur_uv[t+1])]
                faces.append(tri)
            cur, cur_uv = [], []
    voff += nv
    uoff += nuv
    objects.append((name, faces))

with open(OUT, "w") as f:
    mtl = OUT.rsplit("/",1)[-1].rsplit(".",1)[0] + ".mtl"
    f.write(f"mtllib {mtl}\n")
    for v in verts_out:
        f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
    for uv in uvs_out:
        f.write(f"vt {uv[0]:.6f} {uv[1]:.6f}\n")
    for oname, fcs in objects:
        f.write(f"o {oname}\nusemtl deck\n")
        for tri in fcs:
            f.write("f " + " ".join(f"{a}/{b}" if b else f"{a}" for a,b in tri) + "\n")
with open(OUT.rsplit(".",1)[0] + ".mtl", "w") as f:
    f.write(f"newmtl deck\nKd 1 1 1\nmap_Kd {TEX}\n")
print(f"meshes={nmesh} verts={len(verts_out)} uvs={len(uvs_out)} tris={len(faces)} -> {OUT}")
