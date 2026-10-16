import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    console.error(`FAIL: cannot read ${path} (${error.code ?? "invalid JSON"})`);
    process.exit(1);
  }
};

const register = readJson("src/floor4-measurements.json", "measurement register");
const plan = readJson("src/floor4-plan.json", "floor 4 plan");
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const pair = (value) => Array.isArray(value) && value.length === 2 && value.every(finite);
const close = (actual, expected, tolerance = 0.01) => Math.abs(actual - expected) <= tolerance;

check(plan && typeof plan === "object" && !Array.isArray(plan), "plan must be a JSON object");
if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
  console.error(`FAIL: ${errors.join("; ")}`);
  process.exit(1);
}

check(plan.units === "m", "plan units must be m");
check(plan.source === register.source, "plan source must match the measurement register");
check(plan.floor === register.floor, "plan floor must match the measurement register");
check(plan.stage === "west-north-interior", "plan stage must identify the cumulative west/north interior");
check(plan.origin === "southwest outside corner", "origin must be the southwest outside corner");
check(plan.axes?.x === "east" && plan.axes?.y === "north", "plan axes must be x east and y north");
check(!("envelope_m" in plan), "grid-axis spans must not be represented as the exterior envelope");

const validateGrid = (actual, expected, name) => {
  check(actual?.from === expected?.from && actual?.to === expected?.to, `${name} grid endpoints must match the register`);
  check(Array.isArray(actual?.segments_m), `${name} grid must contain segment measurements`);
  if (!Array.isArray(actual?.segments_m)) return;
  check(
    actual.segments_m.length === expected.segments_m.length
      && actual.segments_m.every((value, index) => value === expected.segments_m[index]),
    `${name} grid segments must match the registered measurements exactly`,
  );
  check(
    actual.segments_m.every(finite)
      && close(actual.segments_m.reduce((sum, value) => sum + value, 0),
        name === "horizontal" ? register.grid_axis_spans_m["A-F"] : register.grid_axis_spans_m["7-2"]),
    `${name} grid must close to its grid-axis span within 0.01 m`,
  );
};
validateGrid(plan.grid?.horizontal, register.horizontal_grid, "horizontal");
validateGrid(plan.grid?.vertical, register.vertical_grid, "vertical");

const outline = plan.floorOutline;
check(Array.isArray(outline) && outline.length >= 5 && outline.every(pair), "floor outline must contain at least five finite coordinate pairs");
if (!Array.isArray(outline) || outline.length < 5 || !outline.every(pair)) {
  console.error(`FAIL: ${errors.join("; ")}`);
  process.exit(1);
}
const xs = outline.map(([x]) => x);
const ys = outline.map(([, y]) => y);
const bounds = register.exterior_bounds;
check(outline[0][0] === 0 && outline[0][1] === 0, "first outline point must be the southwest outside origin");
check(bounds?.status === "approximate", "exterior bounds must be labelled approximate");
check(Array.isArray(bounds?.min_m) && Array.isArray(bounds?.max_m), "approximate exterior bounds must record min/max coordinates");
check(bounds?.width_m === bounds?.max_m?.[0] - bounds?.min_m?.[0], "exterior width must be derived from the traced x bounds");
check(bounds?.depth_m === bounds?.max_m?.[1] - bounds?.min_m?.[1], "exterior depth must be derived from the traced y bounds");
check(close(Math.min(...xs), bounds?.min_m?.[0]) && close(Math.max(...xs), bounds?.max_m?.[0]), "traced floor x bounds must match the measurement register");
check(close(Math.min(...ys), bounds?.min_m?.[1]) && close(Math.max(...ys), bounds?.max_m?.[1]), "traced floor y bounds must match the measurement register");
check(Array.isArray(plan.traceNotes?.directlyDimensioned) && plan.traceNotes.directlyDimensioned.includes("grid") && !plan.traceNotes.directlyDimensioned.includes("envelope_m"), "only grid spans may be labelled directly dimensioned");
check(Array.isArray(plan.traceNotes?.scaleTraced) && ["full exterior outline", "north ledge", "west exterior offset", "northwest chamfer", "exterior openings", "T3A west/north room boundaries", "T3A interior partitions and door gaps", "T3A west/north circulation", "T3B central pool and meeting/adjacent-office boundaries", "T3B north-edge office boundaries and connector routes", "T3C east-core rooms, service spaces, and circulation", "T3C crossed-shaft south base strip represented by the east-step shell boundary"].every((feature) => plan.traceNotes.scaleTraced.includes(feature)), "shell and T3A/T3B/T3C raster-traced geometry must be identified as scale-traced");
check(typeof plan.traceNotes?.coordinateStatus === "string" && plan.traceNotes.coordinateStatus.includes("approximate") && plan.traceNotes.coordinateStatus.includes("non-constructive") && plan.traceNotes.coordinateStatus.includes("A=0") && plan.traceNotes.coordinateStatus.includes("west spur alone") && plan.traceNotes.coordinateStatus.includes("T3C"), "scale-traced coordinates must be labelled approximate/non-constructive in the A=0 frame with a separate west spur");
check(typeof plan.traceNotes?.sharedBoundaryConvention === "string"
  && plan.traceNotes.sharedBoundaryConvention.includes("y=11.10")
  && plan.traceNotes.sharedBoundaryConvention.includes("y=11.14")
  && plan.traceNotes.sharedBoundaryConvention.includes("0.04 m")
  && plan.traceNotes.sharedBoundaryConvention.includes("no separate free strip"),
"T3C crossed shaft must record the approximate room/shell shared-boundary convention and subordinate raster discrepancy");
check(typeof plan.traceNotes?.excluded === "string" && plan.traceNotes.excluded.includes("5.42") && plan.traceNotes.excluded.includes("3.85"), "conflicting lower chain must remain excluded");
const edges = outline.map((start, index) => {
  const end = outline[(index + 1) % outline.length];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return { start, end, dx, dy, length: Math.hypot(dx, dy) };
});
const chamfers = edges.filter(({ dx, dy }) => Math.abs(dx) > 0.25 && Math.abs(dy) > 0.25);
check(chamfers.length === 1 && chamfers.some(({ start, end }) =>
  close(start[0], 1.8) && close(start[1], 22.25) && close(end[0], 0) && close(end[1], 19.9)), "floor outline must preserve the approximate northwest chamfer to y=19.9 m");
const hasPoint = (point) => outline.some((candidate) => close(candidate[0], point[0]) && close(candidate[1], point[1]));
check(hasPoint([21.5, 11.1]) && hasPoint([22.85, 11.1]), "east-side step must be near y=11.0–11.14 m, not y=11.75 m");
check(hasPoint([4.6, 22.85]) && hasPoint([16.3, 22.85]) && hasPoint([4.6, 22.25]) && hasPoint([16.3, 22.25]), "north ledge must extend about 0.6 m above grid 7 from near B to just east of D");
check(hasPoint([-0.5, 17.01]) && hasPoint([-0.5, 5.65]) && hasPoint([0, 17.01]) && hasPoint([0, 5.65]), "west exterior offset must extend about 0.5 m west of A between grids 5–3");
check(edges.every(({ length }) => length > 0) && Math.abs(edges.reduce((area, { start, end }) => area + start[0] * end[1] - end[0] * start[1], 0)) > 0, "floor outline must close without zero-length edges");

const shell = plan.shell;
check(shell && typeof shell === "object" && !Array.isArray(shell), "plan must contain exterior shell geometry");
if (!shell || typeof shell !== "object" || Array.isArray(shell)) {
  console.error(`FAIL: ${errors.join("; ")}`);
  process.exit(1);
}
check(finite(shell.wallThickness_m) && shell.wallThickness_m > 0, "wall thickness must be a positive finite metre value");
check(finite(shell.wallHeight_m) && shell.wallHeight_m >= register.constraints.minimum_ceiling_clearance_m, "exterior wall height must be at least 2.40 m");
check(Array.isArray(shell.edges) && shell.edges.length === edges.length, "shell must define every closed floor-outline edge");
check(!("boxes" in plan) && !("partitions" in plan) && !("furniture" in plan), "canonical plan must not contain generated boxes, top-level partitions, or furniture");
if (!Array.isArray(shell.edges) || shell.edges.length !== edges.length) {
  console.error(`FAIL: ${errors.join("; ")}`);
  process.exit(1);
}

check(["south", "east-south", "east-step", "east-north"].every((name, index) => shell.edges[index]?.name === name), "east-side shell edges must follow the traced perimeter step");
const eastWindowNorth = shell.edges[3]?.openings?.find((opening) => opening?.name === "east-window-north");
check(eastWindowNorth && close(outline[3][1] + eastWindowNorth.from_m, 15.8) && close(outline[3][1] + eastWindowNorth.to_m, 16.5), "north east-wall opening must retain its traced absolute position after splitting the edge");
const southOpening = shell.edges.find((edge) => edge?.name === "south")?.openings?.find((opening) => opening?.name === "south-window-west");
check(southOpening && close(southOpening.from_m, 6.7) && close(southOpening.to_m, 8.6), "south-wall opening west of grid C must span approximately x=6.7–8.6 m");

const names = new Set();
const intervals = edges.map(() => []);
let openingCount = 0;
let wallSegmentCount = 0;
for (const [index, shellEdge] of shell.edges.entries()) {
  check(typeof shellEdge?.name === "string" && shellEdge.name.length > 0, `shell edge ${index} must have a name`);
  check(Array.isArray(shellEdge?.openings), `shell edge ${index} must list visible openings`);
  if (!Array.isArray(shellEdge?.openings)) continue;
  const edge = edges[index];
  const ordered = [...shellEdge.openings].sort((a, b) => a.from_m - b.from_m);
  let cursor = 0;
  for (const opening of ordered) {
    check(opening && typeof opening.name === "string" && !names.has(opening.name), "openings must have unique names");
    if (typeof opening?.name === "string") names.add(opening.name);
    check(["door", "window", "vent"].includes(opening?.kind), `${opening?.name ?? "opening"} must have a visible opening kind`);
    check(typeof opening?.source === "string" && opening.source.includes("scale-traced") && opening.source.includes("approximate/non-constructive"), `${opening?.name ?? "opening"} must identify approximate, non-constructive scale-traced source geometry`);
    const from = opening?.from_m;
    const to = opening?.to_m;
    check(finite(from) && finite(to) && from >= cursor && to > from && to <= edge.length + 0.01, `${opening?.name ?? "opening"} must occupy a valid non-overlapping exterior edge interval`);
    if (!finite(from) || !finite(to) || to <= from || from < cursor) continue;
    if (from > cursor) {
      intervals[index].push({ from: cursor, to: from, kind: "wall" });
      wallSegmentCount += 1;
    }
    intervals[index].push({ from, to, kind: "opening" });
    cursor = to;
    openingCount += 1;
  }
  if (cursor < edge.length) {
    intervals[index].push({ from: cursor, to: edge.length, kind: "wall" });
    wallSegmentCount += 1;
  }
}
const northLedgeIndex = shell.edges.findIndex((edge) => edge?.name === "north-ledge");
const northLedgeWestIndex = shell.edges.findIndex((edge) => edge?.name === "north-ledge-west");
const northLedgeOutline = edges[northLedgeIndex];
const northLedgeWestOutline = edges[northLedgeWestIndex];
const northLedgeOpenings = shell.edges[northLedgeIndex]?.openings ?? [];
const v04 = northLedgeOpenings.find((opening) => opening?.name === "north-ledge-v04");
const v05 = northLedgeOpenings.find((opening) => opening?.name === "north-ledge-v05");
const northLedgeU = (distance) => northLedgeOutline?.start?.[0] - distance;
const openingU = (opening) => [northLedgeU(opening?.to_m), northLedgeU(opening?.from_m)];
const v04U = openingU(v04);
const v05U = openingU(v05);
const approximateOpeningSource = (opening) => typeof opening?.source === "string"
  && opening.source.includes("scale-traced") && opening.source.includes("approximate/non-constructive");
check(northLedgeIndex >= 0 && northLedgeWestIndex >= 0
  && shell.edges.filter((edge) => edge?.name === "north-ledge").length === 1
  && shell.edges.filter((edge) => edge?.name === "north-ledge-west").length === 1
  && close(northLedgeOutline?.start?.[0], 16.3) && close(northLedgeOutline?.start?.[1], 22.85)
  && close(northLedgeOutline?.end?.[0], 4.6) && close(northLedgeOutline?.end?.[1], 22.85)
  && northLedgeOpenings.length === 2
  && v04?.kind === "window" && close(v04U[0], 10.8, 0.1) && close(v04U[1], 15.9, 0.1)
  && approximateOpeningSource(v04)
  && v05?.kind === "window" && close(v05U[0], 4.8, 0.1) && close(v05U[1], 10.6, 0.1)
  && approximateOpeningSource(v05),
"north-ledge must run west from u≈16.3 to 4.6 and contain only approximate, non-constructive V04/V05 windows at u≈10.8–15.9 and 4.8–10.6");
const northLedgeGapWall = (intervals[northLedgeIndex] ?? []).find((interval) => interval.kind === "wall"
  && close(northLedgeU(interval.to), v05U[1], 0.1) && close(northLedgeU(interval.from), v04U[0], 0.1));
