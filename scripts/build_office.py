"""Build and export the low-fidelity office without touching other scene objects.

Plan coordinates are (east, north) metres. Blender is Z-up, so plan points map
as (east, -north, elevation); Blender's glTF exporter maps them to Three.js as
(east, up, north) with export_yup=True.
"""

import json
import math
import os
import re
import stat
import tempfile
import uuid
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION_NAME = "OfficeDemo"
REPLACEMENT_COLLECTION_NAME = "OfficeDemoReplacement"
PALETTE = {
    "wall": (0.78, 0.81, 0.78, 1.0),
    "partition": (0.91, 0.89, 0.82, 1.0),
    "stairs": (0.42, 0.48, 0.49, 1.0),
    "elevator": (0.28, 0.43, 0.47, 1.0),
    "desk": (0.48, 0.34, 0.23, 1.0),
    "table": (0.62, 0.48, 0.29, 1.0),
    "concrete": (0.72, 0.72, 0.70, 1.0),
    "glass": (0.62, 0.80, 0.90, 0.35),
    "frosted": (0.90, 0.93, 0.94, 0.7),
    "aluminum": (0.06, 0.06, 0.07, 1.0),
}


def _result(status, reason, **details):
    return {"status": status, "reason": reason, **details}


def _finite_pair(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(number, (int, float)) and math.isfinite(number) for number in value)
    )


def _shell_boxes(plan):
    shell = plan.get("shell")
    outline = plan.get("floorOutline")
    if not isinstance(shell, dict) or not isinstance(outline, list) or len(outline) < 3:
        raise ValueError("exterior-shell plan must contain a shell and floor outline")
    height = shell.get("wallHeight_m")
    thickness = shell.get("wallThickness_m")
    edges = shell.get("edges")
    if not isinstance(height, (int, float)) or not math.isfinite(height) or height < 2.4:
        raise ValueError("exterior shell walls must be at least 2.40 m high")
    if not isinstance(thickness, (int, float)) or not math.isfinite(thickness) or thickness <= 0:
        raise ValueError("exterior shell wall thickness must be positive and finite")
    if not isinstance(edges, list) or len(edges) != len(outline):
        raise ValueError("exterior shell must define every floor-outline edge")

    boxes = []
    names = set()
    for index, (start, shell_edge) in enumerate(zip(outline, edges)):
        end = outline[(index + 1) % len(outline)]
        dx, dy = end[0] - start[0], end[1] - start[1]
        edge_length = math.hypot(dx, dy)
        if edge_length == 0:
            raise ValueError(f"floor-outline edge {index} has zero length")
        edge_name = shell_edge.get("name") if isinstance(shell_edge, dict) else None
        openings = shell_edge.get("openings") if isinstance(shell_edge, dict) else None
        if not isinstance(edge_name, str) or not edge_name or not isinstance(openings, list):
            raise ValueError(f"shell edge {index} must have a name and opening list")
        ux, uy = dx / edge_length, dy / edge_length
        ordered = sorted(openings, key=lambda opening: opening.get("from_m", -1) if isinstance(opening, dict) else -1)
        cursor = 0.0
        segment_index = 0
        for opening in ordered:
            if not isinstance(opening, dict):
                raise ValueError(f"shell edge {edge_name!r} has an invalid opening")
            opening_name = opening.get("name")
            opening_kind = opening.get("kind")
            opening_from, opening_to = opening.get("from_m"), opening.get("to_m")
            if not isinstance(opening_name, str) or opening_name in names:
                raise ValueError("shell opening names must be unique strings")
            names.add(opening_name)
            if opening_kind not in {"door", "window", "vent"}:
                raise ValueError(f"opening {opening_name!r} has an unsupported kind")
            if (
                not isinstance(opening_from, (int, float))
                or not math.isfinite(opening_from)
                or not isinstance(opening_to, (int, float))
                or not math.isfinite(opening_to)
                or opening_from < cursor
                or opening_to <= opening_from
                or opening_to > edge_length + 0.01
            ):
                raise ValueError(f"opening {opening_name!r} is outside or overlaps its shell edge")
            if opening_from > cursor:
                boxes.append(_shell_wall_box(edge_name, segment_index, start, ux, uy, cursor, opening_from, thickness, height, dx, dy))
                segment_index += 1
            cursor = opening_to
        if cursor < edge_length:
            boxes.append(_shell_wall_box(edge_name, segment_index, start, ux, uy, cursor, edge_length, thickness, height, dx, dy))
        if not boxes:
            raise ValueError(f"shell edge {edge_name!r} contains no exterior wall")
    return boxes


def _shell_wall_box(edge_name, index, start, ux, uy, from_m, to_m, thickness, height, dx, dy):
    middle = (from_m + to_m) / 2.0
    return {
        "name": f"{edge_name}_{index + 1:02d}",
        "kind": "exterior-wall",
        "center": [
            start[0] + ux * middle - uy * thickness / 2.0,
            start[1] + uy * middle + ux * thickness / 2.0,
        ],
        "size": [to_m - from_m, thickness],
        "height": height,
        "material": "wall",
        "collidable": True,
        "angle": math.atan2(dy, dx),
    }


def _partition_wall_box(partition_id, index, start, ux, uy, from_m, to_m, thickness, height, angle):
    middle = (from_m + to_m) / 2.0
    return {
        "name": f"partition_{partition_id}_{index + 1:02d}",
        "kind": "interior-partition",
        "center": [start[0] + ux * middle, start[1] + uy * middle],
        "size": [to_m - from_m, thickness],
        "height": height,
        "material": "partition",
        "collidable": True,
        "angle": angle,
    }


