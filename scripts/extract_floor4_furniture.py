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
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize, unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_floor4_walls as walls_extractor  # noqa: E402  (shared PDF-to-metre mapping and segment reader)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "floor4-furniture.json"
WALLS = ROOT / "src" / "floor4-walls.json"
to_m = walls_extractor.to_m

GREY = 0.498
DESK_HEIGHT_M = 0.75  # user: fixed desks are 0.75 m
# User 2026-10-17: melamine furniture is built from boards; there are no metal legs.
TOP_THICKNESS_M = 0.025  # top board
BOARD_M = 0.018  # side, modesty, carcass and shelf boards
EDGE_INSET_M = 0.02  # side panels set back from the top edge
MODESTY_INSET_M = 0.05
MODESTY_BOTTOM_M = 0.35
PLINTH_M = 0.06
PLINTH_RECESS_M = 0.04
FRONT_M = 0.018  # drawer and door fronts
GAP_M = 0.004  # reveal between fronts
HANDLE_LENGTH_M = 0.12
DIVIDER_MIN_M, DIVIDER_MAX_M = 0.02, 0.08
DIVIDER_HEIGHT_M = 1.05
DIVIDER_BOARD_M = 0.025
CABINET_MAX_DEPTH_M = 0.5
CREDENZA_MAX_DEPTH_M = 0.65
SEAT_CLEAR_M = 0.40  # below the seat (0.42 m) only the chair base may reach under a top
NOTCH_M = 0.3  # chair notches up to 0.6 m wide are closed in desk outlines
MIN_DRAWN_OUTLINE = 0.6
DASH_MIN_M, DASH_MAX_M, DASH_GAP_MAX_M = 0.04, 0.25, 0.15  # dash and gap lengths of the plan's projection lines
DASH_ZONE_M = 0.06  # share of a face outline that must be grey furniture linework
PEDESTAL_MAX_WIDTH_M = 0.46  # user: the small squares beside desks are melamine drawer units
PEDESTAL_GAP_M = 0.08  # a drawer unit may be drawn a few centimetres clear of its desk
SHELF_HEIGHT_M = 2.0
FIXTURE_HEIGHT_M = 0.42
# Grey linework that is not furniture: stairs, elevator cabins (plan metres).
EXCLUDED = [box(0.0, 19.2, 4.7, 22.3), box(19.4, 12.4, 22.6, 17.05), box(19.85, 17.15, 22.65, 20.45)]
ARCHIVE = box(19.8, 20.55, 22.65, 22.1)
RESTROOM = box(0.1, 17.65, 3.7, 18.9)  # S.H. Gerencia interior, north of its south wall
# One generic office chair, replicated at every chair the plan draws. Local metres: x across, +y towards the desk, z up.
CHAIR_PARTS = [
    ((-0.30, -0.03, 0.03), (0.30, 0.03, 0.07)),    # five-star base, simplified as a cross
    ((-0.03, -0.30, 0.03), (0.03, 0.30, 0.07)),
    ((-0.03, -0.03, 0.07), (0.03, 0.03, 0.42)),    # gas column
    ((-0.24, -0.22, 0.42), (0.24, 0.24, 0.49)),    # seat
    ((-0.02, -0.25, 0.45), (0.02, -0.21, 0.60)),   # backrest support
    ((-0.22, -0.27, 0.58), (0.22, -0.21, 0.95)),   # backrest
    ((-0.26, -0.15, 0.49), (-0.23, -0.12, 0.64)),  # armrest posts
    ((0.23, -0.15, 0.49), (0.26, -0.12, 0.64)),
    ((-0.27, -0.18, 0.64), (-0.22, 0.12, 0.67)),   # armrests
    ((0.22, -0.18, 0.64), (0.27, 0.12, 0.67)),
]


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


def _is_dash(line, neighbours):
    """A short stroke with a collinear neighbour a dash gap away is one dash of a dashed line."""
    (x0, y0), (x1, y1) = line.coords[0], line.coords[-1]
    dx, dy = (x1 - x0) / line.length, (y1 - y0) / line.length
    return any(0.02 <= line.distance(other) <= DASH_GAP_MAX_M
               and all(abs((x - x0) * dy - (y - y0) * dx) <= 0.005 for x, y in (other.coords[0], other.coords[-1]))
               for other in neighbours)


