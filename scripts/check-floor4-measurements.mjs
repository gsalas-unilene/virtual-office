import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
let register;
let plan;

try {
  register = JSON.parse(readFileSync(resolve(sourceDir, "floor4-measurements.json"), "utf8"));
  plan = JSON.parse(readFileSync(resolve(sourceDir, "floor4-plan.json"), "utf8"));
} catch (error) {
  console.error(`FAIL: cannot read floor 4 source data (${error.code ?? "invalid JSON"})`);
  process.exit(1);
}

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

check(register && typeof register === "object" && !Array.isArray(register), "register must be a JSON object");
if (!register || typeof register !== "object" || Array.isArray(register)) {
  console.error(`FAIL: ${errors.join("; ")}`);
  process.exit(1);
}

check(register.units === "m", "units must be m");
check(register.source === "plano_oficina.pdf", "source must be plano_oficina.pdf");
check(register.floor === 4, "floor must be 4");

const gridSpans = register.grid_axis_spans_m;
check(gridSpans && typeof gridSpans === "object" && !Array.isArray(gridSpans), "grid_axis_spans_m must be an object");
check(!Object.prototype.hasOwnProperty.call(register, "envelope_m"), "grid-axis spans must not be recorded as an exterior envelope");

const exteriorBounds = register.exterior_bounds;
check(exteriorBounds?.status === "approximate", "traced exterior bounds must be labelled approximate");
check(typeof exteriorBounds?.reason === "string" && exteriorBounds.reason.includes("not dimensioned") && exteriorBounds.reason.includes("non-constructive"), "approximate exterior bounds must be labelled non-dimensioned and non-constructive");
check(Array.isArray(exteriorBounds?.min_m) && exteriorBounds.min_m.length === 2 && exteriorBounds.min_m.every(isNumber), "approximate exterior bounds must record finite min coordinates");
check(Array.isArray(exteriorBounds?.max_m) && exteriorBounds.max_m.length === 2 && exteriorBounds.max_m.every(isNumber), "approximate exterior bounds must record finite max coordinates");
check(exteriorBounds?.width_m === exteriorBounds?.max_m?.[0] - exteriorBounds?.min_m?.[0], "approximate exterior width must derive from traced bounds");
check(exteriorBounds?.depth_m === exteriorBounds?.max_m?.[1] - exteriorBounds?.min_m?.[1], "approximate exterior depth must derive from traced bounds");
const planPoints = plan?.floorOutline;
if (Array.isArray(planPoints) && planPoints.length && planPoints.every((point) => Array.isArray(point) && point.length === 2 && point.every(isNumber))) {
  const planXs = planPoints.map(([x]) => x);
  const planYs = planPoints.map(([, y]) => y);
  check(exteriorBounds?.min_m?.[0] === Math.min(...planXs) && exteriorBounds?.max_m?.[0] === Math.max(...planXs), "registered exterior x bounds must come from the full traced outline");
  check(exteriorBounds?.min_m?.[1] === Math.min(...planYs) && exteriorBounds?.max_m?.[1] === Math.max(...planYs), "registered exterior y bounds must come from the full traced outline");
} else {
  check(false, "plan must provide finite outline points to derive exterior bounds");
}
check(exteriorBounds?.width_m !== gridSpans?.["A-F"] && exteriorBounds?.depth_m !== gridSpans?.["7-2"], "exterior bounds must not be copied from grid-axis spans");

const validateAxis = (axis, name, from, to, expectedSegments, gridSpan, expectedSpan) => {
  check(axis && axis.from === from && axis.to === to, `${name} grid must run ${from} to ${to}`);
  const segments = axis?.segments_m;
  check(Array.isArray(segments) && segments.length === expectedSegments.length, `${name} grid must have ${expectedSegments.length} segments`);
  check(isNumber(gridSpan) && gridSpan === expectedSpan, `${name} grid-axis span must be ${expectedSpan.toFixed(2)} m`);
  if (!Array.isArray(segments)) return;

  check(segments.every(isNumber), `${name} grid segments must be finite numbers`);
  check(segments.length === expectedSegments.length && segments.every((value, index) => value === expectedSegments[index]), `${name} grid measurements do not match the authoritative values`);
  if (segments.every(isNumber) && isNumber(gridSpan)) {
    const total = segments.reduce((sum, value) => sum + value, 0);
    check(Math.abs(total - gridSpan) <= 0.01, `${name} grid chain total ${total.toFixed(2)} m does not match its grid-axis span ${gridSpan.toFixed(2)} m within 0.01 m`);
  }
};

validateAxis(register.horizontal_grid, "horizontal", "A", "F", [5.15, 5.18, 5.62, 3.64, 3.26], gridSpans?.["A-F"], 22.85);
validateAxis(register.vertical_grid, "vertical", "7", "2", [1.75, 1.71, 1.78, 5.87, 5.49, 5.65], gridSpans?.["7-2"], 22.25);

