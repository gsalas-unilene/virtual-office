import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const furniture = JSON.parse(readFileSync(resolve(root, "src/floor4-furniture.json"), "utf8"));
const walls = JSON.parse(readFileSync(resolve(root, "src/floor4-walls.json"), "utf8"));
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const centre = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
const inside = ([x, y], ring) => ring.reduce((hit, [x0, y0], i) => {
  const [x1, y1] = ring[(i + 1) % ring.length];
  return (y0 > y) !== (y1 > y) && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0 ? !hit : hit;
}, false);
const ringDistance = ([u, v], ring) => Math.min(...ring.map(([u0, v0], i) => {
  const [u1, v1] = ring[(i + 1) % ring.length];
  const du = u1 - u0;
  const dv = v1 - v0;
  const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv || 1)));
  return Math.hypot(u - (u0 + t * du), v - (v0 + t * dv));
}));
const items = furniture.items ?? [];
const count = (kind) => items.filter((i) => i.kind === kind).length;

check(furniture.schema === "floor4-furniture-v1" && furniture.source === walls.source, "furniture must be floor4-furniture-v1 from the plan PDF");
check(count("chair") >= 90 && count("desk") >= 60 && count("cabinet") >= 20 && count("shelf") >= 2 && count("meeting-table") === 1,
  "the plan's chairs, desks, cabinets, archive shelving and the one oval meeting table must be extracted");
const pieces = items.filter((i) => i.kind !== "chair");
const chairs = items.filter((i) => i.kind === "chair");
check(pieces.every((i) => Array.isArray(i.footprint_m) && i.footprint_m.length >= 3 && i.parts?.length >= 1
  && i.parts.every((p) => p.polygon_m.length >= 3 && p.z[0] >= 0 && p.z[1] > p.z[0] && p.z[1] <= 2.4)),
"every table, desk, cabinet, shelf and fixture follows its plan footprint with parts within 0–2.40 m");
check(chairs.every((c) => !("parts" in c) && c.position_m?.length === 2 && Number.isFinite(c.facing_rad)
  && (inside(c.position_m, c.footprint_m) || ringDistance(c.position_m, c.footprint_m) <= 0.35)),
"chairs are placements of one generic chair at the drawn chair (pulled out at most 0.35 m from under a top) with a facing angle (user)");
check(items.filter((i) => ["desk", "table", "meeting-table"].includes(i.kind)).every((i) => Math.max(...i.parts.map((p) => p.z[1])) === 0.75),
  "desk and table tops sit at the fixed 0.75 m desk height (user)");
const meeting = items.find((i) => i.kind === "meeting-table");
check(meeting && inside([14.7, 14.85], meeting.footprint_m) && meeting.parts.some((p) => p.material === "wood")
  && items.filter((i) => i.kind !== "meeting-table").every((i) => !(i.parts ?? []).some((p) => p.material === "wood")),
"the oval Zona de Reuniones table is wood-colour melamine; other furniture is not (user)");
check(items.filter((i) => ["desk", "pedestal", "divider", "cabinet", "shelf", "table"].includes(i.kind)).every((i) => i.parts.some((p) => p.material === "melamine")),
  "desks, pedestals, dividers, cabinets, shelving and side tables are light mustard melamine (user)");
const solids = walls.solids.map((s) => s.polygon_m);
check(items.every((i) => !solids.some((s) => inside(centre(i.footprint_m), s))), "no furniture may sit inside a wall or column");
const excluded = [[19.4, 12.4, 22.6, 17.05], [19.85, 17.15, 22.65, 20.45], [0, 19.2, 4.7, 22.3]];
check(items.every((i) => { const [u, v] = centre(i.footprint_m); return !excluded.some(([a, b, c, d]) => u > a && u < c && v > b && v < d); }),
  "stairs and elevator cabins are not furniture");

// User 2026-10-17: melamine furniture is built from boards, with drawer units beside desks and no black metal legs.
check(pieces.every((i) => i.parts.every((p) => ["melamine", "wood", "fixture", "handle"].includes(p.material))),
  "furniture parts are melamine boards, handles or sanitary fixtures; no metal legs (user)");
check(items.filter((i) => i.kind === "desk").every((i) => i.parts.filter((p) => p.z[0] === 0 && p.material === "melamine").length >= 2),
  "every desk stands on melamine side panels from the floor");
