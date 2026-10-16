"""Extract floor-4 furniture from the grey linework of plano_oficina.pdf.

Dev-time tool, not run inside Blender:
    uv run --with pymupdf --with shapely python scripts/extract_floor4_furniture.py
Writes src/floor4-furniture.json: each item has a 2D footprint and the prisms (polygon, z range, material) that model it.
"""
import json
import math
import sys
from pathlib import Path

import pymupdf
from shapely.affinity import scale
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_floor4_walls as walls_extractor  # noqa: E402  (shared PDF-to-metre mapping and segment reader)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "floor4-furniture.json"
WALLS = ROOT / "src" / "floor4-walls.json"
to_m = walls_extractor.to_m

GREY = 0.498
DESK_HEIGHT_M = 0.75  # user: fixed desks are 0.75 m
TOP_THICKNESS_M = 0.03
LEG_M = 0.05
CABINET_MAX_DEPTH_M = 0.5
SHELF_HEIGHT_M = 2.0
FIXTURE_HEIGHT_M = 0.42
# Grey linework that is not furniture: stairs, elevator cabins (plan metres).
EXCLUDED = [box(0.0, 19.2, 4.7, 22.3), box(19.4, 12.4, 22.6, 17.05), box(19.85, 17.15, 22.65, 20.45)]
ARCHIVE = box(19.8, 20.55, 22.65, 22.1)
RESTROOM = box(0.1, 17.4, 3.7, 18.9)