def dash_zone(page):
    """Area covered by dashed projection lines (beams, false ceilings, high cabinets): the PDF draws each dash as a short stroke."""
    short = []
    for drawing in page.get_drawings():
        colour = drawing.get("color")
        if drawing["type"] != "s" or colour is None:
            continue
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            line = LineString([to_m(item[1].x, item[1].y), to_m(item[2].x, item[2].y)])
            if DASH_MIN_M <= line.length <= DASH_MAX_M:
                short.append(line)
    tree = STRtree(short)
    chained = [line for line in short if _is_dash(line, [short[k] for k in tree.query(line.buffer(DASH_GAP_MAX_M)) if short[k] is not line])]
    return unary_union([line.buffer(DASH_ZONE_M, cap_style=3) for line in chained])


def _collinear(a, b, tolerance=0.005):
    (x0, y0), (x1, y1) = a.coords[0], a.coords[-1]
    dx, dy = (x1 - x0) / a.length, (y1 - y0) / a.length
    return all(abs((x - x0) * dy - (y - y0) * dx) <= tolerance for x, y in (b.coords[0], b.coords[-1]))


def without_projections(strokes, zone):
    """User 2026-10-17: dashed projection lines are not furniture.

    A beam projection is also traced in grey as a long double line under the dashes; drop those strips (and their
    collinear end pieces) but keep single desk edges that merely happen to lie on a dashed line.
    """
    along = [line for line, curve in strokes if not curve and line.intersection(zone).length >= 0.8 * line.length]
    strips = [a for a in along if a.length >= 1.0 and any(
        b is not a and b.length >= 1.0 and 0.02 <= a.distance(b) <= 0.08 and a.buffer(0.08).intersection(b).length >= 0.8 * min(a.length, b.length)
        for b in along)]
    drop = {id(a) for a in along if any(a is st or (_collinear(st, a) and a.distance(st) < 0.01) for st in strips)}
    return [(line, curve) for line, curve in strokes if id(line) not in drop]


def snap_ends(strokes, tolerance=0.015):
    """Join stroke ends the drafter left a few millimetres apart (a desk's arc ending 1 cm short of its straight edge)."""
    ends = [pt for line, _ in strokes for pt in (line.coords[0], line.coords[-1])]
    tree = STRtree([Point(pt) for pt in ends])
    target = {}
    for k, pt in enumerate(ends):
        if pt in target:
            continue
        for m in tree.query(Point(pt).buffer(tolerance)):
            target.setdefault(ends[m], pt)
    out = []
    for line, curve in strokes:
        coords = list(line.coords)
        coords[0], coords[-1] = target.get(coords[0], coords[0]), target.get(coords[-1], coords[-1])
        if len(set(coords)) > 1:
            out.append((LineString(coords), curve))
    return out


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


def tops(faces, chair_shapes, built):
    """Table, desk, cabinet and shelf tops: closed grey faces that are not chairs or modelled walls."""
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


def dividers(faces, top_shapes):
    """Thin strips drawn between back-to-back workstations: a shared melamine divider panel."""
    found = []
    for face in faces:
        small, large = _dims(face)
        if DIVIDER_MIN_M <= small <= DIVIDER_MAX_M and large >= 0.8 and _allowed(face):
            corners = list(face.minimum_rotated_rectangle.exterior.coords)[:4]
            sides = sorted((LineString(corners[i:i + 2] if i < 3 else [corners[3], corners[0]]) for i in range(4)), key=lambda e: -e.length)[:2]
            if all(any(t.distance(side.interpolate(0.5, normalized=True)) <= 0.02 for t in top_shapes) for side in sides):
                found.append(face.buffer(0))
    return found


def _ring(polygon):
    return [[round(x, 3), round(y, 3)] for x, y in list(polygon.simplify(0.01).exterior.coords)[:-1]]


def _prism(polygon, z0, z1, material):
    return {"polygon_m": _ring(polygon), "z": [round(z0, 3), round(z1, 3)], "material": material}