const northLedgeReturnWall = intervals[northLedgeIndex]?.at(-1);
check(v04U[0] > v05U[1] && close(v04U[0] - v05U[1], 0.2, 0.1)
  && northLedgeGapWall?.kind === "wall"
  && northLedgeReturnWall?.kind === "wall"
  && close(northLedgeU(northLedgeReturnWall.to), 4.6, 0.1)
  && close(northLedgeU(northLedgeReturnWall.from), 4.8, 0.1)
  && close(northLedgeOutline?.end?.[0], northLedgeWestOutline?.start?.[0])
  && close(northLedgeOutline?.end?.[1], northLedgeWestOutline?.start?.[1])
  && shell.edges[northLedgeWestIndex]?.openings?.length === 0,
"north-ledge must keep the ≈0.2 m V04/V05 gap and the u≈4.8–4.6 solid return as one wall joining north-ledge-west, without a duplicate opening or murete");
check(openingCount > 0, "plan must record visible exterior openings");
check(wallSegmentCount > 0, "plan must contain exterior shell wall segments");

for (const [index, edgeIntervals] of intervals.entries()) {
  check(edgeIntervals.length > 0, `shell edge ${index} has no wall or planned opening`);
  if (!edgeIntervals.length) continue;
  check(close(edgeIntervals[0].from, 0), `shell edge ${index} must start at its corner`);
  check(close(edgeIntervals.at(-1).to, edges[index].length), `shell edge ${index} must end at its corner`);
  for (let i = 1; i < edgeIntervals.length; i += 1) {
    check(close(edgeIntervals[i - 1].to, edgeIntervals[i].from, 0.005), `shell edge ${index} has an unplanned gap or overlapping wall/opening intervals`);
  }
}

