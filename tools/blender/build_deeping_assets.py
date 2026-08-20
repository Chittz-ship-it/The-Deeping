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
        clear_scene(); builder(); export_asset("gear", name)
    for archetype in ENEMY_ARCHETYPES:
        clear_scene(); creature(archetype); export_asset("enemies", archetype)
    for form, archetype in PET_FORMS.items():
        clear_scene(); creature(archetype); export_asset("pets", form)
    print(f"Built {len(GEAR_BUILDERS)+len(ENEMY_ARCHETYPES)+len(PET_FORMS)} GLB templates in {OUT}")


if __name__ == "__main__":
    main()
