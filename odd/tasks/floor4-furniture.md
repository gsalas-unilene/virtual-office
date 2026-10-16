# Floor 4 furniture from the plan

Objective: model the furniture drawn in `plano_oficina.pdf` (grey linework) as static Blender geometry, export it with the floor 4 GLB, and include it in the walkthrough. Also make the frosted mamparas less transparent.
Branch: `feature/floor4-meeting-room-south`. Runner: `node scripts/check-floor4-furniture.mjs`, `node scripts/check-floor4-walk.mjs`, `node scripts/check-floor4-walls.mjs`.

## Specs
- S1 — User request (verbatim, L1): “Continuando con el modelado de blender, darle menos transparencia a las mamparas. Procoder de acuerdo al plano a implementar los mobiliarios.”
- S2 — Frosted mamparas noticeably less transparent; clear upper glass unchanged.
- S3 — Furniture placed at the PDF positions: desks/tables (0.75 m top, user decision), chairs, credenzas, archive shelving, restroom fixtures; stairs, elevator cabins, dashed projections and the modelled low drywall are not furniture.
- S5 — User 2026-10-16, verbatim: “para sillas color negro y para muebles color melamine mostaza claro”; “la mesa ovalada melamina color madera”; “claro es vista planta predomina la mesa y las sillas aparte igual solo generar 1 silla generica y replicas, las mesas si respetando el plano.”
- S4 — Furniture is exported into `public/models/floor4.glb` and blocks walking where it stands on the floor (tables, cabinets, shelving).

## Tasks
- [x] T1 (S2): Frosted material opacity (alpha 0.70 → 0.88). Route: inline.
- [x] T2 (S3): `scripts/extract_floor4_furniture.py` → `src/floor4-furniture.json` + `scripts/check-floor4-furniture.mjs`. Route: inline, test-first.
- [x] T3 (S3, S4): Builder furniture prisms, checkpoint, export, walkthrough collisions. Route: inline, test-first.

## Log
- L1 — 2026-10-16 user request: see S1.
- L2 — Inventory: grey (0.498) strokes are furniture: 5503 lines, 1248 curves, 69 quads → 328 connected components. Small curved components (0.4–0.6 m) are chairs; straight-line components are desks, credenzas and shelving; grey also draws stairs and elevator cabins (excluded zones).
- L3 — Extraction (`scripts/extract_floor4_furniture.py` → `src/floor4-furniture.json`): chairs = groups of short grey strokes (≤0.7 m) with a curve, 0.3–0.85 m across (104); tops = closed grey faces ≥0.25 m wide, not chairs or walls, nested faces dropped (113 desks, 34 cabinets near walls ≤0.5 m deep, 3 archive shelves 2.0 m, 5 restroom fixtures 0.42 m); oval/round tables = long grey curves joined with the straight sides they touch, drawn outline ≥75 %, overlapping halves merged (1 oval meeting table 3.00×1.21 m, 4 round tables). Excluded zones: both stairs and the elevator cabins.
- L4 — Per user: chairs are placements (centre + facing angle towards the nearest table) of one generic black office chair (`CHAIR_PARTS`: cross base, column, seat 0.42–0.49 m, backrest to 0.95 m, armrests). Blender links one `ChairMesh` to 104 objects; the GLB references that mesh from 104 nodes. Tables keep their plan footprints: 0.03 m top at 0.75 m with legs (rectangles) or a pedestal (curved/L tops). Materials: `melamine` light mustard (0.87, 0.74, 0.45), `wood` (0.55, 0.36, 0.20) for the oval table only, `upholstery` black, `fixture` white; frosted mamparas alpha 0.88.
- L5 — Walkthrough: non-chair furniture footprints are obstacles (296 total); chairs are not, so aisles between workstations stay passable. The spawn moved to the pool aisle (u 9.5, v 9.6) because desks now cover the former spawn; the room reachability probes were moved onto free floor beside the furniture, and all 10 rooms remain reachable. Checks: `check-floor4-furniture.mjs` (RED: builder lacked the furniture argument) and the updated `check-floor4-walk.mjs` pass; Blender checkpoint `13-furniture` is published as `public/models/floor4.glb`; Chromium overview and walk screenshots are ok. Known limits: desk blocks split by drawn modesty or screen lines produce several tops, each with its own legs; there are no monitors or accessories.
