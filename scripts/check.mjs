import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBlocked } from '../src/navigation.js';

const plan = JSON.parse(readFileSync(new URL('../src/office-plan.json', import.meta.url), 'utf8'));
const names = new Set();

assert.equal(plan.units, 'metres');
assert.equal(plan.width, 22.85);
assert.equal(plan.depth, 22.25);
assert.ok(plan.floorOutline.length >= 4);
for (const [x, north] of plan.floorOutline) {
  assert.ok(x >= 0 && x <= plan.width && north >= 0 && north <= plan.depth, 'floor point is in bounds');
}
for (const box of plan.boxes) {
  assert.ok(box.name && !names.has(box.name), `unique box name: ${box.name}`);
  names.add(box.name);
  assert.ok(box.collidable === true || box.collidable === false, `${box.name} has a collision flag`);
  assert.ok(box.size.every((size) => Number.isFinite(size) && size > 0), `${box.name} has positive dimensions`);
  assert.ok(Number.isFinite(box.height) && box.height > 0, `${box.name} has a positive height`);
  const angle = box.angle ?? 0;
  const [width, depth] = box.size;
  const extentX = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth) / 2;
  const extentZ = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) / 2;
  assert.ok(box.center[0] - extentX >= -0.1 && box.center[0] + extentX <= plan.width + 0.1, `${box.name} fits width bounds`);
  assert.ok(box.center[1] - extentZ >= -0.1 && box.center[1] + extentZ <= plan.depth + 0.1, `${box.name} fits depth bounds`);
}

assert.equal(isBlocked(plan, plan.spawn.x, plan.spawn.z), false, 'spawn is clear');
for (const point of [[-0.1, 4], [plan.width + 0.1, 4], [0.2, 20]]) {
  assert.equal(isBlocked(plan, ...point), true, `outside point ${point} is blocked`);
}
for (const [x, z] of [plan.doorChecks.westOffice, plan.doorChecks.poolFromHall]) {
  assert.equal(isBlocked(plan, x, z), false, `door opening ${x},${z} is clear`);
}
for (const [x, z] of [plan.doorChecks.blockedWestWall, plan.doorChecks.blockedPoolWall]) {
  assert.equal(isBlocked(plan, x, z), true, `wall ${x},${z} blocks movement`);
}
for (let x = 4.35; x <= 5.35; x += 0.1) {
  assert.equal(isBlocked(plan, x, plan.doorChecks.westOffice[1]), false, `west door passage at x=${x.toFixed(2)}`);
}

for (const passage of plan.doorPassages) {
  const [fromX, fromZ] = passage.from;
  const [toX, toZ] = passage.to;
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.ceil(distance / 0.05);
  for (const offset of passage.laneOffsets) {
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const x = fromX + (toX - fromX) * progress + (passage.laneAxis === 'x' ? offset : 0);
      const z = fromZ + (toZ - fromZ) * progress + (passage.laneAxis === 'z' ? offset : 0);
      const blockedHere = isBlocked(plan, x, z);
      const blockers = blockedHere
        ? plan.boxes.filter((box) => box.collidable && isBlocked({ ...plan, boxes: [box] }, x, z)).map((box) => box.name)
        : [];
      assert.equal(blockedHere, false, `${passage.name} crossing at ${x.toFixed(2)},${z.toFixed(2)} blocked by ${blockers.join(', ')}`);
    }
  }
}

const gridStep = 0.1;
const columns = Math.ceil(plan.width / gridStep);
const rows = Math.ceil(plan.depth / gridStep);
const cellCount = columns * rows;
const blocked = new Uint8Array(cellCount);
const visited = new Uint8Array(cellCount);
const queue = new Int32Array(cellCount);
let walkableCells = 0;
for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    const x = (column + 0.5) * gridStep;
    const z = (row + 0.5) * gridStep;
    if (isBlocked(plan, x, z)) blocked[index] = 1;
    else walkableCells += 1;
  }
}

function floodFrom(start) {
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  while (head < tail) {
    const index = queue[head++];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const neighbors = [
      column > 0 ? index - 1 : -1,
      column + 1 < columns ? index + 1 : -1,
      row > 0 ? index - columns : -1,
      row + 1 < rows ? index + columns : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || blocked[neighbor] || visited[neighbor]) continue;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }
  return tail;
}

const spawnColumn = Math.floor(plan.spawn.x / gridStep);
const spawnRow = Math.floor(plan.spawn.z / gridStep);
const spawnCell = spawnRow * columns + spawnColumn;
assert.equal(blocked[spawnCell], 0, 'nearest 0.1m grid center to spawn is clear');
let components = 1;
let largestComponent = floodFrom(spawnCell);
const componentSummaries = [{ x: plan.spawn.x, z: plan.spawn.z, cells: largestComponent }];
for (let start = 0; start < cellCount; start += 1) {
  if (blocked[start] || visited[start]) continue;
  components += 1;
  const cells = floodFrom(start);
  largestComponent = Math.max(largestComponent, cells);
  componentSummaries.push({
    x: ((start % columns) + 0.5) * gridStep,
    z: (Math.floor(start / columns) + 0.5) * gridStep,
    cells,
  });
}
assert.equal(components, 1, `0.1m collision grid has ${components} walkable components: ${JSON.stringify(componentSummaries)}`);

console.log(`Office plan/navigation checks passed: ${plan.boxes.length} named boxes, plan bounds, spawn, ${plan.doorPassages.length} sampled doorway crossings, and wall collisions.`);
console.log(`0.1m collision grid reachability passed: ${components} walkable component; ${walkableCells} clear cell centers, largest component ${largestComponent}, radius 0.28m.`);
