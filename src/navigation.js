function distanceToSegmentSquared(x, z, start, end) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / lengthSquared));
  const nearX = start[0] + t * dx;
  const nearZ = start[1] + t * dz;
  return (x - nearX) ** 2 + (z - nearZ) ** 2;
}

function insideFloor(plan, x, z) {
  const outline = plan.floorOutline;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isBlocked(plan, x, z, radius = 0.28) {
  const outline = plan.floorOutline;
  if (!insideFloor(plan, x, z)) return true;
  for (let i = 0; i < outline.length; i += 1) {
    if (distanceToSegmentSquared(x, z, outline[i], outline[(i + 1) % outline.length]) < radius ** 2) {
      return true;
    }
  }

  for (const box of plan.boxes) {
    if (!box.collidable) continue;
    const [centerX, centerZ] = box.center;
    const [width, depth] = box.size;
    const angle = box.angle ?? 0;
    const dx = x - centerX;
    const dz = z - centerZ;
    const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
    const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
    const nearX = Math.max(-width / 2, Math.min(width / 2, localX));
    const nearZ = Math.max(-depth / 2, Math.min(depth / 2, localZ));
    if ((localX - nearX) ** 2 + (localZ - nearZ) ** 2 < radius ** 2) return true;
  }
  return false;
}
