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
SUN = float(os.environ.get("INTRO_SUN", "4.4"))  # sheet brightness; calibrated so flat paper ~ #fbfbfb
# timeline (frames @30fps); static stretches before LAND_START and after GONE are duplicated by render.sh
# A real stapler gives in two stages: the first click (the staple is driven through), then the snap (the clinch).
# Stage times follow the recorded sound (src/assets/intro/staple.wav: clicks 0.264 s apart, release ~0.37 s later).
LAND_START, LAND = 10, 22  # glide in -> land under the sheet
STAGE1 = 27                # first click
CONTACT = 35               # the snap
# The sound is "tu, TAAN, ta-ta-ta": the staple is bent on TAAN; ta-ta-ta is the spring kicking the stapler back open,
# so the base rises in three steps on those hits (frames from the onsets in staple.wav), then pulls away.
REBOUND = ((55, 0.9), (59, 0.6), (67, 0.4))  # (frame of the hit, rise in units)
LIFT, GONE = 70, 78

# --- paper: a large matte sheet with faint fibre ----------------------------
def mat_paper():
    m = bpy.data.materials.new("sheet"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.95, 0.95, 0.95, 1)
    b.inputs["Roughness"].default_value = 0.9
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18; nz.inputs["Detail"].default_value = 12
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.04
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

# grid so the sheet can dent at the press (see "press" below)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=160, y_subdivisions=160, size=64, location=(0, 0, 0))
sheet = bpy.context.object; sheet.name = "sheet"; sheet.data.materials.append(mat_paper())

# --- stapler base, seen from below ------------------------------------------
# Scale: 1 unit ~ 1.6 mm (staple crown ~12 mm). Real desk stapler base ~30 mm wide, long body off-frame.
BW, BL, BT = 20.0, 90.0, 2.0  # width (along the staple), length, thickness

def mat_plastic():
    # Versio service blue (#1a73e8 in sRGB -> linear), glossy moulded plastic like a compact desk stapler
    m = bpy.data.materials.new("base"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.010, 0.171, 0.807, 1)
    b.inputs["Roughness"].default_value = 0.32
    b.inputs["Coat Weight"].default_value = 0.25
    return m

def rounded_slab(name, w, l, t, bevel, rc, top_round=0.0):
    # rounded-rectangle outline: body running +y from a squared nose at y=0 with corner radius rc
    bm = bmesh.new(); pts = [(w / 2, l)]
    for cx, a0 in ((w / 2 - rc, 0), (-(w / 2 - rc), -90)):  # right side down, across the nose, left side up
        pts += [(cx + rc * math.cos(math.radians(a0 - 90 * k / 16)), rc + rc * math.sin(math.radians(a0 - 90 * k / 16)))
                for k in range(17)]
    pts.append((-w / 2, l))
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert): v.co.z += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if top_round:  # round over the face toward the camera (the one the animation shows) with a big circular profile
        top = [e for e in bm.edges if all(abs(v.co.z - t) < 1e-6 for v in e.verts)]
        bmesh.ops.bevel(bm, geom=top, offset=top_round, offset_type="OFFSET", segments=14, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scn.collection.objects.link(ob)
    bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 6; bv.limit_method = "ANGLE"
    for p in me.polygons: p.use_smooth = True
    return ob

# Simple base, seen from below: one blue slab whose camera-facing face is generously rounded.
base = bpy.data.objects.new("base", None); scn.collection.objects.link(base)
body = rounded_slab("body", BW, BL, BT, 0.25, 5.0, top_round=1.6); body.data.materials.append(mat_plastic()); body.parent = base

# Staple centre sits ~8 mm (5 units) back from the nose; the body runs perpendicular to the staple crown.
NOSE_TO_STAPLE = 5.5
body.location.y -= NOSE_TO_STAPLE
base.rotation_euler.z = math.radians(45)  # body extends to the upper-left, off-frame
REST_Z = 1.25  # just clears the clinched legs

# --- animation ----------------------------------------------------------------
# Like a real stapling: the base glides in and lands softly under the sheet, the press builds (camera creeps in),
# then the snap is one sharp beat, a short hold, and the base pulls away accelerating.
scn.render.fps = FPS; scn.frame_start, scn.frame_end = 1, 90

def key(frame, loc, tilt=0.0, interp="BEZIER", easing="AUTO"):
    base.location = loc; base.rotation_euler.x = tilt; base.rotation_euler.y = -tilt
    for path in ("location", "rotation_euler"):
        base.keyframe_insert(path, frame=frame)
    for fc in base.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            if int(kp.co.x) == frame: kp.interpolation = interp; kp.easing = easing

off = Vector((-30, 30, 14))
key(1, off, 0.18, "CONSTANT")
key(LAND_START, off, 0.18, "EXPO", "EASE_OUT")       # fast in, soft landing
key(LAND, Vector((0, 0, REST_Z)), 0.0, "LINEAR")
key(STAGE1 - 1, Vector((0, 0, REST_Z)), 0.0, "QUAD", "EASE_OUT")
key(STAGE1, Vector((0, 0, REST_Z - 0.06)), 0.0, "LINEAR")           # first give
key(CONTACT - 1, Vector((0, 0, REST_Z - 0.06)), 0.0, "LINEAR")
key(CONTACT, Vector((0, 0, REST_Z - 0.12)), 0.0, "QUAD", "EASE_OUT")  # pressed into the sheet
key(CONTACT + 3, Vector((0, 0, REST_Z)), 0.0, "CONSTANT")
z = REST_Z
for f, rise in REBOUND:  # each hit kicks the base up with a little overshoot, then it rests until the next
    key(f - 1, Vector((0, 0, z)), 0.0, "BACK", "EASE_OUT")
    z += rise
    key(f + 2, Vector((0, 0, z)), 0.0, "CONSTANT")
key(LIFT, Vector((0, 0, z)), 0.0, "CUBIC", "EASE_IN")         # accelerates away
key(GONE, off, 0.18, "CONSTANT")
key(90, off, 0.18, "CONSTANT")

# staple appears at the moment of the clinch (hidden under the base anyway)
for ob in (la, lb):
    ob.hide_render = True; ob.keyframe_insert("hide_render", frame=CONTACT - 1)
    ob.hide_render = False; ob.keyframe_insert("hide_render", frame=CONTACT)

# --- press: the sheet dents softly under the base at the snap and springs back flat (no lasting wrinkles) ---
import numpy as np
me = sheet.data; n = len(me.vertices)
co = np.empty(n * 3); me.vertices.foreach_get("co", co); co = co.reshape(n, 3)
x, y = co[:, 0], co[:, 1]
def smooth(v, a, b): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
u = np.array([1, 1]) / math.sqrt(2); along = x * u[0] + y * u[1]
off_line = np.hypot(x - along * u[0], y - along * u[1])
# keep the sheet flat right under the wire so the legs never float above a dent
clear = np.maximum(smooth(off_line, 0.35, 1.0), smooth(np.abs(along), G["X"] + 0.4, G["X"] + 1.2))
sheet.shape_key_add(name="flat")
k = sheet.shape_key_add(name="press"); kc = co.copy(); kc[:, 2] += -0.5 * np.exp(-(np.hypot(x, y) / 8.0) ** 2) * clear
k.data.foreach_set("co", kc.ravel())
kb = sheet.data.shape_keys.key_blocks
for f, pv in ((STAGE1 - 1, 0), (STAGE1, 0.35), (CONTACT - 1, 0.4), (CONTACT, 1), (CONTACT + 4, 0.3), (REBOUND[0][0] - 1, 0.3), (REBOUND[0][0] + 2, 0)):
    kb["press"].value = pv; kb["press"].keyframe_insert("value", frame=f)
for o in (sheet,): o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))

