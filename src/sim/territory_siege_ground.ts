export const TERRITORY_SIEGE_FIELD_HALF_X = 96;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 136;

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
export function territorySiegeGroundLiftLocal(x: number, z: number): number {
  const edgeDistance = Math.min(
    TERRITORY_SIEGE_FIELD_HALF_X - Math.abs(x),
    TERRITORY_SIEGE_FIELD_HALF_Z - Math.abs(z),
  );
  if (edgeDistance <= 0) return 0;

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
  return Math.max(-0.48, Math.min(1.18, (0.24 + broad + cross + ridge + detail) * mask));
}
