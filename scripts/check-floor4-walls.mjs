import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const walls = JSON.parse(readFileSync(resolve(root, "src/floor4-walls.json"), "utf8"));
const plan = JSON.parse(readFileSync(resolve(root, "src/floor4-plan.json"), "utf8"));
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const finitePair = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const area = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;
const validRing = (ring) => Array.isArray(ring) && ring.length >= 3 && ring.every(finitePair) && area(ring) > 0.01
  && ring.every(([u, v]) => u >= -0.7 && u <= 23 && v >= -0.2 && v <= 23);

check(walls.schema === "floor4-walls-v1" && walls.source === plan.source, "walls file must be floor4-walls-v1 from the plan PDF");
check(walls.heights_m?.clear === 2.4, "clear height must be the 2.40 m RNE A.010 office minimum");
check(walls.heights_m?.windowSill === 1.0, "window sill must be 1.00 m (RNE A.010 2021 Art. 35 guard height)");
check(walls.heights_m?.windowHead === 2.1, "window head must align with the 2.10 m door height");
check(Array.isArray(walls.solids) && walls.solids.length >= 15 && walls.solids.every((s) => validRing(s.polygon_m)),
  "concrete walls and columns must be at least 15 valid polygons");
check(Array.isArray(walls.windows) && walls.windows.length >= 8 && walls.windows.every((w) => validRing(w.polygon_m)),
  "facade window bands must be at least 8 valid polygons");
check(walls.heights_m?.splitAcrylic === 1.2, "frosted-below / clear-above partitions split at 1.20 m (half of 2.40 m)");
check(walls.solids.every((s) => ["concrete", "drywall", "low-drywall"].includes(s.kind)) && walls.solids.some((s) => s.kind === "drywall"),
  "solids must be classified as concrete, thin interior drywall outlines, or the low drywall");
check(validRing(walls.floor_m) && area(walls.floor_m) > 480, "floor must be one polygon covering the building including the V03 bay");
const inside = ([x, y], ring) => ring.reduce((hit, [x0, y0], i) => {
  const [x1, y1] = ring[(i + 1) % ring.length];
  return (y0 > y) !== (y1 > y) && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0 ? !hit : hit;
}, false);
check(Array.isArray(walls.posts) && walls.posts.length >= 40 && walls.posts.every((p) => p.polygon_m.length >= 4 && p.polygon_m.every(finitePair) && area(p.polygon_m) > 0.002 && area(p.polygon_m) < 0.05),
  "black aluminium posts (PDF junction squares) and gap connectors must be small valid polygons");
check(walls.solids.some((s) => s.kind === "concrete" && inside([5.0, 17.0], s.polygon_m) && inside([5.3, 16.6], s.polygon_m)),
  "the Gerente de Marketing false column must be closed (hatched corner filled)");
const lowDrywall = walls.solids.filter((s) => s.kind === "low-drywall");
check(walls.heights_m?.lowDrywall === 0.34 && lowDrywall.length === 1
  && lowDrywall[0].polygon_m.every(([u, v]) => u >= 8.75 && u <= 9.25 && v >= 5.0 && v <= 6.3),
"the 'Muro bajo de Drywall h=0.34' rectangle must be one 0.34 m solid at u≈8.8–9.2, v≈5.0–6.3");
const bboxHas = (u, v) => walls.solids.some((s) => {
  const us = s.polygon_m.map((p) => p[0]); const vs = s.polygon_m.map((p) => p[1]);
  return u >= Math.min(...us) && u <= Math.max(...us) && v >= Math.min(...vs) && v <= Math.max(...vs);
});
check(bboxHas(-0.3, 5.5) && bboxHas(16.1, 22.75), "facade stub at grid 3 (Z10) and post between windows V03/V04 (Z06) must be solids");
const parts = walls.partitions ?? [];
const axisAligned = (p) => finitePair(p.start_m) && finitePair(p.end_m)
  && (p.start_m[0] === p.end_m[0]) !== (p.start_m[1] === p.end_m[1]);
