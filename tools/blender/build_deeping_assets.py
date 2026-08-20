#!/usr/bin/env python3
"""Build The Deeping's authored GLB template library inside Blender.

Run with:
  blender -b --python tools/blender/build_deeping_assets.py -- --output public/models

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
    return parser.parse_args(argv)


OUT = os.path.abspath(cli_args().output)


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
    for name, builder in GEAR_BUILDERS.items():
        for variant in (1, 2, 3):
            clear_scene()
            if variant == 1: builder()
            else: build_gear_variant(name, variant)
            export_asset("gear", name if variant == 1 else f"{name}_v{variant}")
    for archetype in ENEMY_ARCHETYPES:
        for variant in (1, 2, 3):
            clear_scene()
            if variant == 1: creature(archetype)
            else: build_creature_variant(archetype, variant)
            export_asset("enemies", archetype if variant == 1 else f"{archetype}_v{variant}")
    for form, archetype in PET_FORMS.items():
        for variant in (1, 2, 3):
            clear_scene()
            if variant == 1: creature(archetype)
            else: build_creature_variant(archetype, variant, companion=True)
            export_asset("pets", form if variant == 1 else f"{form}_v{variant}")
    count = 3 * (len(GEAR_BUILDERS) + len(ENEMY_ARCHETYPES) + len(PET_FORMS))
    print(f"Built {count} GLB templates in {OUT}")


if __name__ == "__main__":
    main()
