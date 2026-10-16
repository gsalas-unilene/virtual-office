import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildObstacles, isBlocked, SPAWN } from "../src/floor4-collision.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const walls = JSON.parse(readFileSync(resolve(root, "src/floor4-walls.json"), "utf8"));
const obstacles = buildObstacles(walls);
const radius = 0.25;
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const centre = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];

check(!isBlocked(obstacles, walls.floor_m, SPAWN.u, SPAWN.v, radius), "spawn in the pool must be free");
check(isBlocked(obstacles, walls.floor_m, -2, 5, radius), "points outside the floor must be blocked");
const column = walls.solids.find((s) => s.kind === "concrete" && Math.abs(centre(s.polygon_m)[0] - 10.3) < 0.8 && Math.abs(centre(s.polygon_m)[1] - 5.6) < 0.4);
check(column && isBlocked(obstacles, walls.floor_m, ...centre(column.polygon_m), radius), "concrete columns must block");
check(isBlocked(obstacles, walls.floor_m, 15.0, 2.73, radius), "the Oficina de TI mampara must block");
check(isBlocked(obstacles, walls.floor_m, 7.5, 5.87, radius), "the Contabilidad mampara must block");
check(isBlocked(obstacles, walls.floor_m, -0.47, 8.5, radius), "facade windows must block");
check(!isBlocked(obstacles, walls.floor_m, 13.0, 1.45, radius), "the open Jefe de TI sliding doorway (P06) must be passable");

// Breadth-first reachability on a 0.1 m grid from the spawn.
const step = 0.1;
const key = (i, j) => `${i},${j}`;
const seen = new Set([key(0, 0)]);
const queue = [[0, 0]];
while (queue.length) {
  const [i, j] = queue.shift();
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di; const nj = j + dj;
    if (seen.has(key(ni, nj))) continue;
    if (isBlocked(obstacles, walls.floor_m, SPAWN.u + ni * step, SPAWN.v + nj * step, radius)) continue;
    seen.add(key(ni, nj));
    queue.push([ni, nj]);
  }
}
const reachable = (u, v) => [...seen].some((k) => {
  const [i, j] = k.split(",").map(Number);
  return Math.hypot(SPAWN.u + i * step - u, SPAWN.v + j * step - v) <= 0.15;
});
const rooms = {
  "Gerente Tecnico (east)": [19.8, 3.4], "Jefe de TI": [11.8, 1.4], "Oficina de TI": [15.5, 1.2], "Jefe de Tesoreria": [1.3, 1.4],
  "Gerencia de Administracion": [1.8, 4.2], "Gerente de Marketing": [6.2, 15.6], "Director Ejecutivo": [6.5, 20.5],
  "Zona de Reuniones": [15.0, 15.0], "Archivo General": [21.2, 21.3], "Jefe de Ventas": [19.8, 7.9],
};
for (const [name, [u, v]] of Object.entries(rooms)) check(reachable(u, v), `${name} must be reachable on foot from the pool`);

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log(`PASS: floor 4 walkthrough collisions validated (${obstacles.length} obstacles, ${seen.size} reachable 0.1 m cells, ${Object.keys(rooms).length} rooms reachable).`);