const t3a = register.t3a_west_north;
const horizontalSegments = register.horizontal_grid?.segments_m ?? [];
const verticalSegments = register.vertical_grid?.segments_m ?? [];
const gridAnchors = t3a?.directly_dimensioned_grid_anchors_m;
const matchesDimension = (actual, expected) => isNumber(actual) && isNumber(expected) && Math.abs(actual - expected) <= 0.01;
check(matchesDimension(gridAnchors?.grid_3_y, verticalSegments.at(-1)), "T3A grid 3 anchor must retain its directly dimensioned 5.65 m coordinate");
check(matchesDimension(gridAnchors?.grid_5_y, verticalSegments.slice(-3).reduce((sum, value) => sum + value, 0)), "T3A grid 5 anchor must derive from the directly dimensioned vertical chain");
check(matchesDimension(gridAnchors?.grid_7_y, verticalSegments.reduce((sum, value) => sum + value, 0)), "T3A grid 7 anchor must derive from the directly dimensioned vertical chain");
check(matchesDimension(gridAnchors?.grid_D_x, horizontalSegments.slice(0, 3).reduce((sum, value) => sum + value, 0)), "T3A grid D anchor must derive from the directly dimensioned horizontal chain");
check(typeof t3a?.dimensionReadability === "string" && t3a.dimensionReadability.includes("grid-chain") && t3a.dimensionReadability.includes("no room-specific"), "T3A must distinguish readable grid dimensions from undimensioned room geometry");
check(Array.isArray(t3a?.scale_traced_features) && t3a.scale_traced_features.length >= 7, "T3A must register raster-traced rooms, partitions, openings, and circulation");
check(typeof t3a?.coordinateStatus === "string" && t3a.coordinateStatus.includes("approximate") && t3a.coordinateStatus.includes("non-constructive"), "T3A raster-only coordinates must be labelled approximate and non-constructive");

const t3b = register.t3b_central;
const frame = t3b?.coordinate_frame;
const estimates = t3b?.trace_estimates_approximate_m;
const planInterior = plan?.interior;
const planRooms = planInterior?.rooms ?? [];
const planRoom = (id) => planRooms.find((room) => room?.id === id);
const polygonBounds = (polygon) => {
  const points = Array.isArray(polygon) ? polygon.filter((point) => Array.isArray(point) && point.length === 2 && point.every(isNumber)) : [];
  return points.length ? {
    min_m: [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y))],
    max_m: [Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))],
  } : null;
};
const samePair = (actual, expected) => Array.isArray(actual) && Array.isArray(expected)
  && actual.length === 2 && expected.length === 2 && actual.every((value, index) => matchesDimension(value, expected[index]));
check(frame?.origin === plan?.origin && frame?.origin === "southwest outside corner", "T3B measurement frame must use the plan's exact southwest outside origin");
check(matchesDimension(t3b?.map_grid_relative_x_to_plan_offset_m, 0)
  && matchesDimension(frame?.grid_A_x_approx_m, 0)
  && matchesDimension(frame?.grid_F_x_approx_m, frame?.grid_A_x_approx_m + horizontalSegments.reduce((sum, value) => sum + value, 0))
  && matchesDimension(frame?.grid_F_x_approx_m, 22.85)
  && matchesDimension(register.visual_evidence_approximate?.west_offset_from_A?.approximate_distance_m, 0.5)
  && register.visual_evidence_approximate?.west_offset_from_A?.direction === "west"
  && samePair(register.visual_evidence_approximate?.west_offset_x_m, [-0.5, 0]),
"T3B must use A=0/F=22.85 while recording the west spur separately at x≈−0.50 m");
check(samePair(estimates?.oficina_bounds?.min_m, [10.6, 13.35]) && samePair(estimates?.oficina_bounds?.max_m, [12.55, 17.05])
  && samePair(estimates?.meeting_bounds?.min_m, [12.55, 13.35]) && samePair(estimates?.meeting_bounds?.max_m, [18.0, 17.05])
  && samePair(estimates?.gerente_marketing_internacional_bounds?.min_m, [4.8, 14.25])
  && samePair(estimates?.gerente_marketing_internacional_bounds?.max_m, [7.7, 17.05])
  && samePair(estimates?.jefe_rrhh_bounds?.min_m, [7.7, 14.25])
  && samePair(estimates?.jefe_rrhh_bounds?.max_m, [10.6, 17.05]),
"T3B approximate office, meeting, and north-edge room boundaries must use the A=0 plan frame");
check(samePair(estimates?.pool_bounds?.min_m, [4.8, 5.65]) && samePair(estimates?.pool_bounds?.max_m, [18.3, 13.35]),
"T3B open-pool traced bounds must be registered as approximate");
check(matchesDimension(estimates?.partition_thickness_m, 0.12)
  && samePair(estimates?.meeting_north_door_x_m, [16.8, 17.8])
  && samePair(estimates?.central_connector_bounds?.min_m, [4.8, 13.35])
  && samePair(estimates?.central_connector_bounds?.max_m, [10.6, 14.19])
  && samePair(estimates?.north_pasadizo_extension_bounds?.min_m, [16.1, 17.05])
  && samePair(estimates?.north_pasadizo_extension_bounds?.max_m, [18.3, 18.45])
  && samePair(estimates?.east_core_connector_bounds?.min_m, [18.3, 17.05])
  && samePair(estimates?.east_core_connector_bounds?.max_m, [21.5, 18.45])
  && matchesDimension(estimates?.door_widths_m?.office_north_pasadizo, 0.8)
  && matchesDimension(estimates?.door_widths_m?.meeting_north_pasadizo, 1.0)
  && matchesDimension(estimates?.door_widths_m?.marketing_internacional_west, 0.9)
  && matchesDimension(estimates?.door_widths_m?.jefe_rrhh_north, 0.9)
  && samePair(estimates?.marketing_west_door_y_m, [14.3, 15.2])
  && samePair(estimates?.jefe_rrhh_north_door_x_m, [7.8, 8.7]),
"T3B approximate partitions, corrected room doors, NE meeting door, and east-core connector must be registered");
check(typeof t3b?.dimensionReadability === "string" && t3b.dimensionReadability.includes("no room-specific")
  && typeof t3b?.coordinateStatus === "string" && t3b.coordinateStatus.includes("approximate") && t3b.coordinateStatus.includes("non-constructive")
  && t3b.coordinateStatus.includes("u≈18.0 m") && t3b.coordinateStatus.includes("not a dimensioned survey value")
  && typeof t3b?.partition_interpretation === "string"
  && t3b.partition_interpretation.includes("thick black space-divider lines")
  && t3b.partition_interpretation.includes("translucent acrylic partitions")
  && t3b.partition_interpretation.includes("does not add material rendering"),
"T3B must distinguish unreadable room dimensions from approximate, non-constructive raster traces");
check(Array.isArray(t3b?.scale_traced_features) && ["open pool-zone outline", "meeting-room boundary", "adjacent-office boundary", "enclosed Marketing International manager room", "enclosed HR chief room", "partitions", "door gaps", "circulation connections", "north-pasadizo extension", "east-core-edge connector"].every((feature) => t3b.scale_traced_features.includes(feature)),
"T3B register must identify all raster-traced room, partition, opening, and circulation features");
const centralOfficeSouthEstimate = estimates?.central_office_south_wall;
const planCentralOfficeSouth = (planInterior?.partitions ?? []).find((partition) => partition?.id === "central-office-south");
check(centralOfficeSouthEstimate?.status === "approximate"
  && centralOfficeSouthEstimate?.line === "solid"
  && centralOfficeSouthEstimate?.classification === "partial wall"
  && samePair(centralOfficeSouthEstimate?.start_m, [11.45, 13.35])
  && samePair(centralOfficeSouthEstimate?.end_m, [12.55, 13.35])
  && matchesDimension(centralOfficeSouthEstimate?.height_m, 1.6)
  && Array.isArray(centralOfficeSouthEstimate?.openings) && centralOfficeSouthEstimate.openings.length === 0
  && typeof centralOfficeSouthEstimate?.source === "string"
  && centralOfficeSouthEstimate.source.includes("scale-traced")
  && centralOfficeSouthEstimate.source.includes("approximate/non-constructive")
  && typeof centralOfficeSouthEstimate?.interpretation === "string"
  && centralOfficeSouthEstimate.interpretation.toLowerCase().includes("furniture")
  && centralOfficeSouthEstimate.interpretation.includes("ambiguous")
  && centralOfficeSouthEstimate.interpretation.includes("PROY. VIGA")
  && centralOfficeSouthEstimate.interpretation.includes("not a wall")
  && samePair(planCentralOfficeSouth?.start_m, centralOfficeSouthEstimate?.start_m)
  && samePair(planCentralOfficeSouth?.end_m, centralOfficeSouthEstimate?.end_m)
  && matchesDimension(planCentralOfficeSouth?.height_m, centralOfficeSouthEstimate?.height_m)
  && Array.isArray(planCentralOfficeSouth?.openings) && planCentralOfficeSouth.openings.length === 0
  && planCentralOfficeSouth?.source === centralOfficeSouthEstimate?.source,
"T3R-CW-S must register and match the approximate solid short segment, 1.60 m height, no openings, and the honest furniture/PROY. VIGA interpretation");

