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
const items = furniture.items ?? [];
const count = (kind) => items.filter((i) => i.kind === kind).length;

check(furniture.schema === "floor4-furniture-v1" && furniture.source === walls.source, "furniture must be floor4-furniture-v1 from the plan PDF");
check(count("chair") >= 90 && count("desk") >= 80 && count("cabinet") >= 20 && count("shelf") >= 2 && count("meeting-table") === 1,
  "the plan's chairs, desks, cabinets, archive shelving and the one oval meeting table must be extracted");
const pieces = items.filter((i) => i.kind !== "chair");
const chairs = items.filter((i) => i.kind === "chair");
check(pieces.every((i) => Array.isArray(i.footprint_m) && i.footprint_m.length >= 3 && i.parts?.length >= 1
  && i.parts.every((p) => p.polygon_m.length >= 3 && p.z[0] >= 0 && p.z[1] > p.z[0] && p.z[1] <= 2.4)),
"every table, desk, cabinet, shelf and fixture follows its plan footprint with parts within 0–2.40 m");
check(chairs.every((c) => !("parts" in c) && c.position_m?.length === 2 && Number.isFinite(c.facing_rad) && inside(c.position_m, c.footprint_m)),
  "chairs are placements of one generic chair: a position inside the drawn chair and a facing angle (user)");
check(items.filter((i) => ["desk", "table", "meeting-table"].includes(i.kind)).every((i) => Math.max(...i.parts.map((p) => p.z[1])) === 0.75),
  "desk and table tops sit at the fixed 0.75 m desk height (user)");
const meeting = items.find((i) => i.kind === "meeting-table");
check(meeting && inside([14.7, 14.85], meeting.footprint_m) && meeting.parts.some((p) => p.material === "wood")
  && items.filter((i) => i.kind !== "meeting-table").every((i) => !(i.parts ?? []).some((p) => p.material === "wood")),
"the oval Zona de Reuniones table is wood-colour melamine; other furniture is not (user)");
check(items.filter((i) => ["desk", "cabinet", "shelf", "table"].includes(i.kind)).every((i) => i.parts.some((p) => p.material === "melamine")),
  "desks, cabinets, shelving and side tables are light mustard melamine (user)");
const solids = walls.solids.map((s) => s.polygon_m);
check(items.every((i) => !solids.some((s) => inside(centre(i.footprint_m), s))), "no furniture may sit inside a wall or column");
const excluded = [[19.4, 12.4, 22.6, 17.05], [19.85, 17.15, 22.65, 20.45], [0, 19.2, 4.7, 22.3]];
check(items.every((i) => { const [u, v] = centre(i.footprint_m); return !excluded.some(([a, b, c, d]) => u > a && u < c && v > b && v < d); }),
  "stairs and elevator cabins are not furniture");

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
built = [p for p in plan["prisms"] if p["name"].startswith(("desk-", "cabinet-", "shelf-", "table-", "meeting-table-", "fixture-"))]
assert len(built) == sum(len(i.get("parts", [])) for i in furniture["items"]), len(built)
assert all(p["collidable"] is False for p in built), "furniture is exported as decor; walkthrough collisions come from footprints"
chairs = [i for i in furniture["items"] if i["kind"] == "chair"]
assert [c["name"] for c in plan["chairs"]] == [c["id"] for c in chairs], "every drawn chair gets one generic chair instance"
parts = ns["CHAIR_PARTS"]
assert max(p[1][2] for p in parts) == 0.95 and any(p[0][2] == 0.42 for p in parts), "generic chair: seat at 0.42-0.49 m, backrest to 0.95 m"
names = ns["_checkpoint_object_names"](plan, "Floor4_test")
assert all(f"Floor4_test_{c['id']}" in names for c in chairs)
palette = ns["PALETTE"]
assert palette["upholstery"][:3] == (0.03, 0.03, 0.035) and palette["melamine"][:3] == (0.87, 0.74, 0.45) and palette["wood"][:3] == (0.55, 0.36, 0.2)
assert palette["frosted"][3] >= 0.85, "frosted mamparas must be less transparent"
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
console.log(`PASS: floor 4 furniture validated (${items.length} items: ${["chair", "desk", "cabinet", "shelf", "table", "meeting-table", "fixture"].map((k) => `${count(k)} ${k}`).join(", ")}).`);
