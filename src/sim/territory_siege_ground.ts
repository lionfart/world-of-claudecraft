export const TERRITORY_SIEGE_FIELD_HALF_X = 160;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 220;
/** Extra rendered terrain behind the impassable mountain ring hides the arena seam. */
export const TERRITORY_SIEGE_VISUAL_MARGIN = 64;
export const TERRITORY_SIEGE_STONE_LANE_HEIGHT = 0.072;

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Shared, deliberately gentle siege heightfield. The assault road and castle
 * courtyard stay level for objective readability while the outer flanks roll
 * enough to catch light and stop reading as a flat debug plane.
 */
export function territorySiegeTerrainLiftLocal(x: number, z: number): number {
  const edgeDistance = Math.min(
    TERRITORY_SIEGE_FIELD_HALF_X - Math.abs(x),
    TERRITORY_SIEGE_FIELD_HALF_Z - Math.abs(z),
  );
  if (edgeDistance <= -TERRITORY_SIEGE_VISUAL_MARGIN) return 0;

  const edgeFade = smoothstep(0, 12, edgeDistance);
  const assaultRoadFade = z > 14 ? smoothstep(8, 20, Math.abs(x)) : 1;
  const castleX = 1 - smoothstep(42, 50, Math.abs(x));
  const castleZ = smoothstep(-79, -71, z) * (1 - smoothstep(17, 25, z));
  const castleFade = 1 - castleX * castleZ;
  const mask = edgeFade * assaultRoadFade * castleFade;

  const broad = Math.sin(x * 0.046 + z * 0.021) * 0.48;
  const cross = Math.sin(z * 0.071 - x * 0.033 + 1.7) * 0.31;
  const ridge = Math.sin((x + z) * 0.039 - 0.8) * 0.2;
  const detail = Math.sin(x * 0.13 - z * 0.11 + 2.4) * 0.08;
  const gentle = Math.max(-0.48, Math.min(1.18, (0.24 + broad + cross + ridge + detail) * mask));
  const ridgeInside = 1 - smoothstep(10, 38, edgeDistance);
  const ridgeOutside = 1 - smoothstep(0, TERRITORY_SIEGE_VISUAL_MARGIN, -edgeDistance);
  const boundaryMask = edgeDistance >= 0 ? ridgeInside : ridgeOutside;
  // One continuous heightfield ridge replaces the old row of enlarged rock
  // props. Broad frequencies shape long shoulders while the rectified crest
  // term varies the skyline without breaking it into repeated round lumps.
  const longShoulder = Math.sin(x * 0.021 + z * 0.013 + 0.4) * 3.6;
  const crossShoulder = Math.sin(z * 0.034 - x * 0.018 + 1.7) * 2.7;
  const crest = Math.max(0, Math.sin(x * 0.061 + z * 0.047 - 0.9)) * 4.8;
  const mountainNoise = 19.5 + longShoulder + crossShoulder + crest;
  return gentle + Math.max(0, mountainNoise * boundaryMask);
}

/**
 * The castle's stone modules are deliberately flattened to a seven-centimetre
 * profile. This matching walk surface keeps feet on the paving instead of
 * letting characters sink through its decorative mesh.
 */
export function territorySiegeStoneLaneLiftLocal(x: number, z: number): number {
  const vertical = z >= -69 && z <= 17 ? 1 - smoothstep(3.55, 4.05, Math.abs(x)) : 0;
  const horizontal = x >= -38 && x <= 38 ? 1 - smoothstep(3.55, 4.05, Math.abs(z + 24)) : 0;
  return Math.max(vertical, horizontal) * TERRITORY_SIEGE_STONE_LANE_HEIGHT;
}

/** Authoritative player surface, including the low castle paving. */
export function territorySiegeGroundLiftLocal(x: number, z: number): number {
  return Math.max(territorySiegeTerrainLiftLocal(x, z), territorySiegeStoneLaneLiftLocal(x, z));
}
