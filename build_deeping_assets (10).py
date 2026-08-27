#!/usr/bin/env python3
"""Build The Deeping's authored GLB template library inside Blender.

Run with:
  blender -b --python tools/blender/build_deeping_assets.py -- --output public/models --variants 8

The game recolours material roles at runtime. Keep object/material names ending
in PRIMARY, SECONDARY, ACCENT or EMISSIVE when hand-editing these templates.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def cli_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="public/models")
    parser.add_argument("--variants", type=int, default=8, choices=range(1, 9), metavar="1-8")
    return parser.parse_args(argv)


ARGS = cli_args()
OUT = os.path.abspath(ARGS.output)
VARIANT_COUNT = ARGS.variants


def material(name, color, metallic, roughness, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if socket:
            socket.default_value = (*emission, 1)
        strength = bsdf.inputs.get("Emission Strength")
        if strength:
            strength.default_value = 2.4
    return mat


PRIMARY = material("DEEP_PRIMARY", (.23, .31, .40), .82, .19)
SECONDARY = material("DEEP_SECONDARY", (.075, .045, .025), .12, .48)
ACCENT = material("DEEP_ACCENT", (.08, .72, .83), .66, .12)
EMISSIVE = material("DEEP_EMISSIVE", (.03, .2, .26), .22, .12, (.08, .85, 1.0))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def assign(obj, mat, role):
    obj.name = f"{obj.name}_{role}"
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def bevel(obj, width=.04, segments=3):
    modifier = obj.modifiers.new("BEVELLED_EDGES", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def uv_sphere(name, loc, scale, mat=PRIMARY, role="PRIMARY", segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(smooth(obj), mat, role)


def ico(name, loc, scale, mat=ACCENT, role="ACCENT", subdivisions=3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return assign(obj, mat, role)


def cube(name, loc, scale, mat=PRIMARY, role="PRIMARY", bevel_width=.05):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, bevel_width, 4)
    return assign(smooth(obj), mat, role)


def cylinder(name, loc, radius, depth, mat=SECONDARY, role="SECONDARY", vertices=32, bevel_width=.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    bevel(obj, bevel_width, 3)
    return assign(smooth(obj), mat, role)


def cone(name, loc, radius1, radius2, depth, mat=PRIMARY, role="PRIMARY", vertices=32):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    bevel(obj, min(.035, max(.008, radius1 * .1)), 3)
    return assign(smooth(obj), mat, role)


def torus(name, loc, major, minor, mat=ACCENT, role="ACCENT", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    return assign(smooth(obj), mat, role)


def cylinder_between(name, start, end, radius, mat=SECONDARY, role="SECONDARY", vertices=24):
    start, end = Vector(start), Vector(end)
    delta = end - start
    obj = cylinder(name, (start + end) / 2, radius, delta.length, mat, role, vertices, radius * .16)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def prism_xz(name, outline, depth, mat=PRIMARY, role="PRIMARY", bevel_width=.035):
    count = len(outline)
    verts = [(x, -depth / 2, z) for x, z in outline] + [(x, depth / 2, z) for x, z in outline]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for i in range(count):
        nxt = (i + 1) % count
        faces.append((i, nxt, count + nxt, count + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel(obj, bevel_width, 4)
    return assign(smooth(obj), mat, role)


def curve_tube(name, points, radius, mat=PRIMARY, role="PRIMARY", cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    return assign(obj, mat, role)


def grip(z=-.75, length=1.15, radius=.14):
    cylinder("GRIP", (0, 0, z), radius, length, SECONDARY, "SECONDARY", 32, .025)
    for index in range(7):
        torus("GRIP_WRAP", (0, 0, z - length / 2 + .12 + index * (length - .24) / 6), radius * 1.04, .018, ACCENT if index in (0, 6) else SECONDARY, "ACCENT" if index in (0, 6) else "SECONDARY")


def build_sword(scale=1.0, dagger=False):
    blade_top = 2.1 if dagger else 3.25
    outline = [(-.22, .12), (-.17, blade_top - .35), (0, blade_top), (.17, blade_top - .35), (.22, .12)]
    prism_xz("FACETED_BLADE", outline, .16 if dagger else .2, PRIMARY, "PRIMARY", .045)
    prism_xz("BLADE_FULLER", [(-.035, .2), (-.022, blade_top - .42), (0, blade_top - .18), (.022, blade_top - .42), (.035, .2)], .225, EMISSIVE, "EMISSIVE", .012)
    guard_z = .02
    prism_xz("WINGED_GUARD", [(-1.08, guard_z + .08), (-.65, guard_z + .4), (-.2, guard_z + .18), (0, guard_z), (.2, guard_z + .18), (.65, guard_z + .4), (1.08, guard_z + .08), (.72, guard_z - .16), (0, guard_z - .08), (-.72, guard_z - .16)], .34, ACCENT, "ACCENT", .07)
    prism_xz("GUARD_INLAY", [(-.67, .12), (-.35, .27), (0, .08), (.35, .27), (.67, .12), (.36, -.02), (0, .03), (-.36, -.02)], .37, EMISSIVE, "EMISSIVE", .025)
    grip(-.69 if dagger else -.74, 1.18 if dagger else 1.32, .14)
    torus("RING_POMMEL", (0, 0, -1.43), .25, .095, PRIMARY, "PRIMARY")
    ico("POMMEL_GEM", (0, -.04, -1.43), (.12, .12, .12), EMISSIVE, "EMISSIVE", 2)
    root = bpy.data.objects.new("SWORD_ROOT", None)
    bpy.context.collection.objects.link(root)
    root.scale = (scale, scale, scale)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root


def build_axe():
    cylinder("HAFT", (0, 0, -.05), .105, 3.25, SECONDARY, "SECONDARY", 32, .03)
    prism_xz("AXE_HEAD", [(-.08, .95), (-.78, .82), (-1.17, 1.18), (-1.05, 1.83), (-.5, 2.08), (-.05, 1.92)], .42, PRIMARY, "PRIMARY", .07)
    prism_xz("AXE_EDGE", [(-1.17, 1.18), (-1.05, 1.83), (-.91, 1.73), (-1.02, 1.2)], .46, ACCENT, "ACCENT", .025)
    torus("AXE_COLLAR", (0, 0, .84), .15, .035, ACCENT, "ACCENT")
    torus("AXE_POMMEL", (0, 0, -1.7), .14, .045, PRIMARY, "PRIMARY")


def build_hammer():
    cylinder("HAFT", (0, 0, -.2), .12, 3.05, SECONDARY, "SECONDARY", 32, .03)
    cube("HAMMER_CORE", (0, 0, 1.28), (.68, .36, .38), PRIMARY, "PRIMARY", .1)
    cube("HAMMER_FACE_L", (-.78, 0, 1.28), (.2, .46, .48), ACCENT, "ACCENT", .06)
    cube("HAMMER_FACE_R", (.78, 0, 1.28), (.2, .46, .48), ACCENT, "ACCENT", .06)
    for x in (-.48, .48):
        ico("HAMMER_RUNE", (x, -.39, 1.28), (.12, .06, .12), EMISSIVE, "EMISSIVE", 2)


def build_spear():
    cylinder("SHAFT", (0, 0, -.05), .065, 3.8, SECONDARY, "SECONDARY", 28, .018)
    prism_xz("SPEAR_HEAD", [(-.28, 1.7), (-.17, 2.28), (0, 2.72), (.17, 2.28), (.28, 1.7), (0, 1.42)], .19, PRIMARY, "PRIMARY", .04)
    prism_xz("SPEAR_RUNE", [(-.035, 1.65), (-.025, 2.35), (0, 2.57), (.025, 2.35), (.035, 1.65)], .215, EMISSIVE, "EMISSIVE", .01)
    torus("SPEAR_COLLAR", (0, 0, 1.55), .11, .035, ACCENT, "ACCENT")


def build_scythe():
    curve_tube("SCYTHE_SHAFT", [(0, 0, -1.7), (.05, 0, -.35), (-.08, 0, 1.12)], .085, SECONDARY, "SECONDARY")
    prism_xz("SCYTHE_BLADE", [(-.05, .94), (.34, 1.44), (1.02, 1.86), (1.77, 1.98), (1.25, 1.65), (.52, 1.18), (.12, .86)], .17, PRIMARY, "PRIMARY", .045)
    prism_xz("SCYTHE_EDGE", [(1.77, 1.98), (1.25, 1.65), (.52, 1.18), (.68, 1.39), (1.35, 1.78)], .195, ACCENT, "ACCENT", .018)
    ico("SCYTHE_EYE", (.16, -.04, 1.12), (.17, .1, .17), EMISSIVE, "EMISSIVE", 2)


def build_bow():
    curve_tube("BOW_BODY", [(0, 0, -1.65), (-.42, 0, -1.1), (-.61, 0, -.35), (-.56, 0, .45), (-.35, 0, 1.15), (0, 0, 1.7)], .08, PRIMARY, "PRIMARY")
    curve_tube("BOW_STRING", [(0, 0, -1.65), (.22, 0, 0), (0, 0, 1.7)], .012, ACCENT, "ACCENT")
    cylinder("ARROW", (.18, -.05, .1), .025, 2.6, SECONDARY, "SECONDARY", 16, .008)
    cone("ARROW_HEAD", (.18, -.05, 1.52), .12, 0, .32, PRIMARY, "PRIMARY", 16)
    torus("BOW_GRIP", (-.55, 0, 0), .11, .035, SECONDARY, "SECONDARY")


def build_shield():
    cylinder("SHIELD_BODY", (0, 0, .15), 1.25, .32, PRIMARY, "PRIMARY", 64, .06)
    bpy.context.object.rotation_euler[0] = math.pi / 2
    torus("SHIELD_RIM", (0, -.18, .15), 1.09, .105, ACCENT, "ACCENT", (math.pi / 2, 0, 0))
    uv_sphere("SHIELD_BOSS", (0, -.31, .15), (.42, .18, .42), ACCENT, "ACCENT")
    for angle in [math.pi * i / 4 for i in range(8)]:
        ico("RIM_RIVET", (.86 * math.cos(angle), -.31, .15 + .86 * math.sin(angle)), (.055, .035, .055), EMISSIVE, "EMISSIVE", 2)


def build_cuirass():
    uv_sphere("BREASTPLATE", (0, 0, .3), (.82, .42, 1.1), PRIMARY, "PRIMARY")
    prism_xz("CHEST_PLATE", [(-.55, -.18), (-.72, .55), (-.43, 1.1), (0, .72), (.43, 1.1), (.72, .55), (.55, -.18), (0, -.55)], .47, ACCENT, "ACCENT", .065)
    for x in (-.82, .82):
        uv_sphere("PAULDRON", (x, 0, .72), (.38, .46, .34), PRIMARY, "PRIMARY")
    torus("WAIST_RIM", (0, 0, -.48), .61, .075, SECONDARY, "SECONDARY")
    for x in (-.36, 0, .36):
        cube("TASSET", (x, 0, -.83), (.16, .24, .34), SECONDARY, "SECONDARY", .04)


def build_cloak():
    outline = [(-.6, 1.25), (-.95, -.9), (-.5, -1.18), (0, -1.0), (.5, -1.18), (.95, -.9), (.6, 1.25)]
    prism_xz("CLOAK_FABRIC", outline, .16, PRIMARY, "PRIMARY", .055)
    curve_tube("CLOAK_FOLD_1", [(-.37, -.95, 0), (-.3, 0, .12), (-.25, 0, 1.05)], .035, ACCENT, "ACCENT")
    curve_tube("CLOAK_FOLD_2", [(0, -.92, .03), (.08, 0, .05), (0, 0, 1.08)], .03, SECONDARY, "SECONDARY")
    curve_tube("CLOAK_FOLD_3", [(.4, -.96, 0), (.3, 0, .1), (.26, 0, 1.05)], .035, ACCENT, "ACCENT")
    torus("CLOAK_CLASP", (0, -.12, 1.12), .18, .06, EMISSIVE, "EMISSIVE", (math.pi / 2, 0, 0))


def build_greaves():
    for x in (-.34, .34):
        cone("GREAVE", (x, 0, 0), .25, .34, 1.8, PRIMARY, "PRIMARY", 40)
        cube("KNEE", (x, -.12, .91), (.31, .25, .27), ACCENT, "ACCENT", .08)
        for z in (-.55, -.15, .28):
            torus("GREAVE_BAND", (x, 0, z), .26 + (z + .55) * .04, .035, SECONDARY, "SECONDARY")


def build_boots():
    for x in (-.38, .38):
        cube("BOOT_ANKLE", (x, 0, .15), (.28, .34, .65), PRIMARY, "PRIMARY", .1)
        cube("BOOT_FOOT", (x, -.22, -.52), (.32, .62, .22), SECONDARY, "SECONDARY", .11)
        cube("TOE_CAP", (x, -.76, -.5), (.34, .2, .2), ACCENT, "ACCENT", .09)
        for z in (-.1, .18, .46):
            torus("BOOT_STRAP", (x, 0, z), .3, .025, SECONDARY, "SECONDARY")


def build_helm():
    uv_sphere("HELM_SHELL", (0, 0, .35), (.74, .64, .82), PRIMARY, "PRIMARY")
    cube("VISOR", (0, -.61, .35), (.61, .10, .18), SECONDARY, "SECONDARY", .045)
    for x in (-.38, -.19, 0, .19, .38):
        cube("VISOR_SLIT", (x, -.72, .38), (.04, .025, .11), EMISSIVE, "EMISSIVE", .012)
    prism_xz("NASAL_GUARD", [(-.06, .48), (-.08, -.05), (0, -.25), (.08, -.05), (.06, .48)], .18, ACCENT, "ACCENT", .025)
    curve_tube("HELM_CREST", [(-.48, 0, .94), (0, 0, 1.36), (.48, 0, .94)], .08, ACCENT, "ACCENT")


def build_crown():
    torus("CROWN_BAND", (0, 0, 0), .7, .13, PRIMARY, "PRIMARY")
    for index in range(8):
        angle = math.tau * index / 8
        x, y = .69 * math.cos(angle), .69 * math.sin(angle)
        spike = cone("CROWN_POINT", (x, y, .42), .14, 0, .86, ACCENT, "ACCENT", 20)
        spike.rotation_euler[1] = .14 * math.cos(angle)
        ico("CROWN_GEM", (x * .97, y * .97, .22), (.09, .09, .13), EMISSIVE, "EMISSIVE", 2)


def build_ring():
    torus("RING_BAND", (0, 0, 0), .72, .16, PRIMARY, "PRIMARY")
    prism_xz("RING_SETTING", [(-.3, .58), (-.24, .9), (0, 1.08), (.24, .9), (.3, .58)], .38, ACCENT, "ACCENT", .065)
    ico("RING_GEM", (0, -.02, .86), (.25, .18, .32), EMISSIVE, "EMISSIVE", 3)


def build_earring():
    torus("EARRING_HOOP", (0, 0, .35), .58, .095, PRIMARY, "PRIMARY")
    cylinder("EARRING_CHAIN", (0, 0, -.42), .035, .62, SECONDARY, "SECONDARY", 16, .01)
    ico("EARRING_GEM", (0, 0, -.88), (.24, .16, .36), EMISSIVE, "EMISSIVE", 3)


def build_bracelet():
    torus("BRACELET_BAND", (0, 0, 0), .78, .22, PRIMARY, "PRIMARY")
    for index in range(8):
        angle = math.tau * index / 8
        ico("BRACELET_STONE", (.78 * math.cos(angle), .78 * math.sin(angle), .02), (.12, .12, .13), EMISSIVE if index % 2 else ACCENT, "EMISSIVE" if index % 2 else "ACCENT", 2)


def build_necklace():
    curve_tube("NECKLACE_CHAIN", [(-.95, 0, .8), (-.65, 0, .05), (0, 0, -.65), (.65, 0, .05), (.95, 0, .8)], .045, PRIMARY, "PRIMARY")
    torus("PENDANT_FRAME", (0, 0, -.92), .31, .075, ACCENT, "ACCENT", (math.pi / 2, 0, 0))
    ico("PENDANT_GEM", (0, -.035, -.92), (.21, .11, .31), EMISSIVE, "EMISSIVE", 3)


def build_trinket():
    ico("TRINKET_BODY", (0, 0, 0), (.82, .68, .82), PRIMARY, "PRIMARY", 3)
    torus("TRINKET_CAGE_A", (0, 0, 0), .72, .055, ACCENT, "ACCENT")
    torus("TRINKET_CAGE_B", (0, 0, 0), .72, .055, ACCENT, "ACCENT", (math.pi / 2, 0, 0))
    torus("TRINKET_CAGE_C", (0, 0, 0), .72, .055, ACCENT, "ACCENT", (0, math.pi / 2, 0))
    uv_sphere("TRINKET_CORE", (0, 0, 0), (.34, .34, .34), EMISSIVE, "EMISSIVE", 32, 18)


def limb(name, start, end, radius=.12, mat=PRIMARY, role="PRIMARY", vertices=24):
    cylinder_between(name, start, end, radius, mat, role, vertices)


def eyes(points):
    for point in points:
        uv_sphere("EYE", point, (.09, .05, .09), EMISSIVE, "EMISSIVE", 24, 12)


def creature(archetype):
    if archetype == "bat":
        # Bat gets its own silhouette instead of inheriting the beast's four-
        # legged body. Layered tufts break up the smooth primitive surfaces,
        # while separate wing bones and membranes keep it readable in motion.
        uv_sphere("FURRED_TORSO", (0, .08, .02), (.58, .34, .72), SECONDARY, "SECONDARY", 48, 28)
        uv_sphere("FURRED_HEAD", (0, -.03, .72), (.43, .36, .42), PRIMARY, "PRIMARY", 48, 28)
        uv_sphere("MUZZLE", (0, -.34, .62), (.28, .16, .2), SECONDARY, "SECONDARY", 32, 18)
        cone("EAR_L", (-.24, -.02, 1.19), .21, .035, .68, PRIMARY, "PRIMARY", 28)
        cone("EAR_R", (.24, -.02, 1.19), .21, .035, .68, PRIMARY, "PRIMARY", 28)
        eyes([(-.14, -.36, .78), (.14, -.36, .78)])
        for side in (-1, 1):
            shoulder=(side*.36, 0, .48)
            elbow=(side*1.12, .02, .63)
            wrist=(side*1.82, .03, .18)
            limb("WING_UPPER", shoulder, elbow, .075, PRIMARY, "PRIMARY")
            limb("WING_FOREARM", elbow, wrist, .06, PRIMARY, "PRIMARY")
            prism_xz("WING_MEMBRANE", [
                (side*.28, .46), (side*1.12, .63), (side*1.82, .18),
                (side*1.36, -.18), (side*.88, -.42), (side*.32, -.23)
            ], .075, ACCENT, "ACCENT", .024)
            for finger, z_drop in ((1.25, -.04), (1.52, -.16), (1.76, -.27)):
                limb("WING_FINGER", elbow, (side*finger, .04, z_drop), .025, ACCENT, "ACCENT", 16)
            limb("HIND_LEG", (side*.22, .04, -.38), (side*.3, -.02, -.92), .065, SECONDARY, "SECONDARY", 20)
            for toe in (-.08, .08):
                claw=cone("CLAW", (side*.3+toe, -.04, -1.04), .035, 0, .24, ACCENT, "ACCENT", 12)
                claw.rotation_euler[0]=math.pi
        for x, z, scale in ((-.22,.36,.2),(.02,.3,.25),(.25,.4,.18),(-.15,-.2,.22),(.16,-.24,.2)):
            tuft=cone("FUR_TUFT", (x, -.29, z), scale*.55, 0, scale, SECONDARY, "SECONDARY", 16)
            tuft.rotation_euler[0]=math.pi
        return
    if archetype in ("humanoid", "undead", "construct"):
        if archetype == "construct":
            cube("BODY", (0, 0, .3), (.55, .38, .72), PRIMARY, "PRIMARY", .12)
            cube("HEAD", (0, 0, 1.25), (.38, .34, .35), ACCENT, "ACCENT", .09)
        else:
            uv_sphere("BODY", (0, 0, .3), (.55, .38, .72), PRIMARY, "PRIMARY")
            uv_sphere("HEAD", (0, 0, 1.25), (.36, .32, .38), SECONDARY if archetype == "undead" else PRIMARY, "SECONDARY" if archetype == "undead" else "PRIMARY")
        limb("ARM_L", (-.42, 0, .65), (-.86, 0, -.05), .12)
        limb("ARM_R", (.42, 0, .65), (.86, 0, -.05), .12)
        limb("LEG_L", (-.22, 0, -.25), (-.3, 0, -1.2), .15, SECONDARY, "SECONDARY")
        limb("LEG_R", (.22, 0, -.25), (.3, 0, -1.2), .15, SECONDARY, "SECONDARY")
        eyes([(-.13, -.3, 1.3), (.13, -.3, 1.3)])
        if archetype == "undead":
            for z in (.05, .26, .47):
                cylinder_between("RIB", (-.38, -.37, z), (.38, -.37, z), .035, ACCENT, "ACCENT", 16)
        return
    if archetype in ("beast", "dragon"):
        uv_sphere("BODY", (-.12, 0, .05), (.8, .46, .52), PRIMARY, "PRIMARY")
        uv_sphere("HEAD", (.7, -.02, .45), (.42, .36, .38), PRIMARY, "PRIMARY")
        for x in (-.55, -.18, .28, .6):
            limb("LEG", (x, 0, -.18), (x, 0, -.92), .1, SECONDARY, "SECONDARY")
        eyes([(.61, -.34, .52), (.81, -.31, .52)])
        if archetype == "dragon":
            prism_xz("WING_L", [(-.1, .35), (-1.55, 1.2), (-1.2, .05), (-.55, -.28)], .11, ACCENT, "ACCENT", .03)
            prism_xz("WING_R", [(.1, .35), (1.55, 1.2), (1.2, .05), (.55, -.28)], .11, ACCENT, "ACCENT", .03)
        if archetype == "dragon":
            curve_tube("TAIL", [(-.65, 0, .05), (-1.15, 0, -.15), (-1.55, .1, .15)], .12, PRIMARY, "PRIMARY")
            for x in (-.5, -.15, .2):
                cone("SPINE", (x, 0, .62), .09, 0, .36, ACCENT, "ACCENT", 16)
        return
    if archetype == "serpent":
        points=[]
        for i in range(11):
            z=-1.35+i*.25
            points.append((math.sin(i*.62)*.38, math.cos(i*.53)*.13, z))
        curve_tube("SERPENT_BODY", points, .24, PRIMARY, "PRIMARY")
        uv_sphere("SERPENT_HEAD", points[-1], (.42, .34, .32), ACCENT, "ACCENT")
        eyes([(points[-1][0]-.14, -.28, points[-1][2]+.08), (points[-1][0]+.14, -.28, points[-1][2]+.08)])
        return
    if archetype in ("insect", "arachnid"):
        uv_sphere("ABDOMEN", (0, 0, -.25), (.58, .44, .65), PRIMARY, "PRIMARY")
        uv_sphere("THORAX", (0, 0, .48), (.4, .34, .4), ACCENT, "ACCENT")
        legs=4 if archetype == "arachnid" else 3
        for i in range(legs):
            z=.35-i*.32
            limb("LEG_L", (-.28, 0, z), (-1.05, (i-1.5)*.18, z-.2), .055, SECONDARY, "SECONDARY")
            limb("LEG_R", (.28, 0, z), (1.05, (1.5-i)*.18, z-.2), .055, SECONDARY, "SECONDARY")
        if archetype == "insect":
            uv_sphere("WING_L", (-.48, .16, .45), (.5, .08, .72), ACCENT, "ACCENT")
            uv_sphere("WING_R", (.48, .16, .45), (.5, .08, .72), ACCENT, "ACCENT")
        eyes([(-.14, -.31, .55), (0, -.34, .61), (.14, -.31, .55)])
        return
    if archetype in ("avian", "aquatic"):
        uv_sphere("BODY", (0, 0, 0), (.75 if archetype == "aquatic" else .5, .38, .58), PRIMARY, "PRIMARY")
        uv_sphere("HEAD", (.5 if archetype == "aquatic" else .12, -.02, .68), (.35, .3, .32), ACCENT, "ACCENT")
        if archetype == "avian":
            prism_xz("WING_L", [(-.16, .28), (-1.25, .82), (-.78, -.4), (-.25, -.12)], .12, SECONDARY, "SECONDARY", .035)
            prism_xz("WING_R", [(.16, .28), (1.25, .82), (.78, -.4), (.25, -.12)], .12, SECONDARY, "SECONDARY", .035)
            cone("BEAK", (.38, -.2, .7), .14, 0, .55, ACCENT, "ACCENT", 20).rotation_euler[0]=math.pi/2
        else:
            prism_xz("TAIL_FIN", [(-.65, .15), (-1.4, .78), (-1.2, 0), (-1.4, -.78), (-.65, -.15)], .15, SECONDARY, "SECONDARY", .035)
            prism_xz("DORSAL_FIN", [(-.15, .35), (0, 1.0), (.25, .32)], .12, ACCENT, "ACCENT", .025)
        eyes([(.48, -.3, .76)])
        return
    if archetype in ("ooze", "wraith", "elemental"):
        if archetype == "wraith":
            cone("WRAITH_BODY", (0, 0, -.1), .78, .3, 2.1, PRIMARY, "PRIMARY", 48)
        else:
            uv_sphere("CORE_BODY", (0, 0, 0), (.82, .65, .92), PRIMARY, "PRIMARY")
        for index in range(7 if archetype == "elemental" else 3):
            angle=math.tau*index/(7 if archetype == "elemental" else 3)
            ico("ENERGY_SHARD", (.72*math.cos(angle), .25*math.sin(angle), .25+.55*math.sin(angle)), (.16,.12,.36), EMISSIVE, "EMISSIVE", 2)
        eyes([(-.15, -.56, .3), (.15, -.56, .3)])
        return
    if archetype == "plant":
        cylinder("TRUNK", (0, 0, -.15), .28, 2.2, SECONDARY, "SECONDARY", 32, .04)
        for index in range(9):
            angle=math.tau*index/9
            uv_sphere("PETAL", (.55*math.cos(angle), .1*math.sin(angle), .82+.45*math.sin(angle)), (.42,.18,.2), PRIMARY if index%2 else ACCENT, "PRIMARY" if index%2 else "ACCENT")
        eyes([(-.12, -.28, .1), (.12, -.28, .1)])
        return
    if archetype == "mimic":
        cube("CHEST", (0, 0, -.25), (.82, .52, .48), PRIMARY, "PRIMARY", .1)
        cube("LID", (0, 0, .45), (.86, .56, .22), ACCENT, "ACCENT", .1)
        for x in (-.55,-.32,-.1,.1,.32,.55):
            cone("TOOTH", (x, -.56, .08), .07, 0, .28, EMISSIVE, "EMISSIVE", 12)
        eyes([(-.28, -.55, .48), (.28, -.55, .48)])
        return
    if archetype == "swarm":
        for index in range(24):
            angle=index*2.399963
            radius=.18+.065*index
            ico("SWARM_BODY", (math.cos(angle)*radius, math.sin(angle)*radius*.4, -.9+index*.075), (.11,.07,.15), PRIMARY if index%2 else ACCENT, "PRIMARY" if index%2 else "ACCENT", 2)
        return
    # aberration
    uv_sphere("ABERRANT_BODY", (0, 0, 0), (.76, .61, .82), PRIMARY, "PRIMARY")
    for index in range(8):
        angle=math.tau*index/8
        curve_tube("TENTACLE", [(.35*math.cos(angle), .2*math.sin(angle), -.4), (1.0*math.cos(angle), .3*math.sin(angle), -.75), (1.35*math.cos(angle+.25), .35*math.sin(angle+.25), -1.15)], .075, SECONDARY, "SECONDARY")
    eyes([(-.2, -.56, .2), (0, -.61, .35), (.2, -.56, .2)])


GEAR_BUILDERS = {
    "sword": build_sword, "dagger": lambda: build_sword(.78, True), "axe": build_axe,
    "hammer": build_hammer, "spear": build_spear, "scythe": build_scythe,
    "bow": build_bow, "shield": build_shield, "cuirass": build_cuirass,
    "cloak": build_cloak, "greaves": build_greaves, "boots": build_boots,
    "helm": build_helm, "crown": build_crown, "ring": build_ring,
    "earring": build_earring, "bracelet": build_bracelet,
    "necklace": build_necklace, "trinket": build_trinket,
}
ENEMY_ARCHETYPES = ["humanoid", "beast", "dragon", "serpent", "insect", "arachnid", "avian", "aquatic", "ooze", "undead", "wraith", "construct", "plant", "elemental", "aberration", "mimic", "swarm", "bat"]
PET_FORMS = {"quadruped":"beast", "avian":"avian", "crawler":"insect", "aquatic":"aquatic", "wisp":"wraith", "mimic":"mimic", "construct":"construct", "bat":"bat"}


def variant_grip(z=-.72, length=1.15, radius=.13):
    cylinder("GRIP", (0, 0, z), radius, length, SECONDARY, "SECONDARY", 28, .022)
    torus("POMMEL", (0, 0, z - length / 2 - .12), radius * 1.35, .045, ACCENT, "ACCENT")


def build_gear_variant(name, variant):
    """Build a genuinely different silhouette for each gear family.

    v2 and v3 are not ornament passes over the base mesh. Each branch starts an
    independent construction: sabre/greatsword, wolf/boar, signet/twin-stone,
    and so on. Material-role names remain stable for runtime recolouring.
    """
    if name == "sword":
        if variant == 2:  # sabre
            curve_tube("CURVED_SABRE_BLADE", [(0,0,.05),(.06,0,.9),(.22,0,1.8),(.55,0,2.75)], .16, PRIMARY, "PRIMARY")
            curve_tube("SABRE_EDGE", [(.08,-.12,.08),(.16,-.12,1.0),(.34,-.12,1.9),(.64,-.12,2.78)], .035, ACCENT, "ACCENT")
            prism_xz("KNUCKLE_GUARD", [(-.7,.12),(-.42,.36),(.25,.12),(.44,-.35),(.18,-.55),(.02,-.12)], .28, ACCENT, "ACCENT", .045)
            variant_grip(-.7,1.15,.13)
        else:  # greatsword
            prism_xz("GREATSWORD_BLADE", [(-.34,.02),(-.42,2.55),(0,3.35),(.42,2.55),(.34,.02)], .28, PRIMARY, "PRIMARY", .055)
            prism_xz("GREATSWORD_FULLER", [(-.06,.12),(-.05,2.48),(0,2.95),(.05,2.48),(.06,.12)], .31, EMISSIVE, "EMISSIVE", .012)
            cylinder_between("CROSSGUARD",(-1.18,0,.0),(1.18,0,.0),.12,ACCENT,"ACCENT",28)
            variant_grip(-.82,1.45,.16)
    elif name == "dagger":
        if variant == 2:  # kukri
            prism_xz("KUKRI_BLADE", [(-.14,.1),(-.35,.75),(-.55,1.55),(-.28,2.25),(.12,1.55),(.24,.55),(.18,.1)], .22, PRIMARY, "PRIMARY", .045)
            prism_xz("KUKRI_EDGE", [(-.55,1.55),(-.28,2.25),(-.14,1.5),(-.28,.78)], .25, ACCENT, "ACCENT", .018)
            cylinder_between("KUKRI_GUARD",(-.5,0,.02),(.5,0,.02),.1,ACCENT,"ACCENT",20)
            variant_grip(-.64,1.0,.14)
        else:  # stiletto
            prism_xz("STILETTO_NEEDLE", [(-.11,.08),(0,2.45),(.11,.08)], .16, PRIMARY, "PRIMARY", .025)
            prism_xz("STILETTO_RIDGE", [(-.025,.15),(0,2.18),(.025,.15)], .2, EMISSIVE, "EMISSIVE", .008)
            torus("STILETTO_GUARD",(0,0,.0),.43,.085,ACCENT,"ACCENT")
            variant_grip(-.6,.95,.11)
    elif name == "axe":
        cylinder("HAFT",(0,0,-.05),.1,3.4,SECONDARY,"SECONDARY",28,.025)
        if variant == 2:  # bearded axe
            prism_xz("BEARDED_HEAD", [(-.04,.85),(-.62,1.02),(-1.16,1.52),(-1.04,2.18),(-.62,2.42),(-.32,1.66),(-.05,1.5)], .38, PRIMARY, "PRIMARY", .055)
            prism_xz("BEARD_EDGE", [(-1.16,1.52),(-1.04,2.18),(-.9,2.05),(-.98,1.5)], .42, ACCENT, "ACCENT", .018)
        else:  # double axe
            prism_xz("DOUBLE_AXE_HEAD", [(-.05,1.05),(-.62,1.18),(-1.0,1.62),(-.7,2.12),(-.08,2.0),(.08,2.0),(.7,2.12),(1.0,1.62),(.62,1.18),(.05,1.05)], .46, PRIMARY, "PRIMARY", .065)
            for x in (-.88,.88): ico("AXE_RUNE",(x,-.25,1.63),(.12,.07,.18),EMISSIVE,"EMISSIVE",2)
    elif name == "hammer":
        cylinder("HAFT",(0,0,-.25),.13,3.15,SECONDARY,"SECONDARY",30,.028)
        if variant == 2:  # round maul
            head=cylinder("MAUL_HEAD",(0,0,1.28),.52,1.65,PRIMARY,"PRIMARY",48,.065); head.rotation_euler[1]=math.pi/2
            for x in (-.86,.86): cylinder("MAUL_FACE",(x,0,1.28),.58,.12,ACCENT,"ACCENT",48,.025).rotation_euler[1]=math.pi/2
        else:  # war pick
            cube("PICK_HAMMER_FACE",(-.48,0,1.3),(.42,.42,.45),PRIMARY,"PRIMARY",.08)
            pick=cone("WAR_PICK",(.65,0,1.3),.34,0,1.5,ACCENT,"ACCENT",32); pick.rotation_euler[1]=math.pi/2
            ico("PICK_EYE",(0,-.43,1.3),(.15,.08,.15),EMISSIVE,"EMISSIVE",2)
    elif name == "spear":
        cylinder("SHAFT",(0,0,-.12),.065,4.0,SECONDARY,"SECONDARY",26,.018)
        if variant == 2:  # trident
            for x,height in ((-.34,2.35),(0,2.7),(.34,2.35)):
                prism_xz("TRIDENT_TINE",[(x-.11,1.55),(x-.08,height-.3),(x,height),(x+.08,height-.3),(x+.11,1.55)],.18,PRIMARY,"PRIMARY",.03)
            cylinder_between("TRIDENT_BAR",(-.48,0,1.58),(.48,0,1.58),.08,ACCENT,"ACCENT",22)
        else:  # glaive
            prism_xz("GLAIVE_BLADE", [(-.04,1.35),(.28,1.62),(.72,2.18),(.55,2.78),(.22,2.42),(.05,1.82)], .2, PRIMARY, "PRIMARY", .045)
            prism_xz("GLAIVE_EDGE",[(.72,2.18),(.55,2.78),(.42,2.52),(.56,2.15)],.23,ACCENT,"ACCENT",.015)
            torus("GLAIVE_COLLAR",(0,0,1.45),.12,.04,EMISSIVE,"EMISSIVE")
    elif name == "scythe":
        curve_tube("SCYTHE_SHAFT",[(0,0,-1.75),(.04,0,-.25),(0,0,1.28)],.085,SECONDARY,"SECONDARY")
        if variant == 2:  # war scythe
            prism_xz("WAR_SCYTHE_BLADE",[(-.1,1.15),(.12,1.55),(.35,2.85),(.08,3.2),(-.2,1.65)],.18,PRIMARY,"PRIMARY",.04)
            prism_xz("WAR_SCYTHE_EDGE",[(.35,2.85),(.08,3.2),(.02,2.82),(.2,2.3)],.21,ACCENT,"ACCENT",.014)
        else:  # double crescent
            prism_xz("UPPER_CRESCENT",[(-.08,1.15),(.45,1.55),(1.35,1.98),(1.75,1.8),(.9,1.35),(.18,1.02)],.18,PRIMARY,"PRIMARY",.04)
            prism_xz("LOWER_CRESCENT",[(.04,.98),(-.38,.62),(-1.05,.45),(-1.34,.68),(-.72,.85),(-.12,1.2)],.18,ACCENT,"ACCENT",.04)
            ico("REAPER_JOINT",(0,-.05,1.1),(.2,.12,.2),EMISSIVE,"EMISSIVE",2)
    elif name == "bow":
        if variant == 2:  # recurve
            curve_tube("RECURVE_BOW",[(.12,0,-1.75),(-.18,0,-1.48),(-.55,0,-.68),(-.5,0,.5),(-.15,0,1.45),(.15,0,1.75)],.09,PRIMARY,"PRIMARY")
            curve_tube("RECURVE_STRING",[(.12,0,-1.75),(.18,0,0),(.15,0,1.75)],.012,ACCENT,"ACCENT")
            cube("RECURVE_GRIP",(-.5,0,-.02),(.12,.13,.35),SECONDARY,"SECONDARY",.035)
        else:  # compound
            for side in (-1,1):
                curve_tube("COMPOUND_LIMB",[(0,0,side*.2),(-.34,0,side*.72),(-.26,0,side*1.48)],.1,PRIMARY,"PRIMARY")
                torus("CAM",(-.26,0,side*1.62),.24,.055,ACCENT,"ACCENT")
            cube("COMPOUND_RISER",(0,0,0),(.16,.15,.58),SECONDARY,"SECONDARY",.045)
            curve_tube("COMPOUND_STRING",[(-.26,0,-1.62),(.22,0,0),(-.26,0,1.62)],.014,EMISSIVE,"EMISSIVE")
    elif name == "shield":
        if variant == 2:  # kite
            prism_xz("KITE_SHIELD",[(-.78,1.18),(-1.02,.35),(-.72,-.68),(0,-1.62),(.72,-.68),(1.02,.35),(.78,1.18),(0,1.45)],.34,PRIMARY,"PRIMARY",.075)
            prism_xz("KITE_RIDGE",[(-.1,1.18),(-.12,-1.1),(0,-1.4),(.12,-1.1),(.1,1.18)],.39,ACCENT,"ACCENT",.025)
            uv_sphere("KITE_BOSS",(0,-.22,.1),(.34,.16,.34),EMISSIVE,"EMISSIVE")
        else:  # tower
            cube("TOWER_SHIELD",(0,0,0),(.92,.22,1.35),PRIMARY,"PRIMARY",.14)
            for x in (-.67,0,.67): cube("TOWER_RIB",(x,-.25,0),(.08,.07,1.15),ACCENT,"ACCENT",.025)
            for z in (-.9,.9): cylinder_between("TOWER_BAR",(-.78,-.28,z),(.78,-.28,z),.065,SECONDARY,"SECONDARY",20)
    elif name == "cuirass":
        if variant == 2:  # brigandine
            prism_xz("BRIGANDINE_BODY",[(-.72,1.05),(-.88,.35),(-.64,-1.02),(0,-1.28),(.64,-1.02),(.88,.35),(.72,1.05)],.48,SECONDARY,"SECONDARY",.075)
            for row in range(4):
                for col in range(5):
                    cube("BRIGANDINE_PLATE",(-.56+col*.28,-.28,.72-row*.42),(.12,.05,.17),PRIMARY,"PRIMARY",.02)
                    ico("BRIGANDINE_RIVET",(-.56+col*.28,-.35,.72-row*.42),(.025,.018,.025),ACCENT,"ACCENT",1)
        else:  # articulated plate
            uv_sphere("PLATE_CHEST",(0,0,.3),(.8,.43,1.02),PRIMARY,"PRIMARY")
            for z,scale in ((.62,.72),(.25,.76),(-.12,.7),(-.48,.61)): cube("ARTICULATED_LAME",(0,-.4,z),(scale,.07,.16),ACCENT if z>.5 else PRIMARY,"ACCENT" if z>.5 else "PRIMARY",.035)
            for x in (-.9,.9): uv_sphere("LAYERED_PAULDRON",(x,0,.72),(.46,.5,.38),ACCENT,"ACCENT")
    elif name == "cloak":
        if variant == 2:  # hooded mantle
            prism_xz("HOODED_MANTLE",[(-.72,.82),(-1.02,-1.2),(-.35,-1.5),(0,-1.3),(.35,-1.5),(1.02,-1.2),(.72,.82)],.22,PRIMARY,"PRIMARY",.06)
            torus("HOOD",(0,0,1.05),.46,.18,SECONDARY,"SECONDARY",(math.pi/2,0,0))
            curve_tube("MANTLE_TRIM",[(-.98,0,-1.18),(0,0,-1.3),(.98,0,-1.18)],.055,ACCENT,"ACCENT")
        else:  # split travelling coat
            prism_xz("COAT_LEFT",[(-.72,1.15),(-.95,-1.3),(-.2,-1.58),(-.06,.4)],.2,PRIMARY,"PRIMARY",.055)
            prism_xz("COAT_RIGHT",[(.72,1.15),(.95,-1.3),(.2,-1.58),(.06,.4)],.2,SECONDARY,"SECONDARY",.055)
            for z in (.7,.3,-.1): ico("COAT_BUTTON",(0,-.22,z),(.07,.04,.07),EMISSIVE,"EMISSIVE",2)
    elif name == "greaves":
        for x in (-.36,.36):
            if variant == 2:  # segmented plate
                for part,z in enumerate((-.62,-.22,.18,.58)):
                    cube("SEGMENTED_GREAVE",(x,0,z),(.28-part*.015,.25,.22),PRIMARY if part%2 else ACCENT,"PRIMARY" if part%2 else "ACCENT",.055)
                prism_xz("KNEE_WING",[(x-.35,.72),(x,.98),(x+.35,.72),(x,.5)],.34,ACCENT,"ACCENT",.05)
            else:  # wrapped field greave
                cone("FIELD_GREAVE",(x,0,0),.23,.34,1.78,SECONDARY,"SECONDARY",36)
                for z in (-.62,-.35,-.08,.19,.46): torus("WRAP",(x,0,z),.29,.035,PRIMARY,"PRIMARY")
                uv_sphere("ROUND_KNEE",(x,-.2,.86),(.32,.22,.3),ACCENT,"ACCENT")
    elif name == "boots":
        for x in (-.38,.38):
            if variant == 2:  # sabaton
                cube("SABATON_ANKLE",(x,0,.18),(.29,.33,.62),PRIMARY,"PRIMARY",.08)
                for part in range(4): cube("SABATON_TOE",(x,-.42-part*.18,-.48-part*.015),(.32-part*.025,.2,.16),ACCENT if part==0 else PRIMARY,"ACCENT" if part==0 else "PRIMARY",.045)
            else:  # fur-lined boot
                cube("FUR_BOOT",(x,-.04,-.02),(.32,.42,.76),SECONDARY,"SECONDARY",.11)
                torus("FUR_CUFF",(x,0,.72),.39,.12,ACCENT,"ACCENT")
                cube("FUR_BOOT_FOOT",(x,-.5,-.68),(.34,.58,.22),PRIMARY,"PRIMARY",.1)
    elif name == "helm":
        if variant == 2:  # sallet
            uv_sphere("SALLET_SHELL",(0,.05,.35),(.78,.67,.78),PRIMARY,"PRIMARY")
            prism_xz("SALLET_TAIL",[(-.7,.28),(-.92,-.28),(0,-.68),(.92,-.28),(.7,.28)],.5,PRIMARY,"PRIMARY",.06)
            cube("SALLET_VISOR",(0,-.68,.42),(.64,.08,.18),ACCENT,"ACCENT",.035)
            cylinder_between("SALLET_SLIT",(-.48,-.78,.44),(.48,-.78,.44),.025,EMISSIVE,"EMISSIVE",16)
        else:  # open barbute
            uv_sphere("BARBUTE_SHELL",(0,0,.38),(.7,.62,.82),PRIMARY,"PRIMARY")
            prism_xz("CHEEK_L",[(-.62,.55),(-.58,-.52),(-.24,-.82),(-.12,.2)],.24,ACCENT,"ACCENT",.045)
            prism_xz("CHEEK_R",[(.62,.55),(.58,-.52),(.24,-.82),(.12,.2)],.24,ACCENT,"ACCENT",.045)
            curve_tube("BARBUTE_PLUME",[(0,0,1.1),(.15,0,1.55),(.42,0,1.82)],.11,EMISSIVE,"EMISSIVE")
    elif name == "crown":
        if variant == 2:  # circlet
            torus("ROYAL_CIRCLET",(0,0,0),.74,.1,PRIMARY,"PRIMARY")
            for x,z in ((-.45,.18),(0,.34),(.45,.18)): ico("CIRCLET_GEM",(x,-.7,z),(.13,.07,.18 if x else .24),EMISSIVE,"EMISSIVE",2)
            curve_tube("CIRCLET_ARCH",[(-.55,-.05,.05),(0,-.05,.48),(.55,-.05,.05)],.055,ACCENT,"ACCENT")
        else:  # high crown
            torus("HIGH_CROWN_BAND",(0,0,-.2),.73,.14,PRIMARY,"PRIMARY")
            for index in range(6):
                angle=math.tau*index/6;x,y=.68*math.cos(angle),.68*math.sin(angle)
                prism_xz("FLEUR_POINT",[(x-.12,-.12),(x-.2,.55),(x,1.18),(x+.2,.55),(x+.12,-.12)],.2,ACCENT,"ACCENT",.035)
            ico("CROWN_HEART",(0,-.72,.32),(.22,.08,.28),EMISSIVE,"EMISSIVE",3)
    elif name == "ring":
        torus("RING_BAND",(0,0,0),.73,.14,PRIMARY,"PRIMARY")
        if variant == 2:  # signet
            cube("SIGNET_FACE",(0,-.03,.78),(.36,.24,.18),ACCENT,"ACCENT",.065)
            prism_xz("SIGNET_MARK",[(-.14,.7),(0,.95),(.14,.7),(0,.62)],.5,EMISSIVE,"EMISSIVE",.015)
        else:  # twin stone
            for x in (-.24,.24):
                ico("TWIN_STONE",(x,-.02,.78),(.22,.16,.29),EMISSIVE if x<0 else ACCENT,"EMISSIVE" if x<0 else "ACCENT",3)
                cylinder_between("STONE_ARM",(x*.5,0,.5),(x,-.02,.7),.055,PRIMARY,"PRIMARY",16)
    elif name == "earring":
        if variant == 2:  # ear cuff
            torus("EAR_CUFF",(0,0,.2),.62,.16,PRIMARY,"PRIMARY")
            for angle in (-.65,0,.65): ico("CUFF_STUD",(.56*math.sin(angle),-.12,.2+.56*math.cos(angle)),(.11,.07,.11),ACCENT,"ACCENT",2)
        else:  # chandelier
            torus("CHANDELIER_TOP",(0,0,.72),.32,.075,PRIMARY,"PRIMARY")
            cylinder_between("DROP_L",(-.22,0,.48),(-.38,0,-.45),.035,SECONDARY,"SECONDARY",14)
            cylinder_between("DROP_C",(0,0,.42),(0,0,-.75),.035,SECONDARY,"SECONDARY",14)
            cylinder_between("DROP_R",(.22,0,.48),(.38,0,-.45),.035,SECONDARY,"SECONDARY",14)
            for x,z in ((-.38,-.58),(0,-.9),(.38,-.58)): ico("DROP_GEM",(x,0,z),(.18,.11,.26),EMISSIVE,"EMISSIVE",3)
    elif name == "bracelet":
        if variant == 2:  # solid cuff
            torus("SOLID_CUFF",(0,0,0),.75,.28,PRIMARY,"PRIMARY")
            cube("CUFF_FACE",(0,-.7,.08),(.46,.24,.28),ACCENT,"ACCENT",.08)
            ico("CUFF_SEAL",(0,-.93,.08),(.2,.06,.2),EMISSIVE,"EMISSIVE",2)
        else:  # linked chain
            for index in range(10):
                angle=math.tau*index/10
                torus("CHAIN_LINK",(.74*math.cos(angle),.74*math.sin(angle),0),.16,.045,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",(math.pi/2,angle,0))
            ico("CHAIN_CHARM",(0,-.92,-.18),(.22,.12,.28),EMISSIVE,"EMISSIVE",3)
    elif name == "necklace":
        if variant == 2:  # torque
            curve_tube("OPEN_TORQUE",[(-.86,0,.58),(-.72,0,-.2),(0,0,-.72),(.72,0,-.2),(.86,0,.58)],.12,PRIMARY,"PRIMARY")
            for x in (-.86,.86): ico("TORQUE_END",(x,0,.62),(.22,.15,.24),ACCENT,"ACCENT",3)
        else:  # layered locket
            curve_tube("OUTER_CHAIN",[(-1.0,0,.8),(-.7,0,-.15),(0,0,-.88),(.7,0,-.15),(1.0,0,.8)],.04,PRIMARY,"PRIMARY")
            curve_tube("INNER_CHAIN",[(-.75,-.04,.78),(-.48,-.04,.05),(0,-.04,-.45),(.48,-.04,.05),(.75,-.04,.78)],.035,ACCENT,"ACCENT")
            uv_sphere("LOCKET",(0,-.05,-1.05),(.32,.12,.4),EMISSIVE,"EMISSIVE",32,16)
    elif name == "trinket":  # lantern / idol
        if variant == 2:
            cube("LANTERN_FRAME",(0,0,0),(.58,.48,.82),PRIMARY,"PRIMARY",.08)
            for x in (-.48,.48):
                for z in (-.68,.68): cylinder_between("LANTERN_RAIL",(x,-.52,z),(x,.52,z),.035,ACCENT,"ACCENT",14)
            uv_sphere("LANTERN_FLAME",(0,-.52,0),(.28,.1,.46),EMISSIVE,"EMISSIVE",28,14)
            torus("LANTERN_HANDLE",(0,0,1.0),.42,.055,SECONDARY,"SECONDARY",(math.pi/2,0,0))
        else:
            cube("IDOL_BODY",(0,0,-.15),(.48,.35,.65),PRIMARY,"PRIMARY",.09)
            uv_sphere("IDOL_HEAD",(0,-.02,.72),(.45,.38,.4),ACCENT,"ACCENT",32,18)
            eyes([(-.15,-.37,.78),(.15,-.37,.78)])
            for x in (-.36,0,.36): prism_xz("IDOL_RUNE",[(x-.05,-.55),(x,.1),(x+.05,-.55)],.75,EMISSIVE,"EMISSIVE",.01)


def build_gear_expanded_variant(name, variant):
    """Build v4-v6 as new objects, never decoration passes over v1-v3."""
    if variant not in (4, 5, 6):
        raise ValueError(f"Expanded gear variant must be 4-6, got {variant}")

    if name == "sword":
        if variant == 4:  # broad falchion
            prism_xz("FALCHION_BLADE", [(-.2,.08),(-.32,1.65),(-.55,2.55),(-.32,3.0),(.18,2.72),(.28,.08)], .27, PRIMARY, "PRIMARY", .055)
            prism_xz("FALCHION_EDGE", [(-.55,2.55),(-.32,3.0),(.18,2.72),(.05,2.58),(-.36,2.46)], .3, ACCENT, "ACCENT", .018)
            prism_xz("FALCHION_GUARD", [(-.82,.18),(-.42,.34),(0,.08),(.5,-.08),(.78,.04),(.38,-.24),(-.45,-.1)], .34, ACCENT, "ACCENT", .05)
            variant_grip(-.72,1.2,.14)
        elif variant == 5:  # needle estoc
            prism_xz("ESTOC_BLADE", [(-.1,.08),(0,3.45),(.1,.08)], .2, PRIMARY, "PRIMARY", .025)
            prism_xz("ESTOC_RIDGE", [(-.022,.16),(0,3.16),(.022,.16)], .25, EMISSIVE, "EMISSIVE", .007)
            cylinder_between("ESTOC_CROSSGUARD",(-1.05,0,.02),(1.05,0,.02),.075,ACCENT,"ACCENT",24)
            torus("ESTOC_SIDE_RING",(.52,0,-.08),.32,.055,ACCENT,"ACCENT",(math.pi/2,0,0))
            variant_grip(-.78,1.34,.11)
        else:  # flamberge
            outline=[(-.2,.06),(-.34,.55),(-.17,.92),(-.38,1.32),(-.18,1.72),(-.4,2.15),(-.16,2.55),(0,3.18),(.16,2.55),(.4,2.15),(.18,1.72),(.38,1.32),(.17,.92),(.34,.55),(.2,.06)]
            prism_xz("FLAMBERGE_BLADE",outline,.28,PRIMARY,"PRIMARY",.045)
            cylinder_between("FLAMBERGE_GUARD",(-1.18,0,.0),(1.18,0,.0),.105,ACCENT,"ACCENT",28)
            for x in (-.78,.78): torus("FLAMBERGE_RING",(x,0,-.1),.28,.05,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            variant_grip(-.86,1.48,.15)

    elif name == "dagger":
        if variant == 4:  # punch dagger
            prism_xz("PUNCH_BLADE", [(-.22,.05),(-.3,1.35),(0,2.0),(.3,1.35),(.22,.05)], .28, PRIMARY, "PRIMARY", .045)
            cylinder_between("PUNCH_HANDLE",(-.72,0,-.28),(.72,0,-.28),.13,SECONDARY,"SECONDARY",28)
            for x in (-.66,.66): cube("PUNCH_GUARD",(x,0,.02),(.12,.2,.32),ACCENT,"ACCENT",.045)
        elif variant == 5:  # rondel dagger
            prism_xz("RONDEL_BLADE", [(-.13,.05),(0,2.4),(.13,.05)], .22, PRIMARY, "PRIMARY", .03)
            cylinder("RONDEL_GUARD",(0,0,-.03),.46,.12,ACCENT,"ACCENT",48,.025)
            variant_grip(-.62,.92,.11)
            cylinder("RONDEL_POMMEL",(0,0,-1.12),.31,.15,ACCENT,"ACCENT",40,.025)
        else:  # kris
            outline=[(-.12,.04),(-.32,.42),(-.1,.78),(-.36,1.15),(-.12,1.52),(-.3,1.9),(0,2.34),(.3,1.9),(.12,1.52),(.36,1.15),(.1,.78),(.32,.42),(.12,.04)]
            prism_xz("KRIS_BLADE",outline,.24,PRIMARY,"PRIMARY",.035)
            prism_xz("KRIS_GUARD",[(-.72,.06),(-.32,.26),(0,.02),(.32,.26),(.72,.06),(.35,-.15),(-.35,-.15)],.3,ACCENT,"ACCENT",.04)
            variant_grip(-.64,1.0,.125)

    elif name == "axe":
        cylinder("AXE_SHAFT",(0,0,-.08),.1,3.55,SECONDARY,"SECONDARY",28,.025)
        if variant == 4:  # crescent axe
            prism_xz("CRESCENT_HEAD", [(-.08,1.05),(-.62,1.0),(-1.2,1.38),(-1.38,1.95),(-1.05,2.5),(-.48,2.68),(-.72,2.22),(-.78,1.55),(-.08,1.42)], .42, PRIMARY, "PRIMARY", .06)
            curve_tube("CRESCENT_EDGE",[(-1.18,1.4,0),(-1.42,1.95,0),(-1.08,2.48,0)],.045,ACCENT,"ACCENT")
        elif variant == 5:  # poleaxe
            prism_xz("POLEAXE_BLADE", [(-.05,1.35),(-.72,1.48),(-1.05,1.98),(-.72,2.38),(-.08,2.25)], .36, PRIMARY, "PRIMARY", .05)
            pick=cone("POLEAXE_PICK",(.72,0,1.88),.24,0,1.45,ACCENT,"ACCENT",28);pick.rotation_euler[1]=math.pi/2
            cone("POLEAXE_SPIKE",(0,0,2.65),.14,0,.82,EMISSIVE,"EMISSIVE",20)
        else:  # compact tomahawk
            cylinder("TOMAHAWK_WRAP",(0,0,-.55),.14,1.2,ACCENT,"ACCENT",24,.025)
            prism_xz("TOMAHAWK_HEAD", [(-.04,.82),(-.45,.95),(-.98,1.34),(-.82,1.85),(-.25,1.98),(-.04,1.7),(.55,1.48),(.3,1.2)], .34, PRIMARY, "PRIMARY", .055)
            prism_xz("TOMAHAWK_EDGE",[(-.98,1.34),(-.82,1.85),(-.68,1.72),(-.82,1.36)],.38,EMISSIVE,"EMISSIVE",.015)

    elif name == "hammer":
        cylinder("HAMMER_SHAFT",(0,0,-.28),.125,3.2,SECONDARY,"SECONDARY",30,.03)
        if variant == 4:  # bell hammer
            bell=cone("BELL_HEAD",(-.4,0,1.28),.52,.3,1.0,PRIMARY,"PRIMARY",48);bell.rotation_euler[1]=math.pi/2
            cylinder("BELL_FACE",(-.9,0,1.28),.58,.12,ACCENT,"ACCENT",48,.025).rotation_euler[1]=math.pi/2
            torus("BELL_RUNE",(-.94,-.08,1.28),.29,.045,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
        elif variant == 5:  # lucerne hammer
            cube("LUCERNE_CORE",(0,0,1.32),(.42,.34,.34),PRIMARY,"PRIMARY",.06)
            for y in (-.24,.24):
                for z in (1.05,1.58):
                    spike=cone("LUCERNE_BEAK",(-.62,y,z),.11,0,.86,ACCENT,"ACCENT",18);spike.rotation_euler[1]=-math.pi/2
            pick=cone("LUCERNE_PICK",(.68,0,1.32),.23,0,1.35,PRIMARY,"PRIMARY",24);pick.rotation_euler[1]=math.pi/2
        else:  # quake slab
            cube("QUAKE_SLAB",(0,0,1.22),(.92,.5,.5),PRIMARY,"PRIMARY",.12)
            for x in (-.72,-.24,.24,.72): prism_xz("QUAKE_CRACK",[(x-.035,.83),(x,1.22),(x+.05,1.61)],1.04,EMISSIVE,"EMISSIVE",.009)
            for x in (-1.0,1.0): cube("QUAKE_FACE",(x,0,1.22),(.14,.56,.56),ACCENT,"ACCENT",.07)

    elif name == "spear":
        cylinder("SPEAR_SHAFT",(0,0,-.18),.065,4.2,SECONDARY,"SECONDARY",26,.018)
        if variant == 4:  # partisan
            prism_xz("PARTISAN_HEAD", [(-.38,1.55),(-.2,2.18),(0,2.88),(.2,2.18),(.38,1.55),(.12,1.78),(0,1.42),(-.12,1.78)], .22, PRIMARY, "PRIMARY", .04)
            for x in (-.42,.42): prism_xz("PARTISAN_LUG",[(x-.18,1.5),(x,1.9),(x+.18,1.5)],.25,ACCENT,"ACCENT",.03)
        elif variant == 5:  # long pike
            prism_xz("PIKE_HEAD", [(-.09,1.85),(0,3.25),(.09,1.85)], .18, PRIMARY, "PRIMARY", .02)
            for z in (1.55,1.75,1.95): torus("PIKE_COLLAR",(0,0,z),.11,.025,ACCENT,"ACCENT")
            prism_xz("PIKE_RUNE",[(-.02,2.0),(0,3.02),(.02,2.0)],.21,EMISSIVE,"EMISSIVE",.006)
        else:  # barbed harpoon
            prism_xz("HARPOON_HEAD", [(-.22,1.55),(-.18,2.5),(0,2.92),(.18,2.5),(.22,1.55),(0,1.82)], .24, PRIMARY, "PRIMARY", .035)
            for side in (-1,1): prism_xz("HARPOON_BARB",[(side*.12,2.15),(side*.62,1.82),(side*.25,2.38)],.27,ACCENT,"ACCENT",.025)
            torus("HARPOON_ROPE_LOOP",(0,0,1.48),.18,.045,SECONDARY,"SECONDARY")

    elif name == "scythe":
        if variant == 4:  # hooked sickle
            curve_tube("SICKLE_HANDLE",[(0,0,-1.25),(.05,0,-.2),(-.08,0,.72)],.11,SECONDARY,"SECONDARY")
            prism_xz("SICKLE_HOOK",[(-.08,.55),(.38,.92),(1.05,1.35),(1.42,1.28),(.92,.92),(.35,.62)],.22,PRIMARY,"PRIMARY",.045)
            curve_tube("SICKLE_EDGE",[(.34,-.13,.83),(.92,-.13,1.22),(1.4,-.13,1.27)],.035,ACCENT,"ACCENT")
        elif variant == 5:  # chain scythe
            cylinder("CHAIN_SCYTHE_GRIP",(0,0,-.9),.14,1.35,SECONDARY,"SECONDARY",28,.025)
            for index in range(9): torus("CHAIN_LINK",(.08*math.sin(index),0,-.12+index*.22),.13,.035,ACCENT,"ACCENT",(math.pi/2,index*.4,0))
            prism_xz("CHAIN_SCYTHE_BLADE",[(-.08,1.55),(.42,1.85),(1.28,2.05),(.9,1.62),(.28,1.35)],.2,PRIMARY,"PRIMARY",.04)
        else:  # Gravebloom petal scythe
            curve_tube("BLOOM_SHAFT",[(0,0,-1.65),(-.08,0,-.1),(.05,0,1.1)],.09,SECONDARY,"SECONDARY")
            for index in range(5):
                angle=-.7+index*.34
                prism_xz("BLOOM_PETAL",[(0,1.02),(.55+index*.18,1.28),(1.25+index*.16,1.78),(1.0+index*.08,1.96),(.35,1.45)],.17,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",.035)
            ico("BLOOM_HEART",(0,-.08,1.1),(.22,.13,.22),EMISSIVE,"EMISSIVE",3)

    elif name == "bow":
        if variant == 4:  # crossbow
            cube("CROSSBOW_STOCK",(0,0,-.1),(.16,.18,1.25),SECONDARY,"SECONDARY",.045)
            curve_tube("CROSSBOW_LIMB",[(-1.18,0,.55),(-.58,0,.78),(0,0,.62),(.58,0,.78),(1.18,0,.55)],.1,PRIMARY,"PRIMARY")
            curve_tube("CROSSBOW_STRING",[(-1.18,0,.55),(0,-.2,.12),(1.18,0,.55)],.015,ACCENT,"ACCENT")
            cylinder("CROSSBOW_BOLT",(0,-.22,.55),.025,1.6,EMISSIVE,"EMISSIVE",14,.006)
        elif variant == 5:  # asymmetrical greatbow
            curve_tube("GREATBOW",[(.08,0,-2.05),(-.32,0,-1.45),(-.58,0,-.3),(-.46,0,.82),(-.12,0,1.95),(.18,0,2.28)],.12,PRIMARY,"PRIMARY")
            curve_tube("GREATBOW_STRING",[(.08,0,-2.05),(.28,0,0),(.18,0,2.28)],.014,EMISSIVE,"EMISSIVE")
            cube("GREATBOW_GRIP",(-.55,0,-.1),(.15,.16,.44),SECONDARY,"SECONDARY",.04)
        else:  # bone bow
            for z in (-1.25,-.72,-.18,.38,.92,1.42):
                side=-1 if z<0 else 1
                bone=cylinder_between("BONE_LIMB",(side*.05,0,z),(side*(.42+.12*abs(z)),0,z+.45),.1,PRIMARY,"PRIMARY",18)
            curve_tube("BONE_BOW_STRING",[(-.65,0,-1.68),(.18,0,0),(.68,0,1.82)],.014,ACCENT,"ACCENT")
            ico("BONE_GRIP",(0,0,0),(.2,.16,.42),SECONDARY,"SECONDARY",2)

    elif name == "shield":
        if variant == 4:  # buckler
            cylinder("BUCKLER",(0,0,0),.78,.3,PRIMARY,"PRIMARY",56,.07).rotation_euler[0]=math.pi/2
            uv_sphere("BUCKLER_BOSS",(0,-.28,0),(.38,.18,.38),ACCENT,"ACCENT")
            for angle in [math.tau*i/6 for i in range(6)]: ico("BUCKLER_STUD",(.62*math.cos(angle),-.3,.62*math.sin(angle)),(.07,.035,.07),EMISSIVE,"EMISSIVE",2)
        elif variant == 5:  # coffin shield
            prism_xz("COFFIN_SHIELD",[(-.55,1.35),(-.92,.75),(-.78,-1.08),(0,-1.55),(.78,-1.08),(.92,.75),(.55,1.35)],.36,PRIMARY,"PRIMARY",.08)
            prism_xz("COFFIN_CROSS",[(-.12,1.05),(-.12,.25),(-.55,.25),(-.55,-.02),(-.12,-.02),(-.12,-1.05),(.12,-1.05),(.12,-.02),(.55,-.02),(.55,.25),(.12,.25),(.12,1.05)],.41,EMISSIVE,"EMISSIVE",.02)
        else:  # crescent shield
            prism_xz("CRESCENT_SHIELD",[(-.85,1.2),(-1.18,.45),(-1.05,-.72),(-.45,-1.3),(0,-.72),(.45,-1.3),(1.05,-.72),(1.18,.45),(.85,1.2),(0,.72)],.34,PRIMARY,"PRIMARY",.075)
            torus("CRESCENT_BOSS",(0,-.26,.12),.36,.12,ACCENT,"ACCENT",(math.pi/2,0,0))

    elif name == "cuirass":
        if variant == 4:  # scale harness
            prism_xz("SCALE_VEST",[(-.72,1.02),(-.86,.35),(-.62,-1.05),(0,-1.25),(.62,-1.05),(.86,.35),(.72,1.02)],.48,SECONDARY,"SECONDARY",.07)
            for row in range(5):
                for col in range(5-row%2):
                    x=-.56+(col+(row%2)*.5)*.28
                    prism_xz("ARMOUR_SCALE",[(x-.14,.72-row*.34),(x,.48-row*.34),(x+.14,.72-row*.34),(x,.82-row*.34)],.54,PRIMARY if row%2 else ACCENT,"PRIMARY" if row%2 else "ACCENT",.025)
        elif variant == 5:  # bone harness
            uv_sphere("BONE_CHEST",(0,0,.2),(.72,.4,.92),SECONDARY,"SECONDARY")
            for z,width in ((.72,.68),(.42,.78),(.12,.75),(-.18,.64)): cylinder_between("BONE_RIB",(-width,-.42,z),(width,-.42,z),.06,PRIMARY,"PRIMARY",18)
            prism_xz("STERNUM",[(-.08,.88),(-.1,-.72),(0,-.92),(.1,-.72),(.08,.88)],.52,ACCENT,"ACCENT",.025)
            for x in (-.84,.84): ico("BONE_PAULDRON",(x,0,.7),(.42,.44,.34),PRIMARY,"PRIMARY",2)
        else:  # crystal carapace
            uv_sphere("CARAPACE_CORE",(0,0,.12),(.7,.38,.92),PRIMARY,"PRIMARY")
            for x,z,rot in ((-.62,.58,-.35),(.62,.58,.35),(-.45,-.08,-.25),(.45,-.08,.25),(0,.86,0)):
                shard=cone("CARAPACE_SHARD",(x,-.28,z),.19,0,.85,ACCENT,"ACCENT",6);shard.rotation_euler[1]=rot
            ico("CARAPACE_HEART",(0,-.42,.22),(.26,.08,.32),EMISSIVE,"EMISSIVE",3)

    elif name == "cloak":
        if variant == 4:  # feather mantle
            for row in range(5):
                count=4+row
                for col in range(count):
                    x=(col-(count-1)/2)*(.3-row*.015)
                    prism_xz("MANTLE_FEATHER",[(x-.13,1.05-row*.37),(x, .45-row*.48),(x+.13,1.05-row*.37),(x,1.2-row*.34)],.16,PRIMARY if (row+col)%2 else ACCENT,"PRIMARY" if (row+col)%2 else "ACCENT",.025)
            torus("FEATHER_CLASP",(0,-.12,1.16),.18,.065,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
        elif variant == 5:  # chain cape
            for row in range(7):
                for col in range(5):
                    x=(col-2)*.28;z=.95-row*.31
                    torus("MAIL_LINK",(x,0,z),.13,.035,PRIMARY if row%2 else ACCENT,"PRIMARY" if row%2 else "ACCENT",(math.pi/2,(row+col)*.4,0))
            curve_tube("CHAIN_COLLAR",[(-.72,0,1.05),(0,0,.82),(.72,0,1.05)],.09,SECONDARY,"SECONDARY")
        else:  # wing mantle
            for side in (-1,1):
                prism_xz("WING_CAPE",[(side*.08,1.1),(side*.65,.82),(side*1.18,.2),(side*.9,-1.35),(side*.4,-.82)],.19,PRIMARY,"PRIMARY",.055)
                for z in (.62,.18,-.28,-.72): cylinder_between("WING_RIB",(side*.18,-.2,z),(side*(.88-.12*z),-.2,z-.35),.035,ACCENT,"ACCENT",16)
            ico("WING_CLASP",(0,-.16,1.12),(.2,.1,.22),EMISSIVE,"EMISSIVE",3)

    elif name == "greaves":
        for x in (-.36,.36):
            if variant == 4:  # tough hide guards
                prism_xz("HIDE_GREAVE",[(x-.27,.82),(x-.32,-.68),(x,-.92),(x+.32,-.68),(x+.27,.82)],.42,SECONDARY,"SECONDARY",.07)
                for z in (-.55,-.05,.45): cylinder_between("HIDE_STRAP",(x-.3,-.24,z),(x+.3,-.24,z),.045,PRIMARY,"PRIMARY",16)
            elif variant == 5:  # bone greaves
                cylinder("BONE_SHIN",(x,0,-.05),.18,1.55,PRIMARY,"PRIMARY",24,.035)
                for z in (-.62,-.2,.22,.64): cylinder_between("BONE_CROSS",(x-.28,-.18,z),(x+.28,-.18,z),.045,ACCENT,"ACCENT",16)
                ico("BONE_KNEE",(x,-.12,.82),(.32,.22,.3),EMISSIVE,"EMISSIVE",2)
            else:  # crystal greaves
                cone("CRYSTAL_SHIN",(x,0,-.05),.3,.2,1.7,PRIMARY,"PRIMARY",6)
                for side in (-1,1):
                    shard=cone("SHIN_SHARD",(x+side*.24,-.08,.25),.1,0,.62,ACCENT,"ACCENT",6);shard.rotation_euler[1]=side*.45
                ico("CRYSTAL_KNEE",(x,-.2,.86),(.31,.18,.34),EMISSIVE,"EMISSIVE",3)

    elif name == "boots":
        for x in (-.38,.38):
            if variant == 4:  # ranger boot
                cube("RANGER_BOOT",(x,0,.05),(.3,.37,.72),SECONDARY,"SECONDARY",.1)
                cube("RANGER_SOLE",(x,-.38,-.67),(.34,.58,.13),PRIMARY,"PRIMARY",.055)
                for z in (-.32,0,.32): cylinder_between("BOOT_LACE",(x-.24,-.38,z),(x+.24,-.38,z+.08),.025,ACCENT,"ACCENT",12)
            elif variant == 5:  # claw sabaton
                cube("CLAW_BOOT",(x,-.02,-.12),(.34,.44,.6),PRIMARY,"PRIMARY",.09)
                for toe in (-.18,0,.18):
                    claw=cone("SABATON_CLAW",(x+toe,-.78,-.62),.09,0,.58,ACCENT,"ACCENT",18);claw.rotation_euler[0]=math.pi/2
                uv_sphere("CLAW_ANKLE",(x,-.02,.48),(.38,.34,.28),EMISSIVE,"EMISSIVE")
            else:  # windstep boot
                cube("WINDSTEP_BOOT",(x,0,-.12),(.28,.34,.62),PRIMARY,"PRIMARY",.08)
                for side in (-1,1): prism_xz("WINDSTEP_WING",[(x+side*.24,.25),(x+side*.7,.08),(x+side*.78,-.35),(x+side*.32,-.18)],.28,ACCENT,"ACCENT",.035)
                torus("WINDSTEP_ANKLET",(x,0,.48),.34,.06,EMISSIVE,"EMISSIVE")

    elif name == "helm":
        if variant == 4:  # greathelm
            cube("GREATHELM",(0,0,.3),(.7,.58,.86),PRIMARY,"PRIMARY",.1)
            cylinder_between("GREATHELM_SLIT",(-.5,-.62,.48),(.5,-.62,.48),.035,EMISSIVE,"EMISSIVE",16)
            prism_xz("GREATHELM_CROSS",[(-.08,.98),(-.08,.52),(-.5,.52),(-.5,.38),(-.08,.38),(-.08,-.45),(.08,-.45),(.08,.38),(.5,.38),(.5,.52),(.08,.52),(.08,.98)],.64,ACCENT,"ACCENT",.018)
        elif variant == 5:  # horned helm
            uv_sphere("HORNED_SHELL",(0,0,.3),(.72,.62,.82),PRIMARY,"PRIMARY")
            for side in (-1,1):
                horn=cone("HORN",(side*.62,0,.88),.19,0,1.05,SECONDARY,"SECONDARY",24);horn.rotation_euler[1]=side*.72
            cube("HORNED_BROW",(0,-.61,.48),(.58,.09,.16),ACCENT,"ACCENT",.035)
            eyes([(-.22,-.7,.5),(.22,-.7,.5)])
        else:  # plague mask
            uv_sphere("PLAGUE_HOOD",(0,.08,.35),(.7,.6,.88),SECONDARY,"SECONDARY")
            beak=cone("PLAGUE_BEAK",(0,-.72,.34),.26,0,1.12,PRIMARY,"PRIMARY",28);beak.rotation_euler[0]=math.pi/2
            for x in (-.25,.25): torus("PLAGUE_LENS",(x,-.59,.58),.16,.055,ACCENT,"ACCENT",(math.pi/2,0,0))
            eyes([(-.25,-.64,.58),(.25,-.64,.58)])

    elif name == "crown":
        if variant == 4:  # antler crown
            torus("ANTLER_BAND",(0,0,-.05),.66,.11,PRIMARY,"PRIMARY")
            for side in (-1,1):
                curve_tube("ANTLER",[(side*.48,0,.12),(side*.72,0,.62),(side*.62,0,1.22),(side*.94,0,1.62)],.09,SECONDARY,"SECONDARY")
                for z,spread in ((.72,.32),(1.12,.38)): curve_tube("ANTLER_TINE",[(side*.67,0,z),(side*(.67+spread),0,z+.32)],.055,ACCENT,"ACCENT")
            ico("ANTLER_GEM",(0,-.64,.22),(.2,.08,.26),EMISSIVE,"EMISSIVE",3)
        elif variant == 5:  # floating halo crown
            torus("HALO_CROWN",(0,0,.7),.86,.09,EMISSIVE,"EMISSIVE")
            for index in range(8):
                angle=math.tau*index/8
                shard=cone("HALO_RAY",(1.08*math.cos(angle),1.08*math.sin(angle),.7),.1,0,.52,ACCENT,"ACCENT",16);shard.rotation_euler[1]=math.pi/2;shard.rotation_euler[2]=angle
            torus("HALO_BAND",(0,0,-.1),.62,.08,PRIMARY,"PRIMARY")
        else:  # bone crown
            torus("BONE_CROWN_BAND",(0,0,-.08),.7,.13,SECONDARY,"SECONDARY")
            for index,height in enumerate((.75,1.05,.82,1.25,.82,1.05,.75)):
                angle=-1.35+index*.45;x,y=.67*math.cos(angle),.67*math.sin(angle)
                cone("BONE_POINT",(x,y,height*.42),.13,0,height,PRIMARY,"PRIMARY",20)
            ico("BONE_CROWN_EYE",(0,-.69,.22),(.18,.08,.22),EMISSIVE,"EMISSIVE",3)

    elif name == "ring":
        if variant == 4:  # serpent ring
            curve_tube("SERPENT_RING",[(.7,0,0),(.5,.45,0),(0,.72,0),(-.55,.4,0),(-.7,-.08,0),(-.38,-.62,0),(.18,-.72,0),(.65,-.35,0),(.48,.18,.08)],.13,PRIMARY,"PRIMARY")
            uv_sphere("SERPENT_HEAD",(.5,.22,.1),(.22,.18,.16),ACCENT,"ACCENT")
            eyes([(.43,.06,.14),(.57,.07,.14)])
        elif variant == 5:  # rune band
            torus("RUNE_BAND",(0,0,0),.74,.2,PRIMARY,"PRIMARY")
            for index in range(8):
                angle=math.tau*index/8
                cube("RUNE_TILE",(.74*math.cos(angle),.74*math.sin(angle),0),(.11,.06,.16),EMISSIVE,"EMISSIVE",.018).rotation_euler[2]=angle
        else:  # gem cluster
            torus("CLUSTER_BAND",(0,0,-.08),.7,.14,PRIMARY,"PRIMARY")
            for x,z,size,mat,role in ((-.32,.72,.2,ACCENT,"ACCENT"),(0,.92,.28,EMISSIVE,"EMISSIVE"),(.32,.72,.2,ACCENT,"ACCENT"),(-.16,.98,.15,PRIMARY,"PRIMARY"),(.16,.98,.15,PRIMARY,"PRIMARY")):
                ico("CLUSTER_GEM",(x,0,z),(size,size*.72,size*1.15),mat,role,3)

    elif name == "earring":
        if variant == 4:  # gem stud
            ico("STUD_GEM",(0,0,.25),(.48,.28,.52),EMISSIVE,"EMISSIVE",3)
            cylinder("STUD_POST",(0,.35,.25),.055,.7,PRIMARY,"PRIMARY",18,.012).rotation_euler[0]=math.pi/2
            torus("STUD_BACK",(0,.7,.25),.14,.04,ACCENT,"ACCENT",(math.pi/2,0,0))
        elif variant == 5:  # long chain drop
            torus("DROP_HOOP",(0,0,.85),.34,.07,PRIMARY,"PRIMARY")
            for index in range(6): torus("DROP_LINK",(0,0,.42-index*.25),.13,.035,ACCENT,"ACCENT",(math.pi/2,index*.45,0))
            ico("DROP_STONE",(0,0,-1.18),(.25,.15,.38),EMISSIVE,"EMISSIVE",3)
        else:  # feather earring
            cylinder("FEATHER_HOOK",(0,0,.82),.04,.6,PRIMARY,"PRIMARY",16,.01)
            prism_xz("FEATHER",[(-.08,.45),(-.42,-.28),(-.1,-1.25),(0,-1.48),(.1,-1.25),(.42,-.28),(.08,.45)],.12,ACCENT,"ACCENT",.035)
            cylinder_between("FEATHER_QUILL",(0,-.08,.45),(0,-.08,-1.35),.025,EMISSIVE,"EMISSIVE",14)

    elif name == "bracelet":
        if variant == 4:  # charm bracelet
            torus("CHARM_CHAIN",(0,0,0),.76,.075,PRIMARY,"PRIMARY")
            shapes=[(-.6,-.52,'moon'),(-.18,-.78,'key'),(.28,-.72,'heart'),(.65,-.42,'coin')]
            for index,(x,y,_kind) in enumerate(shapes):
                cylinder_between("CHARM_LINK",(x*.92,y*.92,0),(x,y,-.28),.025,SECONDARY,"SECONDARY",12)
                ico("CHARM",(x,y,-.43),(.16,.12,.2),EMISSIVE if index%2 else ACCENT,"EMISSIVE" if index%2 else "ACCENT",2)
        elif variant == 5:  # leather bracer
            cylinder("LEATHER_BRACER",(0,0,0),.72,.88,SECONDARY,"SECONDARY",48,.06)
            for z in (-.34,0,.34): torus("BRACER_STRAP",(0,0,z),.75,.055,PRIMARY,"PRIMARY")
            prism_xz("BRACER_PLATE",[(-.35,.4),(-.48,-.35),(0,-.62),(.48,-.35),(.35,.4)],.8,ACCENT,"ACCENT",.055)
        else:  # segmented gem bracelet
            for index in range(10):
                angle=math.tau*index/10;x,y=.76*math.cos(angle),.76*math.sin(angle)
                cube("SEGMENT",(x,y,0),(.22,.14,.2),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",.045).rotation_euler[2]=angle
                if index%2==0: ico("SEGMENT_GEM",(x*1.04,y*1.04,.2),(.09,.09,.12),EMISSIVE,"EMISSIVE",2)

    elif name == "necklace":
        if variant == 4:  # rosary
            beads=[(-.9,.62),(-.75,.18),(-.52,-.2),(-.25,-.48),(0,-.58),(.25,-.48),(.52,-.2),(.75,.18),(.9,.62)]
            for index,(x,z) in enumerate(beads): ico("ROSARY_BEAD",(x,0,z),(.11,.09,.11),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",2)
            prism_xz("ROSARY_MARK",[(-.1,-.72),(-.1,-1.05),(-.34,-1.05),(-.34,-1.22),(-.1,-1.22),(-.1,-1.58),(.1,-1.58),(.1,-1.22),(.34,-1.22),(.34,-1.05),(.1,-1.05),(.1,-.72)],.2,EMISSIVE,"EMISSIVE",.025)
        elif variant == 5:  # plated collar
            curve_tube("COLLAR",[(-.92,0,.52),(-.72,0,-.22),(0,0,-.65),(.72,0,-.22),(.92,0,.52)],.16,PRIMARY,"PRIMARY")
            for x,z in ((-.55,-.28),(-.28,-.52),(0,-.65),(.28,-.52),(.55,-.28)): prism_xz("COLLAR_PLATE",[(x-.18,z+.15),(x,z-.28),(x+.18,z+.15)],.24,ACCENT,"ACCENT",.035)
            ico("COLLAR_CORE",(0,-.08,-.7),(.2,.1,.26),EMISSIVE,"EMISSIVE",3)
        else:  # fang necklace
            curve_tube("FANG_CORD",[(-.96,0,.62),(-.65,0,-.15),(0,0,-.58),(.65,0,-.15),(.96,0,.62)],.055,SECONDARY,"SECONDARY")
            for index,x in enumerate((-.55,-.28,0,.28,.55)):
                fang=cone("FANG",(x,0,-.48-abs(x)*.35),.11,0,.62,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",18);fang.rotation_euler[0]=math.pi
            ico("FANG_HEART",(0,-.04,-.5),(.14,.08,.18),EMISSIVE,"EMISSIVE",3)

    elif name == "trinket":
        if variant == 4:  # coin - pennies now look like pennies
            cylinder("COIN",(0,0,0),.86,.16,PRIMARY,"PRIMARY",64,.035).rotation_euler[0]=math.pi/2
            torus("COIN_RIM",(0,-.1,0),.7,.055,ACCENT,"ACCENT",(math.pi/2,0,0))
            prism_xz("COIN_CROWN",[(-.38,-.08),(-.22,.34),(0,.12),(.22,.34),(.38,-.08),(0,-.42)],.2,EMISSIVE,"EMISSIVE",.02)
        elif variant == 5:  # potion vial
            uv_sphere("VIAL_GLASS",(0,0,-.1),(.58,.42,.72),PRIMARY,"PRIMARY",40,22)
            cylinder("VIAL_NECK",(0,0,.68),.24,.5,ACCENT,"ACCENT",32,.025)
            cube("VIAL_CORK",(0,0,1.0),(.25,.25,.18),SECONDARY,"SECONDARY",.045)
            uv_sphere("VIAL_LIQUID",(0,-.18,-.22),(.46,.2,.45),EMISSIVE,"EMISSIVE",32,18)
        else:  # hourglass
            for z in (-.85,.85): cylinder("HOURGLASS_CAP",(0,0,z),.62,.18,PRIMARY,"PRIMARY",48,.04)
            cone("HOURGLASS_TOP",(0,0,.36),.5,.08,.78,ACCENT,"ACCENT",40)
            cone("HOURGLASS_BOTTOM",(0,0,-.36),.08,.5,.78,ACCENT,"ACCENT",40)
            for x in (-.46,.46): cylinder_between("HOURGLASS_POST",(x,0,-.78),(x,0,.78),.055,SECONDARY,"SECONDARY",18)
            cone("HOURGLASS_SAND",(0,-.06,-.48),.34,.04,.55,EMISSIVE,"EMISSIVE",32)


def build_gear_final_variant(name, variant):
    """Build distinct v7-v8 silhouettes for the 360-model library."""
    if variant not in (7, 8):
        raise ValueError(f"Final gear variant must be 7-8, got {variant}")

    if name == "sword":
        if variant == 7:  # heavy cleaver
            prism_xz("CLEAVER_BLADE",[(-.28,.05),(-.42,2.45),(-.18,3.05),(.46,2.72),(.58,.45),(.3,.05)],.34,PRIMARY,"PRIMARY",.065)
            prism_xz("CLEAVER_EDGE",[(.46,2.72),(.58,.45),(.4,.34),(.28,2.55)],.38,ACCENT,"ACCENT",.018)
            cylinder_between("CLEAVER_GUARD",(-.72,0,.0),(.72,0,.0),.13,SECONDARY,"SECONDARY",24);variant_grip(-.8,1.38,.16)
        else:  # katana
            curve_tube("KATANA_SPINE",[(0,0,.05),(.02,0,1.0),(.12,0,2.05),(.38,0,3.0)],.135,PRIMARY,"PRIMARY")
            curve_tube("KATANA_EDGE",[(.1,-.12,.05),(.12,-.12,1.0),(.23,-.12,2.05),(.48,-.12,3.0)],.03,EMISSIVE,"EMISSIVE")
            cylinder("KATANA_TSUBA",(0,0,-.02),.48,.11,ACCENT,"ACCENT",48,.025);variant_grip(-.78,1.3,.12)
    elif name == "dagger":
        if variant == 7:  # boot knife
            prism_xz("BOOT_KNIFE",[(-.18,.05),(-.2,1.7),(0,2.22),(.28,1.58),(.18,.05)],.22,PRIMARY,"PRIMARY",.04)
            prism_xz("BOOT_KNIFE_EDGE",[(0,2.22),(.28,1.58),(.18,.42),(.08,1.6)],.25,ACCENT,"ACCENT",.014);variant_grip(-.58,.88,.11)
        else:  # trident dagger
            for x,height in ((-.3,1.78),(0,2.2),(.3,1.78)): prism_xz("TRI_DAGGER_TINE",[(x-.1,.05),(x-.07,height-.25),(x,height),(x+.07,height-.25),(x+.1,.05)],.2,PRIMARY if x else ACCENT,"PRIMARY" if x else "ACCENT",.025)
            cylinder_between("TRI_DAGGER_GUARD",(-.62,0,.02),(.62,0,.02),.09,EMISSIVE,"EMISSIVE",20);variant_grip(-.62,.95,.12)
    elif name == "axe":
        cylinder("AXE_HAFT",(0,0,-.1),.105,3.6,SECONDARY,"SECONDARY",28,.026)
        if variant == 7:  # executioner axe
            prism_xz("EXECUTIONER_HEAD",[(-.05,1.05),(-.82,1.08),(-1.38,1.5),(-1.32,2.38),(-.72,2.72),(-.08,2.45)],.48,PRIMARY,"PRIMARY",.075)
            prism_xz("EXECUTIONER_EDGE",[(-1.38,1.5),(-1.32,2.38),(-1.13,2.26),(-1.18,1.55)],.52,EMISSIVE,"EMISSIVE",.018)
        else:  # miner pickaxe
            prism_xz("PICK_HEAD",[(-1.45,1.62),(-.52,1.9),(0,2.05),(.52,1.9),(1.45,1.62),(.62,1.55),(0,1.7),(-.62,1.55)],.3,PRIMARY,"PRIMARY",.045)
            for x in (-1.35,1.35): ico("PICK_TIP",(x,-.08,1.66),(.16,.1,.14),ACCENT,"ACCENT",2)
    elif name == "hammer":
        cylinder("HAMMER_HAFT",(0,0,-.2),.13,3.2,SECONDARY,"SECONDARY",30,.03)
        if variant == 7:  # smith sledge
            cube("SLEDGE_HEAD",(0,0,1.32),(.92,.42,.46),PRIMARY,"PRIMARY",.11)
            for x in (-1.0,1.0): cube("SLEDGE_FACE",(x,0,1.32),(.14,.5,.52),ACCENT,"ACCENT",.06)
            prism_xz("SLEDGE_STAMP",[(-.2,1.15),(0,1.52),(.2,1.15),(0,.96)],.9,EMISSIVE,"EMISSIVE",.018)
        else:  # star mace
            cylinder("MACE_NECK",(0,0,1.18),.2,.55,PRIMARY,"PRIMARY",28,.04);ico("MACE_CORE",(0,0,1.65),(.58,.5,.58),ACCENT,"ACCENT",2)
            for index in range(8):
                angle=math.tau*index/8;spike=cone("MACE_SPIKE",(.68*math.cos(angle),.25*math.sin(angle),1.65+.45*math.sin(angle)),.11,0,.65,EMISSIVE,"EMISSIVE",16);spike.rotation_euler[1]=math.pi/2;spike.rotation_euler[2]=angle
    elif name == "spear":
        if variant == 7:  # cavalry lance
            cylinder("LANCE_SHAFT",(0,0,-.15),.085,4.7,SECONDARY,"SECONDARY",28,.02)
            cone("LANCE_HEAD",(0,0,2.65),.24,0,1.35,PRIMARY,"PRIMARY",28);prism_xz("LANCE_GUARD",[(-.62,.65),(0,.28),(.62,.65),(0,1.12)],.34,ACCENT,"ACCENT",.045)
        else:  # double-ended spear
            cylinder("DOUBLE_SPEAR_SHAFT",(0,0,0),.07,4.3,SECONDARY,"SECONDARY",26,.018)
            prism_xz("DOUBLE_SPEAR_TOP",[(-.22,1.72),(0,2.7),(.22,1.72)],.2,PRIMARY,"PRIMARY",.035)
            prism_xz("DOUBLE_SPEAR_BOTTOM",[(-.22,-1.72),(0,-2.7),(.22,-1.72)],.2,ACCENT,"ACCENT",.035);torus("DOUBLE_SPEAR_CORE",(0,0,0),.2,.06,EMISSIVE,"EMISSIVE")
    elif name == "scythe":
        curve_tube("REAPER_SHAFT",[(0,0,-1.7),(.04,0,-.2),(0,0,1.2)],.09,SECONDARY,"SECONDARY")
        if variant == 7:  # ring scythe
            torus("RING_SCYTHE",(.7,0,1.48),.82,.16,PRIMARY,"PRIMARY");torus("RING_EDGE",(.7,-.12,1.48),.94,.045,EMISSIVE,"EMISSIVE")
            cylinder_between("RING_MOUNT",(0,0,1.05),(.7,0,1.48),.11,ACCENT,"ACCENT",22)
        else:  # bone reaper
            curve_tube("BONE_BLADE",[(.05,0,1.02),(.5,0,1.46),(1.12,0,1.85),(1.72,0,2.02)],.16,PRIMARY,"PRIMARY")
            for index in range(6): cone("BONE_TOOTH",(.35+index*.24,-.1,1.38+index*.12),.07,0,.34,ACCENT,"ACCENT",14).rotation_euler[0]=math.pi
            ico("BONE_REAPER_EYE",(.08,-.1,1.08),(.18,.09,.18),EMISSIVE,"EMISSIVE",2)
    elif name == "bow":
        if variant == 7:  # slingbow
            curve_tube("SLINGBOW_FRAME",[(-.92,0,1.2),(-.5,0,.42),(0,0,0),(.5,0,.42),(.92,0,1.2)],.12,PRIMARY,"PRIMARY")
            curve_tube("SLINGBOW_CORD",[(-.92,0,1.2),(0,-.18,.38),(.92,0,1.2)],.016,EMISSIVE,"EMISSIVE");cube("SLINGBOW_GRIP",(0,0,-.55),(.16,.17,.72),SECONDARY,"SECONDARY",.05)
        else:  # twin crossbow
            cube("TWIN_STOCK",(0,0,-.12),(.2,.22,1.3),SECONDARY,"SECONDARY",.05)
            for z in (.32,.82):
                curve_tube("TWIN_LIMB",[(-1.0,0,z),(-.5,0,z+.18),(0,0,z+.05),(.5,0,z+.18),(1.0,0,z)],.085,PRIMARY,"PRIMARY");curve_tube("TWIN_STRING",[(-1.0,0,z),(0,-.18,z-.32),(1.0,0,z)],.013,ACCENT,"ACCENT")
            for x in (-.08,.08): cylinder("TWIN_BOLT",(x,-.22,.58),.022,1.75,EMISSIVE,"EMISSIVE",12,.006)
    elif name == "shield":
        if variant == 7:  # spiked round shield
            cylinder("SPIKED_SHIELD",(0,0,.05),1.16,.34,PRIMARY,"PRIMARY",64,.07).rotation_euler[0]=math.pi/2;uv_sphere("SPIKED_BOSS",(0,-.3,.05),(.44,.2,.44),ACCENT,"ACCENT")
            for index in range(8):
                angle=math.tau*index/8;spike=cone("RIM_SPIKE",(.98*math.cos(angle),-.32,.05+.98*math.sin(angle)),.08,0,.38,EMISSIVE,"EMISSIVE",14);spike.rotation_euler[1]=math.pi/2;spike.rotation_euler[2]=angle
        else:  # leaf shield
            prism_xz("LEAF_SHIELD",[(0,1.55),(-.78,.85),(-1.02,0),(-.72,-.92),(0,-1.62),(.72,-.92),(1.02,0),(.78,.85)],.34,PRIMARY,"PRIMARY",.08)
            prism_xz("LEAF_VEIN",[(-.08,1.25),(-.08,-1.25),(0,-1.48),(.08,-1.25),(.08,1.25)],.4,EMISSIVE,"EMISSIVE",.018)
            for z in (-.65,-.15,.35,.85): cylinder_between("LEAF_RIB",(-.56,-.23,z),(0,-.23,z-.18),.035,ACCENT,"ACCENT",14);cylinder_between("LEAF_RIB",(.56,-.23,z),(0,-.23,z-.18),.035,ACCENT,"ACCENT",14)
    elif name == "cuirass":
        if variant == 7:  # tough leather coat
            prism_xz("LEATHER_COAT",[(-.72,1.08),(-.9,.25),(-.68,-1.15),(0,-1.35),(.68,-1.15),(.9,.25),(.72,1.08)],.5,SECONDARY,"SECONDARY",.08)
            for z in (.72,.3,-.12,-.54): cylinder_between("COAT_STRAP",(-.65,-.42,z),(.65,-.42,z),.055,PRIMARY,"PRIMARY",18)
            for x in (-.86,.86): uv_sphere("LEATHER_PAULDRON",(x,0,.7),(.4,.43,.32),ACCENT,"ACCENT")
        else:  # clockwork frame
            cube("CLOCKWORK_CHEST",(0,0,.25),(.68,.42,.88),PRIMARY,"PRIMARY",.09)
            for side in (-1,1):
                torus("SHOULDER_GEAR",(side*.84,0,.72),.4,.09,ACCENT,"ACCENT");cylinder_between("PISTON",(side*.56,0,.42),(side*.84,0,-.55),.09,SECONDARY,"SECONDARY",20)
            torus("CHEST_GEAR",(0,-.45,.28),.36,.08,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
    elif name == "cloak":
        if variant == 7:  # fur mantle
            prism_xz("FUR_CAPE",[(-.72,1.12),(-1.02,-1.15),(-.42,-1.48),(0,-1.25),(.42,-1.48),(1.02,-1.15),(.72,1.12)],.24,SECONDARY,"SECONDARY",.07)
            for index,x in enumerate((-.72,-.48,-.24,0,.24,.48,.72)): cone("FUR_TUFT",(x,-.17,1.12-abs(x)*.18),.16,0,.48,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",16).rotation_euler[0]=math.pi
            ico("FUR_CLASP",(0,-.18,1.12),(.2,.1,.22),EMISSIVE,"EMISSIVE",3)
        else:  # smoke cloak
            for x,z,size in ((-.42,.55,.58),(0,.18,.72),(.42,.42,.55),(-.28,-.48,.52),(.24,-.82,.48),(0,-1.2,.38)): uv_sphere("SMOKE_LOBE",(x,0,z),(size,.18,size*.75),PRIMARY if x<0 else SECONDARY,"PRIMARY" if x<0 else "SECONDARY")
            curve_tube("SMOKE_TRIM",[(-.75,-.16,.82),(0,-.16,1.18),(.75,-.16,.82)],.07,ACCENT,"ACCENT");ico("SMOKE_CLASP",(0,-.2,1.15),(.18,.09,.2),EMISSIVE,"EMISSIVE",3)
    elif name == "greaves":
        for x in (-.36,.36):
            if variant == 7:
                for row in range(7):
                    for col in range(3): torus("GREAVE_MAIL",(x+(col-1)*.16,0,-.65+row*.22),.1,.028,PRIMARY if (row+col)%2 else ACCENT,"PRIMARY" if (row+col)%2 else "ACCENT",(math.pi/2,(row+col)*.4,0))
                uv_sphere("MAIL_KNEE",(x,-.18,.88),(.3,.2,.28),EMISSIVE,"EMISSIVE")
            else:
                cube("CLOCKWORK_GREAVE",(x,0,-.02),(.29,.28,.82),PRIMARY,"PRIMARY",.08)
                for z in (-.55,0,.55): torus("GREAVE_GEAR",(x,-.28,z),.22,.05,ACCENT,"ACCENT",(math.pi/2,0,0))
                cylinder_between("GREAVE_PISTON",(x-.18,0,-.7),(x+.18,0,.7),.045,EMISSIVE,"EMISSIVE",16)
    elif name == "boots":
        for x in (-.38,.38):
            if variant == 7:
                cube("DIVER_BOOT",(x,0,-.05),(.36,.46,.72),PRIMARY,"PRIMARY",.11);cube("DIVER_SOLE",(x,-.46,-.72),(.42,.68,.16),SECONDARY,"SECONDARY",.06)
                for z in (-.42,.05,.48): torus("DIVER_RING",(x,0,z),.38,.055,ACCENT,"ACCENT")
            else:
                prism_xz("DUNE_WRAP",[(x-.32,.72),(x-.35,-.55),(x,-.84),(x+.35,-.55),(x+.32,.72)],.48,SECONDARY,"SECONDARY",.07)
                for z in (-.52,-.22,.08,.38,.68): torus("DUNE_BAND",(x,0,z),.34,.035,PRIMARY,"PRIMARY")
                ico("DUNE_ANKLET",(x,-.4,.58),(.12,.05,.14),EMISSIVE,"EMISSIVE",2)
    elif name == "helm":
        if variant == 7:  # skull helm
            ico("SKULL_HELM",(0,0,.38),(.72,.62,.82),PRIMARY,"PRIMARY",3)
            for side in (-1,1): uv_sphere("SKULL_SOCKET",(side*.22,-.58,.52),(.17,.08,.2),SECONDARY,"SECONDARY",24,12)
            for x in (-.3,-.1,.1,.3): cube("SKULL_TOOTH",(x,-.62,-.1),(.07,.06,.18),ACCENT,"ACCENT",.025)
            eyes([(-.22,-.65,.52),(.22,-.65,.52)])
        else:  # crystal visor
            uv_sphere("CRYSTAL_HELM",(0,0,.38),(.7,.62,.82),SECONDARY,"SECONDARY")
            prism_xz("CRYSTAL_VISOR",[(-.62,.72),(-.48,.12),(0,-.15),(.48,.12),(.62,.72),(0,1.05)],.5,PRIMARY,"PRIMARY",.055)
            for x in (-.46,-.22,0,.22,.46): cone("VISOR_CRYSTAL",(x,-.62,.82-abs(x)*.25),.08,0,.45,EMISSIVE,"EMISSIVE",6)
    elif name == "crown":
        if variant == 7:  # thorn crown
            torus("THORN_CROWN",(0,0,0),.72,.11,SECONDARY,"SECONDARY")
            for index in range(12):
                angle=math.tau*index/12;thorn=cone("CROWN_THORN",(.72*math.cos(angle),.72*math.sin(angle),.24),.08,0,.58,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",16);thorn.rotation_euler[1]=.22*math.cos(angle)
            ico("THORN_HEART",(0,-.72,.22),(.18,.08,.22),EMISSIVE,"EMISSIVE",3)
        else:  # clockwork crown
            torus("CLOCK_CROWN_BAND",(0,0,-.12),.72,.13,PRIMARY,"PRIMARY")
            for index in range(6):
                angle=math.tau*index/6;torus("CROWN_GEAR",(.68*math.cos(angle),.68*math.sin(angle),.38),.2,.055,ACCENT,"ACCENT",(math.pi/2,angle,0))
            cylinder("CLOCK_FACE",(0,-.7,.28),.32,.1,EMISSIVE,"EMISSIVE",48,.025).rotation_euler[0]=math.pi/2
    elif name == "ring":
        if variant == 7:  # cursed split ring
            torus("SPLIT_RING",(0,0,0),.72,.16,PRIMARY,"PRIMARY");prism_xz("CURSED_HALF",[(-.72,.1),(-.18,.72),(0,.9),(0,-.9),(-.18,-.72)],.32,ACCENT,"ACCENT",.04)
            prism_xz("BLESSED_HALF",[(.72,.1),(.18,.72),(0,.9),(0,-.9),(.18,-.72)],.32,EMISSIVE,"EMISSIVE",.04)
        else:  # knot ring
            curve_tube("KNOT_RING",[(.72,0,0),(.38,.55,.12),(-.18,.7,-.08),(-.68,.24,.12),(-.55,-.42,-.08),(0,-.72,.12),(.58,-.38,-.08),(.72,0,0)],.13,PRIMARY,"PRIMARY",True)
            for x in (-.24,.24): ico("KNOT_GEM",(x,-.05,.72),(.17,.12,.2),ACCENT if x<0 else EMISSIVE,"ACCENT" if x<0 else "EMISSIVE",3)
    elif name == "earring":
        if variant == 7:  # coin earring
            torus("COIN_HOOK",(0,0,.72),.28,.06,PRIMARY,"PRIMARY");cylinder_between("COIN_CHAIN",(0,0,.42),(0,0,.05),.035,SECONDARY,"SECONDARY",14)
            cylinder("EARRING_COIN",(0,0,-.45),.42,.12,ACCENT,"ACCENT",56,.03).rotation_euler[0]=math.pi/2;ico("COIN_MARK",(0,-.08,-.45),(.14,.05,.16),EMISSIVE,"EMISSIVE",2)
        else:  # tusk earring
            torus("TUSK_HOOP",(0,0,.68),.32,.07,PRIMARY,"PRIMARY");tusk=cone("TUSK_DROP",(0,0,-.28),.22,.04,1.35,SECONDARY,"SECONDARY",28);tusk.rotation_euler[0]=math.pi
            for z in (.02,-.22,-.46): torus("TUSK_BAND",(0,0,z),.19+z*.08,.03,ACCENT,"ACCENT")
    elif name == "bracelet":
        if variant == 7:  # bone beads
            for index in range(10):
                angle=math.tau*index/10;ico("BONE_BEAD",(.76*math.cos(angle),.76*math.sin(angle),0),(.18,.14,.18),PRIMARY if index%2 else SECONDARY,"PRIMARY" if index%2 else "SECONDARY",2)
            ico("BONE_CHARM",(0,-.94,-.18),(.22,.12,.3),EMISSIVE,"EMISSIVE",2)
        else:  # coiled cuff
            for index in range(4): torus("COIL_CUFF",(0,0,-.3+index*.2),.75-index*.035,.08,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT")
            for angle in (-.6,0,.6): ico("COIL_STONE",(.68*math.sin(angle),-.68*math.cos(angle),.42),(.12,.08,.16),EMISSIVE,"EMISSIVE",3)
    elif name == "necklace":
        if variant == 7:  # lantern pendant
            curve_tube("LANTERN_CHAIN",[(-.9,0,.72),(-.62,0,-.02),(0,0,-.52),(.62,0,-.02),(.9,0,.72)],.045,PRIMARY,"PRIMARY")
            cube("PENDANT_LANTERN",(0,0,-.88),(.34,.25,.42),ACCENT,"ACCENT",.06);uv_sphere("PENDANT_FLAME",(0,-.27,-.88),(.16,.05,.23),EMISSIVE,"EMISSIVE",24,12)
        else:  # pearl strand
            beads=[(-.95,.62),(-.8,.22),(-.58,-.18),(-.3,-.48),(0,-.62),(.3,-.48),(.58,-.18),(.8,.22),(.95,.62)]
            for index,(x,z) in enumerate(beads): uv_sphere("PEARL",(x,0,z),(.14,.12,.14),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",24,14)
            ico("PEARL_DROP",(0,-.03,-.92),(.22,.15,.3),EMISSIVE,"EMISSIVE",3)
    elif name == "trinket":
        if variant == 7:  # tidecaller pearl
            uv_sphere("GIANT_PEARL",(0,0,0),(.72,.72,.72),PRIMARY,"PRIMARY",48,28);torus("PEARL_CAGE_A",(0,0,0),.82,.07,ACCENT,"ACCENT");torus("PEARL_CAGE_B",(0,0,0),.82,.07,ACCENT,"ACCENT",(math.pi/2,0,0))
            ico("PEARL_GLOW",(0,-.68,0),(.18,.07,.22),EMISSIVE,"EMISSIVE",3)
        else:  # trickster die
            cube("TRICKSTER_DIE",(0,0,0),(.72,.72,.72),PRIMARY,"PRIMARY",.14)
            for x,z in ((-.28,.28),(.28,.28),(-.28,-.28),(.28,-.28),(0,0)): uv_sphere("DIE_PIP",(x,-.73,z),(.08,.035,.08),EMISSIVE,"EMISSIVE",18,10)
            torus("DIE_AURA",(0,0,0),1.0,.05,ACCENT,"ACCENT",(math.pi/2,0,0))


def build_creature_variant(archetype, variant, companion=False):
    """Alternative anatomy, not a decorated copy of ``creature``."""
    scale = .82 if companion else 1.0
    def S(value): return value * scale
    if archetype == "humanoid":
        if variant == 2:  # armoured knight
            cube("KNIGHT_TORSO",(0,0,S(.25)),(S(.58),S(.38),S(.72)),PRIMARY,"PRIMARY",.1)
            uv_sphere("KNIGHT_HELM",(0,0,S(1.18)),(S(.39),S(.34),S(.4)),ACCENT,"ACCENT")
            cube("KNIGHT_VISOR",(0,S(-.34),S(1.18)),(S(.34),S(.06),S(.12)),SECONDARY,"SECONDARY",.025)
            for side in (-1,1): limb("KNIGHT_LEG",(S(side*.22),0,S(-.3)),(S(side*.3),0,S(-1.18)),S(.15),SECONDARY,"SECONDARY")
            cylinder_between("KNIGHT_SWORD",(S(.5),0,S(.5)),(S(1.0),0,S(-.65)),S(.06),ACCENT,"ACCENT",18)
            prism_xz("KNIGHT_SHIELD",[(-S(1.1),S(.55)),(-S(1.36),S(.1)),(-S(1.18),S(-.7)),(-S(.72),S(-.45)),(-S(.72),S(.38))],S(.18),PRIMARY,"PRIMARY",.04)
        else:  # robed mage
            cone("MAGE_ROBE",(0,0,S(-.15)),S(.72),S(.28),S(2.15),SECONDARY,"SECONDARY",40)
            uv_sphere("MAGE_HEAD",(0,0,S(1.1)),(S(.34),S(.3),S(.36)),PRIMARY,"PRIMARY")
            cone("MAGE_HAT",(0,0,S(1.72)),S(.5),0,S(1.2),ACCENT,"ACCENT",40)
            cylinder_between("MAGE_STAFF",(S(.72),0,S(-1.05)),(S(.72),0,S(1.45)),S(.055),PRIMARY,"PRIMARY",18)
            ico("STAFF_ORB",(S(.72),0,S(1.65)),(S(.22),S(.18),S(.22)),EMISSIVE,"EMISSIVE",3)
            eyes([(S(-.12),S(-.29),S(1.12)),(S(.12),S(-.29),S(1.12))])
    elif archetype == "beast":
        if variant == 2:  # wolf
            uv_sphere("WOLF_BODY",(S(-.15),0,S(.05)),(S(.86),S(.36),S(.45)),PRIMARY,"PRIMARY")
            uv_sphere("WOLF_HEAD",(S(.72),S(-.02),S(.42)),(S(.4),S(.3),S(.34)),ACCENT,"ACCENT")
            uv_sphere("WOLF_MUZZLE",(S(1.02),S(-.2),S(.35)),(S(.28),S(.18),S(.18)),SECONDARY,"SECONDARY")
            for x in (-.62,-.18,.3,.62): limb("WOLF_LEG",(S(x),0,S(-.2)),(S(x),0,S(-.94)),S(.08),SECONDARY,"SECONDARY")
            curve_tube("WOLF_TAIL",[(S(-.85),0,S(.08)),(S(-1.25),0,S(.35)),(S(-1.5),0,S(.68))],S(.09),PRIMARY,"PRIMARY")
            for x in (.58,.82): cone("WOLF_EAR",(S(x),0,S(.82)),S(.11),0,S(.4),PRIMARY,"PRIMARY",18)
            eyes([(S(.68),S(-.31),S(.5)),(S(.86),S(-.29),S(.49))])
        else:  # boar
            uv_sphere("BOAR_BODY",(S(-.18),0,0),(S(.92),S(.5),S(.62)),PRIMARY,"PRIMARY")
            uv_sphere("BOAR_HEAD",(S(.73),S(-.04),S(.28)),(S(.52),S(.43),S(.45)),SECONDARY,"SECONDARY")
            cylinder("BOAR_SNOUT",(S(1.08),S(-.22),S(.22)),S(.24),S(.38),ACCENT,"ACCENT",30,.03).rotation_euler[0]=math.pi/2
            for x in (-.62,-.18,.28,.58): limb("BOAR_LEG",(S(x),0,S(-.28)),(S(x),0,S(-.92)),S(.12),SECONDARY,"SECONDARY")
            for side in (-1,1):
                tusk=cone("BOAR_TUSK",(S(.95+side*.12),S(-.42),S(.05)),S(.08),0,S(.38),EMISSIVE,"EMISSIVE",18); tusk.rotation_euler[0]=-math.pi/3
            eyes([(S(.58),S(-.43),S(.4)),(S(.82),S(-.42),S(.4))])
    elif archetype == "dragon":
        if variant == 2:  # wyvern
            uv_sphere("WYVERN_BODY",(0,0,S(.05)),(S(.68),S(.36),S(.62)),PRIMARY,"PRIMARY")
            curve_tube("WYVERN_NECK",[(S(.25),0,S(.35)),(S(.62),0,S(.72)),(S(.78),0,S(1.08))],S(.16),PRIMARY,"PRIMARY")
            uv_sphere("WYVERN_HEAD",(S(.82),S(-.02),S(1.18)),(S(.34),S(.28),S(.28)),ACCENT,"ACCENT")
            for side in (-1,1):
                prism_xz("WYVERN_WING",[(0,S(.3)),(S(side*1.65),S(1.2)),(S(side*1.3),S(.05)),(S(side*.42),S(-.38))],S(.11),SECONDARY,"SECONDARY",.03)
                limb("WYVERN_LEG",(S(side*.25),0,S(-.35)),(S(side*.42),0,S(-1.08)),S(.1),ACCENT,"ACCENT")
            curve_tube("WYVERN_TAIL",[(S(-.48),0,S(-.2)),(S(-1.15),0,S(-.62)),(S(-1.75),0,S(-.38))],S(.1),PRIMARY,"PRIMARY")
            eyes([(S(.72),S(-.28),S(1.22)),(S(.9),S(-.27),S(1.22))])
        else:  # four-legged drake
            uv_sphere("DRAKE_BODY",(S(-.15),0,0),(S(.95),S(.52),S(.62)),PRIMARY,"PRIMARY")
            uv_sphere("DRAKE_HEAD",(S(.82),0,S(.52)),(S(.46),S(.38),S(.4)),ACCENT,"ACCENT")
            for x in (-.68,-.22,.34,.68): limb("DRAKE_LEG",(S(x),0,S(-.3)),(S(x),0,S(-1.12)),S(.14),SECONDARY,"SECONDARY")
            curve_tube("DRAKE_TAIL",[(S(-.9),0,0),(S(-1.42),0,S(.15)),(S(-1.8),0,S(.55))],S(.14),PRIMARY,"PRIMARY")
            for z in (-.42,0,.42): cone("DRAKE_HORN",(S(.7+z*.1),0,S(.75+z)),S(.08),0,S(.35),EMISSIVE,"EMISSIVE",16)
            eyes([(S(.7),S(-.37),S(.6)),(S(.92),S(-.35),S(.6))])
    elif archetype == "serpent":
        coil=[(S(math.sin(i*.72)*.42),S(math.cos(i*.5)*.12),S(-1.25+i*.22)) for i in range(10)]
        curve_tube("SERPENT_COIL",coil,S(.22),PRIMARY,"PRIMARY")
        if variant == 2:  # cobra
            uv_sphere("COBRA_HEAD",coil[-1],(S(.38),S(.3),S(.34)),ACCENT,"ACCENT")
            prism_xz("COBRA_HOOD",[(S(-.72),S(.42)),(S(-.5),S(1.2)),(0,S(1.48)),(S(.5),S(1.2)),(S(.72),S(.42)),(0,S(.65))],S(.14),SECONDARY,"SECONDARY",.04)
            eyes([(S(-.12),S(-.29),S(.82)),(S(.12),S(-.29),S(.82))])
        else:  # twin-headed serpent
            for side in (-1,1):
                curve_tube("TWIN_NECK",[(0,0,S(.45)),(S(side*.26),0,S(.78)),(S(side*.45),0,S(1.18))],S(.16),PRIMARY,"PRIMARY")
                uv_sphere("TWIN_HEAD",(S(side*.48),0,S(1.34)),(S(.3),S(.25),S(.3)),ACCENT,"ACCENT")
                eye_x=S(side*.52); eyes([(eye_x,S(-.24),S(1.38))])
    elif archetype == "insect":
        if variant == 2:  # beetle
            uv_sphere("BEETLE_SHELL",(0,0,S(-.1)),(S(.68),S(.48),S(.82)),PRIMARY,"PRIMARY")
            uv_sphere("BEETLE_HEAD",(0,S(-.02),S(.72)),(S(.4),S(.34),S(.36)),ACCENT,"ACCENT")
            cylinder_between("SHELL_SEAM",(0,S(-.48),S(-.78)),(0,S(-.48),S(.62)),S(.025),EMISSIVE,"EMISSIVE",14)
            for row in range(3):
                z=S(.45-row*.45)
                for side in (-1,1): limb("BEETLE_LEG",(S(side*.36),0,z),(S(side*(.95+row*.12)),S((row-1)*.14),S(z-.22)),S(.055),SECONDARY,"SECONDARY")
            eyes([(S(-.13),S(-.32),S(.8)),(S(.13),S(-.32),S(.8))])
        else:  # moth
            uv_sphere("MOTH_BODY",(0,0,0),(S(.32),S(.3),S(.78)),SECONDARY,"SECONDARY")
            for side in (-1,1):
                prism_xz("MOTH_FOREWING",[(S(side*.12),S(.5)),(S(side*1.2),S(1.15)),(S(side*1.45),S(.15)),(S(side*.38),S(-.28))],S(.1),PRIMARY,"PRIMARY",.035)
                prism_xz("MOTH_HINDWING",[(S(side*.25),S(.05)),(S(side*1.15),S(-.22)),(S(side*.82),S(-1.0)),(S(side*.2),S(-.48))],S(.1),ACCENT,"ACCENT",.035)
            uv_sphere("MOTH_HEAD",(0,S(-.02),S(.82)),(S(.28),S(.25),S(.27)),PRIMARY,"PRIMARY")
            for side in (-1,1): curve_tube("ANTENNA",[(S(side*.08),0,S(1.02)),(S(side*.26),0,S(1.35)),(S(side*.5),0,S(1.48))],S(.025),EMISSIVE,"EMISSIVE")
            eyes([(S(-.1),S(-.24),S(.86)),(S(.1),S(-.24),S(.86))])
    elif archetype == "arachnid":
        if variant == 2:  # orb spider
            uv_sphere("SPIDER_ABDOMEN",(0,0,S(-.25)),(S(.62),S(.5),S(.68)),PRIMARY,"PRIMARY")
            uv_sphere("SPIDER_HEAD",(0,0,S(.48)),(S(.38),S(.34),S(.34)),ACCENT,"ACCENT")
            for row in range(4):
                z=S(.35-row*.28)
                for side in (-1,1): limb("SPIDER_LEG",(S(side*.28),0,z),(S(side*(1.0+row*.1)),S((row-1.5)*.12),S(z-.34)),S(.05),SECONDARY,"SECONDARY")
            eyes([(S(-.16),S(-.31),S(.55)),(0,S(-.34),S(.6)),(S(.16),S(-.31),S(.55))])
        else:  # scorpion
            uv_sphere("SCORPION_BODY",(0,0,S(-.1)),(S(.62),S(.4),S(.5)),PRIMARY,"PRIMARY")
            for row in range(4):
                for side in (-1,1): limb("SCORPION_LEG",(S(side*.3),0,S(.2-row*.22)),(S(side*(.9+row*.1)),0,S(.05-row*.22)),S(.045),SECONDARY,"SECONDARY")
            for side in (-1,1):
                limb("CLAW_ARM",(S(side*.38),0,S(.32)),(S(side*.9),0,S(.62)),S(.08),ACCENT,"ACCENT")
                uv_sphere("CLAW",(S(side*1.02),0,S(.68)),(S(.26),S(.18),S(.2)),ACCENT,"ACCENT")
            curve_tube("SCORPION_TAIL",[(0,0,S(-.42)),(S(-.55),0,S(-.72)),(S(-.72),0,S(.12)),(S(-.35),0,S(.88))],S(.1),PRIMARY,"PRIMARY")
            cone("STINGER",(S(-.28),0,S(1.08)),S(.12),0,S(.42),EMISSIVE,"EMISSIVE",18)
    elif archetype == "avian":
        if variant == 2:  # owl
            uv_sphere("OWL_BODY",(0,0,S(-.05)),(S(.62),S(.42),S(.82)),PRIMARY,"PRIMARY")
            uv_sphere("OWL_HEAD",(0,S(-.02),S(.75)),(S(.54),S(.4),S(.48)),ACCENT,"ACCENT")
            for side in (-1,1):
                prism_xz("OWL_WING",[(S(side*.28),S(.45)),(S(side*.92),S(.2)),(S(side*.62),S(-.92)),(S(side*.18),S(-.42))],S(.14),SECONDARY,"SECONDARY",.04)
                torus("OWL_EYE_RING",(S(side*.18),S(-.39),S(.84)),S(.17),S(.045),EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            cone("OWL_BEAK",(0,S(-.45),S(.68)),S(.11),0,S(.35),ACCENT,"ACCENT",18).rotation_euler[0]=math.pi/2
        else:  # diving raptor
            uv_sphere("RAPTOR_BODY",(0,0,0),(S(.42),S(.35),S(.88)),PRIMARY,"PRIMARY")
            uv_sphere("RAPTOR_HEAD",(0,0,S(.88)),(S(.3),S(.28),S(.3)),ACCENT,"ACCENT")
            for side in (-1,1): prism_xz("RAPTOR_WING",[(S(side*.1),S(.42)),(S(side*1.45),S(.55)),(S(side*.92),S(-.2)),(S(side*.25),S(-.5))],S(.12),SECONDARY,"SECONDARY",.035)
            cone("RAPTOR_BEAK",(0,S(-.32),S(.9)),S(.1),0,S(.4),EMISSIVE,"EMISSIVE",16).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("RAPTOR_LEG",(S(side*.15),0,S(-.55)),(S(side*.22),S(-.12),S(-1.22)),S(.055),ACCENT,"ACCENT")
            eyes([(S(-.1),S(-.27),S(.96)),(S(.1),S(-.27),S(.96))])
    elif archetype == "aquatic":
        if variant == 2:  # shark
            uv_sphere("SHARK_BODY",(0,0,0),(S(1.2),S(.42),S(.52)),PRIMARY,"PRIMARY")
            prism_xz("SHARK_TAIL",[(S(-.9),S(.12)),(S(-1.65),S(.82)),(S(-1.45),0),(S(-1.65),S(-.82)),(S(-.9),S(-.12))],S(.16),SECONDARY,"SECONDARY",.035)
            prism_xz("SHARK_DORSAL",[(S(-.15),S(.42)),(S(.08),S(1.08)),(S(.35),S(.38))],S(.12),ACCENT,"ACCENT",.025)
            eyes([(S(.78),S(-.38),S(.16))])
        else:  # angler
            uv_sphere("ANGLER_BODY",(0,0,0),(S(.92),S(.62),S(.82)),PRIMARY,"PRIMARY")
            uv_sphere("ANGLER_JAW",(S(.55),S(-.15),S(-.15)),(S(.58),S(.48),S(.42)),SECONDARY,"SECONDARY")
            curve_tube("ANGLER_LURE",[(S(.1),0,S(.68)),(S(.35),0,S(1.18)),(S(.65),0,S(1.42))],S(.035),ACCENT,"ACCENT")
            uv_sphere("LURE_LIGHT",(S(.68),0,S(1.45)),(S(.16),S(.12),S(.16)),EMISSIVE,"EMISSIVE",24,12)
            for x in (.3,.55,.78): cone("ANGLER_TOOTH",(S(x),S(-.62),S(-.1)),S(.05),0,S(.25),EMISSIVE,"EMISSIVE",12)
            eyes([(S(.36),S(-.58),S(.28))])
    elif archetype == "ooze":
        if variant == 2:  # puddle slime
            uv_sphere("PUDDLE",(0,0,S(-.65)),(S(1.05),S(.72),S(.35)),PRIMARY,"PRIMARY")
            for x,z,size in ((-.55,-.2,.38),(.05,.0,.55),(.55,-.18,.32)):
                uv_sphere("SLIME_LOBE",(S(x),S(-.05),S(z)),(S(size),S(size*.75),S(size*1.2)),ACCENT if x>0 else PRIMARY,"ACCENT" if x>0 else "PRIMARY")
            eyes([(S(-.12),S(-.48),S(.18)),(S(.12),S(-.48),S(.18))])
        else:  # column slime
            cone("SLIME_COLUMN",(0,0,S(-.15)),S(.72),S(.3),S(2.2),PRIMARY,"PRIMARY",48)
            uv_sphere("SLIME_CORE",(0,S(-.35),S(.18)),(S(.28),S(.14),S(.36)),EMISSIVE,"EMISSIVE",28,14)
            for z in (-.65,.1,.72): torus("SLIME_RING",(0,0,S(z)),S(.45 if z<0 else .3),S(.05),ACCENT,"ACCENT")
            eyes([(S(-.13),S(-.5),S(.45)),(S(.13),S(-.5),S(.45))])
    elif archetype == "undead":
        if variant == 2:  # skeleton
            uv_sphere("SKULL",(0,0,S(1.12)),(S(.34),S(.3),S(.36)),PRIMARY,"PRIMARY")
            cylinder("SPINE",(0,0,S(.22)),S(.07),S(1.25),SECONDARY,"SECONDARY",16,.015)
            for z in (.05,.28,.51,.74):
                cylinder_between("RIB_L",(0,0,S(z)),(S(-.48),0,S(z-.12)),S(.035),ACCENT,"ACCENT",14)
                cylinder_between("RIB_R",(0,0,S(z)),(S(.48),0,S(z-.12)),S(.035),ACCENT,"ACCENT",14)
            for side in (-1,1):
                limb("BONE_ARM",(S(side*.2),0,S(.7)),(S(side*.72),0,S(-.05)),S(.055),PRIMARY,"PRIMARY")
                limb("BONE_LEG",(S(side*.16),0,S(-.28)),(S(side*.26),0,S(-1.22)),S(.07),PRIMARY,"PRIMARY")
            eyes([(S(-.12),S(-.28),S(1.16)),(S(.12),S(-.28),S(1.16))])
        else:  # revenant soldier
            uv_sphere("REVENANT_BODY",(0,0,S(.2)),(S(.58),S(.4),S(.75)),SECONDARY,"SECONDARY")
            uv_sphere("BROKEN_HELM",(0,0,S(1.16)),(S(.38),S(.34),S(.38)),PRIMARY,"PRIMARY")
            for side in (-1,1): limb("REVENANT_LEG",(S(side*.2),0,S(-.28)),(S(side*.31),0,S(-1.2)),S(.13),SECONDARY,"SECONDARY")
            prism_xz("BROKEN_SHIELD",[(-S(1.05),S(.58)),(-S(1.32),S(.1)),(-S(1.05),S(-.72)),(-S(.72),S(-.32)),(-S(.72),S(.42))],S(.2),PRIMARY,"PRIMARY",.05)
            cylinder_between("BROKEN_SPEAR",(S(.55),0,S(-.72)),(S(.88),0,S(1.02)),S(.045),ACCENT,"ACCENT",16)
            eyes([(S(-.12),S(-.32),S(1.2)),(S(.12),S(-.32),S(1.2))])
    elif archetype == "wraith":
        if variant == 2:  # hooded spectre
            cone("SPECTRE_ROBE",(0,0,S(-.2)),S(.82),S(.22),S(2.25),PRIMARY,"PRIMARY",48)
            torus("SPECTRE_HOOD",(0,0,S(.95)),S(.46),S(.18),SECONDARY,"SECONDARY",(math.pi/2,0,0))
            uv_sphere("VOID_FACE",(0,S(-.22),S(.96)),(S(.3),S(.14),S(.32)),SECONDARY,"SECONDARY",28,14)
            eyes([(S(-.12),S(-.36),S(1.0)),(S(.12),S(-.36),S(1.0))])
            for side in (-1,1): curve_tube("SPECTRE_ARM",[(S(side*.28),0,S(.38)),(S(side*.78),0,0),(S(side*1.0),0,S(-.48))],S(.07),ACCENT,"ACCENT")
        else:  # chained skull
            uv_sphere("FLOATING_SKULL",(0,0,S(.55)),(S(.5),S(.42),S(.52)),PRIMARY,"PRIMARY")
            eyes([(S(-.17),S(-.39),S(.63)),(S(.17),S(-.39),S(.63))])
            for link in range(9):
                angle=link*.68
                torus("SPECTRAL_CHAIN",(S(math.cos(angle)*(.35+.05*link)),S(math.sin(angle)*.15),S(.25-link*.18)),S(.12),S(.035),ACCENT,"ACCENT",(math.pi/2,angle,0))
            cone("ECTOPLASM_TAIL",(0,0,S(-.72)),S(.46),0,S(1.4),SECONDARY,"SECONDARY",32)
    elif archetype == "construct":
        if variant == 2:  # stone golem
            cube("GOLEM_TORSO",(0,0,S(.22)),(S(.66),S(.46),S(.78)),PRIMARY,"PRIMARY",.12)
            cube("GOLEM_HEAD",(0,0,S(1.18)),(S(.44),S(.38),S(.34)),ACCENT,"ACCENT",.08)
            for side in (-1,1):
                cube("GOLEM_ARM",(S(side*.78),0,S(.25)),(S(.26),S(.3),S(.72)),PRIMARY,"PRIMARY",.1)
                cube("GOLEM_LEG",(S(side*.28),0,S(-.75)),(S(.25),S(.31),S(.56)),SECONDARY,"SECONDARY",.09)
            ico("GOLEM_CORE",(0,S(-.49),S(.28)),(S(.22),S(.08),S(.22)),EMISSIVE,"EMISSIVE",3)
        else:  # clockwork sentinel
            uv_sphere("CLOCKWORK_TORSO",(0,0,S(.2)),(S(.58),S(.42),S(.68)),ACCENT,"ACCENT")
            uv_sphere("CLOCKWORK_HEAD",(0,0,S(1.08)),(S(.34),S(.3),S(.34)),PRIMARY,"PRIMARY")
            for side in (-1,1):
                for z,r in ((.62,.26),(.05,.22),(-.55,.18)): torus("GEAR_JOINT",(S(side*.58),0,S(z)),S(r),S(.055),PRIMARY,"PRIMARY")
                limb("CLOCKWORK_LEG",(S(side*.22),0,S(-.28)),(S(side*.32),0,S(-1.22)),S(.12),SECONDARY,"SECONDARY")
            torus("CHEST_GEAR",(0,S(-.43),S(.22)),S(.34),S(.075),EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            eyes([(S(-.12),S(-.29),S(1.12)),(S(.12),S(-.29),S(1.12))])
    elif archetype == "plant":
        if variant == 2:  # carnivorous flower
            cylinder("FLOWER_STEM",(0,0,S(-.25)),S(.2),S(2.0),SECONDARY,"SECONDARY",28,.035)
            for index in range(10):
                angle=math.tau*index/10
                uv_sphere("FLOWER_PETAL",(S(.62*math.cos(angle)),S(.12*math.sin(angle)),S(.72+.48*math.sin(angle))),(S(.38),S(.16),S(.18)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT")
            uv_sphere("FLOWER_MAW",(0,S(-.2),S(.72)),(S(.34),S(.2),S(.36)),SECONDARY,"SECONDARY")
            eyes([(S(-.1),S(-.37),S(.78)),(S(.1),S(-.37),S(.78))])
        else:  # walking treant
            cylinder("TREANT_TRUNK",(0,0,S(-.05)),S(.32),S(2.0),SECONDARY,"SECONDARY",32,.05)
            for side in (-1,1):
                curve_tube("TREANT_ARM",[(S(side*.2),0,S(.55)),(S(side*.72),0,S(.35)),(S(side*1.0),0,S(.72))],S(.11),PRIMARY,"PRIMARY")
                curve_tube("TREANT_ROOT",[(S(side*.12),0,S(-.92)),(S(side*.42),0,S(-1.2)),(S(side*.72),0,S(-1.12))],S(.12),PRIMARY,"PRIMARY")
            for index in range(7):
                angle=math.tau*index/7
                uv_sphere("TREANT_CROWN",(S(.45*math.cos(angle)),0,S(.95+.42*math.sin(angle))),(S(.4),S(.3),S(.36)),ACCENT,"ACCENT")
            eyes([(S(-.12),S(-.31),S(.25)),(S(.12),S(-.31),S(.25))])
    elif archetype == "elemental":
        if variant == 2:  # flame elemental
            for index in range(9):
                angle=math.tau*index/9;r=S(.15+(index%3)*.22)
                cone("FLAME_TONGUE",(r*math.cos(angle),0,S(-.55+(index%3)*.35)),S(.17),0,S(1.35+(index%2)*.35),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",24)
            uv_sphere("FLAME_CORE",(0,S(-.12),0),(S(.42),S(.3),S(.5)),EMISSIVE,"EMISSIVE",32,18)
        else:  # crystal elemental
            for index in range(11):
                angle=math.tau*index/11;r=S(.18+(index%3)*.23)
                crystal=cone("CRYSTAL",(r*math.cos(angle),r*.45*math.sin(angle),S(-.45+(index%4)*.28)),S(.18+(index%2)*.05),0,S(1.1+(index%3)*.28),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",6)
                crystal.rotation_euler[1]=math.cos(angle)*.32
            ico("CRYSTAL_HEART",(0,S(-.2),0),(S(.32),S(.24),S(.36)),EMISSIVE,"EMISSIVE",3)
    elif archetype == "aberration":
        if variant == 2:  # watcher orb
            uv_sphere("WATCHER_BODY",(0,0,S(.15)),(S(.76),S(.64),S(.76)),PRIMARY,"PRIMARY")
            torus("GREAT_EYE",(0,S(-.62),S(.22)),S(.38),S(.1),ACCENT,"ACCENT",(math.pi/2,0,0))
            uv_sphere("EYE_PUPIL",(0,S(-.72),S(.22)),(S(.16),S(.06),S(.22)),EMISSIVE,"EMISSIVE",24,12)
            for index in range(8):
                angle=math.tau*index/8
                curve_tube("WATCHER_TENTACLE",[(S(.35*math.cos(angle)),0,S(-.25+.2*math.sin(angle))),(S(.9*math.cos(angle)),0,S(-.75)),(S(1.25*math.cos(angle+.18)),0,S(-1.15))],S(.07),SECONDARY,"SECONDARY")
        else:  # star maw
            for index in range(7):
                angle=math.tau*index/7
                curve_tube("STAR_LIMB",[(0,0,0),(S(.65*math.cos(angle)),0,S(.65*math.sin(angle))),(S(1.2*math.cos(angle)),0,S(1.2*math.sin(angle)))],S(.14),PRIMARY if index%2 else SECONDARY,"PRIMARY" if index%2 else "SECONDARY")
                cone("MAW_TOOTH",(S(.27*math.cos(angle)),S(-.32),S(.27*math.sin(angle))),S(.065),0,S(.28),EMISSIVE,"EMISSIVE",12).rotation_euler[0]=math.pi/2
            torus("STAR_MAW",(0,S(-.25),0),S(.42),S(.13),ACCENT,"ACCENT",(math.pi/2,0,0))
    elif archetype == "mimic":
        if variant == 2:  # coffer mimic
            cube("COFFER_BODY",(0,0,S(-.28)),(S(.85),S(.55),S(.5)),PRIMARY,"PRIMARY",.11)
            cube("HINGED_LID",(0,S(.12),S(.48)),(S(.88),S(.58),S(.24)),ACCENT,"ACCENT",.11)
            for x in (-.58,-.34,-.1,.1,.34,.58): cone("COFFER_TOOTH",(S(x),S(-.58),S(.1)),S(.065),0,S(.3),EMISSIVE,"EMISSIVE",12)
            for side in (-1,1): limb("COFFER_LEG",(S(side*.52),0,S(-.62)),(S(side*.7),0,S(-1.1)),S(.09),SECONDARY,"SECONDARY")
            eyes([(S(-.28),S(-.56),S(.52)),(S(.28),S(-.56),S(.52))])
        else:  # urn mimic
            uv_sphere("URN_BODY",(0,0,S(-.2)),(S(.72),S(.55),S(.92)),PRIMARY,"PRIMARY")
            torus("URN_RIM",(0,0,S(.68)),S(.48),S(.12),ACCENT,"ACCENT")
            for x in (-.32,-.1,.1,.32): cone("URN_TOOTH",(S(x),S(-.48),S(.63)),S(.05),0,S(.25),EMISSIVE,"EMISSIVE",12).rotation_euler[0]=math.pi
            for side in (-1,1): curve_tube("URN_ARM",[(S(side*.42),0,S(.05)),(S(side*.82),0,S(-.2)),(S(side*1.0),0,S(.12))],S(.08),SECONDARY,"SECONDARY")
            eyes([(S(-.18),S(-.52),S(.12)),(S(.18),S(-.52),S(.12))])
    elif archetype == "swarm":
        count=18 if variant==2 else 28
        for index in range(count):
            if variant==2:
                angle=index*2.399963;radius=S(.16+.06*index);x=S(math.cos(angle))*radius;y=S(math.sin(angle))*radius*.36;z=S(-.85+index*.09)
            else:
                cluster=-1 if index<count/2 else 1;local=index%(count//2);angle=local*1.73;x=S(cluster*.58+math.cos(angle)*(.15+.025*local));y=S(math.sin(angle)*.22);z=S(-.65+local*.11)
            ico("SWARM_CREATURE",(x,y,z),(S(.13),S(.08),S(.17)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",2)
    elif archetype == "bat":  # flying fox / bulldog bat
        wide=variant==2
        uv_sphere("BAT_TORSO",(0,0,0),(S(.48 if wide else .62),S(.34),S(.72 if wide else .58)),SECONDARY,"SECONDARY",40,24)
        uv_sphere("BAT_HEAD",(0,S(-.03),S(.7)),(S(.38 if wide else .5),S(.34),S(.4)),PRIMARY,"PRIMARY",40,24)
        if wide: uv_sphere("FOX_MUZZLE",(0,S(-.32),S(.62)),(S(.24),S(.14),S(.18)),ACCENT,"ACCENT",28,16)
        else: uv_sphere("BULLDOG_MUZZLE",(0,S(-.38),S(.58)),(S(.38),S(.18),S(.24)),ACCENT,"ACCENT",28,16)
        ear_scale=.62 if not wide else .45
        for side in (-1,1):
            cone("BAT_EAR",(S(side*.23),0,S(1.1)),S(.18 if wide else .26),S(.025),S(ear_scale),PRIMARY,"PRIMARY",24)
            shoulder=(S(side*.32),0,S(.45));elbow=(S(side*(1.05 if wide else .82)),0,S(.55));wrist=(S(side*(1.85 if wide else 1.42)),0,S(.05))
            limb("BAT_WING_ARM",shoulder,elbow,S(.065),PRIMARY,"PRIMARY")
            limb("BAT_WING_FOREARM",elbow,wrist,S(.05),PRIMARY,"PRIMARY")
            prism_xz("BAT_WING",[(S(side*.25),S(.42)),(S(side*(1.05 if wide else .82)),S(.55)),(S(side*(1.85 if wide else 1.42)),S(.05)),(S(side*.95),S(-.5)),(S(side*.3),S(-.28))],S(.07),ACCENT,"ACCENT",.022)
        eyes([(S(-.13),S(-.34),S(.76)),(S(.13),S(-.34),S(.76))])


def build_creature_expanded_variant(archetype, variant, companion=False):
    """Build v4-v6 with a third set of independent creature anatomies."""
    if variant not in (4, 5, 6):
        raise ValueError(f"Expanded creature variant must be 4-6, got {variant}")
    scale=.78 if companion else 1.0
    def S(value): return value*scale

    if archetype == "humanoid":
        if variant == 4:  # duelist
            uv_sphere("DUELIST_TORSO",(0,0,S(.25)),(S(.48),S(.32),S(.72)),SECONDARY,"SECONDARY")
            uv_sphere("DUELIST_HEAD",(0,0,S(1.18)),(S(.33),S(.29),S(.35)),PRIMARY,"PRIMARY")
            prism_xz("DUELIST_CAPE",[(-S(.4),S(.82)),(-S(.72),S(-.95)),(0,S(-1.18)),(S(.35),S(.72))],S(.18),ACCENT,"ACCENT",.045)
            for side in (-1,1): limb("DUELIST_LEG",(S(side*.2),0,S(-.25)),(S(side*.28),0,S(-1.2)),S(.12),SECONDARY,"SECONDARY")
            cylinder_between("DUELIST_RAPIER",(S(.45),0,S(.62)),(S(1.15),0,S(-.55)),S(.04),EMISSIVE,"EMISSIVE",16)
            torus("RAPIER_GUARD",(S(.51),0,S(.51)),S(.18),S(.04),ACCENT,"ACCENT")
            eyes([(S(-.12),S(-.28),S(1.22)),(S(.12),S(-.28),S(1.22))])
        elif variant == 5:  # brute
            cube("BRUTE_TORSO",(0,0,S(.22)),(S(.76),S(.48),S(.72)),PRIMARY,"PRIMARY",.13)
            uv_sphere("BRUTE_HEAD",(0,S(-.02),S(1.16)),(S(.43),S(.38),S(.4)),SECONDARY,"SECONDARY")
            for side in (-1,1):
                limb("BRUTE_ARM",(S(side*.58),0,S(.58)),(S(side*.98),0,S(-.25)),S(.18),PRIMARY,"PRIMARY")
                limb("BRUTE_LEG",(S(side*.3),0,S(-.3)),(S(side*.38),0,S(-1.2)),S(.18),SECONDARY,"SECONDARY")
            cylinder_between("BRUTE_CLUB",(S(-1.0),0,S(-.32)),(S(-1.38),0,S(1.2)),S(.14),ACCENT,"ACCENT",22)
            eyes([(S(-.15),S(-.36),S(1.2)),(S(.15),S(-.36),S(1.2))])
        else:  # masked occultist
            cone("OCCULT_ROBE",(0,0,S(-.12)),S(.7),S(.22),S(2.18),SECONDARY,"SECONDARY",40)
            prism_xz("OCCULT_MASK",[(-S(.3),S(1.38)),(-S(.22),S(.88)),(0,S(.66)),(S(.22),S(.88)),(S(.3),S(1.38)),(0,S(1.62))],S(.22),PRIMARY,"PRIMARY",.04)
            for side in (-1,1):
                curve_tube("OCCULT_ARM",[(S(side*.25),0,S(.46)),(S(side*.72),0,S(.05)),(S(side*.92),0,S(.35))],S(.075),ACCENT,"ACCENT")
                ico("OCCULT_ORB",(S(side*1.0),0,S(.48)),(S(.18),S(.14),S(.18)),EMISSIVE,"EMISSIVE",3)
            eyes([(S(-.1),S(-.2),S(1.15)),(S(.1),S(-.2),S(1.15))])

    elif archetype == "beast":
        if variant == 4:  # stag
            uv_sphere("STAG_BODY",(S(-.12),0,S(.02)),(S(.86),S(.4),S(.54)),PRIMARY,"PRIMARY")
            curve_tube("STAG_NECK",[(S(.45),0,S(.25)),(S(.68),0,S(.72)),(S(.72),0,S(1.05))],S(.19),SECONDARY,"SECONDARY")
            uv_sphere("STAG_HEAD",(S(.72),0,S(1.18)),(S(.34),S(.28),S(.38)),ACCENT,"ACCENT")
            for x in (-.58,-.18,.28,.58): limb("STAG_LEG",(S(x),0,S(-.22)),(S(x),0,S(-1.15)),S(.075),SECONDARY,"SECONDARY")
            for side in (-1,1):
                curve_tube("ANTLER",[(S(.62+side*.08),0,S(1.42)),(S(.55+side*.35),0,S(1.82)),(S(.48+side*.58),0,S(2.05))],S(.045),PRIMARY,"PRIMARY")
            eyes([(S(.62),S(-.27),S(1.24)),(S(.8),S(-.27),S(1.24))])
        elif variant == 5:  # bear
            uv_sphere("BEAR_BODY",(S(-.15),0,0),(S(.98),S(.58),S(.72)),SECONDARY,"SECONDARY")
            uv_sphere("BEAR_HEAD",(S(.7),S(-.02),S(.5)),(S(.54),S(.45),S(.5)),PRIMARY,"PRIMARY")
            uv_sphere("BEAR_MUZZLE",(S(1.05),S(-.32),S(.38)),(S(.32),S(.2),S(.22)),ACCENT,"ACCENT")
            for x in (-.58,-.18,.28,.58): limb("BEAR_LEG",(S(x),0,S(-.28)),(S(x),0,S(-1.0)),S(.16),PRIMARY,"PRIMARY")
            for x in (.48,.88): uv_sphere("BEAR_EAR",(S(x),0,S(.95)),(S(.17),S(.12),S(.18)),SECONDARY,"SECONDARY")
            eyes([(S(.6),S(-.43),S(.62)),(S(.83),S(-.42),S(.62))])
        else:  # lynx
            uv_sphere("LYNX_BODY",(S(-.1),0,S(.04)),(S(.78),S(.35),S(.46)),PRIMARY,"PRIMARY")
            uv_sphere("LYNX_HEAD",(S(.66),0,S(.5)),(S(.42),S(.33),S(.4)),ACCENT,"ACCENT")
            for x in (-.52,-.14,.24,.56): limb("LYNX_LEG",(S(x),0,S(-.18)),(S(x),0,S(-.96)),S(.09),SECONDARY,"SECONDARY")
            for side in (-1,1):
                cone("LYNX_EAR",(S(.66+side*.23),0,S(.94)),S(.13),0,S(.48),PRIMARY,"PRIMARY",18)
                curve_tube("LYNX_EAR_TUFT",[(S(.66+side*.23),0,S(1.12)),(S(.66+side*.28),0,S(1.38))],S(.025),EMISSIVE,"EMISSIVE")
            curve_tube("LYNX_TAIL",[(S(-.82),0,S(.1)),(S(-1.16),0,S(.25)),(S(-1.3),0,S(.48))],S(.08),SECONDARY,"SECONDARY")
            eyes([(S(.56),S(-.32),S(.58)),(S(.76),S(-.32),S(.58))])

    elif archetype == "dragon":
        if variant == 4:  # lindworm
            curve_tube("LINDWORM_BODY",[(S(-1.35),0,S(-.28)),(S(-.72),0,S(-.1)),(0,0,S(.1)),(S(.62),0,S(.42)),(S(.9),0,S(.88))],S(.3),PRIMARY,"PRIMARY")
            uv_sphere("LINDWORM_HEAD",(S(.95),0,S(1.02)),(S(.48),S(.38),S(.42)),ACCENT,"ACCENT")
            for side in (-1,1):
                limb("LINDWORM_ARM",(S(.35),0,S(.3)),(S(.42+side*.3),S(side*.1),S(-.55)),S(.1),SECONDARY,"SECONDARY")
                cone("LINDWORM_HORN",(S(.78+side*.2),0,S(1.42)),S(.1),0,S(.5),EMISSIVE,"EMISSIVE",18)
            eyes([(S(.82),S(-.37),S(1.08)),(S(1.04),S(-.35),S(1.08))])
        elif variant == 5:  # three-headed hydra
            uv_sphere("HYDRA_BODY",(0,0,S(-.35)),(S(.82),S(.52),S(.58)),PRIMARY,"PRIMARY")
            for index,x in enumerate((-0.55,0,.55)):
                curve_tube("HYDRA_NECK",[(S(x*.5),0,S(-.05)),(S(x*.72),0,S(.65)),(S(x),0,S(1.25))],S(.18),SECONDARY if index==1 else PRIMARY,"SECONDARY" if index==1 else "PRIMARY")
                uv_sphere("HYDRA_HEAD",(S(x),0,S(1.42)),(S(.36),S(.3),S(.34)),ACCENT,"ACCENT")
                eyes([(S(x-.1),S(-.29),S(1.48)),(S(x+.1),S(-.29),S(1.48))])
            curve_tube("HYDRA_TAIL",[(S(-.65),0,S(-.4)),(S(-1.22),0,S(-.7)),(S(-1.62),0,S(-.28))],S(.16),PRIMARY,"PRIMARY")
        else:  # armoured hatchling
            uv_sphere("HATCHLING_BODY",(S(-.05),0,S(-.05)),(S(.72),S(.48),S(.68)),SECONDARY,"SECONDARY")
            uv_sphere("HATCHLING_HEAD",(S(.55),S(-.03),S(.62)),(S(.5),S(.4),S(.46)),PRIMARY,"PRIMARY")
            for side in (-1,1):
                prism_xz("HATCHLING_WING",[(S(side*.18),S(.35)),(S(side*1.0),S(.95)),(S(side*.72),S(-.15)),(S(side*.28),S(-.32))],S(.11),ACCENT,"ACCENT",.035)
                limb("HATCHLING_LEG",(S(side*.3),0,S(-.38)),(S(side*.42),0,S(-1.0)),S(.13),PRIMARY,"PRIMARY")
            for z in (-.4,0,.4): cone("HATCHLING_PLATE",(S(-.1),0,S(z+.35)),S(.12),0,S(.38),EMISSIVE,"EMISSIVE",16)
            eyes([(S(.42),S(-.39),S(.72)),(S(.68),S(-.38),S(.72))])

    elif archetype == "serpent":
        points=[(S(math.sin(i*.62)*.38),S(math.cos(i*.43)*.12),S(-1.25+i*.24)) for i in range(10)]
        if variant == 4:  # rattler
            curve_tube("RATTLER_BODY",points,S(.2),PRIMARY,"PRIMARY")
            uv_sphere("RATTLER_HEAD",points[-1],(S(.38),S(.3),S(.32)),ACCENT,"ACCENT")
            for index in range(5): ico("RATTLE",(S(-.08+index*.04),0,S(-1.48-index*.18)),(S(.13-index*.012),S(.09),S(.16)),SECONDARY,"SECONDARY",2)
            eyes([(S(-.12),S(-.28),S(.96)),(S(.12),S(-.28),S(.96))])
        elif variant == 5:  # finned sea serpent
            curve_tube("SEA_SERPENT",points,S(.23),PRIMARY,"PRIMARY")
            uv_sphere("SEA_SERPENT_HEAD",points[-1],(S(.42),S(.34),S(.36)),ACCENT,"ACCENT")
            for index in range(3): prism_xz("SEA_FIN",[(-S(.12),S(.45+index*.22)),(0,S(.95+index*.2)),(S(.12),S(.45+index*.22))],S(.2),EMISSIVE,"EMISSIVE",.025)
            for side in (-1,1): prism_xz("HEAD_FIN",[(0,S(.75)),(S(side*.7),S(1.08)),(0,S(1.28))],S(.16),SECONDARY,"SECONDARY",.03)
            eyes([(S(-.14),S(-.31),S(.98)),(S(.14),S(-.31),S(.98))])
        else:  # skeletal snake
            for index,point in enumerate(points):
                torus("SNAKE_VERTEBRA",point,S(.2-index*.004),S(.045),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT")
                if index<9: cylinder_between("SPINE",point,points[index+1],S(.045),SECONDARY,"SECONDARY",14)
            ico("SKELETAL_HEAD",points[-1],(S(.4),S(.3),S(.34)),PRIMARY,"PRIMARY",2)
            eyes([(S(-.12),S(-.28),S(.96)),(S(.12),S(-.28),S(.96))])

    elif archetype == "insect":
        if variant == 4:  # mantis
            uv_sphere("MANTIS_THORAX",(0,0,S(.18)),(S(.32),S(.26),S(.72)),PRIMARY,"PRIMARY")
            uv_sphere("MANTIS_HEAD",(0,0,S(1.05)),(S(.38),S(.32),S(.3)),ACCENT,"ACCENT")
            for side in (-1,1):
                limb("MANTIS_LEG",(S(side*.18),0,S(-.05)),(S(side*.78),0,S(-1.0)),S(.045),SECONDARY,"SECONDARY")
                limb("MANTIS_ARM",(S(side*.18),0,S(.52)),(S(side*.72),0,S(.1)),S(.065),PRIMARY,"PRIMARY")
                prism_xz("MANTIS_BLADE",[(S(side*.64),S(.2)),(S(side*1.18),S(-.25)),(S(side*.85),S(.35))],S(.12),EMISSIVE,"EMISSIVE",.025)
            eyes([(S(-.15),S(-.3),S(1.1)),(S(.15),S(-.3),S(1.1))])
        elif variant == 5:  # hornet
            uv_sphere("HORNET_ABDOMEN",(0,0,S(-.22)),(S(.4),S(.32),S(.75)),PRIMARY,"PRIMARY")
            uv_sphere("HORNET_THORAX",(0,0,S(.5)),(S(.38),S(.34),S(.4)),SECONDARY,"SECONDARY")
            for side in (-1,1):
                uv_sphere("HORNET_WING",(S(side*.45),S(.08),S(.58)),(S(.55),S(.07),S(.72)),ACCENT,"ACCENT")
                for row in range(3): limb("HORNET_LEG",(S(side*.25),0,S(.35-row*.28)),(S(side*(.75+row*.1)),0,S(.05-row*.34)),S(.035),SECONDARY,"SECONDARY")
            cone("HORNET_STINGER",(0,0,S(-1.1)),S(.1),0,S(.5),EMISSIVE,"EMISSIVE",16).rotation_euler[0]=math.pi
            eyes([(S(-.12),S(-.31),S(.62)),(S(.12),S(-.31),S(.62))])
        else:  # centipede
            for index in range(9):
                z=S(-1.05+index*.26);uv_sphere("CENTIPEDE_SEGMENT",(S(math.sin(index*.45)*.1),0,z),(S(.34-index*.008),S(.3),S(.22)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT")
                for side in (-1,1): limb("CENTIPEDE_LEG",(S(side*.25),0,z),(S(side*.7),0,S(z-.18)),S(.03),SECONDARY,"SECONDARY")
            uv_sphere("CENTIPEDE_HEAD",(0,0,S(1.18)),(S(.38),S(.32),S(.3)),ACCENT,"ACCENT")
            eyes([(S(-.12),S(-.3),S(1.22)),(S(.12),S(-.3),S(1.22))])

    elif archetype == "arachnid":
        if variant == 4:  # armoured tick
            uv_sphere("TICK_BODY",(0,0,S(-.05)),(S(.78),S(.58),S(.88)),PRIMARY,"PRIMARY")
            prism_xz("TICK_SHIELD",[(-S(.55),S(.62)),(-S(.7),S(-.5)),(0,S(-.86)),(S(.7),S(-.5)),(S(.55),S(.62)),(0,S(.86))],S(.62),ACCENT,"ACCENT",.06)
            for row in range(4):
                z=S(.45-row*.3)
                for side in (-1,1): limb("TICK_LEG",(S(side*.42),0,z),(S(side*(1.0+row*.08)),0,S(z-.28)),S(.045),SECONDARY,"SECONDARY")
            eyes([(S(-.12),S(-.55),S(.58)),(S(.12),S(-.55),S(.58))])
        elif variant == 5:  # harvestman
            uv_sphere("HARVESTMAN_BODY",(0,0,S(.1)),(S(.42),S(.34),S(.46)),PRIMARY,"PRIMARY")
            for row in range(4):
                for side in (-1,1):
                    elbow=(S(side*(.75+row*.08)),0,S(.45-row*.24));foot=(S(side*(1.55+row*.12)),0,S(-.82+row*.08))
                    limb("HARVESTMAN_UPPER",(S(side*.25),0,S(.3-row*.1)),elbow,S(.035),SECONDARY,"SECONDARY")
                    limb("HARVESTMAN_LOWER",elbow,foot,S(.025),ACCENT,"ACCENT")
            eyes([(S(-.08),S(-.32),S(.22)),(S(.08),S(-.32),S(.22))])
        else:  # crab spider
            uv_sphere("CRAB_SPIDER_BODY",(0,0,S(-.12)),(S(.65),S(.48),S(.52)),PRIMARY,"PRIMARY")
            uv_sphere("CRAB_SPIDER_HEAD",(0,0,S(.48)),(S(.42),S(.36),S(.34)),ACCENT,"ACCENT")
            for row in range(4):
                for side in (-1,1): limb("CRAB_SPIDER_LEG",(S(side*.3),0,S(.36-row*.24)),(S(side*(1.25-row*.08)),0,S(.2-row*.36)),S(.06 if row<2 else .04),SECONDARY,"SECONDARY")
            eyes([(S(-.15),S(-.34),S(.54)),(0,S(-.37),S(.58)),(S(.15),S(-.34),S(.54))])

    elif archetype == "avian":
        if variant == 4:  # raven
            uv_sphere("RAVEN_BODY",(0,0,S(-.05)),(S(.46),S(.35),S(.76)),PRIMARY,"PRIMARY")
            uv_sphere("RAVEN_HEAD",(0,0,S(.78)),(S(.34),S(.3),S(.32)),SECONDARY,"SECONDARY")
            for side in (-1,1): prism_xz("RAVEN_WING",[(S(side*.15),S(.5)),(S(side*1.15),S(.25)),(S(side*.72),S(-1.0)),(S(side*.2),S(-.42))],S(.12),ACCENT,"ACCENT",.035)
            beak=cone("RAVEN_BEAK",(0,S(-.36),S(.78)),S(.12),0,S(.55),EMISSIVE,"EMISSIVE",18);beak.rotation_euler[0]=math.pi/2
            eyes([(S(-.1),S(-.28),S(.86)),(S(.1),S(-.28),S(.86))])
        elif variant == 5:  # vulture
            uv_sphere("VULTURE_BODY",(0,0,S(-.08)),(S(.62),S(.45),S(.82)),SECONDARY,"SECONDARY")
            curve_tube("VULTURE_NECK",[(0,0,S(.45)),(0,0,S(.82)),(S(.12),0,S(1.12))],S(.16),PRIMARY,"PRIMARY")
            uv_sphere("VULTURE_HEAD",(S(.15),0,S(1.25)),(S(.3),S(.27),S(.28)),ACCENT,"ACCENT")
            for side in (-1,1): prism_xz("VULTURE_WING",[(S(side*.24),S(.42)),(S(side*1.35),S(.65)),(S(side*.95),S(-.55)),(S(side*.34),S(-.82))],S(.14),PRIMARY,"PRIMARY",.04)
            beak=cone("VULTURE_BEAK",(S(.16),S(-.34),S(1.23)),S(.11),0,S(.42),EMISSIVE,"EMISSIVE",18);beak.rotation_euler[0]=math.pi/2
            eyes([(S(.05),S(-.27),S(1.31)),(S(.24),S(-.27),S(1.31))])
        else:  # long-legged crane
            uv_sphere("CRANE_BODY",(0,0,S(.15)),(S(.48),S(.34),S(.7)),PRIMARY,"PRIMARY")
            curve_tube("CRANE_NECK",[(S(.1),0,S(.62)),(S(.28),0,S(1.08)),(0,0,S(1.48))],S(.1),SECONDARY,"SECONDARY")
            uv_sphere("CRANE_HEAD",(0,0,S(1.62)),(S(.25),S(.22),S(.24)),ACCENT,"ACCENT")
            for side in (-1,1):
                prism_xz("CRANE_WING",[(S(side*.12),S(.55)),(S(side*.92),S(.42)),(S(side*.6),S(-.45)),(S(side*.18),S(-.28))],S(.1),PRIMARY,"PRIMARY",.03)
                limb("CRANE_LEG",(S(side*.14),0,S(-.32)),(S(side*.18),0,S(-1.45)),S(.045),ACCENT,"ACCENT")
            beak=cone("CRANE_BEAK",(0,S(-.34),S(1.6)),S(.065),0,S(.75),EMISSIVE,"EMISSIVE",16);beak.rotation_euler[0]=math.pi/2
            eyes([(S(-.08),S(-.21),S(1.67)),(S(.08),S(-.21),S(1.67))])

    elif archetype == "aquatic":
        if variant == 4:  # ray
            prism_xz("RAY_BODY",[(-S(1.35),0),(-S(.62),S(.62)),(0,S(.9)),(S(.62),S(.62)),(S(1.35),0),(S(.55),S(-.45)),(0,S(-.62)),(-S(.55),S(-.45))],S(.18),PRIMARY,"PRIMARY",.07)
            curve_tube("RAY_TAIL",[(0,0,S(-.45)),(0,0,S(-1.15)),(S(.22),0,S(-1.8))],S(.055),SECONDARY,"SECONDARY")
            eyes([(S(-.18),S(-.22),S(.45)),(S(.18),S(-.22),S(.45))])
        elif variant == 5:  # squid
            cone("SQUID_MANTLE",(0,0,S(.45)),S(.55),S(.22),S(1.45),PRIMARY,"PRIMARY",40)
            for index in range(8):
                angle=math.tau*index/8
                curve_tube("SQUID_ARM",[(S(.25*math.cos(angle)),0,S(-.05)),(S(.55*math.cos(angle)),S(.1*math.sin(angle)),S(-.75)),(S(.85*math.cos(angle+.2)),0,S(-1.3))],S(.055),SECONDARY,"SECONDARY")
            for side in (-1,1): uv_sphere("SQUID_EYE",(S(side*.2),S(-.42),S(.52)),(S(.13),S(.06),S(.16)),EMISSIVE,"EMISSIVE",24,12)
        else:  # armoured fish
            uv_sphere("ARMOURED_FISH",(0,0,0),(S(1.0),S(.46),S(.62)),PRIMARY,"PRIMARY")
            for index,x in enumerate((-.55,-.25,.05,.35,.65)): torus("FISH_PLATE",(S(x),0,0),S(.5-index*.035),S(.05),ACCENT,"ACCENT",(0,math.pi/2,0))
            prism_xz("FISH_TAIL",[(-S(.82),S(.12)),(-S(1.55),S(.78)),(-S(1.35),0),(-S(1.55),-S(.78)),(-S(.82),-S(.12))],S(.16),SECONDARY,"SECONDARY",.035)
            prism_xz("FISH_DORSAL",[(-S(.25),S(.42)),(0,S(1.08)),(S(.32),S(.38))],S(.12),EMISSIVE,"EMISSIVE",.025)
            eyes([(S(.68),S(-.4),S(.16))])

    elif archetype == "ooze":
        if variant == 4:  # gelatinous cube
            cube("GELATINOUS_CUBE",(0,0,S(-.05)),(S(.82),S(.68),S(.88)),PRIMARY,"PRIMARY",.16)
            ico("CUBE_CORE",(0,S(-.5),S(.05)),(S(.3),S(.12),S(.34)),EMISSIVE,"EMISSIVE",3)
            for x,z in ((-.42,.42),(.45,.22),(-.25,-.4),(.35,-.52)): uv_sphere("CUBE_BUBBLE",(S(x),S(-.55),S(z)),(S(.1),S(.05),S(.1)),ACCENT,"ACCENT",18,10)
            eyes([(S(-.14),S(-.68),S(.28)),(S(.14),S(-.68),S(.28))])
        elif variant == 5:  # amoeba
            for x,z,size in ((-.52,-.28,.52),(0,.18,.7),(.55,-.18,.48),(-.2,.72,.38),(.36,.62,.32)):
                uv_sphere("AMOEBA_LOBE",(S(x),0,S(z)),(S(size),S(size*.72),S(size*.84)),PRIMARY if x<0 else ACCENT,"PRIMARY" if x<0 else "ACCENT")
            ico("AMOEBA_NUCLEUS",(0,S(-.42),S(.18)),(S(.28),S(.11),S(.32)),EMISSIVE,"EMISSIVE",3)
            eyes([(S(-.12),S(-.52),S(.48)),(S(.12),S(-.52),S(.48))])
        else:  # tar pool
            uv_sphere("TAR_POOL",(0,0,S(-.72)),(S(1.18),S(.82),S(.3)),SECONDARY,"SECONDARY")
            for x,z,height in ((-.55,-.35,.65),(0,.05,1.25),(.58,-.22,.82)):
                cone("TAR_SPIRE",(S(x),0,S(z)),S(.28),S(.08),S(height),PRIMARY,"PRIMARY",36)
            uv_sphere("TAR_FACE",(0,S(-.5),S(.18)),(S(.36),S(.12),S(.28)),ACCENT,"ACCENT")
            eyes([(S(-.13),S(-.62),S(.25)),(S(.13),S(-.62),S(.25))])

    elif archetype == "undead":
        if variant == 4:  # mummy
            uv_sphere("MUMMY_TORSO",(0,0,S(.24)),(S(.5),S(.34),S(.72)),SECONDARY,"SECONDARY")
            uv_sphere("MUMMY_HEAD",(0,0,S(1.18)),(S(.34),S(.3),S(.38)),PRIMARY,"PRIMARY")
            for side in (-1,1):
                limb("MUMMY_ARM",(S(side*.38),0,S(.62)),(S(side*.86),0,S(.05)),S(.1),PRIMARY,"PRIMARY")
                limb("MUMMY_LEG",(S(side*.18),0,S(-.3)),(S(side*.28),0,S(-1.2)),S(.13),SECONDARY,"SECONDARY")
            for z in (-.45,-.1,.25,.6,1.05,1.28): torus("MUMMY_WRAP",(0,0,S(z)),S(.4 if z<.8 else .3),S(.035),ACCENT,"ACCENT")
            eyes([(S(-.12),S(-.29),S(1.22)),(S(.12),S(-.29),S(1.22))])
        elif variant == 5:  # bone knight
            cube("BONE_KNIGHT_TORSO",(0,0,S(.25)),(S(.56),S(.38),S(.72)),PRIMARY,"PRIMARY",.1)
            ico("SKULL_HELM",(0,0,S(1.2)),(S(.38),S(.32),S(.4)),ACCENT,"ACCENT",2)
            for side in (-1,1): limb("BONE_KNIGHT_LEG",(S(side*.22),0,S(-.3)),(S(side*.32),0,S(-1.18)),S(.12),SECONDARY,"SECONDARY")
            prism_xz("BONE_SHIELD",[(-S(1.05),S(.55)),(-S(1.35),S(.05)),(-S(1.05),S(-.78)),(-S(.68),S(-.38)),(-S(.68),S(.42))],S(.2),PRIMARY,"PRIMARY",.05)
            prism_xz("BONE_SWORD",[(S(.58),S(-.72)),(S(.72),S(.78)),(S(.85),S(-.72))],S(.15),EMISSIVE,"EMISSIVE",.025)
            eyes([(S(-.12),S(-.31),S(1.24)),(S(.12),S(-.31),S(1.24))])
        else:  # crawling torso
            uv_sphere("CRAWLER_TORSO",(0,0,S(-.1)),(S(.58),S(.4),S(.72)),SECONDARY,"SECONDARY")
            uv_sphere("CRAWLER_SKULL",(0,0,S(.78)),(S(.36),S(.32),S(.38)),PRIMARY,"PRIMARY")
            for side in (-1,1): curve_tube("CRAWLER_ARM",[(S(side*.32),0,S(.25)),(S(side*.82),0,S(-.15)),(S(side*1.0),S(-.08),S(-.75))],S(.09),ACCENT,"ACCENT")
            for z in (-.32,-.1,.12,.34): cylinder_between("EXPOSED_RIB",(-S(.38),S(-.35),S(z)),(S(.38),S(-.35),S(z)),S(.035),PRIMARY,"PRIMARY",14)
            curve_tube("SPINE_TAIL",[(0,0,S(-.48)),(S(-.16),0,S(-.92)),(S(.14),0,S(-1.3))],S(.065),PRIMARY,"PRIMARY")
            eyes([(S(-.12),S(-.31),S(.82)),(S(.12),S(-.31),S(.82))])

    elif archetype == "wraith":
        if variant == 4:  # candle ghost
            cone("CANDLE_WRAITH",(0,0,S(-.12)),S(.7),S(.22),S(2.0),PRIMARY,"PRIMARY",42)
            for index in range(5):
                angle=math.tau*index/5
                cylinder("CANDLE",(S(.55*math.cos(angle)),S(.2*math.sin(angle)),S(.45+.18*math.sin(angle))),S(.06),S(.45),SECONDARY,"SECONDARY",18,.015)
                cone("CANDLE_FLAME",(S(.55*math.cos(angle)),S(.2*math.sin(angle)),S(.79+.18*math.sin(angle))),S(.08),0,S(.32),EMISSIVE,"EMISSIVE",18)
            eyes([(S(-.13),S(-.48),S(.42)),(S(.13),S(-.48),S(.42))])
        elif variant == 5:  # banshee
            cone("BANSHEE_DRESS",(0,0,S(-.18)),S(.72),S(.24),S(2.25),SECONDARY,"SECONDARY",44)
            uv_sphere("BANSHEE_HEAD",(0,0,S(1.08)),(S(.38),S(.32),S(.42)),PRIMARY,"PRIMARY")
            torus("BANSHEE_MOUTH",(0,S(-.32),S(.98)),S(.15),S(.055),EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            for side in (-1,1): curve_tube("BANSHEE_ARM",[(S(side*.25),0,S(.5)),(S(side*.75),0,S(.72)),(S(side*1.12),0,S(.42))],S(.06),ACCENT,"ACCENT")
            curve_tube("BANSHEE_HAIR",[(-S(.35),0,S(1.28)),(-S(.72),0,S(.62)),(-S(.58),0,S(-.25))],S(.09),SECONDARY,"SECONDARY")
            curve_tube("BANSHEE_HAIR",[(S(.35),0,S(1.28)),(S(.72),0,S(.62)),(S(.58),0,S(-.25))],S(.09),SECONDARY,"SECONDARY")
            eyes([(S(-.13),S(-.3),S(1.15)),(S(.13),S(-.3),S(1.15))])
        else:  # reaper
            cone("REAPER_ROBE",(0,0,S(-.2)),S(.78),S(.2),S(2.3),PRIMARY,"PRIMARY",46)
            torus("REAPER_HOOD",(0,0,S(1.0)),S(.5),S(.2),SECONDARY,"SECONDARY",(math.pi/2,0,0))
            uv_sphere("REAPER_VOID",(0,S(-.28),S(1.0)),(S(.32),S(.14),S(.34)),SECONDARY,"SECONDARY")
            curve_tube("REAPER_SCYTHE_SHAFT",[(S(.62),0,S(-1.0)),(S(.72),0,S(.45)),(S(.58),0,S(1.42))],S(.055),ACCENT,"ACCENT")
            prism_xz("REAPER_SCYTHE",[(S(.56),S(1.35)),(S(1.02),S(1.62)),(S(1.62),S(1.88)),(S(1.25),S(1.45)),(S(.75),S(1.2))],S(.14),EMISSIVE,"EMISSIVE",.03)
            eyes([(S(-.12),S(-.4),S(1.04)),(S(.12),S(-.4),S(1.04))])

    elif archetype == "construct":
        if variant == 4:  # clay idol
            cube("CLAY_IDOL_TORSO",(0,0,S(.15)),(S(.62),S(.44),S(.76)),SECONDARY,"SECONDARY",.16)
            cube("CLAY_IDOL_HEAD",(0,0,S(1.15)),(S(.48),S(.4),S(.38)),PRIMARY,"PRIMARY",.13)
            for side in (-1,1):
                cube("CLAY_IDOL_ARM",(S(side*.78),0,S(.24)),(S(.26),S(.3),S(.72)),SECONDARY,"SECONDARY",.12)
                cube("CLAY_IDOL_FOOT",(S(side*.28),S(-.12),S(-.85)),(S(.3),S(.42),S(.46)),PRIMARY,"PRIMARY",.11)
            prism_xz("CLAY_GLYPH",[(-S(.18),S(.55)),(0,S(.18)),(S(.18),S(.55)),(0,S(-.2))],S(.9),EMISSIVE,"EMISSIVE",.02)
        elif variant == 5:  # iron automaton
            cylinder("AUTOMATON_TORSO",(0,0,S(.18)),S(.52),S(1.35),PRIMARY,"PRIMARY",40,.08)
            cylinder("AUTOMATON_HEAD",(0,0,S(1.12)),S(.38),S(.48),ACCENT,"ACCENT",36,.06)
            for side in (-1,1):
                for z,r in ((.58,.22),(.05,.18),(-.55,.2)): torus("AUTOMATON_GEAR",(S(side*.58),0,S(z)),S(r),S(.05),SECONDARY,"SECONDARY")
                limb("AUTOMATON_LEG",(S(side*.22),0,S(-.28)),(S(side*.3),0,S(-1.22)),S(.11),PRIMARY,"PRIMARY")
            cylinder("AUTOMATON_EYE",(0,S(-.43),S(1.15)),S(.15),S(.1),EMISSIVE,"EMISSIVE",24,.02).rotation_euler[0]=math.pi/2
        else:  # crystal sentinel
            ico("SENTINEL_TORSO",(0,0,S(.2)),(S(.65),S(.45),S(.82)),PRIMARY,"PRIMARY",2)
            ico("SENTINEL_HEAD",(0,0,S(1.2)),(S(.38),S(.3),S(.4)),EMISSIVE,"EMISSIVE",2)
            for side in (-1,1):
                arm=cone("SENTINEL_ARM",(S(side*.72),0,S(.2)),S(.2),S(.1),S(1.25),ACCENT,"ACCENT",6);arm.rotation_euler[1]=side*.28
                leg=cone("SENTINEL_LEG",(S(side*.28),0,S(-.72)),S(.22),S(.12),S(1.25),PRIMARY,"PRIMARY",6)
            for side in (-1,1): cone("SENTINEL_SHOULDER",(S(side*.58),0,S(.82)),S(.18),0,S(.72),EMISSIVE,"EMISSIVE",6)

    elif archetype == "plant":
        if variant == 4:  # mushroom walker
            cylinder("MUSHROOM_STEM",(0,0,S(-.18)),S(.32),S(1.55),SECONDARY,"SECONDARY",32,.05)
            uv_sphere("MUSHROOM_CAP",(0,0,S(.8)),(S(.92),S(.64),S(.38)),PRIMARY,"PRIMARY")
            for side in (-1,1):
                curve_tube("MUSHROOM_ARM",[(S(side*.2),0,S(.25)),(S(side*.72),0,S(-.05)),(S(side*.92),0,S(.18))],S(.08),ACCENT,"ACCENT")
                curve_tube("MUSHROOM_ROOT",[(S(side*.15),0,S(-.85)),(S(side*.45),0,S(-1.18)),(S(side*.72),0,S(-1.1))],S(.09),SECONDARY,"SECONDARY")
            for index in range(7): ico("CAP_SPOT",(S(-.62+index*.2),S(-.48),S(.86+abs(index-3)*.06)),(S(.07),S(.035),S(.07)),EMISSIVE,"EMISSIVE",2)
            eyes([(S(-.11),S(-.31),S(.25)),(S(.11),S(-.31),S(.25))])
        elif variant == 5:  # thorn beast
            uv_sphere("THORN_BODY",(0,0,S(-.05)),(S(.82),S(.5),S(.62)),SECONDARY,"SECONDARY")
            uv_sphere("THORN_HEAD",(S(.68),0,S(.48)),(S(.42),S(.34),S(.38)),PRIMARY,"PRIMARY")
            for x in (-.55,-.16,.25,.55): limb("THORN_LEG",(S(x),0,S(-.28)),(S(x),0,S(-1.0)),S(.11),PRIMARY,"PRIMARY")
            for index in range(8):
                x=S(-.62+index*.18);thorn=cone("BACK_THORN",(x,0,S(.55+math.sin(index)*.12)),S(.1),0,S(.5),ACCENT,"ACCENT",16);thorn.rotation_euler[1]=(index-3.5)*.07
            curve_tube("BRAMBLE_TAIL",[(S(-.72),0,S(.05)),(S(-1.2),0,S(.28)),(S(-1.48),0,S(.62))],S(.09),EMISSIVE,"EMISSIVE")
            eyes([(S(.56),S(-.33),S(.56)),(S(.76),S(-.33),S(.56))])
        else:  # vine knot
            for index in range(9):
                angle=math.tau*index/9
                curve_tube("VINE",[(0,0,S(.05)),(S(.55*math.cos(angle)),S(.12*math.sin(angle)),S(.35*math.sin(angle))), (S(1.05*math.cos(angle+.18)),0,S(-.75+.35*math.sin(angle)))],S(.09),PRIMARY if index%2 else SECONDARY,"PRIMARY" if index%2 else "SECONDARY")
            ico("VINE_HEART",(0,S(-.25),S(.08)),(S(.48),S(.28),S(.55)),ACCENT,"ACCENT",3)
            eyes([(S(-.14),S(-.5),S(.16)),(S(.14),S(-.5),S(.16))])

    elif archetype == "elemental":
        if variant == 4:  # rock titan
            ico("ROCK_TORSO",(0,0,S(.18)),(S(.72),S(.52),S(.78)),PRIMARY,"PRIMARY",2)
            ico("ROCK_HEAD",(0,0,S(1.2)),(S(.4),S(.34),S(.38)),ACCENT,"ACCENT",2)
            for side in (-1,1):
                ico("ROCK_ARM",(S(side*.82),0,S(.18)),(S(.34),S(.3),S(.72)),PRIMARY,"PRIMARY",2)
                ico("ROCK_LEG",(S(side*.28),0,S(-.82)),(S(.3),S(.32),S(.58)),SECONDARY,"SECONDARY",2)
            ico("MAGMA_CORE",(0,S(-.48),S(.24)),(S(.24),S(.08),S(.28)),EMISSIVE,"EMISSIVE",3)
        elif variant == 5:  # water sprite
            uv_sphere("WATER_BODY",(0,0,S(.05)),(S(.68),S(.5),S(.82)),PRIMARY,"PRIMARY")
            for index in range(7):
                angle=math.tau*index/7
                curve_tube("WATER_RIBBON",[(S(.35*math.cos(angle)),0,S(.15+.25*math.sin(angle))),(S(.78*math.cos(angle+.25)),0,S(-.35)),(S(1.1*math.cos(angle+.5)),0,S(-.85))],S(.055),ACCENT,"ACCENT")
            ico("WATER_CORE",(0,S(-.38),S(.12)),(S(.28),S(.12),S(.34)),EMISSIVE,"EMISSIVE",3)
            eyes([(S(-.14),S(-.48),S(.34)),(S(.14),S(-.48),S(.34))])
        else:  # storm orb
            uv_sphere("STORM_ORB",(0,0,S(.12)),(S(.68),S(.68),S(.68)),PRIMARY,"PRIMARY")
            for axis in ((0,0,0),(math.pi/2,0,0),(0,math.pi/2,0)): torus("STORM_RING",(0,0,S(.12)),S(.92),S(.055),ACCENT,"ACCENT",axis)
            for index in range(8):
                angle=math.tau*index/8
                prism_xz("LIGHTNING",[(0,S(.1)),(S(.16*math.cos(angle)),S(.48)),(S(.05*math.cos(angle)),S(.72)),(S(.35*math.cos(angle)),S(1.08))],S(.08),EMISSIVE,"EMISSIVE",.015)
            eyes([(S(-.14),S(-.62),S(.2)),(S(.14),S(-.62),S(.2))])

    elif archetype == "aberration":
        if variant == 4:  # brain walker
            uv_sphere("BRAIN",(0,0,S(.48)),(S(.72),S(.55),S(.6)),PRIMARY,"PRIMARY")
            for index in range(7):
                angle=math.tau*index/7
                curve_tube("BRAIN_FOLD",[(S(.45*math.cos(angle)),S(-.5),S(.25+.35*math.sin(angle))),(S(.58*math.cos(angle+.22)),S(-.55),S(.62+.28*math.sin(angle)))],S(.045),ACCENT,"ACCENT")
            for side in (-1,1):
                for row in range(2): limb("BRAIN_LEG",(S(side*(.25+row*.12)),0,S(.1-row*.18)),(S(side*(.72+row*.3)),0,S(-1.02+row*.08)),S(.055),SECONDARY,"SECONDARY")
            eyes([(S(-.16),S(-.53),S(.58)),(S(.16),S(-.53),S(.58))])
        elif variant == 5:  # mouth tower
            cone("MAW_TOWER",(0,0,S(-.08)),S(.72),S(.42),S(2.25),PRIMARY,"PRIMARY",48)
            torus("VERTICAL_MAW",(0,S(-.52),S(.28)),S(.42),S(.13),ACCENT,"ACCENT",(math.pi/2,0,0))
            for index in range(10):
                angle=math.tau*index/10
                tooth=cone("MAW_TOOTH",(S(.31*math.cos(angle)),S(-.64),S(.28+.31*math.sin(angle))),S(.055),0,S(.3),EMISSIVE,"EMISSIVE",12);tooth.rotation_euler[0]=math.pi/2
            for side in (-1,1): curve_tube("MAW_ARM",[(S(side*.3),0,S(.45)),(S(side*.82),0,S(.1)),(S(side*1.08),0,S(-.48))],S(.08),SECONDARY,"SECONDARY")
        else:  # eye lattice
            for ring_index,radius in enumerate((.28,.62,.96)):
                count=3+ring_index*3
                for index in range(count):
                    angle=math.tau*index/count
                    pos=(S(radius*math.cos(angle)),0,S(.18+radius*math.sin(angle)))
                    ico("LATTICE_EYE",pos,(S(.16),S(.08),S(.18)),EMISSIVE if ring_index==0 else ACCENT,"EMISSIVE" if ring_index==0 else "ACCENT",2)
                    if ring_index>0: cylinder_between("LATTICE_BONE",(0,0,S(.18)),pos,S(.035),PRIMARY,"PRIMARY",14)
            for index in range(5):
                angle=math.tau*index/5
                curve_tube("LATTICE_TENTACLE",[(S(.3*math.cos(angle)),0,S(-.05)),(S(.72*math.cos(angle)),0,S(-.65)),(S(1.0*math.cos(angle+.25)),0,S(-1.1))],S(.06),SECONDARY,"SECONDARY")

    elif archetype == "mimic":
        if variant == 4:  # door mimic
            cube("DOOR_BODY",(0,0,S(.05)),(S(.72),S(.28),S(1.2)),PRIMARY,"PRIMARY",.1)
            prism_xz("DOOR_MOUTH",[(-S(.5),S(.35)),(0,-S(.05)),(S(.5),S(.35)),(0,S(.18))],S(.62),SECONDARY,"SECONDARY",.035)
            for x in (-.38,-.14,.14,.38): cone("DOOR_TOOTH",(S(x),S(-.34),S(.18)),S(.06),0,S(.28),EMISSIVE,"EMISSIVE",12)
            uv_sphere("DOOR_EYE",(S(.38),S(-.32),S(.72)),(S(.13),S(.06),S(.16)),ACCENT,"ACCENT",24,12)
            for side in (-1,1): curve_tube("DOOR_LEG",[(S(side*.32),0,S(-1.0)),(S(side*.62),0,S(-1.28)),(S(side*.82),0,S(-1.18))],S(.08),SECONDARY,"SECONDARY")
        elif variant == 5:  # weapon-rack mimic
            cube("RACK_BODY",(0,0,S(-.1)),(S(.82),S(.32),S(.82)),SECONDARY,"SECONDARY",.09)
            for x in (-.62,-.2,.22,.62): cylinder_between("FALSE_WEAPON",(S(x),0,S(-.82)),(S(x+(x*.2)),0,S(1.38)),S(.055),PRIMARY,"PRIMARY",18)
            prism_xz("RACK_MOUTH",[(-S(.62),S(.18)),(0,-S(.32)),(S(.62),S(.18)),(0,S(.42))],S(.7),ACCENT,"ACCENT",.035)
            for x in (-.45,-.15,.15,.45): cone("RACK_TOOTH",(S(x),S(-.42),S(.12)),S(.055),0,S(.28),EMISSIVE,"EMISSIVE",12)
            eyes([(S(-.32),S(-.36),S(.62)),(S(.32),S(-.36),S(.62))])
        else:  # satchel mimic
            uv_sphere("SATCHEL_BODY",(0,0,S(-.18)),(S(.84),S(.52),S(.72)),SECONDARY,"SECONDARY")
            curve_tube("SATCHEL_STRAP",[(-S(.62),0,S(.5)),(0,0,S(1.25)),(S(.62),0,S(.5))],S(.09),PRIMARY,"PRIMARY")
            prism_xz("SATCHEL_FLAP",[(-S(.7),S(.62)),(-S(.55),S(-.05)),(0,-S(.42)),(S(.55),-S(.05)),(S(.7),S(.62))],S(.64),ACCENT,"ACCENT",.055)
            for x in (-.48,-.16,.16,.48): cone("SATCHEL_TOOTH",(S(x),S(-.55),S(-.18)),S(.06),0,S(.3),EMISSIVE,"EMISSIVE",12)
            eyes([(S(-.24),S(-.48),S(.42)),(S(.24),S(-.48),S(.42))])

    elif archetype == "swarm":
        kind_offset={4:0,5:1,6:2}[variant]
        count=(20,16,24)[kind_offset]
        for index in range(count):
            angle=index*2.399963+kind_offset*.7;radius=S(.18+.055*index);x=S(math.cos(angle))*radius;y=S(math.sin(angle))*radius*.32;z=S(-.82+index*(1.55/max(1,count-1)))
            if variant == 4:  # bees
                uv_sphere("BEE",(x,y,z),(S(.13),S(.08),S(.17)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",18,10)
                for side in (-1,1): uv_sphere("BEE_WING",(x+S(side*.1),y,z+S(.08)),(S(.09),S(.025),S(.13)),EMISSIVE,"EMISSIVE",14,8)
            elif variant == 5:  # skulls
                ico("SKULL_SWARM",(x,y,z),(S(.16),S(.12),S(.18)),PRIMARY,"PRIMARY",2)
                for side in (-1,1): uv_sphere("SKULL_EYE",(x+S(side*.05),y-S(.11),z+S(.03)),(S(.025),S(.015),S(.03)),EMISSIVE,"EMISSIVE",12,6)
            else:  # beetles
                uv_sphere("BEETLE_SWARM",(x,y,z),(S(.15),S(.1),S(.18)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",18,10)
                cylinder_between("BEETLE_SEAM",(x,y-S(.09),z-S(.12)),(x,y-S(.09),z+S(.12)),S(.012),EMISSIVE,"EMISSIVE",10)

    elif archetype == "bat":
        if variant == 4: body=(.5,.32,.68);head=(.42,.34,.38);wing=1.72;ear=.48;snout="LEAF"
        elif variant == 5: body=(.62,.36,.72);head=(.48,.38,.42);wing=1.48;ear=.38;snout="VAMPIRE"
        else: body=(.44,.3,.76);head=(.36,.3,.38);wing=1.92;ear=.82;snout="LONG_EARED"
        uv_sphere(f"{snout}_BAT_BODY",(0,0,0),(S(body[0]),S(body[1]),S(body[2])),SECONDARY,"SECONDARY",40,24)
        uv_sphere(f"{snout}_BAT_HEAD",(0,S(-.03),S(.72)),(S(head[0]),S(head[1]),S(head[2])),PRIMARY,"PRIMARY",40,24)
        if variant == 4:
            prism_xz("LEAF_NOSE",[(-S(.16),S(.56)),(0,S(1.06)),(S(.16),S(.56)),(0,S(.35))],S(.18),ACCENT,"ACCENT",.025)
        elif variant == 5:
            for side in (-1,1): cone("VAMPIRE_FANG",(S(side*.1),S(-.38),S(.55)),S(.035),0,S(.26),EMISSIVE,"EMISSIVE",12).rotation_euler[0]=math.pi
        else:
            uv_sphere("LONG_EARED_MUZZLE",(0,S(-.32),S(.62)),(S(.22),S(.14),S(.18)),ACCENT,"ACCENT",24,14)
        for side in (-1,1):
            cone("BAT_EAR",(S(side*.22),0,S(1.15)),S(.16 if variant!=6 else .2),S(.025),S(ear),PRIMARY,"PRIMARY",24)
            shoulder=(S(side*.3),0,S(.42));elbow=(S(side*.92),0,S(.62));wrist=(S(side*wing),0,S(.02))
            limb("BAT_WING_ARM",shoulder,elbow,S(.06),PRIMARY,"PRIMARY")
            limb("BAT_WING_FOREARM",elbow,wrist,S(.045),PRIMARY,"PRIMARY")
            prism_xz("BAT_WING",[(S(side*.24),S(.42)),(S(side*.92),S(.62)),(S(side*wing),S(.02)),(S(side*(wing*.58)),S(-.55)),(S(side*.28),S(-.3))],S(.07),ACCENT,"ACCENT",.022)
        eyes([(S(-.13),S(-.34),S(.78)),(S(.13),S(-.34),S(.78))])


def build_creature_final_variant(archetype, variant, companion=False):
    """Build distinct v7-v8 enemy and companion anatomies."""
    if variant not in (7, 8):
        raise ValueError(f"Final creature variant must be 7-8, got {variant}")
    scale=.78 if companion else 1.0
    def S(value): return value*scale

    if archetype == "humanoid":
        if variant == 7:  # archer
            uv_sphere("ARCHER_TORSO",(0,0,S(.24)),(S(.48),S(.32),S(.7)),SECONDARY,"SECONDARY");uv_sphere("ARCHER_HEAD",(0,0,S(1.15)),(S(.33),S(.29),S(.35)),PRIMARY,"PRIMARY")
            for side in (-1,1): limb("ARCHER_LEG",(S(side*.2),0,S(-.28)),(S(side*.28),0,S(-1.18)),S(.12),SECONDARY,"SECONDARY")
            curve_tube("ARCHER_BOW",[(S(.55),0,S(-.7)),(S(1.08),0,S(.1)),(S(.58),0,S(1.05))],S(.055),ACCENT,"ACCENT");curve_tube("ARCHER_STRING",[(S(.55),0,S(-.7)),(S(.82),0,S(.1)),(S(.58),0,S(1.05))],S(.012),EMISSIVE,"EMISSIVE");eyes([(S(-.12),S(-.28),S(1.2)),(S(.12),S(-.28),S(1.2))])
        else:  # shieldbearer
            cube("SHIELDBEARER_TORSO",(0,0,S(.22)),(S(.62),S(.42),S(.76)),PRIMARY,"PRIMARY",.1);uv_sphere("SHIELDBEARER_HELM",(0,0,S(1.2)),(S(.4),S(.35),S(.42)),ACCENT,"ACCENT")
            for side in (-1,1): limb("SHIELDBEARER_LEG",(S(side*.24),0,S(-.3)),(S(side*.32),0,S(-1.2)),S(.15),SECONDARY,"SECONDARY")
            prism_xz("GREAT_SHIELD",[(-S(1.42),S(.88)),(-S(1.62),S(.1)),(-S(1.4),S(-1.15)),(-S(.58),S(-1.15)),(-S(.52),S(.9))],S(.24),PRIMARY,"PRIMARY",.07);eyes([(S(-.13),S(-.34),S(1.24)),(S(.13),S(-.34),S(1.24))])
    elif archetype == "beast":
        if variant == 7:  # ram
            uv_sphere("RAM_BODY",(S(-.12),0,0),(S(.86),S(.46),S(.58)),SECONDARY,"SECONDARY");uv_sphere("RAM_HEAD",(S(.7),0,S(.46)),(S(.44),S(.37),S(.42)),PRIMARY,"PRIMARY")
            for x in (-.56,-.15,.26,.58): limb("RAM_LEG",(S(x),0,S(-.25)),(S(x),0,S(-1.05)),S(.11),PRIMARY,"PRIMARY")
            for side in (-1,1): curve_tube("RAM_HORN",[(S(.62+side*.18),0,S(.75)),(S(.9+side*.32),0,S(1.0)),(S(.78+side*.48),0,S(.55))],S(.09),ACCENT,"ACCENT")
            eyes([(S(.58),S(-.37),S(.55)),(S(.8),S(-.37),S(.55))])
        else:  # crocodile
            uv_sphere("CROC_BODY",(S(-.15),0,S(-.05)),(S(1.05),S(.42),S(.42)),PRIMARY,"PRIMARY");cube("CROC_HEAD",(S(.92),S(-.03),S(.18)),(S(.62),S(.34),S(.25)),ACCENT,"ACCENT",.08)
            for x in (-.62,-.2,.32,.62): limb("CROC_LEG",(S(x),0,S(-.22)),(S(x),0,S(-.72)),S(.09),SECONDARY,"SECONDARY")
            curve_tube("CROC_TAIL",[(S(-1.0),0,S(-.05)),(S(-1.55),0,S(-.18)),(S(-2.0),0,S(.02))],S(.17),PRIMARY,"PRIMARY")
            for x in (-.8,-.45,-.1,.25): cone("CROC_SCUTE",(S(x),0,S(.42)),S(.08),0,S(.3),EMISSIVE,"EMISSIVE",14)
            eyes([(S(.78),S(-.34),S(.35)),(S(1.02),S(-.34),S(.35))])
    elif archetype == "dragon":
        if variant == 7:  # serpentine dragon
            curve_tube("SERPENT_DRAGON",[(S(-1.5),0,S(-.4)),(S(-.8),0,S(-.1)),(0,0,S(.2)),(S(.65),0,S(.62)),(S(.9),0,S(1.15))],S(.28),PRIMARY,"PRIMARY");uv_sphere("SERPENT_DRAGON_HEAD",(S(.92),0,S(1.28)),(S(.46),S(.36),S(.4)),ACCENT,"ACCENT")
            for side in (-1,1): prism_xz("SERPENT_WING",[(S(side*.18),S(.52)),(S(side*1.18),S(1.22)),(S(side*.82),S(.08)),(S(side*.3),S(-.2))],S(.1),SECONDARY,"SECONDARY",.035)
            for z in (-.2,.2,.6,1.0): cone("SERPENT_SPINE",(S(.25*z),0,S(z)),S(.07),0,S(.32),EMISSIVE,"EMISSIVE",14);eyes([(S(.8),S(-.35),S(1.34)),(S(1.02),S(-.35),S(1.34))])
        else:  # turtle dragon
            uv_sphere("TURTLE_DRAGON_SHELL",(0,0,S(.08)),(S(.95),S(.58),S(.72)),PRIMARY,"PRIMARY");torus("SHELL_RIM",(0,0,S(.08)),S(.82),S(.12),ACCENT,"ACCENT")
            curve_tube("TURTLE_NECK",[(S(.55),0,S(.18)),(S(.88),0,S(.48)),(S(1.05),0,S(.72))],S(.18),SECONDARY,"SECONDARY");uv_sphere("TURTLE_DRAGON_HEAD",(S(1.12),0,S(.78)),(S(.4),S(.34),S(.36)),ACCENT,"ACCENT")
            for x in (-.62,-.2,.28,.62): limb("TURTLE_DRAGON_LEG",(S(x),0,S(-.25)),(S(x),0,S(-.92)),S(.14),SECONDARY,"SECONDARY");eyes([(S(1.0),S(-.33),S(.84)),(S(1.2),S(-.32),S(.84))])
    elif archetype == "serpent":
        points=[(S(math.sin(i*.58)*.36),S(math.cos(i*.42)*.1),S(-1.3+i*.24)) for i in range(10)];curve_tube("FINAL_SERPENT",points,S(.21),PRIMARY,"PRIMARY");uv_sphere("FINAL_SERPENT_HEAD",points[-1],(S(.4),S(.32),S(.34)),ACCENT,"ACCENT")
        if variant == 7:
            for side in (-1,1): prism_xz("SERPENT_WING",[(0,S(.68)),(S(side*.9),S(1.18)),(S(side*.62),S(.18)),(0,S(.4))],S(.1),SECONDARY,"SECONDARY",.03)
            cone("SERPENT_CREST",(0,0,S(1.28)),S(.12),0,S(.48),EMISSIVE,"EMISSIVE",16)
        else:
            for index in range(6): torus("SANDWORM_RING",(points[index][0],points[index][1],points[index][2]),S(.25),S(.045),ACCENT,"ACCENT")
            torus("SANDWORM_MAW",(points[-1][0],S(-.32),points[-1][2]),S(.25),S(.08),EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
        eyes([(S(-.12),S(-.28),S(.98)),(S(.12),S(-.28),S(.98))])
    elif archetype == "insect":
        if variant == 7:  # butterfly
            uv_sphere("BUTTERFLY_BODY",(0,0,0),(S(.22),S(.2),S(.7)),SECONDARY,"SECONDARY")
            for side in (-1,1):
                prism_xz("BUTTERFLY_FOREWING",[(S(side*.1),S(.45)),(S(side*1.25),S(1.12)),(S(side*1.42),S(.05)),(S(side*.28),S(-.18))],S(.09),PRIMARY,"PRIMARY",.035);prism_xz("BUTTERFLY_HINDWING",[(S(side*.22),S(.05)),(S(side*1.08),S(-.12)),(S(side*.72),S(-1.02)),(S(side*.18),S(-.45))],S(.09),ACCENT,"ACCENT",.035)
            uv_sphere("BUTTERFLY_HEAD",(0,0,S(.82)),(S(.24),S(.2),S(.23)),PRIMARY,"PRIMARY");eyes([(S(-.08),S(-.2),S(.86)),(S(.08),S(-.2),S(.86))])
        else:  # stag beetle
            uv_sphere("STAG_BEETLE_BODY",(0,0,S(-.12)),(S(.64),S(.46),S(.78)),PRIMARY,"PRIMARY");uv_sphere("STAG_BEETLE_HEAD",(0,0,S(.7)),(S(.42),S(.35),S(.36)),ACCENT,"ACCENT")
            for side in (-1,1):
                curve_tube("MANDIBLE",[(S(side*.18),0,S(.82)),(S(side*.42),0,S(1.22)),(S(side*.68),0,S(1.35))],S(.065),EMISSIVE,"EMISSIVE")
                for row in range(3): limb("STAG_BEETLE_LEG",(S(side*.3),0,S(.38-row*.36)),(S(side*(.9+row*.12)),0,S(.12-row*.4)),S(.05),SECONDARY,"SECONDARY")
            eyes([(S(-.12),S(-.32),S(.76)),(S(.12),S(-.32),S(.76))])
    elif archetype == "arachnid":
        if variant == 7:  # tarantula
            uv_sphere("TARANTULA_ABDOMEN",(0,0,S(-.22)),(S(.66),S(.52),S(.7)),SECONDARY,"SECONDARY");uv_sphere("TARANTULA_HEAD",(0,0,S(.48)),(S(.42),S(.37),S(.36)),PRIMARY,"PRIMARY")
            for row in range(4):
                for side in (-1,1):
                    limb("TARANTULA_UPPER",(S(side*.28),0,S(.36-row*.24)),(S(side*(.72+row*.08)),0,S(.48-row*.28)),S(.07),PRIMARY,"PRIMARY");limb("TARANTULA_LOWER",(S(side*(.72+row*.08)),0,S(.48-row*.28)),(S(side*(1.2+row*.1)),0,S(-.28-row*.2)),S(.05),SECONDARY,"SECONDARY")
            eyes([(S(-.16),S(-.35),S(.55)),(0,S(-.38),S(.6)),(S(.16),S(-.35),S(.55))])
        else:  # tiny-bodied mite with enormous legs
            uv_sphere("MITE_BODY",(0,0,S(.22)),(S(.36),S(.31),S(.42)),ACCENT,"ACCENT")
            for row in range(4):
                for side in (-1,1): limb("MITE_LEG",(S(side*.2),0,S(.38-row*.14)),(S(side*(1.35-row*.08)),0,S(-.8+row*.18)),S(.035),PRIMARY if row%2 else SECONDARY,"PRIMARY" if row%2 else "SECONDARY")
            eyes([(S(-.1),S(-.3),S(.3)),(S(.1),S(-.3),S(.3))])
    elif archetype == "avian":
        if variant == 7:  # hawk
            uv_sphere("HAWK_BODY",(0,0,0),(S(.46),S(.34),S(.78)),PRIMARY,"PRIMARY");uv_sphere("HAWK_HEAD",(0,0,S(.82)),(S(.32),S(.28),S(.32)),ACCENT,"ACCENT")
            for side in (-1,1): prism_xz("HAWK_WING",[(S(side*.12),S(.48)),(S(side*1.55),S(.68)),(S(side*.98),S(-.28)),(S(side*.25),S(-.48))],S(.1),SECONDARY,"SECONDARY",.03)
            cone("HAWK_BEAK",(0,S(-.32),S(.82)),S(.1),0,S(.38),EMISSIVE,"EMISSIVE",16).rotation_euler[0]=math.pi/2;eyes([(S(-.1),S(-.27),S(.9)),(S(.1),S(-.27),S(.9))])
        else:  # penguin
            uv_sphere("PENGUIN_BODY",(0,0,S(-.05)),(S(.58),S(.42),S(.92)),PRIMARY,"PRIMARY");uv_sphere("PENGUIN_BELLY",(0,S(-.4),S(-.08)),(S(.38),S(.12),S(.68)),SECONDARY,"SECONDARY")
            for side in (-1,1): prism_xz("PENGUIN_FLIPPER",[(S(side*.28),S(.45)),(S(side*.82),S(-.1)),(S(side*.5),S(-.72)),(S(side*.2),S(-.3))],S(.12),ACCENT,"ACCENT",.035)
            cone("PENGUIN_BEAK",(0,S(-.46),S(.62)),S(.11),0,S(.34),EMISSIVE,"EMISSIVE",16).rotation_euler[0]=math.pi/2;eyes([(S(-.11),S(-.38),S(.72)),(S(.11),S(-.38),S(.72))])
    elif archetype == "aquatic":
        if variant == 7:  # jellyfish
            uv_sphere("JELLY_DOME",(0,0,S(.55)),(S(.78),S(.62),S(.48)),PRIMARY,"PRIMARY")
            for index in range(8):
                angle=math.tau*index/8;curve_tube("JELLY_TENTACLE",[(S(.45*math.cos(angle)),0,S(.35)),(S(.58*math.cos(angle+.2)),0,S(-.42)),(S(.72*math.cos(angle-.18)),0,S(-1.25))],S(.045),ACCENT if index%2 else SECONDARY,"ACCENT" if index%2 else "SECONDARY")
            eyes([(S(-.13),S(-.55),S(.62)),(S(.13),S(-.55),S(.62))])
        else:  # crab
            uv_sphere("CRAB_BODY",(0,0,S(.05)),(S(.72),S(.46),S(.5)),PRIMARY,"PRIMARY")
            for side in (-1,1):
                for row in range(3): limb("CRAB_LEG",(S(side*.35),0,S(.22-row*.25)),(S(side*(.95+row*.12)),0,S(-.4-row*.12)),S(.055),SECONDARY,"SECONDARY")
                limb("CRAB_CLAW_ARM",(S(side*.42),0,S(.38)),(S(side*1.0),0,S(.72)),S(.09),ACCENT,"ACCENT");uv_sphere("CRAB_CLAW",(S(side*1.18),0,S(.78)),(S(.34),S(.24),S(.28)),ACCENT,"ACCENT")
            eyes([(S(-.2),S(-.42),S(.45)),(S(.2),S(-.42),S(.45))])
    elif archetype == "ooze":
        if variant == 7:
            uv_sphere("MUSHROOM_SLIME",(0,0,S(-.3)),(S(.82),S(.64),S(.62)),PRIMARY,"PRIMARY");cylinder("SLIME_STEM",(0,0,S(.42)),S(.18),S(.75),SECONDARY,"SECONDARY",28,.03);uv_sphere("SLIME_CAP",(0,0,S(.9)),(S(.62),S(.48),S(.28)),ACCENT,"ACCENT")
            for x in (-.32,0,.32): ico("CAP_SPOT",(S(x),S(-.4),S(.92+abs(x)*.08)),(S(.07),S(.03),S(.07)),EMISSIVE,"EMISSIVE",2)
        else:
            uv_sphere("ROYAL_SLIME",(0,0,S(-.15)),(S(.82),S(.65),S(.88)),PRIMARY,"PRIMARY");torus("SLIME_CROWN_BAND",(0,0,S(.72)),S(.42),S(.09),ACCENT,"ACCENT")
            for x in (-.32,0,.32): cone("SLIME_CROWN_POINT",(S(x),0,S(1.02+(.18 if x==0 else 0))),S(.1),0,S(.55),EMISSIVE,"EMISSIVE",16)
        eyes([(S(-.14),S(-.58),S(.25)),(S(.14),S(-.58),S(.25))])
    elif archetype == "undead":
        if variant == 7:  # coffin knight
            prism_xz("COFFIN_BODY",[(-S(.58),S(1.15)),(-S(.78),S(.42)),(-S(.62),S(-1.08)),(0,-S(1.38)),(S(.62),-S(1.08)),(S(.78),S(.42)),(S(.58),S(1.15))],S(.48),PRIMARY,"PRIMARY",.08)
            uv_sphere("COFFIN_SKULL",(0,S(-.28),S(.65)),(S(.34),S(.14),S(.36)),SECONDARY,"SECONDARY")
            for side in (-1,1): curve_tube("COFFIN_ARM",[(S(side*.42),0,S(.28)),(S(side*.9),0,S(-.08)),(S(side*1.05),0,S(-.62))],S(.08),ACCENT,"ACCENT")
            eyes([(S(-.12),S(-.4),S(.72)),(S(.12),S(-.4),S(.72))])
        else:  # skeletal archer
            uv_sphere("BONE_ARCHER_SKULL",(0,0,S(1.12)),(S(.34),S(.29),S(.36)),PRIMARY,"PRIMARY");cylinder("BONE_ARCHER_SPINE",(0,0,S(.18)),S(.06),S(1.2),SECONDARY,"SECONDARY",16,.012)
            for side in (-1,1): limb("BONE_ARCHER_LEG",(S(side*.16),0,S(-.28)),(S(side*.26),0,S(-1.18)),S(.06),PRIMARY,"PRIMARY")
            curve_tube("BONE_ARCHER_BOW",[(S(.48),0,S(-.7)),(S(1.0),0,S(.1)),(S(.5),0,S(1.0))],S(.05),ACCENT,"ACCENT");eyes([(S(-.12),S(-.28),S(1.16)),(S(.12),S(-.28),S(1.16))])
    elif archetype == "wraith":
        if variant == 7:  # lantern spirit
            cone("LANTERN_SPIRIT",(0,0,S(-.18)),S(.68),S(.2),S(2.0),PRIMARY,"PRIMARY",42);cube("SPIRIT_LANTERN",(0,S(-.42),S(.38)),(S(.34),S(.12),S(.44)),ACCENT,"ACCENT",.06);uv_sphere("SPIRIT_FLAME",(0,S(-.56),S(.38)),(S(.16),S(.05),S(.25)),EMISSIVE,"EMISSIVE",24,12)
        else:  # mirror shade
            prism_xz("MIRROR_SHADE",[(-S(.62),S(1.1)),(-S(.82),S(-.48)),(0,-S(1.35)),(S(.82),-S(.48)),(S(.62),S(1.1)),(0,S(1.48))],S(.16),PRIMARY,"PRIMARY",.06);prism_xz("MIRROR_FACE",[(-S(.32),S(.62)),(0,S(.22)),(S(.32),S(.62)),(0,S(1.02))],S(.2),EMISSIVE,"EMISSIVE",.025)
            for side in (-1,1): curve_tube("SHADE_ARM",[(S(side*.28),0,S(.4)),(S(side*.8),0,S(.05)),(S(side*1.0),0,S(-.58))],S(.065),ACCENT,"ACCENT")
        eyes([(S(-.13),S(-.38),S(.72)),(S(.13),S(-.38),S(.72))])
    elif archetype == "construct":
        if variant == 7:  # spider automaton
            cube("SPIDER_MACHINE_CORE",(0,0,S(.18)),(S(.55),S(.4),S(.48)),PRIMARY,"PRIMARY",.1);torus("MACHINE_GEAR",(0,S(-.42),S(.2)),S(.3),S(.07),EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            for row in range(4):
                for side in (-1,1): limb("MACHINE_LEG",(S(side*.34),0,S(.38-row*.2)),(S(side*(1.1+row*.08)),0,S(-.72+row*.1)),S(.055),ACCENT if row%2 else SECONDARY,"ACCENT" if row%2 else "SECONDARY")
        else:  # floating obelisk
            prism_xz("OBELISK",[(-S(.42),S(.88)),(-S(.36),S(-.72)),(0,-S(1.18)),(S(.36),-S(.72)),(S(.42),S(.88)),(0,S(1.52))],S(.48),PRIMARY,"PRIMARY",.06)
            for z in (-.62,-.1,.42,.94): torus("OBELISK_RING",(0,0,S(z)),S(.48-abs(z)*.08),S(.055),ACCENT,"ACCENT")
            ico("OBELISK_CORE",(0,S(-.45),S(.22)),(S(.22),S(.08),S(.28)),EMISSIVE,"EMISSIVE",3)
    elif archetype == "plant":
        if variant == 7:  # pumpkin horror
            uv_sphere("PUMPKIN_BODY",(0,0,S(.25)),(S(.72),S(.58),S(.68)),PRIMARY,"PRIMARY");cylinder("PUMPKIN_STEM",(0,0,S(1.05)),S(.12),S(.5),SECONDARY,"SECONDARY",20,.025)
            for side in (-1,1): curve_tube("PUMPKIN_ARM",[(S(side*.35),0,S(.45)),(S(side*.82),0,S(.12)),(S(side*1.02),0,S(-.42))],S(.08),ACCENT,"ACCENT")
            prism_xz("PUMPKIN_MOUTH",[(-S(.32),S(.25)),(0,-S(.05)),(S(.32),S(.25)),(0,S(.08))],S(.72),EMISSIVE,"EMISSIVE",.02);eyes([(S(-.18),S(-.52),S(.52)),(S(.18),S(-.52),S(.52))])
        else:  # cactus brute
            cylinder("CACTUS_TRUNK",(0,0,S(-.02)),S(.35),S(2.1),PRIMARY,"PRIMARY",28,.05)
            for side in (-1,1): curve_tube("CACTUS_ARM",[(S(side*.25),0,S(.45)),(S(side*.72),0,S(.25)),(S(side*.72),0,S(.85))],S(.14),PRIMARY,"PRIMARY")
            for index in range(12):
                angle=math.tau*index/12;spike=cone("CACTUS_SPINE",(S(.34*math.cos(angle)),S(.34*math.sin(angle)),S(-.7+(index%4)*.48)),S(.025),0,S(.22),ACCENT,"ACCENT",10);spike.rotation_euler[1]=math.pi/2;spike.rotation_euler[2]=angle
            eyes([(S(-.12),S(-.34),S(.42)),(S(.12),S(-.34),S(.42))])
    elif archetype == "elemental":
        if variant == 7:  # ice golem
            ico("ICE_TORSO",(0,0,S(.18)),(S(.72),S(.5),S(.82)),PRIMARY,"PRIMARY",2);ico("ICE_HEAD",(0,0,S(1.22)),(S(.38),S(.32),S(.4)),EMISSIVE,"EMISSIVE",2)
            for side in (-1,1): cone("ICE_ARM",(S(side*.72),0,S(.18)),S(.22),S(.1),S(1.35),ACCENT,"ACCENT",6);cone("ICE_LEG",(S(side*.28),0,S(-.78)),S(.24),S(.12),S(1.25),PRIMARY,"PRIMARY",6)
        else:  # wind vortex
            for index in range(8):
                z=S(-.88+index*.26);torus("WIND_RING",(0,0,z),S(.72-index*.055),S(.06),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",(math.pi/2,0,index*.28))
            for side in (-1,1): curve_tube("WIND_ARM",[(S(side*.18),0,S(.35)),(S(side*.72),0,S(.58)),(S(side*1.12),0,S(.18))],S(.055),EMISSIVE,"EMISSIVE")
        eyes([(S(-.13),S(-.42),S(.48)),(S(.13),S(-.42),S(.48))])
    elif archetype == "aberration":
        if variant == 7:  # hand walker
            uv_sphere("PALM_BODY",(0,0,S(.05)),(S(.62),S(.4),S(.72)),PRIMARY,"PRIMARY")
            for index,x in enumerate((-.48,-.24,0,.24,.48)): curve_tube("HAND_FINGER",[(S(x*.65),0,S(.35)),(S(x),0,S(.88+abs(x)*.25)),(S(x*1.18),0,S(1.35+abs(x)*.18))],S(.07),SECONDARY,"SECONDARY")
            for side in (-1,1): curve_tube("HAND_LEG",[(S(side*.28),0,S(-.3)),(S(side*.72),0,S(-.78)),(S(side*.98),0,S(-1.05))],S(.09),ACCENT,"ACCENT")
            uv_sphere("PALM_EYE",(0,S(-.38),S(.08)),(S(.2),S(.08),S(.24)),EMISSIVE,"EMISSIVE",24,12)
        else:  # mirror blob
            for index in range(7):
                angle=math.tau*index/7;ico("MIRROR_SHARD",(S(.45*math.cos(angle)),0,S(.18+.55*math.sin(angle))),(S(.28),S(.14),S(.42)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",3)
            uv_sphere("MIRROR_CORE",(0,S(-.28),S(.18)),(S(.42),S(.24),S(.48)),SECONDARY,"SECONDARY");eyes([(S(-.14),S(-.5),S(.28)),(S(.14),S(-.5),S(.28))])
    elif archetype == "mimic":
        if variant == 7:  # book mimic
            cube("BOOK_BODY",(0,0,S(-.05)),(S(.82),S(.28),S(1.08)),PRIMARY,"PRIMARY",.08);cube("BOOK_COVER",(0,S(-.3),S(-.05)),(S(.9),S(.08),S(1.15)),ACCENT,"ACCENT",.04)
            prism_xz("BOOK_MOUTH",[(-S(.58),S(.28)),(0,-S(.16)),(S(.58),S(.28)),(0,S(.48))],S(.66),SECONDARY,"SECONDARY",.03)
            for x in (-.42,-.14,.14,.42): cone("BOOK_TOOTH",(S(x),S(-.4),S(.18)),S(.055),0,S(.26),EMISSIVE,"EMISSIVE",12);eyes([(S(-.25),S(-.38),S(.7)),(S(.25),S(-.38),S(.7))])
        else:  # barrel mimic
            cylinder("BARREL_BODY",(0,0,S(-.1)),S(.72),S(1.65),SECONDARY,"SECONDARY",40,.08)
            for z in (-.65,0,.65): torus("BARREL_HOOP",(0,0,S(z)),S(.72),S(.07),PRIMARY,"PRIMARY")
            prism_xz("BARREL_MOUTH",[(-S(.48),S(.28)),(0,-S(.18)),(S(.48),S(.28)),(0,S(.52))],S(.76),ACCENT,"ACCENT",.035)
            for x in (-.35,-.12,.12,.35): cone("BARREL_TOOTH",(S(x),S(-.58),S(.16)),S(.05),0,S(.25),EMISSIVE,"EMISSIVE",12);eyes([(S(-.22),S(-.56),S(.58)),(S(.22),S(-.56),S(.58))])
    elif archetype == "swarm":
        count=22 if variant==7 else 18
        for index in range(count):
            angle=index*2.399963;radius=S(.17+.058*index);x=S(math.cos(angle))*radius;y=S(math.sin(angle))*radius*.35;z=S(-.82+index*(1.6/max(1,count-1)))
            if variant==7:
                uv_sphere("MOTH_SWARM",(x,y,z),(S(.12),S(.07),S(.15)),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",16,8)
                for side in (-1,1): prism_xz("MOTH_WING",[(x,z),(x+S(side*.13),z+S(.12)),(x+S(side*.16),z-S(.08))],S(.04),EMISSIVE,"EMISSIVE",.01)
            else: ico("WISP_SWARM",(x,y,z),(S(.12),S(.09),S(.16)),EMISSIVE if index%2 else ACCENT,"EMISSIVE" if index%2 else "ACCENT",2)
    elif archetype == "bat":
        skeletal=variant==8
        if skeletal:
            cylinder("BAT_SPINE",(0,0,S(.08)),S(.055),S(1.3),PRIMARY,"PRIMARY",14,.012);ico("BAT_SKULL",(0,0,S(.82)),(S(.36),S(.3),S(.38)),PRIMARY,"PRIMARY",2)
        else:
            uv_sphere("HAMMERHEAD_BAT_BODY",(0,0,0),(S(.56),S(.34),S(.7)),SECONDARY,"SECONDARY",40,22);cube("HAMMERHEAD_BAT_HEAD",(0,S(-.05),S(.72)),(S(.62),S(.32),S(.3)),PRIMARY,"PRIMARY",.09)
        for side in (-1,1):
            shoulder=(S(side*.3),0,S(.42));elbow=(S(side*.95),0,S(.62));wrist=(S(side*1.78),0,S(.02));limb("FINAL_BAT_ARM",shoulder,elbow,S(.055),PRIMARY,"PRIMARY");limb("FINAL_BAT_FOREARM",elbow,wrist,S(.04),PRIMARY,"PRIMARY")
            prism_xz("FINAL_BAT_WING",[(S(side*.24),S(.42)),(S(side*.95),S(.62)),(S(side*1.78),S(.02)),(S(side*1.0),S(-.55)),(S(side*.28),S(-.3))],S(.065),ACCENT,"ACCENT",.02)
            cone("FINAL_BAT_EAR",(S(side*.22),0,S(1.12)),S(.17),S(.025),S(.55),PRIMARY,"PRIMARY",20)
        eyes([(S(-.13),S(-.34),S(.78)),(S(.13),S(-.34),S(.78))])


def convert_curves():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "CURVE":
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.convert(target="MESH")
            obj.select_set(False)


def export_asset(folder, filename):
    convert_curves()
    target = os.path.join(OUT, folder, f"{filename}.glb")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False)
    print(f"WROTE {target}")


def main():
    variants=range(1,VARIANT_COUNT+1)
    for name, builder in GEAR_BUILDERS.items():
        for variant in variants:
            clear_scene()
            if variant == 1: builder()
            elif variant <= 3: build_gear_variant(name, variant)
            elif variant <= 6: build_gear_expanded_variant(name, variant)
            else: build_gear_final_variant(name, variant)
            export_asset("gear", name if variant == 1 else f"{name}_v{variant}")
    for archetype in ENEMY_ARCHETYPES:
        for variant in variants:
            clear_scene()
            if variant == 1: creature(archetype)
            elif variant <= 3: build_creature_variant(archetype, variant)
            elif variant <= 6: build_creature_expanded_variant(archetype, variant)
            else: build_creature_final_variant(archetype, variant)
            export_asset("enemies", archetype if variant == 1 else f"{archetype}_v{variant}")
    for form, archetype in PET_FORMS.items():
        for variant in variants:
            clear_scene()
            if variant == 1: creature(archetype)
            elif variant <= 3: build_creature_variant(archetype, variant, companion=True)
            elif variant <= 6: build_creature_expanded_variant(archetype, variant, companion=True)
            else: build_creature_final_variant(archetype, variant, companion=True)
            export_asset("pets", form if variant == 1 else f"{form}_v{variant}")
    count = len(tuple(variants)) * (len(GEAR_BUILDERS) + len(ENEMY_ARCHETYPES) + len(PET_FORMS))
    print(f"Built {count} GLB templates in {OUT}")


if __name__ == "__main__":
    main()
