"""Extract floor-4 walls, columns, partitions and facade windows from plano_oficina.pdf vectors.

Dev-time tool, not run inside Blender:
    uv run --with pymupdf --with shapely python scripts/extract_floor4_walls.py
Writes src/floor4-walls.json. Coordinates use the plan's local (u, v) metres.
"""
import json
import sys
from pathlib import Path

import pymupdf
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize, unary_union

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "plano_oficina.pdf"
OUT = ROOT / "src" / "floor4-walls.json"
PLAN = ROOT / "src" / "floor4-plan.json"

# Vector grid-marker centres (PDF points) and their local grid coordinates (T3R-MAP-VALIDATE).
GRID_X_PT = [314.54, 444.02, 574.34, 715.82, 807.38, 889.22]
GRID_U_M = [0, 5.15, 10.33, 15.95, 19.59, 22.85]
GRID_Y_PT = [150.86, 195.02, 237.86, 282.74, 430.34, 568.22, 710.42]
GRID_V_M = [22.25, 20.50, 18.79, 17.01, 11.14, 5.65, 0]

CONCRETE_STROKE = 0.72
WALL_STROKES = {0.72, 0.6, 0.48}  # cut walls: thick outlines form solids, single stroke pairs are partitions
PARTITION_STROKES = (0.6, 0.48)
FRAME_STROKE = 0.24
GLASS_STROKE = 0.6
GLASS_PARTITION_STROKE = 0.12
# User 2026-10-16: a single thick black line is a frosted tempered-glass office partition (mampara).
PARTITION_THICKNESS_M = 0.05
MAX_FRAME_OFFSET_M = 0.12
CLEAR_HEIGHT_M = 2.40
# Defaults per RNE A.010/A.080 research (odd/tasks/floor4-walls-vector-rebuild.md, S2).
WINDOW_SILL_M = 1.00  # RNE A.010 (2021) Art. 35: guard >= 1.00 m above floor
WINDOW_HEAD_M = 2.10  # convention, aligned with 2.10 m door heads (A.010 Art. 19.1)
MAX_WALL_WIDTH_M = 0.80
MIN_SOLID_WIDTH_M = 0.05  # thinner faces are the gap inside a partition's stroke pair
MIN_WALL_PIECE_M = 0.10  # thinner closed outlines are hatch markers and window frames, not walls
DRYWALL_MAX_WIDTH_M = 0.15  # thin interior outlines with drawn thickness are drywall walls
SPLIT_HEIGHT_M = 1.20
# User 2026-10-16: the Gerente Tecnico (east) office is enclosed, so its north mampara is full height despite h=1.60.
FULL_HEIGHT_RUNS = [("h", 4.80, 18.36, 21.36)]
LOW_DRYWALL_M = 0.34
# "Muro bajo de Drywall h=0.34": the label leader points at this rectangle beside the Contabilidad divider.
LOW_DRYWALL_AREAS = [box(8.75, 5.0, 9.25, 6.3)]
SLIDING_LEAF_GAP_M = 0.10
POST_SIZE_M = (0.05, 0.12)  # black aluminium posts: small 0.24-stroke squares where mamparas meet (user)
MAX_END_GAP_M = 0.15  # mampara ends this close to a wall, window, post or mampara are extended to close the gap
# User 2026-10-16: frosted below, clear glass above for the Contabilidad divider and the Oficina de TI wall facing the centre.
SPLIT_PARTITIONS = [("h", 5.87, 5.42, 9.75), ("h", 2.73, 13.04, 17.33)]
BUILDING = box(-0.7, -0.2, 23.0, 23.0)


def _interp(value, xs, ys):
    """Piecewise-linear map with linear extrapolation beyond the end grid lines."""
    pairs = sorted(zip(xs, ys))
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    i = 1
    while i < len(xs) - 1 and value > xs[i]:
        i += 1
    x0, x1, y0, y1 = xs[i - 1], xs[i], ys[i - 1], ys[i]
    return y0 + (value - x0) * (y1 - y0) / (x1 - x0)