def _partition_boxes(plan):
    interior = plan.get("interior")
    partitions = interior.get("partitions") if isinstance(interior, dict) else None
    if not isinstance(partitions, list) or not partitions:
        raise ValueError("cumulative interior plan must contain partitions")

    boxes = []
    partition_ids = set()
    opening_names = set()
    for partition in partitions:
        partition_id = partition.get("id") if isinstance(partition, dict) else None
        start = partition.get("start_m") if isinstance(partition, dict) else None
        end = partition.get("end_m") if isinstance(partition, dict) else None
        thickness = partition.get("thickness_m") if isinstance(partition, dict) else None
        height = partition.get("height_m") if isinstance(partition, dict) else None
        openings = partition.get("openings") if isinstance(partition, dict) else None
        if not isinstance(partition_id, str) or not partition_id or partition_id in partition_ids:
            raise ValueError("interior partition ids must be unique strings")
        partition_ids.add(partition_id)
        if not _finite_pair(start) or not _finite_pair(end):
            raise ValueError(f"partition {partition_id!r} must have finite centerline endpoints")
        if not isinstance(thickness, (int, float)) or not math.isfinite(thickness) or thickness <= 0:
            raise ValueError(f"partition {partition_id!r} must have positive finite thickness")
        annotated_height = partition.get("annotatedHeight_m")
        valid_height = isinstance(height, (int, float)) and math.isfinite(height) and (
            height == annotated_height and 0 < height < 2.4 if annotated_height is not None else height >= 2.4
        )
        if not valid_height:
            if annotated_height is not None:
                raise ValueError(f"partition {partition_id!r} must match its annotated {annotated_height} m partial height")
            raise ValueError(f"partition {partition_id!r} must be at least 2.40 m high")
        if not isinstance(openings, list):
            raise ValueError(f"partition {partition_id!r} must list its openings")

        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if length == 0:
            raise ValueError(f"partition {partition_id!r} must have a non-zero centerline")
        ux, uy = dx / length, dy / length
        angle = math.atan2(dy, dx)
        boundary_tolerance = 1e-9
        for opening in openings:
            if not isinstance(opening, dict):
                raise ValueError(f"partition {partition_id!r} has an invalid opening")
            opening_name = opening.get("name")
            opening_kind = opening.get("kind")
            opening_from, opening_to = opening.get("from_m"), opening.get("to_m")
            if not isinstance(opening_name, str) or not opening_name or opening_name in opening_names:
                raise ValueError("interior opening names must be unique strings")
            opening_names.add(opening_name)
            if opening_kind not in {"door", "opening"}:
                raise ValueError(f"opening {opening_name!r} must be a door or circulation opening")
            if (
                not isinstance(opening_from, (int, float))
                or not math.isfinite(opening_from)
                or not isinstance(opening_to, (int, float))
                or not math.isfinite(opening_to)
                or opening_from < 0
                or opening_to <= opening_from
                or opening_from > length + boundary_tolerance
                or opening_to > length + boundary_tolerance
                or min(opening_to, length) <= min(opening_from, length)
            ):
                raise ValueError(f"opening {opening_name!r} is outside its partition centerline")

        ordered = sorted(openings, key=lambda opening: opening["from_m"])
        cursor = 0.0
        segment_index = 0
        for opening in ordered:
            opening_from = min(opening["from_m"], length)
            opening_to = min(opening["to_m"], length)
            if opening_from < cursor:
                raise ValueError(f"opening {opening['name']!r} overlaps another partition opening")
            if opening_from > cursor:
                boxes.append(_partition_wall_box(
                    partition_id, segment_index, start, ux, uy, cursor, opening_from,
                    thickness, height, angle,
                ))
                segment_index += 1
            cursor = opening_to
        if cursor < length:
            boxes.append(_partition_wall_box(
                partition_id, segment_index, start, ux, uy, cursor, length,
                thickness, height, angle,
            ))
    return boxes


def _validate_plan(plan):
    if not isinstance(plan, dict):
        raise ValueError("plan must be an object")
    if not isinstance(plan.get("floorOutline"), list) or len(plan["floorOutline"]) < 3:
        raise ValueError("plan must contain a floor outline")
    if not all(_finite_pair(point) for point in plan["floorOutline"]):
        raise ValueError("floor outline points must be finite coordinate pairs")
    if plan.get("stage") == "exterior-shell":
        if "boxes" in plan:
            raise ValueError("canonical exterior-shell plan must not contain generated box geometry")
        plan["boxes"] = _shell_boxes(plan)
    if not isinstance(plan.get("boxes"), list) or not plan["boxes"]:
        raise ValueError("plan must contain boxes")

    names = set()
    for box in plan["boxes"]:
        if not isinstance(box, dict) or not isinstance(box.get("name"), str) or box["name"] in names:
            raise ValueError("boxes must have unique names")
        names.add(box["name"])
        if not _finite_pair(box.get("center")) or not _finite_pair(box.get("size")):
            raise ValueError(f"{box['name']} must have finite center and size pairs")
        if any(size <= 0 for size in box["size"]):
            raise ValueError(f"{box['name']} must have positive dimensions")
        if not isinstance(box.get("height"), (int, float)) or not math.isfinite(box["height"]) or box["height"] <= 0:
            raise ValueError(f"{box['name']} must have a positive finite height")
        if not isinstance(box.get("material"), str) or box["material"] not in PALETTE:
            raise ValueError(f"{box['name']} has an unsupported material")
        if not isinstance(box.get("collidable"), bool):
            raise ValueError(f"{box['name']} must have a collision flag")
        angle = box.get("angle", 0.0)
        if not isinstance(angle, (int, float)) or not math.isfinite(angle):
            raise ValueError(f"{box['name']} has a non-finite angle")
        z0 = box.get("z0", 0.0)
        if not isinstance(z0, (int, float)) or not math.isfinite(z0) or z0 < 0:
            raise ValueError(f"{box['name']} has an invalid base elevation")
    for prism in plan.get("prisms", []):
        if prism.get("material") not in PALETTE or not isinstance(prism.get("collidable"), bool):
            raise ValueError(f"{prism.get('name')} has an unsupported material or collision flag")
        if not (isinstance(prism.get("z"), list) and len(prism["z"]) == 2 and 0 <= prism["z"][0] < prism["z"][1]):
            raise ValueError(f"{prism.get('name')} must have 0 <= z0 < z1")


