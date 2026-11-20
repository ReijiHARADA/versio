# Versio first-launch intro: the screen is the back of a sheet of paper. A giant stapler base (seen from its
# underside) swoops in, slams onto the sheet, lifts away, and leaves the clinched staple from the app icon.
# Run: Blender -b -P design/intro/stapler_intro.py -- <out_dir> [res_x] [samples] [frame_start] [frame_end]
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = argv[0] if argv else "/tmp/stapler_intro"
RES_X = int(argv[1]) if len(argv) > 1 else 1600
SAMPLES = int(argv[2]) if len(argv) > 2 else 48
F0 = int(argv[3]) if len(argv) > 3 else 1
F1 = int(argv[4]) if len(argv) > 4 else 90

# Reuse the icon's staple (geometry + zinc-steel material) verbatim so the mark matches the app icon.
# The icon script's argv parsing only sees our args, which keep it in its default light/non-layer mode.
ICON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icon", "staple_icon.py")
src = open(ICON).read().split("# --- camera / light / world")[0]
G = {"__name__": "staple_icon"}
exec(compile(src, ICON, "exec"), G)
scn = bpy.context.scene
bpy.data.objects.remove(scn.objects["paper"])  # icon squircle; the intro uses a full sheet
legs, la, lb, STEEL = G["legs"], G["la"], G["lb"], G["STEEL"]

FPS = 30
CONTACT = 34  # frame the base hits the sheet; IntroOverlay plays the snap here (CLINCH_TIME_S = CONTACT / FPS)

# --- paper: a large matte sheet with faint fibre ----------------------------
def mat_paper():
    m = bpy.data.materials.new("sheet"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.92, 0.92, 0.91, 1)
    b.inputs["Roughness"].default_value = 0.9
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18; nz.inputs["Detail"].default_value = 12
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.04
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
sheet = bpy.context.object; sheet.name = "sheet"; sheet.data.materials.append(mat_paper())

# --- stapler base, seen from below ------------------------------------------
# Scale: 1 unit ~ 1.6 mm (staple crown ~12 mm). Real desk stapler base ~30 mm wide, long body off-frame.
BW, BL, BT = 20.0, 90.0, 3.2  # width (along the staple), length, thickness

def mat_plastic():
    m = bpy.data.materials.new("base"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.018, 0.019, 0.021, 1)
    b.inputs["Roughness"].default_value = 0.42
    b.inputs["Coat Weight"].default_value = 0.15
    return m

def mat_rubber():
    m = bpy.data.materials.new("rubber"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.05, 0.05, 0.05, 1); b.inputs["Roughness"].default_value = 0.85
    return m

def rounded_slab(name, w, l, t, bevel):
    # stadium outline: straight body running +y, semicircular nose at y=0
    bm = bmesh.new(); r = w / 2; pts = []
    for k in range(49):
        a = math.pi + math.pi * k / 48  # nose half-circle around (0, r)
        pts.append((r * math.cos(a), r + r * math.sin(a)))
    pts += [(r, l), (-r, l)]
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert): v.co.z += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scn.collection.objects.link(ob)
    bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 5; bv.limit_method = "ANGLE"
    for p in me.polygons: p.use_smooth = True
    return ob

base = bpy.data.objects.new("base", None); scn.collection.objects.link(base)
body = rounded_slab("body", BW, BL, BT, 0.9); body.data.materials.append(mat_plastic()); body.parent = base
# underside detail facing the camera: a shallow recessed panel and two rubber feet near the nose
panel = rounded_slab("panel", BW - 5, BL, 0.25, 0.1); panel.location = (0, 2.5, BT - 0.05)
panel.data.materials.append(mat_plastic()); panel.parent = base
for i, x in enumerate((-BW / 2 + 3.4, BW / 2 - 3.4)):
    foot = rounded_slab(f"foot{i}", 3.2, 4.0, 0.7, 0.3); foot.location = (x, 4.0, BT - 0.1)
    foot.data.materials.append(mat_rubber()); foot.parent = base

# Staple centre sits ~8 mm (5 units) back from the nose; the body runs perpendicular to the staple crown.
NOSE_TO_STAPLE = 5.5
for o in (body, panel) + tuple(o for o in base.children if o.name.startswith("foot")):
    o.location.y -= NOSE_TO_STAPLE
base.rotation_euler.z = math.radians(45)  # body extends to the upper-left, off-frame
REST_Z = 1.25  # just above the clinched legs

# --- animation ----------------------------------------------------------------
scn.render.fps = FPS; scn.frame_start, scn.frame_end = 1, 90