def to_m(x, y):
    return round(_interp(x, GRID_X_PT, GRID_U_M), 3), round(_interp(y, GRID_Y_PT, GRID_V_M), 3)


def _segments(page, widths, black_only):
    for drawing in page.get_drawings():
        if round(drawing.get("width") or 0, 2) not in widths or drawing["type"] != "s":
            continue
        if drawing.get("dashes") not in (None, "[] 0"):
            continue
        if black_only and drawing.get("color") != (0.0, 0.0, 0.0):
            continue
        for item in drawing["items"]:
            if item[0] == "l":
                yield to_m(item[1].x, item[1].y), to_m(item[2].x, item[2].y)
            elif item[0] == "qu":
                q = item[1]
                corners = [to_m(p.x, p.y) for p in (q.ul, q.ur, q.lr, q.ll)]
                for i in range(4):
                    yield corners[i], corners[(i + 1) % 4]


def concrete_solids(page):
    """Closed outlines of cut walls and columns, 0.05-0.80 m wide."""
    lines = [LineString([(round(a[0] * 500) / 500, round(a[1] * 500) / 500),
                         (round(b[0] * 500) / 500, round(b[1] * 500) / 500)])
             for a, b in _segments(page, WALL_STROKES, black_only=False) if a != b]
    faces = polygonize(unary_union(lines))
    solids = [f for f in faces
              if f.buffer(-MAX_WALL_WIDTH_M / 2).is_empty and not f.buffer(-MIN_SOLID_WIDTH_M / 2).is_empty
              and f.area > 0.01 and BUILDING.contains(f)]
    unique = []
    for f in solids:
        if not any(f.equals_exact(g, 0.005) for g in unique):
            unique.append(f)
    walls = [f for f in unique if _width(f) >= MIN_WALL_PIECE_M]
    return sorted(_close_false_columns(walls, _hatch_markers(page)), key=lambda f: (round(f.bounds[1], 2), round(f.bounds[0], 2)))


def _hatch_markers(page):
    """Boxes of the black-filled triangles that mark false-column corners."""
    markers = []
    for drawing in page.get_drawings():
        if "f" not in drawing["type"] or drawing.get("fill") != (0.0, 0.0, 0.0) or len(drawing["items"]) != 3:
            continue
        pts = [to_m(q.x, q.y) for item in drawing["items"] for q in item[1:3]]
        marker = box(min(u for u, _ in pts), min(v for _, v in pts), max(u for u, _ in pts), max(v for _, v in pts))
        if BUILDING.contains(marker) and 0.2 <= max(marker.bounds[2] - marker.bounds[0], marker.bounds[3] - marker.bounds[1]) <= 0.6:
            markers.append(marker)
    return markers


def _close_false_columns(walls, markers):
    """A black hatch triangle marks the open corner of a false column; fill its box and merge it with the column."""
    for marker in markers:
        touching = [w for w in walls if w.distance(marker) <= 0.05]
        if touching:
            walls = [w for w in walls if not any(w is t for t in touching)]
            walls.append(unary_union([*touching, marker]).buffer(0.01, join_style=2).buffer(-0.01, join_style=2))
    return walls


def aluminium_posts(page):
    """Small black squares (0.24 stroke) at mampara junctions are the black aluminium support posts."""
    posts = []
    for drawing in page.get_drawings():
        if drawing["type"] != "s" or drawing.get("color") != (0.0, 0.0, 0.0) or round(drawing.get("width") or 0, 2) != FRAME_STROKE:
            continue
        for item in drawing["items"]:
            if item[0] in ("re", "qu"):
                rect = pymupdf.Rect(item[1]) if item[0] == "re" else item[1].rect
                (u0, v1), (u1, v0) = to_m(rect.x0, rect.y0), to_m(rect.x1, rect.y1)
                if all(POST_SIZE_M[0] <= size <= POST_SIZE_M[1] for size in (abs(u1 - u0), abs(v1 - v0))):
                    post = box(min(u0, u1), min(v0, v1), max(u0, u1), max(v0, v1))
                    if BUILDING.contains(post) and not any(post.equals_exact(q, 0.005) for q in posts):
                        posts.append(post)
    return sorted(posts, key=lambda f: (round(f.bounds[1], 2), round(f.bounds[0], 2)))