class Frame:
    """Local board coordinates on a piece's minimum rotated rectangle: x along the chosen front edge, y inwards (depth), metres."""

    def __init__(self, polygon, front):
        self.corners = list(polygon.minimum_rotated_rectangle.exterior.coords)[:4]
        a, b = self.corners[front], self.corners[(front + 1) % 4]
        self.length = math.dist(a, b)
        self.origin = a
        self.ex = ((b[0] - a[0]) / self.length, (b[1] - a[1]) / self.length)
        c = polygon.minimum_rotated_rectangle.centroid
        normal = (-self.ex[1], self.ex[0])
        if (c.x - a[0]) * normal[0] + (c.y - a[1]) * normal[1] < 0:
            normal = (-normal[0], -normal[1])
        self.ey = normal
        self.depth = math.dist(b, self.corners[(front + 2) % 4])

    def box(self, x0, x1, y0, y1):
        o, ex, ey = self.origin, self.ex, self.ey
        return Polygon([(o[0] + x * ex[0] + y * ey[0], o[1] + x * ex[1] + y * ey[1]) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))])


def _edges(polygon):
    corners = list(polygon.minimum_rotated_rectangle.exterior.coords)[:4]
    return [LineString([corners[i], corners[(i + 1) % 4]]) for i in range(4)]


def _front_edge(polygon, target, candidates=None, farthest=False):
    """Index of the rectangle edge whose midpoint is nearest to (or farthest from) the target geometry."""
    edges = _edges(polygon)
    candidates = candidates if candidates is not None else range(4)
    key = lambda i: target.distance(edges[i].interpolate(0.5, normalized=True))
    return max(candidates, key=key) if farthest else min(candidates, key=key)


def _long_edges(polygon):
    edges = _edges(polygon)
    return [i for i in range(4) if edges[i].length >= edges[(i + 1) % 4].length - 1e-6]


def _clip(panel, outline):
    piece = panel.intersection(outline)
    if piece.geom_type != "Polygon":
        piece = max(getattr(piece, "geoms", []), key=lambda g: g.area, default=None)
    return piece if piece is not None and piece.area > 1e-4 else None


def _owner_edge(top, chairs_zone, seats):
    """The desk user's side: the long edge with the fewest chairs in front of it, ignoring empty sides (visitors sit opposite)."""
    longs = _long_edges(top)
    counts = _chairs_per_side(top, seats)
    occupied = [i for i in longs if counts[i]]
    if len(occupied) == 2 and counts[occupied[0]] != counts[occupied[1]]:
        return min(occupied, key=lambda i: counts[i])
    return _front_edge(top, chairs_zone, longs)


def desk_parts(top, chairs_zone, seats, back_divider, finish="melamine"):
    """Melamine panel desk: top board on two full-depth side panels (gables) and a modesty panel at the back; no metal legs."""
    parts = [_prism(top, DESK_HEIGHT_M - TOP_THICKNESS_M, DESK_HEIGHT_M, finish)]
    fr = Frame(top, _owner_edge(top, chairs_zone, seats))
    under = DESK_HEIGHT_M - TOP_THICKNESS_M
    for x0 in (EDGE_INSET_M, fr.length - EDGE_INSET_M - BOARD_M):
        gable = _clip(fr.box(x0, x0 + BOARD_M, EDGE_INSET_M, fr.depth - EDGE_INSET_M), top)
        if gable is not None:
            parts.append(_prism(gable, 0, under, finish))
    if not back_divider(fr.box(0, fr.length, fr.depth - 0.06, fr.depth + 0.06)):
        y = fr.depth - MODESTY_INSET_M
        modesty = _clip(fr.box(EDGE_INSET_M + BOARD_M, fr.length - EDGE_INSET_M - BOARD_M, y - BOARD_M, y), top)
        if modesty is not None:
            parts.append(_prism(modesty, MODESTY_BOTTOM_M, under, finish))
    return parts


def _carcass(piece, fr, height, finish="melamine"):
    """Board carcass: recessed plinth, body and a top board flush with the piece outline."""
    return [
        _prism(fr.box(0.0, fr.length, PLINTH_RECESS_M, fr.depth), 0, PLINTH_M, finish),
        _prism(fr.box(0.0, fr.length, FRONT_M, fr.depth), PLINTH_M, height - TOP_THICKNESS_M, finish),
        _prism(piece, height - TOP_THICKNESS_M, height, finish),
    ]


def _handle(fr, x_mid, z_mid, vertical=False):
    half = HANDLE_LENGTH_M / 2
    footprint = fr.box(x_mid - (0.006 if vertical else half), x_mid + (0.006 if vertical else half), -0.025, 0.0)
    return _prism(footprint, z_mid - (half if vertical else 0.006), z_mid + (half if vertical else 0.006), "handle")