def _vector_partition_boxes(walls):
    """Boxes for vector partitions: frosted glass, clear glass, or frosted below / clear above. Doorways stay open."""
    heights = walls["heights_m"]
    split = heights.get("splitAcrylic")
    layers = {
        "frosted": lambda h: [("frosted", 0.0, h)],
        "glass": lambda h: [("glass", 0.0, h)],
        "frosted-clear": lambda h: [("frosted", 0.0, split), ("glass", split, h - split)],
    }
    boxes = []
    pieces = [(p, layers[p["kind"]](p["height_m"])) for p in walls.get("partitions", [])]
    for item, item_layers in pieces:
        (x0, y0), (x1, y1) = item["start_m"], item["end_m"]
        length = math.hypot(x1 - x0, y1 - y0)
        if length == 0:
            raise ValueError(f"vector partition {item['id']!r} must have a non-zero centerline")
        for index, (material, z0, height) in enumerate(item_layers):
            if not (isinstance(height, (int, float)) and height > 0):
                raise ValueError(f"vector partition {item['id']!r} has an invalid layer height")
            box = _partition_wall_box(item["id"], index, item["start_m"], (x1 - x0) / length, (y1 - y0) / length,
                                      0.0, length, item["thickness_m"], height, math.atan2(y1 - y0, x1 - x0))
            box.update(name=f"{item['id']}_{material}", material=material, z0=z0)
            boxes.append(box)
    return boxes


def _vector_wall_prisms(walls):
    heights = walls.get("heights_m", {})
    clear, sill, head = heights.get("clear"), heights.get("windowSill"), heights.get("windowHead")
    if not all(isinstance(h, (int, float)) and math.isfinite(h) for h in (clear, sill, head)) or not 0 < sill < head < clear:
        raise ValueError("vector walls need finite heights with 0 < sill < head < clear")
    prisms = [
        {"name": solid["id"], "polygon": solid["polygon_m"],
         "z": [0, heights["lowDrywall"] if solid["kind"] == "low-drywall" else clear],
         "material": {"concrete": "concrete", "drywall": "partition", "low-drywall": "wall"}[solid["kind"]], "collidable": True}
        for solid in walls["solids"]
    ]
    prisms += [
        {"name": post["id"], "polygon": post["polygon_m"], "z": [0, post.get("height_m", clear)], "material": "aluminum", "collidable": True}
        for post in walls.get("posts", [])
    ]
    for window in walls["windows"]:
        for kind, z, material in (("parapet", [0, sill], "wall"), ("glass", [sill, head], "glass"), ("lintel", [head, clear], "wall")):
            prisms.append({"name": f"{window['id']}_{kind}", "polygon": window["polygon_m"], "z": z, "material": material, "collidable": True})
    for prism in prisms:
        ring = prism["polygon"]
        valid = isinstance(ring, list) and len(ring) >= 3 and all(_finite_pair(p) for p in ring)
        if not valid or abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) < 1e-6:
            raise ValueError(f"vector wall {prism['name']!r} must be a non-degenerate polygon")
    return prisms


def _prepare_checkpoint_plan(plan, walls=None):
    if not isinstance(plan, dict):
        _validate_plan(plan)
    if plan.get("stage") == "west-north-interior":
        if "boxes" in plan:
            raise ValueError("canonical cumulative plan must not contain generated box geometry")
        if walls is None:
            plan["boxes"] = _shell_boxes(plan) + _partition_boxes(plan)
        else:
            # PDF vector walls and partitions replace the simplified shell and the raster-traced partitions.
            plan["prisms"] = _vector_wall_prisms(walls)
            plan["boxes"] = _vector_partition_boxes(walls)
            plan["floorOutline"] = walls.get("floor_m", plan["floorOutline"])
    _validate_plan(plan)


def _expected_object_names(plan):
    groups = {
        (box["material"], box["collidable"])
        for box in plan["boxes"]
    }
    return {f"{COLLECTION_NAME}_Floor"} | {
        f"{COLLECTION_NAME}_{material}_{'Blocking' if collidable else 'Decor'}"
        for material, collidable in groups
    }


def _material(name, prefix):
    material = bpy.data.materials.new(f"{prefix}_{name}")
    material.diffuse_color = PALETTE.get(name, (0.7, 0.7, 0.7, 1.0))
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = material.diffuse_color
        shader.inputs["Roughness"].default_value = 0.82
        if material.diffuse_color[3] < 1.0:
            shader.inputs["Alpha"].default_value = material.diffuse_color[3]
            # Clear glass stays glossy; frosted tempered glass reads as a diffusing panel.
            shader.inputs["Roughness"].default_value = 0.05 if name == "glass" else 0.6
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "BLENDED"
            else:
                material.blend_method = "BLEND"
    return material


def _make_floor(plan, collection, material, prefix, north_sign=-1):
    mesh = bpy.data.meshes.new(f"{prefix}_FloorMesh")
    vertices = [(x, north_sign * north, 0.0) for x, north in plan["floorOutline"]]
    # Wind the floor counterclockwise in Blender XY so its normal points up in either north convention.
    order = list(range(len(vertices)))
    mesh.from_pydata(vertices, [], [order if _ring_is_counterclockwise(vertices) else list(reversed(order))])
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(f"{prefix}_Floor", mesh)
    obj["collidable"] = False
    collection.objects.link(obj)
    return obj, f"{COLLECTION_NAME}_Floor"


def _ring_is_counterclockwise(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) > 0