def frame_closed_solids(page, solids, windows):
    """Wall pieces whose outline is closed by window frame lines (0.24), e.g. facade posts and wall stubs."""
    lines = [LineString([(round(a[0] * 500) / 500, round(a[1] * 500) / 500),
                         (round(b[0] * 500) / 500, round(b[1] * 500) / 500)])
             for a, b in _segments(page, WALL_STROKES | {FRAME_STROKE}, black_only=False) if a != b]
    glass, existing = unary_union(windows).buffer(0.03), unary_union(solids)
    extra = [f for f in polygonize(unary_union(lines))
             if BUILDING.contains(f) and f.area > 0.01 and f.buffer(-MAX_WALL_WIDTH_M / 2).is_empty
             and _width(f) >= MIN_WALL_PIECE_M and f.intersection(glass).area <= 0.5 * f.area
             and f.intersection(existing).area <= 0.5 * f.area]
    # The low drywall rectangle is crossed by the divider line; keep it as one piece.
    low = [f for f in extra if any(area.contains(f) for area in LOW_DRYWALL_AREAS)]
    rest = [f for f in extra if f not in low]
    return rest + ([unary_union(low).convex_hull] if low else [])


def _width(polygon):
    """Effective thickness: area over the long side of the minimum rotated rectangle."""
    corners = list(polygon.minimum_rotated_rectangle.exterior.coords)
    long_side = max(LineString(corners[i:i + 2]).length for i in range(2))
    return polygon.area / long_side if long_side else 0.0


def solid_kind(polygon, envelope):
    """Thin interior outlines are drywall walls; facade pieces and thicker outlines are concrete."""
    if any(area.contains(polygon) for area in LOW_DRYWALL_AREAS):
        return "low-drywall"
    interior = not polygon.intersects(envelope.exterior.buffer(0.15))
    return "drywall" if interior and _width(polygon) < DRYWALL_MAX_WIDTH_M else "concrete"


def _axis_lines(page, stroke):
    """Axis-aligned black lines as (orientation, cross coordinate, start, end) in metres."""
    lines = []
    for (ua, va), (ub, vb) in _segments(page, {stroke}, black_only=True):
        if abs(va - vb) < 0.005 and abs(ua - ub) >= 0.2:
            lines.append(("h", (va + vb) / 2, min(ua, ub), max(ua, ub)))
        elif abs(ua - ub) < 0.005 and abs(va - vb) >= 0.2:
            lines.append(("v", (ua + ub) / 2, min(va, vb), max(va, vb)))
    return lines


def _cover(interval, pieces):
    """Parts of interval covered by the union of pieces."""
    lo, hi = interval
    out = []
    for a, b in sorted(pieces):
        a, b = max(a, lo), min(b, hi)
        if b <= a:
            continue
        if out and a <= out[-1][1] + 0.02:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def window_bands(page, solids):
    """Facade windows: a glass line (0.6 stroke) flanked on both sides by frame lines (0.24 stroke)."""
    concrete = unary_union(solids)
    frames = _axis_lines(page, FRAME_STROKE)
    rects = []
    for orient, c, a, b in _axis_lines(page, GLASS_STROKE):
        same = [f for f in frames if f[0] == orient and abs(f[1] - c) <= MAX_FRAME_OFFSET_M]
        below = [(f[2], f[3]) for f in same if f[1] < c]
        above = [(f[2], f[3]) for f in same if f[1] > c]
        if not below or not above:
            continue
        lo_c = min(f[1] for f in same if f[1] < c)
        hi_c = max(f[1] for f in same if f[1] > c)
        for x0, x1 in _cover((a, b), below):
            for y0, y1 in _cover((x0, x1), above):
                if y1 - y0 >= 0.3:
                    rects.append(box(y0, lo_c, y1, hi_c) if orient == "h" else box(lo_c, y0, hi_c, y1))
    bands = unary_union(rects).difference(concrete)
    parts = getattr(bands, "geoms", [bands])
    return sorted((p.buffer(0) for p in parts if p.area > 0.02 and BUILDING.contains(p)),
                  key=lambda f: (round(f.bounds[1], 2), round(f.bounds[0], 2)))