const t3c = register.t3c_east;
const t3cEstimates = t3c?.trace_estimates_approximate_m;
const t3cGridX = register.horizontal_grid?.segments_m ?? [];
const t3cGridY = register.vertical_grid?.segments_m ?? [];
const t3cGridAnchors = t3c?.directly_dimensioned_grid_anchors_m;
const expectedT3cAnchors = {
  grid_A_x: 0,
  grid_E_x: t3cGridX.slice(0, 4).reduce((sum, value) => sum + value, 0),
  grid_F_x: t3cGridX.reduce((sum, value) => sum + value, 0),
  row_4_y: t3cGridY.slice(-2).reduce((sum, value) => sum + value, 0),
  row_5_y: t3cGridY.slice(-3).reduce((sum, value) => sum + value, 0),
  row_6_y: t3cGridY.slice(-4).reduce((sum, value) => sum + value, 0),
  row_6_prime_y: t3cGridY.slice(-5).reduce((sum, value) => sum + value, 0),
  row_7_y: t3cGridY.reduce((sum, value) => sum + value, 0),
};
check(t3c?.coordinate_frame?.origin === plan?.origin
  && t3c?.coordinate_frame?.grid_A_x_m === 0
  && t3c?.coordinate_frame?.grid_F_x_m === 22.85
  && Object.entries(expectedT3cAnchors).every(([key, value]) => matchesDimension(t3cGridAnchors?.[key], value)),
"T3C must map direct A/E/F and row 4–7 grid anchors separately in the A=0/F=22.85 frame");
check(Array.isArray(t3c?.scale_traced_features) && ["Archivo General boundary", "Hall de Espera open lobby", "two elevator enclosures", "stair enclosure", "Ducto de Montantes", "crossed service-shaft mark", "crossed-shaft south base strip/east-step shell boundary", "east-core circulation and visible doors"].every((feature) => t3c.scale_traced_features.includes(feature))
  && typeof t3c?.dimensionReadability === "string" && t3c.dimensionReadability.includes("no room-specific")
  && typeof t3c?.coordinateStatus === "string" && t3c.coordinateStatus.includes("approximate") && t3c.coordinateStatus.includes("non-constructive"),
"T3C must register PDF-traced east-core features and label undimensioned geometry approximate and non-constructive");
const t3cRooms = [
  ["archivo-general", t3cEstimates?.archivo_general_bounds],
  ["ascensor-materiales", t3cEstimates?.ascensor_materiales_bounds],
  ["ascensor-personal", t3cEstimates?.ascensor_personal_bounds],
  ["escalera", t3cEstimates?.stair_enclosure_bounds],
  ["ducto-de-montantes", t3cEstimates?.ducto_montantes_bounds],
  ["service-shaft-crossed", t3cEstimates?.crossed_service_shaft_bounds],
];
const stairWestProfile = [[19.85, 12.45], [19.85, 15.65], [19.42, 15.65], [19.42, 17]];
const ductSoutheastProfile = [[21.07, 11.14], [21.07, 11.45], [21.29, 11.45]];
const stairWestWall = (planInterior?.partitions ?? []).find((partition) => partition?.id === "stair-enclosure-west");
const stairDoor = stairWestWall?.openings?.find((opening) => opening?.name === "door-stair-enclosure-west");
const stairDoorAbsoluteY = [stairWestWall?.start_m?.[1] + stairDoor?.from_m, stairWestWall?.start_m?.[1] + stairDoor?.to_m];
const stairDoorFitsSegment = (partition, door) => {
  const length = Math.hypot(partition?.end_m?.[0] - partition?.start_m?.[0], partition?.end_m?.[1] - partition?.start_m?.[1]);
  return door?.kind === "door" && isNumber(door?.from_m) && isNumber(door?.to_m)
    && door.from_m >= 0 && door.to_m > door.from_m && door.to_m <= length
    && partition?.start_m?.[0] === partition?.end_m?.[0]
    && partition.start_m[1] + door.from_m >= Math.min(partition.start_m[1], partition.end_m[1])
    && partition.start_m[1] + door.to_m <= Math.max(partition.start_m[1], partition.end_m[1]);
}
const ductBounds = t3cEstimates?.ducto_montantes_bounds;
const shaftBounds = t3cEstimates?.crossed_service_shaft_bounds;
const ductShaftBoundsGap = shaftBounds?.min_m?.[0] - ductBounds?.max_m?.[0];
const ductShaftFaceClearance = ductShaftBoundsGap - t3cEstimates?.partition_thickness_m;
const stairRecessDepth = t3cEstimates?.stair_recess_depth_m;
const stairDepth = t3cEstimates?.stair_enclosure_bounds?.max_m?.[1] - t3cEstimates?.stair_enclosure_bounds?.min_m?.[1];
const withinShaftGapBand = (clearance) => clearance >= 0.1 && clearance <= 0.2;
const crossingStairDoor = { ...stairDoor, from_m: 2.9, to_m: 3.25 };
const targetStairWestSegment = { start_m: [19.85, 12.45], end_m: [19.85, 15.65] };
const negativeGapDoorCasesRejected = !withinShaftGapBand(0.54) && !withinShaftGapBand(-0.21)
  && !stairDoorFitsSegment(targetStairWestSegment, crossingStairDoor);
