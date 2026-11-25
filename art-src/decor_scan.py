"""Render photo-scanned models (Poly Haven, CC0) as tank decoration sprites.

Each model is lit the way an aquarium lights it: a hard lamp straight above,
almost nothing from the sides, a dim cool bounce from the front glass.

Usage: blender -b -P decor_scan.py -- <model-root> <output-dir> [name ...]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, OUT = argv[0], argv[1]
ONLY = set(argv[2:])
PAD = 1.04

# sprite name: (model folder, height in pixels at the front glass, turn about the vertical in degrees, tip forward in degrees)
JOBS = {
    'rock_boulder': ('boulder_01', 300, 0, 0),
    'rock_granite': ('namaqualand_boulder_02', 230, 40, 0),
    'rock_sandstone': ('namaqualand_boulder_05', 200, 0, 0),
    'rock_flat': ('rock_09', 110, 30, 0),
    'rock_pebble': ('stone_01', 90, 0, 0),
    'rock_mossy': ('rock_moss_set_01', 170, 0, 0),
    'rock_stones': ('namaqualand_stones_01', 110, 0, 0),
    'rock_small': ('sand_rocks_small_01', 80, 0, 0),
    'rock_pile': ('namaqualand_rocks_01', 200, 0, 0),
    'wood_branch': ('dead_quiver_branch_01', 330, 0, 0),
    'wood_branch_low': ('dead_quiver_branch_01', 200, 20, 70),
    'wood_arch': ('dead_quiver_branch_02', 300, 0, 0),
    'wood_arch_low': ('dead_quiver_branch_02', 190, -30, 75),
    'wood_trunk': ('dead_tree_trunk', 240, 0, 0),
    'wood_log': ('dead_tree_trunk_02', 220, 0, 0),
    'wood_stump': ('dead_quiver_trunk', 320, 0, 0),
    'wood_twigs': ('dry_branches_medium_01', 300, 0, 0),
    'plant_fern': ('fern_02', 300, 0, 0),
    'plant_anubias': ('anthurium_botany_01', 260, 0, 0),
    'plant_sword': ('calathea_orbifolia_01', 420, 0, 0),
    'plant_grass_tall': ('grass_medium_01', 560, 0, 0),
    'plant_grass': ('grass_medium_02', 300, 0, 0),
    'plant_carpet': ('grass_bermuda_01', 80, 0, 0),
    'plant_moss': ('moss_01', 60, 0, 0),
    'plant_stem': ('periwinkle_plant', 380, 0, 0),
    'plant_nettle': ('nettle_plant', 600, 0, 0),
    'plant_clover': ('celandine_01', 180, 0, 0),
    'plant_weed': ('weed_plant_02', 340, 0, 0),
    'plant_sorrel': ('shrub_sorrel_01', 260, 0, 0),
    'plant_bush': ('shrub_01', 420, 0, 0),
    'plant_bush_b': ('shrub_03', 380, 0, 0),
    'orn_chest': ('treasure_chest', 190, -25, 0),
    'orn_pot': ('planter_pot_clay', 160, 20, 82),
    'orn_vase': ('ceramic_vase_01', 220, 0, 0),
    'orn_shell': ('lambis_shell', 110, 30, 0),
    'orn_statue': ('gothic_statue', 340, 0, 0),
    'orn_lion': ('lion_head', 200, 0, 0),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.10, 0.16, 0.17, 1)
    bg.inputs[1].default_value = 0.55
    scene.world = world
    return scene


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def groups_of(meshes):
    """Scans often hold several variants side by side: split them where there is a gap along x."""
    spans = sorted(((bounds([o])[0].x, bounds([o])[1].x, o) for o in meshes), key=lambda s: s[0])
    groups = []
    for lo, hi, obj in spans:
        if groups and lo < groups[-1][1] - 0.02 * (groups[-1][1] - groups[-1][0]):
            groups[-1][1] = max(groups[-1][1], hi)
            groups[-1][2].append(obj)
        else:
            groups.append([lo, hi, [obj]])
    return [g[2] for g in groups]


def add_area(scene, name, energy, size, color, location, rotation):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.size = size
    light.color = color
    obj = bpy.data.objects.new(name, light)
    obj.location = location
    obj.rotation_euler = rotation
    scene.collection.objects.link(obj)
    return obj


def render(name, folder, height_px, yaw, pitch):
    scene = reset()
    src = os.path.join(ROOT, folder)
    gltf = [f for f in os.listdir(src) if f.endswith('.gltf')][0]
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, gltf))
    meshes = [o for o in scene.objects if o.type == 'MESH']
    pivot = bpy.data.objects.new('pivot', None)
    scene.collection.objects.link(pivot)
    for o in scene.objects:
        if o.parent is None and o is not pivot:
            o.parent = pivot
    pivot.rotation_euler = (math.radians(pitch), 0, math.radians(yaw))
    bpy.context.view_layer.update()

    # Leaves let light through.
    if name.startswith('plant_'):
        for mat in bpy.data.materials:
            if not mat.use_nodes:
                continue
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    node.inputs['Subsurface Weight'].default_value = 0.3
                    node.inputs['Subsurface Radius'].default_value = (0.2, 0.6, 0.1)

    groups = groups_of(meshes) if yaw == 0 and pitch == 0 else [meshes]
    tallest = max(bounds(g)[1].z - bounds(g)[0].z for g in groups)
    scale = height_px / (tallest * PAD)
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam_obj = bpy.data.objects.new('cam', cam)
    cam_obj.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    lamp = add_area(scene, 'lamp', 1, 1, (1.0, 0.98, 0.93), (0, 0, 0), (math.radians(14), 0, 0))
    fill = add_area(scene, 'fill', 1, 1, (0.75, 0.9, 0.95), (0, 0, 0), (math.radians(80), 0, 0))

    for index, group in enumerate(groups):
        for o in meshes:
            o.hide_render = o not in group
        lo, hi = bounds(group)
        size = hi - lo
        if size.z * scale < 24:
            continue
        centre = (lo + hi) / 2
        span = max(size.x, size.z)
        lamp.data.energy = 190 * span * span
        lamp.data.size = span * 1.6
        lamp.location = (centre.x, centre.y - span * 0.4, hi.z + span * 1.6)
        fill.data.energy = 30 * span * span
        fill.data.size = span * 3
        fill.location = (centre.x, lo.y - span * 3, centre.z + span * 0.5)
        cam.ortho_scale = span * PAD
        cam_obj.location = (centre.x, lo.y - span * 6, centre.z)
        scene.render.resolution_x = max(8, round(size.x * PAD * scale))
        scene.render.resolution_y = max(8, round(size.z * PAD * scale))
        scene.render.resolution_percentage = 100
        out_name = name if len(groups) == 1 else f'{name}_{index + 1}'
        scene.render.filepath = os.path.join(OUT, out_name + '.png')
        bpy.ops.render.render(write_still=True)
        print('RENDERED', out_name, scene.render.resolution_x, scene.render.resolution_y)


os.makedirs(OUT, exist_ok=True)
for job_name, job in JOBS.items():
    if ONLY and job_name not in ONLY:
        continue
    try:
        render(job_name, *job)
    except Exception as error:  # one bad model must not stop the batch
        print('FAILED', job_name, error)