def _runs(lines, cluster_m, gap_m):
    """Merge parallel lines within cluster_m into centerline runs; along-axis gaps above gap_m split runs."""
    runs = []
    for orient in ("h", "v"):
        pending = sorted(l for l in lines if l[0] == orient)
        while pending:
            group = [l for l in pending if l[1] - pending[0][1] <= cluster_m]
            pending = pending[len(group):]
            c = round(sum(l[1] for l in group) / len(group), 3)
            for a, b in _cover((-1e9, 1e9), [(l[2], l[3]) for l in group]):
                if b - a >= 0.15:
                    runs.append((orient, c, a, b, len({round(l[1], 3) for l in group})))
    return runs


def _height_spans(orient, c, a, b, plan_partitions):
    """Split a run into (start, end, height) spans: h=1.60 where a validated annotated partition lies on it, else full height."""
    cuts = []
    for p in plan_partitions:
        # Only the h=1.60 runs are partial; the user corrected the former 0.34 m line to a full acrylic partition.
        if p.get("annotatedHeight_m", 0) < 1.0:
            continue
        (x0, y0), (x1, y1) = p["start_m"], p["end_m"]
        if orient == "h" and abs(y0 - y1) < 1e-6:
            pc, pa, pb = y0, min(x0, x1), max(x0, x1)
        elif orient == "v" and abs(x0 - x1) < 1e-6:
            pc, pa, pb = x0, min(y0, y1), max(y0, y1)
        else:
            continue
        lo, hi = max(a, pa), min(b, pb)
        if any(orient == fo and abs(c - fc) <= 0.06 and min(b, fb) - max(a, fa) >= 0.8 * (b - a) for fo, fc, fa, fb in FULL_HEIGHT_RUNS):
            continue
        if abs(pc - c) <= 0.2 and hi - lo >= 0.5 * (pb - pa):
            # Snap to the run ends when the annotated trace stops just short of them.
            cuts.append((a if lo - a < 0.15 else lo, b if b - hi < 0.15 else hi, p["annotatedHeight_m"]))
    spans, cursor = [], a
    for lo, hi, height in sorted(cuts):
        if lo - cursor >= 0.15:
            spans.append((cursor, lo, CLEAR_HEIGHT_M))
        spans.append((max(lo, cursor), hi, height))
        cursor = hi
    if b - cursor >= 0.15:
        spans.append((cursor, b, CLEAR_HEIGHT_M))
    return spans or [(a, b, CLEAR_HEIGHT_M)]


def _close_end_gaps(partitions, obstacles):
    """Extend each mampara end along its axis up to MAX_END_GAP_M until it meets an obstacle or another mampara."""
    seg = lambda p: LineString([(p["a"], p["c"]), (p["b"], p["c"])] if p["orient"] == "h" else [(p["c"], p["a"]), (p["c"], p["b"])])
    point = lambda p, t: (t, p["c"]) if p["orient"] == "h" else (p["c"], t)
    for p in partitions:
        others = unary_union([obstacles, *[seg(q).buffer(PARTITION_THICKNESS_M / 2) for q in partitions if q is not p]])
        for end, sign in (("a", -1), ("b", 1)):
            tip = point(p, p[end])
            if others.distance(LineString([tip, tip]).buffer(0.001)) <= 0.005:
                continue
            ray = LineString([tip, point(p, p[end] + sign * MAX_END_GAP_M)])
            hit = ray.intersection(others)
            if not hit.is_empty:
                p[end] += sign * min(LineString([tip, q]).length for q in _points(hit))
    return partitions


