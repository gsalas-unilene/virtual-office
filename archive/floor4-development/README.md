# Fourth-floor reconstruction archive

This archive records the measured-model work and its pre-archive closeout. Read this index first; [`floor4-model-ledger.md`](floor4-model-ledger.md) is a verbatim historical snapshot of the task ledger, while this README reconciles later outcomes and stale status notes. This is an evidence archive, not a claim that the model is complete or integrated.

## Coordinate and dimension decisions

| Item | Recorded decision |
|---|---|
| Local frame | Grid A / row 2 is `(u,v)=(0,0)`. `u` increases A→F; `v` increases row 2→7. North is user-defined as F→A (`−u`), the building's right side. Do not label the axes east/north. |
| Grid spans | A–F is 22.85 m; row 2–7 is 22.25 m. These are grid-to-grid spans, not exterior bounds. |
| Horizontal chain | A–B 5.15, B–C 5.18, C–D 5.62, D–E 3.64, E–F 3.26 m. The conflicting lower C–D 5.42 / D–E 3.85 m chain is excluded as a source discrepancy. |
| Vertical chain | The ledger records `1.75, 1.71, 1.78, 5.87, 5.49, 5.65 m` (sum 22.25 m), labeled 7→2. That is six values for five numbered grid intervals; preserve the source record but resolve its interval mapping before treating it as unambiguous. |
| Shell trace | Approximate outside bounds are ~23.35 × 22.85 m. The shell extends to `u≈−0.50 m` only between rows 5–3; the north ledge reaches `v≈22.85 m`, about 0.6 m beyond grid 7. Trace-derived bounds remain distinct from the grid spans. |
| Heights | Full-height walls default to 2.40 m; preserve explicitly annotated partial walls. Fixed desks are 0.75 m high and separate from walls. Ceiling slab is omitted/disabled in the web GLB. |

Dimensions absent from the PDF are approximate, non-constructive traces—not survey measurements.

## Progress and current disposition

| Work | Outcome / evidence state |
|---|---|
| T1 — grid and measurements | Complete. Corrected the grid-span/envelope distinction and retained the conflicting chain as excluded evidence. Corrected-schema RED/GREEN and `node scripts/check-floor4-measurements.mjs` passed at the time. |
| T2 — shell | Complete. Approximate full outline recorded: west offset ~0.5 m between rows 5–3, east step near `v≈11.0–11.14 m`, chamfer lower endpoint near `v≈19.9 m`, and south opening at local `u≈6.7–8.6 m`; the north ledge is ~0.6 m beyond grid 7. The accepted shell-only checkpoint was created without replacing the legacy app asset. Historical checks and artifact evidence are below. |
| T3A — west/north | Complete as an approximate stage: Marketing west-wall door `v≈14.30–15.20 m`; HR north-wall door `u≈7.80–8.70 m` beside divider `u≈7.7 m`; Operations/Technical divider near `v≈8.1 m`; stepped Gerencia south wall near `v≈17.35–17.65 m`. Dashed ceiling/beam marks were not treated as walls. The original `02-west-north` pair was retained as superseded/provisional, not overwritten. |
| T3B — central | Complete as an approximate stage: open pool, meeting room (`u≈12.55–17.8 m`), adjacent office (`u≈10.6–12.55 m`), north-edge offices, and circulation; NE door near `u≈16.8–17.8 m`. The recorded `03-central` scene had 31 shell + 39 partition boxes (70 total); unlabelled geometry remained approximate. |
| T3C — east core | **Provisional; not accepted for integration.** The recorded `04-east-core` cumulative checkpoint has 31 shell + 67 interior boxes (98 total), 18 rooms and 51 partitions before later T3R edits. Approximate traces: archive `u≈19.8–22.65/v≈20.6–22.1 m`; waiting hall `u≈16.15–19.5/v≈17.2–22.1 m`; elevators `u≈19.85–22.65/v≈17.25–20.35 m`; stair `u≈19.42–22.56/v≈12.45–17.0 m`; duct `u≈19.42–21.29/v≈11.14–12.30 m`. The west-side passage stops at the T3D seam near `v≈11.1 m`. The selected shared-shell layout uses a 0.15 m duct/shaft wall-face gap and the shell step for the shaft south boundary. |
| T3R — wall audit | In progress. Audited sections and the low-wall closeout are listed below. The latest ledger evidence after the elevator and south-wall edits records 18 rooms, 50 partitions, 97 boxes, and 16 openings; this is source/checker evidence, not a validated Blender export. |
| T3D / T4 / T5 | Not done. South-office walls/openings/circulation; then separate measured furniture (0.75 m desks and chairs); then orthographic/dimension/export/Three.js verification and only then app integration remain. |