def _make_box_batches(plan, collection, materials, prefix, north_sign=-1):
    """north_sign=-1 keeps the legacy demo's reflected frame; +1 keeps the plan's handedness (floor-4 checkpoints)."""
    batches = {}
    for box in plan["boxes"]:
        key = (box["material"], box["collidable"])
        bm = batches.get(key)
        if bm is None:
            bm = batches[key] = bmesh.new()
        verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
        width, depth = box["size"]
        bmesh.ops.scale(bm, vec=Vector((width, depth, box["height"])), verts=verts)
        angle = north_sign * box.get("angle", 0.0)
        if angle:
            bmesh.ops.rotate(
                bm,
                cent=Vector((0.0, 0.0, 0.0)),
                matrix=Matrix.Rotation(angle, 3, "Z"),
                verts=verts,
            )
        east, north = box["center"]
        bmesh.ops.translate(
            bm,
            vec=Vector((east, north_sign * north, box.get("z0", 0.0) + box["height"] / 2.0)),
            verts=verts,
        )
    for prism in plan.get("prisms", []):
        key = (prism["material"], prism["collidable"])
        bm = batches.get(key)
        if bm is None:
            bm = batches[key] = bmesh.new()
        z0, z1 = prism["z"]
        face = bm.faces.new([bm.verts.new((east, north_sign * north, z0)) for east, north in prism["polygon"]])
        extruded = bmesh.ops.extrude_face_region(bm, geom=[face])["geom"]
        bmesh.ops.translate(
            bm, vec=Vector((0.0, 0.0, z1 - z0)),
            verts=[element for element in extruded if isinstance(element, bmesh.types.BMVert)],
        )
    for bm in batches.values():
        # Prism rings arrive in either winding; recalculating keeps every face pointing outward.
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    objects = []
    try:
        for (material_name, collidable), bm in batches.items():
            mesh = bpy.data.meshes.new(f"{prefix}_{material_name}_Mesh")
            bm.to_mesh(mesh)
            mesh.materials.append(materials[material_name])
            mesh.update()
            suffix = "Blocking" if collidable else "Decor"
            obj = bpy.data.objects.new(f"{prefix}_{material_name}_{suffix}", mesh)
            obj["material_group"] = material_name
            obj["collidable"] = collidable
            collection.objects.link(obj)
            objects.append((obj, f"{COLLECTION_NAME}_{material_name}_{suffix}"))
    except Exception:
        for obj, _ in objects:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        raise
    finally:
        for bm in batches.values():
            bm.free()
    return objects


def _collection_parents(collection):
    parents = [
        scene.collection
        for scene in bpy.data.scenes
        if any(child == collection for child in scene.collection.children)
    ]
    parents.extend(
        parent
        for parent in bpy.data.collections
        if any(child == collection for child in parent.children)
    )
    return parents


def _preflight_collection(collection, plan):
    if collection.children:
        return "collection has child collections"
    objects = list(collection.objects)
    expected = _expected_object_names(plan)
    if len(objects) != 7 or len(expected) != 7:
        return "collection must contain exactly the seven expected generated objects"
    if {obj.name for obj in objects} != expected:
        return "collection object names do not match the generated OfficeDemo set"
    for obj in objects:
        if obj.name == f"{COLLECTION_NAME}_Floor":
            if obj.get("collidable") is not False:
                return "floor object does not have the expected generated metadata"
        else:
            material = obj.get("material_group")
            collidable = obj.get("collidable")
            suffix = "Blocking" if collidable else "Decor"
            if not isinstance(material, str) or obj.name != f"{COLLECTION_NAME}_{material}_{suffix}":
                return "batch object does not have the expected generated metadata"
    if any(obj.type != "MESH" or obj.data is None for obj in objects):
        return "collection contains a non-mesh object"
    if any(obj.children for obj in objects):
        return "collection contains parented child objects"
    if any(len(obj.users_collection) != 1 or obj.users_collection[0] != collection for obj in objects):
        return "collection objects are linked outside OfficeDemo"
    if any(obj.data.users != 1 for obj in objects):
        return "collection mesh data is shared with another object"
    if any(
        obj.instance_type == "COLLECTION" and obj.instance_collection == collection
        for obj in bpy.data.objects
    ):
        return "collection is instanced by another object"
    parents = _collection_parents(collection)
    if len(parents) != 1 or parents[0] != bpy.context.scene.collection:
        return "collection is not linked exclusively to the active scene root"
    return None


def _name_conflict(expected_names, allowed_objects=()):
    allowed = set(allowed_objects)
    for name in expected_names:
        existing = bpy.data.objects.get(name)
        if existing is not None and existing not in allowed:
            return name
    return None


def _new_temp_asset(target_dir):
    descriptor, path = tempfile.mkstemp(prefix=".office-", suffix=".tmp.glb", dir=str(target_dir))
    os.close(descriptor)
    return Path(path)


def _export_objects(objects, path):
    view_layer = bpy.context.view_layer
    selected_before = list(bpy.context.selected_objects)
    active_before = view_layer.objects.active
    try:
        for obj in selected_before:
            obj.select_set(False)
        for obj, _ in objects:
            obj.select_set(True)
        view_layer.objects.active = objects[0][0]
        result = bpy.ops.export_scene.gltf(
            filepath=str(path),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_cameras=False,
            export_lights=False,
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"glTF exporter returned {result!r}")
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError("glTF exporter did not produce a non-empty temporary GLB")
        return path.stat().st_size
    finally:
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in selected_before:
            if obj.name in view_layer.objects:
                obj.select_set(True)
        view_layer.objects.active = (
            active_before if active_before and active_before.name in view_layer.objects else None
        )


def _remove_generated_objects(objects):
    for obj, _ in objects:
        if obj.name not in bpy.data.objects:
            continue
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def _discard_created_collection(collection, objects):
    _remove_generated_objects(objects)
    if collection and collection.name in bpy.data.collections:
        bpy.data.collections.remove(collection, do_unlink=True)


def _promote_replacement(stage, objects, old_collection, old_objects, target, temp_asset):
    token = uuid.uuid4().hex
    previous_collection_name = f"OfficeDemoPrevious_{token}"
    old_names = {obj: obj.name for obj in old_objects}
    stage_names = {obj: obj.name for obj, _ in objects}
    stage_collection_name = stage.name
    try:
        if old_collection:
            old_collection.name = previous_collection_name
            for index, obj in enumerate(old_objects):
                obj.name = f"OfficeDemoPrevious_{token}_{index}"
        for obj, final_name in objects:
            obj.name = final_name
        stage.name = COLLECTION_NAME
        os.replace(temp_asset, target)
    except Exception:
        if stage.name == COLLECTION_NAME:
            stage.name = stage_collection_name
        for obj, name in stage_names.items():
            if obj.name != name:
                obj.name = name
        if old_collection:
            for obj, name in old_names.items():
                if obj.name != name:
                    obj.name = name
            old_collection.name = COLLECTION_NAME
        raise

    if old_collection:
        try:
            _remove_generated_objects([(obj, obj.name) for obj in old_objects])
            bpy.data.collections.remove(old_collection, do_unlink=True)
        except Exception as error:
            return str(error)
    return None


_CHECKPOINT_PARTS = ("assets", "office-floor4", "checkpoints")