const pedestals = items.filter((i) => i.kind === "pedestal");
check(pedestals.length >= 30 && pedestals.every((i) => { const n = i.parts.filter((p) => p.material === "handle").length; return n >= 3 && n % 3 === 0; }),
  "the squares beside desks are drawer pedestals of three drawers per module (user)");
// User 2026-10-17: drawers open towards the aisle, away from the desk the pedestal stands against.
const desksAll = items.filter((i) => i.kind === "desk").map((i) => i.footprint_m);
const nearestOnRing = ([u, v], ring) => ring.map(([u0, v0], i) => {
  const [u1, v1] = ring[(i + 1) % ring.length];
  const du = u1 - u0;
  const dv = v1 - v0;
  const t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv || 1)));
  return [u0 + t * du, v0 + t * dv];
}).reduce((best, q) => (Math.hypot(q[0] - u, q[1] - v) < Math.hypot(best[0] - u, best[1] - v) ? q : best));
const ringGap = (a, b) => Math.min(...a.map((q) => ringDistance(q, b)), ...b.map((q) => ringDistance(q, a)));
check(pedestals.every((i) => {
  const c = centre(i.footprint_m);
  const own = desksAll.filter((r) => ringGap(i.footprint_m, r) < 0.1);
  return own.length > 0 && i.parts.filter((p) => p.material === "handle").every((h) => {
    // The face carrying the handle: the pedestal edge nearest to it, with its outward normal.
    const hc = centre(h.polygon_m);
    const edges = i.footprint_m.map((p, k) => [p, i.footprint_m[(k + 1) % i.footprint_m.length]]);
    const [[u0, v0], [u1, v1]] = edges.reduce((best, e) => (ringDistance(hc, e) < ringDistance(hc, best) ? e : best));
    let [nu, nv] = [v1 - v0, -(u1 - u0)];
    if (nu * (hc[0] - c[0]) + nv * (hc[1] - c[1]) < 0) [nu, nv] = [-nu, -nv];
    // That face looks away from every desk the pedestal stands against (strictly away when it serves one desk).
    return own.every((r) => {
      const [du, dv] = nearestOnRing(c, r);
      const dot = nu * (c[0] - du) + nv * (c[1] - dv);
      return own.length === 1 ? dot > 1e-6 : dot >= -1e-6;
    });
  });
}), "pedestal drawers face the aisle, away from the desk they stand against, not to the sides (user)");
const tiDesk = items.find((i) => i.kind === "desk" && inside([13.8, 0.45], i.footprint_m));
check(tiDesk && chairs.some((c) => ringDistance(c.position_m, tiDesk.footprint_m) < 0.6),
  "the Oficina de TI counter beside the mampara is a desk with its own chair (user)");
check(count("divider") >= 4, "back-to-back workstations share a divider panel");

const chairModel = furniture.chairModel ?? [];
const bounds = (ring) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
const solid = (ring, z) => ({ ring, z, b: bounds(ring) });
// Generic chair parts at a placement: their world outline plus interior sample points every 2 cm (5 mm in from the faces).
const placeChair = ({ position_m: [cu, cv], facing_rad: a }) => {
  const c = Math.cos(a - Math.PI / 2);
  const s = Math.sin(a - Math.PI / 2);
  const world = (x, y) => [cu + x * c - y * s, cv + x * s + y * c];
  return chairModel.map(([[x0, y0, z0], [x1, y1, z1]]) => {
    const pts = [];
    const steps = (lo, hi) => {
      const n = Math.max(2, Math.ceil((hi - lo - 0.01) / 0.02) + 1);
      return Array.from({ length: n }, (_, k) => lo + 0.005 + (k * (hi - lo - 0.01)) / (n - 1));
    };
    for (const x of steps(x0, x1)) for (const y of steps(y0, y1)) pts.push(world(x, y));
    return { ...solid([world(x0, y0), world(x1, y0), world(x1, y1), world(x0, y1)], [z0, z1]), pts };
  });
};
const rect = ([u0, v0], [u1, v1], t) => {
  const l = Math.hypot(u1 - u0, v1 - v0);
  const nu = (-(v1 - v0) / l) * (t / 2);
  const nv = ((u1 - u0) / l) * (t / 2);
  return [[u0 + nu, v0 + nv], [u1 + nu, v1 + nv], [u1 - nu, v1 - nv], [u0 - nu, v0 - nv]];
};
const obstacles = [
  ...[...walls.solids, ...walls.windows, ...walls.posts].map((s) => solid(s.polygon_m, [0, 2.4])),
  ...walls.partitions.map((p) => solid(rect(p.start_m, p.end_m, p.thickness_m), [0, 2.4])),
  // A seat may not be tucked under a top (user: chairs and tables must not overlap): tops count from 0.40 m down.
  ...pieces.flatMap((i) => i.parts.map((p) => solid(p.polygon_m, [p.z[0] >= 0.4 ? 0.4 : p.z[0], p.z[1]]))),
];
const hits = (part, o) => part.z[0] < o.z[1] && o.z[0] < part.z[1]
  && part.pts.some(([u, v]) => u > o.b[0] && u < o.b[2] && v > o.b[1] && v < o.b[3] && inside([u, v], o.ring));