const interior = plan.interior;
check(interior && typeof interior === "object" && !Array.isArray(interior), "plan must include cumulative T3A interior geometry");
if (interior && typeof interior === "object" && !Array.isArray(interior)) {
  const expectedRooms = new Set([
    "director-ejecutivo-west", "director-ejecutivo-center", "recursos-humanos", "sh-gerencia",
    "gerente-excelencia-operacional", "gerente-comercial", "gerente-operaciones-proyectos", "gerente-tecnico",
  ]);
  const t3bRoomIds = new Set(["oficina", "zona-de-reuniones", "gerente-marketing-internacional", "jefe-recursos-humanos"]);
  const t3cRoomIds = new Set(["archivo-general", "ascensor-materiales", "ascensor-personal", "escalera", "ducto-de-montantes", "service-shaft-crossed"]);
  const t3dRoomIds = new Set([
    "gerencia-administracion-finanzas", "jefe-tesoreria", "tesoreria", "contabilidad", "jefe-ti", "oficina-ti",
    "gerente-tecnico-east", "jefe-negocios-internacionales", "jefe-ventas", "jefe-gestion-calidad",
  ]);
  const t3dZone = { minX: 0, maxX: 21.5, minY: 0, maxY: 11.1 };
  const t3aZone = { minX: -0.5, maxX: 16.3, minY: 5.65, maxY: 22.85 };
  const t3bRoomZone = { minX: 4.8, maxX: 18.3, minY: 13.35, maxY: 17.05 };
  const t3cRoomZone = { minX: 16.0, maxX: 22.85, minY: 11.0, maxY: 22.25 };
  const t3aPartitionIds = new Set([
    "west-restroom-north", "west-restroom-south", "west-restroom-south-step", "west-restroom-south-east",
    "west-restroom-east", "west-excellence-north",
    "west-commercial-north", "west-operations-north", "west-technical-north", "west-grid3-boundary",
    "west-office-spine-lower", "west-office-spine-upper", "north-room-south-wall", "north-room-west", "north-room-divider-west-center",
    "north-room-divider-center-hr", "north-room-east", "north-pasadizo-south-edge",
  ]);
  const t3bPartitionIds = new Set([
    "central-office-west", "central-office-south", "central-office-meeting-divider",
    "meeting-room-south", "meeting-room-east", "meeting-room-north-extension",
    "marketing-internacional-south", "marketing-internacional-west", "marketing-jefe-rrhh-divider", "jefe-rrhh-south",
  ]);
  const t3cPartitionIds = new Set([
    "archivo-general-west", "archivo-general-south", "archivo-general-east", "archivo-general-north",
    "elevator-core-west", "elevator-core-east", "elevator-core-south", "elevator-core-north",
    "stair-enclosure-west", "stair-enclosure-west-landing-step", "stair-enclosure-east", "stair-enclosure-south", "stair-enclosure-north",
    "ducto-de-montantes-south-east-step", "ducto-de-montantes-east-step", "ducto-de-montantes-east", "ducto-de-montantes-south", "ducto-de-montantes-north",
    "crossed-service-shaft-west", "crossed-service-shaft-east", "crossed-service-shaft-north",
  ]);
  // T3D south offices: PDF vector double-line centerlines mapped through the local grid; user-marked h=1.60/h=0.34 runs.
  const t3dExpectedPartitions = {
    "tesoreria-contabilidad-north": [[4.8, 2.8], [7.15, 2.8], 1.6, []],
    "tesoreria-contabilidad-divider": [[7.15, 2.8], [7.15, 0.08], 1.6, []],
    "contabilidad-low-drywall": [[5.42, 5.87], [9.75, 5.87], 0.34, []],
    "gerencia-administracion-south": [[0.08, 2.8], [3.65, 2.8], 2.4, []],
    "gerencia-administracion-east": [[3.65, 2.8], [3.65, 5.65], 2.4, [["door-gerencia-administracion", 0.12, 1.02]]],
    "jefe-tesoreria-east": [[2.55, 0.08], [2.55, 2.8], 2.4, [["door-jefe-tesoreria", 1.7, 2.66]]],
    "contabilidad-jefe-ti-divider": [[10.6, 0.08], [10.6, 5.34], 2.4, []],
    "south-ti-north-wall": [[10.6, 2.7], [18.36, 2.7], 2.4, [["door-jefe-ti", 0.06, 0.98], ["door-oficina-ti", 6.73, 7.76]]],
    "jefe-ti-oficina-ti-divider": [[13, 0.08], [13, 2.7], 2.4, [["door-jefe-ti-oficina-ti", 0.95, 1.81]]],
    "gerente-tecnico-east-west": [[18.36, 2.1], [18.36, 4.8], 2.4, [["door-gerente-tecnico-east", 1.65, 2.7]]],
    "gerente-tecnico-east-south": [[18.36, 2.1], [21.43, 2.1], 2.4, []],
    "negocios-internacionales-south": [[18.36, 4.8], [21.43, 4.8], 1.6, []],
    "negocios-internacionales-west": [[18.36, 4.8], [18.36, 5.89], 1.6, []],
    "sales-chief-south": [[18.36, 6.85], [21.43, 6.85], 1.6, []],
    "sales-chief-west": [[18.36, 6.85], [18.36, 7.98], 1.6, []],
    "gestion-calidad-south": [[18.36, 8.94], [21.43, 8.94], 1.6, []],
    "gestion-calidad-west": [[18.36, 8.94], [18.36, 10.05], 1.6, []],
    "gestion-calidad-north": [[18.36, 10.96], [19.42, 10.96], 2.4, []],
  };
  const t3dPartitionIds = new Set(Object.keys(t3dExpectedPartitions));
  check(typeof interior.scope === "string" && ["T3A", "T3B", "T3C", "T3D", "central pool", "meeting room", "adjacent office", "east core", "south offices", "excludes furniture"].every((item) => interior.scope.includes(item)),
    "cumulative interior scope must identify T3A/T3B/T3C/T3D south offices and exclude furniture");
  const inZone = (point, zone = t3aZone) => point[0] >= zone.minX && point[0] <= zone.maxX && point[1] >= zone.minY && point[1] <= zone.maxY;
  const validPolygon = (polygon, zone = t3aZone) => Array.isArray(polygon) && polygon.length >= 4 && polygon.every(pair) && polygon.every((point) => inZone(point, zone));
  const approximateSource = (source) => typeof source === "string"
    && source.includes("scale-traced") && source.includes("approximate/non-constructive");
  check(finite(interior.wallHeight_m) && interior.wallHeight_m >= register.constraints.minimum_ceiling_clearance_m,
    "interior partitions must be at least 2.40 m high");
  check(finite(interior.wallThickness_m) && interior.wallThickness_m > 0,
    "interior partition thickness must be a positive finite metre value");
  check(approximateSource(interior.wallThicknessSource), "interior partition thickness must be labelled approximate and non-constructive");

  const roomIds = new Set();
  check(Array.isArray(interior.rooms), "T3A must list room boundaries");
  for (const room of Array.isArray(interior.rooms) ? interior.rooms : []) {
    check(typeof room?.id === "string" && !roomIds.has(room.id), "T3A room ids must be unique strings");
    if (typeof room?.id === "string") roomIds.add(room.id);
    check(typeof room?.name === "string" && room.name.length > 0, `${room?.id ?? "room"} must have a display name`);
    const roomZone = expectedRooms.has(room?.id) ? t3aZone : t3bRoomIds.has(room?.id) ? t3bRoomZone
      : t3dRoomIds.has(room?.id) ? t3dZone : t3cRoomZone;
    check(validPolygon(room?.polygon_m, roomZone), `${room?.id ?? "room"} must have a finite room boundary inside its T3A/T3B/T3C trace zone`);
    check(approximateSource(room?.source), `${room?.id ?? "room"} must label raster-traced boundaries approximate and non-constructive`);
  }
  check(expectedRooms.size === 8 && [...expectedRooms].every((id) => roomIds.has(id)),
    "T3A must retain exactly its eight existing room ids");
  check(roomIds.size === expectedRooms.size + t3bRoomIds.size + t3cRoomIds.size + t3dRoomIds.size
    && [...t3bRoomIds].every((id) => roomIds.has(id)) && [...t3cRoomIds].every((id) => roomIds.has(id))
    && [...t3dRoomIds].every((id) => roomIds.has(id)),
  "T3B/T3C must register all central rooms and the six east-core room/service-space ids");

  const partitionIds = new Set();
  let interiorDoorCount = 0;
  check(Array.isArray(interior.partitions) && interior.partitions.length > 0, "T3A must contain measured interior partitions");
  for (const partition of Array.isArray(interior.partitions) ? interior.partitions : []) {
    check(typeof partition?.id === "string" && !partitionIds.has(partition.id), "interior partition ids must be unique strings");
    if (typeof partition?.id === "string") partitionIds.add(partition.id);
    const partitionZone = t3aPartitionIds.has(partition?.id) ? t3aZone
      : t3bPartitionIds.has(partition?.id) ? t3bRoomZone : t3dPartitionIds.has(partition?.id) ? t3dZone : t3cRoomZone;
    check(pair(partition?.start_m) && pair(partition?.end_m) && inZone(partition.start_m, partitionZone) && inZone(partition.end_m, partitionZone)
      && Math.hypot(partition.end_m[0] - partition.start_m[0], partition.end_m[1] - partition.start_m[1]) > 0,
    `${partition?.id ?? "partition"} must have a non-zero finite centerline inside its T3A/T3B/T3C trace zone`);
    check(finite(partition?.thickness_m) && partition.thickness_m > 0,
      `${partition?.id ?? "partition"} must have a positive finite thickness`);
    const partialWall = partition?.annotatedHeight_m !== undefined;
    check(finite(partition?.height_m) && (partialWall
      ? partition.height_m === partition.annotatedHeight_m && partition.height_m > 0 && partition.height_m < 2.4
      : partition.height_m >= register.constraints.minimum_ceiling_clearance_m),
    `${partition?.id ?? "partition"} must be at least 2.40 m high unless it matches an annotated partial height`);
    check(approximateSource(partition?.source), `${partition?.id ?? "partition"} must label raster-traced dimensions approximate and non-constructive`);
    const length = pair(partition?.start_m) && pair(partition?.end_m)
      ? Math.hypot(partition.end_m[0] - partition.start_m[0], partition.end_m[1] - partition.start_m[1]) : 0;
    const openings = Array.isArray(partition?.openings) ? [...partition.openings].sort((a, b) => a.from_m - b.from_m) : [];
    check(Array.isArray(partition?.openings), `${partition?.id ?? "partition"} must list door/opening gaps`);
    let cursor = 0;
    for (const opening of openings) {
      check(typeof opening?.name === "string" && !names.has(opening.name), "interior openings must have unique names");
      if (typeof opening?.name === "string") names.add(opening.name);
      check(["door", "opening"].includes(opening?.kind), `${opening?.name ?? "opening"} must be a door or circulation opening`);
      check(finite(opening?.from_m) && finite(opening?.to_m) && opening.from_m >= cursor
        && opening.to_m > opening.from_m && opening.to_m <= length + 0.01,
      `${opening?.name ?? "opening"} must be a valid non-overlapping partition interval`);
      check(approximateSource(opening?.source), `${opening?.name ?? "opening"} must label its raster-traced width approximate and non-constructive`);
      if (opening?.kind === "door" && t3aPartitionIds.has(partition?.id)) interiorDoorCount += 1;
      if (finite(opening?.to_m)) cursor = opening.to_m;
    }
  }
  check(t3aPartitionIds.size === 18 && [...t3aPartitionIds].every((id) => partitionIds.has(id)),
    "T3A must retain its existing walls, split the excluded west-office spine span, and add the two S.H. Gerencia step segments");
  check(interiorDoorCount >= 8, "T3A must retain doors from rooms to connecting circulation");
  check(partitionIds.size === t3aPartitionIds.size + t3bPartitionIds.size + t3cPartitionIds.size + t3dPartitionIds.size
    && [...t3bPartitionIds].every((id) => partitionIds.has(id)) && [...t3cPartitionIds].every((id) => partitionIds.has(id))
    && [...t3dPartitionIds].every((id) => partitionIds.has(id)),
  "T3B/T3C/T3D must add only the central, east-core, and south-office partitions");
  for (const [id, [start, end, height, doors]] of Object.entries(t3dExpectedPartitions)) {
    const wall = interior.partitions?.find((partition) => partition?.id === id);
    check(JSON.stringify(wall?.start_m) === JSON.stringify(start) && JSON.stringify(wall?.end_m) === JSON.stringify(end)
      && wall?.height_m === height && wall?.thickness_m === 0.12
      && (height < 2.4 ? wall?.annotatedHeight_m === height : wall?.annotatedHeight_m === undefined)
      && JSON.stringify((wall?.openings ?? []).map((opening) => [opening?.name, opening?.from_m, opening?.to_m])) === JSON.stringify(doors)
      && (wall?.openings ?? []).every((opening) => opening?.kind === "door"),
    `T3D ${id} must match its PDF vector trace, height, and door gaps`);
  }
  const southCirculation = (interior.circulation ?? []).filter((route) => ["south-west-access", "south-pasadizo"].includes(route?.id));
  check(southCirculation.length === 2 && southCirculation.every((route) => validPolygon(route.polygon_m, t3dZone) && approximateSource(route.source)),
    "T3D must add the south-west access and south pasadizo circulation routes");
  check(!partitionIds.has("elevator-core-divider")
    && ["elevator-core-west", "elevator-core-east", "elevator-core-south", "elevator-core-north"].every((id) => partitionIds.has(id)),
  "T3C elevator core must omit its interior divider while retaining all four exterior enclosure walls");
  check(Array.isArray(interior.partitions) && interior.partitions.length === 67,
    "cumulative T3A/T3B/T3C/T3D interior must contain 67 partitions after T3R exclusions and the shared crossed-shaft south wall");

  const partitionById = (id) => interior.partitions.find((partition) => partition?.id === id);
  const openingSpans = (partition) => (Array.isArray(partition?.openings) ? partition.openings : [])
    .map((opening) => [opening?.name, opening?.kind, opening?.from_m, opening?.to_m]);
  const archiveWest = partitionById("archivo-general-west");
  check(JSON.stringify(archiveWest?.start_m) === JSON.stringify([19.8, 21.0])
    && JSON.stringify(archiveWest?.end_m) === JSON.stringify([19.8, 22.1])
    && JSON.stringify(openingSpans(archiveWest)) === JSON.stringify([["door-archivo-general-west", "door", 0, 0.8]]),
  "T3R must exclude the user-rejected archive west span and preserve its existing door at v=21.00–21.80 m");
  const northSouth = partitionById("north-room-south-wall");
  check(JSON.stringify(northSouth?.start_m) === JSON.stringify([6.3, 18.45])
    && JSON.stringify(northSouth?.end_m) === JSON.stringify([16.1, 18.45])
    && JSON.stringify(openingSpans(northSouth)) === JSON.stringify([
      ["door-director-west", "door", 0, 0.8], ["door-director-center", "door", 3.5, 4.3],
      ["door-recursos-humanos", "door", 7.4, 8.2],
    ]),
  "T3R must exclude the user-rejected north-room south span and preserve all existing door coordinates");
  const spineLower = partitionById("west-office-spine-lower");
  const spineUpper = partitionById("west-office-spine-upper");
  check(!partitionIds.has("west-office-spine")
    && JSON.stringify(spineLower?.start_m) === JSON.stringify([3.65, 5.65])
    && JSON.stringify(spineLower?.end_m) === JSON.stringify([3.65, 6.95])
    && JSON.stringify(openingSpans(spineLower)) === JSON.stringify([["door-gerente-tecnico", "door", 0.5, 1.3]])
    && JSON.stringify(spineUpper?.start_m) === JSON.stringify([3.65, 9.55])
    && JSON.stringify(spineUpper?.end_m) === JSON.stringify([3.65, 17.01])
    && JSON.stringify(openingSpans(spineUpper)) === JSON.stringify([
      ["door-gerente-operaciones", "door", 0, 0.8], ["door-gerente-comercial", "door", 2.6, 3.4],
      ["door-gerente-excelencia", "door", 5.65, 6.45],
    ]),
  "T3R must remove the excluded west-office spine span and preserve all four existing door coordinates");

  const boundsOf = (polygon) => {
    const points = Array.isArray(polygon) ? polygon.filter(pair) : [];
    return points.length ? {
      minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)),
      minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y)),
    } : null;
  };
  const positiveAreaOverlap = (polygon, rectangle) => {
    const bounds = boundsOf(rectangle);
    if (!Array.isArray(polygon) || !bounds) return false;
    let clipped = polygon;
    for (const [axis, boundary, keepGreater] of [
      [0, bounds.minX, true], [0, bounds.maxX, false], [1, bounds.minY, true], [1, bounds.maxY, false],
    ]) {
      const output = [];
      if (clipped.length) {
        let previous = clipped.at(-1);
        for (const current of clipped) {
          const previousInside = keepGreater ? previous[axis] >= boundary : previous[axis] <= boundary;
          const currentInside = keepGreater ? current[axis] >= boundary : current[axis] <= boundary;
          if (previousInside !== currentInside) {
            const ratio = (boundary - previous[axis]) / (current[axis] - previous[axis]);
            output.push(previous.map((value, index) => value + ratio * (current[index] - value)));
          }
          if (currentInside) output.push(current);
          previous = current;
        }
      }
      clipped = output;
    }
    const twiceArea = clipped.reduce((sum, [x, y], index) => {
      const [nextX, nextY] = clipped[(index + 1) % clipped.length] ?? [x, y];
      return sum + x * nextY - nextX * y;
    }, 0);
    return Math.abs(twiceArea) > 1e-8;
  };
  const sameBounds = (actual, expected) => actual && close(actual.minX, expected.minX)
    && close(actual.maxX, expected.maxX) && close(actual.minY, expected.minY) && close(actual.maxY, expected.maxY);
  const boundsTouch = (first, second, tolerance = 0.01) => {
    const a = boundsOf(first);
    const b = boundsOf(second);
    return a && b && a.minX <= b.maxX + tolerance && b.minX <= a.maxX + tolerance
      && a.minY <= b.maxY + tolerance && b.minY <= a.maxY + tolerance;
  };
  const clearsRooms = (polygon, rooms) => rooms.every((room) => !positiveAreaOverlap(polygon, room?.polygon_m));
  const reachesSeam = (polygon, seamY) => {
    const bounds = boundsOf(polygon);
    return bounds && Math.abs(bounds.minY - seamY) <= 0.05;
  };
  const circulationIds = new Set();
  check(Array.isArray(interior.circulation) && interior.circulation.length >= 3,
    "T3A must describe circulation through the west/north connecting corridors");
  for (const path of Array.isArray(interior.circulation) ? interior.circulation : []) {
    check(typeof path?.id === "string" && !circulationIds.has(path.id), "circulation ids must be unique strings");
    if (typeof path?.id === "string") circulationIds.add(path.id);
    const t3bCorridor = path?.id === "north-pasadizo-t3b-extension";
    const t3cCorridor = ["east-pasadizo-connector", "stair-core-approach"].includes(path?.id);
    const pathZone = t3bCorridor ? { minX: 16.1, maxX: 18.3, minY: 17.05, maxY: 18.45 }
      : t3cCorridor ? { minX: 18.0, maxX: 19.79, minY: 11.0, maxY: 22.1 }
        : ["south-west-access", "south-pasadizo"].includes(path?.id) ? t3dZone : t3aZone;
    check(validPolygon(path?.polygon_m, pathZone), `${path?.id ?? "circulation"} must have a finite corridor boundary inside its traced west/north zone`);
    check(approximateSource(path?.source), `${path?.id ?? "circulation"} must label raster-traced bounds approximate and non-constructive`);
  }
  for (const path of Array.isArray(interior.circulation) ? interior.circulation : []) {
    const roomsToClear = path?.id === "stair-core-approach"
      ? (interior.rooms ?? []).filter((room) => room?.id !== "escalera") : interior.rooms;
    check(clearsRooms(path?.polygon_m, Array.isArray(roomsToClear) ? roomsToClear : []),
      `${path?.id ?? "circulation"} must not overlap an enclosed room`);
  }
  check(["west-office-access", "northwest-connector", "north-pasadizo", "central-north-connector", "north-pasadizo-t3b-extension", "east-pasadizo-connector", "stair-core-approach"].every((id) => circulationIds.has(id)),
    "T3B/T3C circulation must retain existing west/north routes and connect the east core to the row-4 seam");

  const office = interior.rooms.find((room) => room?.id === "oficina");
  const meeting = interior.rooms.find((room) => room?.id === "zona-de-reuniones");
  const officeBounds = boundsOf(office?.polygon_m);
  const meetingBounds = boundsOf(meeting?.polygon_m);
  check(office?.name === "OFICINA" && sameBounds(officeBounds, { minX: 10.6, maxX: 12.55, minY: 13.35, maxY: 17.05 }),
    "T3B adjacent OFICINA must match its approximate A=0 plan-frame trace");
  check(meeting?.name === "ZONA DE REUNIONES" && sameBounds(meetingBounds, { minX: 12.55, maxX: 18.0, minY: 13.35, maxY: 17.05 }),
    "T3R-MRE meeting room must use the approximate u≈18.0 m east bound");
  const meetingWestWall = interior.partitions.find((partition) => partition?.id === "central-office-meeting-divider");
  const meetingSouthWall = interior.partitions.find((partition) => partition?.id === "meeting-room-south");
  const meetingEastWall = interior.partitions.find((partition) => partition?.id === "meeting-room-east");
  const meetingNorthBoundary = interior.partitions.find((partition) => partition?.id === "meeting-room-north-extension");
  const meetingNorthDoorEvidence = meetingNorthBoundary?.openings?.find((opening) => opening?.name === "door-zona-reuniones-north-pasadizo");
  const meetingWalls = [meetingWestWall, meetingSouthWall, meetingEastWall, meetingNorthBoundary];
  const meetingConnector = interior.circulation.find((path) => path?.id === "east-pasadizo-connector");
  const meetingConnectorBounds = boundsOf(meetingConnector?.polygon_m);
  const meetingBoundsEstimate = register.t3b_central?.trace_estimates_approximate_m?.meeting_bounds;
  const meetingConnectorEstimate = register.t3c_east?.trace_estimates_approximate_m?.east_core_circulation_bounds;
  const meetingWallGeometryMatches = JSON.stringify(meetingWestWall?.start_m) === JSON.stringify([12.55, 13.35])
    && JSON.stringify(meetingWestWall?.end_m) === JSON.stringify([12.55, 17.05])
    && JSON.stringify(meetingSouthWall?.start_m) === JSON.stringify([12.55, 13.35])
    && JSON.stringify(meetingSouthWall?.end_m) === JSON.stringify([18.0, 13.35])
    && JSON.stringify(meetingEastWall?.start_m) === JSON.stringify([18.0, 13.35])
    && JSON.stringify(meetingEastWall?.end_m) === JSON.stringify([18.0, 17.05])
    && JSON.stringify(meetingNorthBoundary?.start_m) === JSON.stringify([16.1, 17.05])
    && JSON.stringify(meetingNorthBoundary?.end_m) === JSON.stringify([18.0, 17.05])
    && meetingWalls.every((wall) => wall?.thickness_m === 0.12 && wall?.height_m === 2.4
      && approximateSource(wall?.source) && wall.source.includes("translucent acrylic partition"))
    && meetingSouthWall?.openings?.length === 0 && meetingEastWall?.openings?.length === 0
    && meetingNorthBoundary?.openings?.length === 1
    && meetingNorthDoorEvidence?.kind === "door"
    && meetingNorthDoorEvidence?.from_m === 0.7 && meetingNorthDoorEvidence?.to_m === 1.699
    && close(meetingNorthBoundary.start_m[0] + meetingNorthDoorEvidence.from_m, 16.8)
    && close(meetingNorthBoundary.start_m[0] + meetingNorthDoorEvidence.to_m, 17.8)
    && JSON.stringify(register.t3b_central?.trace_estimates_approximate_m?.meeting_north_door_x_m) === JSON.stringify([16.8, 17.8])
    && register.t3b_central?.trace_estimates_approximate_m?.door_widths_m?.meeting_north_pasadizo === 1.0
    && JSON.stringify(meetingBoundsEstimate?.min_m) === JSON.stringify([12.55, 13.35])
    && JSON.stringify(meetingBoundsEstimate?.max_m) === JSON.stringify([18.0, 17.05]);
  check(meetingWallGeometryMatches,
    "T3R-MRE meeting enclosure must meet at u≈18.0 m with approximate acrylic-partition provenance and unchanged north-door evidence");
  const previousMeetingConnector = [[17.8, 11.1], [19.36, 11.1], [19.36, 22.1], [17.8, 22.1]];
  const meetingCorridorAdjoinsWithoutOverlap = meetingBounds?.maxX === 18.0
    && sameBounds(meetingConnectorBounds, { minX: 18.0, maxX: 19.36, minY: 11.1, maxY: 22.1 })
    && meetingBounds?.maxX === meetingConnectorBounds?.minX
    && !positiveAreaOverlap(meeting?.polygon_m, meetingConnector?.polygon_m)
    && positiveAreaOverlap(meeting?.polygon_m, previousMeetingConnector)
    && JSON.stringify(meetingConnectorEstimate?.min_m) === JSON.stringify([18.0, 11.1])
    && JSON.stringify(meetingConnectorEstimate?.max_m) === JSON.stringify([19.36, 22.1]);
  check(meetingCorridorAdjoinsWithoutOverlap,
    "T3R-MRE east connector must abut the meeting-room east bound at u≈18.0 m with no region overlap");
  if (meetingWallGeometryMatches && meetingCorridorAdjoinsWithoutOverlap) {
    console.log("PASS: T3R-MRE enclosure and east connector meet at approximate u=18.0 m with no room-region overlap; north-door evidence is preserved.");
  }
  const centralOfficeSouth = interior.partitions.find((partition) => partition?.id === "central-office-south");
  const centralOfficeSouthEstimate = register.t3b_central?.trace_estimates_approximate_m?.central_office_south_wall;
  check(JSON.stringify(centralOfficeSouth?.start_m) === JSON.stringify([11.45, 13.35])
    && JSON.stringify(centralOfficeSouth?.end_m) === JSON.stringify([12.55, 13.35])
    && centralOfficeSouth?.height_m === 1.6
    && Array.isArray(centralOfficeSouth?.openings) && centralOfficeSouth.openings.length === 0
    && approximateSource(centralOfficeSouth?.source)
    && centralOfficeSouth?.source === centralOfficeSouthEstimate?.source,
  "T3R-CW-S must model only the approximate solid u=11.45–12.55 m segment at v=13.35 m, h=1.60 m, with no openings and matching measurement provenance");
  const marketingRoom = interior.rooms.find((room) => room?.id === "gerente-marketing-internacional");
  const hrChiefRoom = interior.rooms.find((room) => room?.id === "jefe-recursos-humanos");
  const marketingBounds = boundsOf(marketingRoom?.polygon_m);
  const hrChiefBounds = boundsOf(hrChiefRoom?.polygon_m);
  check(marketingRoom?.name === "GERENTE DE MARKETING INTERNACIONAL"
    && sameBounds(marketingBounds, { minX: 4.8, maxX: 7.7, minY: 14.25, maxY: 17.05 }),
  "T3B must include the approximate enclosed Marketing International manager room");
  check(hrChiefRoom?.name === "JEFE DE RR.HH."
    && sameBounds(hrChiefBounds, { minX: 7.7, maxX: 10.6, minY: 14.25, maxY: 17.05 }),
  "T3B must include the approximate enclosed HR chief room");
  check(officeBounds?.maxX === meetingBounds?.minX && officeBounds?.minY === meetingBounds?.minY
    && officeBounds?.maxY === meetingBounds?.maxY, "T3B office and meeting-room partitions must be adjacent without a coordinate-frame gap");
  check(marketingBounds?.maxX === hrChiefBounds?.minX && hrChiefBounds?.maxX === officeBounds?.minX
    && marketingBounds?.maxY === hrChiefBounds?.maxY && hrChiefBounds?.maxY === officeBounds?.maxY,
  "T3B north-edge rooms must abut each other and the adjacent office without gaps");

  const frame = register.t3b_central?.coordinate_frame;
  check(frame?.origin === plan.origin && frame?.origin === "southwest outside corner"
    && register.t3b_central?.map_grid_relative_x_to_plan_offset_m === 0
    && frame?.grid_A_x_approx_m === 0 && frame?.grid_F_x_approx_m === 22.85
    && Math.min(...xs) === -0.5
    && register.visual_evidence_approximate?.west_offset_from_A?.direction === "west"
    && register.visual_evidence_approximate?.west_offset_x_m?.[0] === -0.5,
  "T3B trace must use A=0 and F=22.85 while the west exterior spur alone reaches x≈−0.50 m");

  const northEdge = interior.partitions.find((partition) => partition?.id === "north-pasadizo-south-edge");
  const northOpenings = new Map((northEdge?.openings ?? []).map((opening) => [opening.name, opening]));
  const marketingWest = interior.partitions.find((partition) => partition?.id === "marketing-internacional-west");
  const marketingSouth = interior.partitions.find((partition) => partition?.id === "marketing-internacional-south");
  const exactDoorInterval = (partition, opening, intervalAxis, expected) => {
    const wallAxis = 1 - intervalAxis;
    return partition?.start_m?.[wallAxis] === partition?.end_m?.[wallAxis]
      && opening?.kind === "door"
      && partition.start_m[intervalAxis] + opening.from_m === expected[0]
      && partition.start_m[intervalAxis] + opening.to_m === expected[1]
      && close(opening.to_m - opening.from_m, expected[1] - expected[0])
      && approximateSource(opening.source);
  };
  const marketingWestDoor = marketingWest?.openings?.find((opening) => opening?.name === "door-marketing-internacional-west");
  const marketingDoorAbsoluteY = [marketingWest?.start_m?.[1] + marketingWestDoor?.from_m, marketingWest?.start_m?.[1] + marketingWestDoor?.to_m];
  const marketingDoorCount = interior.partitions.flatMap((partition) => partition?.openings ?? [])
    .filter((opening) => opening?.name === "door-marketing-internacional-west").length;
  const previousMarketingDoor = { ...marketingWestDoor, from_m: 1.2, to_m: 2.0 };
  check(marketingWest?.start_m?.[0] === 4.8 && marketingWest?.end_m?.[0] === 4.8
    && marketingWestDoor?.from_m === 0.05 && marketingWestDoor?.to_m === 0.95
    && exactDoorInterval(marketingWest, marketingWestDoor, 1, [14.3, 15.2])
    && marketingDoorAbsoluteY[0] === 14.3 && marketingDoorAbsoluteY[1] === 15.2
    && marketingDoorCount === 1 && marketingSouth?.openings?.length === 0
    && !northOpenings.has("opening-pasadizo-west"),
  "T3A Marketing International must have one approximate 0.90 m west-wall door at y=14.30–15.20, with no duplicate gap");
  check(!exactDoorInterval(marketingWest, previousMarketingDoor, 1, [14.3, 15.2]),
    "T3A Marketing must reject the previous y=15.45–16.25 door placement");
  const jefeSouth = interior.partitions.find((partition) => partition?.id === "jefe-rrhh-south");
  const jefeNorthDoor = northOpenings.get("door-jefe-rrhh-north");
  const jefeDoorAbsoluteX = [northEdge?.start_m?.[0] + jefeNorthDoor?.from_m, northEdge?.start_m?.[0] + jefeNorthDoor?.to_m];
  const jefeDoorCount = interior.partitions.flatMap((partition) => partition?.openings ?? [])
    .filter((opening) => opening?.name === "door-jefe-rrhh-north").length;
  check(northEdge?.start_m?.[0] === 4.8 && northEdge?.start_m?.[1] === 17.05
    && jefeNorthDoor?.from_m === 3.0 && jefeNorthDoor?.to_m === 3.9
    && exactDoorInterval(northEdge, jefeNorthDoor, 0, [7.8, 8.7])
    && jefeDoorAbsoluteX[0] === 7.8 && jefeDoorAbsoluteX[1] === 8.7
    && hrChiefBounds?.minX === 7.7 && jefeDoorAbsoluteX[0] > hrChiefBounds.minX
    && jefeDoorAbsoluteX[1] <= hrChiefBounds.maxX && jefeDoorCount === 1
    && jefeSouth?.openings?.length === 0 && !northOpenings.has("opening-pasadizo-center"),
  "T3A JEFE DE RR.HH. must have one approximate 0.90 m north-wall door at x=7.80–8.70, connected beside the divider without duplicates");
  const roomDivider = interior.partitions.find((partition) => partition?.id === "marketing-jefe-rrhh-divider");
  check(roomDivider?.start_m?.[0] === 7.7 && roomDivider?.end_m?.[0] === 7.7
    && marketingBounds?.maxX === 7.7 && hrChiefBounds?.minX === 7.7,
  "T3A Marketing/HR shared divider and abutting room bounds must be near x=7.7 m");
  const operations = boundsOf(interior.rooms.find((room) => room?.id === "gerente-operaciones-proyectos")?.polygon_m);
  const technical = boundsOf(interior.rooms.find((room) => room?.id === "gerente-tecnico")?.polygon_m);
  const operationsTechnicalDivider = interior.partitions.find((partition) => partition?.id === "west-technical-north");
  check(operationsTechnicalDivider?.start_m?.[1] === 8.1 && operationsTechnicalDivider?.end_m?.[1] === 8.1
    && operations?.minY === 8.1 && technical?.maxY === 8.1,
  "T3A Operations/Technical shared divider and abutting room bounds must be near y=8.1 m");
  const westExcellenceNorth = interior.partitions.filter((partition) => partition?.id === "west-excellence-north");
  const westExcellenceReturn = westExcellenceNorth[0];
  check(westExcellenceNorth.length === 1
    && pair(westExcellenceReturn?.start_m) && pair(westExcellenceReturn?.end_m)
    && close(Math.min(westExcellenceReturn.start_m[0], westExcellenceReturn.end_m[0]), -0.35, 0.1)
    && close(Math.max(westExcellenceReturn.start_m[0], westExcellenceReturn.end_m[0]), 0, 0.1)
    && close(westExcellenceReturn.start_m[1], 16.9, 0.1)
    && close(westExcellenceReturn.end_m[1], 16.9, 0.1)
    && Array.isArray(westExcellenceReturn?.openings) && westExcellenceReturn.openings.length === 0
    && approximateSource(westExcellenceReturn?.source),
  "T3A west-excellence-north must be one approximate, non-constructive solid west return at u≈−0.35…0.0, v≈16.9");
  const restroomRoom = interior.rooms.find((room) => room?.id === "sh-gerencia");
  const restroom = boundsOf(restroomRoom?.polygon_m);
  const restroomSouth = interior.partitions.find((partition) => partition?.id === "west-restroom-south");
  const restroomStep = interior.partitions.find((partition) => partition?.id === "west-restroom-south-step");
  const restroomSouthEast = interior.partitions.find((partition) => partition?.id === "west-restroom-south-east");
  const restroomEast = interior.partitions.find((partition) => partition?.id === "west-restroom-east");
  const restroomStepVertices = [[0.15, 17.65], [1.45, 17.65], [1.45, 17.35], [3.65, 17.35]];
  check(restroom && restroom.minY === 17.35 && restroom.maxY === 18.9
    && restroomStepVertices.every((vertex) => restroomRoom?.polygon_m?.some((point) => point[0] === vertex[0] && point[1] === vertex[1]))
    && JSON.stringify(restroomSouth?.start_m) === JSON.stringify(restroomStepVertices[0])
    && JSON.stringify(restroomSouth?.end_m) === JSON.stringify(restroomStepVertices[1])
    && JSON.stringify(restroomStep?.start_m) === JSON.stringify(restroomStepVertices[1])
    && JSON.stringify(restroomStep?.end_m) === JSON.stringify(restroomStepVertices[2])
    && JSON.stringify(restroomSouthEast?.start_m) === JSON.stringify(restroomStepVertices[2])
    && JSON.stringify(restroomSouthEast?.end_m) === JSON.stringify(restroomStepVertices[3])
    && restroomEast?.start_m?.[0] === 3.65 && restroomEast?.start_m?.[1] === 17.35
    && [restroomSouth, restroomStep, restroomSouthEast].every((partition) => approximateSource(partition?.source)),
  "T3A S.H. Gerencia must preserve the raster-traced solid 0.30 m south-wall step as three connected approximate wall segments");
  const westPasadizoOpening = northOpenings.get("opening-pasadizo-west");
  check(!westPasadizoOpening && !northOpenings.has("opening-pasadizo-center")
    && jefeNorthDoor?.kind === "door" && jefeNorthDoor.from_m === 3.0 && jefeNorthDoor.to_m === 3.9
    && jefeDoorAbsoluteX[0] === 7.8 && jefeDoorAbsoluteX[1] === 8.7,
  "T3B north-pasadizo edge must align only the HR north-wall door at x=7.80–8.70, with no redundant room gaps");
  const officeDoor = northOpenings.get("door-oficina-north-pasadizo");
  check(northEdge?.start_m?.[1] === 17.05 && northEdge?.end_m?.[1] === 17.05
    && officeDoor?.kind === "door" && officeDoor.from_m === 6.75 && officeDoor.to_m === 7.55
    && !northOpenings.has("door-zona-reuniones-north-pasadizo"),
  "T3B north-pasadizo edge must preserve the 0.80 m office door and distinct HR north-wall entry");
  check(!northOpenings.has("opening-pasadizo-east"), "the provisional generic east gap must be replaced by the meeting-room entrance");
  check(close(northEdge?.start_m?.[0] + officeDoor?.from_m, 11.55) && close(northEdge?.start_m?.[0] + officeDoor?.to_m, 12.35),
    "T3B north-office door must remain aligned in the southwest-origin coordinate frame");
  const meetingNorthWall = interior.partitions.find((partition) => partition?.id === "meeting-room-north-extension");
  const meetingNorthDoor = meetingNorthWall?.openings?.find((opening) => opening?.name === "door-zona-reuniones-north-pasadizo");
  check(meetingNorthWall?.start_m?.[0] === 16.1 && meetingNorthWall?.end_m?.[0] === 18.0
    && meetingNorthWall?.start_m?.[1] === 17.05 && meetingNorthWall?.end_m?.[1] === 17.05
    && meetingNorthDoor?.kind === "door" && meetingNorthDoor.from_m === 0.7 && meetingNorthDoor.to_m === 1.699
    && close(meetingNorthWall?.start_m?.[0] + meetingNorthDoor?.from_m, 16.8)
    && close(meetingNorthWall?.start_m?.[0] + meetingNorthDoor?.to_m, 17.8),
  "T3R-MRE north wall must extend to u≈18.0 m while preserving the north door at approximate x=16.8–17.8 m");
  for (const partitionId of ["marketing-internacional-south", "jefe-rrhh-south"]) {
    const partition = interior.partitions.find((item) => item?.id === partitionId);
    check(Array.isArray(partition?.openings) && !partition.openings.some((opening) => opening?.kind === "door"),
      `T3B ${partitionId} must not retain a duplicate south-side door`);
  }

  const zone = (interior.zones ?? []).find((area) => area?.id === "pool-de-oficinas");
  const poolBounds = boundsOf(zone?.polygon_m);
  check(zone?.name === "POOL DE OFICINAS" && zone?.kind === "open-circulation" && zone?.isEnclosed === false
    && Array.isArray(zone?.polygon_m) && zone.polygon_m.length >= 6 && approximateSource(zone?.source),
  "POOL DE OFICINAS must be an irregular, explicitly open circulation zone with approximate source data");
  check(sameBounds(poolBounds, { minX: 4.8, maxX: 18.3, minY: 5.65, maxY: 13.35 })
    && !interior.rooms.some((room) => room?.id === "pool-de-oficinas")
    && !interior.partitions.some((partition) => partition?.id?.includes("pool")),
  "the open pool zone must retain its traced extents without becoming a room or adding pool walls");
  check(["west-office-access", "central-north-connector", "northwest-connector", "north-pasadizo", "east-pasadizo-connector"].every((id) => zone?.connectsTo?.includes(id)),
    "the open pool zone must retain its west route, north route, and explicit east-passage connector");
  const centralConnector = interior.circulation.find((path) => path?.id === "central-north-connector");
  const westOfficeAccess = interior.circulation.find((path) => path?.id === "west-office-access");
  const northwestConnector = interior.circulation.find((path) => path?.id === "northwest-connector");
  const northPasadizo = interior.circulation.find((path) => path?.id === "north-pasadizo");
  const northPasadizoExtension = interior.circulation.find((path) => path?.id === "north-pasadizo-t3b-extension");
  const eastPasadizoConnector = interior.circulation.find((path) => path?.id === "east-pasadizo-connector");
  const centralConnectorBounds = boundsOf(centralConnector?.polygon_m);
  const westOfficeAccessBounds = boundsOf(westOfficeAccess?.polygon_m);
  const northwestConnectorBounds = boundsOf(northwestConnector?.polygon_m);
  const northPasadizoBounds = boundsOf(northPasadizo?.polygon_m);
  const northExtensionBounds = boundsOf(northPasadizoExtension?.polygon_m);
  const eastPasadizoBounds = boundsOf(eastPasadizoConnector?.polygon_m);
  const centerGapStartX = northEdge?.start_m?.[0] + jefeNorthDoor?.from_m;
  const centerGapEndX = northEdge?.start_m?.[0] + jefeNorthDoor?.to_m;
  check(sameBounds(centralConnectorBounds, { minX: 4.8, maxX: 10.6, minY: 13.35, maxY: 14.19 })
    && centralConnectorBounds?.maxY < marketingBounds?.minY && centralConnectorBounds?.maxY < hrChiefBounds?.minY,
  "T3B central connector must meet the pool while remaining south of both enclosed rooms");
  check(sameBounds(northPasadizoBounds, { minX: 4.8, maxX: 16.1, minY: 17.05, maxY: 18.45 })
    && centerGapStartX >= northPasadizoBounds?.minX && centerGapEndX <= northPasadizoBounds?.maxX,
  "T3B north route must preserve the existing north pasadizo and its west/center openings");
  check(sameBounds(northExtensionBounds, { minX: 16.1, maxX: 18.3, minY: 17.05, maxY: 18.45 })
    && sameBounds(eastPasadizoBounds, { minX: 18.0, maxX: 19.36, minY: 11.1, maxY: 22.1 })
    && northPasadizoBounds?.maxX === northExtensionBounds?.minX
    && boundsTouch(northPasadizoExtension?.polygon_m, eastPasadizoConnector?.polygon_m),
  "T3C must replace the overlapping east connector with a continuous west-of-lifts passage through the waiting hall to the row-4 seam");
  check(meetingNorthDoor?.kind === "door"
    && meetingNorthWall?.start_m?.[0] + meetingNorthDoor.from_m >= northExtensionBounds?.minX
    && meetingNorthWall?.start_m?.[0] + meetingNorthDoor.to_m <= northExtensionBounds?.maxX
    && meetingNorthWall?.start_m?.[1] === northExtensionBounds?.minY
    && northExtensionBounds?.maxY > northExtensionBounds?.minY,
  "T3B northeast meeting door must open directly onto the continuous north-pasadizo corridor");
  check(westOfficeAccessBounds?.maxX === centralConnectorBounds?.minX
    && close(centralConnectorBounds?.minY, poolBounds?.maxY)
    && westOfficeAccessBounds?.maxY === northwestConnectorBounds?.minY
    && northwestConnectorBounds?.maxY >= northPasadizoBounds?.minY
    && northwestConnectorBounds?.minX === westOfficeAccessBounds?.minX
    && northwestConnectorBounds?.maxX === westOfficeAccessBounds?.maxX,
  "T3B open pool field must retain a west route around enclosed offices to the north pasadizo");

  const t3cRegister = register.t3c_east;
  const t3cEstimates = t3cRegister?.trace_estimates_approximate_m;
  const waitingHall = (interior.zones ?? []).find((item) => item?.id === "hall-de-espera");
  const waitingHallBounds = boundsOf(waitingHall?.polygon_m);
  const stairApproach = interior.circulation.find((path) => path?.id === "stair-core-approach");
  const stairApproachBounds = boundsOf(stairApproach?.polygon_m);
  const archiveRoom = interior.rooms.find((room) => room?.id === "archivo-general");
  const archiveBounds = boundsOf(archiveRoom?.polygon_m);
  const materialsElevator = interior.rooms.find((room) => room?.id === "ascensor-materiales");
  const personalElevator = interior.rooms.find((room) => room?.id === "ascensor-personal");
  const stairRoom = interior.rooms.find((room) => room?.id === "escalera");
  const ductoRoom = interior.rooms.find((room) => room?.id === "ducto-de-montantes");
  const crossedShaft = interior.rooms.find((room) => room?.id === "service-shaft-crossed");
  const t3cPartitions = interior.partitions.filter((partition) => t3cPartitionIds.has(partition?.id));
  const expectedStairPolygon = [[19.85, 12.45], [22.56, 12.45], [22.56, 17], [19.42, 17], [19.42, 15.65], [19.85, 15.65]];
  const expectedDuctPolygon = [[19.42, 11.14], [21.07, 11.14], [21.07, 11.45], [21.29, 11.45], [21.29, 12.3], [19.42, 12.3]];
  const expectedCrossedShaftPolygon = [[21.56, 11.14], [22.62, 11.14], [22.62, 12.35], [21.56, 12.35]];
  const t3cPartition = (id) => t3cPartitions.find((partition) => partition?.id === id);
  const lineIs = (partition, start, end) => JSON.stringify(partition?.start_m) === JSON.stringify(start)
    && JSON.stringify(partition?.end_m) === JSON.stringify(end);
  const hasStairLandingProfile = (polygon) => JSON.stringify(polygon) === JSON.stringify(expectedStairPolygon);
  const hasDuctSoutheastStep = (polygon) => JSON.stringify(polygon) === JSON.stringify(expectedDuctPolygon);
  const stairWestWall = t3cPartition("stair-enclosure-west");
  const stairDoor = stairWestWall?.openings?.find((opening) => opening?.name === "door-stair-enclosure-west");
  const stairDoorY = [stairWestWall?.start_m?.[1] + stairDoor?.from_m, stairWestWall?.start_m?.[1] + stairDoor?.to_m];
  const stairDoorFitsSegment = (partition, door) => {
    const length = Math.hypot(partition?.end_m?.[0] - partition?.start_m?.[0], partition?.end_m?.[1] - partition?.start_m?.[1]);
    return door?.kind === "door" && finite(door?.from_m) && finite(door?.to_m)
      && door.from_m >= 0 && door.to_m > door.from_m && door.to_m <= length
      && partition?.start_m?.[0] === partition?.end_m?.[0]
      && partition.start_m[1] + door.from_m >= Math.min(partition.start_m[1], partition.end_m[1])
      && partition.start_m[1] + door.to_m <= Math.max(partition.start_m[1], partition.end_m[1]);
  };
  const stairRecessDepth = 17 - 15.65;
  const stairDepth = 17 - 12.45;
  check(hasStairLandingProfile(stairRoom?.polygon_m)
    && sameBounds(boundsOf(stairRoom?.polygon_m), { minX: 19.42, maxX: 22.56, minY: 12.45, maxY: 17 })
    && lineIs(stairWestWall, [19.85, 12.45], [19.85, 15.65])
    && stairDoor?.from_m === 2.3 && stairDoor?.to_m === 3.1
    && close(stairDoorY[0], 14.75) && close(stairDoorY[1], 15.55)
    && stairDoorFitsSegment(stairWestWall, stairDoor)
    && close(stairRecessDepth, 1.35) && stairRecessDepth / stairDepth >= 0.28 && stairRecessDepth / stairDepth <= 0.32
    && lineIs(t3cPartition("stair-enclosure-west-landing-step"), [19.85, 15.65], [19.42, 15.65])
    && !partitionIds.has("stair-enclosure-west-landing")
    && lineIs(t3cPartition("stair-enclosure-south"), [19.85, 12.45], [22.56, 12.45])
    && lineIs(t3cPartition("stair-enclosure-north"), [19.42, 17], [22.56, 17]),
  "T3C stair must retain an approximate 1.35 m/30% recess and keep its west door wholly on one connected wall segment at y=14.75–15.55 m");
  check(hasDuctSoutheastStep(ductoRoom?.polygon_m)
    && sameBounds(boundsOf(ductoRoom?.polygon_m), { minX: 19.42, maxX: 21.29, minY: 11.14, maxY: 12.3 })
    && !partitionIds.has("ducto-de-montantes-west")
    && lineIs(t3cPartition("ducto-de-montantes-south"), [19.42, 11.14], [21.07, 11.14])
    && lineIs(t3cPartition("ducto-de-montantes-south-east-step"), [21.07, 11.14], [21.07, 11.45])
    && lineIs(t3cPartition("ducto-de-montantes-east-step"), [21.07, 11.45], [21.29, 11.45])
    && lineIs(t3cPartition("ducto-de-montantes-east"), [21.29, 11.45], [21.29, 12.3])
    && lineIs(t3cPartition("ducto-de-montantes-north"), [19.42, 12.3], [21.29, 12.3]),
  "T3C Ducto de Montantes must trace the approximate y=11.14–12.30 m bounds with its step on the east/southeast edge");
  const openWallPath = (ids) => {
    const degree = new Map();
    for (const id of ids) {
      const partition = t3cPartition(id);
      for (const point of [partition?.start_m, partition?.end_m]) {
        if (!pair(point)) return false;
        const key = JSON.stringify(point);
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    }
    return degree.size === ids.length + 1 && [...degree.values()].filter((count) => count === 1).length === 2
      && [...degree.values()].every((count) => count === 1 || count === 2);
  };
  const wallFootprint = (partition) => {
    if (!pair(partition?.start_m) || !pair(partition?.end_m) || !finite(partition?.thickness_m)) return [];
    const half = partition.thickness_m / 2;
    const minX = Math.min(partition.start_m[0], partition.end_m[0]) - half;
    const maxX = Math.max(partition.start_m[0], partition.end_m[0]) + half;
    const minY = Math.min(partition.start_m[1], partition.end_m[1]) - half;
    const maxY = Math.max(partition.start_m[1], partition.end_m[1]) + half;
    return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  };
  const stairWallIds = [
    "stair-enclosure-west", "stair-enclosure-west-landing-step", "stair-enclosure-east",
    "stair-enclosure-south", "stair-enclosure-north",
  ];
  const ductWallIds = [
    "ducto-de-montantes-south-east-step", "ducto-de-montantes-east-step", "ducto-de-montantes-east",
    "ducto-de-montantes-south", "ducto-de-montantes-north",
  ];
  const silhouetteWallIds = [...stairWallIds, ...ductWallIds];
  check(openWallPath(stairWallIds) && openWallPath(ductWallIds)
    && silhouetteWallIds.every((id) => !positiveAreaOverlap(wallFootprint(t3cPartition(id)), eastPasadizoConnector?.polygon_m)),
  "T3C stair and duct walls must form open paths at the confirmed west exclusions, outside the west-of-lifts passage");
  check(!positiveAreaOverlap(stairApproach?.polygon_m, [[19.85, 12.45], [22.56, 12.45], [22.56, 17], [19.85, 17]])
    && !positiveAreaOverlap(stairApproach?.polygon_m, [[19.42, 15.65], [19.85, 15.65], [19.85, 17], [19.42, 17]]),
  "T3C stair approach must meet the revised stair without overlapping either stair footprint");
  const ductBounds = boundsOf(ductoRoom?.polygon_m);
  const shaftBounds = boundsOf(crossedShaft?.polygon_m);
  const stairWestWallFootprint = wallFootprint(stairWestWall);
  const ductNorthWallFootprint = wallFootprint(t3cPartition("ducto-de-montantes-north"));
  const stairSouthWallFootprint = wallFootprint(t3cPartition("stair-enclosure-south"));
  const crossedShaftWestWallFootprint = wallFootprint(t3cPartition("crossed-service-shaft-west"));
  const ductEastWallFootprint = wallFootprint(t3cPartition("ducto-de-montantes-east"));
  const ductToShaftBoundsGap = shaftBounds?.minX - ductBounds?.maxX;
  const ductToShaftWallClearance = boundsOf(crossedShaftWestWallFootprint)?.minX - boundsOf(ductEastWallFootprint)?.maxX;
  const stairToDuctWallClearance = boundsOf(stairSouthWallFootprint)?.minY - boundsOf(ductNorthWallFootprint)?.maxY;
  const shaftSouthY = shaftBounds?.minY;
  const row4Y = t3cRegister?.directly_dimensioned_grid_anchors_m?.row_4_y;
  const baseStrip = t3cEstimates?.crossed_service_shaft_south_base_strip;
  const baseStripIndex = plan.floorOutline.findIndex((point) => JSON.stringify(point) === JSON.stringify(baseStrip?.start_m));
  const baseStripEnd = plan.floorOutline[(baseStripIndex + 1) % plan.floorOutline.length];
  const baseStripIsShell = baseStripIndex >= 0 && JSON.stringify(baseStripEnd) === JSON.stringify(baseStrip?.end_m)
    && plan.shell.edges[baseStripIndex]?.name === "east-step";
  const sharedShellBoundaryIsValid = (partitions) => baseStripIsShell
    && baseStrip?.start_m?.[1] === 11.1 && baseStrip?.end_m?.[1] === 11.1
    && Math.min(baseStrip.start_m[0], baseStrip.end_m[0]) <= shaftBounds?.minX
    && Math.max(baseStrip.start_m[0], baseStrip.end_m[0]) >= shaftBounds?.maxX
    && close(shaftSouthY, 11.14) && close(shaftSouthY - baseStrip.start_m[1], 0.04, 0.001)
    && Array.isArray(partitions) && !partitions.some((partition) => partition?.id === "crossed-service-shaft-south");
  const duplicateShaftSouth = {
    id: "crossed-service-shaft-south", start_m: [shaftBounds?.minX, shaftSouthY], end_m: [shaftBounds?.maxX, shaftSouthY],
  };
  const duplicateShaftSouthRejected = !sharedShellBoundaryIsValid([...interior.partitions, duplicateShaftSouth]);
  const withinShaftGapBand = (clearance) => clearance >= 0.1 && clearance <= 0.2;
  const overlappingShaftWall = wallFootprint({ start_m: [21.2, 11.14], end_m: [21.2, 12.35], thickness_m: 0.12 });
  const negativeShaftClearance = boundsOf(overlappingShaftWall)?.minX - boundsOf(ductEastWallFootprint)?.maxX;
  const crossingStairDoor = { ...stairDoor, from_m: 2.9, to_m: 3.25 };
  const targetStairWestSegment = { start_m: [19.85, 12.45], end_m: [19.85, 15.65] };
  const negativeGapDoorCasesRejected = !withinShaftGapBand(0.54) && negativeShaftClearance < 0
    && positiveAreaOverlap(overlappingShaftWall, ductEastWallFootprint)
    && !stairDoorFitsSegment(targetStairWestSegment, crossingStairDoor);
  const eastConnectorWidth = eastPasadizoBounds?.maxX - eastPasadizoBounds?.minX;
  // This is only the approximate plan-region trace: the 0.12 m east wall intrudes 0.06 m, so clear width is not proven.
  const meetsCorridorClearance = (id, width) => width >= 1.5
    || (id === "east-pasadizo-connector" && close(width, 1.36, 0.001));
  check(!partitionIds.has("ducto-de-montantes-west")
    && Math.abs(eastPasadizoBounds?.maxX - 19.36) <= 0.001
    && Math.abs(stairApproachBounds?.maxX - boundsOf(stairWestWallFootprint)?.minX) <= 0.001
    && eastPasadizoBounds?.maxX === stairApproachBounds?.minX
    && meetsCorridorClearance(eastPasadizoConnector?.id, eastConnectorWidth)
    && !meetsCorridorClearance("other-connector", 1.36)
    && !meetsCorridorClearance("east-pasadizo-connector", 1.35)
    && !positiveAreaOverlap(stairApproach?.polygon_m, stairWestWallFootprint),
  "T3C east passage must keep its approximate mapped width and stair-face alignment without restoring the excluded duct west wall");
  check(hasDuctSoutheastStep(ductoRoom?.polygon_m)
    && JSON.stringify(crossedShaft?.polygon_m) === JSON.stringify(expectedCrossedShaftPolygon)
    && lineIs(t3cPartition("crossed-service-shaft-west"), [21.56, 11.14], [21.56, 12.35])
    && lineIs(t3cPartition("crossed-service-shaft-east"), [22.62, 11.14], [22.62, 12.35])
    && lineIs(t3cPartition("crossed-service-shaft-north"), [21.56, 12.35], [22.62, 12.35])
    && close(ductToShaftBoundsGap, 0.27) && withinShaftGapBand(ductToShaftWallClearance)
    && !positiveAreaOverlap(ductoRoom?.polygon_m, crossedShaft?.polygon_m)
    && !positiveAreaOverlap(ductEastWallFootprint, crossedShaftWestWallFootprint)
    && close(ductBounds?.minY, shaftSouthY) && close(shaftSouthY, row4Y)
    && close(stairToDuctWallClearance, 0.03)
    && baseStrip?.status === "approximate" && baseStrip?.line === "solid"
    && baseStrip?.modeled_by === "shell east-step" && sharedShellBoundaryIsValid(interior.partitions)
    && !interior.partitions.some((partition) => partition?.id === "crossed-service-shaft-south-base-strip"),
  "T3C crossed shaft must keep its approximate outline and duct gap while the east-step shell fully supplies its south wall without a duplicate partition");
  check(duplicateShaftSouthRejected,
    "T3C negative case must reject reintroducing the crossed-shaft south partition over the shared shell wall");
  if (sharedShellBoundaryIsValid(interior.partitions)) {
    console.log("PASS: T3C crossed-shaft south boundary is covered by the east-step shell with no duplicate interior partition.");
  }
  if (duplicateShaftSouthRejected) {
    console.log("PASS: T3C negative case rejects a reintroduced crossed-shaft south partition.");
  }
  check(negativeGapDoorCasesRejected,
    "T3C negative cases must reject a too-wide/overlapping shaft gap and a stair door crossing its connected wall-segment end");
  if (negativeGapDoorCasesRejected) console.log("PASS: T3C negative cases reject wide/overlapping shaft gaps and a stair door crossing the wall-segment end.");
  const revertedStair = [[19.69, 12.45], [22.56, 12.45], [22.56, 17], [19.69, 17]];
  const revertedDuct = [[19.42, 11.14], [21.29, 11.14], [21.29, 12.3], [19.42, 12.3]];
  const westNotchDuct = [[19.64, 11.14], [21.29, 11.14], [21.29, 12.3], [19.42, 12.3], [19.42, 11.45], [19.64, 11.45]];
  const negativeSilhouettesRejected = !hasStairLandingProfile(revertedStair)
    && !hasDuctSoutheastStep(revertedDuct) && !hasDuctSoutheastStep(westNotchDuct);
  check(negativeSilhouettesRejected, "T3C negative cases must reject a reverted stair, removed duct step, and west-oriented duct notch");
  if (negativeSilhouettesRejected) console.log("PASS: T3C negative cases reject reverted stair and wrong/removed duct steps.");
  const t3cDoorNames = t3cPartitions.flatMap((partition) => partition?.openings ?? [])
    .map((opening) => opening?.name).sort();
  const expectedT3cDoors = [
    "door-archivo-general-west", "door-ascensor-materiales-west", "door-ascensor-personal-west", "door-stair-enclosure-west",
  ].sort();
  check(JSON.stringify(t3cDoorNames) === JSON.stringify(expectedT3cDoors)
    && t3cPartitions.flatMap((partition) => partition?.openings ?? []).every((opening) => opening.kind === "door"),
  "T3C may record only the visible archive, elevator, and stair door gaps");
  check(waitingHall?.name === "HALL DE ESPERA" && waitingHall?.kind === "open-circulation" && waitingHall?.isEnclosed === false
    && sameBounds(waitingHallBounds, { minX: 16.1, maxX: 19.7, minY: 17.05, maxY: 22.1 }),
  "T3C Hall de Espera must remain an approximate open lobby zone, not an enclosed room");
  check(sameBounds(eastPasadizoBounds, { minX: 18.0, maxX: 19.36, minY: 11.1, maxY: 22.1 })
    && sameBounds(stairApproachBounds, { minX: 19.36, maxX: 19.79, minY: 14.75, maxY: 15.55 })
    && boundsTouch(eastPasadizoConnector?.polygon_m, waitingHall?.polygon_m)
    && boundsTouch(eastPasadizoConnector?.polygon_m, stairApproach?.polygon_m)
    && boundsTouch(stairApproach?.polygon_m, stairRoom?.polygon_m, 0.13)
    && boundsTouch(northPasadizoExtension?.polygon_m, eastPasadizoConnector?.polygon_m)
    && reachesSeam(eastPasadizoConnector?.polygon_m, t3cRegister?.trace_estimates_approximate_m?.east_core_circulation_bounds?.min_m?.[1]),
  "T3C corridor must continuously link meeting/pasadizo, waiting hall, stair frontage, and the approximate row-4 seam");
  check(waitingHallBounds?.maxX < boundsOf(materialsElevator?.polygon_m)?.minX
    && waitingHallBounds?.maxX < boundsOf(personalElevator?.polygon_m)?.minX
    && boundsOf(eastPasadizoConnector?.polygon_m)?.maxX < boundsOf(materialsElevator?.polygon_m)?.minX
    && boundsOf(eastPasadizoConnector?.polygon_m)?.maxX < boundsOf(stairRoom?.polygon_m)?.minX
    && boundsOf(eastPasadizoConnector?.polygon_m)?.maxX < boundsOf(ductoRoom?.polygon_m)?.minX
    && archiveBounds?.minX > waitingHallBounds?.maxX,
  "T3C east passage and lobby must remain outside archive, elevator, stair, duct, and crossed-shaft room footprints");
  check(crossedShaft?.service_space?.symbol === "crossed"
    && crossedShaft?.service_space?.function === "unspecified"
    && !interior.partitions.some((partition) => /beam|vent|ceiling/i.test(partition?.id ?? ""))
    && t3cRegister?.non_wall_annotations?.some((note) => note.includes("dashed") && note.includes("not wall")),
  "T3C crossed shaft must be generic service-space metadata; dashed beam/ventilation annotations are not walls");
  const archiveOverlapFixture = [[19.75, 20.7], [20.2, 20.7], [20.2, 21.2], [19.75, 21.2]];
  const ductShaftOverlapFixture = [[21.8, 11.2], [22.1, 11.2], [22.1, 11.5], [21.8, 11.5]];
  const shortRouteFixture = [[17.8, 11.5], [19.36, 11.5], [19.36, 20.5], [17.8, 20.5]];
  check(!clearsRooms(archiveOverlapFixture, [archiveRoom])
    && !clearsRooms(ductShaftOverlapFixture, [crossedShaft])
    && !reachesSeam(shortRouteFixture, t3cRegister?.trace_estimates_approximate_m?.east_core_circulation_bounds?.min_m?.[1]),
  "T3C negative cases must reject archive/shaft overlap and a route stopping short of the seam");
  if (t3cRoomIds.size && t3cPartitionIds.size) console.log("PASS: T3C negative overlap and short-route cases rejected.");
}