check(parts.length >= 30 && parts.every((p) => axisAligned(p) && ["frosted", "glass", "frosted-clear"].includes(p.kind)
  && p.thickness_m === 0.05 && [1.6, 2.4].includes(p.height_m)),
"vector partitions must be axis-aligned frosted tempered-glass mamparas, 0.05 m thick, 1.60 m (annotated) or 2.40 m high");
const near = (p, o, c, a, b) => {
  const [i, j] = o === "h" ? [1, 0] : [0, 1];
  return p.start_m[i] === p.end_m[i] && Math.abs(p.start_m[i] - c) <= 0.06
    && Math.min(Math.max(p.start_m[j], p.end_m[j]), b) - Math.max(Math.min(p.start_m[j], p.end_m[j]), a) >= 0.8 * (b - a);
};
check(parts.filter((p) => p.kind === "frosted-clear").length === 2
  && parts.some((p) => p.kind === "frosted-clear" && near(p, "h", 5.87, 5.5, 9.7) && p.height_m === 2.4)
  && parts.some((p) => p.kind === "frosted-clear" && near(p, "h", 2.73, 13.1, 17.3) && p.height_m === 2.4),
"only the Contabilidad divider and the Oficina de TI wall facing the centre are frosted below / clear above (user)");
const overlapping = parts.filter((p, i) => parts.some((q, j) => j !== i && (p.start_m[0] === p.end_m[0]) === (q.start_m[0] === q.end_m[0])
  && (() => { const k = p.start_m[0] === p.end_m[0] ? 0 : 1; const d = Math.abs(p.start_m[k] - q.start_m[k]);
    const a = Math.max(Math.min(p.start_m[1 - k], p.end_m[1 - k]), Math.min(q.start_m[1 - k], q.end_m[1 - k]));
    const b = Math.min(Math.max(p.start_m[1 - k], p.end_m[1 - k]), Math.max(q.start_m[1 - k], q.end_m[1 - k]));
    return d > 0 && d <= 0.1 && b - a > 0.05; })()));
check(overlapping.length === 0, "sliding-door leaves (Jefe de TI P06, Jefe de Tesoreria P06a) must be removed so no partitions overlap");
check(parts.some((p) => near(p, "v", 2.558, 0.3, 1.7)) && parts.some((p) => near(p, "v", 12.997, 0.3, 1.0)),
  "the anchored wall bars at Jefe de Tesoreria (u≈2.56) and Jefe de TI (u≈13.0) must remain");
check(parts.filter((p) => p.height_m === 1.6).length >= 6 && parts.some((p) => p.height_m === 1.6 && near(p, "h", 2.8, 4.9, 7.1)),
  "annotated h=1.60 partitions (Tesoreria L, east offices) must keep their partial height");
check(parts.some((p) => near(p, "v", 4.97, 15.3, 16.4)) && !parts.some((p) => near(p, "v", 4.8, 15.3, 16.4) && Math.abs(p.start_m[0] - 4.97) > 0.06),
  "Marketing west partition must follow the PDF line at u≈4.97, not the former raster trace at u=4.80");
check(!("lintels" in walls), "doorways must stay open: no door lintels (user)");
check(parts.some((p) => near(p, "h", 4.8, 18.5, 21.2) && p.height_m === 2.4) && parts.some((p) => near(p, "v", 18.36, 4.85, 5.85) && p.height_m === 1.6),
  "the enclosed Gerente Tecnico office gets a full-height north mampara; the Negocios west return stays 1.60 m");
const postCentre = (p) => [p.polygon_m.reduce((s, q) => s + q[0], 0) / p.polygon_m.length, p.polygon_m.reduce((s, q) => s + q[1], 0) / p.polygon_m.length];
const postsNear = (u, v) => walls.posts.filter((p) => Math.hypot(postCentre(p)[0] - u, postCentre(p)[1] - v) <= 0.15);
check(postsNear(4.76, 2.79).length === 1 && postsNear(4.76, 2.79)[0].height_m === 1.6 && postsNear(18.34, 4.77)[0]?.height_m === 2.4
  && walls.posts.every((p) => [1.6, 2.4].includes(p.height_m)),
"aluminium posts match their mampara height: the Tesoreria h=1.60 post (u≈4.76) is 1.60 m, the Gerente Tecnico corner post is full height");