def _bezier(p0, p1, p2, p3, n=8):
    return [((1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t * t * p2.x + t ** 3 * p3.x,
             (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t * t * p2.y + t ** 3 * p3.y)
            for t in (i / n for i in range(n + 1))]


def grey_strokes(page):
    """Solid grey strokes in metres as (LineString, is_curve)."""
    for drawing in page.get_drawings():
        colour = drawing.get("color")
        if drawing["type"] != "s" or colour is None or abs(colour[0] - GREY) > 0.01 or drawing.get("dashes") not in (None, "[] 0"):
            continue
        for item in drawing["items"]:
            if item[0] == "l":
                pts, curve = [(item[1].x, item[1].y), (item[2].x, item[2].y)], False
            elif item[0] == "c":
                pts, curve = _bezier(*item[1:5]), True
            elif item[0] == "qu":
                q = item[1]
                pts, curve = [(p.x, p.y) for p in (q.ul, q.ur, q.lr, q.ll, q.ul)], False
            else:
                continue
            metres = [(round(u * 500) / 500, round(v * 500) / 500) for u, v in (to_m(x, y) for x, y in pts)]
            if len(set(metres)) > 1:
                yield LineString(metres), curve


def _dims(geometry):
    corners = list(geometry.minimum_rotated_rectangle.exterior.coords)
    return sorted(math.dist(corners[i], corners[i + 1]) for i in range(2))


def _allowed(geometry):
    return walls_extractor.BUILDING.contains(geometry) and not any(geometry.intersects(zone) for zone in EXCLUDED)


def chairs(strokes):
    """Chairs: connected groups of short strokes (<= 0.7 m, so long desk edges do not merge them) with a curve, 0.3-0.85 m across."""
    short = [(line, curve) for line, curve in strokes if line.length <= 0.7]
    groups = unary_union([line.buffer(0.012) for line, _ in short])
    found = []
    for group in getattr(groups, "geoms", [groups]):
        small, large = _dims(group)
        if 0.3 <= small and large <= 0.85 and _allowed(group) and any(curve and line.intersects(group) for line, curve in short):
            found.append(group.convex_hull)
    return found


def round_tables(strokes, chair_shapes):
    """Oval and round tables: long grey curves that are not chairs, joined with the long straight sides they touch."""
    chair_zone = unary_union(chair_shapes).buffer(0.01)
    arcs = [line for line, curve in strokes if curve and line.length >= 0.2 and not line.within(chair_zone)]
    sides = [line for line, curve in strokes if not curve and line.length >= 1.0]
    groups = unary_union([line.buffer(0.02) for line in arcs])
    found = []
    for group in getattr(groups, "geoms", [groups]):
        members = [line for line in arcs if line.intersects(group)] + [line for line in sides if line.distance(group) <= 0.02]
        table = unary_union(members).convex_hull
        # The hull must follow drawn linework (an oval or circle), not bridge unrelated strokes.
        drawn = unary_union(members).buffer(0.03).intersection(table.exterior).length / table.exterior.length if table.geom_type == "Polygon" else 0
        if table.geom_type == "Polygon" and min(_dims(table)) >= 0.45 and drawn >= 0.75 and _allowed(table):
            found.append(table)
    # Each end arc of an oval forms its own group with the shared sides; merge overlapping hulls into one table.
    merged = unary_union([t.buffer(0.001) for t in found])
    return [g.convex_hull for g in getattr(merged, "geoms", [merged])] if found else []


def tops(strokes, chair_shapes, built):
    """Table, desk, cabinet and shelf tops: closed grey faces that are not chairs or modelled walls."""
    faces = polygonize(unary_union([line for line, _ in strokes]))
    chair_zone = unary_union(chair_shapes)
    found = []
    for face in faces:
        small, large = _dims(face)
        if small < 0.25 or face.area < 0.15 or not _allowed(face):
            continue
        if face.intersection(chair_zone).area > 0.3 * face.area or face.intersection(built).area > 0.3 * face.area:
            continue
        found.append(face.buffer(0))
    # Drop faces nested inside a larger kept face (inner outlines of the same piece).
    return [f for f in found if not any(g is not f and g.area > f.area and g.buffer(0.01).contains(f) for g in found)]


def _ring(polygon):
    return [[round(x, 3), round(y, 3)] for x, y in list(polygon.simplify(0.01).exterior.coords)[:-1]]


def _prism(polygon, z0, z1, material):
    return {"polygon_m": _ring(polygon), "z": [round(z0, 3), round(z1, 3)], "material": material}


def desk_parts(top, finish="melamine"):
    """Top slab plus legs at the corners of rectangular tops, or a central pedestal for curved/L shapes."""
    parts = [_prism(top, DESK_HEIGHT_M - TOP_THICKNESS_M, DESK_HEIGHT_M, finish)]
    rectangle = top.minimum_rotated_rectangle
    if top.area >= 0.9 * rectangle.area:
        inner = scale(rectangle, *(1 - 2 * 0.06 / max(d, 0.2) for d in _axis_lengths(rectangle)))
        for corner in list(inner.exterior.coords)[:-1]:
            parts.append(_prism(Point(corner).buffer(LEG_M / 2, cap_style=3), 0, DESK_HEIGHT_M - TOP_THICKNESS_M, "aluminum"))
    else:
        core = top.buffer(-0.25)
        core = core if not core.is_empty and core.geom_type == "Polygon" else top.centroid.buffer(0.08, cap_style=3)
        parts.append(_prism(core, 0, DESK_HEIGHT_M - TOP_THICKNESS_M, "aluminum"))
    return parts


def _axis_lengths(polygon):
    minx, miny, maxx, maxy = polygon.bounds
    return maxx - minx, maxy - miny


def chair_placement(seat, tables):
    """One generic chair per drawn chair: its centre and the plan angle it faces (towards the nearest table)."""
    centre = seat.centroid
    if not tables:
        return [round(centre.x, 3), round(centre.y, 3)], 0.0
    target = nearest_points(unary_union(tables), centre)[0]
    return [round(centre.x, 3), round(centre.y, 3)], round(math.atan2(target.y - centre.y, target.x - centre.x), 4)


def main():
    page = pymupdf.open(walls_extractor.PDF)[0]
    walls = json.loads(WALLS.read_text(encoding="utf-8"))
    built = unary_union([Polygon(s["polygon_m"]) for key in ("solids", "windows", "posts") for s in walls[key]])
    strokes = list(grey_strokes(page))
    chair_shapes = chairs(strokes)
    top_shapes = tops(strokes, chair_shapes, built)
    tables_round = [t for t in round_tables(strokes, chair_shapes) if not any(t.intersection(f).area > 0.5 * f.area for f in top_shapes)]
    items = []
    near_wall = built.buffer(0.2)
    for top in top_shapes:
        small, _ = _dims(top)
        if top.intersects(ARCHIVE):
            kind, parts = "shelf", [_prism(top, 0, SHELF_HEIGHT_M, "melamine")]
        elif top.intersects(RESTROOM):
            kind, parts = "fixture", [_prism(top, 0, FIXTURE_HEIGHT_M, "fixture")]
        elif small <= CABINET_MAX_DEPTH_M and top.intersects(near_wall):
            kind, parts = "cabinet", [_prism(top, 0, DESK_HEIGHT_M, "melamine")]
        else:
            kind, parts = "desk", desk_parts(top)
        items.append({"kind": kind, "footprint_m": _ring(top), "parts": parts})
    for table in tables_round:
        # User: the oval meeting table is wood-colour melamine; other furniture is light mustard melamine.
        oval = max(_dims(table)) >= 2.0
        items.append({"kind": "meeting-table" if oval else "table", "footprint_m": _ring(table),
                      "parts": desk_parts(table, "wood" if oval else "melamine")})
    tables = [Polygon(i["footprint_m"]) for i in items if i["kind"] in ("desk", "table", "meeting-table")]
    for seat in chair_shapes:
        if seat.intersects(RESTROOM):
            items.append({"kind": "fixture", "footprint_m": _ring(seat), "parts": [_prism(seat, 0, FIXTURE_HEIGHT_M, "fixture")]})
        else:
            position, facing = chair_placement(seat, tables)
            items.append({"kind": "chair", "footprint_m": _ring(seat), "position_m": position, "facing_rad": facing})
    items.sort(key=lambda i: (i["kind"], round(Polygon(i["footprint_m"]).centroid.y, 2), round(Polygon(i["footprint_m"]).centroid.x, 2)))
    for index, item in enumerate(items):
        item["id"] = f"{item['kind']}-{index + 1:03d}"
    data = {
        "schema": "floor4-furniture-v1",
        "source": "plano_oficina.pdf",
        "generator": "scripts/extract_floor4_furniture.py",
        "coordinateStatus": "Vector-traced from PDF grey furniture linework through the local grid; approximate.",
        "heights_m": {"desk": DESK_HEIGHT_M, "shelf": SHELF_HEIGHT_M},
        "items": [{"id": i["id"], **{k: v for k, v in i.items() if k != "id"}} for i in items],
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    counts = {k: sum(i["kind"] == k for i in items) for k in sorted({i["kind"] for i in items})}
    print(f"{len(items)} furniture items {counts} -> {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
