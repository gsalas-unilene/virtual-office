# Office demo

## Intent and scope
Create a low-fidelity desktop Three.js walkthrough based on plano_oficina.pdf using actual Blender MCP modeling/export. Preserve the PDF, unrelated files and Blender Camera/Light. Engram provides recovery; Gentle AI coordinates one writer and independent verification.

## Decisions and evidence
- User confirmed 22.85 × 22.25 metres and authorized temporary PyMuPDF rendering. Preview: /tmp/virtual-office-plan.png.
- Trace major areas approximately: central pool, perimeter offices, corridors, stairs/elevator cores. Not surveyed construction data; wall heights 3.0–3.2 m and box furniture/core shapes are demo assumptions.
- Desktop WASD/mouse, Escape unlock, reset and overview. No mobile, multiplayer, avatars, backend or photorealism.
- Canonical src/office-plan.json drives Blender geometry and browser collisions. Coordinate mapping: Blender (east, -north, up) exports as Three (east, up, north).
- No original app/test runner; strict TDD not activated. Ordinary build and dependency-free functional checks, no TDD evidence claimed.
- Pi is MCP client; Windows Blender accessed via \\wsl.localhost\FedoraLinux-44\home\gsalas\projects\virtual-office.

## Tasks and routes
- [x] T1: Implement canonical plan, non-destructive Blender exporter and minimal walkthrough. Delegated writer because multiple non-trivial files; foreground self-checks passed.
- [x] T2: Generate/export through Blender MCP and inspect asset/scene. Original OfficeDemo: 111 boxes/7 objects, 77,968-byte GLB; after authorized correction, 113 boxes/7 objects, 79,496-byte GLB. Scene readback confirms Camera/Light preserved. Blender scene not saved as .blend; GLB saved to disk.
- [ ] T3: Corrected routes and verified browser runtime, but work-unit commit is pending explicit user authorization. New route check samples 9 passages and 0.1m connectivity; independent 0.05m scan found one component. Browser loaded GLB, drew WebGL, moved with W, showed overview, reset and unavailable-asset state. Escape release could not be verified in headless browser.

## Checks and acceptance
- Major spaces approximately match the plan; documented approximations, no survey accuracy claim.
- Blender GLB loads through GLTFLoader; useful load-error UI. Walkthrough collision, spawn, door gaps, floor bounds, reset/overview and resize support.
- Shared material-batched box geometry, no shadows, pixel ratio capped at 1.5. Do not equate small asset with measured FPS.
- npm --cache .cache/npm install: passed, 15 packages added, 0 vulnerabilities. Warning: esbuild install scripts not covered by allowScripts; build nonetheless passed.
- npm --cache .cache/npm run build: passed after corrected export, 589.54 kB JS chunk warning (149.24 kB gzip). Production GLB identical to public GLB.
- npm --cache .cache/npm run check: passed after correction, 113 boxes, 9 doorway crossings, one 0.1m walkable component. Independent .05m scan also passed: one component, 203,365 sample centers at radius 0.28m.
- python3 -m py_compile scripts/build_office.py: passed.
- Generated outputs node_modules/, dist/, .cache/npm/, scripts/__pycache__/ and .codegraph/ ignored; preserve original .atl/ ignore.
- Pre-review native risk assessment was unavailable due to untracked files/no initial commit, so an independent verifier ran. Subsequent scoped native review was approved and acknowledged (details below).
- Original GLB had three separated walkable components; route geometry corrected. Explicit user-approved replacement via Blender MCP main(replace=True) succeeded after fixing Blender bpy_prop_collection ownership API checks (blocked attempts left old model intact). Final OfficeDemo has 7 objects from 113 boxes; Camera and Light preserved in scene readback. Final public/models/office.glb 79,496 bytes, 7 primitives, 1,359 triangles, upward floor normals, geometry within 0.0001m of canonical plan; dist GLB byte-identical, SHA-256 1b32dd525280158a276e462cc2986ad7dbf3cbae315d3889de63877566021b3a.
- User authorized temporary Playwright/Chromium under .cache only. Independent browser test: GLB HTTP 200, UI Office model loaded, visible WebGL2 render, W forward, overview, resize, reset (initial screenshot matched), missing-GLB error state; no console/page/request errors in normal flow. Screenshots: .cache/office-{walk-start,overview,walk-forward,after-reset}.png. Headless Escape did not release pointer lock; manually triggered exitPointerLock to continue; desktop Escape remains unverified. No FPS measurement. Temporary Vite server stopped.
- Native review selected only 13 feature-related untracked paths (excluded PDF and unrelated historical task), lineage review-51011e6024aac1d5, medium tier, reliability lens. Review approved; exact acknowledgement burned authority for target sha256:7bcfc262c24b474c2cdb2d1d4f920197dd3888d145c377010838b3a108145786. One non-blocking informational warning R3-001 at scripts/build_office.py:354 is deferred; no correction offered. Review does not authorize a commit/PR.

## Delivery and rollback
Initial forecast 350–400 authored lines; first worker count 823 excluding generated lockfile and .gitignore; correction adds more. Do not code-golf. Delivery strategy ask-on-risk; no commit/PR/push requested or created. Work-unit commit is pending explicit user request under session safety; do not include pre-existing PDF or unrelated task. Repository has no HEAD; pre-review native risk assessment was unassessable. Selected feature-only untracked scope for ordinary review and acknowledged approved result; post-review task-document update is administrative, not part of frozen target.
Rollback boundary: only new app files, canonical data, exporter and OfficeDemo collection/asset; preserve PDF, historical task, Camera/Light and unrelated data. Exporter refuses existing collection/GLB; no blind rerun or deletion.

## Next step
Functionally ready as a low-fidelity browser demo with headless Escape and FPS unverified. Run npm run dev, click canvas, WASD/mouse, Esc (manual check), Overview/Reset. No commit or PR created; obtain explicit user decision before work-unit delivery. Blender scene changes are live but not saved as .blend; exported GLB is on disk.