check(samePair(t3cEstimates?.stair_enclosure_bounds?.min_m, [19.42, 12.45])
  && samePair(t3cEstimates?.stair_enclosure_bounds?.max_m, [22.56, 17])
  && JSON.stringify(t3cEstimates?.stair_west_profile_vertices_m) === JSON.stringify(stairWestProfile)
  && matchesDimension(stairRecessDepth, 1.35)
  && stairRecessDepth / stairDepth >= 0.28 && stairRecessDepth / stairDepth <= 0.32
  && samePair(t3cEstimates?.stair_frontage_approach_bounds?.min_m, [19.36, 14.75])
  && samePair(t3cEstimates?.stair_frontage_approach_bounds?.max_m, [19.79, 15.55])
  && samePair(t3cEstimates?.door_gaps?.stair_enclosure_west, [14.75, 15.55])
  && samePair(stairDoorAbsoluteY, [14.75, 15.55]) && stairDoorFitsSegment(stairWestWall, stairDoor)
  && samePair(t3cEstimates?.east_core_circulation_bounds?.min_m, [18.0, 11.1])
  && samePair(t3cEstimates?.east_core_circulation_bounds?.max_m, [19.36, 22.1]),
"T3C stair register must record a 1.35 m/approximately 30% recess and a door fully inside one connected west-wall segment");
check(samePair(ductBounds?.min_m, [19.42, 11.14])
  && samePair(ductBounds?.max_m, [21.29, 12.3])
  && JSON.stringify(t3cEstimates?.ducto_southeast_profile_vertices_m) === JSON.stringify(ductSoutheastProfile)
  && samePair(shaftBounds?.min_m, [21.56, 11.14])
  && samePair(shaftBounds?.max_m, [22.62, 12.35])
  && matchesDimension(ductShaftBoundsGap, 0.27)
  && withinShaftGapBand(ductShaftFaceClearance)
  && matchesDimension(t3cEstimates?.ducto_crossed_shaft_bounds_gap_m, ductShaftBoundsGap)
  && matchesDimension(t3cEstimates?.ducto_crossed_shaft_wall_clearance_m, ductShaftFaceClearance)
  && matchesDimension(ductBounds?.min_m?.[1], shaftBounds?.min_m?.[1])
  && matchesDimension(shaftBounds?.min_m?.[1], t3cGridAnchors?.row_4_y)
  && matchesDimension(t3cEstimates?.stair_duct_wall_clearance_m, 0.03),
"T3C register must record a 0.10–0.20 m shaft wall-face gap, shared duct/shaft row-4 south alignment, and unchanged stair/duct clearance");
check(negativeGapDoorCasesRejected,
  "T3C negative cases must reject a too-wide/overlapping shaft gap and a stair door crossing its connected wall-segment end");