def _checkpoint_paths(root, checkpoint_name):
    if not isinstance(checkpoint_name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", checkpoint_name):
        raise ValueError("checkpoint name must use 1-64 letters, digits, underscores, or hyphens")
    root = Path(root).resolve()
    checkpoint_dir = root.joinpath(*_CHECKPOINT_PARTS)
    for index in range(1, len(_CHECKPOINT_PARTS) + 1):
        component = root / Path(*_CHECKPOINT_PARTS[:index])
        if _checkpoint_path_is_reparse(component):
            raise ValueError("checkpoint directory must not contain symlinks, junctions, or reparse points")
        try:
            component_stat = os.lstat(component)
        except FileNotFoundError:
            continue
        if not stat.S_ISDIR(component_stat.st_mode):
            raise ValueError("checkpoint path components must be directories")
    resolved_dir = checkpoint_dir.resolve()
    if os.path.commonpath((str(root), str(resolved_dir))) != str(root):
        raise ValueError("checkpoint directory resolves outside the repository")
    stem = checkpoint_dir / checkpoint_name
    return checkpoint_dir, stem.with_suffix(".glb"), stem.with_suffix(".blend")


def _checkpoint_dir_fd_supported():
    required = (os.open, os.mkdir, os.stat, os.unlink, os.rmdir)
    return (
        hasattr(os, "O_DIRECTORY")
        and hasattr(os, "O_NOFOLLOW")
        and hasattr(os, "supports_dir_fd")
        and hasattr(os, "supports_follow_symlinks")
        and all(function in os.supports_dir_fd for function in required)
        and os.stat in os.supports_follow_symlinks
    )


def _checkpoint_dir_flags():
    if not _checkpoint_dir_fd_supported():
        raise OSError("safe checkpoint directory operations are unavailable on this platform")
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)


