import bpy
import os
import sys
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
if len(args) != 2:
    raise SystemExit(
        "usage: blender --background --factory-startup --python export_catapult.py -- Catapult.obj output.glb"
    )

source_path = os.path.abspath(args[0])
output_path = os.path.abspath(args[1])
source_dir = os.path.dirname(source_path)
os.makedirs(os.path.dirname(output_path), exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=source_path)

for obj in list(bpy.context.scene.objects):
    if "projektil" in obj.name.lower() or "projectile" in obj.name.lower():
        bpy.data.objects.remove(obj, do_unlink=True)


def packed_material(name, diffuse_name, bump_name, metallic, roughness):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    diffuse = nodes.new("ShaderNodeTexImage")
    diffuse.image = bpy.data.images.load(
        os.path.join(source_dir, "Textures", diffuse_name), check_existing=True
    )
    diffuse.image.colorspace_settings.name = "sRGB"
    material.node_tree.links.new(diffuse.outputs["Color"], shader.inputs["Base Color"])

    bump_texture = nodes.new("ShaderNodeTexImage")
    bump_texture.image = bpy.data.images.load(
        os.path.join(source_dir, "Textures", bump_name), check_existing=True
    )
    bump_texture.image.colorspace_settings.name = "Non-Color"
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.08
    material.node_tree.links.new(bump_texture.outputs["Color"], bump.inputs["Height"])
    material.node_tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


material = packed_material(
    "territory_catapult_material",
    "Catapult Diffuse.png",
    "Catapult Bump.png",
    0.08,
    0.72,
)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in meshes:
    obj.name = "territory_catapult_" + obj.name.lower().replace(" ", "_")
    obj.data.materials.clear()
    obj.data.materials.append(material)

# Normalize the static wound-up OBJ around the origin. The runtime supplies the
# facing yaw and lightweight recoil, avoiding a skeleton per deployed catapult.
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
offset = Vector((-(minimum.x + maximum.x) * 0.5, -(minimum.y + maximum.y) * 0.5, -minimum.z))
for obj in meshes:
    obj.location += offset
    obj.select_set(True)

bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_image_format="WEBP",
    export_image_quality=85,
    export_extras=True,
)
print("WOC_CATAPULT_EXPORTED=" + output_path)
