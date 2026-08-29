export const TERRITORY_SIEGE_FIELD_HALF_X = 82;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 116;

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

  const edgeFade = smoothstep(0, 9, edgeDistance);
  const assaultRoadFade = z > 14 ? smoothstep(8, 18, Math.abs(x)) : 1;
  const castleX = 1 - smoothstep(42, 50, Math.abs(x));
  const castleZ = smoothstep(-79, -71, z) * (1 - smoothstep(17, 25, z));
  const castleFade = 1 - castleX * castleZ;
  const mask = edgeFade * assaultRoadFade * castleFade;

  const broad = Math.sin(x * 0.071 + z * 0.029) * 0.26;
  const cross = Math.sin(z * 0.097 - x * 0.041 + 1.7) * 0.18;
  const detail = Math.sin((x + z) * 0.053 - 0.8) * 0.1;
  return Math.max(-0.28, Math.min(0.62, (0.1 + broad + cross + detail) * mask));
}