if (negativeGapDoorCasesRejected) console.log("PASS: T3C negative measurements reject wide/overlapping shaft gaps and a stair door crossing the wall-segment end.");
for (const [id, expected] of t3cRooms) {
  const actual = polygonBounds(planRoom(id)?.polygon_m);
  check(samePair(actual?.min_m, expected?.min_m) && samePair(actual?.max_m, expected?.max_m),
    `T3C ${id} must match its registered approximate A=0 plan-frame bounds`);
}
const waitingHall = (planInterior?.zones ?? []).find((zone) => zone?.id === "hall-de-espera");
const waitingHallBounds = polygonBounds(waitingHall?.polygon_m);
check(waitingHall?.kind === "open-circulation" && waitingHall?.isEnclosed === false
  && samePair(waitingHallBounds?.min_m, t3cEstimates?.waiting_hall_bounds?.min_m)
  && samePair(waitingHallBounds?.max_m, t3cEstimates?.waiting_hall_bounds?.max_m),
"T3C Hall de Espera must remain a traced open lobby zone connected to circulation");
const t3cCorridor = planInterior?.circulation?.find((path) => path?.id === "east-pasadizo-connector");
const t3cCorridorBounds = polygonBounds(t3cCorridor?.polygon_m);
const stairApproach = planInterior?.circulation?.find((path) => path?.id === "stair-core-approach");
const stairApproachBounds = polygonBounds(stairApproach?.polygon_m);
check(samePair(t3cCorridorBounds?.min_m, t3cEstimates?.east_core_circulation_bounds?.min_m)
  && samePair(t3cCorridorBounds?.max_m, t3cEstimates?.east_core_circulation_bounds?.max_m)
  && samePair(stairApproachBounds?.min_m, t3cEstimates?.stair_frontage_approach_bounds?.min_m)
  && samePair(stairApproachBounds?.max_m, t3cEstimates?.stair_frontage_approach_bounds?.max_m)
  && matchesDimension(t3cEstimates?.east_core_circulation_bounds?.min_m?.[1], 11.1)
  && Math.abs(t3cEstimates?.east_core_circulation_bounds?.min_m?.[1] - t3cGridAnchors?.row_4_y) <= 0.05,
"T3C east passage must connect through the lobby/stair approach and stop at the approximate row-4 seam");
const hallDoorGapNames = (planInterior?.partitions ?? [])
  .filter((partition) => partition?.id?.startsWith("t3c-") || [
    "archivo-general-west", "elevator-core-west", "stair-enclosure-west", "stair-enclosure-west-landing",
  ].includes(partition?.id))
  .flatMap((partition) => partition?.openings ?? [])
  .map((opening) => opening?.name).sort();
check(JSON.stringify(hallDoorGapNames) === JSON.stringify([
  "door-archivo-general-west", "door-ascensor-materiales-west", "door-ascensor-personal-west", "door-stair-enclosure-west",
].sort()), "T3C must record only the visible archive, elevator, and stair door gaps");
const crossedShaft = planRoom("service-shaft-crossed");
const baseStrip = t3cEstimates?.crossed_service_shaft_south_base_strip;
const eastStepIndex = plan?.shell?.edges?.findIndex((edge) => edge?.name === "east-step") ?? -1;
const eastStepStart = eastStepIndex >= 0 ? plan?.floorOutline?.[eastStepIndex] : null;
const eastStepEnd = eastStepIndex >= 0 ? plan?.floorOutline?.[(eastStepIndex + 1) % plan.floorOutline.length] : null;
const actualCrossedShaftBounds = polygonBounds(crossedShaft?.polygon_m);
const crossedShaftSouthPartitionCount = (planInterior?.partitions ?? [])
  .filter((partition) => partition?.id === "crossed-service-shaft-south").length;
