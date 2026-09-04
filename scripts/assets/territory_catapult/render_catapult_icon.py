import bpy
import math
import os
import sys
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
if len(args) != 2:
    raise SystemExit("usage: blender --background --factory-startup --python render_catapult_icon.py -- model.glb output.png")

model_path = os.path.abspath(args[0])
output_path = os.path.abspath(args[1])
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=model_path)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("catapult render has no mesh")

minimum = Vector((float("inf"), float("inf"), float("inf")))
maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
for obj in meshes:
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        minimum.x = min(minimum.x, world.x)
        minimum.y = min(minimum.y, world.y)
        minimum.z = min(minimum.z, world.z)
        maximum.x = max(maximum.x, world.x)
        maximum.y = max(maximum.y, world.y)
        maximum.z = max(maximum.z, world.z)
center = (minimum + maximum) * 0.5

camera_data = bpy.data.cameras.new("catapult_icon_camera")
camera = bpy.data.objects.new("catapult_icon_camera", camera_data)
bpy.context.scene.collection.objects.link(camera)
camera.location = center + Vector((3.25, -4.8, 3.0))
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z) * 1.72


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


look_at(camera, center + Vector((0.0, 0.0, 0.12)))
bpy.context.scene.camera = camera

world = bpy.context.scene.world or bpy.data.worlds.new("catapult_icon_world")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.006, 0.012, 0.024, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28

for name, location, energy, color, size in [
    ("warm_key", (3.5, -4.0, 5.2), 850.0, (1.0, 0.66, 0.32), 3.0),
    ("cool_fill", (-3.0, -1.0, 3.2), 500.0, (0.2, 0.42, 0.78), 3.5),
    ("amber_rim", (-1.0, 3.0, 4.0), 650.0, (1.0, 0.42, 0.12), 2.6),
]:
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.color = color
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = Vector(location)
    look_at(light, center)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.filepath = output_path
scene.render.image_settings.color_depth = "8"
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)
print("WOC_CATAPULT_ICON=" + output_path)
