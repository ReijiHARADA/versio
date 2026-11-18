# Versio app icon: back side of a clinched staple, 45° diagonal, on a paper squircle.
# Run: Blender -b -P design/icon/staple_icon.py -- <out.png> [res] [samples]
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/staple_icon.png"
RES = int(argv[1]) if len(argv) > 1 else 1024
SAMPLES = int(argv[2]) if len(argv) > 2 else 256

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# --- materials -------------------------------------------------------------
def mat_paper():
    # plain matte plate
    m = bpy.data.materials.new("plate"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1)  # matte white
    b.inputs["Roughness"].default_value = 0.8
    return m

def mat_steel():
    m = bpy.data.materials.new("steel"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.60, 0.625, 0.655, 1)  # electro-galvanized (zinc-plated) steel: dull silver, faint blue
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Anisotropic"].default_value = 0.45
    # fine drawn-wire streaks along the wire (local X of each leg)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.4, 60, 60)
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; nz.inputs["Detail"].default_value = 6
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs["To Min"].default_value = 0.36; rr.inputs["To Max"].default_value = 0.50
    nt.links.new(nz.outputs["Fac"], rr.inputs["Value"]); nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    tg = nt.nodes.new("ShaderNodeTangent"); tg.direction_type = "RADIAL"; tg.axis = "Z"
    tg2 = nt.nodes.new("ShaderNodeTangent"); tg2.direction_type = "UV_MAP"
    nt.links.new(tg2.outputs["Tangent"], b.inputs["Tangent"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.15; bump.inputs["Distance"].default_value = 0.005
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

PAPER, STEEL = mat_paper(), mat_steel()

# --- paper squircle (macOS icon body: 824/1024 of canvas) ------------------
A, N, THICK = 4.12, 5.0, 0.25
bm = bmesh.new()
pts = []
for i in range(256):
    t = 2 * math.pi * i / 256
    c, s = math.cos(t), math.sin(t)
    pts.append((A * math.copysign(abs(c) ** (2 / N), c), A * math.copysign(abs(s) ** (2 / N), s)))
top = [bm.verts.new((x, y, 0)) for x, y in pts]
f = bm.faces.new(top)
ext = bmesh.ops.extrude_face_region(bm, geom=[f])
for v in ext["geom"]:
    if isinstance(v, bmesh.types.BMVert): v.co.z -= THICK
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("paper"); bm.to_mesh(me); bm.free()
paper = bpy.data.objects.new("paper", me); scn.collection.objects.link(paper)
paper.data.materials.append(PAPER)
bv = paper.modifiers.new("bevel", "BEVEL"); bv.width = 0.05; bv.segments = 4; bv.limit_method = "ANGLE"
for p in paper.data.polygons: p.use_smooth = True
paper.data.shade_smooth() if hasattr(paper.data, "shade_smooth") else None

# --- staple leg: sweep a rounded-rect profile along a bent path -------------
W, T, CR = 0.62, 0.34, 0.12    # wire width (in-plane), thickness, profile corner radius
R = 0.42                       # bend radius (centerline)
X, TIP = 2.75, 0.22            # bend x, tip x (gap = 2*TIP)

def profile(n=48, e=3.2):
    # superellipse cross-section: flat-ish but crowned faces so the metal catches gradients
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, si = math.cos(t), math.sin(t)
        out.append((W / 2 * math.copysign(abs(c) ** (2 / e), c), T / 2 * math.copysign(abs(si) ** (2 / e), si)))
    return out  # (side, normal) offsets

def leg_path():
    zc = T / 2 + 0.002
    path = [(X, -1.2), (X, zc - R)]
    for k in range(1, 17):
        a = math.radians(90 * k / 16)
        path.append((X - R + R * math.cos(a), zc - R + R * math.sin(a)))
    n = 24
    x0 = X - R
    for k in range(1, n + 1):
        path.append((x0 + (TIP - x0) * k / n, zc))
    return path

def build_leg(name):
    path, prof = leg_path(), profile()
    bm = bmesh.new(); rings = []
    uv_v = []
    L = 0.0
    for i, (px, pz) in enumerate(path):
        a = path[max(i - 1, 0)]; b = path[min(i + 1, len(path) - 1)]
        tng = Vector((b[0] - a[0], 0, b[1] - a[1])).normalized()
        side = Vector((0, 1, 0)); nrm = tng.cross(side).normalized()
        if nrm.z < 0 and abs(tng.z) < 0.5: nrm = -nrm
        if i: L += (Vector((px, 0, pz)) - Vector((path[i-1][0], 0, path[i-1][1]))).length
        uv_v.append(L)
        ring = []
        for s, h in prof:
            p = Vector((px, 0, pz)) + side * s + nrm * h
            p.x = max(p.x, TIP)  # square-cut tip
            ring.append(bm.verts.new(p))
        rings.append(ring)
    faces = []
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]; m = len(r0)
        for j in range(m):
            faces.append((bm.faces.new((r0[j], r0[(j + 1) % m], r1[(j + 1) % m], r1[j])), i, j))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    uv = bm.loops.layers.uv.new()
    for face, i, j in faces:
        m = len(rings[0])
        for loop in face.loops:
            vi = rings[i].index(loop.vert) if loop.vert in rings[i] else rings[i + 1].index(loop.vert)
            ri = i if loop.vert in rings[i] else i + 1
            loop[uv].uv = (uv_v[ri], vi / m)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); scn.collection.objects.link(ob)
    ob.data.materials.append(STEEL)
    return ob

