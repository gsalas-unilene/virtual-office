# Virtual office walkthrough

A low-fidelity desktop walkthrough of `plano_oficina.pdf`. The canonical plan in `src/office-plan.json` drives both Blender geometry and browser collision checks. Dimensions are 22.85 × 22.25 metres; partitions, doors, furniture, and core blocks are approximate, not surveyed construction data.

## Run

1. `npm install`
2. `npm run dev`
3. Open the root page: a first-person walkthrough of the floor 4 model (`public/models/floor4.glb`). Click to look with the mouse, move with WASD or the arrow keys, press Esc to release the mouse. Walls, windows, mamparas and posts collide (`src/floor4-collision.js`); the 2.40 m ceiling shows while walking.
   The **Overview** button switches to orbit controls (drag to orbit, scroll to zoom, right-drag to pan). `#top` opens the overview in the PDF sheet orientation; `#focus=u,v` zooms to a plan point in metres (grid A / row 2 origin). Building north runs F→A.
4. The earlier approximate walkthrough remains at `/walkthrough.html` (WASD, mouse look, Esc releases the pointer).

`npm run build` creates both pages; `npm run check` validates the legacy walkthrough plan. The floor 4 checks are `node scripts/check-floor4-walk.mjs`, `node scripts/check-floor4-walls.mjs`, `node scripts/check-floor4-plan.mjs` and `node scripts/check-floor4-measurements.mjs`.

## Floor 4 model

`scripts/extract_floor4_walls.py` reads `plano_oficina.pdf` vectors into `src/floor4-walls.json` (concrete walls and columns, facade windows, frosted tempered-glass mamparas, black aluminium posts):

    uv run --with pymupdf --with shapely python scripts/extract_floor4_walls.py

In Blender (via MCP), `main(replace=False, plan_path=<repo>/src/floor4-plan.json, checkpoint_name="<name>", walls_path=<repo>/src/floor4-walls.json)` writes a non-overwriting `assets/office-floor4/checkpoints/<name>.blend` + `.glb`; copy the GLB to `public/models/floor4.glb` for the viewer.

## Blender MCP export

Run this Python payload in Blender through the Windows shared path. Initial creation calls `main()` and refuses to overwrite an existing collection or GLB. For an explicitly authorized regeneration, call `main(replace=True)`: preflight accepts only the exact seven exclusively linked `OfficeDemo` mesh objects, checks the plan and export paths before scene replacement, exports a temporary GLB, then atomically swaps `public/models/office.glb`. Camera, Light, and unrelated objects are preserved; an unsafe collection or failed export leaves the old asset untouched.

```python
p = r"\\wsl.localhost\FedoraLinux-44\home\gsalas\projects\virtual-office\scripts\build_office.py"
ns = {"__file__": p}
exec(compile(open(p, encoding="utf-8").read(), p, "exec"), ns)
result = ns["main"](replace=True)  # use main() only for first-time creation
result
```

Plan coordinates are east/north/up. The script maps them to Blender `(east, -north, up)`; Blender's glTF export uses `export_yup=True`, producing Three.js `(east, up, north)`. The app loads the resulting GLB with `GLTFLoader`.

## Limits

Walls are 3.0–3.2 m high; stairs and elevators are solid placeholders. Furniture uses simple boxes merged by material for export. This is a desktop-only demo: no mobile controls, avatars, multiplayer, backend, or photorealism. Browser interaction remains unverified until the Blender export is available.