def drawer_parts(piece, front_target, height=DESK_HEIGHT_M):
    """Melamine drawer pedestal (cajonera): carcass plus three drawer fronts with handles on the face towards the user."""
    fr = Frame(piece, front_target(piece))
    parts = _carcass(piece, fr, height)
    bottom, top = PLINTH_M, height - TOP_THICKNESS_M
    step = (top - bottom) / 3
    for k in range(3):
        z0, z1 = bottom + k * step + GAP_M / 2, bottom + (k + 1) * step - GAP_M / 2
        parts.append(_prism(fr.box(GAP_M, fr.length - GAP_M, 0.0, FRONT_M), z0, z1, "melamine"))
        parts.append(_handle(fr, fr.length / 2, z1 - 0.04))
    return parts


def _modules(piece, unit=0.5):
    """A drawer column longer than one unit (a bench end) is a row of separate drawer pedestals about 0.5 m long."""
    fr = Frame(piece, _long_edges(piece)[0])
    count = max(1, round(fr.length / unit))
    if count == 1:
        return [piece]
    width = fr.length / count
    return [fr.box(k * width + GAP_M / 2, (k + 1) * width - GAP_M / 2, 0, fr.depth) for k in range(count)]


def cabinet_parts(piece, built):
    """Low melamine credenza: carcass with hinged doors (about 0.5 m each) facing away from the wall."""
    fr = Frame(piece, _front_edge(piece, built, _long_edges(piece), farthest=True))
    if fr.length <= 0.6:
        return drawer_parts(piece, lambda p: _front_edge(p, built, _long_edges(p), farthest=True))
    parts = _carcass(piece, fr, DESK_HEIGHT_M)
    doors = max(1, round(fr.length / 0.5))
    width = fr.length / doors
    for k in range(doors):
        x0, x1 = k * width + GAP_M / 2, (k + 1) * width - GAP_M / 2
        parts.append(_prism(fr.box(x0, x1, 0.0, FRONT_M), PLINTH_M + GAP_M / 2, DESK_HEIGHT_M - TOP_THICKNESS_M - GAP_M / 2, "melamine"))
        parts.append(_handle(fr, x1 - 0.04 if k % 2 == 0 else x0 + 0.04, DESK_HEIGHT_M - 0.15, vertical=True))
    return parts


def shelf_parts(piece, built):
    """Open archive shelving: side panels, back panel, plinth, top and four intermediate shelves."""
    fr = Frame(piece, _front_edge(piece, built, _long_edges(piece), farthest=True))
    parts = [_prism(fr.box(x0, x0 + BOARD_M, 0, fr.depth), 0, SHELF_HEIGHT_M, "melamine") for x0 in (0, fr.length - BOARD_M)]
    parts.append(_prism(fr.box(BOARD_M, fr.length - BOARD_M, fr.depth - BOARD_M, fr.depth), 0, SHELF_HEIGHT_M, "melamine"))
    parts.append(_prism(fr.box(BOARD_M, fr.length - BOARD_M, PLINTH_RECESS_M, fr.depth - BOARD_M), 0, PLINTH_M, "melamine"))
    for k in range(6):
        z = PLINTH_M + k * (SHELF_HEIGHT_M - PLINTH_M - BOARD_M) / 5
        parts.append(_prism(fr.box(BOARD_M, fr.length - BOARD_M, 0, fr.depth - BOARD_M), z, z + BOARD_M, "melamine"))
    return parts


def table_parts(top, finish):
    """Free-standing melamine table: top board on panel bases (two for an oval, a cross for a round table)."""
    parts = [_prism(top, DESK_HEIGHT_M - TOP_THICKNESS_M, DESK_HEIGHT_M, finish)]
    fr = Frame(top, _long_edges(top)[0])
    under = DESK_HEIGHT_M - TOP_THICKNESS_M
    t = 2 * BOARD_M
    mid_y = fr.depth / 2
    if fr.length >= 1.6 * fr.depth:
        for x in (0.25 * fr.length, 0.75 * fr.length):
            parts.append(_prism(fr.box(x - t / 2, x + t / 2, mid_y - 0.3 * fr.depth, mid_y + 0.3 * fr.depth), 0, under, finish))
        parts.append(_prism(fr.box(0.25 * fr.length, 0.75 * fr.length, mid_y - t / 2, mid_y + t / 2), 0.45, under, finish))
    else:
        mid_x, r = fr.length / 2, 0.3 * min(fr.length, fr.depth)
        parts.append(_prism(fr.box(mid_x - r, mid_x + r, mid_y - t / 2, mid_y + t / 2), 0, under, finish))
        parts.append(_prism(fr.box(mid_x - t / 2, mid_x + t / 2, mid_y - r, mid_y + r), 0, under, finish))
    return parts


