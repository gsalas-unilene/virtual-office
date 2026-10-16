// 2D walkthrough collisions for the floor 4 model, in plan metres (u along A→F, v along row 2→7).
// Three.js maps a plan point (u, v) to (x = u, z = -v).

// Pool aisle between the desk rows, looking along it towards grid F (yaw -90°).
export const SPAWN = { u: 9.5, v: 9.6, yaw: -Math.PI / 2 };

function bounded(polygon) {
  const us = polygon.map((p) => p[0]);
  const vs = polygon.map((p) => p[1]);
  return { polygon, minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) };
}

function segmentRect([u0, v0], [u1, v1], thickness) {
  const length = Math.hypot(u1 - u0, v1 - v0);
  const nu = (-(v1 - v0) / length) * (thickness / 2);
  const nv = ((u1 - u0) / length) * (thickness / 2);
  return [[u0 + nu, v0 + nv], [u1 + nu, v1 + nv], [u1 - nu, v1 - nv], [u0 - nu, v0 - nv]];
}

/** Every walking obstacle: concrete/drywall solids, facade windows, aluminium posts, mamparas, and furniture other than chairs. */
export function buildObstacles(walls, furniture = { items: [] }) {
  const polygons = [...walls.solids, ...walls.windows, ...walls.posts].map((item) => item.polygon_m);
  for (const p of walls.partitions) polygons.push(segmentRect(p.start_m, p.end_m, p.thickness_m));
  // Chairs are left out so the walker can pass between workstations as if pushing them aside.
  for (const item of furniture.items) if (item.kind !== "chair") polygons.push(item.footprint_m);
  return polygons.map(bounded);
}

function inside([u, v], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [ui, vi] = polygon[i];
    const [uj, vj] = polygon[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

function edgeDistance([u, v], polygon) {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [au, av] = polygon[j];
    const [bu, bv] = polygon[i];
    const du = bu - au;
    const dv = bv - av;
    const t = Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv || 1)));
    best = Math.min(best, Math.hypot(u - (au + t * du), v - (av + t * dv)));
  }
  return best;
}

/** True when a walker of the given radius at (u, v) leaves the floor or touches an obstacle. */
export function isBlocked(obstacles, floor, u, v, radius) {
  if (!inside([u, v], floor) || edgeDistance([u, v], floor) < radius) return true;
  return obstacles.some((o) => u >= o.minU - radius && u <= o.maxU + radius && v >= o.minV - radius && v <= o.maxV + radius
    && (inside([u, v], o.polygon) || edgeDistance([u, v], o.polygon) < radius));
}
