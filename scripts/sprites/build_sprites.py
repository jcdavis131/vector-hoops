"""Render the Pixel Replay player sprite atlas with Blender, headless.

    blender -b --factory-startup --python scripts/sprites/build_sprites.py -- --out assets/sprites

Builds a blocky, procedural player (no downloaded models or textures), poses it with keyframe
values computed here, and renders every (elevation, direction, frame) cell with the Workbench
engine: studio light, no specular, no anti-aliasing, a dark outline, transparent film, Standard
view transform. Team colours are not baked in: the jersey renders pure red, the shorts pure
green and the trim pure blue, so replay.js recolours one atlas for any team (class = dominant
channel, shade = that channel's value). Studio light greys colours out (a lit red jersey comes back
near 128,32,32), so every cell renders twice: FLAT gives each pixel's exact material colour, STUDIO
gives how lit it is, and the cell keeps the flat colour times that light.

Writes players.png (atlas) and players.json (layout, poses, anchors). Stdlib + bpy only.
"""

import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = Path(ARGS[ARGS.index("--out") + 1]) if "--out" in ARGS else Path.cwd() / "assets" / "sprites"
OUT.mkdir(parents=True, exist_ok=True)
TMP = OUT / "_cells"
TMP.mkdir(parents=True, exist_ok=True)

CW, CH = 32, 48  # cell size, px
ELEVATIONS = [28, 62]  # camera pitch, degrees
DIRS = 8  # player facing relative to the camera, 45 deg steps; 0 = facing the camera, 2 = facing screen right
ORTHO = 3.1  # metres visible vertically
TARGET_Z = 1.25


# pose name -> list of frames; each frame: root z (m), lean (deg, forward +), arm L/R and leg L/R swing (deg, forward +)
def run_frames():
    out = []
    for k in range(4):
        s = math.sin(2 * math.pi * k / 4 + math.pi / 4)
        out.append(dict(z=0.05 * abs(s), lean=12, al=-45 * s, ar=45 * s, ll=38 * s, lr=-38 * s))
    return out


POSES = {
    "idle": [dict(z=0, lean=4, al=6, ar=6, ll=0, lr=0), dict(z=-0.025, lean=6, al=10, ar=10, ll=0, lr=0)],
    "run": run_frames(),
    "jumper": [
        dict(z=-0.14, lean=8, al=55, ar=55, ll=18, lr=18),
        dict(z=0.10, lean=0, al=140, ar=140, ll=0, lr=0),
        dict(z=0.38, lean=-4, al=172, ar=168, ll=-6, lr=-6),
        dict(z=0.18, lean=-2, al=158, ar=150, ll=0, lr=0),
    ],
    "dunk": [
        dict(z=-0.10, lean=16, al=40, ar=20, ll=30, lr=-10),
        dict(z=0.45, lean=6, al=150, ar=50, ll=-20, lr=25),
        dict(z=0.62, lean=0, al=180, ar=60, ll=-10, lr=15),
        dict(z=0.50, lean=-6, al=172, ar=168, ll=10, lr=10),
    ],
    "celebrate": [dict(z=0.14, lean=-6, al=170, ar=170, ll=-8, lr=8), dict(z=0.0, lean=-2, al=135, ar=150, ll=0, lr=0)],
}
ORDER = ["idle", "run", "jumper", "dunk", "celebrate"]
FRAMES = [(p, i) for p in ORDER for i in range(len(POSES[p]))]

SKIN = (0.55, 0.27, 0.13, 1)  # linear; about 195,143,100 on screen
HAIR = (0.10, 0.07, 0.05, 1)
SHOE = (0.95, 0.95, 0.95, 1)
SOCK = (0.85, 0.85, 0.85, 1)
MASK_JERSEY = (1, 0, 0, 1)
MASK_SHORTS = (0, 1, 0, 1)
MASK_TRIM = (0, 0, 1, 1)

# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = CW, CH, 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.display.render_aa = "OFF"
sh = sc.display.shading
sh.light = "STUDIO"
sh.color_type = "MATERIAL"
sh.show_specular_highlight = False
sh.show_object_outline = True
sh.object_outline_color = (0.004, 0.004, 0.004)  # linear: near-black and grey, so never read as a mask
sh.show_cavity = False
sh.show_shadows = False
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"


def mat(name, rgba):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m


MATS = {
    k: mat(k, v)
    for k, v in dict(
        skin=SKIN, hair=HAIR, shoe=SHOE, sock=SOCK, jersey=MASK_JERSEY, shorts=MASK_SHORTS, trim=MASK_TRIM
    ).items()
}