check(crossedShaft?.service_space?.symbol === "crossed"
  && crossedShaft?.service_space?.function === "unspecified"
  && t3c?.non_wall_annotations?.some((note) => note.includes("dashed") && note.includes("not wall")),
"T3C crossed shaft must remain an unspecified approximate service space and dashed beam/ventilation marks must not become walls");
check(baseStrip?.status === "approximate" && baseStrip?.line === "solid"
  && baseStrip?.classification === "east-step shell boundary"
  && baseStrip?.modeled_by === "shell east-step"
  && samePair(baseStrip?.start_m, [21.5, 11.1]) && samePair(baseStrip?.end_m, [22.85, 11.1])
  && typeof baseStrip?.source === "string" && baseStrip.source.includes("approximate/non-constructive")
  && typeof baseStrip?.shared_boundary_convention === "string"
  && baseStrip.shared_boundary_convention.includes("y=11.10")
  && baseStrip.shared_boundary_convention.includes("y=11.14")
  && baseStrip.shared_boundary_convention.includes("0.04 m")
  && baseStrip.shared_boundary_convention.includes("no separate free strip")
  && eastStepIndex >= 0 && samePair(eastStepStart, [21.5, 11.1]) && samePair(eastStepEnd, [22.85, 11.1])
  && actualCrossedShaftBounds?.min_m?.[0] >= Math.min(eastStepStart?.[0], eastStepEnd?.[0])
  && actualCrossedShaftBounds?.max_m?.[0] <= Math.max(eastStepStart?.[0], eastStepEnd?.[0])
  && samePair(actualCrossedShaftBounds?.min_m, [21.56, 11.14])
  && Math.abs(actualCrossedShaftBounds?.min_m?.[1] - eastStepStart?.[1] - 0.04) <= 0.001
  && crossedShaftSouthPartitionCount === 0,
"T3C east-step shell must fully cover the approximate shaft south boundary, with the 0.04 m discrepancy subordinate and no duplicate interior partition");
const registeredRooms = [
  [planRoom("oficina"), estimates?.oficina_bounds],
  [planRoom("zona-de-reuniones"), estimates?.meeting_bounds],
  [planRoom("gerente-marketing-internacional"), estimates?.gerente_marketing_internacional_bounds],
  [planRoom("jefe-recursos-humanos"), estimates?.jefe_rrhh_bounds],
];
for (const [room, expected] of registeredRooms) {
  const actual = polygonBounds(room?.polygon_m);
  check(samePair(actual?.min_m, expected?.min_m) && samePair(actual?.max_m, expected?.max_m),
    `${room?.id ?? "T3B room"} must match its registered approximate plan-frame boundaries`);
}
const meetingPlanRoom = planRoom("zona-de-reuniones");
const meetingPlanBounds = polygonBounds(meetingPlanRoom?.polygon_m);
const meetingWestWall = (planInterior?.partitions ?? []).find((partition) => partition?.id === "central-office-meeting-divider");
const meetingSouthWall = (planInterior?.partitions ?? []).find((partition) => partition?.id === "meeting-room-south");
const meetingEastWall = (planInterior?.partitions ?? []).find((partition) => partition?.id === "meeting-room-east");
const meetingNorthWallForGeometry = (planInterior?.partitions ?? []).find((partition) => partition?.id === "meeting-room-north-extension");
const meetingDividerWalls = [meetingWestWall, meetingSouthWall, meetingEastWall, meetingNorthWallForGeometry];
const meetingConnector = planInterior?.circulation?.find((path) => path?.id === "east-pasadizo-connector");
const meetingConnectorBounds = polygonBounds(meetingConnector?.polygon_m);
const registeredMeetingBounds = estimates?.meeting_bounds;
const registeredEastConnectorBounds = t3cEstimates?.east_core_circulation_bounds;
const meetingRegionOverlap = meetingPlanBounds && meetingConnectorBounds
  && Math.min(meetingPlanBounds.max_m[0], meetingConnectorBounds.max_m[0]) > Math.max(meetingPlanBounds.min_m[0], meetingConnectorBounds.min_m[0])
  && Math.min(meetingPlanBounds.max_m[1], meetingConnectorBounds.max_m[1]) > Math.max(meetingPlanBounds.min_m[1], meetingConnectorBounds.min_m[1]);