def end_connectors(partitions, obstacles):
    """Aluminium connectors bridging any mampara end left within MAX_END_GAP_M of a wall, window, post or mampara."""
    seg = lambda p: LineString([(p["a"], p["c"]), (p["b"], p["c"])] if p["orient"] == "h" else [(p["c"], p["a"]), (p["c"], p["b"])])
    half = PARTITION_THICKNESS_M / 2
    connectors = []
    for p in partitions:
        others = unary_union([obstacles, *[seg(q).buffer(half) for q in partitions if q is not p]])
        for t in (p["a"], p["b"]):
            tip = Point((t, p["c"]) if p["orient"] == "h" else (p["c"], t))
            gap = others.distance(tip)
            if half + 0.005 < gap <= MAX_END_GAP_M:
                target = nearest_points(others, tip)[0]
                connectors.append(unary_union([tip.buffer(half, cap_style=3), target.buffer(half, cap_style=3)]).convex_hull)
    return connectors


def post_height(post, partitions):
    """A post is as tall as the tallest mampara it supports (1.60 m posts on the h=1.60 runs), else full height."""
    seg = lambda p: LineString([(p["a"], p["c"]), (p["b"], p["c"])] if p["orient"] == "h" else [(p["c"], p["a"]), (p["c"], p["b"])])
    heights = [p["height"] for p in partitions if seg(p).distance(post) <= PARTITION_THICKNESS_M]
    return max(heights) if heights else CLEAR_HEIGHT_M


def _points(geometry):
    return [c for g in getattr(geometry, "geoms", [geometry]) for c in getattr(g, "coords", [])]


def vector_partitions(page, solids, windows, posts=()):
    """Partition runs from single cut strokes (0.6/0.48) and glass partitions (>=3 parallel 0.12 lines)."""
    blocked = unary_union(solids).buffer(0.03).union(unary_union(windows).buffer(0.06))
    plan_partitions = json.loads(PLAN.read_text(encoding="utf-8"))["interior"]["partitions"]
    seg = lambda o, c, a, b: LineString([(a, c), (b, c)] if o == "h" else [(c, a), (c, b)])
    candidates = [("frosted", r) for stroke in PARTITION_STROKES for r in _runs(_axis_lines(page, stroke), 0.06, 0.03)]
    candidates += [("glass", r) for r in _runs(_axis_lines(page, GLASS_PARTITION_STROKE), 0.08, 0.03)
                   if r[4] >= 3 and r[3] - r[2] >= 1.2]
    partitions = []
    for kind, (o, c, a, b, _) in candidates:
        line = seg(o, c, a, b)
        if not BUILDING.contains(line) or line.intersection(blocked).length >= 0.8 * line.length:
            continue
        if any(o == so and abs(c - sc) <= 0.06 and min(b, sb) - max(a, sa) >= 0.8 * (b - a) for so, sc, sa, sb in SPLIT_PARTITIONS):
            kind = "frosted-clear"
        for lo, hi, height in _height_spans(o, c, a, b, plan_partitions):
            partitions.append({"kind": kind, "orient": o, "c": c, "a": lo, "b": hi, "height": height})
    # Strokes 0.6 and 0.48 can both trace the same wall; keep the first of overlapping duplicates.
    unique = []
    for p in partitions:
        if not any(q["orient"] == p["orient"] and abs(q["c"] - p["c"]) <= 0.06
                   and min(q["b"], p["b"]) - max(q["a"], p["a"]) >= 0.8 * (p["b"] - p["a"]) for q in unique):
            unique.append(p)
    kept = _drop_sliding_leaves(unique, solids)
    kept = _close_end_gaps(kept, unary_union([*solids, *windows, *posts]).buffer(PARTITION_THICKNESS_M))
    return sorted(kept, key=lambda p: (p["orient"], round(p["c"], 2), p["a"]))