### T3R audited sections

- **North ledge (T3R-N):** approved V04/V05 spans are `u≈10.8–15.9 m` and `u≈4.8–10.6 m`; the residual ~0.2 m solid return joins the existing west return. V06 is a short solid connection to the murete, not a separate window interval. Other V spans were accepted; no stair-access P/door was added. Approximate provenance was retained.
- **West excellence north (T3R-W5):** replaced the unsupported continuous wall with the short solid return at `u≈−0.35…0.0 m`, `v≈16.9 m`; no dashed continuation was modeled.
- **Duct west (T3R-DM-W):** raster overlay confirmed the existing `u≈19.42 m`, `v≈11.14–12.30 m` solid wall. Kept unchanged; the dashed projected-ceiling mark is separate.
- **Pool / row 4 (T3R-POOL-C):** the solid-outlined rectangle is columns, not a wall. Kept out of partitions; structural columns are deferred.
- **Central-office-west tail (T3R-CW-W):** the existing segment at `u≈10.6 m`, `v≈13.35–14.25 m` aligns with a solid wall; kept unchanged.
- **Elevator core exterior (T3R-ELEV-EXT):** removed only the interior divider; retained all four exterior walls and all door records. Resulting counts were 50 partitions / 97 boxes / 16 doors. This work unit is commit `5ad076c4dabc62cec33eeb917c5acbeccfafe6ae`; its selected native review was approved and acknowledged.
- **Central-office-south (T3R-CW-S):** replaced the overextended full-height segment with only the approximate right-hand low partition at `u≈11.45–12.55 m`, `v≈13.35 m`, `h=1.60 m`, no openings. The left extension was not supported by a clear heavy wall line; dashed `PROY. VIGA` is not a wall. Counts remained 50 partitions / 18 rooms / 97 boxes / 16 openings. The specific closeout and its abandoned review lineage are reconciled under **Archive closeout** below.
- **Advisory:** `R3-cardinal-axis-labels` at `src/floor4-plan.json:9` remains a nonblocking follow-up from prior native review; keep local `u/v` labels and do not invent cardinal directions.

Doors remain deferred during T3R; columns are a separate future pass. Auditing a subsection does not validate the whole floor or a checkpoint export.

## Historical validation evidence and limits

Evidence below is copied from the stage record; **no tests, export, final validation, or app integration were run for this archive**.

- **T1/T2:** corrected measurement schema RED/GREEN and measurement checker passed. The plan checker covered 31 wall segments / 16 openings and safety cases; measurement checker, checker syntax, builder Python compilation, and the legacy `npm run check` also passed at T2. That legacy check described the old demo (`113 boxes, 9 crossings, one walkable component`), not final floor-four integration. Connected Windows Blender 5.2 generated `01-shell`; direct Blender readback and independent GLB chunk parsing passed. CLI Blender was unavailable. Initial raw `.blend` header assertions failed because the file uses Zstandard compression; decompression confirmed the valid header. The legacy GLB hash stayed `1b32dd525280158a276e462cc2986ad7dbf3cbae315d3889de63877566021b3a`.
- **T3A/T3B:** test-first plan/placement/connectivity checks, independent source checks, and visual review were recorded as passing. Connected Blender/readback and independent GLB parsing were recorded for `03-central`; the 01/02 hashes and public GLB remained unchanged.
- **T3C:** RED/GREEN/negative plan and measurement checks, independent source review, raster comparison, connected Blender readback, and GLB parsing were recorded as passing for `04-east-core`. Background Blender CLI readback was unavailable; connected Blender reopened the saved file. One extra topology assertion based on contiguous per-box vertex order failed; corrected structural checks passed. Native review was declined for this candidate; no lineage/acknowledgement or app integration resulted. Checkpoint remains provisional.
- **T3R:** north and west edits passed the focused plan/measurement checks and recorded visual/native review; elevator removal passed the same focused checks and had an approved/acknowledged native review. The south low-wall plan/measurement checks and `git diff --check` passed before closeout. These checks do not establish an exported or final model: no post-T3R Blender/GLB checkpoint, final orthographic validation, Three.js load, or app integration is recorded.
- Initial T2/T3B/T3C native ASSESS outcomes were `unassessable`/high because relevant repository files were untracked. Independent source/artifact checks were used as recorded; this is not a substitute claim of native approval.

