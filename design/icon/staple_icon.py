# Versio app icon: back side of a clinched staple, 45° diagonal, on a paper squircle.
# Run: Blender -b -P design/icon/staple_icon.py -- <out.png> [res] [samples] [light|dark] [layer|flat] [vshadow] [shadow_gain] [shadow_blur]
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/staple_icon.png"
RES = int(argv[1]) if len(argv) > 1 else 1024
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
DARK = len(argv) > 3 and argv[3] == "dark"  # macOS dark-appearance variant
# "layer": full-bleed staple + shadow on transparency, for the Icon Composer .icon (system draws fill + mask)
LAYER = len(argv) > 4 and argv[4] == "layer"

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
    b.inputs["Base Color"].default_value = (0.50, 0.52, 0.55, 1)  # electro-galvanized (zinc-plated) steel: dull grey, faint blue
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Anisotropic"].default_value = 0.3
    # fine drawn-wire streaks along the wire (local X of each leg)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.4, 72, 1)  # UV: u = length, v = around the ~1.2-unit perimeter
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; nz.inputs["Detail"].default_value = 6
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])  # follows the wire through the bend (no seam in finish); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs["To Min"].default_value = 0.36; rr.inputs["To Max"].default_value = 0.50
    nt.links.new(nz.outputs["Fac"], rr.inputs["Value"]); nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    # mottled zinc coating: fine blotches between two greys
    mo = nt.nodes.new("ShaderNodeTexNoise"); mo.inputs["Scale"].default_value = 40; mo.inputs["Detail"].default_value = 10
    mm = nt.nodes.new("ShaderNodeMapping"); mm.inputs["Scale"].default_value = (1, 1.2, 1)
    nt.links.new(tc.outputs["UV"], mm.inputs["Vector"]); nt.links.new(mm.outputs["Vector"], mo.inputs["Vector"])
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[0].color = (0.40, 0.42, 0.45, 1)
    cr.color_ramp.elements[1].position = 0.7; cr.color_ramp.elements[1].color = (0.56, 0.58, 0.61, 1)
    nt.links.new(mo.outputs["Fac"], cr.inputs["Fac"]); nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    tg = nt.nodes.new("ShaderNodeTangent"); tg.direction_type = "RADIAL"; tg.axis = "Z"
    tg2 = nt.nodes.new("ShaderNodeTangent"); tg2.direction_type = "UV_MAP"
    nt.links.new(tg2.outputs["Tangent"], b.inputs["Tangent"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.3; bump.inputs["Distance"].default_value = 0.005
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

PAPER, STEEL = mat_paper(), mat_steel()

# --- paper squircle (macOS icon body: 824/1024 of canvas) ------------------
A, N, THICK = 4.12, 5.0, 0.25
bm = bmesh.new()
# macOS icon grid: 824/1024 body, corner radius 185.4px with continuous (smoothed) corners.
# Straight edges + per-corner superellipse (n=3) spanning ~1.53r: curvature-continuous like Apple's shape.
E, NC = 1.528 * 1.854, 3.0
pts = []
for cx, cy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
    ox, oy = cx * (A - E), cy * (A - E)
    for k in range(65):
        t = math.radians(a0 + 90 * k / 64)
        c, si = math.cos(t), math.sin(t)
        pts.append((ox + E * math.copysign(abs(c) ** (2 / NC), c), oy + E * math.copysign(abs(si) ** (2 / NC), si)))
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
W, T, CR = 0.38, 0.27, 0.10    # wire width (in-plane), thickness, profile corner radius
R = 0.75 * T                   # tight clinch: inner bend radius ~ 1/4 of thickness
X, TIP = 3.75, 0.24            # bend x, tip x (gap = 2*TIP)

def profile(n=64, e=3.0):
    # staple wire section (SEM): flat-ish outer/inner faces flowing into rounded sides, W:T ~ 1.4.
    # Superellipse keeps curvature continuous, so there is no shading seam where face meets side.
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n
        c, si = math.cos(t), math.sin(t)
        out.append((W / 2 * math.copysign(abs(c) ** (2 / e), c), T / 2 * math.copysign(abs(si) ** (2 / e), si)))
    return out  # (side, normal) offsets

# sheared point seen from the side: two flanks through the thickness meet near the paper side,
# long flank on top (faces the viewer), slightly blunt nose
P0, K_IN, K_OUT, NOSE = -0.1 * T, 0.9, 1.0, 0.03 * T  # short point, ~0.6T long like the real tip
LIFT = 0.42  # bend crest height above the plate: thin paper lets the bend stand proud of the tip


def leg_path():
    # wire comes up through the sheet, arcs over at the bend, then slopes down to a tip resting on the sheet
    z0 = T / 2 + 0.002
    cx, cz = X - R, z0 + LIFT - R
    al = 0.0
    for _ in range(20):  # slope so the straight run lands exactly on the sheet at the tip
        px, pz = cx - R * math.sin(al), cz + R * math.cos(al)
        al = math.atan2(pz - z0, px - TIP)
    path = [(X, -1.2), (X, cz)]
    sweep = math.pi / 2 + al
    for k in range(1, 25):
        th = sweep * k / 24
        path.append((cx + R * math.cos(th), cz + R * math.sin(th)))
    xc = TIP - 0.02  # run overshoots the tip; the point is cut by planes in build_leg
    for k in range(1, 121):
        t = k / 120
        x = px + (xc - px) * t
        path.append((x, pz + (z0 - pz) * (x - px) / (TIP - px)))
    return path

def wobble(u, seed, amp, freqs=(0.6, 1.3, 2.9)):
    # deterministic low-frequency irregularity (no two real staple legs are straight or flat)
    return amp * sum(math.sin(u * f * 2 * math.pi / 3 + seed * (k + 1) * 1.37) / (k + 1) for k, f in enumerate(freqs))

def build_leg(name, seed):
    path, prof = leg_path(), profile()
    bm = bmesh.new(); rings = []
    uv_v = []
    L = 0.0
    for i, (px, pz) in enumerate(path):
        a = path[max(i - 1, 0)]; b = path[min(i + 1, len(path) - 1)]
        tng = Vector((b[0] - a[0], 0, b[1] - a[1])).normalized()
        side = Vector((0, 1, 0)); nrm = side.cross(tng).normalized()  # continuous frame: no flip at the bend
        if i: L += (Vector((px, 0, pz)) - Vector((path[i-1][0], 0, path[i-1][1]))).length
        uv_v.append(L)
        ring = []
        tw = math.radians(wobble(L, seed, 0.9))           # slight twist from the clinch
        dy = wobble(L, seed + 3, 0.005)                   # lateral waviness
        dz = wobble(L, seed + 7, 0.006)                   # vertical waviness of the run
        squash = math.exp(-((L - 1.4) / 0.6) ** 2) * 0.06  # anvil flattens the wire at the bend
        sw, sh = 1 + squash + wobble(L, seed + 11, 0.012), 1 - squash
        for s, h in prof:
            s, h = s * sw, h * sh
            s, h = s * math.cos(tw) - h * math.sin(tw), s * math.sin(tw) + h * math.cos(tw)
            p = Vector((px, dy, pz + dz)) + side * s + nrm * h
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
    # shear the point: top flank, bottom flank, blunt nose; each cut capped with a flat face
    z0 = T / 2 + 0.002
    for no, co in (((-1, 0, K_OUT), (TIP, 0, z0 + P0 + NOSE)),
                   ((-1, 0, -K_IN), (TIP, 0, z0 + P0 - NOSE)),
                   ((-1, 0, 0), (TIP, 0, 0))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=Vector(no).normalized(), clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(50))  # crisp sheared tip, smooth wire body
    ob = bpy.data.objects.new(name, me); scn.collection.objects.link(ob)
    ob.data.materials.append(STEEL)
    return ob

OFF = 0.0  # legs aligned on one line
legs = bpy.data.objects.new("legs", None); scn.collection.objects.link(legs)
la = build_leg("leg_a", 1); la.location.y = OFF
lb = build_leg("leg_b", 5); lb.location.y = -OFF; lb.rotation_euler.z = math.pi
la.parent = legs; lb.parent = legs
legs.rotation_euler.z = math.radians(45)


# --- camera / light / world ------------------------------------------------
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2 * A if LAYER else 10.24
cam.location = (0, 0.0, 30); scn.camera = cam

def area(name, loc, size, energy, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA")); scn.collection.objects.link(l)
    l.data.size = size; l.data.energy = energy; l.data.color = color
    l.location = loc
    d = Vector((0, 0, 0)) - Vector(loc); l.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return l

if DARK:  # lower, cooler key; stronger strip so the wire edges still read on the dark plate
    area("key", (-21, 21, 27), 7.5, 13000, (0.9, 0.95, 1.0))
    area("fill", (8, -10, 14), 24, 200, (0.8, 0.88, 1.0))
    area("strip", (6, 8, 16), 2, 1400)
else:
    area("key", (-21, 21, 27), 7.5, 18000)
    area("fill", (8, -10, 14), 24, 350, (0.92, 0.96, 1.0))
    area("strip", (6, 8, 16), 2, 700)

# Light-mode "V": an invisible proxy staple with tall bends casts a long soft shadow from a low lower-right light,
# so the two leg shadows fan out to the upper left as a tilted V. The real staple keeps its own lights unchanged.
VSHADOW = 0 if DARK else float(argv[5]) if len(argv) > 5 else 0  # V shadow opacity 0..1 (0 = classic contact shadow)
VREF = 0.22  # shadow opacity the lights produce; brighter fill would wash out the staple's reflections
if VSHADOW:
    def coll(name, objs):
        c = bpy.data.collections.new(name)
        for o in objs: c.objects.link(o)
        return c
    classic = [o for o in scn.objects if o.type == "LIGHT"]
    LIFT = 2.2  # leg_path reads this global: proxy bends stand tall so their shadows reach far
    pa = build_leg("proxy_a", 1); pb = build_leg("proxy_b", 5); pb.rotation_euler.z = math.pi
    proxy = bpy.data.objects.new("proxy", None); scn.collection.objects.link(proxy); proxy.rotation_euler.z = math.radians(45)
    for o in (pa, pb):
        o.parent = proxy
        o.visible_camera = o.visible_diffuse = o.visible_glossy = o.visible_transmission = o.visible_volume_scatter = False
    staple, plate, shadow = coll("staple", [la, lb]), coll("plate", [paper]), coll("vproxy", [pa, pb])
    for l in classic:  # classic lights light and shade only the real staple: no contact shadow on the plate
        l.light_linking.receiver_collection = staple; l.light_linking.blocker_collection = staple
    az, el, dist = math.radians(-45), math.radians(18), 40.2
    v = area("vkey", (dist * math.cos(el) * math.cos(az), dist * math.cos(el) * math.sin(az), dist * math.sin(el)), 4, 10000)  # ~ classic plate brightness, so the metal reflects the same bright sheet
    v.light_linking.receiver_collection = plate; v.light_linking.blocker_collection = shadow
    # shadowless top fill sets the opacity: catcher alpha ~ E_key / (E_key + E_fill) where fully blocked
    # lighting is fixed at the ratio where the metal matches the classic icon; VSHADOW only rescales the shadow in compositing
    f = area("vfill", (0, 0, 30), 30, 10000 * math.sin(el) / dist**2 * 30**2 * (1 - VREF) / VREF)
    f.light_linking.receiver_collection = plate; f.light_linking.blocker_collection = coll("none", [])

w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
env = w.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(bpy.utils.system_resource("DATAFILES") + "/studiolights/world/studio.exr")
bg = w.node_tree.nodes["Background"]; bg.inputs["Strength"].default_value = 0.2 if DARK else 0.35
w.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
if VSHADOW: w.cycles_visibility.diffuse = False  # HDRI keeps the metal reflections but stops lighting (and shadowing) the plate

# --- render ----------------------------------------------------------------
scn.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"; prefs.get_devices()
for d in prefs.devices: d.use = True
scn.cycles.device = "GPU"
scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
scn.render.film_transparent = True
scn.render.resolution_x = scn.render.resolution_y = RES
scn.view_settings.view_transform = "Standard"; scn.view_settings.exposure = 0.0
scn.render.image_settings.file_format = "PNG"; scn.render.image_settings.color_mode = "RGBA"
scn.render.filepath = OUT
# plate = shadow catcher (only the staple's shadow), composited over a flat white squircle
paper.is_shadow_catcher = True
paper.pass_index = 1
scn.view_layers[0].use_pass_object_index = True
scn.use_nodes = True
nt = scn.node_tree; nt.nodes.clear()
rl = nt.nodes.new("CompositorNodeRLayers")
idm = nt.nodes.new("CompositorNodeIDMask"); idm.index = 1; idm.use_antialiasing = True
sa = nt.nodes.new("CompositorNodeSetAlpha"); sa.inputs["Image"].default_value = (0.007, 0.009, 0.017, 1) if DARK else (1, 1, 1, 1)
ov = nt.nodes.new("CompositorNodeAlphaOver")
out = nt.nodes.new("CompositorNodeComposite")
nt.links.new(rl.outputs["IndexOB"], idm.inputs["ID value"]); nt.links.new(idm.outputs["Alpha"], sa.inputs["Alpha"])
img = rl.outputs["Image"]
# shadow post-process: gain scales the plate's (shadow) alpha, blur softens it; the staple's own pixels stay as rendered
GAIN = VSHADOW / VREF if VSHADOW else float(argv[6]) if len(argv) > 6 else 1.0
BLUR = float(argv[7]) if len(argv) > 7 else 0.0  # gaussian radius as a fraction of the image width
if GAIN != 1 or BLUR:
    def math_node(op, a, b):
        m = nt.nodes.new("CompositorNodeMath"); m.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)): m.inputs[i].default_value = v
            else: nt.links.new(v, m.inputs[i])
        return m.outputs[0]
    mask = idm.outputs["Alpha"]
    shadow = math_node("MULTIPLY", rl.outputs["Alpha"], mask)
    staple = math_node("MULTIPLY", rl.outputs["Alpha"], math_node("SUBTRACT", 1.0, mask))
    if BLUR:
        bl = nt.nodes.new("CompositorNodeBlur"); bl.filter_type = "GAUSS"; bl.use_relative = True
        bl.factor_x = bl.factor_y = BLUR * 100; bl.use_extended_bounds = False
        nt.links.new(shadow, bl.inputs["Image"]); shadow = bl.outputs["Image"]
        shadow = math_node("MULTIPLY", shadow, mask)  # keep the blurred shadow on the plate
    shadow = math_node("MULTIPLY", shadow, GAIN)
    alpha = math_node("SUBTRACT", math_node("ADD", staple, shadow), math_node("MULTIPLY", staple, shadow))  # staple over shadow
    ra = nt.nodes.new("CompositorNodeSetAlpha"); ra.mode = "REPLACE_ALPHA"  # shadow color is black, so only alpha changes
    nt.links.new(img, ra.inputs["Image"]); nt.links.new(alpha, ra.inputs["Alpha"]); img = ra.outputs["Image"]
nt.links.new(sa.outputs["Image"], ov.inputs[1]); nt.links.new(img, ov.inputs[2])
nt.links.new(ov.outputs["Image"] if not LAYER else img, out.inputs["Image"])
scn.use_nodes = not LAYER or GAIN != 1 or bool(BLUR)
bpy.ops.file.pack_all()  # embed the HDRI so the .blend opens anywhere
bpy.ops.wm.save_as_mainfile(filepath=OUT.rsplit(".", 1)[0] + ".blend")
bpy.ops.render.render(write_still=True)