check(parts.some((p) => near(p, "h", 13.39, 11.5, 12.5) && p.height_m === 1.6) && parts.some((p) => near(p, "h", 13.39, 12.6, 17.6) && p.height_m === 2.4),
  "the h=1.60 central-office segment must split from the full-height meeting-room wall on the same PDF line (Z08)");

const builderTest = String.raw`
import json, runpy, sys, types
from pathlib import Path
sys.dont_write_bytecode = True
for name in ("bpy", "bmesh"):
    sys.modules[name] = types.ModuleType(name)
mathutils = types.ModuleType("mathutils"); mathutils.Matrix = object; mathutils.Vector = object
sys.modules["mathutils"] = mathutils
ns = runpy.run_path(sys.argv[1], run_name="floor4_walls_test")
plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
walls = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
ns["_prepare_checkpoint_plan"](plan, walls)
boxes, prisms = plan["boxes"], plan["prisms"]
assert not any(b["kind"] == "exterior-wall" for b in boxes), "vector walls must replace the simplified shell boxes"
assert not any(b["name"].startswith("partition_") and not b["name"].startswith("partition-") for b in boxes), "raster plan partitions must not be built"
solids = [p for p in prisms if not p["name"].startswith(("window-", "post-"))]
posts = [p for p in prisms if p["name"].startswith("post-")]
assert len(posts) == len(walls["posts"]) and all(p["material"] == "aluminum" and p["z"] == [0, q["height_m"]] for p, q in zip(posts, walls["posts"])), posts[:1]
materials = {"concrete": "concrete", "drywall": "partition", "low-drywall": "wall"}
expected = [(materials[s["kind"]], [0, 0.34] if s["kind"] == "low-drywall" else [0, 2.4]) for s in walls["solids"]]
assert [(p["material"], p["z"]) for p in solids] == expected, solids[:1]
assert plan["floorOutline"] == walls["floor_m"], "vector checkpoints must use the vector floor outline"
for kind, z in (("parapet", [0, 1.0]), ("glass", [1.0, 2.1]), ("lintel", [2.1, 2.4])):
    band = [p for p in prisms if p["name"].startswith("window-") and p["name"].endswith(kind)]
    assert len(band) == len(walls["windows"]) and all(p["z"] == z for p in band), (kind, band[:1])
for split in (p for p in walls["partitions"] if p["kind"] == "frosted-clear"):
    layers = sorted((b["material"], b["z0"], b["height"]) for b in boxes if b["name"].startswith(split["id"] + "_"))
    assert layers == [("frosted", 0.0, 1.2), ("glass", 1.2, 1.2)], layers
assert not any(b["name"].startswith("lintel-") for b in boxes), "doorways must stay open"
assert len([b for b in boxes if b["name"].startswith("partition-")]) == len(walls["partitions"]) + 2
print(f"PASS: vector walls build {len(solids)} solids, {len(walls['windows'])} windows (1.00/2.10/2.40 m), {len(walls['partitions'])} mamparas (two frosted below / clear above at 1.20 m) and {len(posts)} aluminium posts; doorways open.")
bad = json.loads(json.dumps(walls)); bad["solids"][0]["polygon_m"] = [[0, 0], [1, 0]]
try:
    ns["_prepare_checkpoint_plan"](json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")), bad)
except ValueError:
    print("PASS: degenerate vector wall polygon is rejected.")
else:
    raise AssertionError("degenerate vector wall polygon was accepted")
plain = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
ns["_prepare_checkpoint_plan"](plain)
assert sum(b["kind"] == "exterior-wall" for b in plain["boxes"]) == 31 and not plain.get("prisms"), "plans without vector walls keep the previous shell boxes"
print("PASS: checkpoints without vector walls keep the previous shell geometry.")
`;
try {
  process.stdout.write(execFileSync("python3", ["-c", builderTest, resolve(root, "scripts/build_office.py"),
    resolve(root, "src/floor4-plan.json"), resolve(root, "src/floor4-walls.json")], { encoding: "utf8" }));
} catch (error) {
  errors.push(`builder vector-wall derivation failed: ${error.stderr?.toString().trim() || error.message}`);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log(`PASS: floor 4 vector walls validated (${walls.solids.length} solids, ${walls.windows.length} windows, ${parts.length} partitions, ${walls.posts.length} posts).`);