def _open_directory_chain(path):
    flags = _checkpoint_dir_flags()
    path = Path(path)
    if not path.is_absolute():
        raise ValueError("checkpoint root must be absolute")
    descriptor = os.open(os.sep, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_CLOEXEC", 0))
    try:
        for component in path.parts[1:]:
            child = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _checkpoint_stat_is_reparse(result):
    return (
        stat.S_ISLNK(result.st_mode)
        or bool(getattr(result, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))
    )


def _checkpoint_path_is_reparse(path):
    try:
        result = os.lstat(path)
    except FileNotFoundError:
        return False
    return _checkpoint_stat_is_reparse(result) or (hasattr(Path(path), "is_junction") and Path(path).is_junction())


def _checkpoint_directory_path(handle):
    return Path(handle[0] if isinstance(handle, tuple) else handle)


def _assert_checkpoint_directory_path(handle):
    path = _checkpoint_directory_path(handle)
    result = os.lstat(path)
    if _checkpoint_stat_is_reparse(result) or not stat.S_ISDIR(result.st_mode):
        raise ValueError("checkpoint path component is not a plain directory")
    if isinstance(handle, tuple) and (result.st_dev, result.st_ino) != handle[1]:
        raise ValueError("checkpoint directory changed since preflight")
    return path


def _open_checkpoint_directory_path(root, create):
    root = Path(root).resolve(strict=True)
    root_stat = os.lstat(root)
    if _checkpoint_stat_is_reparse(root_stat) or not stat.S_ISDIR(root_stat.st_mode):
        raise ValueError("checkpoint root must be a plain directory")
    directory = root
    for component in _CHECKPOINT_PARTS:
        directory = directory / component
        if create:
            try:
                directory.mkdir(mode=0o755)
            except FileExistsError:
                pass
        result = os.lstat(directory)
        if _checkpoint_stat_is_reparse(result) or not stat.S_ISDIR(result.st_mode):
            raise ValueError("checkpoint directory must contain only plain directory components")
        resolved = directory.resolve(strict=True)
        if (
            os.path.commonpath((str(root), str(resolved))) != str(root)
            or os.path.normcase(str(resolved)) != os.path.normcase(str(directory))
        ):
            raise ValueError("checkpoint directory resolves outside the repository")
    return directory, (result.st_dev, result.st_ino)


def _open_checkpoint_directory(root, create):
    root = Path(root).resolve(strict=True)
    if not _checkpoint_dir_fd_supported():
        return _open_checkpoint_directory_path(root, create)
    descriptor = _open_directory_chain(root)
    try:
        for component in _CHECKPOINT_PARTS:
            if create:
                try:
                    os.mkdir(component, 0o755, dir_fd=descriptor)
                except FileExistsError:
                    pass
            child = os.open(component, _checkpoint_dir_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _checkpoint_entry_exists(directory_fd, name):
    if isinstance(directory_fd, int):
        try:
            os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            return False
    else:
        directory = _assert_checkpoint_directory_path(directory_fd)
        try:
            os.lstat(directory / name)
        except FileNotFoundError:
            return False
    return True


def _new_checkpoint_temp(directory_fd):
    if not isinstance(directory_fd, int):
        parent = _assert_checkpoint_directory_path(directory_fd)
        path = Path(tempfile.mkdtemp(prefix=".office-checkpoint-", dir=str(parent)))
        result = os.lstat(path)
        if _checkpoint_stat_is_reparse(result) or not stat.S_ISDIR(result.st_mode):
            raise OSError("private checkpoint temporary directory is not a plain directory")
        return path.name, path, result

    flags = _checkpoint_dir_flags()
    for _ in range(10):
        name = f".office-checkpoint-{uuid.uuid4().hex}"
        try:
            os.mkdir(name, 0o700, dir_fd=directory_fd)
        except FileExistsError:
            continue
        try:
            descriptor = os.open(name, flags, dir_fd=directory_fd)
            return name, descriptor, os.fstat(descriptor)
        except Exception:
            os.rmdir(name, dir_fd=directory_fd)
            raise
    raise FileExistsError("could not create a unique private checkpoint directory")


def _new_checkpoint_file(directory_fd, name):
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0)
    if not isinstance(directory_fd, int):
        directory = _assert_checkpoint_directory_path(directory_fd)
        descriptor = os.open(directory / name, flags, 0o600)
    else:
        descriptor = os.open(name, flags, 0o600, dir_fd=directory_fd)
    try:
        result = os.fstat(descriptor)
        return result.st_dev, result.st_ino
    finally:
        os.close(descriptor)


def _checkpoint_temp_identity(directory_fd, name):
    try:
        if isinstance(directory_fd, int):
            result = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        else:
            directory = _assert_checkpoint_directory_path(directory_fd)
            result = os.lstat(directory / name)
    except FileNotFoundError:
        return None
    return (result.st_dev, result.st_ino) if stat.S_ISREG(result.st_mode) else None


def _checkpoint_file_identity(directory_fd, name):
    if isinstance(directory_fd, int):
        result = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    else:
        directory = _assert_checkpoint_directory_path(directory_fd)
        result = os.lstat(directory / name)
    if _checkpoint_stat_is_reparse(result) or not stat.S_ISREG(result.st_mode) or result.st_size == 0:
        raise RuntimeError(f"temporary checkpoint file {name!r} is not a non-empty regular file")
    return result.st_dev, result.st_ino


def _remove_checkpoint_temp(directory_fd, name, identity):
    if identity is None:
        return
    try:
        if isinstance(directory_fd, int):
            result = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if (result.st_dev, result.st_ino) == identity:
                os.unlink(name, dir_fd=directory_fd)
        else:
            directory = _assert_checkpoint_directory_path(directory_fd)
            result = os.lstat(directory / name)
            if not _checkpoint_stat_is_reparse(result) and (result.st_dev, result.st_ino) == identity:
                os.unlink(directory / name)
    except FileNotFoundError:
        return


def _recheck_checkpoint_directory(root, original_fd):
    directory = _open_checkpoint_directory(root, create=False)
    try:
        if isinstance(original_fd, int):
            original = os.fstat(original_fd)
            current = os.fstat(directory)
            original_identity = original.st_dev, original.st_ino
            current_identity = current.st_dev, current.st_ino
        else:
            original_identity = original_fd[1]
            current_identity = directory[1]
        if current_identity != original_identity:
            raise ValueError("checkpoint directory changed since preflight")
        return directory
    except Exception:
        if isinstance(directory, int):
            os.close(directory)
        raise


def _publish_checkpoint_file(source, target, source_dir_fd=None, target_dir_fd=None, checkpoint_root=None):
    if (source_dir_fd is None) != (target_dir_fd is None):
        raise ValueError("source and destination directory handles must be provided together")
    if not all(hasattr(os, flag) for flag in ("O_CREAT", "O_EXCL", "O_WRONLY")):
        raise OSError("exclusive checkpoint file creation is unavailable")

    publish_dir = target_dir_fd
    close_publish_dir = False
    source_fd = target_fd = None
    target_identity = None
    try:
        if checkpoint_root is not None:
            publish_dir = _recheck_checkpoint_directory(checkpoint_root, target_dir_fd)
            close_publish_dir = isinstance(publish_dir, int)

        if isinstance(source_dir_fd, int):
            source_path = source
            source_open_options = {"dir_fd": source_dir_fd}
            source_stat = os.stat(source, dir_fd=source_dir_fd, follow_symlinks=False)
        elif source_dir_fd is not None:
            source_directory = _assert_checkpoint_directory_path(source_dir_fd)
            source_path = source_directory / source
            source_open_options = {}
            if _checkpoint_path_is_reparse(source_path):
                raise RuntimeError(f"temporary checkpoint file {source!r} must not be a link or reparse point")
            source_stat = os.lstat(source_path)
        else:
            source_path = Path(source)
            source_open_options = {}
            if _checkpoint_path_is_reparse(source_path):
                raise RuntimeError(f"temporary checkpoint file {source!r} must not be a link or reparse point")
            source_stat = os.lstat(source_path)
        if _checkpoint_stat_is_reparse(source_stat) or not stat.S_ISREG(source_stat.st_mode) or source_stat.st_size == 0:
            raise RuntimeError(f"temporary checkpoint file {source!r} is not a non-empty regular file")

        source_fd = os.open(
            source_path,
            os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0),
            **source_open_options,
        )
        opened_source = os.fstat(source_fd)
        if _checkpoint_stat_is_reparse(opened_source) or not stat.S_ISREG(opened_source.st_mode) or opened_source.st_size == 0:
            raise RuntimeError(f"temporary checkpoint file {source!r} changed before publication")

        target_flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0)
        if isinstance(publish_dir, int):
            target_path = target
            target_open_options = {"dir_fd": publish_dir}
        elif publish_dir is not None:
            target_directory = _assert_checkpoint_directory_path(publish_dir)
            target_path = target_directory / target
            target_open_options = {}
        else:
            target_path = Path(target)
            target_open_options = {}

        # ponytail: Windows lacks dir_fd/O_NOFOLLOW; a same-user process can replace a component of assets/office-floor4/checkpoints after revalidation but before os.open and redirect the reservation. Only handle-relative reparse-safe APIs remove this residual TOCTOU.
        try:
            target_fd = os.open(target_path, target_flags, 0o600, **target_open_options)
        except FileExistsError:
            return False
        target_stat = os.fstat(target_fd)
        target_identity = target_stat.st_dev, target_stat.st_ino
        try:
            while True:
                block = os.read(source_fd, 1024 * 1024)
                if not block:
                    break
                remaining = memoryview(block)
                while remaining:
                    written = os.write(target_fd, remaining)
                    if written <= 0:
                        raise OSError("checkpoint publication made no write progress")
                    remaining = remaining[written:]
        except Exception:
            if target_fd is not None:
                failed_target_fd, target_fd = target_fd, None
                os.close(failed_target_fd)
            try:
                _remove_checkpoint_temp(publish_dir, target, target_identity)
            except OSError:
                pass
            raise
        return True
    finally:
        if target_fd is not None:
            os.close(target_fd)
        if source_fd is not None:
            os.close(source_fd)
        if close_publish_dir:
            os.close(publish_dir)


def _checkpoint_object_names(plan, prefix):
    groups = {(item["material"], item["collidable"]) for item in plan["boxes"] + plan.get("prisms", [])}
    return {f"{prefix}_Floor"} | {
        f"{prefix}_{material}_{'Blocking' if collidable else 'Decor'}"
        for material, collidable in groups
    }


