#!/usr/bin/env python3
"""Build The Deeping's authored GLB template library inside Blender.

Run with:
  blender -b --python tools/blender/build_authored_models.py -- --output public/models --variants 8

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
    parser.add_argument("--variants", type=int, default=8)
    return parser.parse_args(argv)


ARGS = cli_args()
OUT = os.path.abspath(ARGS.output)
VARIANT_COUNT = ARGS.variants
if VARIANT_COUNT < 3:
    raise ValueError("The Deeping asset library requires at least three variants per family")


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


def build_authored_gear_variant(name, variant):
    """Build variants 4-8 from empty scenes using family-specific plans."""
    if variant not in (4, 5, 6, 7, 8):
        raise ValueError(f"No authored v{variant} gear plan for {name}")
    if name in ("sword", "dagger"):
        profiles = {
            "sword": {
                4: ("FALCHION", [(-.18,.08),(-.32,.8),(-.46,1.75),(-.34,2.75),(0,3.25),(.22,2.55),(.2,.08)], .24),
                5: ("RAPIER", [(-.08,.08),(-.055,2.82),(0,3.34),(.055,2.82),(.08,.08)], .11),
                6: ("FLAMBERGE", [(-.22,.08),(-.34,.5),(-.18,.9),(-.35,1.3),(-.17,1.7),(-.32,2.1),(-.14,2.55),(0,3.28),(.14,2.55),(.32,2.1),(.17,1.7),(.35,1.3),(.18,.9),(.34,.5),(.22,.08)], .24),
                7: ("EXECUTIONER", [(-.38,.08),(-.42,2.45),(-.28,3.06),(0,3.34),(.28,3.06),(.42,2.45),(.38,.08)], .3),
                8: ("LEAFBLADE", [(-.16,.08),(-.22,.8),(-.48,1.82),(-.32,2.72),(0,3.38),(.32,2.72),(.48,1.82),(.22,.8),(.16,.08)], .26),
            },
            "dagger": {
                4: ("KRIS", [(-.13,.05),(-.27,.38),(-.1,.72),(-.28,1.06),(-.08,1.42),(-.2,1.75),(0,2.18),(.2,1.75),(.08,1.42),(.28,1.06),(.1,.72),(.27,.38),(.13,.05)], .18),
                5: ("TANTO", [(-.22,.05),(-.22,1.68),(.02,2.18),(.25,1.85),(.16,.05)], .24),
                6: ("PUSH_DAGGER", [(-.34,.08),(-.2,1.35),(0,1.95),(.2,1.35),(.34,.08)], .3),
                7: ("MAIN_GAUCHE", [(-.18,.05),(-.24,1.55),(0,2.25),(.24,1.55),(.18,.05)], .2),
                8: ("LEAF_DAGGER", [(-.1,.05),(-.34,.82),(-.25,1.62),(0,2.28),(.25,1.62),(.34,.82),(.1,.05)], .22),
            },
        }
        title, outline, depth = profiles[name][variant]
        prism_xz(f"{title}_BLADE", outline, depth, PRIMARY, "PRIMARY", .04)
        if variant == 4:
            prism_xz(f"{title}_GUARD", [(-.78,.12),(-.5,.34),(0,.12),(.5,.34),(.78,.12),(.45,-.02),(-.45,-.02)], depth+.1, ACCENT, "ACCENT", .045)
        elif variant == 5:
            torus(f"{title}_CUP_GUARD", (0,0,-.02), .42 if name=="sword" else .32, .095, ACCENT, "ACCENT", (math.pi/2,0,0))
            curve_tube(f"{title}_KNUCKLE_BOW", [(-.38,0,.05),(-.58,0,-.45),(-.25,0,-.9)], .055, ACCENT, "ACCENT")
        elif variant == 6:
            cylinder_between(f"{title}_QUILLON", (-.92,0,.02),(.92,0,.02),.095,ACCENT,"ACCENT",24)
            for side in (-1,1): cone(f"{title}_GUARD_TIP",(side*1.0,0,.02),.11,0,.42,PRIMARY,"PRIMARY",16).rotation_euler[1]=side*math.pi/2
        elif variant == 7:
            prism_xz(f"{title}_GUARD", [(-1.0,.22),(-.58,.42),(-.22,.12),(0,-.04),(.22,.12),(.58,.42),(1.0,.22),(.58,.02),(-.58,.02)], depth+.12, SECONDARY, "SECONDARY", .055)
        else:
            prism_xz(f"{title}_GUARD", [(-.76,.02),(-.48,.32),(0,.16),(.48,.32),(.76,.02),(.42,-.13),(0,-.02),(-.42,-.13)], depth+.12, ACCENT, "ACCENT", .045)
            prism_xz(f"{title}_SPINE", [(-.035,.2),(0,max(z for _,z in outline)-.34),(.035,.2)], depth+.025, EMISSIVE, "EMISSIVE", .008)
        variant_grip(-.72 if name=="sword" else -.58, 1.22 if name=="sword" else .92, .14 if name=="sword" else .12)
        return
    if name == "axe":
        cylinder("AXE_HANDLE",(0,0,-.12),.095,3.55,SECONDARY,"SECONDARY",28,.024)
        heads = {
            4: ("DANE", [(-.04,.9),(-.52,1.02),(-1.25,1.45),(-1.18,2.15),(-.5,2.5),(-.12,1.65)], False),
            5: ("CRESCENT", [(-.05,1.0),(-.62,1.0),(-1.18,1.35),(-1.34,1.82),(-1.08,2.28),(-.5,2.5),(-.16,1.62)], True),
            6: ("TOMAHAWK", [(-.05,1.05),(-.42,1.1),(-.92,1.48),(-.76,1.96),(-.3,2.12),(-.05,1.62)], False),
            7: ("HALBERD", [(-.08,1.02),(-.55,1.12),(-1.05,1.5),(-.92,2.08),(-.36,2.2),(-.1,1.66),(0,2.92),(.18,1.7)], False),
            8: ("CHOPPER", [(-.06,.9),(-.82,.92),(-1.32,1.28),(-1.42,2.12),(-.82,2.58),(-.16,2.35),(-.02,1.55)], True),
        }
        title, outline, double = heads[variant]
        prism_xz(f"{title}_AXE_HEAD",outline,.42 if variant!=8 else .5,PRIMARY,"PRIMARY",.06)
        if double:
            mirror=[(-x,z) for x,z in reversed(outline)]
            prism_xz(f"{title}_REVERSE_HEAD",mirror,.42 if variant!=8 else .5,ACCENT,"ACCENT",.06)
        else:
            edge=[(min(x for x,_ in outline),min(z for _,z in outline)+.25),(min(x for x,_ in outline)-.03,max(z for _,z in outline)-.22),(min(x for x,_ in outline)+.14,max(z for _,z in outline)-.3),(min(x for x,_ in outline)+.12,min(z for _,z in outline)+.3)]
            prism_xz(f"{title}_CUTTING_EDGE",edge,.47,ACCENT,"ACCENT",.018)
        if variant in (6,7): cone("AXE_BACK_SPIKE",(.42,0,1.58),.16,0,1.05,ACCENT,"ACCENT",20).rotation_euler[1]=math.pi/2
        return
    if name == "hammer":
        cylinder("HAMMER_HANDLE",(0,0,-.22),.115,3.18,SECONDARY,"SECONDARY",30,.028)
        if variant == 4:  # flanged mace
            cylinder("MACE_HUB",(0,0,1.25),.34,1.0,PRIMARY,"PRIMARY",32,.05).rotation_euler[1]=math.pi/2
            for angle in (0,math.pi/2,math.pi,3*math.pi/2):
                cube("MACE_FLANGE",(0,.38*math.sin(angle),1.25+.38*math.cos(angle)),(.62,.08,.2),ACCENT,"ACCENT",.035)
        elif variant == 5:  # smithing maul
            cube("FORGE_BLOCK",(-.15,0,1.3),(.82,.5,.44),PRIMARY,"PRIMARY",.11)
            prism_xz("FORGE_PEEN",[(.55,.92),(1.38,1.12),(1.55,1.3),(1.38,1.48),(.55,1.68)],.48,ACCENT,"ACCENT",.055)
        elif variant == 6:  # lucerne hammer
            cube("LUCERNE_FACE",(-.42,0,1.38),(.42,.34,.42),PRIMARY,"PRIMARY",.06)
            for y in (-.26,0,.26): cone("LUCERNE_TOOTH",(-.9,y,1.38),.11,0,.45,ACCENT,"ACCENT",14).rotation_euler[1]=-math.pi/2
            cone("LUCERNE_PICK",(.72,0,1.38),.24,0,1.45,PRIMARY,"PRIMARY",24).rotation_euler[1]=math.pi/2
        elif variant == 7:  # rune mallet
            cylinder("RUNE_DRUM",(0,0,1.3),.58,1.55,PRIMARY,"PRIMARY",8,.07).rotation_euler[1]=math.pi/2
            for x in (-.83,.83): cylinder("RUNE_FACE",(x,0,1.3),.62,.14,ACCENT,"ACCENT",8,.035).rotation_euler[1]=math.pi/2
        else:  # meteor hammer
            cylinder("CHAIN_STEM",(0,0,.35),.07,1.65,SECONDARY,"SECONDARY",18,.015)
            for z in (.9,1.12,1.34,1.56,1.78): torus("CHAIN_LINK",(0,0,z),.12,.035,ACCENT,"ACCENT",(math.pi/2,0,0))
            ico("METEOR_HEAD",(0,0,2.12),(.62,.52,.62),PRIMARY,"PRIMARY",2)
        return
    if name == "spear":
        cylinder("POLE",(0,0,-.2),.064,4.15,SECONDARY,"SECONDARY",26,.016)
        outlines={
            4:("PARTISAN",[(-.12,1.55),(-.55,1.92),(-.28,2.08),(0,2.92),(.28,2.08),(.55,1.92),(.12,1.55)]),
            5:("PIKE",[(-.09,1.6),(-.1,2.72),(0,3.35),(.1,2.72),(.09,1.6)]),
            6:("BOAR",[(-.16,1.58),(-.46,1.78),(-.22,1.98),(0,2.82),(.22,1.98),(.46,1.78),(.16,1.58)]),
            7:("LANCE",[(-.18,1.45),(-.28,2.12),(0,3.2),(.28,2.12),(.18,1.45)]),
            8:("LEAF",[(-.08,1.55),(-.38,2.12),(0,3.02),(.38,2.12),(.08,1.55)]),
        }
        title,outline=outlines[variant]
        prism_xz(f"{title}_SPEARHEAD",outline,.2 if variant!=7 else .28,PRIMARY,"PRIMARY",.035)
        if variant==6:
            cylinder_between("BOAR_STOP",(-.65,0,1.62),(.65,0,1.62),.07,ACCENT,"ACCENT",20)
        elif variant==4:
            for side in (-1,1): prism_xz("PARTISAN_WING",[(side*.1,1.72),(side*.62,1.98),(side*.42,1.55)],.23,ACCENT,"ACCENT",.025)
        elif variant==7:
            cone("LANCE_VAMPLATE",(0,0,1.3),.42,.12,.5,ACCENT,"ACCENT",32)
        else: torus("SPEAR_COLLAR",(0,0,1.5),.13,.04,ACCENT,"ACCENT")
        return
    if name == "scythe":
        shafts={4:[(0,0,-1.65),(.05,0,-.3),(.12,0,1.28)],5:[(0,0,-1.7),(-.08,0,-.2),(0,0,1.38)],6:[(0,0,-1.7),(.12,0,-.25),(-.08,0,1.2)],7:[(0,0,-1.75),(0,0,1.45)],8:[(0,0,-1.65),(-.15,0,-.1),(.08,0,1.35)]}
        curve_tube("SCYTHE_POLE",shafts[variant],.085,SECONDARY,"SECONDARY")
        blades={
            4:("SICKLE",[(.02,1.08),(.42,1.52),(1.1,1.85),(1.45,1.72),(.78,1.35),(.18,.9)]),
            5:("HOOK",[(-.02,1.1),(.38,1.45),(1.0,2.08),(1.42,2.18),(1.1,1.72),(.35,1.12)]),
            6:("TRIPLE",[(0,1.05),(.45,1.45),(1.5,1.85),(1.18,1.48),(.35,1.02)]),
            7:("BONE",[(0,1.12),(.28,1.52),(1.25,2.28),(1.65,2.18),(.82,1.52),(.18,.95)]),
            8:("MOON",[(-.05,1.05),(.42,1.55),(1.45,2.02),(1.82,1.86),(1.18,1.4),(.3,.92)]),
        }
        title,outline=blades[variant]
        prism_xz(f"{title}_SCYTHE_BLADE",outline,.2,PRIMARY,"PRIMARY",.045)
        if variant==6:
            for dz,scale in ((-.18,.78),(-.38,.58)):
                prism_xz("SECONDARY_HOOK",[(0,1.05+dz),(.35,1.35+dz),(1.35*scale,1.62+dz),(.9*scale,1.3+dz),(.22,.95+dz)],.17,ACCENT,"ACCENT",.035)
        elif variant==7:
            for x,z in ((.45,1.42),(.82,1.72),(1.2,2.0)): cylinder("BONE_KNUCKLE",(x,0,z),.12,.23,ACCENT,"ACCENT",16,.02).rotation_euler[0]=math.pi/2
        else: prism_xz("SCYTHE_EDGE",[(outline[-2][0],outline[-2][1]),(outline[-3][0],outline[-3][1]),(outline[-3][0]-.1,outline[-3][1]-.12),(outline[-2][0]-.12,outline[-2][1]-.1)],.23,ACCENT,"ACCENT",.015)
        return
    if name == "bow":
        if variant == 4:  # English longbow
            curve_tube("LONGBOW",[(.02,0,-1.95),(-.38,0,-1.45),(-.68,0,-.62),(-.7,0,.62),(-.38,0,1.45),(.02,0,1.95)],.075,PRIMARY,"PRIMARY")
            curve_tube("LONGBOW_STRING",[(.02,0,-1.95),(-.48,0,0),(.02,0,1.95)],.012,ACCENT,"ACCENT")
            cube("LONGBOW_GRIP",(-.7,0,0),(.1,.13,.3),SECONDARY,"SECONDARY",.03)
        elif variant == 5:  # asymmetric yumi
            curve_tube("YUMI_BODY",[(.08,0,-1.45),(-.32,0,-1.0),(-.58,0,-.28),(-.62,0,.48),(-.4,0,1.5),(.02,0,2.18)],.07,PRIMARY,"PRIMARY")
            curve_tube("YUMI_STRING",[(.08,0,-1.45),(-.42,0,.18),(.02,0,2.18)],.012,ACCENT,"ACCENT")
            cube("YUMI_GRIP",(-.6,0,.18),(.1,.13,.28),SECONDARY,"SECONDARY",.025)
        elif variant == 6:  # crossbow
            cube("CROSSBOW_STOCK",(0,0,-.3),(.15,.18,1.25),SECONDARY,"SECONDARY",.05)
            curve_tube("CROSSBOW_LIMB",[(-1.45,0,.72),(-.72,0,.45),(0,0,.38),(.72,0,.45),(1.45,0,.72)],.09,PRIMARY,"PRIMARY")
            curve_tube("CROSSBOW_STRING",[(-1.45,0,.72),(0,0,.18),(1.45,0,.72)],.014,ACCENT,"ACCENT")
            cube("CROSSBOW_TRIGGER",(.18,-.04,-.45),(.08,.1,.28),ACCENT,"ACCENT",.025)
            cylinder("CROSSBOW_BOLT",(0,-.14,.72),.025,2.2,PRIMARY,"PRIMARY",14,.006)
        elif variant == 7:  # skeletal reflex bow
            points=[(0,0,-1.72),(-.38,0,-1.42),(-.62,0,-.72),(-.5,0,0),(-.62,0,.72),(-.38,0,1.42),(0,0,1.72)]
            for start,end in zip(points,points[1:]): cylinder_between("SEGMENTED_BOW",start,end,.105,PRIMARY,"PRIMARY",20)
            curve_tube("REFLEX_STRING",[(0,0,-1.72),(.18,0,0),(0,0,1.72)],.012,EMISSIVE,"EMISSIVE")
            cube("REFLEX_GRIP",(-.5,0,0),(.12,.15,.32),SECONDARY,"SECONDARY",.035)
        else:  # twin-rail war bow
            for y in (-.1,.1): curve_tube("TWIN_BOW_RAIL",[(.05,y,-1.72),(-.42,y,-1.28),(-.68,y,0),(-.42,y,1.28),(.05,y,1.72)],.065,PRIMARY,"PRIMARY")
            for z in (-1.3,0,1.3): cylinder_between("RAIL_BRACE",(-.48,-.1,z),(-.48,.1,z),.045,ACCENT,"ACCENT",16)
            curve_tube("WAR_BOW_STRING",[(.05,0,-1.72),(.12,0,0),(.05,0,1.72)],.014,EMISSIVE,"EMISSIVE")
            cube("WAR_BOW_GRIP",(-.68,0,0),(.11,.16,.34),SECONDARY,"SECONDARY",.03)
        return
    if name == "shield":
        outlines={
            4:("BUCKLER",[(-.78,.72),(-1.0,0),(-.72,-.72),(0,-1.0),(.72,-.72),(1.0,0),(.78,.72),(0,1.0)]),
            5:("HEATER",[(-.82,1.12),(-1.02,.4),(-.7,-.72),(0,-1.5),(.7,-.72),(1.02,.4),(.82,1.12),(0,1.36)]),
            6:("PAVISE",[(-.9,1.35),(-1.08,.88),(-1.02,-1.18),(0,-1.5),(1.02,-1.18),(1.08,.88),(.9,1.35)]),
            7:("COFFIN",[(-.62,1.45),(-1.0,.72),(-.82,-1.15),(0,-1.52),(.82,-1.15),(1.0,.72),(.62,1.45)]),
            8:("SCALLOP",[(-.92,.88),(-1.12,.18),(-.72,-.92),(0,-1.28),(.72,-.92),(1.12,.18),(.92,.88),(0,1.32)]),
        }
        title,outline=outlines[variant]
        prism_xz(f"{title}_SHIELD",outline,.36,PRIMARY,"PRIMARY",.075)
        if variant==4:
            uv_sphere("BUCKLER_BOSS",(0,-.23,0),(.44,.17,.44),ACCENT,"ACCENT")
        elif variant==5:
            prism_xz("HEATER_DIVIDE",[(-.08,1.18),(-.1,-1.22),(0,-1.4),(.1,-1.22),(.08,1.18)],.4,ACCENT,"ACCENT",.025)
        elif variant==6:
            for x in (-.72,0,.72): cube("PAVISE_RIB",(x,-.23,0),(.07,.07,1.16),ACCENT,"ACCENT",.02)
        elif variant==7:
            prism_xz("COFFIN_CROSS",[(-.12,1.0),(-.12,.25),(-.62,.25),(-.62,0),(-.12,0),(-.12,-1.05),(.12,-1.05),(.12,0),(.62,0),(.62,.25),(.12,.25),(.12,1.0)],.4,SECONDARY,"SECONDARY",.025)
        else:
            for x in (-.62,-.3,0,.3,.62): curve_tube("SCALLOP_RIB",[(x*.7,-.23,-.78),(x,-.23,.62),(x*.72,-.23,1.02)],.035,ACCENT,"ACCENT")
        return
    if name == "cuirass":
        if variant == 4:  # lamellar
            for row,(z,width) in enumerate(((.85,.72),(.48,.8),(.1,.76),(-.28,.68),(-.62,.58))):
                for col in range(5): cube("LAMELLAR_SCALE",((-width)+(2*width)*(col/4),-.22,z),(.16,.09,.22),PRIMARY if (row+col)%2 else ACCENT,"PRIMARY" if (row+col)%2 else "ACCENT",.035)
            for x in (-.88,.88): prism_xz("LAMELLAR_PAULDRON",[(x-.32,.55),(x,1.12),(x+.32,.55),(x,.3)],.4,SECONDARY,"SECONDARY",.05)
        elif variant == 5:  # gothic plate
            prism_xz("GOTHIC_CHEST",[(-.62,-.65),(-.84,.35),(-.58,1.08),(0,.82),(.58,1.08),(.84,.35),(.62,-.65),(0,-.95)],.5,PRIMARY,"PRIMARY",.075)
            prism_xz("GOTHIC_RIDGE",[(-.08,-.75),(-.12,.62),(0,.92),(.12,.62),(.08,-.75)],.54,ACCENT,"ACCENT",.025)
            for x in (-.9,.9): cone("GOTHIC_PAULDRON",(x,0,.72),.42,.18,.72,PRIMARY,"PRIMARY",24).rotation_euler[1]=x*.32
        elif variant == 6:  # scale mail
            prism_xz("MAIL_VEST",[(-.68,1.05),(-.84,.25),(-.65,-1.02),(0,-1.22),(.65,-1.02),(.84,.25),(.68,1.05)],.42,SECONDARY,"SECONDARY",.06)
            for row in range(5):
                for col in range(5-row%2):
                    x=(col-(4-row%2)/2)*.3
                    prism_xz("OVERLAP_SCALE",[(x-.15,.78-row*.34),(x,.98-row*.34),(x+.15,.78-row*.34),(x,.55-row*.34)],.47,PRIMARY if row%2 else ACCENT,"PRIMARY" if row%2 else "ACCENT",.025)
        elif variant == 7:  # bone harness
            prism_xz("BONE_VEST",[(-.7,.95),(-.82,-.75),(0,-1.05),(.82,-.75),(.7,.95)],.4,SECONDARY,"SECONDARY",.055)
            for side in (-1,1):
                curve_tube("RIBCAGE",[(side*.08,-.24,.75),(side*.62,-.24,.48),(side*.72,-.24,.1),(side*.2,-.24,-.05)],.065,PRIMARY,"PRIMARY")
                curve_tube("COLLARBONE",[(0,-.24,.78),(side*.48,-.24,1.02),(side*.82,-.24,.72)],.075,ACCENT,"ACCENT")
        else:  # duellist coat armour
            prism_xz("COAT_CHEST",[(-.58,1.08),(-.78,.4),(-.54,-.9),(0,-1.18),(.54,-.9),(.78,.4),(.58,1.08)],.44,PRIMARY,"PRIMARY",.06)
            for side in (-1,1): prism_xz("COAT_TAIL",[(side*.06,-.55),(side*.68,-.82),(side*.52,-1.5),(side*.02,-1.16)],.4,SECONDARY,"SECONDARY",.045)
            cylinder_between("COAT_SASH",(-.72,-.25,-.38),(.72,-.25,-.2),.08,ACCENT,"ACCENT",20)
        return
    if name == "cloak":
        cloaks={
            4:("RANGER",[(-.72,1.15),(-1.04,-.4),(-.88,-1.42),(-.24,-1.14),(0,-1.5),(.24,-1.14),(.88,-1.42),(1.04,-.4),(.72,1.15)]),
            5:("HALF_CAPE",[(-.76,1.12),(-1.12,.35),(-.82,-1.36),(-.1,-1.02),(.3,.72),(.56,1.18)]),
            6:("FEATHER",[(-.62,1.12),(-1.02,.38),(-.88,-1.35),(-.38,-1.08),(0,-1.52),(.38,-1.08),(.88,-1.35),(1.02,.38),(.62,1.12)]),
            7:("TATTERED",[(-.7,1.18),(-1.0,-.7),(-.78,-1.35),(-.48,-1.0),(-.18,-1.5),(.1,-1.08),(.42,-1.42),(.62,-.95),(.95,-1.25),(.72,1.18)]),
            8:("CEREMONIAL",[(-.62,1.24),(-.92,-1.08),(-.5,-1.45),(0,-1.18),(.5,-1.45),(.92,-1.08),(.62,1.24)]),
        }
        title,outline=cloaks[variant]
        prism_xz(f"{title}_CLOAK",outline,.19 if variant!=5 else .24,PRIMARY,"PRIMARY",.055)
        if variant==4: torus("RANGER_HOOD",(0,0,1.08),.43,.16,SECONDARY,"SECONDARY",(math.pi/2,0,0))
        elif variant==5: cylinder_between("HALF_CAPE_CHAIN",(-.62,-.16,1.05),(.45,-.16,1.02),.035,ACCENT,"ACCENT",16)
        elif variant==6:
            for x in (-.55,-.28,0,.28,.55): prism_xz("FEATHER_PANEL",[(x-.13,.75),(x-.18,-.78),(x,-1.34),(x+.18,-.78),(x+.13,.75)],.22,ACCENT if x==0 else SECONDARY,"ACCENT" if x==0 else "SECONDARY",.025)
        elif variant==7: cylinder_between("TATTERED_CLASP",(-.5,-.18,1.04),(.5,-.18,1.04),.06,SECONDARY,"SECONDARY",18)
        else:
            prism_xz("CEREMONIAL_BORDER",[(-.62,1.12),(-.78,-.98),(-.48,-1.28),(-.36,-1.02),(-.5,.9)],.23,ACCENT,"ACCENT",.025)
            prism_xz("CEREMONIAL_BORDER",[(.62,1.12),(.78,-.98),(.48,-1.28),(.36,-1.02),(.5,.9)],.23,ACCENT,"ACCENT",.025)
        return
    if name in ("greaves","boots"):
        for side in (-1,1):
            x=side*.38
            if name=="greaves":
                if variant==4:
                    prism_xz("WINGED_GREAVE",[(x-.28,-.72),(x-.32,.58),(x,.98),(x+.32,.58),(x+.24,-.72)],.4,PRIMARY,"PRIMARY",.055)
                    prism_xz("WINGED_KNEE",[(x-.4,.72),(x,1.18),(x+.4,.72),(x,.5)],.44,ACCENT,"ACCENT",.05)
                elif variant==5:
                    cone("HOPLITE_GREAVE",(x,0,.02),.22,.34,1.9,PRIMARY,"PRIMARY",32)
                    prism_xz("HOPLITE_KNEE",[(x-.3,.72),(x,1.04),(x+.3,.72)],.39,ACCENT,"ACCENT",.04)
                elif variant==6:
                    for part,z in enumerate((-.62,-.28,.06,.4,.72)): prism_xz("SCALE_GREAVE",[(x-.28,z-.2),(x-.32,z+.18),(x,z+.3),(x+.32,z+.18),(x+.28,z-.2)],.35,PRIMARY if part%2 else ACCENT,"PRIMARY" if part%2 else "ACCENT",.035)
                elif variant==7:
                    curve_tube("BONE_SHIN",[(x,0,-.78),(x-.05,0,.15),(x,0,.88)],.16,PRIMARY,"PRIMARY")
                    for z in (-.4,.05,.5): cylinder_between("BONE_BAR",(x-.26,0,z),(x+.26,0,z),.055,ACCENT,"ACCENT",16)
                else:
                    cube("DUELLIST_GREAVE",(x,0,.02),(.24,.27,.82),PRIMARY,"PRIMARY",.075)
                    prism_xz("DUELLIST_KNEE",[(x-.33,.72),(x,1.08),(x+.33,.72),(x,.52)],.4,ACCENT,"ACCENT",.04)
            else:
                if variant==4:
                    cube("RANGER_BOOT",(x,-.02,.05),(.3,.38,.72),SECONDARY,"SECONDARY",.11); cube("RANGER_FOOT",(x,-.5,-.62),(.32,.55,.22),PRIMARY,"PRIMARY",.1)
                    for z in (-.2,.12,.42): cylinder_between("CROSS_LACE",(x-.24,-.4,z-.12),(x+.24,-.4,z+.12),.025,ACCENT,"ACCENT",12)
                elif variant==5:
                    for part in range(5): cube("PLATE_SABATON",(x,-.22-part*.16,-.55-part*.012),(.33-part*.024,.18,.15),PRIMARY if part else ACCENT,"PRIMARY" if part else "ACCENT",.04)
                    cube("PLATE_ANKLE",(x,0,.18),(.3,.32,.58),PRIMARY,"PRIMARY",.08)
                elif variant==6:
                    cube("FUR_BOOT",(x,-.05,-.02),(.34,.42,.75),SECONDARY,"SECONDARY",.12); torus("FUR_CUFF",(x,0,.72),.4,.14,PRIMARY,"PRIMARY"); cube("FUR_FOOT",(x,-.5,-.65),(.36,.56,.24),ACCENT,"ACCENT",.1)
                elif variant==7:
                    cone("BONE_BOOT",(x,0,0),.24,.34,1.55,PRIMARY,"PRIMARY",24); cube("CLAWED_FOOT",(x,-.48,-.68),(.3,.5,.2),SECONDARY,"SECONDARY",.08)
                    for toe in (-.18,0,.18): cone("BOOT_CLAW",(x+toe,-.93,-.65),.055,0,.34,ACCENT,"ACCENT",14).rotation_euler[0]=math.pi/2
                else:
                    cube("COURT_BOOT",(x,0,.05),(.29,.34,.72),PRIMARY,"PRIMARY",.09); cube("POINTED_FOOT",(x,-.64,-.62),(.3,.68,.2),SECONDARY,"SECONDARY",.08)
                    prism_xz("TURNED_CUFF",[(x-.36,.62),(x-.42,.94),(x,.82),(x+.42,.94),(x+.36,.62)],.42,ACCENT,"ACCENT",.045)
        return
    if name == "helm":
        if variant==4:
            uv_sphere("GREAT_HELM",(0,0,.35),(.72,.63,.82),PRIMARY,"PRIMARY"); cube("FLAT_VISOR",(0,-.62,.34),(.66,.08,.2),SECONDARY,"SECONDARY",.035)
            for x in (-.42,-.21,0,.21,.42): cube("BREATHING_SLIT",(x,-.71,.34),(.045,.02,.1),EMISSIVE,"EMISSIVE",.008)
        elif variant==5:
            uv_sphere("HORNED_CAP",(0,0,.3),(.68,.6,.7),PRIMARY,"PRIMARY")
            for side in (-1,1): curve_tube("SWEEPING_HORN",[(side*.45,0,.62),(side*.82,0,1.02),(side*1.02,0,.82)],.12,ACCENT,"ACCENT")
            prism_xz("BROW_GUARD",[(-.62,.45),(0,.68),(.62,.45),(.48,.18),(0,.32),(-.48,.18)],.55,SECONDARY,"SECONDARY",.04)
        elif variant==6:
            uv_sphere("FROGMOUTH_HELM",(0,0,.28),(.82,.68,.68),PRIMARY,"PRIMARY"); prism_xz("FROGMOUTH_VISOR",[(-.78,.6),(0,.86),(.78,.6),(.62,.1),(0,.2),(-.62,.1)],.58,ACCENT,"ACCENT",.06)
        elif variant==7:
            cone("CONICAL_HELM",(0,0,.45),.7,.05,1.45,PRIMARY,"PRIMARY",40); prism_xz("FACE_MASK",[(-.48,.42),(-.4,-.48),(0,-.72),(.4,-.48),(.48,.42)],.5,SECONDARY,"SECONDARY",.05)
            cylinder_between("MASK_SLIT",(-.28,-.54,.1),(.28,-.54,.1),.028,EMISSIVE,"EMISSIVE",14)
        else:
            uv_sphere("CROWNED_HELM",(0,0,.3),(.7,.62,.76),PRIMARY,"PRIMARY")
            for index in range(5):
                angle=-.8+index*.4; cone("HELM_CROWN_POINT",(.55*math.sin(angle),0,.88+.18*math.cos(angle)),.1,0,.55,ACCENT,"ACCENT",18)
            prism_xz("OPEN_FACE",[(-.54,.48),(-.48,-.45),(-.18,-.7),(0,-.2),(.18,-.7),(.48,-.45),(.54,.48)],.46,SECONDARY,"SECONDARY",.045)
        return
    if name == "crown":
        if variant==4:
            torus("LAUREL_BAND",(0,0,0),.72,.08,PRIMARY,"PRIMARY")
            for side in (-1,1):
                for i in range(5):
                    leaf=ico("LAUREL_LEAF",(side*(.18+i*.11),-.58+i*.03,.12+i*.1),(.16,.07,.08),ACCENT,"ACCENT",2); leaf.rotation_euler[1]=side*(.4+i*.1)
        elif variant==5:
            torus("IRON_CROWN_BAND",(0,0,-.1),.72,.15,PRIMARY,"PRIMARY")
            for index in range(6):
                angle=math.tau*index/6; prism_xz("IRON_MERLON",[(.62*math.cos(angle)-.12,-.12),(.62*math.cos(angle)-.12,.62),(.62*math.cos(angle)+.12,.62),(.62*math.cos(angle)+.12,-.12)],.22,SECONDARY,"SECONDARY",.03)
        elif variant==6:
            torus("ANTLER_DIADEM",(0,0,-.05),.68,.09,PRIMARY,"PRIMARY")
            for side in (-1,1):
                curve_tube("DIADEM_ANTLER",[(side*.35,0,.05),(side*.58,0,.48),(side*.48,0,.96),(side*.78,0,1.2)],.075,ACCENT,"ACCENT")
                curve_tube("ANTLER_TINE",[(side*.55,0,.55),(side*.86,0,.72)],.055,ACCENT,"ACCENT")
        elif variant==7:
            torus("ARCH_CROWN_BAND",(0,0,-.15),.7,.12,PRIMARY,"PRIMARY")
            curve_tube("CROWN_ARCH_A",[(-.66,0,-.05),(0,0,1.18),(.66,0,-.05)],.1,ACCENT,"ACCENT")
            curve_tube("CROWN_ARCH_B",[(0,-.66,-.05),(0,0,1.18),(0,.66,-.05)],.1,ACCENT,"ACCENT")
            ico("ARCH_FINIAL",(0,0,1.28),(.18,.18,.22),EMISSIVE,"EMISSIVE",3)
        else:
            torus("THORN_CROWN",(0,0,0),.72,.11,SECONDARY,"SECONDARY")
            for index in range(9):
                angle=math.tau*index/9; spike=cone("THORN",(.7*math.cos(angle),.7*math.sin(angle),.22),.09,0,.7,PRIMARY,"PRIMARY",16); spike.rotation_euler[1]=.35*math.cos(angle); spike.rotation_euler[0]=.35*math.sin(angle)
        return
    if name == "ring":
        torus("RING_SHANK",(0,0,0),.72,.13,PRIMARY,"PRIMARY")
        if variant==4:
            prism_xz("SHIELD_SIGNET",[(-.34,.58),(-.42,.92),(0,1.18),(.42,.92),(.34,.58),(0,.46)],.4,ACCENT,"ACCENT",.06)
        elif variant==5:
            for side in (-1,1): curve_tube("SERPENT_SHOULDER",[(side*.55,0,.35),(side*.42,0,.72),(side*.18,0,.94)],.08,ACCENT,"ACCENT")
            ico("SERPENT_STONE",(0,-.02,.92),(.25,.17,.3),EMISSIVE,"EMISSIVE",3)
        elif variant==6:
            cube("SQUARE_SETTING",(0,0,.82),(.32,.26,.22),ACCENT,"ACCENT",.06); cube("TABLE_CUT_STONE",(0,-.25,.84),(.21,.08,.17),EMISSIVE,"EMISSIVE",.035)
        elif variant==7:
            torus("HALO_SETTING",(0,0,.82),.31,.07,ACCENT,"ACCENT",(math.pi/2,0,0)); uv_sphere("PEARL",(0,-.04,.82),(.2,.15,.2),EMISSIVE,"EMISSIVE",28,16)
        else:
            prism_xz("CLAW_SETTING",[(-.38,.58),(-.22,1.02),(0,.86),(.22,1.02),(.38,.58),(0,.45)],.42,SECONDARY,"SECONDARY",.055); ico("MARQUISE_STONE",(0,-.02,.85),(.18,.14,.38),EMISSIVE,"EMISSIVE",3)
        return
    if name == "earring":
        if variant==4:
            curve_tube("SPIRAL_EARRING",[(0,0,.78),(-.38,0,.62),(-.52,0,.2),(-.3,0,-.18),(0,0,-.26),(.18,0,-.08)],.075,PRIMARY,"PRIMARY"); ico("SPIRAL_DROP",(.2,0,-.18),(.16,.1,.22),EMISSIVE,"EMISSIVE",3)
        elif variant==5:
            torus("MOON_HOOP",(0,0,.2),.62,.12,PRIMARY,"PRIMARY"); prism_xz("MOON_CUTOUT",[(-.1,.78),(-.42,.45),(-.5,0),(-.35,-.35),(0,-.58),(-.2,-.18),(-.22,.25)],.24,ACCENT,"ACCENT",.045)
        elif variant==6:
            cube("EAR_STUD",(0,0,.7),(.18,.14,.18),PRIMARY,"PRIMARY",.05); cylinder_between("BAR_DROP",(0,0,.5),(0,0,-.62),.045,ACCENT,"ACCENT",16); prism_xz("SPEAR_DROP",[(-.16,-.55),(0,-1.05),(.16,-.55),(0,-.38)],.18,EMISSIVE,"EMISSIVE",.025)
        elif variant==7:
            for index,(x,z) in enumerate(((-.34,.45),(0,.15),(.34,.45))): torus("TRIPLE_HOOP",(x,0,z),.3-index*.03,.065,PRIMARY if index!=1 else ACCENT,"PRIMARY" if index!=1 else "ACCENT",(math.pi/2,0,0))
        else:
            prism_xz("FAN_EARRING",[(-.62,.38),(0,-.9),(.62,.38),(0,.72)],.18,PRIMARY,"PRIMARY",.055)
            for x in (-.38,-.19,0,.19,.38): cylinder_between("FAN_RIB",(0,-.11,.5),(x,-.11,-.5),.025,ACCENT,"ACCENT",12)
        return
    if name == "bracelet":
        if variant==4:
            for index in range(8):
                angle=math.tau*index/8; cube("HINGED_LINK",(.72*math.cos(angle),.72*math.sin(angle),0),(.22,.13,.11),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",.045).rotation_euler[2]=angle
        elif variant==5:
            torus("TORQUE_BRACELET",(0,0,0),.74,.18,PRIMARY,"PRIMARY"); cube("TORQUE_GAP",(0,-.72,0),(.24,.22,.28),SECONDARY,"SECONDARY",.06)
            for x in (-.22,.22): ico("TORQUE_END",(x,-.82,0),(.18,.18,.22),EMISSIVE,"EMISSIVE",3)
        elif variant==6:
            torus("BRAID_CORE",(0,0,0),.72,.1,SECONDARY,"SECONDARY")
            for offset in (-.08,.08): torus("BRAID_STRAND",(0,0,offset),.74,.065,PRIMARY if offset<0 else ACCENT,"PRIMARY" if offset<0 else "ACCENT")
        elif variant==7:
            torus("WATCH_BAND",(0,0,0),.7,.13,PRIMARY,"PRIMARY"); cube("RELIQUARY_CASE",(0,-.7,.06),(.38,.25,.28),ACCENT,"ACCENT",.07); ico("RELIQUARY_WINDOW",(0,-.96,.08),(.22,.06,.18),EMISSIVE,"EMISSIVE",2)
        else:
            for index in range(12):
                angle=math.tau*index/12; prism_xz("SCALE_LINK",[(.62*math.cos(angle)-.12,-.1),(.72*math.cos(angle),.16),(.62*math.cos(angle)+.12,-.1)],.22,PRIMARY if index%2 else SECONDARY,"PRIMARY" if index%2 else "SECONDARY",.025)
        return
    if name == "necklace":
        if variant==4:
            curve_tube("BIB_CHAIN",[(-1.0,0,.82),(-.78,0,.1),(0,0,-.72),(.78,0,.1),(1.0,0,.82)],.045,PRIMARY,"PRIMARY")
            for x,z in ((-.55,-.15),(-.28,-.5),(0,-.78),(.28,-.5),(.55,-.15)): prism_xz("BIB_PLATE",[(x-.16,z+.15),(x,z-.2),(x+.16,z+.15)],.17,ACCENT,"ACCENT",.035)
        elif variant==5:
            curve_tube("GORGET",[(-.9,0,.58),(-.7,0,-.25),(0,0,-.72),(.7,0,-.25),(.9,0,.58)],.14,PRIMARY,"PRIMARY")
            prism_xz("GORGET_FRONT",[(-.5,-.35),(0,-1.08),(.5,-.35),(.32,.18),(-.32,.18)],.26,ACCENT,"ACCENT",.06)
        elif variant==6:
            curve_tube("PRAYER_BEADS",[(-.9,0,.72),(-.62,0,0),(0,0,-.72),(.62,0,0),(.9,0,.72)],.035,SECONDARY,"SECONDARY")
            for index in range(12):
                angle=math.pi+math.pi*index/11; ico("BEAD",(.78*math.cos(angle),0,.12+.78*math.sin(angle)),(.1,.08,.1),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",2)
            prism_xz("PRAYER_ICON",[(-.2,-.62),(0,-1.12),(.2,-.62),(0,-.38)],.2,EMISSIVE,"EMISSIVE",.035)
        elif variant==7:
            curve_tube("COLLAR_CHAIN",[(-.95,0,.76),(-.66,0,.1),(0,0,-.62),(.66,0,.1),(.95,0,.76)],.055,PRIMARY,"PRIMARY")
            prism_xz("LOCKET_FRAME",[(-.34,-.55),(-.42,-.92),(0,-1.25),(.42,-.92),(.34,-.55),(0,-.38)],.24,ACCENT,"ACCENT",.055); uv_sphere("LOCKET_CORE",(0,-.14,-.82),(.22,.08,.3),EMISSIVE,"EMISSIVE",28,16)
        else:
            curve_tube("TORC_NECKLACE",[(-.92,0,.58),(-.72,0,-.08),(-.28,0,-.48),(.28,0,-.48),(.72,0,-.08),(.92,0,.58)],.11,PRIMARY,"PRIMARY")
            for side in (-1,1): prism_xz("TORC_BEAST_HEAD",[(side*.22,-.36),(side*.48,-.62),(side*.34,-.9),(side*.08,-.64)],.25,ACCENT,"ACCENT",.045)
        return
    if name == "trinket":
        if variant==4:
            cylinder("HOURGLASS_FRAME",(0,0,0),.58,1.45,PRIMARY,"PRIMARY",8,.06)
            cone("UPPER_GLASS",(0,-.4,.35),.42,.08,.72,ACCENT,"ACCENT",32); cone("LOWER_GLASS",(0,-.4,-.35),.08,.42,.72,ACCENT,"ACCENT",32)
        elif variant==5:
            prism_xz("ASTROLABE_RING",[(-.85,0),(-.6,.6),(0,.85),(.6,.6),(.85,0),(.6,-.6),(0,-.85),(-.6,-.6)],.16,PRIMARY,"PRIMARY",.05)
            torus("ASTROLABE_ORBIT",(0,0,0),.55,.055,ACCENT,"ACCENT",(math.pi/2,0,0)); cylinder_between("ASTROLABE_NEEDLE",(-.48,-.12,-.4),(.48,-.12,.4),.035,EMISSIVE,"EMISSIVE",14)
        elif variant==6:
            cube("MUSIC_BOX",(0,0,-.25),(.72,.55,.48),PRIMARY,"PRIMARY",.1); cylinder("MUSIC_DRUM",(0,-.5,.35),.35,.65,ACCENT,"ACCENT",24,.045).rotation_euler[1]=math.pi/2
            for x in (-.45,-.15,.15,.45): cylinder_between("MUSIC_PIN",(x,-.72,.18),(x,-.72,.52),.025,EMISSIVE,"EMISSIVE",10)
        elif variant==7:
            uv_sphere("BOTTLED_STORM",(0,0,-.05),(.62,.48,.82),PRIMARY,"PRIMARY",40,24); cylinder("BOTTLE_NECK",(0,0,.8),.25,.45,SECONDARY,"SECONDARY",28,.04); cube("CORK",(0,0,1.08),(.22,.22,.18),ACCENT,"ACCENT",.05)
            curve_tube("STORM_BOLT",[(-.18,-.5,.35),(.15,-.5,.08),(-.08,-.5,-.18),(.2,-.5,-.48)],.045,EMISSIVE,"EMISSIVE")
        else:
            cube("COMPASS_CASE",(0,0,0),(.72,.18,.72),PRIMARY,"PRIMARY",.12); torus("COMPASS_BEZEL",(0,-.2,0),.58,.08,ACCENT,"ACCENT",(math.pi/2,0,0))
            prism_xz("COMPASS_NEEDLE",[(-.08,-.48),(0,.58),(.08,-.48),(0,-.22)],.43,EMISSIVE,"EMISSIVE",.02)
        return
    raise KeyError(f"Missing authored gear family: {name}")


def four_legs(prefix, xs, shoulder_z, foot_z, radius, mat=SECONDARY, role="SECONDARY"):
    for x in xs:
        knee=(x,0,(shoulder_z+foot_z)/2)
        limb(f"{prefix}_UPPER_LEG",(x,0,shoulder_z),knee,radius,mat,role)
        limb(f"{prefix}_LOWER_LEG",knee,(x,-.02,foot_z),radius*.82,mat,role)


def spread_wings(prefix, root_z, span, tip_z, inner=.3, mat=ACCENT, role="ACCENT"):
    for side in (-1,1):
        prism_xz(f"{prefix}_WING",[(side*inner,root_z),(side*span,tip_z),(side*span*.78,root_z-.75),(side*inner*1.2,root_z-.42)],.12,mat,role,.035)


def build_authored_enemy_variant(archetype, variant):
    """Build enemy variants 4-8 as independent species/anatomies."""
    if variant not in (4,5,6,7,8):
        raise ValueError(f"No authored v{variant} enemy plan for {archetype}")
    if archetype == "humanoid":
        if variant==4:  # hooded rogue
            prism_xz("ROGUE_TUNIC",[(-.45,.82),(-.6,-.62),(0,-.9),(.6,-.62),(.45,.82)],.42,SECONDARY,"SECONDARY",.055)
            uv_sphere("ROGUE_HOOD",(0,0,1.08),(.42,.36,.48),PRIMARY,"PRIMARY")
            for side in (-1,1):
                limb("ROGUE_ARM",(side*.4,0,.58),(side*.72,-.05,-.05),.1,PRIMARY,"PRIMARY")
                limb("ROGUE_LEG",(side*.2,0,-.55),(side*.28,0,-1.25),.13,SECONDARY,"SECONDARY")
                prism_xz("ROGUE_DAGGER",[(side*.68,-.18),(side*.86,-.72),(side*.98,-.18)],.14,ACCENT,"ACCENT",.025)
            eyes([(-.13,-.35,1.12),(.13,-.35,1.12)])
        elif variant==5:  # war cleric
            prism_xz("CLERIC_ROBE",[(-.52,.8),(-.72,-1.1),(0,-1.28),(.72,-1.1),(.52,.8)],.44,PRIMARY,"PRIMARY",.06)
            uv_sphere("CLERIC_HEAD",(0,0,1.16),(.36,.32,.37),SECONDARY,"SECONDARY")
            torus("CLERIC_HALO",(0,.12,1.62),.42,.055,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            cylinder_between("CLERIC_MACE",(.62,0,.52),(.9,0,-.82),.07,SECONDARY,"SECONDARY",18)
            ico("CLERIC_MACE_HEAD",(.56,0,.72),(.3,.25,.3),ACCENT,"ACCENT",2)
            prism_xz("CLERIC_SHIELD",[(-1.02,.62),(-1.32,.18),(-1.12,-.72),(-.68,-.4),(-.7,.5)],.18,PRIMARY,"PRIMARY",.045)
            eyes([(-.12,-.3,1.2),(.12,-.3,1.2)])
        elif variant==6:  # barbarian
            uv_sphere("BARBARIAN_TORSO",(0,0,.28),(.66,.44,.72),SECONDARY,"SECONDARY")
            uv_sphere("BARBARIAN_HEAD",(0,0,1.23),(.38,.34,.4),PRIMARY,"PRIMARY")
            for side in (-1,1):
                uv_sphere("BARBARIAN_SHOULDER",(side*.62,0,.6),(.28,.3,.28),PRIMARY,"PRIMARY")
                limb("BARBARIAN_ARM",(side*.62,0,.5),(side*.9,0,-.15),.16,PRIMARY,"PRIMARY")
                limb("BARBARIAN_LEG",(side*.24,0,-.32),(side*.32,0,-1.22),.17,SECONDARY,"SECONDARY")
            cylinder_between("BARBARIAN_AXE_HAFT",(.72,0,.18),(1.05,0,-1.0),.06,SECONDARY,"SECONDARY",16)
            prism_xz("BARBARIAN_AXE_HEAD",[(.5,.55),(.98,.72),(1.28,.5),(1.2,.12),(.78,.02)],.22,ACCENT,"ACCENT",.04)
            eyes([(-.13,-.32,1.28),(.13,-.32,1.28)])
        elif variant==7:  # archer
            prism_xz("ARCHER_JERKIN",[(-.48,.82),(-.58,-.65),(0,-.92),(.58,-.65),(.48,.82)],.38,PRIMARY,"PRIMARY",.05)
            uv_sphere("ARCHER_HEAD",(0,0,1.14),(.35,.31,.37),SECONDARY,"SECONDARY")
            for side in (-1,1): limb("ARCHER_LEG",(side*.2,0,-.5),(side*.28,0,-1.2),.12,SECONDARY,"SECONDARY")
            curve_tube("ARCHER_BOW",[(.7,0,-.75),(1.2,0,0),(.72,0,.92)],.055,ACCENT,"ACCENT")
            curve_tube("ARCHER_STRING",[(.7,0,-.75),(.84,0,.08),(.72,0,.92)],.01,EMISSIVE,"EMISSIVE")
            cylinder("QUIVER",(-.48,.12,.25),.17,.92,SECONDARY,"SECONDARY",18,.025).rotation_euler[1]=-.32
            eyes([(-.12,-.29,1.18),(.12,-.29,1.18)])
        else:  # plague doctor
            cone("DOCTOR_COAT",(0,0,-.05),.72,.32,2.1,SECONDARY,"SECONDARY",36)
            uv_sphere("DOCTOR_HOOD",(0,0,1.0),(.4,.34,.42),PRIMARY,"PRIMARY")
            cone("DOCTOR_BEAK",(0,-.5,1.02),.22,0,.78,ACCENT,"ACCENT",22).rotation_euler[0]=math.pi/2
            torus("DOCTOR_GOGGLE_L",(-.14,-.34,1.14),.12,.035,EMISSIVE,"EMISSIVE",(math.pi/2,0,0)); torus("DOCTOR_GOGGLE_R",(.14,-.34,1.14),.12,.035,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            cylinder_between("DOCTOR_CANE",(.66,0,-1.05),(.66,0,1.1),.05,PRIMARY,"PRIMARY",16)
        return
    if archetype == "beast":
        species={4:("STAG",(-.18,0,.12),(.82,.42,.55),(.72,0,.58),(.38,.32,.4)),5:("BEAR",(-.15,0,.05),(1.0,.58,.72),(.78,0,.45),(.5,.44,.5)),6:("PANTHER",(-.18,0,.08),(.95,.38,.48),(.72,0,.44),(.38,.3,.34)),7:("RAM",(-.18,0,.08),(.86,.48,.58),(.7,0,.48),(.46,.38,.4)),8:("HOUND",(-.2,0,.08),(.9,.4,.5),(.72,0,.48),(.4,.32,.36))}
        title,body_loc,body_scale,head_loc,head_scale=species[variant]
        uv_sphere(f"{title}_BODY",body_loc,body_scale,PRIMARY,"PRIMARY")
        uv_sphere(f"{title}_HEAD",head_loc,head_scale,ACCENT,"ACCENT")
        four_legs(title,(-.62,-.22,.28,.58),-.2,-1.02,.1 if variant!=5 else .14)
        if variant==4:
            for side in (-1,1):
                curve_tube("STAG_ANTLER",[(side*.68,0,.78),(side*.86,0,1.18),(side*.72,0,1.55),(side*1.05,0,1.72)],.065,SECONDARY,"SECONDARY")
                curve_tube("STAG_TINE",[(side*.84,0,1.2),(side*1.12,0,1.35)],.045,SECONDARY,"SECONDARY")
            curve_tube("STAG_TAIL",[(-.85,0,.2),(-1.2,0,.48)],.09,ACCENT,"ACCENT")
        elif variant==5:
            for side in (-1,1): uv_sphere("BEAR_EAR",(.64+side*.22,0,.83),(.16,.12,.16),SECONDARY,"SECONDARY")
            uv_sphere("BEAR_MUZZLE",(1.05,-.2,.36),(.3,.2,.22),SECONDARY,"SECONDARY")
        elif variant==6:
            curve_tube("PANTHER_TAIL",[(-1.0,0,.18),(-1.45,0,.35),(-1.7,0,.78)],.075,PRIMARY,"PRIMARY")
            for side in (-1,1): cone("PANTHER_EAR",(.7+side*.2,0,.78),.11,0,.34,PRIMARY,"PRIMARY",16)
        elif variant==7:
            for side in (-1,1): curve_tube("RAM_HORN",[(.7+side*.12,0,.72),(.82+side*.38,0,.92),(.7+side*.45,0,.55),(.62+side*.2,0,.38)],.12,SECONDARY,"SECONDARY")
        else:
            uv_sphere("HOUND_MUZZLE",(1.02,-.2,.4),(.28,.18,.2),SECONDARY,"SECONDARY")
            for side in (-1,1): cone("HOUND_EAR",(.7+side*.2,0,.8),.12,0,.42,PRIMARY,"PRIMARY",18)
            curve_tube("HOUND_TAIL",[(-.92,0,.16),(-1.25,0,.5),(-1.12,0,.86)],.08,ACCENT,"ACCENT")
        eyes([(.62,-.3,.58),(.82,-.29,.58)])
        return
    if archetype == "dragon":
        if variant==4:  # lindworm
            curve_tube("LINDWORM_BODY",[(-1.15,0,-.4),(-.55,0,-.05),(0,0,.2),(.55,0,.58),(.9,0,1.0)],.28,PRIMARY,"PRIMARY")
            uv_sphere("LINDWORM_HEAD",(1.02,0,1.08),(.46,.36,.38),ACCENT,"ACCENT")
            for side in (-1,1): limb("LINDWORM_ARM",(side*.3,0,.34),(side*.85,0,-.25),.1,SECONDARY,"SECONDARY")
            spread_wings("LINDWORM",.62,1.55,1.45,.18,SECONDARY,"SECONDARY")
        elif variant==5:  # shellback dragon
            uv_sphere("SHELLBACK_BODY",(-.15,0,.02),(1.0,.62,.62),PRIMARY,"PRIMARY")
            uv_sphere("SHELLBACK_SHELL",(-.28,.06,.28),(.9,.58,.7),SECONDARY,"SECONDARY")
            uv_sphere("SHELLBACK_HEAD",(.82,0,.38),(.42,.36,.38),ACCENT,"ACCENT")
            four_legs("SHELLBACK",(-.62,-.22,.28,.58),-.22,-.92,.14)
            curve_tube("SHELLBACK_TAIL",[(-1.0,0,.02),(-1.45,0,.12),(-1.7,0,.42)],.13,PRIMARY,"PRIMARY")
        elif variant==6:  # feathered serpent dragon
            curve_tube("FEATHER_DRAGON_BODY",[(-1.2,0,-.5),(-.5,0,-.2),(0,0,.25),(.55,0,.7),(.92,0,1.08)],.25,PRIMARY,"PRIMARY")
            uv_sphere("FEATHER_DRAGON_HEAD",(1.0,0,1.12),(.4,.32,.36),ACCENT,"ACCENT")
            spread_wings("FEATHER_DRAGON",.45,1.75,1.15,.08,PRIMARY,"PRIMARY")
            for x,z in ((-.55,-.05),(-.2,.18),(.15,.45),(.5,.72)): prism_xz("BACK_FEATHER",[(x-.14,z),(x,z+.46),(x+.14,z)],.14,SECONDARY,"SECONDARY",.025)
        elif variant==7:  # hydra
            uv_sphere("HYDRA_BODY",(0,0,-.22),(.85,.55,.62),PRIMARY,"PRIMARY")
            for side in (-1,0,1):
                curve_tube("HYDRA_NECK",[(side*.2,0,.12),(side*.45,0,.72),(side*.55,0,1.22)],.16,PRIMARY,"PRIMARY")
                uv_sphere("HYDRA_HEAD",(side*.58,0,1.36),(.32,.28,.3),ACCENT,"ACCENT")
                eyes([(side*.58-.08,-.27,1.4),(side*.58+.08,-.27,1.4)])
            four_legs("HYDRA",(-.55,-.2,.2,.55),-.42,-1.1,.12)
        else:  # cathedral dragon
            uv_sphere("CATHEDRAL_BODY",(-.15,0,.02),(.9,.5,.62),PRIMARY,"PRIMARY")
            uv_sphere("CATHEDRAL_HEAD",(.75,0,.58),(.44,.36,.42),ACCENT,"ACCENT")
            four_legs("CATHEDRAL",(-.62,-.2,.25,.58),-.28,-1.08,.13)
            spread_wings("CATHEDRAL",.55,1.75,1.5,.18,SECONDARY,"SECONDARY")
            for side in (-1,1): curve_tube("CATHEDRAL_HORN",[(.72+side*.14,0,.88),(.7+side*.38,0,1.34),(.55+side*.58,0,1.52)],.07,ACCENT,"ACCENT")
            curve_tube("CATHEDRAL_TAIL",[(-.92,0,-.05),(-1.45,0,.15),(-1.75,0,.58)],.12,PRIMARY,"PRIMARY")
        if variant!=7: eyes([(.72,-.34,.68),(.92,-.32,.68)])
        return
    if archetype == "serpent":
        if variant==4:  # horned viper
            points=[(math.sin(i*.72)*.36,math.cos(i*.46)*.1,-1.2+i*.24) for i in range(10)]
            curve_tube("VIPER_BODY",points,.23,PRIMARY,"PRIMARY"); uv_sphere("VIPER_HEAD",points[-1],(.42,.32,.34),ACCENT,"ACCENT")
            for side in (-1,1): cone("VIPER_HORN",(points[-1][0]+side*.18,0,points[-1][2]+.34),.08,0,.34,SECONDARY,"SECONDARY",16)
        elif variant==5:  # sandworm
            curve_tube("SANDWORM_BODY",[(0,0,-1.35),(-.28,0,-.7),(.18,0,-.05),(0,0,.62)],.34,SECONDARY,"SECONDARY")
            torus("SANDWORM_MAW",(0,-.12,.92),.48,.13,PRIMARY,"PRIMARY",(math.pi/2,0,0))
            for index in range(10):
                angle=math.tau*index/10; tooth=cone("SANDWORM_TOOTH",(.34*math.cos(angle),-.28,.92+.34*math.sin(angle)),.055,0,.28,EMISSIVE,"EMISSIVE",12); tooth.rotation_euler[0]=math.pi/2
        elif variant==6:  # basilisk
            uv_sphere("BASILISK_BODY",(-.2,0,0),(.9,.42,.48),PRIMARY,"PRIMARY"); uv_sphere("BASILISK_HEAD",(.78,0,.42),(.45,.35,.4),ACCENT,"ACCENT")
            four_legs("BASILISK",(-.62,-.22,.24,.58),-.18,-.72,.07)
            curve_tube("BASILISK_TAIL",[(-1.0,0,.0),(-1.5,0,.25),(-1.9,0,.72)],.13,PRIMARY,"PRIMARY")
            for x in (-.4,0,.4): cone("BASILISK_CREST",(x,0,.58),.09,0,.38,SECONDARY,"SECONDARY",16)
        elif variant==7:  # sea serpent
            curve_tube("SEA_SERPENT",[(-1.25,0,-.7),(-.65,0,-.25),(0,0,.15),(.55,0,.68),(.82,0,1.18)],.25,PRIMARY,"PRIMARY")
            uv_sphere("SEA_SERPENT_HEAD",(.88,0,1.25),(.4,.32,.35),ACCENT,"ACCENT")
            for x,z in ((-.72,-.1),(-.18,.28),(.35,.72)): prism_xz("SEA_FIN",[(x-.22,z),(x,z+.48),(x+.22,z)],.12,SECONDARY,"SECONDARY",.03)
        else:  # ouroboros
            curve_tube("OUROBOROS_COIL",[(math.cos(math.tau*i/16),0,math.sin(math.tau*i/16)) for i in range(17)],.22,PRIMARY,"PRIMARY",True)
            uv_sphere("OUROBOROS_HEAD",(.72,-.02,.7),(.36,.3,.32),ACCENT,"ACCENT")
            cone("OUROBOROS_SNOUT",(.86,-.28,.68),.16,0,.4,SECONDARY,"SECONDARY",18).rotation_euler[0]=math.pi/2
        if variant not in (5,): eyes([(-.12,-.29,.82),(.12,-.29,.82)])
        return
    if archetype == "insect":
        if variant==4:  # mantis
            uv_sphere("MANTIS_ABDOMEN",(0,0,-.25),(.34,.28,.72),PRIMARY,"PRIMARY"); uv_sphere("MANTIS_THORAX",(0,0,.5),(.28,.25,.42),SECONDARY,"SECONDARY"); uv_sphere("MANTIS_HEAD",(0,0,1.0),(.38,.3,.28),ACCENT,"ACCENT")
            for side in (-1,1):
                limb("MANTIS_FOREARM",(side*.2,0,.55),(side*.82,0,.25),.07,PRIMARY,"PRIMARY"); limb("MANTIS_BLADE",(side*.82,0,.25),(side*.35,-.02,-.18),.055,ACCENT,"ACCENT")
                for row in range(2): limb("MANTIS_LEG",(side*.2,0,.2-row*.35),(side*.82,0,-.12-row*.42),.045,SECONDARY,"SECONDARY")
        elif variant==5:  # wasp
            uv_sphere("WASP_ABDOMEN",(0,0,-.2),(.38,.32,.7),PRIMARY,"PRIMARY"); uv_sphere("WASP_THORAX",(0,0,.45),(.42,.34,.4),ACCENT,"ACCENT"); uv_sphere("WASP_HEAD",(0,0,.95),(.3,.28,.28),SECONDARY,"SECONDARY")
            spread_wings("WASP",.5,1.0,1.1,.15,PRIMARY,"PRIMARY"); cone("WASP_STINGER",(0,0,-.95),.12,0,.48,EMISSIVE,"EMISSIVE",16).rotation_euler[0]=math.pi
            for side in (-1,1):
                for row in range(3): limb("WASP_LEG",(side*.25,0,.35-row*.28),(side*.78,0,.08-row*.28),.04,SECONDARY,"SECONDARY")
        elif variant==6:  # ant
            for z,size in ((-.55,.4),(0,.34),(.58,.3)): uv_sphere("ANT_SEGMENT",(0,0,z),(size,size*.78,size),PRIMARY if z<.5 else ACCENT,"PRIMARY" if z<.5 else "ACCENT")
            for side in (-1,1):
                for row in range(3): limb("ANT_LEG",(side*.24,0,.2-row*.35),(side*(.82+row*.08),0,-.05-row*.35),.045,SECONDARY,"SECONDARY")
                curve_tube("ANT_ANTENNA",[(side*.12,0,.78),(side*.32,0,1.12),(side*.58,0,1.2)],.025,ACCENT,"ACCENT")
        elif variant==7:  # dragonfly
            uv_sphere("DRAGONFLY_BODY",(0,0,-.15),(.2,.2,.95),PRIMARY,"PRIMARY"); uv_sphere("DRAGONFLY_HEAD",(0,0,.92),(.34,.3,.3),ACCENT,"ACCENT")
            for side in (-1,1):
                prism_xz("DRAGONFLY_FOREWING",[(side*.12,.55),(side*1.38,.92),(side*1.1,.35),(side*.18,.18)],.07,SECONDARY,"SECONDARY",.02)
                prism_xz("DRAGONFLY_HINDWING",[(side*.12,.28),(side*1.18,.1),(side*.9,-.45),(side*.18,-.05)],.07,PRIMARY,"PRIMARY",.02)
        else:  # centipede
            for i in range(10):
                z=-1.05+i*.22; uv_sphere("CENTIPEDE_SEGMENT",(0,0,z),(.3,.26,.19),PRIMARY if i%2 else ACCENT,"PRIMARY" if i%2 else "ACCENT")
                for side in (-1,1): limb("CENTIPEDE_LEG",(side*.2,0,z),(side*.62,0,z-.08),.03,SECONDARY,"SECONDARY",14)
            uv_sphere("CENTIPEDE_HEAD",(0,0,1.17),(.34,.3,.3),ACCENT,"ACCENT")
        if variant!=8: eyes([(-.11,-.28,.98),(.11,-.28,.98)])
        return
    if archetype == "arachnid":
        if variant==4:  # tarantula
            uv_sphere("TARANTULA_ABDOMEN",(0,0,-.25),(.66,.52,.64),PRIMARY,"PRIMARY"); uv_sphere("TARANTULA_HEAD",(0,0,.46),(.42,.38,.38),ACCENT,"ACCENT")
            leg_span=1.15
        elif variant==5:  # whip scorpion
            uv_sphere("WHIP_BODY",(0,0,-.12),(.58,.42,.52),PRIMARY,"PRIMARY"); uv_sphere("WHIP_HEAD",(0,0,.48),(.36,.32,.32),ACCENT,"ACCENT"); curve_tube("WHIP_TAIL",[(0,0,-.55),(-.35,0,-.9),(-.15,0,-1.55),(.2,0,-1.9)],.045,SECONDARY,"SECONDARY"); leg_span=1.0
        elif variant==6:  # crab spider
            uv_sphere("CRAB_SPIDER_BODY",(0,0,-.05),(.7,.48,.48),PRIMARY,"PRIMARY"); uv_sphere("CRAB_SPIDER_HEAD",(0,0,.5),(.38,.35,.3),ACCENT,"ACCENT"); leg_span=1.32
        elif variant==7:  # tick
            uv_sphere("TICK_BODY",(0,0,-.1),(.82,.6,.9),PRIMARY,"PRIMARY"); uv_sphere("TICK_HEAD",(0,0,.76),(.28,.3,.24),ACCENT,"ACCENT"); cone("TICK_MOUTH",(0,-.35,.92),.12,0,.4,SECONDARY,"SECONDARY",18).rotation_euler[0]=math.pi/2; leg_span=.95
        else:  # harvestman
            uv_sphere("HARVESTMAN_BODY",(0,0,.2),(.42,.36,.42),PRIMARY,"PRIMARY"); leg_span=1.65
        for row in range(4):
            z=.42-row*.25
            for side in (-1,1):
                knee=(side*leg_span*.55,(row-1.5)*.09,z-.02); limb("ARACHNID_UPPER_LEG",(side*.28,0,z),knee,.045 if variant!=8 else .028,SECONDARY,"SECONDARY"); limb("ARACHNID_LOWER_LEG",knee,(side*leg_span,(row-1.5)*.16,z-.32),.038 if variant!=8 else .022,SECONDARY,"SECONDARY")
        eyes([(-.13,-.31,.52),(0,-.34,.58),(.13,-.31,.52)])
        return
    if archetype == "avian":
        if variant==4:  # raven
            uv_sphere("RAVEN_BODY",(0,0,-.05),(.48,.36,.72),PRIMARY,"PRIMARY"); uv_sphere("RAVEN_HEAD",(0,0,.76),(.34,.3,.34),ACCENT,"ACCENT")
            spread_wings("RAVEN",.35,1.35,.88,.16,SECONDARY,"SECONDARY"); cone("RAVEN_BEAK",(0,-.36,.78),.12,0,.52,SECONDARY,"SECONDARY",18).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("RAVEN_LEG",(side*.12,0,-.55),(side*.16,-.03,-1.05),.045,ACCENT,"ACCENT")
        elif variant==5:  # crane
            uv_sphere("CRANE_BODY",(0,0,-.1),(.5,.36,.68),PRIMARY,"PRIMARY"); curve_tube("CRANE_NECK",[(0,0,.42),(.22,0,.82),(.08,0,1.35)],.12,PRIMARY,"PRIMARY"); uv_sphere("CRANE_HEAD",(.08,0,1.52),(.28,.25,.28),ACCENT,"ACCENT")
            cone("CRANE_BEAK",(.08,-.36,1.52),.08,0,.72,SECONDARY,"SECONDARY",18).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("CRANE_LEG",(side*.13,0,-.58),(side*.18,0,-1.42),.04,SECONDARY,"SECONDARY")
            spread_wings("CRANE",.28,1.0,.7,.15,ACCENT,"ACCENT")
        elif variant==6:  # vulture
            uv_sphere("VULTURE_BODY",(0,0,-.05),(.66,.44,.78),SECONDARY,"SECONDARY"); curve_tube("VULTURE_NECK",[(0,0,.45),(0,0,.92)],.16,PRIMARY,"PRIMARY"); uv_sphere("VULTURE_HEAD",(0,0,1.1),(.32,.28,.3),ACCENT,"ACCENT")
            spread_wings("VULTURE",.42,1.55,.98,.2,PRIMARY,"PRIMARY"); cone("VULTURE_BEAK",(0,-.34,1.08),.12,0,.46,EMISSIVE,"EMISSIVE",18).rotation_euler[0]=math.pi/2
        elif variant==7:  # rooster
            uv_sphere("ROOSTER_BODY",(0,0,-.1),(.55,.4,.66),PRIMARY,"PRIMARY"); uv_sphere("ROOSTER_HEAD",(.18,0,.72),(.32,.28,.33),ACCENT,"ACCENT")
            for i in range(4): cone("ROOSTER_COMB",(-.06+i*.12,0,1.04+(.08 if i in (1,2) else 0)),.08,0,.3,EMISSIVE,"EMISSIVE",14)
            cone("ROOSTER_BEAK",(.18,-.32,.75),.1,0,.36,SECONDARY,"SECONDARY",16).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("ROOSTER_LEG",(side*.15,0,-.5),(side*.2,0,-1.05),.045,SECONDARY,"SECONDARY")
            for side in (-1,0,1): curve_tube("ROOSTER_TAIL",[(-.35,0,.2),(-.65+side*.12,0,.72),(-.82+side*.18,0,1.05)],.075,ACCENT,"ACCENT")
        else:  # peacock
            uv_sphere("PEACOCK_BODY",(0,0,-.15),(.48,.36,.68),PRIMARY,"PRIMARY"); curve_tube("PEACOCK_NECK",[(0,0,.3),(.12,0,.82),(0,0,1.2)],.13,ACCENT,"ACCENT"); uv_sphere("PEACOCK_HEAD",(0,0,1.34),(.27,.24,.28),SECONDARY,"SECONDARY")
            for index in range(9):
                angle=-1.05+index*(2.1/8); prism_xz("PEACOCK_TAIL",[(-.12+1.05*math.sin(angle),-.2),(.0+1.45*math.sin(angle),.82+1.05*math.cos(angle)),(.12+1.05*math.sin(angle),-.2)],.1,PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",.025)
            for side in (-1,1): limb("PEACOCK_LEG",(side*.12,0,-.58),(side*.16,0,-1.15),.04,SECONDARY,"SECONDARY")
        eyes([(-.1,-.28,1.1),(.1,-.28,1.1)])
        return
    if archetype == "aquatic":
        if variant==4:  # manta ray
            prism_xz("MANTA_BODY",[(-1.55,.15),(-.75,.55),(0,.42),(.75,.55),(1.55,.15),(.62,-.32),(0,-.12),(-.62,-.32)],.24,PRIMARY,"PRIMARY",.06)
            curve_tube("MANTA_TAIL",[(0,0,-.2),(-.05,0,-.78),(.1,0,-1.55)],.045,SECONDARY,"SECONDARY"); eyes([(-.28,-.2,.25),(.28,-.2,.25)])
        elif variant==5:  # eel
            curve_tube("EEL_BODY",[(-1.3,0,-.65),(-.75,0,-.3),(-.25,0,.05),(.35,0,.38),(.82,0,.72)],.24,PRIMARY,"PRIMARY"); uv_sphere("EEL_HEAD",(.92,0,.78),(.44,.34,.34),ACCENT,"ACCENT")
            prism_xz("EEL_FIN",[(-.72,-.18),(-.22,.38),(.38,.72),(.2,.38),(-.45,-.38)],.1,SECONDARY,"SECONDARY",.025); eyes([(.82,-.32,.84),(1.02,-.3,.84)])
        elif variant==6:  # crab
            uv_sphere("CRAB_SHELL",(0,0,.1),(.76,.5,.48),PRIMARY,"PRIMARY"); eyes([(-.22,-.44,.5),(.22,-.44,.5)])
            for side in (-1,1):
                for row in range(3): limb("CRAB_LEG",(side*.42,0,.2-row*.18),(side*(.95+row*.1),0,.02-row*.2),.055,SECONDARY,"SECONDARY")
                limb("CRAB_CLAW_ARM",(side*.45,0,.34),(side*.92,0,.62),.1,ACCENT,"ACCENT"); uv_sphere("CRAB_CLAW",(side*1.08,0,.68),(.3,.22,.25),ACCENT,"ACCENT")
        elif variant==7:  # squid
            cone("SQUID_MANTLE",(0,0,.45),.52,.14,1.35,PRIMARY,"PRIMARY",40); uv_sphere("SQUID_HEAD",(0,0,-.2),(.5,.42,.42),ACCENT,"ACCENT"); eyes([(-.2,-.4,-.12),(.2,-.4,-.12)])
            for index in range(8):
                angle=math.tau*index/8; curve_tube("SQUID_TENTACLE",[(.28*math.cos(angle),.1*math.sin(angle),-.45),(.55*math.cos(angle),.16*math.sin(angle),-.95),(.72*math.cos(angle+.25),.18*math.sin(angle+.25),-1.35)],.055,SECONDARY,"SECONDARY")
        else:  # seahorse
            curve_tube("SEAHORSE_BODY",[(0,0,-.75),(-.28,0,-.35),(-.18,0,.2),(.05,0,.72)],.25,PRIMARY,"PRIMARY"); uv_sphere("SEAHORSE_HEAD",(.18,0,.92),(.38,.32,.38),ACCENT,"ACCENT")
            cylinder("SEAHORSE_SNOUT",(.18,-.38,.9),.09,.65,SECONDARY,"SECONDARY",20,.02).rotation_euler[0]=math.pi/2
            curve_tube("SEAHORSE_TAIL",[(0,0,-.72),(-.48,0,-1.05),(-.42,0,-1.38),(-.08,0,-1.42),(.08,0,-1.24)],.09,PRIMARY,"PRIMARY"); prism_xz("SEAHORSE_FIN",[(-.18,.4),(-.72,.62),(-.52,-.2),(-.12,-.35)],.1,ACCENT,"ACCENT",.025); eyes([(0,-.3,1.0)])
        return
    if archetype == "ooze":
        if variant==4:  # cube slime
            cube("CUBE_SLIME",(0,0,0),(.78,.62,.88),PRIMARY,"PRIMARY",.22); uv_sphere("CUBE_CORE",(0,-.55,.05),(.28,.1,.34),EMISSIVE,"EMISSIVE",28,14); eyes([(-.22,-.62,.38),(.22,-.62,.38)])
        elif variant==5:  # slug slime
            uv_sphere("SLUG_SLIME",(-.1,0,-.42),(1.0,.58,.42),PRIMARY,"PRIMARY"); uv_sphere("SLUG_HEAD",(.68,0,-.12),(.46,.42,.48),ACCENT,"ACCENT")
            for side in (-1,1): curve_tube("SLUG_STALK",[(.62+side*.1,0,.22),(.72+side*.22,0,.72)],.045,SECONDARY,"SECONDARY"); eyes([(.72+side*.22,-.04,.76)])
        elif variant==6:  # mitosis pair
            uv_sphere("MITOSIS_L",(-.38,0,-.1),(.58,.5,.72),PRIMARY,"PRIMARY"); uv_sphere("MITOSIS_R",(.38,0,-.1),(.58,.5,.72),ACCENT,"ACCENT"); curve_tube("MITOSIS_BRIDGE",[(-.25,0,.05),(0,0,.2),(.25,0,.05)],.16,SECONDARY,"SECONDARY"); eyes([(-.52,-.45,.2),(.52,-.45,.2)])
        elif variant==7:  # arch slime
            curve_tube("ARCH_SLIME",[(-.82,0,-.78),(-.68,0,.42),(0,0,.92),(.68,0,.42),(.82,0,-.78)],.34,PRIMARY,"PRIMARY")
            for x in (-.78,-.45,0,.45,.78): cone("SLIME_DRIP",(x,0,-.62+(.32 if abs(x)<.6 else 0)),.12,0,.55,ACCENT,"ACCENT",20).rotation_euler[0]=math.pi
            eyes([(-.18,-.3,.72),(.18,-.3,.72)])
        else:  # crowned jelly
            uv_sphere("JELLY_BODY",(0,0,-.12),(.82,.62,.85),PRIMARY,"PRIMARY"); prism_xz("JELLY_CROWN",[(-.62,.55),(-.48,1.12),(-.16,.72),(0,1.3),(.16,.72),(.48,1.12),(.62,.55)],.35,ACCENT,"ACCENT",.06)
            for x in (-.6,-.3,0,.3,.6): curve_tube("JELLY_TENDRIL",[(x,0,-.55),(x*.85,0,-1.2)],.07,SECONDARY,"SECONDARY"); eyes([(-.18,-.55,.15),(.18,-.55,.15)])
        return
    if archetype == "undead":
        if variant==4:  # zombie
            uv_sphere("ZOMBIE_TORSO",(0,0,.18),(.58,.4,.76),SECONDARY,"SECONDARY"); uv_sphere("ZOMBIE_HEAD",(.08,0,1.12),(.37,.32,.4),PRIMARY,"PRIMARY")
            limb("ZOMBIE_ARM_L",(-.45,0,.62),(-.92,0,.12),.12,PRIMARY,"PRIMARY"); limb("ZOMBIE_ARM_R",(.45,0,.62),(.88,0,.52),.12,PRIMARY,"PRIMARY")
            limb("ZOMBIE_LEG_L",(-.22,0,-.35),(-.34,0,-1.22),.14,SECONDARY,"SECONDARY"); limb("ZOMBIE_LEG_R",(.22,0,-.35),(.45,0,-1.08),.14,SECONDARY,"SECONDARY"); eyes([(-.08,-.3,1.16),(.18,-.3,1.16)])
        elif variant==5:  # lich
            cone("LICH_ROBE",(0,0,-.2),.78,.28,2.2,PRIMARY,"PRIMARY",40); uv_sphere("LICH_SKULL",(0,0,1.0),(.36,.3,.38),SECONDARY,"SECONDARY")
            prism_xz("LICH_CROWN",[(-.42,1.18),(-.3,1.72),(0,1.4),(.3,1.72),(.42,1.18)],.35,ACCENT,"ACCENT",.05); cylinder_between("LICH_STAFF",(.72,0,-1.05),(.72,0,1.35),.055,SECONDARY,"SECONDARY",16); ico("LICH_ORB",(.72,0,1.58),(.24,.2,.24),EMISSIVE,"EMISSIVE",3); eyes([(-.12,-.28,1.04),(.12,-.28,1.04)])
        elif variant==6:  # skeletal hound
            uv_sphere("BONE_HOUND_RIBCAGE",(-.18,0,.08),(.72,.34,.42),SECONDARY,"SECONDARY"); uv_sphere("BONE_HOUND_SKULL",(.72,0,.42),(.4,.3,.34),PRIMARY,"PRIMARY")
            four_legs("BONE_HOUND",(-.58,-.2,.24,.55),-.2,-1.0,.065,PRIMARY,"PRIMARY"); curve_tube("BONE_HOUND_TAIL",[(-.82,0,.1),(-1.25,0,.48),(-1.45,0,.3)],.055,PRIMARY,"PRIMARY"); eyes([(.64,-.28,.48),(.82,-.27,.48)])
        elif variant==7:  # grave knight
            cube("GRAVE_ARMOUR",(0,0,.2),(.58,.4,.74),PRIMARY,"PRIMARY",.1); uv_sphere("GRAVE_HELM",(0,0,1.18),(.39,.34,.4),SECONDARY,"SECONDARY")
            for side in (-1,1): limb("GRAVE_LEG",(side*.22,0,-.32),(side*.3,0,-1.22),.14,SECONDARY,"SECONDARY")
            prism_xz("GRAVE_GREATSWORD",[(.68,-.9),(.58,.92),(.78,1.48),(.98,.92),(.9,-.9)],.2,ACCENT,"ACCENT",.04); eyes([(-.12,-.32,1.2),(.12,-.32,1.2)])
        else:  # bone giant
            cylinder("GIANT_SPINE",(0,0,.15),.1,1.75,SECONDARY,"SECONDARY",18,.02); uv_sphere("GIANT_SKULL",(0,0,1.28),(.48,.4,.5),PRIMARY,"PRIMARY")
            for z in (-.35,-.05,.25,.55,.82): cylinder_between("GIANT_RIB",(-.65,0,z),(.65,0,z),.055,ACCENT,"ACCENT",16)
            for side in (-1,1): limb("GIANT_ARM",(side*.42,0,.68),(side*1.05,0,-.3),.09,PRIMARY,"PRIMARY"); limb("GIANT_LEG",(side*.22,0,-.42),(side*.36,0,-1.42),.1,PRIMARY,"PRIMARY")
            eyes([(-.16,-.38,1.34),(.16,-.38,1.34)])
        return
    if archetype == "wraith":
        if variant==4:  # banshee
            cone("BANSHEE_GOWN",(0,0,-.2),.72,.22,2.25,PRIMARY,"PRIMARY",44); uv_sphere("BANSHEE_HEAD",(0,0,1.02),(.38,.32,.42),SECONDARY,"SECONDARY"); curve_tube("BANSHEE_HAIR_L",[(-.18,0,1.24),(-.48,0,.62),(-.62,0,-.25)],.09,ACCENT,"ACCENT"); curve_tube("BANSHEE_HAIR_R",[(.18,0,1.24),(.48,0,.62),(.62,0,-.25)],.09,ACCENT,"ACCENT"); torus("BANSHEE_MOUTH",(0,-.31,.92),.13,.035,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
        elif variant==5:  # reaper
            cone("REAPER_ROBE",(0,0,-.18),.8,.2,2.3,SECONDARY,"SECONDARY",40); torus("REAPER_HOOD",(0,0,.95),.46,.18,PRIMARY,"PRIMARY",(math.pi/2,0,0)); uv_sphere("REAPER_VOID",(0,-.22,.94),(.3,.14,.32),PRIMARY,"PRIMARY",28,14)
            curve_tube("REAPER_SCYTHE_POLE",[(.68,0,-1.1),(.75,0,1.18)],.055,PRIMARY,"PRIMARY"); prism_xz("REAPER_BLADE",[(.72,1.08),(1.1,1.48),(1.8,1.72),(1.42,1.35),(.82,.92)],.15,ACCENT,"ACCENT",.035)
        elif variant==6:  # lantern ghost
            cone("LANTERN_GHOST",(0,0,-.25),.68,.24,2.05,PRIMARY,"PRIMARY",40); cube("GHOST_LANTERN",(0,-.52,.2),(.38,.18,.48),ACCENT,"ACCENT",.07); uv_sphere("LANTERN_LIGHT",(0,-.72,.2),(.24,.07,.32),EMISSIVE,"EMISSIVE",24,12); torus("LANTERN_HANDLE",(0,-.52,.75),.3,.045,SECONDARY,"SECONDARY",(math.pi/2,0,0))
        elif variant==7:  # many-armed shade
            cone("SHADE_BODY",(0,0,-.2),.72,.24,2.15,SECONDARY,"SECONDARY",42); uv_sphere("SHADE_MASK",(0,-.2,.92),(.34,.18,.38),PRIMARY,"PRIMARY",28,14)
            for side in (-1,1):
                for row in range(3): curve_tube("SHADE_ARM",[(side*.22,0,.55-row*.3),(side*(.72+row*.16),0,.25-row*.36),(side*(1.0+row*.12),0,.5-row*.32)],.055,ACCENT,"ACCENT")
            eyes([(-.12,-.34,.96),(.12,-.34,.96)])
        else:  # bell wraith
            prism_xz("BELL_MANTLE",[(-.82,.65),(-.68,-.72),(0,-1.28),(.68,-.72),(.82,.65),(0,1.1)],.4,PRIMARY,"PRIMARY",.08); uv_sphere("BELL_FACE",(0,-.22,.72),(.3,.16,.34),SECONDARY,"SECONDARY",28,14); cylinder("BELL_CLAPPER",(0,0,-.9),.09,.62,ACCENT,"ACCENT",18,.02); uv_sphere("CLAPPER_ORB",(0,0,-1.22),(.18,.16,.18),EMISSIVE,"EMISSIVE",20,12)
        return
    if archetype == "construct":
        if variant==4:  # walking turret
            cylinder("TURRET_BODY",(0,0,.2),.62,1.0,PRIMARY,"PRIMARY",12,.08); cylinder("TURRET_BARREL",(0,-.65,.55),.14,1.15,ACCENT,"ACCENT",24,.035).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("TURRET_LEG",(side*.38,0,-.2),(side*.72,0,-1.05),.12,SECONDARY,"SECONDARY"); ico("TURRET_EYE",(0,-.55,.15),(.18,.07,.18),EMISSIVE,"EMISSIVE",2)
        elif variant==5:  # spider machine
            cube("SPIDER_MACHINE_CORE",(0,0,.2),(.58,.42,.45),PRIMARY,"PRIMARY",.1); ico("SPIDER_MACHINE_EYE",(0,-.46,.25),(.2,.07,.2),EMISSIVE,"EMISSIVE",2)
            for row in range(4):
                z=.4-row*.2
                for side in (-1,1):
                    knee=(side*.72,0,z-.05); limb("MACHINE_UPPER_LEG",(side*.38,0,z),knee,.07,ACCENT,"ACCENT"); limb("MACHINE_LOWER_LEG",knee,(side*1.15,0,z-.55),.055,SECONDARY,"SECONDARY")
        elif variant==6:  # stone idol
            prism_xz("STONE_IDOL_BODY",[(-.62,.9),(-.78,-.75),(0,-1.15),(.78,-.75),(.62,.9),(0,1.22)],.58,PRIMARY,"PRIMARY",.1); cube("STONE_IDOL_FACE",(0,-.52,.36),(.38,.1,.42),ACCENT,"ACCENT",.07); eyes([(-.14,-.64,.48),(.14,-.64,.48)])
            for side in (-1,1): cube("STONE_IDOL_ARM",(side*.82,0,.05),(.24,.3,.68),SECONDARY,"SECONDARY",.09)
        elif variant==7:  # brass automaton
            uv_sphere("AUTOMATON_TORSO",(0,0,.22),(.56,.42,.68),ACCENT,"ACCENT"); cylinder("AUTOMATON_HEAD",(0,0,1.1),.34,.5,PRIMARY,"PRIMARY",16,.06)
            for side in (-1,1):
                torus("AUTOMATON_SHOULDER",(side*.58,0,.62),.23,.055,SECONDARY,"SECONDARY"); limb("AUTOMATON_ARM",(side*.58,0,.52),(side*.86,0,-.1),.11,PRIMARY,"PRIMARY"); limb("AUTOMATON_LEG",(side*.22,0,-.32),(side*.3,0,-1.2),.13,SECONDARY,"SECONDARY")
            torus("AUTOMATON_CHEST_GEAR",(0,-.42,.25),.3,.07,EMISSIVE,"EMISSIVE",(math.pi/2,0,0)); eyes([(-.12,-.3,1.14),(.12,-.3,1.14)])
        else:  # floating sentinel
            ico("SENTINEL_CORE",(0,0,.25),(.62,.52,.7),PRIMARY,"PRIMARY",2); torus("SENTINEL_RING_A",(0,0,.25),.78,.06,ACCENT,"ACCENT",(math.pi/2,0,0)); torus("SENTINEL_RING_B",(0,0,.25),.78,.06,SECONDARY,"SECONDARY",(0,math.pi/2,0))
            for side in (-1,1): prism_xz("SENTINEL_ARM",[(side*.45,.45),(side*1.05,.72),(side*.88,-.18),(side*.48,-.35)],.22,PRIMARY,"PRIMARY",.055)
            ico("SENTINEL_EYE",(0,-.58,.3),(.2,.08,.24),EMISSIVE,"EMISSIVE",3)
        return
    if archetype == "plant":
        if variant==4:  # mushroom brute
            cylinder("MUSHROOM_STALK",(0,0,-.25),.36,1.8,SECONDARY,"SECONDARY",30,.06); uv_sphere("MUSHROOM_CAP",(0,0,.78),(1.0,.72,.42),PRIMARY,"PRIMARY"); eyes([(-.14,-.36,.2),(.14,-.36,.2)])
            for side in (-1,1): curve_tube("MUSHROOM_ARM",[(side*.25,0,.1),(side*.72,0,-.1),(side*.92,0,.18)],.1,ACCENT,"ACCENT")
        elif variant==5:  # vine snapper
            curve_tube("SNAPPER_STEM",[(0,0,-1.1),(-.12,0,-.35),(.1,0,.38)],.2,SECONDARY,"SECONDARY"); uv_sphere("SNAPPER_BULB",(0,0,.78),(.62,.48,.58),PRIMARY,"PRIMARY")
            prism_xz("SNAPPER_JAW_TOP",[(-.58,.82),(0,1.38),(.58,.82),(0,.62)],.32,ACCENT,"ACCENT",.06); prism_xz("SNAPPER_JAW_BOTTOM",[(-.58,.66),(0,.1),(.58,.66),(0,.86)],.32,PRIMARY,"PRIMARY",.06)
            for side in (-1,1): curve_tube("SNAPPER_VINE",[(0,0,-.2),(side*.65,0,-.55),(side*1.05,0,-.25)],.07,ACCENT,"ACCENT")
        elif variant==6:  # cactus walker
            cylinder("CACTUS_BODY",(0,0,.05),.42,1.9,PRIMARY,"PRIMARY",20,.08); uv_sphere("CACTUS_HEAD",(0,0,1.05),(.45,.4,.45),ACCENT,"ACCENT")
            for side in (-1,1): curve_tube("CACTUS_ARM",[(side*.32,0,.45),(side*.72,0,.25),(side*.82,0,.72)],.14,PRIMARY,"PRIMARY")
            for z in (-.45,-.05,.35,.75):
                for side in (-1,1): cone("CACTUS_SPINE",(side*.42,0,z),.035,0,.24,SECONDARY,"SECONDARY",10).rotation_euler[1]=side*math.pi/2
            eyes([(-.14,-.38,1.12),(.14,-.38,1.12)])
        elif variant==7:  # ancient stump
            cylinder("STUMP_TRUNK",(0,0,-.05),.52,2.0,SECONDARY,"SECONDARY",16,.1); torus("STUMP_TOP",(0,0,.98),.42,.12,PRIMARY,"PRIMARY"); eyes([(-.16,-.48,.35),(.16,-.48,.35)])
            for side in (-1,1): curve_tube("STUMP_ROOT",[(side*.22,0,-.78),(side*.62,0,-1.18),(side*1.0,0,-1.08)],.14,PRIMARY,"PRIMARY"); curve_tube("STUMP_BRANCH",[(side*.35,0,.5),(side*.72,0,.85),(side*.92,0,.62)],.12,ACCENT,"ACCENT")
        else:  # lotus horror
            uv_sphere("LOTUS_CORE",(0,0,.05),(.5,.42,.52),SECONDARY,"SECONDARY"); eyes([(-.14,-.4,.1),(.14,-.4,.1)])
            for index in range(12):
                angle=math.tau*index/12; x,z=.72*math.cos(angle),.05+.72*math.sin(angle); petal=uv_sphere("LOTUS_PETAL",(x,.05,z),(.45,.16,.18),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT"); petal.rotation_euler[1]=angle
            for side in (-1,1): curve_tube("LOTUS_ROOT",[(side*.15,0,-.38),(side*.62,0,-.85),(side*.98,0,-.72)],.09,SECONDARY,"SECONDARY")
        return
    if archetype == "elemental":
        if variant==4:  # tornado
            for level in range(7):
                z=-1.0+level*.32; radius=.2+level*.1
                torus("TORNADO_RING",(0,0,z),radius,.1,PRIMARY if level%2 else ACCENT,"PRIMARY" if level%2 else "ACCENT")
            ico("TORNADO_EYE",(0,-.55,.72),(.2,.08,.22),EMISSIVE,"EMISSIVE",3)
        elif variant==5:  # boulder elemental
            ico("BOULDER_TORSO",(0,0,.15),(.72,.58,.78),PRIMARY,"PRIMARY",2); ico("BOULDER_HEAD",(0,0,1.0),(.42,.36,.4),ACCENT,"ACCENT",2)
            for side in (-1,1): ico("BOULDER_ARM",(side*.82,0,.28),(.34,.3,.62),PRIMARY,"PRIMARY",2); ico("BOULDER_LEG",(side*.3,0,-.78),(.3,.32,.5),SECONDARY,"SECONDARY",2)
            eyes([(-.14,-.34,1.08),(.14,-.34,1.08)])
        elif variant==6:  # wave elemental
            prism_xz("CRESTING_WAVE",[(-1.0,-1.05),(-.78,.15),(-.4,.82),(.15,1.25),(.82,1.1),(1.15,.52),(.55,.7),(.05,.48),(-.22,-.2),(.15,-1.02)],.46,PRIMARY,"PRIMARY",.1)
            prism_xz("WAVE_FOAM",[(-.42,.8),(.15,1.28),(.82,1.1),(1.12,.52),(.62,.72),(.12,.52)],.5,ACCENT,"ACCENT",.06); eyes([(-.08,-.48,.28),(.18,-.48,.28)])
        elif variant==7:  # storm elemental
            for x,z,size in ((-.38,.2,.48),(.15,.45,.62),(.5,.05,.42),(-.05,-.35,.5)): uv_sphere("STORM_CLOUD",(x,0,z),(size,size*.72,size*.64),PRIMARY if x<0 else SECONDARY,"PRIMARY" if x<0 else "SECONDARY")
            curve_tube("LIGHTNING_BODY",[(-.18,-.55,.1),(.18,-.55,-.28),(-.08,-.55,-.62),(.28,-.55,-1.08)],.075,EMISSIVE,"EMISSIVE"); eyes([(-.2,-.45,.42),(.16,-.46,.52)])
        else:  # magma titan
            cone("MAGMA_TORSO",(0,0,.1),.72,.46,1.65,PRIMARY,"PRIMARY",12); ico("MAGMA_HEAD",(0,0,1.12),(.42,.36,.42),ACCENT,"ACCENT",2)
            for side in (-1,1): cone("MAGMA_ARM",(side*.72,0,.18),.2,.3,1.25,PRIMARY,"PRIMARY",10).rotation_euler[1]=side*.3; cone("MAGMA_LEG",(side*.28,0,-.78),.28,.22,.85,SECONDARY,"SECONDARY",10)
            for x,z in ((-.3,.3),(0,.55),(.3,.15)): curve_tube("MAGMA_CRACK",[(x,-.62,z),(x+.12,-.62,z-.3)],.035,EMISSIVE,"EMISSIVE"); eyes([(-.14,-.36,1.18),(.14,-.36,1.18)])
        return
    if archetype == "aberration":
        if variant==4:  # exposed brain crawler
            uv_sphere("BRAIN_MASS",(0,0,.42),(.72,.56,.58),PRIMARY,"PRIMARY")
            for x in (-.45,-.15,.15,.45): curve_tube("BRAIN_FOLD",[(x,-.5,.2),(x+.12,-.56,.5),(x-.08,-.52,.78)],.055,ACCENT,"ACCENT")
            for index in range(6):
                angle=math.tau*index/6; curve_tube("BRAIN_TENDRIL",[(.3*math.cos(angle),0,.05),(.75*math.cos(angle),0,-.48),(1.05*math.cos(angle+.2),0,-.92)],.07,SECONDARY,"SECONDARY")
            eyes([(0,-.56,.32)])
        elif variant==5:  # eye cluster
            uv_sphere("EYE_CLUSTER_BODY",(0,0,0),(.7,.55,.76),SECONDARY,"SECONDARY")
            for x,z,size in ((-.32,.42,.2),(0,.62,.24),(.32,.38,.18),(-.2,0,.16),(.22,-.08,.2),(0,-.42,.16)):
                torus("CLUSTER_SOCKET",(x,-.52,z),size,.045,PRIMARY,"PRIMARY",(math.pi/2,0,0)); uv_sphere("CLUSTER_EYE",(x,-.59,z),(size*.52,.05,size*.62),EMISSIVE,"EMISSIVE",20,10)
            for side in (-1,1): curve_tube("CLUSTER_STALK",[(side*.35,0,-.35),(side*.78,0,-.8),(side*1.05,0,-.62)],.06,ACCENT,"ACCENT")
        elif variant==6:  # tentacle pillar
            cylinder("PILLAR_FLESH",(0,0,0),.42,2.2,PRIMARY,"PRIMARY",20,.08)
            for index in range(7):
                angle=math.tau*index/7; z=-.75+index*.25; curve_tube("PILLAR_TENTACLE",[(.3*math.cos(angle),0,z),(.72*math.cos(angle),0,z+.2),(1.05*math.cos(angle+.35),0,z-.18)],.075,SECONDARY,"SECONDARY")
            torus("PILLAR_MOUTH",(0,-.43,.48),.28,.09,ACCENT,"ACCENT",(math.pi/2,0,0))
        elif variant==7:  # maw worm
            curve_tube("MAW_WORM_BODY",[(0,0,-1.2),(-.35,0,-.55),(.2,0,.05),(0,0,.62)],.3,PRIMARY,"PRIMARY")
            torus("MAW_WORM_MOUTH",(0,-.1,.92),.48,.13,ACCENT,"ACCENT",(math.pi/2,0,0))
            for index in range(8):
                angle=math.tau*index/8; tooth=cone("MAW_WORM_TOOTH",(.32*math.cos(angle),-.28,.92+.32*math.sin(angle)),.055,0,.26,EMISSIVE,"EMISSIVE",12); tooth.rotation_euler[0]=math.pi/2
        else:  # impossible polyhedron
            ico("POLYHEDRON_CORE",(0,0,.12),(.72,.62,.8),PRIMARY,"PRIMARY",1); torus("POLYHEDRON_RING_X",(0,0,.12),.88,.055,ACCENT,"ACCENT",(math.pi/2,0,0)); torus("POLYHEDRON_RING_Y",(0,0,.12),.88,.055,SECONDARY,"SECONDARY",(0,math.pi/2,0))
            for side in (-1,1): prism_xz("POLYHEDRON_LIMB",[(side*.42,.35),(side*1.15,.75),(side*.88,-.2),(side*.38,-.42)],.17,PRIMARY,"PRIMARY",.045)
            ico("POLYHEDRON_EYE",(0,-.65,.18),(.22,.07,.26),EMISSIVE,"EMISSIVE",3)
        return
    if archetype == "mimic":
        if variant==4:  # door mimic
            cube("DOOR_BODY",(0,0,.05),(.72,.3,1.25),PRIMARY,"PRIMARY",.08); prism_xz("DOOR_MAW",[(-.55,.35),(0,-.15),(.55,.35),(0,.7)],.65,SECONDARY,"SECONDARY",.05)
            for x in (-.38,-.12,.12,.38): cone("DOOR_TOOTH",(x,-.65,.32),.06,0,.3,EMISSIVE,"EMISSIVE",12).rotation_euler[0]=math.pi/2
            eyes([(-.25,-.32,.82),(.25,-.32,.82)])
        elif variant==5:  # book mimic
            cube("BOOK_COVER_TOP",(0,0,.36),(.82,.5,.12),PRIMARY,"PRIMARY",.06); cube("BOOK_COVER_BOTTOM",(0,0,-.36),(.82,.5,.12),PRIMARY,"PRIMARY",.06); cube("BOOK_PAGES",(0,0,0),(.72,.44,.26),SECONDARY,"SECONDARY",.04)
            for x in (-.5,-.25,0,.25,.5): cone("BOOK_TOOTH",(x,-.48,.03),.05,0,.25,EMISSIVE,"EMISSIVE",12).rotation_euler[0]=math.pi/2
            curve_tube("BOOK_TONGUE",[(0,-.48,-.1),(.18,-.72,-.42),(-.05,-.78,-.68)],.07,ACCENT,"ACCENT"); eyes([(-.28,-.48,.22),(.28,-.48,.22)])
        elif variant==6:  # barrel mimic
            cylinder("BARREL_BODY",(0,0,-.05),.65,1.5,SECONDARY,"SECONDARY",16,.08); torus("BARREL_BAND_TOP",(0,0,.52),.58,.08,PRIMARY,"PRIMARY"); torus("BARREL_BAND_BOTTOM",(0,0,-.58),.58,.08,PRIMARY,"PRIMARY")
            prism_xz("BARREL_MOUTH",[(-.48,.28),(0,-.25),(.48,.28),(0,.65)],.68,ACCENT,"ACCENT",.055); eyes([(-.2,-.58,.62),(.2,-.58,.62)])
        elif variant==7:  # satchel mimic
            cube("SATCHEL_BODY",(0,0,-.12),(.78,.4,.62),PRIMARY,"PRIMARY",.14); prism_xz("SATCHEL_FLAP",[(-.72,.45),(0,.9),(.72,.45),(.58,.05),(-.58,.05)],.45,ACCENT,"ACCENT",.06)
            curve_tube("SATCHEL_STRAP",[(-.62,0,.25),(-.82,0,1.0),(0,0,1.35),(.82,0,1.0),(.62,0,.25)],.07,SECONDARY,"SECONDARY"); eyes([(-.24,-.42,.12),(.24,-.42,.12)])
            for side in (-1,1): limb("SATCHEL_LEG",(side*.4,0,-.58),(side*.62,0,-1.05),.08,SECONDARY,"SECONDARY")
        else:  # statue mimic
            cube("STATUE_PLINTH",(0,0,-.82),(.72,.52,.25),SECONDARY,"SECONDARY",.08); uv_sphere("STATUE_TORSO",(0,0,.05),(.52,.38,.68),PRIMARY,"PRIMARY"); uv_sphere("STATUE_HEAD",(0,0,.92),(.34,.3,.36),ACCENT,"ACCENT")
            for side in (-1,1): limb("STATUE_ARM",(side*.42,0,.45),(side*.72,0,-.15),.12,PRIMARY,"PRIMARY")
            prism_xz("STATUE_MAW",[(-.32,.92),(0,.62),(.32,.92),(0,1.15)],.36,SECONDARY,"SECONDARY",.04); eyes([(-.12,-.29,.98),(.12,-.29,.98)])
        return
    if archetype == "swarm":
        kind={4:"FLY",5:"RAT",6:"FISH",7:"SKULL",8:"BEETLE"}[variant]
        count={4:26,5:14,6:20,7:12,8:18}[variant]
        for index in range(count):
            angle=index*2.399963; radius=.16+.065*index; x=math.cos(angle)*radius; y=math.sin(angle)*radius*.32; z=-.9+index*(1.8/max(1,count-1))
            if variant==4:
                uv_sphere("FLY_BODY",(x,y,z),(.09,.06,.13),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",16,8)
                for side in (-1,1): uv_sphere("FLY_WING",(x+side*.09,y,z+.04),(.1,.025,.08),SECONDARY,"SECONDARY",12,6)
            elif variant==5:
                uv_sphere("RAT_BODY",(x,y,z),(.16,.1,.13),PRIMARY if index%2 else SECONDARY,"PRIMARY" if index%2 else "SECONDARY",16,8); curve_tube("RAT_TAIL",[(x-.12,y,z),(x-.25,y,z-.08)],.018,ACCENT,"ACCENT")
            elif variant==6:
                uv_sphere("FISH_BODY",(x,y,z),(.18,.07,.1),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",16,8); prism_xz("FISH_TAIL",[(x-.12,z),(x-.28,z+.1),(x-.28,z-.1)],.08,SECONDARY,"SECONDARY",.015)
            elif variant==7:
                uv_sphere("SWARM_SKULL",(x,y,z),(.14,.1,.15),PRIMARY,"PRIMARY",16,8); eyes([(x-.04,y-.1,z+.03),(x+.04,y-.1,z+.03)])
            else:
                ico("SWARM_BEETLE",(x,y,z),(.13,.08,.15),PRIMARY if index%2 else ACCENT,"PRIMARY" if index%2 else "ACCENT",1)
        return
    if archetype == "bat":
        forms={4:("VAMPIRE",(.48,.34,.68),(.38,.3,.38),1.65),5:("FRUIT",(.64,.38,.58),(.44,.34,.4),1.48),6:("HAMMERHEAD",(.5,.34,.62),(.66,.3,.3),1.58),7:("LEAFNOSE",(.52,.34,.65),(.4,.32,.42),1.72),8:("GHOST",(.46,.3,.72),(.34,.28,.38),1.8)}
        title,body_scale,head_scale,span=forms[variant]
        uv_sphere(f"{title}_BAT_BODY",(0,0,0),body_scale,SECONDARY,"SECONDARY"); uv_sphere(f"{title}_BAT_HEAD",(0,0,.72),head_scale,PRIMARY,"PRIMARY")
        for side in (-1,1):
            shoulder=(side*.32,0,.45); elbow=(side*span*.56,0,.62); tip=(side*span,0,.05); limb(f"{title}_WING_ARM",shoulder,elbow,.06,PRIMARY,"PRIMARY"); limb(f"{title}_WING_FOREARM",elbow,tip,.045,PRIMARY,"PRIMARY")
            prism_xz(f"{title}_WING",[(side*.28,.42),(side*span*.56,.62),(side*span,.05),(side*span*.62,-.48),(side*.3,-.25)],.065,ACCENT,"ACCENT",.02)
            cone(f"{title}_EAR",(side*.2,0,1.12),.14 if variant!=5 else .1,.02,.5 if variant!=5 else .34,PRIMARY,"PRIMARY",18)
        if variant==4:
            for side in (-1,1): cone("VAMPIRE_FANG",(side*.1,-.32,.58),.035,0,.24,EMISSIVE,"EMISSIVE",10).rotation_euler[0]=math.pi
        elif variant==5: uv_sphere("FRUIT_MUZZLE",(0,-.3,.64),(.25,.14,.2),ACCENT,"ACCENT")
        elif variant==6: cylinder("HAMMERHEAD_BAR",(0,0,.78),.22,1.2,ACCENT,"ACCENT",24,.04).rotation_euler[1]=math.pi/2
        elif variant==7: prism_xz("LEAF_NOSE",[(-.16,.62),(0,1.12),(.16,.62),(0,.42)],.22,ACCENT,"ACCENT",.035)
        else: prism_xz("GHOST_TAIL",[(-.38,-.35),(0,-1.1),(.38,-.35),(0,.2)],.28,PRIMARY,"PRIMARY",.055)
        eyes([(-.12,-.3,.76),(.12,-.3,.76)])
        return
    raise KeyError(f"Missing authored enemy family: {archetype}")


def build_authored_pet_variant(form, variant):
    """Build pet variants 4-8 independently from the enemy library."""
    if variant not in (4,5,6,7,8):
        raise ValueError(f"No authored v{variant} pet plan for {form}")
    if form == "quadruped":
        pets={4:("FOX_CUB",(-.12,0,.05),(.68,.34,.4),(.55,0,.38),(.36,.3,.34)),5:("BEAR_CUB",(-.1,0,.02),(.66,.43,.5),(.48,0,.38),(.4,.36,.4)),6:("FAWN",(-.12,0,.08),(.62,.3,.38),(.52,0,.55),(.32,.27,.34)),7:("CAT",(-.12,0,.05),(.64,.3,.36),(.52,0,.42),(.34,.28,.32)),8:("CORGI",(-.12,0,.0),(.7,.35,.38),(.56,0,.32),(.38,.31,.34))}
        title,body_loc,body_scale,head_loc,head_scale=pets[variant]
        uv_sphere(f"{title}_BODY",body_loc,body_scale,PRIMARY,"PRIMARY"); uv_sphere(f"{title}_HEAD",head_loc,head_scale,ACCENT,"ACCENT")
        leg_bottom=-.68 if variant!=6 else -.82
        four_legs(title,(-.48,-.16,.18,.45),-.16,leg_bottom,.07,SECONDARY,"SECONDARY")
        if variant==4:
            for side in (-1,1): cone("FOX_EAR",(.52+side*.18,0,.72),.1,0,.32,PRIMARY,"PRIMARY",16)
            curve_tube("FOX_TAIL",[(-.68,0,.12),(-1.05,0,.38),(-1.18,0,.72)],.13,ACCENT,"ACCENT")
        elif variant==5:
            for side in (-1,1): uv_sphere("BEAR_CUB_EAR",(.48+side*.2,0,.7),(.13,.1,.13),SECONDARY,"SECONDARY")
            uv_sphere("BEAR_CUB_MUZZLE",(.76,-.2,.3),(.22,.14,.16),SECONDARY,"SECONDARY")
        elif variant==6:
            for side in (-1,1):
                prism_xz("FAWN_EAR",[(.5+side*.05,.66),(.5+side*.35,.92),(.5+side*.16,.58)],.12,PRIMARY,"PRIMARY",.02)
                cone("FAWN_ANTLER",(.5+side*.12,0,.8),.045,0,.32,SECONDARY,"SECONDARY",12)
        elif variant==7:
            for side in (-1,1): cone("CAT_EAR",(.52+side*.18,0,.68),.1,0,.3,PRIMARY,"PRIMARY",16)
            curve_tube("CAT_TAIL",[(-.7,0,.08),(-1.0,0,.42),(-.82,0,.82)],.075,PRIMARY,"PRIMARY")
        else:
            for side in (-1,1): prism_xz("CORGI_EAR",[(.54+side*.05,.54),(.54+side*.3,.82),(.54+side*.18,.42)],.12,PRIMARY,"PRIMARY",.02)
            uv_sphere("CORGI_MUZZLE",(.8,-.18,.25),(.23,.14,.16),SECONDARY,"SECONDARY")
        eyes([(.46,-.28,.46),(.64,-.27,.46)])
        return
    if form == "avian":
        if variant==4:  # owlet
            uv_sphere("OWLET_BODY",(0,0,-.05),(.48,.36,.56),PRIMARY,"PRIMARY"); uv_sphere("OWLET_HEAD",(0,0,.56),(.5,.38,.42),ACCENT,"ACCENT")
            for side in (-1,1):
                prism_xz("OWLET_WING",[(side*.22,.3),(side*.62,.08),(side*.38,-.5),(side*.14,-.18)],.12,SECONDARY,"SECONDARY",.03)
                torus("OWLET_EYE_RING",(side*.17,-.37,.62),.15,.04,EMISSIVE,"EMISSIVE",(math.pi/2,0,0))
            cone("OWLET_BEAK",(0,-.42,.48),.09,0,.28,SECONDARY,"SECONDARY",14).rotation_euler[0]=math.pi/2
        elif variant==5:  # raven chick
            uv_sphere("RAVEN_CHICK_BODY",(0,0,-.08),(.44,.34,.54),SECONDARY,"SECONDARY"); uv_sphere("RAVEN_CHICK_HEAD",(.05,0,.54),(.36,.3,.34),PRIMARY,"PRIMARY")
            spread_wings("RAVEN_CHICK",.2,.72,.45,.12,ACCENT,"ACCENT"); cone("RAVEN_CHICK_BEAK",(.05,-.34,.53),.09,0,.38,SECONDARY,"SECONDARY",16).rotation_euler[0]=math.pi/2; eyes([(-.05,-.28,.6),(.15,-.28,.6)])
        elif variant==6:  # duckling
            uv_sphere("DUCKLING_BODY",(0,0,-.12),(.52,.38,.46),PRIMARY,"PRIMARY"); uv_sphere("DUCKLING_HEAD",(.18,0,.48),(.34,.3,.34),ACCENT,"ACCENT"); prism_xz("DUCKLING_BILL",[(-.18,.48),(.18,.48),(.34,.34),(-.34,.34)],.44,SECONDARY,"SECONDARY",.035)
            for side in (-1,1): uv_sphere("DUCKLING_WING",(side*.38,.02,-.05),(.28,.14,.34),SECONDARY,"SECONDARY"); eyes([(.08,-.28,.54),(.26,-.27,.54)])
        elif variant==7:  # gryphon chick
            uv_sphere("GRYPHON_CHICK_BODY",(-.08,0,-.08),(.52,.36,.46),SECONDARY,"SECONDARY"); uv_sphere("GRYPHON_CHICK_HEAD",(.28,0,.5),(.36,.3,.34),PRIMARY,"PRIMARY"); cone("GRYPHON_CHICK_BEAK",(.28,-.34,.48),.1,0,.34,ACCENT,"ACCENT",16).rotation_euler[0]=math.pi/2
            spread_wings("GRYPHON_CHICK",.18,.8,.58,.08,PRIMARY,"PRIMARY"); four_legs("GRYPHON_CHICK",(-.36,-.08,.18,.35),-.18,-.72,.055,ACCENT,"ACCENT"); eyes([(.18,-.28,.56),(.36,-.27,.56)])
        else:  # phoenix chick
            uv_sphere("PHOENIX_CHICK_BODY",(0,0,-.08),(.46,.34,.54),PRIMARY,"PRIMARY"); uv_sphere("PHOENIX_CHICK_HEAD",(.08,0,.58),(.34,.29,.34),ACCENT,"ACCENT"); cone("PHOENIX_BEAK",(.08,-.33,.56),.09,0,.3,SECONDARY,"SECONDARY",16).rotation_euler[0]=math.pi/2
            spread_wings("PHOENIX_CHICK",.25,.92,.72,.1,ACCENT,"ACCENT")
            for side in (-1,0,1): prism_xz("PHOENIX_TAIL",[(side*.08,-.4),(side*.28,-1.18),(side*.42,-.42)],.1,EMISSIVE if side==0 else PRIMARY,"EMISSIVE" if side==0 else "PRIMARY",.025)
            eyes([(-.02,-.28,.64),(.16,-.28,.64)])
        return
    if form == "crawler":
        if variant==4:  # jewel beetle
            uv_sphere("JEWEL_BEETLE_SHELL",(0,0,-.05),(.56,.4,.65),PRIMARY,"PRIMARY"); uv_sphere("JEWEL_BEETLE_HEAD",(0,0,.62),(.32,.28,.3),ACCENT,"ACCENT"); cylinder_between("JEWEL_BEETLE_SEAM",(0,-.4,-.55),(0,-.4,.5),.02,EMISSIVE,"EMISSIVE",12)
            for row in range(3):
                for side in (-1,1): limb("JEWEL_BEETLE_LEG",(side*.28,0,.35-row*.32),(side*.72,0,.1-row*.32),.035,SECONDARY,"SECONDARY")
            eyes([(-.1,-.27,.68),(.1,-.27,.68)])
        elif variant==5:  # caterpillar
            for i in range(7):
                z=-.68+i*.22; uv_sphere("CATERPILLAR_SEGMENT",(0,0,z),(.32,.28,.24),PRIMARY if i%2 else ACCENT,"PRIMARY" if i%2 else "ACCENT")
                if i<5:
                    for side in (-1,1): limb("CATERPILLAR_FOOT",(side*.2,0,z),(side*.36,-.02,z-.12),.025,SECONDARY,"SECONDARY",12)
            uv_sphere("CATERPILLAR_HEAD",(0,0,.88),(.35,.3,.32),SECONDARY,"SECONDARY"); eyes([(-.11,-.28,.94),(.11,-.28,.94)])
        elif variant==6:  # spiderling
            uv_sphere("SPIDERLING_BODY",(0,0,-.15),(.48,.38,.5),PRIMARY,"PRIMARY"); uv_sphere("SPIDERLING_HEAD",(0,0,.4),(.32,.3,.3),ACCENT,"ACCENT")
            for row in range(4):
                z=.3-row*.2
                for side in (-1,1): limb("SPIDERLING_LEG",(side*.2,0,z),(side*.78,(row-1.5)*.08,z-.25),.03,SECONDARY,"SECONDARY")
            eyes([(-.12,-.28,.46),(0,-.31,.5),(.12,-.28,.46)])
        elif variant==7:  # snail
            uv_sphere("SNAIL_FOOT",(0,0,-.48),(.72,.4,.25),SECONDARY,"SECONDARY"); uv_sphere("SNAIL_HEAD",(.48,0,-.18),(.34,.3,.34),ACCENT,"ACCENT"); torus("SNAIL_SHELL",(-.2,0,.12),.48,.18,PRIMARY,"PRIMARY",(math.pi/2,0,0))
            for side in (-1,1): curve_tube("SNAIL_STALK",[(.48+side*.08,0,.05),(.52+side*.22,0,.45)],.035,PRIMARY,"PRIMARY"); eyes([(.52+side*.22,-.02,.48)])
        else:  # baby mantis
            uv_sphere("BABY_MANTIS_BODY",(0,0,-.1),(.26,.24,.54),PRIMARY,"PRIMARY"); uv_sphere("BABY_MANTIS_HEAD",(0,0,.58),(.36,.3,.28),ACCENT,"ACCENT")
            for side in (-1,1):
                limb("BABY_MANTIS_ARM",(side*.18,0,.35),(side*.62,0,.12),.045,PRIMARY,"PRIMARY"); limb("BABY_MANTIS_CLAW",(side*.62,0,.12),(side*.32,0,-.22),.035,ACCENT,"ACCENT")
                for row in range(2): limb("BABY_MANTIS_LEG",(side*.16,0,.05-row*.3),(side*.62,0,-.15-row*.3),.03,SECONDARY,"SECONDARY")
            eyes([(-.12,-.28,.64),(.12,-.28,.64)])
        return
    if form == "aquatic":
        if variant==4:  # axolotl
            uv_sphere("AXOLOTL_BODY",(-.08,0,-.05),(.66,.32,.34),PRIMARY,"PRIMARY"); uv_sphere("AXOLOTL_HEAD",(.5,0,.12),(.38,.32,.34),ACCENT,"ACCENT")
            curve_tube("AXOLOTL_TAIL",[(-.68,0,-.08),(-1.05,0,.08),(-1.28,0,.38)],.11,PRIMARY,"PRIMARY")
            for side in (-1,1):
                for z in (-.05,.14,.33): curve_tube("AXOLOTL_GILL",[(.4+side*.08,0,.3),( .4+side*.34,0,z+.35)],.035,EMISSIVE,"EMISSIVE")
            eyes([(.4,-.3,.18),(.58,-.29,.18)])
        elif variant==5:  # pufferfish
            uv_sphere("PUFFER_BODY",(0,0,0),(.68,.58,.68),PRIMARY,"PRIMARY"); eyes([(-.18,-.52,.18),(.18,-.52,.18)])
            for index in range(14):
                angle=math.tau*index/14; spike=cone("PUFFER_SPINE",(.58*math.cos(angle),0,.58*math.sin(angle)),.045,0,.3,ACCENT,"ACCENT",12); spike.rotation_euler[1]=angle
            prism_xz("PUFFER_TAIL",[(-.58,.12),(-1.05,.55),(-1.0,-.55),(-.58,-.12)],.12,SECONDARY,"SECONDARY",.025)
        elif variant==6:  # baby ray
            prism_xz("BABY_RAY_BODY",[(-1.05,.08),(-.45,.5),(0,.38),(.45,.5),(1.05,.08),(.42,-.32),(0,-.12),(-.42,-.32)],.2,PRIMARY,"PRIMARY",.055); curve_tube("BABY_RAY_TAIL",[(0,0,-.16),(-.04,0,-.7),(.08,0,-1.25)],.035,SECONDARY,"SECONDARY"); eyes([(-.2,-.18,.2),(.2,-.18,.2)])
        elif variant==7:  # tiny seahorse
            curve_tube("TINY_SEAHORSE_BODY",[(0,0,-.58),(-.2,0,-.18),(-.12,0,.28),(.08,0,.62)],.18,PRIMARY,"PRIMARY"); uv_sphere("TINY_SEAHORSE_HEAD",(.16,0,.78),(.3,.26,.3),ACCENT,"ACCENT"); cylinder("TINY_SEAHORSE_SNOUT",(.16,-.3,.76),.065,.48,SECONDARY,"SECONDARY",16,.015).rotation_euler[0]=math.pi/2
            curve_tube("TINY_SEAHORSE_TAIL",[(0,0,-.56),(-.35,0,-.82),(-.3,0,-1.08),(0,0,-1.08),(.08,0,-.9)],.065,PRIMARY,"PRIMARY"); eyes([(.1,-.25,.84)])
        else:  # hermit crab
            uv_sphere("HERMIT_SHELL",(-.18,0,.08),(.58,.45,.58),PRIMARY,"PRIMARY"); uv_sphere("HERMIT_BODY",(.35,0,-.12),(.38,.3,.32),ACCENT,"ACCENT")
            for side in (-1,1):
                for row in range(2): limb("HERMIT_LEG",(side*.22,0,-.18-row*.16),(side*.68,0,-.4-row*.14),.035,SECONDARY,"SECONDARY")
                limb("HERMIT_CLAW_ARM",(side*.3,0,.05),(side*.68,0,.28),.06,ACCENT,"ACCENT"); uv_sphere("HERMIT_CLAW",(side*.82,0,.32),(.22,.16,.18),ACCENT,"ACCENT")
            eyes([(.28,-.27,.02),(.46,-.26,.02)])
        return
    if form == "wisp":
        if variant==4:  # flame wisp
            for i,(x,z,size) in enumerate(((0,-.15,.56),(-.22,.2,.34),(.22,.25,.36),(0,.58,.42))): cone("WISP_FLAME",(x,0,z),size,0,size*1.8,PRIMARY if i%2 else ACCENT,"PRIMARY" if i%2 else "ACCENT",24)
            uv_sphere("WISP_FLAME_FACE",(0,-.28,.05),(.28,.14,.3),EMISSIVE,"EMISSIVE",24,12); eyes([(-.1,-.4,.12),(.1,-.4,.12)])
        elif variant==5:  # lantern wisp
            cube("WISP_LANTERN",(0,0,0),(.52,.42,.62),PRIMARY,"PRIMARY",.09); for_x=(-.42,.42)
            for x in for_x:
                for z in (-.5,.5): cylinder_between("WISP_LANTERN_RAIL",(x,-.42,z),(x,.42,z),.03,ACCENT,"ACCENT",12)
            uv_sphere("WISP_LANTERN_LIGHT",(0,-.43,0),(.3,.09,.4),EMISSIVE,"EMISSIVE",24,12); torus("WISP_LANTERN_HANDLE",(0,0,.82),.36,.05,SECONDARY,"SECONDARY",(math.pi/2,0,0))
        elif variant==6:  # cloud wisp
            for x,z,size in ((-.3,.1,.4),(.08,.25,.5),(.38,.05,.36),(-.05,-.25,.42)): uv_sphere("WISP_CLOUD",(x,0,z),(size,size*.7,size*.55),PRIMARY if x<0 else SECONDARY,"PRIMARY" if x<0 else "SECONDARY")
            curve_tube("WISP_RAINBOLT",[(0,-.4,-.1),(.18,-.4,-.38),(-.05,-.4,-.65)],.045,EMISSIVE,"EMISSIVE"); eyes([(-.14,-.35,.25),(.14,-.35,.25)])
        elif variant==7:  # star wisp
            prism_xz("WISP_STAR",[(0,.9),(.2,.28),(.82,.28),(.32,-.08),(.5,-.72),(0,-.32),(-.5,-.72),(-.32,-.08),(-.82,.28),(-.2,.28)],.28,PRIMARY,"PRIMARY",.055); uv_sphere("WISP_STAR_CORE",(0,-.18,.08),(.24,.08,.24),EMISSIVE,"EMISSIVE",24,12); eyes([(-.1,-.28,.12),(.1,-.28,.12)])
        else:  # ghostlet
            uv_sphere("GHOSTLET_HEAD",(0,0,.38),(.48,.38,.48),PRIMARY,"PRIMARY"); prism_xz("GHOSTLET_BODY",[(-.45,.3),(-.55,-.52),(-.22,-.9),(0,-.62),(.22,-.9),(.55,-.52),(.45,.3)],.34,PRIMARY,"PRIMARY",.06); eyes([(-.15,-.36,.45),(.15,-.36,.45)]); torus("GHOSTLET_MOUTH",(0,-.37,.22),.1,.028,ACCENT,"ACCENT",(math.pi/2,0,0))
        return
    if form == "mimic":
        if variant==4:  # chestling
            cube("CHESTLING_BODY",(0,0,-.22),(.62,.42,.38),PRIMARY,"PRIMARY",.1); cube("CHESTLING_LID",(0,.05,.32),(.64,.44,.18),ACCENT,"ACCENT",.09)
            for x in (-.35,-.12,.12,.35): cone("CHESTLING_TOOTH",(x,-.44,.05),.045,0,.22,EMISSIVE,"EMISSIVE",10).rotation_euler[0]=math.pi/2
            for side in (-1,1): limb("CHESTLING_LEG",(side*.35,0,-.5),(side*.48,0,-.82),.055,SECONDARY,"SECONDARY"); eyes([(-.2,-.42,.36),(.2,-.42,.36)])
        elif variant==5:  # bookling
            cube("BOOKLING_COVER_TOP",(0,0,.25),(.62,.4,.1),PRIMARY,"PRIMARY",.05); cube("BOOKLING_COVER_BOTTOM",(0,0,-.25),(.62,.4,.1),PRIMARY,"PRIMARY",.05); cube("BOOKLING_PAGES",(0,0,0),(.55,.35,.16),SECONDARY,"SECONDARY",.035)
            for side in (-1,1): limb("BOOKLING_LEG",(side*.28,0,-.26),(side*.42,0,-.68),.045,ACCENT,"ACCENT"); eyes([(-.2,-.36,.12),(.2,-.36,.12)])
        elif variant==6:  # potion mimic
            uv_sphere("POTION_MIMIC_BOTTLE",(0,0,-.1),(.48,.4,.62),PRIMARY,"PRIMARY"); cylinder("POTION_MIMIC_NECK",(0,0,.62),.22,.42,ACCENT,"ACCENT",24,.04); cube("POTION_MIMIC_CORK",(0,0,.9),(.2,.2,.15),SECONDARY,"SECONDARY",.04)
            prism_xz("POTION_MIMIC_MAW",[(-.34,.08),(0,-.32),(.34,.08),(0,.42)],.44,SECONDARY,"SECONDARY",.045); eyes([(-.15,-.38,.36),(.15,-.38,.36)])
        elif variant==7:  # bagling
            cube("BAGLING_BODY",(0,0,-.1),(.58,.38,.52),PRIMARY,"PRIMARY",.14); curve_tube("BAGLING_HANDLE",[(-.4,0,.3),(-.5,0,.82),(0,0,1.05),(.5,0,.82),(.4,0,.3)],.06,SECONDARY,"SECONDARY")
            for side in (-1,1): limb("BAGLING_LEG",(side*.3,0,-.48),(side*.44,0,-.82),.05,ACCENT,"ACCENT"); eyes([(-.18,-.38,.05),(.18,-.38,.05)])
        else:  # key mimic
            torus("KEY_MIMIC_BOW",(0,0,.58),.42,.12,PRIMARY,"PRIMARY"); cylinder("KEY_MIMIC_SHAFT",(0,0,-.15),.1,1.15,SECONDARY,"SECONDARY",20,.025); prism_xz("KEY_MIMIC_BIT",[(0,-.72),(.5,-.72),(.5,-.48),(.28,-.48),(.28,-.25),(0,-.25)],.2,ACCENT,"ACCENT",.04)
            eyes([(-.14,-.12,.62),(.14,-.12,.62)]); for_side=(-1,1)
            for side in for_side: curve_tube("KEY_MIMIC_ARM",[(side*.1,0,.05),(side*.5,0,-.12),(side*.62,0,.08)],.045,PRIMARY,"PRIMARY")
        return
    if form == "construct":
        if variant==4:  # cogbot
            torus("COGBOT_BODY",(0,0,0),.55,.16,PRIMARY,"PRIMARY",(math.pi/2,0,0)); uv_sphere("COGBOT_HEAD",(0,0,.72),(.32,.28,.3),ACCENT,"ACCENT")
            for side in (-1,1): limb("COGBOT_LEG",(side*.2,0,-.3),(side*.32,0,-.82),.08,SECONDARY,"SECONDARY"); eyes([(-.11,-.27,.76),(.11,-.27,.76)])
        elif variant==5:  # cube golem
            cube("CUBE_GOLEM_BODY",(0,0,-.05),(.5,.38,.5),PRIMARY,"PRIMARY",.1); cube("CUBE_GOLEM_HEAD",(0,0,.65),(.34,.3,.3),ACCENT,"ACCENT",.07)
            for side in (-1,1): cube("CUBE_GOLEM_ARM",(side*.62,0,.05),(.18,.22,.42),SECONDARY,"SECONDARY",.06); cube("CUBE_GOLEM_LEG",(side*.22,0,-.62),(.18,.22,.32),PRIMARY,"PRIMARY",.055)
            eyes([(-.12,-.3,.7),(.12,-.3,.7)])
        elif variant==6:  # orb drone
            uv_sphere("ORB_DRONE_BODY",(0,0,.05),(.55,.48,.55),PRIMARY,"PRIMARY"); torus("ORB_DRONE_RING",(0,0,.05),.68,.055,ACCENT,"ACCENT",(math.pi/2,0,0)); ico("ORB_DRONE_EYE",(0,-.48,.08),(.2,.07,.22),EMISSIVE,"EMISSIVE",3)
            for side in (-1,1): prism_xz("ORB_DRONE_FIN",[(side*.38,.32),(side*.88,.55),(side*.72,-.32),(side*.36,-.2)],.16,SECONDARY,"SECONDARY",.04)
        elif variant==7:  # clockwork bird
            uv_sphere("CLOCKWORK_BIRD_BODY",(0,0,-.08),(.45,.34,.5),ACCENT,"ACCENT"); uv_sphere("CLOCKWORK_BIRD_HEAD",(.12,0,.52),(.3,.27,.3),PRIMARY,"PRIMARY"); cone("CLOCKWORK_BIRD_BEAK",(.12,-.3,.5),.08,0,.3,SECONDARY,"SECONDARY",14).rotation_euler[0]=math.pi/2
            spread_wings("CLOCKWORK_BIRD",.18,.88,.55,.08,PRIMARY,"PRIMARY"); torus("CLOCKWORK_CHEST_GEAR",(0,-.34,-.05),.22,.05,EMISSIVE,"EMISSIVE",(math.pi/2,0,0)); eyes([(.02,-.25,.58),(.2,-.25,.58)])
        else:  # tin knight
            cube("TIN_KNIGHT_BODY",(0,0,-.02),(.4,.32,.5),PRIMARY,"PRIMARY",.08); uv_sphere("TIN_KNIGHT_HELM",(0,0,.65),(.32,.28,.32),ACCENT,"ACCENT")
            for side in (-1,1): limb("TIN_KNIGHT_LEG",(side*.16,0,-.38),(side*.22,0,-.82),.08,SECONDARY,"SECONDARY")
            cylinder_between("TIN_KNIGHT_SWORD",(.4,0,.35),(.68,0,-.45),.04,ACCENT,"ACCENT",14); prism_xz("TIN_KNIGHT_SHIELD",[(-.78,.38),(-.96,.0),(-.78,-.52),(-.46,-.3),(-.48,.32)],.14,PRIMARY,"PRIMARY",.035); eyes([(-.1,-.27,.68),(.1,-.27,.68)])
        return
    if form == "bat":
        bat_forms={4:("ROUND",(.46,.34,.5),(.38,.31,.36),1.15),5:("LONG_EAR",(.4,.3,.55),(.34,.28,.36),1.3),6:("VAMPIRE_PUP",(.42,.3,.52),(.36,.29,.35),1.35),7:("LEAFNOSE_PUP",(.44,.31,.54),(.36,.29,.38),1.28),8:("FRUIT_PUP",(.5,.34,.48),(.4,.32,.36),1.22)}
        title,body_scale,head_scale,span=bat_forms[variant]
        uv_sphere(f"{title}_BAT_BODY",(0,0,-.08),body_scale,SECONDARY,"SECONDARY"); uv_sphere(f"{title}_BAT_HEAD",(0,0,.52),head_scale,PRIMARY,"PRIMARY")
        for side in (-1,1):
            shoulder=(side*.25,0,.28); elbow=(side*span*.58,0,.4); tip=(side*span,0,-.05); limb(f"{title}_BAT_ARM",shoulder,elbow,.045,PRIMARY,"PRIMARY"); limb(f"{title}_BAT_FOREARM",elbow,tip,.035,PRIMARY,"PRIMARY"); prism_xz(f"{title}_BAT_WING",[(side*.22,.28),(side*span*.58,.4),(side*span,-.05),(side*span*.6,-.46),(side*.24,-.28)],.055,ACCENT,"ACCENT",.018)
            ear_height=.62 if variant==5 else .42; cone(f"{title}_BAT_EAR",(side*.18,0,.86),.1,.015,ear_height,PRIMARY,"PRIMARY",16)
        if variant==4: uv_sphere("ROUND_BAT_MUZZLE",(0,-.28,.45),(.22,.13,.16),ACCENT,"ACCENT")
        elif variant==6:
            for side in (-1,1): cone("VAMPIRE_PUP_FANG",(side*.08,-.28,.42),.025,0,.16,EMISSIVE,"EMISSIVE",10).rotation_euler[0]=math.pi
        elif variant==7: prism_xz("LEAFNOSE_PUP_LEAF",[(-.12,.46),(0,.82),(.12,.46),(0,.3)],.16,ACCENT,"ACCENT",.025)
        elif variant==8: uv_sphere("FRUIT_PUP_MUZZLE",(0,-.3,.44),(.23,.14,.17),ACCENT,"ACCENT")
        eyes([(-.11,-.28,.56),(.11,-.28,.56)])
        return
    raise KeyError(f"Missing authored pet family: {form}")


def convert_curves():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "CURVE":
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.convert(target="MESH")
            obj.select_set(False)


def export_asset(folder, filename):
    convert_curves()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{folder}/{filename} contains no mesh geometry")
    vertex_count = sum(len(obj.data.vertices) for obj in meshes)
    if vertex_count < 24:
        raise RuntimeError(f"{folder}/{filename} is underbuilt ({vertex_count} vertices)")
    target = os.path.join(OUT, folder, f"{filename}.glb")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False)
    print(f"WROTE {target}")


def main():
    for name, builder in GEAR_BUILDERS.items():
        for variant in range(1, VARIANT_COUNT + 1):
            clear_scene()
            if variant == 1: builder()
            elif variant <= 3: build_gear_variant(name, variant)
            else: build_authored_gear_variant(name, variant)
            export_asset("gear", name if variant == 1 else f"{name}_v{variant}")
    for archetype in ENEMY_ARCHETYPES:
        for variant in range(1, VARIANT_COUNT + 1):
            clear_scene()
            if variant == 1: creature(archetype)
            elif variant <= 3: build_creature_variant(archetype, variant)
            else: build_authored_enemy_variant(archetype, variant)
            export_asset("enemies", archetype if variant == 1 else f"{archetype}_v{variant}")
    for form, archetype in PET_FORMS.items():
        for variant in range(1, VARIANT_COUNT + 1):
            clear_scene()
            if variant == 1: creature(archetype)
            elif variant <= 3: build_creature_variant(archetype, variant, companion=True)
            else: build_authored_pet_variant(form, variant)
            export_asset("pets", form if variant == 1 else f"{form}_v{variant}")
    count = VARIANT_COUNT * (len(GEAR_BUILDERS) + len(ENEMY_ARCHETYPES) + len(PET_FORMS))
    print(f"Built {count} GLB templates in {OUT}")


if __name__ == "__main__":
    main()