def _chair_footprints(position, facing):
    """World-space footprints and z ranges of the generic chair parts at a placement."""
    c, s = math.cos(facing - math.pi / 2), math.sin(facing - math.pi / 2)
    out = []
    for (x0, y0, z0), (x1, y1, z1) in CHAIR_PARTS:
        pts = [(position[0] + x * c - y * s, position[1] + x * s + y * c) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        out.append((Polygon(pts), z0, z1))
    return out


def _collides(chair, obstacles):
    for shape, z0, z1 in chair:
        for poly, b0, b1 in obstacles:
            if z0 < b1 and b0 < z1 and shape.intersection(poly).area > 1e-5:
                return True
    return False


def _square_to(table, facing, snap=math.radians(20)):
    """Align a chair with its table's sides when it is within a few degrees of one (round tables keep the radial angle)."""
    if table.area / table.minimum_rotated_rectangle.area < 0.9 and _dims(table)[0] > 0.85 * _dims(table)[1]:
        return facing
    corners = list(table.minimum_rotated_rectangle.exterior.coords)
    axis = math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0])
    best = min((axis + k * math.pi / 2 for k in range(-4, 5)), key=lambda a: abs(math.remainder(facing - a, 2 * math.pi)))
    return best if abs(math.remainder(facing - best, 2 * math.pi)) <= snap else facing


def place_chairs(seats, tables, obstacles):
    """One generic chair per drawn chair, facing the nearest table and nudged back or sideways until it touches nothing.

    The plan draws chairs overlapping desks and pedestals; the chair is moved the smallest distance that clears them,
    walls, mamparas and the chairs already placed.
    """
    target_zone = tables or None
    placed = []
    for seat in seats:
        centre = seat.centroid
        facing = 0.0
        if target_zone is not None:
            table = min(tables, key=lambda t: t.distance(centre))
            edge = nearest_points(table.exterior, centre)[0]
            if table.contains(centre):
                # Seat drawn tucked under its table: face inwards across the edge it crosses.
                facing = math.atan2(centre.y - edge.y, centre.x - edge.x)
            else:
                facing = math.atan2(edge.y - centre.y, edge.x - centre.x)
            facing = _square_to(table, facing)
        fx, fy = math.cos(facing), math.sin(facing)
        best = None
        for back in [k * 0.02 for k in range(-5, 41)]:
            for side in [0.0] + [sgn * k * 0.02 for k in range(1, 8) for sgn in (1, -1)]:
                pos = (centre.x - fx * back - fy * side, centre.y - fy * back + fx * side)
                cost = abs(back) + 1.5 * abs(side)
                if best is not None and cost >= best[0]:
                    continue
                chair = _chair_footprints(pos, facing)
                near = [o for o in obstacles if o[0].distance(Point(pos)) < 0.6]
                if not _collides(chair, near):
                    best = (cost, pos)
        if best is None:
            raise ValueError(f"no collision-free spot for the chair drawn at ({centre.x:.2f}, {centre.y:.2f})")
        pos = best[1]
        obstacles.extend(_chair_footprints(pos, facing))
        placed.append(([round(pos[0], 3), round(pos[1], 3)], round(facing, 4), round(best[0], 3)))
    return placed


def _chairs_per_side(top, seats, reach=0.45):
    """Number of drawn chairs in front of each edge of a top's rectangle."""
    edges = _edges(top)
    counts = [0, 0, 0, 0]
    for seat in seats:
        c = seat.centroid
        if c.distance(top) > reach:
            continue
        counts[min(range(4), key=lambda i: edges[i].distance(c))] += 1
    return counts