check(JSON.stringify(meetingPlanRoom?.polygon_m) === JSON.stringify([[12.55, 13.35], [18.0, 13.35], [18.0, 17.05], [12.55, 17.05]])
  && JSON.stringify(registeredMeetingBounds?.min_m) === JSON.stringify([12.55, 13.35])
  && JSON.stringify(registeredMeetingBounds?.max_m) === JSON.stringify([18.0, 17.05])
  && JSON.stringify(meetingWestWall?.start_m) === JSON.stringify([12.55, 13.35])
  && JSON.stringify(meetingWestWall?.end_m) === JSON.stringify([12.55, 17.05])
  && JSON.stringify(meetingSouthWall?.start_m) === JSON.stringify([12.55, 13.35])
  && JSON.stringify(meetingSouthWall?.end_m) === JSON.stringify([18.0, 13.35])
  && JSON.stringify(meetingEastWall?.start_m) === JSON.stringify([18.0, 13.35])
  && JSON.stringify(meetingEastWall?.end_m) === JSON.stringify([18.0, 17.05])
  && JSON.stringify(meetingNorthWallForGeometry?.start_m) === JSON.stringify([16.1, 17.05])
  && JSON.stringify(meetingNorthWallForGeometry?.end_m) === JSON.stringify([18.0, 17.05])
  && meetingDividerWalls.every((wall) => wall?.thickness_m === 0.12 && wall?.height_m === 2.4
    && typeof wall?.source === "string" && wall.source.includes("approximate/non-constructive")
    && wall.source.includes("translucent acrylic partition"))
  && meetingSouthWall?.openings?.length === 0 && meetingEastWall?.openings?.length === 0,
"T3R-MRE meeting enclosure must have coordinated approximate u≈18.0 m bounds, unchanged wall dimensions, and acrylic-partition provenance");
check(JSON.stringify(meetingConnector?.polygon_m) === JSON.stringify([[18.0, 11.1], [19.36, 11.1], [19.36, 22.1], [18.0, 22.1]])
  && JSON.stringify(registeredEastConnectorBounds?.min_m) === JSON.stringify([18.0, 11.1])
  && JSON.stringify(registeredEastConnectorBounds?.max_m) === JSON.stringify([19.36, 22.1])
  && meetingPlanBounds?.max_m?.[0] === meetingConnectorBounds?.min_m?.[0]
  && !meetingRegionOverlap,
"T3R-MRE meeting-room and east-connector regions must adjoin at u≈18.0 m without plan-region overlap");
const poolZone = (planInterior?.zones ?? []).find((area) => area?.id === "pool-de-oficinas");
const actualPoolBounds = polygonBounds(poolZone?.polygon_m);
check(samePair(actualPoolBounds?.min_m, estimates?.pool_bounds?.min_m)
  && samePair(actualPoolBounds?.max_m, estimates?.pool_bounds?.max_m),
"T3B open pool-zone geometry must match the approximate measurement register");
const northEdge = (planInterior?.partitions ?? []).find((partition) => partition?.id === "north-pasadizo-south-edge");
const northOpenings = new Map((northEdge?.openings ?? []).map((opening) => [opening.name, opening]));
const marketingWest = (planInterior?.partitions ?? []).find((partition) => partition?.id === "marketing-internacional-west");
const marketingSouth = (planInterior?.partitions ?? []).find((partition) => partition?.id === "marketing-internacional-south");
const marketingDoor = marketingWest?.openings?.find((opening) => opening?.name === "door-marketing-internacional-west");
const hrSouth = (planInterior?.partitions ?? []).find((partition) => partition?.id === "jefe-rrhh-south");
const hrNorthDoor = northOpenings.get("door-jefe-rrhh-north");
const hrDivider = (planInterior?.partitions ?? []).find((partition) => partition?.id === "marketing-jefe-rrhh-divider");
const marketingBounds = polygonBounds(planRoom("gerente-marketing-internacional")?.polygon_m);
const hrBounds = polygonBounds(planRoom("jefe-recursos-humanos")?.polygon_m);
const t3aEstimates = t3a?.trace_estimates_approximate_m;
const restroomBounds = polygonBounds(planRoom("sh-gerencia")?.polygon_m);
const operationsTechnical = (planInterior?.partitions ?? []).find((partition) => partition?.id === "west-technical-north");
const operationsBounds = polygonBounds(planRoom("gerente-operaciones-proyectos")?.polygon_m);
const technicalBounds = polygonBounds(planRoom("gerente-tecnico")?.polygon_m);
const restroomSouth = (planInterior?.partitions ?? []).find((partition) => partition?.id === "west-restroom-south");
const restroomStep = (planInterior?.partitions ?? []).find((partition) => partition?.id === "west-restroom-south-step");
const restroomSouthEast = (planInterior?.partitions ?? []).find((partition) => partition?.id === "west-restroom-south-east");
const restroomEast = (planInterior?.partitions ?? []).find((partition) => partition?.id === "west-restroom-east");
const restroomStepEstimate = t3aEstimates?.sh_gerencia_south_step;
const restroomStepVertices = [[0.15, 17.65], [1.45, 17.65], [1.45, 17.35], [3.65, 17.35]];
check(samePair(restroomBounds?.min_m, t3aEstimates?.sh_gerencia_bounds?.min_m)
  && samePair(restroomBounds?.max_m, t3aEstimates?.sh_gerencia_bounds?.max_m)
  && samePair(restroomBounds?.min_m, [0.15, 17.35]) && samePair(restroomBounds?.max_m, [3.65, 18.9])
  && restroomStepEstimate?.status === "approximate"
  && JSON.stringify(restroomStepEstimate?.vertices_m) === JSON.stringify(restroomStepVertices)
  && JSON.stringify(restroomSouth?.start_m) === JSON.stringify(restroomStepVertices[0])
  && JSON.stringify(restroomSouth?.end_m) === JSON.stringify(restroomStepVertices[1])
  && JSON.stringify(restroomStep?.start_m) === JSON.stringify(restroomStepVertices[1])
  && JSON.stringify(restroomStep?.end_m) === JSON.stringify(restroomStepVertices[2])
  && JSON.stringify(restroomSouthEast?.start_m) === JSON.stringify(restroomStepVertices[2])
  && JSON.stringify(restroomSouthEast?.end_m) === JSON.stringify(restroomStepVertices[3])
  && restroomEast?.start_m?.[0] === 3.65 && restroomEast?.start_m?.[1] === 17.35
  && t3a?.non_wall_annotations?.some((annotation) => annotation.includes("PROY. VIGA/FALSO CIELO") && annotation.includes("not wall")),
"T3A S.H. Gerencia must register the approximate solid 0.30 m south-wall step and distinguish the dashed ceiling/beam annotation");
check(t3a?.non_wall_annotations?.some((annotation) => {
  const note = typeof annotation === "string" ? annotation.toLowerCase() : "";
  return note.includes("west-excellence-north") && note.includes("dashed continuation") && note.includes("not wall");
}), "T3A west-excellence-north dashed continuation must be explicitly classified as not wall");
check(matchesDimension(operationsTechnical?.start_m?.[1], t3aEstimates?.operations_technical_divider_y_m)
  && matchesDimension(operationsTechnical?.end_m?.[1], t3aEstimates?.operations_technical_divider_y_m)
  && matchesDimension(operationsTechnical?.start_m?.[1], 8.1)
  && matchesDimension(operationsBounds?.min_m?.[1], 8.1)
  && matchesDimension(technicalBounds?.max_m?.[1], 8.1),
"T3A Operations/Technical divider near y=8.1 must match its approximate register and abutting rooms");
check(samePair(marketingBounds?.min_m, estimates?.gerente_marketing_internacional_bounds?.min_m)
  && samePair(marketingBounds?.max_m, estimates?.gerente_marketing_internacional_bounds?.max_m)
  && matchesDimension(marketingBounds?.max_m?.[0], 7.7)
  && marketingWest?.start_m?.[0] === 4.8 && marketingWest?.end_m?.[0] === 4.8
  && samePair([marketingWest?.start_m?.[1] + marketingDoor?.from_m, marketingWest?.start_m?.[1] + marketingDoor?.to_m], estimates?.marketing_west_door_y_m)
  && samePair(estimates?.marketing_west_door_y_m, [14.3, 15.2])
  && matchesDimension(marketingDoor?.to_m - marketingDoor?.from_m, estimates?.door_widths_m?.marketing_internacional_west)
  && marketingDoor?.kind === "door" && marketingSouth?.openings?.length === 0
  && !northOpenings.has("opening-pasadizo-west"),
"T3A Marketing International must have one registered west-wall door and no south or duplicate north-wall gap");
check(samePair(hrBounds?.min_m, estimates?.jefe_rrhh_bounds?.min_m)
  && samePair(hrBounds?.max_m, estimates?.jefe_rrhh_bounds?.max_m)
  && matchesDimension(hrBounds?.min_m?.[0], 7.7)
  && hrDivider?.start_m?.[0] === 7.7 && hrDivider?.end_m?.[0] === 7.7
  && samePair([northEdge?.start_m?.[0] + hrNorthDoor?.from_m, northEdge?.start_m?.[0] + hrNorthDoor?.to_m], estimates?.jefe_rrhh_north_door_x_m)
  && samePair(estimates?.jefe_rrhh_north_door_x_m, [7.8, 8.7])
  && matchesDimension(hrNorthDoor?.to_m - hrNorthDoor?.from_m, estimates?.door_widths_m?.jefe_rrhh_north)
  && hrNorthDoor?.kind === "door" && hrSouth?.openings?.length === 0
  && !northOpenings.has("opening-pasadizo-center"),
"T3A JEFE DE RR.HH. must have one registered north-wall door, divider near x=7.7, and no south or duplicate gap");
const meetingNorthWall = (planInterior?.partitions ?? []).find((partition) => partition?.id === "meeting-room-north-extension");
const meetingNorthDoor = meetingNorthWall?.openings?.find((opening) => opening?.name === "door-zona-reuniones-north-pasadizo");
const meetingDoorX = [
  meetingNorthWall?.start_m?.[0] + meetingNorthDoor?.from_m,
  meetingNorthWall?.start_m?.[0] + meetingNorthDoor?.to_m,
];
check(matchesDimension(northOpenings.get("door-oficina-north-pasadizo")?.to_m - northOpenings.get("door-oficina-north-pasadizo")?.from_m, estimates?.door_widths_m?.office_north_pasadizo)
  && matchesDimension(meetingNorthDoor?.to_m - meetingNorthDoor?.from_m, estimates?.door_widths_m?.meeting_north_pasadizo)
  && samePair(meetingDoorX, estimates?.meeting_north_door_x_m)
  && JSON.stringify(estimates?.meeting_north_door_x_m) === JSON.stringify([16.8, 17.8])
  && meetingNorthWall?.start_m?.[0] === 16.1 && meetingNorthWall?.end_m?.[0] === 18.0
  && meetingNorthDoor?.kind === "door" && meetingNorthDoor?.from_m === 0.7 && meetingNorthDoor?.to_m === 1.699
  && meetingNorthWall?.start_m?.[1] === 17.05 && meetingNorthWall?.end_m?.[1] === 17.05
  && !northOpenings.has("door-zona-reuniones-north-pasadizo"),
"T3R-MRE must extend the north wall while preserving the exact north-door offsets, approximate position, and registered width");