def _drop_sliding_leaves(partitions, solids):
    """A sliding door leaf is drawn as a second bar beside its wall; drop the unanchored bar so the doorway stays open."""
    seg = lambda p: LineString([(p["a"], p["c"]), (p["b"], p["c"])] if p["orient"] == "h" else [(p["c"], p["a"]), (p["c"], p["b"])])
    walls = unary_union(solids)

    def anchored(p, partner):
        ends = [seg(p).interpolate(0), seg(p).interpolate(1, normalized=True)]
        others = [seg(q) for q in partitions if q is not p and q is not partner]
        return any(e.distance(walls) <= 0.12 or any(e.distance(o) <= 0.12 for o in others) for e in ends)

    leaves = []
    for p in partitions:
        for q in partitions:
            if q is not p and q["orient"] == p["orient"] and 0 < abs(q["c"] - p["c"]) <= SLIDING_LEAF_GAP_M \
                    and min(p["b"], q["b"]) - max(p["a"], q["a"]) > 0.05 and not anchored(p, q) and anchored(q, p):
                leaves.append(p)
    return [p for p in partitions if not any(p is leaf for leaf in leaves)]


def _line_json(item, prefix, index):
    a, b, c = round(item["a"], 3), round(item["b"], 3), item["c"]
    start, end = ([a, c], [b, c]) if item["orient"] == "h" else ([c, a], [c, b])
    return {"id": f"{prefix}-{index:03d}", "start_m": start, "end_m": end}


def _ring(polygon):
    coords = list(polygon.exterior.coords)[:-1]
    return [[round(x, 3), round(y, 3)] for x, y in coords]


def main():
    page = pymupdf.open(PDF)[0]
    envelope = Polygon(json.loads(PLAN.read_text(encoding="utf-8"))["floorOutline"])
    solids = concrete_solids(page)
    windows = window_bands(page, solids)
    solids = sorted(solids + frame_closed_solids(page, solids, windows),
                    key=lambda f: (round(f.bounds[1], 2), round(f.bounds[0], 2)))
    posts = aluminium_posts(page)
    partitions = vector_partitions(page, solids, windows, posts)
    posts += end_connectors(partitions, unary_union([*solids, *windows, *posts]))
    data = {
        "schema": "floor4-walls-v1",
        "source": "plano_oficina.pdf",
        "generator": "scripts/extract_floor4_walls.py",
        "coordinateStatus": "Vector-traced from PDF linework through the local grid; approximate/non-constructive.",
        "heights_m": {"clear": CLEAR_HEIGHT_M, "windowSill": WINDOW_SILL_M, "windowHead": WINDOW_HEAD_M,
                      "splitAcrylic": SPLIT_HEIGHT_M, "lowDrywall": LOW_DRYWALL_M},
        # Floor covers the traced outline plus every wall and window piece (e.g. the V03 bay beyond the old outline).
        "floor_m": _ring(max(getattr(merged := unary_union([envelope, *solids, *windows]).buffer(0.01).buffer(-0.01), "geoms", [merged]),
                             key=lambda g: g.area).simplify(0.005)),
        "solids": [{"id": f"solid-{i + 1:02d}", "kind": solid_kind(s, envelope), "polygon_m": _ring(s)} for i, s in enumerate(solids)],
        "windows": [{"id": f"window-{i + 1:02d}", "polygon_m": _ring(w)} for i, w in enumerate(windows)],
        "posts": [{"id": f"post-{i + 1:02d}", "polygon_m": _ring(q), "height_m": post_height(q, partitions)}
                  for i, q in enumerate(posts)],
        "partitions": [
            {**_line_json(p, "partition", i + 1), "kind": p["kind"], "thickness_m": PARTITION_THICKNESS_M, "height_m": p["height"]}
            for i, p in enumerate(partitions)
        ],
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    print(f"{len(data['solids'])} solids, {len(data['windows'])} windows, {len(data['partitions'])} partitions, "
          f"{len(data['posts'])} posts -> {OUT.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