def box(name, size, loc, m, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.location = loc
    o.data.materials.append(MATS[m])
    o.parent = parent
    return o


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    sc.collection.objects.link(e)
    e.location = loc
    e.parent = parent
    return e


# The body faces -Y. A limb swing of +a degrees (forward) is a rotation of -a about X.
root = empty("root", (0, 0, 0))
hips = empty("hips", (0, 0, 0.95), root)
box("shorts", (0.52, 0.30, 0.20), (0, 0, 0.02), "shorts", hips)
box("shorts_stripe_l", (0.02, 0.31, 0.20), (0.265, 0, 0.02), "trim", hips)
box("shorts_stripe_r", (0.02, 0.31, 0.20), (-0.265, 0, 0.02), "trim", hips)
torso = empty("torso", (0, 0, 0.1), hips)
box("jersey", (0.54, 0.30, 0.60), (0, 0, 0.3), "jersey", torso)
box("collar", (0.56, 0.31, 0.05), (0, 0, 0.6), "trim", torso)
box("neck", (0.1, 0.1, 0.08), (0, 0, 0.66), "skin", torso)
box("head", (0.24, 0.24, 0.27), (0, 0, 0.82), "skin", torso)
box("hair", (0.25, 0.25, 0.06), (0, 0, 0.97), "hair", torso)
legs, arms = {}, {}
for side, x in (("l", 0.12), ("r", -0.12)):
    leg = empty("leg_" + side, (x, 0, -0.1), hips)
    box("shortleg_" + side, (0.21, 0.24, 0.36), (0, 0, -0.16), "shorts", leg)  # baggy shorts to the knee
    box("thigh_" + side, (0.15, 0.17, 0.80), (0, 0, -0.40), "skin", leg)
    box("sock_" + side, (0.16, 0.18, 0.16), (0, 0, -0.70), "sock", leg)
    box("shoe_" + side, (0.18, 0.28, 0.1), (0, -0.04, -0.82), "shoe", leg)
    legs[side] = leg
    arm = empty("arm_" + side, (x * 2.75, 0, 0.56), torso)
    box("armm_" + side, (0.11, 0.13, 0.62), (0, 0, -0.31), "skin", arm)
    arms[side] = arm

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = ORTHO
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam


def set_camera(elev_deg):
    e = math.radians(elev_deg)
    d = 10
    cam.location = (0, -d * math.cos(e), TARGET_Z + d * math.sin(e))
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)


def set_pose(f, direction):
    root.rotation_euler = (0, 0, math.radians(direction * 45))
    root.location = (0, 0, f["z"])
    torso.rotation_euler = (-math.radians(f["lean"]), 0, 0)
    arms["l"].rotation_euler = (-math.radians(f["al"]), 0, math.radians(-6))
    arms["r"].rotation_euler = (-math.radians(f["ar"]), 0, math.radians(6))
    legs["l"].rotation_euler = (-math.radians(f["ll"]), 0, 0)
    legs["r"].rotation_euler = (-math.radians(f["lr"]), 0, 0)
    bpy.context.view_layer.update()


def anchor(elev_deg, z):
    set_camera(elev_deg)
    bpy.context.view_layer.update()
    v = world_to_camera_view(sc, cam, Vector((0, 0, z)))
    return round(v.x * CW, 2), round((1 - v.y) * CH, 2)


def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


cols = len(FRAMES)
rows_n = len(ELEVATIONS) * DIRS
AW, AH = cols * CW, rows_n * CH
atlas = [bytearray(AW * 4) for _ in range(AH)]


def render(path, light):
    sh.light = light
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(path))
    px = img.pixels[:]
    bpy.data.images.remove(img)
    path.unlink()
    return px


cellpx = {}  # (row, col) -> list of (x, y, flat rgb, light)
lights = []
for ei, elev in enumerate(ELEVATIONS):
    set_camera(elev)
    for d in range(DIRS):
        for fi, (pose, k) in enumerate(FRAMES):
            set_pose(POSES[pose][k], d)
            path = TMP / f"e{ei}_d{d}_f{fi}.png"
            flat, lit = render(path, "FLAT"), render(path, "STUDIO")
            out = []
            for y in range(CH):
                src = (CH - 1 - y) * CW * 4
                for x in range(CW):
                    i = src + x * 4
                    if flat[i + 3] < 0.5:
                        continue
                    f = flat[i : i + 3]
                    m = max(f)
                    li = max(lit[i : i + 3]) / m if m > 0.05 else 1.0
                    out.append((x, y, f, li))
                    if m > 0.05:
                        lights.append(li)
            cellpx[(ei * DIRS + d, fi)] = out
lights.sort()
print("LIGHT_PCT", [round(lights[int(len(lights) * q)], 3) for q in (0.05, 0.25, 0.5, 0.75, 0.95)])
LO, TOP = lights[int(len(lights) * 0.05)], lights[int(len(lights) * 0.95)]  # shadowed faces 0.68, lit faces full colour
for (row, fi), out in cellpx.items():
    for x, y, f, li in out:
        k = min(1.0, max(0.68, 0.68 + 0.32 * (li - LO) / (TOP - LO)))
        o = (fi * CW + x) * 4
        atlas[row * CH + y][o : o + 4] = bytes(
            (round(f[0] * k * 255), round(f[1] * k * 255), round(f[2] * k * 255), 255)
        )
TMP.rmdir()
write_png(OUT / "players.png", AW, AH, atlas)

root.location = (0, 0, 0)
meta = {
    "image": "players.png",
    "cell": [CW, CH],
    "elevations": ELEVATIONS,
    "dirs": DIRS,
    "dirNote": "row = elevationIndex * dirs + dir; dir = player facing relative to the camera in 45 deg steps, 0 facing the camera, 2 facing screen right",
    "frames": [f"{p}:{k}" for p, k in FRAMES],
    "poses": {p: [i for i, (q, _) in enumerate(FRAMES) if q == p] for p in ORDER},
    "anchors": [{"foot": anchor(e, 0.0), "head": anchor(e, 2.0)} for e in ELEVATIONS],
    "masks": {"jersey": "red channel dominant", "shorts": "green channel dominant", "trim": "blue channel dominant"},
    "hash": hashlib.sha256((OUT / "players.png").read_bytes()).hexdigest()[:8],  # replay.js puts it on the image URL
    "generator": "scripts/sprites/build_sprites.py (Blender "
    + bpy.app.version_string
    + ", Workbench, procedural model)",
}
json.dump(meta, (OUT / "players.json").open("w"), indent=1)
print("SPRITES_OK", AW, "x", AH, "cells", cols * rows_n)