def _cleanup_checkpoint_temp(parent_fd, name, directory_fd, directory_identity, file_identities):
    if directory_fd is None:
        return
    for file_name, identity in file_identities.items():
        try:
            _remove_checkpoint_temp(directory_fd, file_name, identity)
        except OSError:
            pass
    if isinstance(directory_fd, int):
        os.close(directory_fd)
    if name is None or directory_identity is None:
        return
    try:
        if isinstance(parent_fd, int):
            result = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            if not _checkpoint_stat_is_reparse(result) and stat.S_ISDIR(result.st_mode) and (result.st_dev, result.st_ino) == directory_identity:
                os.rmdir(name, dir_fd=parent_fd)
        else:
            parent = _assert_checkpoint_directory_path(parent_fd)
            path = parent / name
            result = os.lstat(path)
            if not _checkpoint_stat_is_reparse(result) and stat.S_ISDIR(result.st_mode) and (result.st_dev, result.st_ino) == directory_identity:
                os.rmdir(path)
    except OSError:
        pass


def _close_checkpoint_directory(directory_fd):
    if isinstance(directory_fd, int):
        os.close(directory_fd)


def _main_checkpoint(plan_path, checkpoint_name, walls_path=None):
    if bpy.context.mode != "OBJECT":
        return _result("blocked", "Blender must be in Object Mode; no scene changes made.")
    if not hasattr(bpy.ops.export_scene, "gltf"):
        return _result("blocked", "Blender glTF exporter is unavailable; no scene changes made.")

    checkpoint_fd = None
    temp_dir_name = None
    temp_dir_fd = None
    temp_dir_identity = None
    temp_file_identities = {}
    try:
        root = Path(__file__).resolve().parent.parent
        source_path = Path(plan_path)
        if not source_path.is_absolute():
            source_path = root / source_path
        source_path = source_path.resolve()
        if not source_path.is_file():
            return _result("blocked", f"Plan {source_path} is unavailable; no scene changes made.")
        checkpoint_dir, target_glb, target_blend = _checkpoint_paths(root, checkpoint_name)
        checkpoint_fd = _open_checkpoint_directory(root, create=True)
        if any(_checkpoint_entry_exists(checkpoint_fd, path.name) for path in (target_glb, target_blend)):
            raise FileExistsError("A checkpoint GLB or BLEND already exists; neither file was overwritten.")
        with source_path.open(encoding="utf-8") as source:
            plan = json.load(source)
        walls = None
        if walls_path is not None:
            walls_source = Path(walls_path)
            walls_source = (walls_source if walls_source.is_absolute() else root / walls_source).resolve()
            with walls_source.open(encoding="utf-8") as source:
                walls = json.load(source)
        _prepare_checkpoint_plan(plan, walls)
        prefix = f"Floor4_{checkpoint_name}"
        if bpy.data.collections.get(prefix):
            raise ValueError(f"Collection {prefix!r} already exists; no scene changes made.")
        expected_names = _checkpoint_object_names(plan, prefix)
        conflict = _name_conflict(expected_names)
        if conflict:
            raise ValueError(f"Object name {conflict!r} is already in use; no scene changes made.")
        temp_dir_name, temp_dir_fd, temp_dir_stat = _new_checkpoint_temp(checkpoint_fd)
        temp_dir_identity = temp_dir_stat.st_dev, temp_dir_stat.st_ino
        if not isinstance(temp_dir_fd, int):
            temp_dir_fd = (_checkpoint_directory_path(temp_dir_fd), temp_dir_identity)
        temp_dir = _checkpoint_directory_path(temp_dir_fd) if not isinstance(temp_dir_fd, int) else checkpoint_dir / temp_dir_name
        temp_asset_name, temp_blend_name = "checkpoint.glb", "checkpoint.blend"
        temp_file_identities[temp_asset_name] = _new_checkpoint_file(temp_dir_fd, temp_asset_name)
        temp_file_identities[temp_blend_name] = _new_checkpoint_file(temp_dir_fd, temp_blend_name)
        temp_asset, temp_blend = temp_dir / temp_asset_name, temp_dir / temp_blend_name
    except Exception as error:
        if checkpoint_fd is not None:
            _cleanup_checkpoint_temp(
                checkpoint_fd, temp_dir_name, temp_dir_fd, temp_dir_identity, temp_file_identities,
            )
            _close_checkpoint_directory(checkpoint_fd)
        return _result("blocked", f"Checkpoint preflight failed before scene changes: {error}")

    created_collection = None
    objects = []
    published_blend = False
    try:
        created_collection = bpy.data.collections.new(prefix)
        bpy.context.scene.collection.children.link(created_collection)
        materials = {
            name: _material(name, prefix)
            for name in sorted({item["material"] for item in plan["boxes"] + plan.get("prisms", [])})
        }
        objects.append(_make_floor(plan, created_collection, _material("floor", prefix), prefix, north_sign=1))
        objects.extend(_make_box_batches(plan, created_collection, materials, prefix, north_sign=1))
        try:
            byte_count = _export_objects(objects, temp_asset)
        finally:
            temp_file_identities[temp_asset_name] = _checkpoint_temp_identity(temp_dir_fd, temp_asset_name)
        _checkpoint_file_identity(temp_dir_fd, temp_asset_name)

        save_version = bpy.context.preferences.filepaths.save_version
        try:
            bpy.context.preferences.filepaths.save_version = 0
            result = bpy.ops.wm.save_as_mainfile(filepath=str(temp_blend), check_existing=False)
        finally:
            bpy.context.preferences.filepaths.save_version = save_version
            temp_file_identities[temp_blend_name] = _checkpoint_temp_identity(temp_dir_fd, temp_blend_name)
        if "FINISHED" not in result:
            raise RuntimeError(f"Blender did not save the checkpoint BLEND ({result!r})")
        temp_file_identities[temp_blend_name] = _checkpoint_file_identity(temp_dir_fd, temp_blend_name)

        if not _publish_checkpoint_file(
            temp_blend_name, target_blend.name,
            source_dir_fd=temp_dir_fd, target_dir_fd=checkpoint_fd, checkpoint_root=root,
        ):
            raise FileExistsError("checkpoint BLEND appeared after preflight; no existing file was overwritten")
        published_blend = True

        if not _publish_checkpoint_file(
            temp_asset_name, target_glb.name,
            source_dir_fd=temp_dir_fd, target_dir_fd=checkpoint_fd, checkpoint_root=root,
        ):
            raise FileExistsError("checkpoint GLB appeared after preflight; no existing file was overwritten")
    except Exception as error:
        if not published_blend and created_collection:
            try:
                _discard_created_collection(created_collection, objects)
            except Exception as cleanup_error:
                return _result("error", f"Checkpoint failed before saving; staging cleanup failed: {cleanup_error}")
        status = "blocked" if isinstance(error, FileExistsError) else "error"
        return _result(
            status,
            f"Checkpoint export failed without overwriting existing checkpoint files: {error}",
            blend=str(target_blend) if published_blend else None,
        )
    finally:
        _cleanup_checkpoint_temp(
            checkpoint_fd, temp_dir_name, temp_dir_fd, temp_dir_identity, temp_file_identities,
        )
        _close_checkpoint_directory(checkpoint_fd)

    return _result(
        "ok",
        "Floor 4 checkpoint exported from the explicit plan; unrelated scene objects were not selected for GLB export.",
        collection=prefix,
        objectCount=len(objects),
        sourceBoxCount=len(plan["boxes"]),
        asset=str(target_glb),
        blend=str(target_blend),
        bytes=byte_count,
        blenderToThree="(u, v, up) -> (u, up, -v); plan handedness preserved",
    )