OFF = 0.0  # legs aligned on one line
legs = bpy.data.objects.new("legs", None); scn.collection.objects.link(legs)
la = build_leg("leg_a"); la.location.y = OFF
lb = build_leg("leg_b"); lb.location.y = -OFF; lb.rotation_euler.z = math.pi
la.parent = legs; lb.parent = legs
legs.rotation_euler.z = math.radians(45)


# --- camera / light / world ------------------------------------------------
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = 10.24
cam.location = (0, 0.0, 30); scn.camera = cam

def area(name, loc, size, energy, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA")); scn.collection.objects.link(l)
    l.data.size = size; l.data.energy = energy; l.data.color = color
    l.location = loc
    d = Vector((0, 0, 0)) - Vector(loc); l.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return l

area("key", (-3, 7, 16), 8, 2600)
area("fill", (8, -10, 14), 24, 600, (0.92, 0.96, 1.0))
area("strip", (6, 8, 16), 2, 700)

w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
env = w.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(bpy.utils.system_resource("DATAFILES") + "/studiolights/world/studio.exr")
bg = w.node_tree.nodes["Background"]; bg.inputs["Strength"].default_value = 0.35
w.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])

# --- render ----------------------------------------------------------------
scn.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"; prefs.get_devices()
for d in prefs.devices: d.use = True
scn.cycles.device = "GPU"
scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
scn.render.film_transparent = True
scn.render.resolution_x = scn.render.resolution_y = RES
scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = -0.25
scn.render.image_settings.file_format = "PNG"; scn.render.image_settings.color_mode = "RGBA"
scn.render.filepath = OUT
# soft macOS-style drop shadow, composited from the icon's own alpha
scn.use_nodes = True
nt = scn.node_tree; nt.nodes.clear()
rl = nt.nodes.new("CompositorNodeRLayers")
blur = nt.nodes.new("CompositorNodeBlur"); blur.filter_type = "GAUSS"; blur.size_x = blur.size_y = int(RES * 0.03)
tr = nt.nodes.new("CompositorNodeTranslate"); tr.inputs["Y"].default_value = -RES * 0.012
mul = nt.nodes.new("CompositorNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 0.35
sa = nt.nodes.new("CompositorNodeSetAlpha"); sa.inputs["Image"].default_value = (0, 0, 0, 1)
ov = nt.nodes.new("CompositorNodeAlphaOver"); ov.use_premultiply = False
out = nt.nodes.new("CompositorNodeComposite")
L = nt.links.new
L(rl.outputs["Alpha"], blur.inputs["Image"]); L(blur.outputs[0], tr.inputs["Image"])
L(tr.outputs[0], mul.inputs[0]); L(mul.outputs[0], sa.inputs["Alpha"])
L(sa.outputs[0], ov.inputs[1]); L(rl.outputs["Image"], ov.inputs[2]); L(ov.outputs[0], out.inputs["Image"])
bpy.ops.render.render(write_still=True)