const checkpointSafetyTest = String.raw`
import os
import runpy
import stat
import sys
import types
from pathlib import Path

sys.dont_write_bytecode = True
for name in ("bpy", "bmesh"):
    sys.modules[name] = types.ModuleType(name)
mathutils = types.ModuleType("mathutils")
mathutils.Matrix = object
mathutils.Vector = object
sys.modules["mathutils"] = mathutils
namespace = runpy.run_path(sys.argv[1], run_name="floor4_checkpoint_safety_test")
required = (
    "_checkpoint_paths", "_checkpoint_dir_fd_supported", "_checkpoint_path_is_reparse",
    "_open_directory_chain", "_open_checkpoint_directory", "_checkpoint_entry_exists", "_publish_checkpoint_file",
    "_cleanup_checkpoint_temp",
)
missing = [name for name in required if name not in namespace]
assert not missing, f"missing checkpoint safety helpers: {missing}"

root = Path("/virtual-office-safety-root").resolve()
directory, glb, blend = namespace["_checkpoint_paths"](root, "01-shell")
assert directory == root / "assets/office-floor4/checkpoints"
assert glb == directory / "01-shell.glb" and blend == directory / "01-shell.blend"
for path in (glb, blend):
    assert os.path.commonpath((str(root), str(path.resolve()))) == str(root), path
for unsafe in ("../outside", "nested/01-shell", "/tmp/escaped", "01.shell", "a" * 65):
    try:
        namespace["_checkpoint_paths"](root, unsafe)
    except ValueError:
        pass
    else:
        raise AssertionError(f"checkpoint traversal/name accepted: {unsafe!r}")
print("PASS: checkpoint paths stay under the fixed repository root and reject traversal names.")

original_lstat = os.lstat
for mode, attributes, label in (
    (stat.S_IFLNK, 0, "symlink"),
    (stat.S_IFDIR, 0x400, "junction/reparse point"),
):
    target_component = root / "assets"
    def fake_lstat(path, *args, **kwargs):
        if Path(path) == target_component:
            return types.SimpleNamespace(st_mode=mode, st_file_attributes=attributes)
        return original_lstat(path, *args, **kwargs)
    os.lstat = fake_lstat
    try:
        try:
            namespace["_checkpoint_paths"](root, "01-shell")
        except ValueError:
            pass
        else:
            raise AssertionError(f"{label} checkpoint parent accepted")
    finally:
        os.lstat = original_lstat
assert namespace["_checkpoint_path_is_reparse"]
print("PASS: existing symlink and Windows reparse/junction checkpoint parents are rejected.")

open_calls = []
def refuse_symlink(path, flags, *args, **kwargs):
    open_calls.append((path, flags, kwargs))
    if path == "office-safety-root":
        raise OSError("simulated symlink component")
    return 99
original_open, original_close = os.open, os.close
original_dir_fd_support = os.supports_dir_fd
os.open, os.close = refuse_symlink, lambda descriptor: None
os.supports_dir_fd = set(original_dir_fd_support) | {refuse_symlink}
try:
    try:
        namespace["_open_directory_chain"](Path("/virtual/office-safety-root"))
    except OSError:
        pass
    else:
        raise AssertionError("directory-chain symlink accepted")
finally:
    os.open, os.close = original_open, original_close
    os.supports_dir_fd = original_dir_fd_support
assert open_calls[-1][1] & os.O_NOFOLLOW and open_calls[-1][2].get("dir_fd") == 99
print("PASS: supported platforms still open each directory component with O_NOFOLLOW.")

# Exercise the path-based fallback used when Windows has no dir_fd/O_NOFOLLOW.
original_dir_fd_support = os.supports_dir_fd
original_mkdir, original_lstat = Path.mkdir, os.lstat
fake_dirs = set()
def fake_mkdir(path, mode=0o777, parents=False, exist_ok=False):
    fake_dirs.add(Path(path))
def fake_dir_stat(path, *args, **kwargs):
    path = Path(path)
    if path in fake_dirs or path == root:
        return types.SimpleNamespace(st_mode=stat.S_IFDIR, st_dev=1, st_ino=hash(str(path)), st_file_attributes=0)
    raise FileNotFoundError(path)
os.supports_dir_fd = set()
Path.mkdir, os.lstat = fake_mkdir, fake_dir_stat
try:
    path_directory = namespace["_open_checkpoint_directory"](root, create=True)
finally:
    os.supports_dir_fd = original_dir_fd_support
    Path.mkdir, os.lstat = original_mkdir, original_lstat
assert path_directory == (directory, (1, hash(str(directory))))
print("PASS: directory validation/creation has a path-based fallback without dir_fd support.")

source_dir = Path("/virtual-office-safety-root/private")
target_dir = directory
target_handle = (target_dir, (7, 9))
source_name = "checkpoint.glb"
target_name = "01-shell.glb"
source_path, target_path = source_dir / source_name, target_dir / target_name
regular = types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=4, st_dev=7, st_ino=8, st_file_attributes=0)
target_dir_stat = types.SimpleNamespace(st_mode=stat.S_IFDIR, st_size=0, st_dev=7, st_ino=9, st_file_attributes=0)
source_dir_stat = types.SimpleNamespace(st_mode=stat.S_IFDIR, st_size=0, st_dev=6, st_ino=10, st_file_attributes=0)
original_open, original_stat, original_fstat = os.open, os.lstat, os.fstat
original_read, original_write, original_close = os.read, os.write, os.close
module_globals = namespace["_publish_checkpoint_file"].__globals__
original_recheck = module_globals["_recheck_checkpoint_directory"]
rechecks = []
module_globals["_recheck_checkpoint_directory"] = lambda checked_root, original: (rechecks.append((checked_root, original)) or original)
contents = bytearray()
read_once = {40: False}
race = {"enabled": False, "created": False}
target_created = {"value": False}
open_calls = []
def fake_stat(path, *args, **kwargs):
    if Path(path) == target_dir:
        return target_dir_stat
    if Path(path) == source_dir:
        return source_dir_stat
    if Path(path) == source_path:
        return regular
    if Path(path) == target_path and target_created["value"]:
        return regular
    raise FileNotFoundError(path)
def fake_open(path, flags, *args, **kwargs):
    open_calls.append((Path(path), flags, kwargs))
    if Path(path) == source_path:
        return 40
    if Path(path) == target_path:
        if race["enabled"]:
            race["created"] = True
            target_created["value"] = True
            contents[:] = b"created by competing writer"
            raise FileExistsError(path)
        if target_created["value"]:
            raise FileExistsError(path)
        target_created["value"] = True
        return 41
    raise AssertionError(f"unexpected open: {path}")
def fake_read(descriptor, size):
    if descriptor == 40 and not read_once[40]:
        read_once[40] = True
        return b"GLB!"
    return b""
def fake_write(descriptor, data):
    assert descriptor == 41
    contents.extend(data)
    return len(data)
os.open, os.lstat, os.fstat = fake_open, fake_stat, lambda descriptor: regular
os.read, os.write, os.close = fake_read, fake_write, lambda descriptor: None
try:
    assert not namespace["_checkpoint_entry_exists"](target_handle, target_name)
    assert namespace["_publish_checkpoint_file"](
        source_name, target_name, source_dir_fd=source_dir, target_dir_fd=target_handle,
        checkpoint_root=root,
    ) is True
    assert contents == b"GLB!"
    assert rechecks[-1] == (root, target_handle)
    assert open_calls[-1][1] & os.O_CREAT and open_calls[-1][1] & os.O_EXCL and open_calls[-1][1] & os.O_WRONLY
    assert namespace["_checkpoint_entry_exists"](target_handle, target_name)
    assert namespace["_publish_checkpoint_file"](
        source_name, target_name, source_dir_fd=source_dir, target_dir_fd=target_handle,
        checkpoint_root=root,
    ) is False
    assert contents == b"GLB!"
    source_name, target_name = "checkpoint.blend", "01-shell.blend"
    source_path, target_path = source_dir / source_name, target_dir / target_name
    read_once[40] = False
    contents.clear()
    target_created["value"] = False
    assert not namespace["_checkpoint_entry_exists"](target_handle, target_name)
    assert namespace["_publish_checkpoint_file"](
        source_name, target_name, source_dir_fd=source_dir, target_dir_fd=target_handle,
        checkpoint_root=root,
    ) is True
    assert contents == b"GLB!"
    assert namespace["_checkpoint_entry_exists"](target_handle, target_name)
    assert namespace["_publish_checkpoint_file"](
        source_name, target_name, source_dir_fd=source_dir, target_dir_fd=target_handle,
        checkpoint_root=root,
    ) is False
    assert contents == b"GLB!"

    # A destination created after preflight wins; the helper must not copy over it.
    source_name, target_name = "checkpoint.glb", "01-shell.glb"
    source_path, target_path = source_dir / source_name, target_dir / target_name
    target_created["value"] = False
    contents.clear()
    race["enabled"], race["created"] = True, False
    assert not namespace["_checkpoint_entry_exists"](target_handle, target_name)
    assert namespace["_publish_checkpoint_file"](
        source_name, target_name, source_dir_fd=source_dir, target_dir_fd=target_handle,
        checkpoint_root=root,
    ) is False
    assert contents == b"created by competing writer"
finally:
    os.open, os.lstat, os.fstat = original_open, original_stat, original_fstat
    os.read, os.write, os.close = original_read, original_write, original_close
    module_globals["_recheck_checkpoint_directory"] = original_recheck
print("PASS: GLB/BLEND publication uses exclusive descriptor-copy; post-preflight destination creation is not overwritten.")

# Failed copies must close their owned destination before Windows-style cleanup.
failure_source_dir = Path("/virtual/failure-source")
failure_target_dir = Path("/virtual/failure-target")
failure_source = failure_source_dir / "checkpoint.glb"
failure_target = failure_target_dir / "01-shell.glb"
failure_foreign = failure_target_dir / "foreign.txt"
failure_source_stat = types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=8, st_dev=3, st_ino=31, st_file_attributes=0)
failure_owned_stat = types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=7, st_dev=4, st_ino=41, st_file_attributes=0)
failure_replacement_stat = types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=19, st_dev=4, st_ino=42, st_file_attributes=0)
failure_foreign_stat = types.SimpleNamespace(st_mode=stat.S_IFREG, st_size=7, st_dev=4, st_ino=43, st_file_attributes=0)
failure_directory_stat = types.SimpleNamespace(st_mode=stat.S_IFDIR, st_size=0, st_dev=3, st_ino=30, st_file_attributes=0)
failure_target_directory_stat = types.SimpleNamespace(st_mode=stat.S_IFDIR, st_size=0, st_dev=4, st_ino=40, st_file_attributes=0)
failure_source_handle = (failure_source_dir, (3, 30))
failure_target_handle = (failure_target_dir, (4, 40))
failure_originals = (os.open, os.lstat, os.fstat, os.read, os.write, os.close, os.unlink)
for replace_destination in (False, True):
        failure_entries = {
            failure_source_dir: failure_directory_stat,
            failure_target_dir: failure_target_directory_stat,
            failure_source: failure_source_stat,
            failure_foreign: failure_foreign_stat,
        }
        failure_contents = {failure_foreign: bytearray(b"foreign")}
        failure_open_descriptors = set()
        failure_close_calls = []
        failure_unlink_open_states = []
        failure_target_stat_open_states = []
        failure_read_count = {"value": 0}

        def failure_lstat(path, *args, **kwargs):
            path = Path(path)
            if path == failure_target and path in failure_entries:
                failure_target_stat_open_states.append(41 in failure_open_descriptors)
            if path not in failure_entries:
                raise FileNotFoundError(path)
            return failure_entries[path]

        def failure_open(path, flags, *args, **kwargs):
            path = Path(path)
            if path == failure_source:
                failure_open_descriptors.add(40)
                return 40
            if path == failure_target:
                assert flags & os.O_CREAT and flags & os.O_EXCL and flags & os.O_WRONLY
                failure_entries[path] = failure_owned_stat
                failure_contents[path] = bytearray()
                failure_open_descriptors.add(41)
                return 41
            raise AssertionError(f"unexpected failure-test open: {path}")

        def failure_fstat(descriptor):
            return {40: failure_source_stat, 41: failure_owned_stat}[descriptor]

        def failure_read(descriptor, size):
            assert descriptor == 40
            failure_read_count["value"] += 1
            return (b"partial", b"fail")[failure_read_count["value"] - 1] if failure_read_count["value"] <= 2 else b""

        def failure_write(descriptor, data):
            assert descriptor == 41
            if not failure_contents[failure_target]:
                failure_contents[failure_target].extend(data)
                return len(data)
            if replace_destination:
                failure_entries[failure_target] = failure_replacement_stat
                failure_contents[failure_target] = bytearray(b"foreign replacement")
            raise OSError("simulated copy failure")

        def failure_close(descriptor):
            assert descriptor in failure_open_descriptors, f"descriptor {descriptor} closed more than once"
            failure_open_descriptors.remove(descriptor)
            failure_close_calls.append(descriptor)

        def failure_unlink(path, *args, **kwargs):
            path = Path(path)
            if path == failure_target:
                failure_unlink_open_states.append(41 in failure_open_descriptors)
                if 41 in failure_open_descriptors:
                    raise PermissionError("simulated Windows delete-while-open refusal")
            failure_entries.pop(path, None)
            failure_contents.pop(path, None)

        os.open, os.lstat, os.fstat = failure_open, failure_lstat, failure_fstat
        os.read, os.write, os.close, os.unlink = failure_read, failure_write, failure_close, failure_unlink
        try:
            try:
                namespace["_publish_checkpoint_file"](
                    "checkpoint.glb", "01-shell.glb",
                    source_dir_fd=failure_source_handle, target_dir_fd=failure_target_handle,
                )
            except OSError as error:
                assert str(error) == "simulated copy failure", error
            else:
                raise AssertionError("injected copy failure was not propagated")
        finally:
            os.open, os.lstat, os.fstat, os.read, os.write, os.close, os.unlink = failure_originals

        assert failure_target_stat_open_states == [False], failure_target_stat_open_states
        assert failure_close_calls.count(41) == 1 and not failure_open_descriptors
        assert failure_contents[failure_foreign] == b"foreign"
        if replace_destination:
            assert failure_entries[failure_target] is failure_replacement_stat
            assert failure_contents[failure_target] == b"foreign replacement"
            assert not failure_unlink_open_states
        else:
            assert failure_unlink_open_states == [False], failure_unlink_open_states
            assert failure_target not in failure_entries and failure_target not in failure_contents
print("PASS: failed exclusive copies close before cleanup, remove only their partial output, and preserve foreign/replaced files.")

original_lstat, original_unlink, original_rmdir = os.lstat, os.unlink, os.rmdir
owned_dir = Path("/virtual/private-temp")
owned_file = owned_dir / "owned.glb"
replaced_file = owned_dir / "replaced.blend"
foreign_file = owned_dir / "foreign.txt"
identities = {
    Path("/virtual"): types.SimpleNamespace(st_mode=stat.S_IFDIR, st_dev=2, st_ino=19, st_file_attributes=0),
    owned_dir: types.SimpleNamespace(st_mode=stat.S_IFDIR, st_dev=2, st_ino=20, st_file_attributes=0),
    owned_file: types.SimpleNamespace(st_mode=stat.S_IFREG, st_dev=2, st_ino=21, st_file_attributes=0),
    replaced_file: types.SimpleNamespace(st_mode=stat.S_IFREG, st_dev=2, st_ino=23, st_file_attributes=0),
    foreign_file: types.SimpleNamespace(st_mode=stat.S_IFREG, st_dev=2, st_ino=24, st_file_attributes=0),
}
unlinked, removed_dirs = [], []
os.lstat = lambda path, *args, **kwargs: identities[Path(path)]
os.unlink = lambda path, *args, **kwargs: unlinked.append(Path(path))
def fake_rmdir(path, *args, **kwargs):
    removed_dirs.append(Path(path))
    raise OSError("directory still contains an unowned file")
os.rmdir = fake_rmdir
try:
    namespace["_cleanup_checkpoint_temp"](
        Path("/virtual"), "private-temp", owned_dir, (2, 20),
        {"owned.glb": (2, 21), "replaced.blend": (2, 22)},
    )
finally:
    os.lstat, os.unlink, os.rmdir = original_lstat, original_unlink, original_rmdir
assert unlinked == [owned_file], unlinked
assert removed_dirs == [owned_dir]
print("PASS: cleanup removes only matching owned temporary artifacts and leaves replacements/foreign files.")

source_text = Path(sys.argv[1]).read_text(encoding="utf-8")
assert "save_as_mainfile(filepath=str(temp_blend), check_existing=False)" in source_text
assert "temp_blend_name, target_blend.name" in source_text
assert "temp_asset_name, target_glb.name" in source_text
assert "save_as_mainfile(filepath=str(target_blend)" not in source_text
original_excl = os.O_EXCL
del os.O_EXCL
try:
    try:
        namespace["_publish_checkpoint_file"]("source", "target")
    except OSError:
        pass
    else:
        raise AssertionError("publication did not fail closed without O_EXCL")
finally:
    os.O_EXCL = original_excl
print("PASS: Blender saves only to the private temporary BLEND; both formats publish through the helper, which fails closed without O_EXCL.")
`;
const checkpointGeometryTest = String.raw`
import json
import math
import runpy
import sys
import types
from pathlib import Path

sys.dont_write_bytecode = True
for name in ("bpy", "bmesh"):
    sys.modules[name] = types.ModuleType(name)
mathutils = types.ModuleType("mathutils")
mathutils.Matrix = object
mathutils.Vector = object
sys.modules["mathutils"] = mathutils
namespace = runpy.run_path(sys.argv[1], run_name="floor4_checkpoint_geometry_test")
prepare = namespace.get("_prepare_checkpoint_plan")
partition_builder = namespace.get("_partition_boxes")
assert callable(prepare), "missing checkpoint plan geometry derivation"
assert callable(partition_builder), "missing checkpoint interior partition builder"
plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
try:
    built_partition_boxes = partition_builder(plan)
except ValueError as error:
    raise AssertionError(f"builder rejected the registered 1.60 m central-office-south partial wall: {error}") from error
target_wall_boxes = [box for box in built_partition_boxes if box["name"].startswith("partition_central-office-south_")]
assert len(target_wall_boxes) == 1 and target_wall_boxes[0]["height"] == 1.6, target_wall_boxes
for invalid_id, invalid_height in (("central-office-south", 1.5), ("central-office-west", 1.6)):
    invalid_plan = json.loads(json.dumps(plan))
    invalid_partition = next(partition for partition in invalid_plan["interior"]["partitions"] if partition["id"] == invalid_id)
    invalid_partition["height_m"] = invalid_height
    try:
        partition_builder(invalid_plan)
    except ValueError:
        pass
    else:
        raise AssertionError(f"invalid partition height accepted: {invalid_id} at {invalid_height} m")
print("PASS: builder allows sub-2.40 m walls only when height_m matches annotatedHeight_m and rejects other sub-2.40 m heights.")
interior_before = json.loads(json.dumps(plan["interior"]))
prepare(plan)
assert plan["interior"] == interior_before
boxes = plan["boxes"]
shell_boxes = [box for box in boxes if box["kind"] == "exterior-wall"]
partition_boxes = [box for box in boxes if box["kind"] == "interior-partition"]
t3c_partition_ids = {
    "archivo-general-west", "archivo-general-south", "archivo-general-east", "archivo-general-north",
    "elevator-core-west", "elevator-core-east", "elevator-core-south", "elevator-core-north",
    "stair-enclosure-west", "stair-enclosure-west-landing-step", "stair-enclosure-east", "stair-enclosure-south", "stair-enclosure-north",
    "ducto-de-montantes-south-east-step", "ducto-de-montantes-east-step", "ducto-de-montantes-east", "ducto-de-montantes-south", "ducto-de-montantes-north",
    "crossed-service-shaft-west", "crossed-service-shaft-east", "crossed-service-shaft-north",
}
t3c_partition_boxes = [box for box in partition_boxes if any(box["name"].startswith(f"partition_{partition_id}_") for partition_id in t3c_partition_ids)]
prior_partition_boxes = [box for box in partition_boxes if box not in t3c_partition_boxes]
assert len(shell_boxes) == 31, len(shell_boxes)
# 37 T3A/T3B boxes plus 22 T3D boxes (18 walls, five split by interior door gaps).
assert len(prior_partition_boxes) == 59, len(prior_partition_boxes)
assert len(t3c_partition_boxes) == 24, len(t3c_partition_boxes)
assert len(partition_boxes) == 83, len(partition_boxes)
assert len(boxes) == 114, len(boxes)
print("PASS: cumulative checkpoint geometry retains 37 T3A/T3B segments, 24 T3C segments, and adds 22 T3D segments (31 shell, 83 interior, 114 total boxes).")

split = sorted(
    (box for box in partition_boxes if box["name"].startswith("partition_west-restroom-east_")),
    key=lambda box: box["center"][1],
)
assert len(split) == 2, split
assert math.isclose(split[0]["size"][0], 0.15, abs_tol=1e-9) and math.isclose(split[1]["size"][0], 0.6, abs_tol=1e-9), split
assert all(math.isclose(box["center"][0], 3.65, abs_tol=1e-9) for box in split), split
assert math.isclose(split[0]["center"][1], 17.425, abs_tol=1e-9), split
assert math.isclose(split[1]["center"][1], 18.6, abs_tol=1e-9), split
assert all(math.isclose(box["angle"], math.pi / 2, abs_tol=1e-9) for box in split), split
assert all(box["height"] == 2.4 and box["collidable"] is True for box in split), split
occupied = [(box["center"][1] - box["size"][0] / 2, box["center"][1] + box["size"][0] / 2) for box in split]
assert math.isclose(occupied[0][0], 17.35) and math.isclose(occupied[0][1], 17.5), occupied
assert math.isclose(occupied[1][0], 18.3) and math.isclose(occupied[1][1], 18.9), occupied
print("PASS: partition opening split preserves segment lengths, centerline centers, rotation, height, and the door gap.")

door_openings = [
    (partition, opening)
    for partition in plan["interior"]["partitions"]
    for opening in partition["openings"]
    if opening["kind"] == "door"
]
assert len(door_openings) == 22, len(door_openings)
assert sum(partition["id"] not in t3c_partition_ids for partition, opening in door_openings) == 18
assert sum(partition["id"] in t3c_partition_ids for partition, opening in door_openings) == 4
for partition, opening in door_openings:
    dx = partition["end_m"][0] - partition["start_m"][0]
    dy = partition["end_m"][1] - partition["start_m"][1]
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    segments = [box for box in partition_boxes if box["name"].startswith(f"partition_{partition['id']}_")]
    for box in segments:
        center_distance = (box["center"][0] - partition["start_m"][0]) * ux + (box["center"][1] - partition["start_m"][1]) * uy
        segment_from = center_distance - box["size"][0] / 2
        segment_to = center_distance + box["size"][0] / 2
        assert segment_to <= opening["from_m"] + 1e-9 or segment_from >= opening["to_m"] - 1e-9, (partition["id"], opening, box)
assert {"Floor4_02-west-north_Floor", "Floor4_02-west-north_wall_Blocking", "Floor4_02-west-north_partition_Blocking"} == namespace["_checkpoint_object_names"](plan, "Floor4_02-west-north")
assert all(box["material"] == "partition" and box["collidable"] for box in partition_boxes)
print("PASS: all 22 T3A/T3B/T3C/T3D door gaps remain empty and checkpoint wall/partition batches have valid names.")

invalid_plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
invalid_partition = next(partition for partition in invalid_plan["interior"]["partitions"] if partition["id"] == "west-restroom-east")
invalid_partition["openings"][0]["to_m"] = 1.6
try:
    prepare(invalid_plan)
except ValueError:
    pass
else:
    raise AssertionError("out-of-range partition opening was accepted")
print("PASS: out-of-range partition opening is rejected.")
`;
try {
  const checkpointOutput = execFileSync("python3", ["-c", checkpointSafetyTest, resolve(root, "scripts/build_office.py")], { encoding: "utf8" });
  process.stdout.write(checkpointOutput);
} catch (error) {
  const detail = error.stderr?.toString().trim() || error.message;
  errors.push(`checkpoint path safety validation failed: ${detail}`);
}

try {
  const geometryOutput = execFileSync("python3", ["-c", checkpointGeometryTest, resolve(root, "scripts/build_office.py"), resolve(root, "src/floor4-plan.json")], { encoding: "utf8" });
  process.stdout.write(geometryOutput);
} catch (error) {
  const detail = error.stderr?.toString().trim() || error.message;
  errors.push(`checkpoint geometry derivation failed: ${detail}`);
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log("PASS: previous Marketing door placement at y=15.45–16.25 is rejected.");
console.log(`PASS: cumulative floor 4 plan validated (${wallSegmentCount} shell wall segments, ${openingCount} exterior openings, ${plan.interior.partitions.length} interior partitions, ${plan.interior.rooms.length} rooms).`);