def resolve_desks(top_shapes, kinds, chairs_zone):
    """Undo plan overlaps on desks (user 2026-10-17: chairs and desks must not overlap).

    A chair drawn tucked under a desk cuts its outline; the desk is restored to its full rectangle. A rounded end drawn
    as its own closed face against a desk (a peninsula) is part of that desk, not a separate round table.
    """
    resolved = []
    for t in top_shapes:
        if kinds[id(t)] == "desk":
            rect = t.minimum_rotated_rectangle
            missing = rect.difference(t)
            if 0 < missing.area and missing.difference(chairs_zone.buffer(0.03)).area <= 0.2 * missing.area:
                t = rect
            else:
                # L and curved desks: close only the notches chairs cut (mitred closing keeps the L's own corner).
                closed = t.buffer(NOTCH_M, join_style=2).buffer(-NOTCH_M, join_style=2)
                t = unary_union([t, closed.intersection(chairs_zone.buffer(0.03))]).buffer(0.002, join_style=2).buffer(-0.002, join_style=2)
            kinds[id(t)] = "desk"
        resolved.append(t)
    for t in [t for t in resolved if kinds[id(t)] == "table"]:
        host = next((d for d in resolved if kinds[id(d)] == "desk" and _touching(t, [d], gap=0.01)), None)
        if host is not None:
            merged = unary_union([host, t]).buffer(0.005, join_style=2).buffer(-0.005, join_style=2)
            kinds[id(merged)] = "desk"
            resolved = [r for r in resolved if r is not host and r is not t] + [merged]
    return resolved


def _touching(piece, others, min_shared=0.3, gap=PEDESTAL_GAP_M):
    return [o for o in others if o is not piece and piece.buffer(gap).intersection(o.boundary).length >= min_shared]


def _obstacles(walls):
    """Walls, windows, posts and mamparas as (footprint, z0, z1) for chair clearance."""
    out = [(Polygon(s["polygon_m"]), 0, 2.4) for key in ("solids", "windows", "posts") for s in walls[key]]
    for p in walls["partitions"]:
        out.append((LineString([p["start_m"], p["end_m"]]).buffer(p["thickness_m"] / 2, cap_style=2), 0, 2.4))
    return out