def main(replace=False, plan_path=None, checkpoint_name=None, walls_path=None):
    """Create OfficeDemo, or create a non-overwriting explicit-plan checkpoint."""
    if not isinstance(replace, bool):
        return _result("blocked", "replace must be the explicit boolean True or False.")
    if plan_path is not None or checkpoint_name is not None:
        if replace:
            return _result("blocked", "replace is not available in checkpoint mode.")
        if plan_path is None or checkpoint_name is None:
            return _result("blocked", "checkpoint mode requires both plan_path and checkpoint_name.")
        return _main_checkpoint(plan_path, checkpoint_name, walls_path)
    if bpy.context.mode != "OBJECT":
        return _result("blocked", "Blender must be in Object Mode; no scene changes made.")
    if not hasattr(bpy.ops.export_scene, "gltf"):
        return _result("blocked", "Blender glTF exporter is unavailable; no scene changes made.")

    try:
        script_path = Path(__file__).resolve()
        root = script_path.parent.parent
        plan_path = root / "src" / "office-plan.json"
        target_dir = root / "public" / "models"
        target = target_dir / "office.glb"
        if not root.is_dir() or not plan_path.is_file():
            return _result("blocked", "Repository or canonical office plan is unavailable; no scene changes made.")
        if not target_dir.is_dir() or not os.access(target_dir, os.W_OK):
            return _result("blocked", "public/models is unavailable or not writable; no scene changes made.")
        with plan_path.open(encoding="utf-8") as source:
            plan = json.load(source)
        _validate_plan(plan)

        collection = bpy.data.collections.get(COLLECTION_NAME)
        target_exists = target.exists()
        if not replace and collection:
            return _result("blocked", f"Collection {COLLECTION_NAME!r} already exists; no scene changes made.")
        if not replace and target_exists:
            return _result("blocked", f"{target} already exists; no scene changes made.")
        if target.is_symlink() or (target_exists and not target.is_file()):
            return _result("blocked", "Existing office.glb is not a regular replaceable file; no scene changes made.")

        old_objects = list(collection.objects) if collection else []
        if replace and collection:
            ownership_error = _preflight_collection(collection, plan)
            if ownership_error:
                return _result("blocked", f"OfficeDemo replacement refused: {ownership_error}.")
        if replace and REPLACEMENT_COLLECTION_NAME in bpy.data.collections:
            return _result("blocked", f"Staging collection {REPLACEMENT_COLLECTION_NAME!r} already exists.")

        expected_names = _expected_object_names(plan)
        conflict = _name_conflict(expected_names, old_objects)
        if conflict:
            return _result("blocked", f"Object name {conflict!r} is used outside the replaceable collection.")
        temp_asset = _new_temp_asset(target_dir)
    except Exception as error:
        return _result("blocked", f"Export preflight failed before scene changes: {error}")

    prefix = REPLACEMENT_COLLECTION_NAME if replace else COLLECTION_NAME
    collection_name = REPLACEMENT_COLLECTION_NAME if replace else COLLECTION_NAME
    created_collection = None
    objects = []
    promotion_warning = None
    try:
        created_collection = bpy.data.collections.new(collection_name)
        bpy.context.scene.collection.children.link(created_collection)
        materials = {
            name: _material(name, prefix)
            for name in sorted({box["material"] for box in plan["boxes"]})
        }
        objects.append(_make_floor(plan, created_collection, _material("floor", prefix), prefix))
        objects.extend(_make_box_batches(plan, created_collection, materials, prefix))
        byte_count = _export_objects(objects, temp_asset)

        if replace:
            promotion_warning = _promote_replacement(
                created_collection,
                objects,
                collection,
                old_objects,
                target,
                temp_asset,
            )
        else:
            os.replace(temp_asset, target)
    except Exception as error:
        if replace and created_collection:
            try:
                _discard_created_collection(created_collection, objects)
            except Exception as cleanup_error:
                return _result(
                    "error",
                    f"Export failed; original OfficeDemo and GLB were preserved, but staging cleanup failed: {cleanup_error}",
                    collection=COLLECTION_NAME,
                )
        return _result(
            "error",
            f"Export failed; existing OfficeDemo and GLB were preserved: {error}",
            collection=COLLECTION_NAME if collection else None,
        )
    finally:
        if temp_asset.exists():
            try:
                temp_asset.unlink()
            except OSError:
                pass

    if promotion_warning:
        return _result(
            "error",
            f"OfficeDemo and GLB were replaced, but cleanup of the previous collection failed: {promotion_warning}",
            collection=COLLECTION_NAME,
            asset=str(target),
            bytes=byte_count,
        )

    return _result(
        "ok",
        "OfficeDemo collection exported; unrelated scene objects were not selected for export.",
        collection=COLLECTION_NAME,
        objectCount=len(objects),
        sourceBoxCount=len(plan["boxes"]),
        asset=str(target),
        bytes=byte_count,
        blenderToThree="(east, -north, up) -> (east, up, north)",
    )