# --- camera: slow push while the press builds, a punch + shake on the snap -----
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam)
DIST = 24.0
cam.data.lens = 29; cam.location = (0, 0, DIST); scn.camera = cam
for f, (dx, dy, dz) in ((LAND, (0, 0, 0)), (STAGE1 - 1, (0, 0, -0.15)), (STAGE1, (0.05, -0.03, 0.1)),
                        (STAGE1 + 2, (0, 0, -0.2)), (CONTACT - 1, (0, 0, -0.6)), (CONTACT, (0.16, -0.1, 0.35)),
                        (CONTACT + 1, (-0.12, 0.08, -0.15)), (CONTACT + 2, (0.05, -0.03, 0.05)), (CONTACT + 4, (0, 0, 0))):
    cam.location = (dx, dy, DIST + dz); cam.keyframe_insert("location", frame=f)
for fc in cam.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "SINE" if int(kp.co.x) == LAND else "BEZIER"
        if int(kp.co.x) == LAND: kp.easing = "EASE_IN"

# --- light / world (same key direction as the icon: upper-left) ---------------
def area(name, loc, size, energy, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA")); scn.collection.objects.link(l)
    l.data.shape = "DISK"; l.data.size = size; l.data.energy = energy; l.data.color = color; l.location = loc
    l.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return l

area("key", (-42, 42, 54), 16, 72000)  # icon key scaled for 2x distance
area("fill", (16, -20, 28), 40, 1400, (0.92, 0.96, 1.0))
area("strip", (12, 16, 32), 4, 2800)
# Light linking: the icon's lights shade only the stapler and staple (so the mark matches the icon); the sheet is lit
# by one uniform soft sun from the same direction, calibrated to read as near-white, which also casts every shadow.
def coll(name, objs):
    c = bpy.data.collections.new(name)
    for o in objs: c.objects.link(o)
    return c
things = coll("things", [la, lb, body])
for nm in ("key", "fill", "strip"): scn.objects[nm].light_linking.receiver_collection = things
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scn.collection.objects.link(sun)
sun.data.energy = SUN; sun.data.angle = math.radians(14)
sun.rotation_euler = (Vector((0, 0, 0)) - Vector((-42, 42, 54))).to_track_quat("-Z", "Y").to_euler()
sun.light_linking.receiver_collection = coll("paper", [sheet])

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
scn.render.film_transparent = False
scn.render.resolution_x = RES_X; scn.render.resolution_y = RES_X * 10 // 16
scn.view_settings.view_transform = "Standard"
scn.render.image_settings.file_format = "PNG"; scn.render.image_settings.color_mode = "RGB"
scn.render.filepath = os.path.join(OUT_DIR, "f_####")
scn.frame_start, scn.frame_end = F0, F1
scn.render.use_overwrite = False  # resume an interrupted render (render.sh: TMP=<dir>)
if os.environ.get("INTRO_BLEND"):  # INTRO_BLEND=<path.blend>: save the scene to inspect in Blender instead of rendering
    scn.frame_start, scn.frame_end = 1, 90
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.environ["INTRO_BLEND"])
else:
    bpy.ops.render.render(animation=True)