def main():
    page = pymupdf.open(walls_extractor.PDF)[0]
    walls = json.loads(WALLS.read_text(encoding="utf-8"))
    built = unary_union([Polygon(s["polygon_m"]) for key in ("solids", "windows", "posts") for s in walls[key]])
    strokes = snap_ends(without_projections(list(grey_strokes(page)), dash_zone(page)))
    # Walls and mamparas close furniture drawn against them (e.g. the Director's desk return and credenza);
    # a face still needs most of its outline drawn in grey, so rooms bounded by walls never become furniture.
    grey = unary_union([line for line, _ in strokes])
    aux = [Polygon(s["polygon_m"]).exterior for key in ("solids", "windows", "posts") for s in walls[key]]
    aux += [o[0].exterior for o in _obstacles(walls)[len(aux):]]
    drawn = grey.buffer(0.01)
    faces = [f for f in polygonize(unary_union([grey, *aux]))
             if f.exterior.intersection(drawn).length >= MIN_DRAWN_OUTLINE * f.exterior.length]
    chair_shapes = chairs(strokes)
    seats = [c for c in chair_shapes if not c.intersects(RESTROOM)]
    chairs_zone = unary_union(seats)
    tables_round = round_tables(strokes, chair_shapes)
    # A closed oval or circle is also a face; the curve-traced table outline wins over that face.
    top_shapes = [f for f in tops(faces, chair_shapes, built) if not any(t.intersection(f).area > 0.5 * f.area for t in tables_round)]
    # ...but a curve that is only the rounded end of a larger desk face is part of that desk.
    tables_round = [t for t in tables_round if not any(t.intersection(f).area > 0.5 * t.area for f in top_shapes)]
    divider_shapes = dividers(faces, top_shapes)
    near_wall = built.buffer(0.2)

    def kind_of(top):
        small, large = _dims(top)
        fill = top.area / top.minimum_rotated_rectangle.area
        if top.intersects(ARCHIVE):
            return "shelf"
        if top.intersects(RESTROOM):
            return "fixture"
        if small >= 0.85 * large and 0.7 <= fill <= 0.85:
            return "table"  # a closed circle: round table
        if small <= CABINET_MAX_DEPTH_M and (small <= PEDESTAL_MAX_WIDTH_M or top.intersects(near_wall)):
            return "cabinet"
        return "desk"

    kinds = {id(t): kind_of(t) for t in top_shapes}
    top_shapes = resolve_desks(top_shapes, kinds, chairs_zone)
    for t in top_shapes:
        if kinds[id(t)] == "desk":
            sides = sum(1 for count in _chairs_per_side(t, seats) if count)
            if sides >= 3:
                kinds[id(t)] = "table"  # chairs all round: a meeting table on panel bases
            elif sides == 0 and _dims(t)[0] <= CREDENZA_MAX_DEPTH_M and t.distance(chairs_zone) > 0.6:
                kinds[id(t)] = "cabinet"  # nobody sits at it: a credenza
    desks = [t for t in top_shapes if kinds[id(t)] == "desk"]
    for t in top_shapes:
        if kinds[id(t)] == "cabinet" and _dims(t)[0] <= PEDESTAL_MAX_WIDTH_M and _touching(t, desks):
            kinds[id(t)] = "pedestal"
    has_divider = lambda zone: any(d.intersects(zone) for d in divider_shapes)
    # The drawers of a pedestal face its own workstation's chair, never the desk it stands against.
    pedestal_front = lambda p: _front_edge(p, chairs_zone, [i for i, e in enumerate(_edges(p))
                                                            if not any(d.distance(e.interpolate(0.5, normalized=True)) <= PEDESTAL_GAP_M + 0.02 for d in desks)])
    items = []
    for top in top_shapes:
        kind = kinds[id(top)]
        if kind == "shelf":
            parts = shelf_parts(top, built)
        elif kind == "fixture":
            parts = [_prism(top, 0, FIXTURE_HEIGHT_M, "fixture")]
        elif kind == "pedestal":
            parts = [part for unit in _modules(top) for part in drawer_parts(unit, pedestal_front)]
        elif kind == "cabinet":
            parts = cabinet_parts(top, built)
        elif kind == "table":
            parts = table_parts(top, "melamine")
        else:
            parts = desk_parts(top, chairs_zone, seats, has_divider)
        items.append({"kind": kind, "footprint_m": _ring(top), "parts": parts})
    for strip in divider_shapes:
        fr = Frame(strip, _long_edges(strip)[0])
        mid = fr.depth / 2
        panel = fr.box(0, fr.length, mid - DIVIDER_BOARD_M / 2, mid + DIVIDER_BOARD_M / 2)
        items.append({"kind": "divider", "footprint_m": _ring(panel), "parts": [_prism(panel, 0, DIVIDER_HEIGHT_M, "melamine")]})
    for table in tables_round:
        # User: the oval meeting table is wood-colour melamine; other furniture is light mustard melamine.
        oval = max(_dims(table)) >= 2.0
        items.append({"kind": "meeting-table" if oval else "table", "footprint_m": _ring(table),
                      "parts": table_parts(table, "wood" if oval else "melamine")})
    for seat in chair_shapes:
        if seat.intersects(RESTROOM):
            items.append({"kind": "fixture", "footprint_m": _ring(seat), "parts": [_prism(seat, 0, FIXTURE_HEIGHT_M, "fixture")]})
    tables = [Polygon(i["footprint_m"]) for i in items if i["kind"] in ("desk", "table", "meeting-table")]
    # User 2026-10-17: chairs and tables must not overlap, so a seat is never tucked under a top: tops block from seat height.
    obstacles = _obstacles(walls) + [(Polygon(p["polygon_m"]), SEAT_CLEAR_M if p["z"][0] >= SEAT_CLEAR_M else p["z"][0], p["z"][1])
                                     for i in items for p in i["parts"]]
    for seat, (position, facing, moved) in zip(seats, place_chairs(seats, tables, obstacles)):
        items.append({"kind": "chair", "footprint_m": _ring(seat), "position_m": position, "facing_rad": facing,
                      "moved_m": moved})
    items.sort(key=lambda i: (i["kind"], round(Polygon(i["footprint_m"]).centroid.y, 2), round(Polygon(i["footprint_m"]).centroid.x, 2)))
    for index, item in enumerate(items):
        item["id"] = f"{item['kind']}-{index + 1:03d}"
    data = {
        "schema": "floor4-furniture-v1",
        "source": "plano_oficina.pdf",
        "generator": "scripts/extract_floor4_furniture.py",
        "coordinateStatus": "Vector-traced from PDF grey furniture linework through the local grid; approximate.",
        "heights_m": {"desk": DESK_HEIGHT_M, "shelf": SHELF_HEIGHT_M, "divider": DIVIDER_HEIGHT_M},
        "chairModel": [[list(a), list(b)] for a, b in CHAIR_PARTS],
        "items": [{"id": i["id"], **{k: v for k, v in i.items() if k != "id"}} for i in items],
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    counts = {k: sum(i["kind"] == k for i in items) for k in sorted({i["kind"] for i in items})}
    print(f"{len(items)} furniture items {counts} -> {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