def key(frame, loc, rot_x=0.0, rot_y=0.0, interp="BEZIER"):
    base.location = loc; base.rotation_euler.x = rot_x; base.rotation_euler.y = rot_y
    for path in ("location", "rotation_euler"):
        base.keyframe_insert(path, frame=frame)

# offscreen (upper-left, high) -> swoop in and hover (wind-up) -> slam -> hold -> lift out to the upper-left
off = Vector((-34, 34, 26))
key(1, off, 0.25, -0.25); key(12, off, 0.25, -0.25)
key(22, Vector((-1.2, 1.2, 9.0)), 0.06, -0.06)
key(29, Vector((-0.6, 0.6, 11.0)), 0.04, -0.04)
key(CONTACT, Vector((0, 0, REST_Z)))
key(40, Vector((0, 0, REST_Z)))
key(46, Vector((-2, 2, 7.0)), 0.05, -0.05)
key(56, off, 0.25, -0.25); key(90, off, 0.25, -0.25)
for fc in base.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "BEZIER"; kp.easing = "AUTO"
        if int(kp.co.x) in (CONTACT, 56): kp.interpolation = "QUAD"; kp.easing = "EASE_IN"  # slam / exit accelerate
        if int(kp.co.x) == 22: kp.interpolation = "BACK"; kp.easing = "EASE_OUT"
    # the frame right before contact must accelerate into it, not ease out
    for kp in fc.keyframe_points:
        if int(kp.co.x) == 29: kp.interpolation = "QUAD"; kp.easing = "EASE_IN"

# staple appears at the moment of the clinch (hidden under the base anyway)
for ob in (la, lb):
    ob.hide_render = True; ob.keyframe_insert("hide_render", frame=CONTACT - 1)
    ob.hide_render = False; ob.keyframe_insert("hide_render", frame=CONTACT)

# --- camera with an impact shake ----------------------------------------------
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam)
DIST = 24.0
cam.data.lens = 29; cam.location = (0, 0, DIST); scn.camera = cam
for f, (dx, dy, dz) in ((CONTACT - 1, (0, 0, 0)), (CONTACT, (0.18, -0.12, -0.5)), (CONTACT + 1, (-0.14, 0.1, 0.25)),
                        (CONTACT + 2, (0.07, -0.05, -0.1)), (CONTACT + 4, (0, 0, 0))):
    cam.location = (dx, dy, DIST + dz); cam.keyframe_insert("location", frame=f)

# --- light / world (same key direction as the icon: upper-left) ---------------
def area(name, loc, size, energy, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA")); scn.collection.objects.link(l)
    l.data.size = size; l.data.energy = energy; l.data.color = color; l.location = loc
    l.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return l

area("key", (-42, 42, 54), 16, 72000)  # icon key scaled for 2x distance
area("fill", (16, -20, 28), 40, 1400, (0.92, 0.96, 1.0))
area("strip", (12, 16, 32), 4, 2800)

w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
env = w.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(bpy.utils.system_resource("DATAFILES") + "/studiolights/world/studio.exr")
bg = w.node_tree.nodes["Background"]; bg.inputs["Strength"].default_value = 0.35
w.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])

# --- render ---------------------------------------------------------------------
scn.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"; prefs.get_devices()
for d in prefs.devices: d.use = True
scn.cycles.device = "GPU"; scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
scn.render.use_motion_blur = True; scn.render.motion_blur_shutter = 0.5
# like the icon: the sheet is a shadow catcher composited over flat white, so the paper is exactly #fff
# (matches the overlay background) while keeping the base's and staple's real shadows
sheet.is_shadow_catcher = True
scn.render.film_transparent = True
scn.use_nodes = True
nt = scn.node_tree; nt.nodes.clear()
rl = nt.nodes.new("CompositorNodeRLayers")
ov = nt.nodes.new("CompositorNodeAlphaOver"); ov.inputs[1].default_value = (1, 1, 1, 1)
out = nt.nodes.new("CompositorNodeComposite")
nt.links.new(rl.outputs["Image"], ov.inputs[2]); nt.links.new(ov.outputs["Image"], out.inputs["Image"])
scn.render.resolution_x = RES_X; scn.render.resolution_y = RES_X * 10 // 16
scn.view_settings.view_transform = "Standard"
scn.render.image_settings.file_format = "PNG"; scn.render.image_settings.color_mode = "RGB"
scn.render.filepath = os.path.join(OUT_DIR, "f_####")
scn.frame_start, scn.frame_end = F0, F1
scn.render.use_overwrite = False  # resume an interrupted render (render.sh: TMP=<dir>)
bpy.ops.render.render(animation=True)
