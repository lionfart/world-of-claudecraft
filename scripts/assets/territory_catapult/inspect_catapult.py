import bpy
import json
from mathutils import Vector


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return None
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return {
        "min": [round(value, 5) for value in minimum],
        "max": [round(value, 5) for value in maximum],
        "size": [round(value, 5) for value in maximum - minimum],
    }


meshes = [
    obj
    for obj in bpy.context.scene.objects
    if obj.type == "MESH" and obj.name != "Plane.012"
]
report = {
    "blender": bpy.app.version_string,
    "frame_range": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
    "bounds": world_bounds(meshes),
    "objects": [],
    "materials": [],
    "actions": [],
    "triangles": sum(
        sum(max(1, len(polygon.vertices) - 2) for polygon in obj.data.polygons)
        for obj in meshes
    ),
}

for obj in bpy.context.scene.objects:
    report["objects"].append(
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "location": [round(value, 5) for value in obj.location],
            "rotation": [round(value, 5) for value in obj.rotation_euler],
            "scale": [round(value, 5) for value in obj.scale],
            "vertices": len(obj.data.vertices) if obj.type == "MESH" else None,
            "polygons": len(obj.data.polygons) if obj.type == "MESH" else None,
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        }
    )

for material in bpy.data.materials:
    report["materials"].append(
        {
            "name": material.name,
            "nodes": [node.bl_idname for node in material.node_tree.nodes] if material.node_tree else [],
        }
    )

for action in bpy.data.actions:
    report["actions"].append(
        {
            "name": action.name,
            "frame_range": [round(action.frame_range[0], 3), round(action.frame_range[1], 3)],
            "slots": len(action.slots),
        }
    )

print("WOC_CATAPULT_REPORT=" + json.dumps(report, separators=(",", ":")))