const placed = chairs.map((c) => ({ id: c.id, parts: placeChair(c) }));
const clashes = placed.filter((chair, index) => chair.parts.some((part) => obstacles.some((o) => hits(part, o))
  || placed.some((other, k) => k !== index && other.parts.some((q) => hits(part, q))))).map((c) => c.id);
check(chairModel.length === 10 && clashes.length === 0,
  `no chair may intersect a desk, pedestal, table, cabinet, wall, mampara or another chair (user); clashing: ${clashes.slice(0, 8).join(", ")}`);

const builderTest = String.raw`
import json, runpy, sys, types
from pathlib import Path
sys.dont_write_bytecode = True
for name in ("bpy", "bmesh"):
    sys.modules[name] = types.ModuleType(name)
mathutils = types.ModuleType("mathutils"); mathutils.Matrix = object; mathutils.Vector = object
sys.modules["mathutils"] = mathutils
ns = runpy.run_path(sys.argv[1], run_name="floor4_furniture_test")
plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
walls = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
furniture = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8"))
ns["_prepare_checkpoint_plan"](plan, walls, furniture)
built = [p for p in plan["prisms"] if p["name"].startswith(("desk-", "pedestal-", "divider-", "cabinet-", "shelf-", "table-", "meeting-table-", "fixture-"))]
assert len(built) == sum(len(i.get("parts", [])) for i in furniture["items"]), len(built)
assert all(p["collidable"] is False for p in built), "furniture is exported as decor; walkthrough collisions come from footprints"
chairs = [i for i in furniture["items"] if i["kind"] == "chair"]
assert [c["name"] for c in plan["chairs"]] == [c["id"] for c in chairs], "every drawn chair gets one generic chair instance"
parts = plan["chairModel"]
assert max(p[1][2] for p in parts) == 0.95 and any(p[0][2] == 0.42 for p in parts), "generic chair: seat at 0.42-0.49 m, backrest to 0.95 m"
names = ns["_checkpoint_object_names"](plan, "Floor4_test")
assert all(f"Floor4_test_{c['id']}" in names for c in chairs)
palette = ns["PALETTE"]
assert palette["upholstery"][:3] == (0.03, 0.03, 0.035) and palette["melamine"][:3] == (0.87, 0.74, 0.45) and palette["wood"][:3] == (0.55, 0.36, 0.2)
assert palette["frosted"][3] >= 0.93 and palette["glass"][3] >= 0.45, "mamparas must be less translucent (user)"
print(f"PASS: builder adds {len(built)} furniture prisms and {len(plan['chairs'])} generic chair instances (black chairs, light mustard melamine, wood oval table); frosted alpha {palette['frosted'][3]}.")
`;
try {
  process.stdout.write(execFileSync("python3", ["-c", builderTest, resolve(root, "scripts/build_office.py"), resolve(root, "src/floor4-plan.json"),
    resolve(root, "src/floor4-walls.json"), resolve(root, "src/floor4-furniture.json")], { encoding: "utf8" }));
} catch (error) {
  errors.push(`builder furniture derivation failed: ${error.stderr?.toString().trim().split("\n").at(-1) || error.message}`);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log(`PASS: floor 4 furniture validated (${items.length} items: ${["chair", "desk", "pedestal", "divider", "cabinet", "shelf", "table", "meeting-table", "fixture"].map((k) => `${count(k)} ${k}`).join(", ")}).`);