## Checkpoints and protected assets

All checkpoint pairs are historical artifacts under `assets/office-floor4/checkpoints/`; do not overwrite them. They predate later T3R source edits and must not be treated as exports of the latest audited source.

| Pair | Recorded role and status |
|---|---|
| `01-shell.blend` + `.glb` | T2 shell-only checkpoint; preserved. |
| `02-west-north.blend` + `.glb` | T3A-era pair explicitly preserved as superseded/provisional. |
| `03-central.blend` + `.glb` | T3B cumulative checkpoint; preserved, historical/provisional pending full wall audit. |
| `04-east-core.blend` + `.glb` | Latest recorded cumulative checkpoint; preserved but provisional pending wall audit. The recorded scene had 04 visible and 01–03 hidden. |

The approximate replacement remains separate from the protected legacy demo: `src/office-plan.json` and `public/models/office.glb` were preserved unchanged; the public GLB's recorded SHA-256 is `1b32dd525280158a276e462cc2986ad7dbf3cbae315d3889de63877566021b3a`. Other key inputs and implementation files are `plano_oficina.pdf`, `src/floor4-plan.json`, `src/floor4-measurements.json`, `scripts/check-floor4-plan.mjs`, `scripts/check-floor4-measurements.mjs`, `scripts/build_office.py`, and `odd/tasks/floor4-model.md`.

## Archive closeout and repository state

The historical task ledger says the central-office-south native review was pending. Later closeout reconciles that stale statement as follows:

- The low-wall change is commit **`2fee70ecf89d7febc6f946cde07e647fc03cb2ef`** (`fix(floor4): model central office low wall`).
- Lineage `review-4021fc9f889364d8` was abandoned through the supported native facade with reason `operator_disposition`; quarantine path: `.git/gentle-ai/review-transactions/quarantine/review-4021fc9f889364d8-1423523349`. This is not an approval or acknowledgement. Clone-local RDD is off.
- Before this archive, all local branch tips were `2fee70e`: `main`, `feature/floor4-restart`, and `feature/floor4-north-openings`. No remote is configured.
- Commit chain, oldest to newest: `b6e0ff7945373836cdf04a439fc8c8ba8682247a` (focused pre-elevator baseline); `5ad076c4dabc62cec33eeb917c5acbeccfafe6ae` (elevator exterior only); `2e0bb71a68c9012da02dbb86708477620d766731` (elevator review closure); `902ba3d79586637d49f7233ad3774112ccba4146` (next wall-audit target); `2fee70ecf89d7febc6f946cde07e647fc03cb2ef` (central-office-south low wall). The baseline was focused, not a full repository history.
- At pre-archive inspection, unrelated app, asset/checkpoint, PDF, and task paths appeared untracked. This archive work unit includes only its two documentation files and the ODD task record; all other untracked files remain in place and are not included in the `main` commit. Branch deletion will not remove them, but they remain unversioned; do not run `git clean`.

The user requested archival and branch cleanup, not further model development. Any future work must be explicitly reopened. If resumed, continue T3R, then complete T3D, T4, and T5; keep the existing demo and checkpoints protected until the replacement passes the full acceptance checks.