const visual = register.visual_evidence_approximate;
check(visual?.north_ledge_beyond_grid_7_m === 0.6, "approximate north ledge must extend 0.60 m beyond grid 7");
check(JSON.stringify(visual?.north_ledge_x_m) === JSON.stringify([4.6, 16.3]), "north ledge must span approximately near B to just east of D");
const westOffset = visual?.west_offset_from_A;
check(westOffset?.approximate_distance_m === 0.5 && westOffset?.direction === "west" && JSON.stringify(westOffset?.grids) === JSON.stringify(["5", "3"]), "approximate west offset must be 0.50 m west of A across grids 5–3");
check(JSON.stringify(visual?.west_offset_x_m) === JSON.stringify([-0.5, 0]) && JSON.stringify(visual?.west_offset_y_m) === JSON.stringify([5.65, 17.01]), "west offset coordinates must match the traced grid 5–3 span");
check(visual?.east_step_y_m >= 11.0 && visual?.east_step_y_m <= 11.14, "east step must be traced near y=11.0–11.14 m");
check(visual?.chamfer_lower_endpoint_y_m >= 19.8 && visual?.chamfer_lower_endpoint_y_m <= 20.0, "chamfer lower endpoint must be traced near y=19.9 m");
check(JSON.stringify(visual?.south_opening_x_m) === JSON.stringify([6.7, 8.6]), "approximate south opening must span x=6.7–8.6 m");
check(visual?.south_opening_alignment === "appears aligned", "south opening alignment must remain approximate");
check(JSON.stringify(visual?.coordinates_scale_traced) === JSON.stringify(["west", "north", "east", "chamfer"]), "west, north, east, and chamfer coordinates must be recorded as approximate traced geometry");

const constraints = register.constraints;
check(constraints?.minimum_ceiling_clearance_m === 2.4, "minimum ceiling clearance must be 2.40 m");
check(constraints?.fixed_desk_height_m === 0.75, "fixed desk height must be 0.75 m");

const conflict = register.excluded_conflict;
check(conflict?.segments_m?.["C-D"] === 5.42 && conflict?.segments_m?.["D-E"] === 3.85, "excluded lower chain must record C-D=5.42 m and D-E=3.85 m");
check(conflict?.disposition === "excluded", "lower chain conflict must be marked excluded");
check(conflict?.use_as_geometry === false, "lower chain conflict must not be used as geometry");
check(typeof conflict?.reason === "string" && conflict.reason.trim().length > 0, "lower chain conflict must include a reason");
check(typeof conflict?.authority === "string" && conflict.authority.trim().length > 0, "lower chain conflict must cite user authority");

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}

console.log("PASS: floor 4 measurement register validated.");
